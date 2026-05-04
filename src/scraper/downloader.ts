import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import pLimit from "p-limit";
import { request } from "undici";
import type { IndexEntry } from "../shared/types";
import { fetchRanFromSeed } from "./discovery/ran";
import { BROWSER_HEADERS, CMF_DISPATCHER } from "./http";

const RAW_DIR = resolve("data/raw");
const INDEX_PATH = resolve("data/index.jsonl");
const CONCURRENCY = 4;
const TIMEOUT_MS = 30_000;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;

export type DownloadResult = {
  id: string;
  status: "ok" | "not-modified" | "error";
  path?: string;
  error?: string;
};

type CacheState = { etag?: string; lastModified?: string };

function rawDir(id: string): string {
  return resolve(RAW_DIR, id);
}

function pdfPath(id: string, fecha: string): string {
  return resolve(rawDir(id), `${fecha}.pdf`);
}

function cacheStatePath(id: string): string {
  return resolve(rawDir(id), "cache.json");
}

async function loadCacheState(id: string): Promise<CacheState> {
  const p = cacheStatePath(id);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(await readFile(p, "utf8")) as CacheState;
  } catch {
    return {};
  }
}

async function saveCacheState(id: string, state: CacheState): Promise<void> {
  await writeFile(cacheStatePath(id), JSON.stringify(state), "utf8");
}

async function findLatestPdf(id: string): Promise<string | null> {
  const dir = rawDir(id);
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".pdf"))
    .sort()
    .reverse();
  return files[0] ? resolve(dir, files[0]) : null;
}

async function downloadOne(id: string, url: string): Promise<DownloadResult> {
  const dir = rawDir(id);
  await mkdir(dir, { recursive: true });

  const cache = await loadCacheState(id);
  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    Accept: "application/pdf,*/*;q=0.8",
    Referer: "https://www.cmfchile.cl/institucional/legislacion_normativa/normativa2.php",
  };
  if (cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;
  if (cache.etag) headers["If-None-Match"] = cache.etag;

  let lastError: string | undefined;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
    }

    let statusCode: number;
    let body: { arrayBuffer(): Promise<ArrayBuffer>; dump(): Promise<void> };
    let responseHeaders: Record<string, string | string[] | undefined>;

    try {
      const res = await request(url, {
        headers,
        bodyTimeout: TIMEOUT_MS,
        headersTimeout: TIMEOUT_MS,
        dispatcher: CMF_DISPATCHER,
      });
      statusCode = res.statusCode;
      body = res.body as typeof body;
      responseHeaders = res.headers as typeof responseHeaders;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    if (statusCode === 304) {
      const existing = await findLatestPdf(id);
      const result: DownloadResult = { id, status: "not-modified" };
      if (existing) result.path = existing;
      return result;
    }

    if (statusCode !== 200) {
      await body.dump();
      lastError = `HTTP ${statusCode}`;
      continue;
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const dest = pdfPath(id, fecha);

    let buf: ArrayBuffer;
    try {
      buf = await body.arrayBuffer();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    // Validate PDF magic bytes — server can return 200 with a WAF error page
    const magic = Buffer.from(buf).slice(0, 4).toString("ascii");
    if (!magic.startsWith("%PDF")) {
      lastError = `Respuesta no es un PDF (magic: ${JSON.stringify(magic)})`;
      continue;
    }

    try {
      await writeFile(dest, Buffer.from(buf));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }

    const newCache: CacheState = {};
    const etag = responseHeaders.etag;
    const lm = responseHeaders["last-modified"];
    if (typeof etag === "string") newCache.etag = etag;
    if (typeof lm === "string") newCache.lastModified = lm;
    await saveCacheState(id, newCache);

    return { id, status: "ok", path: dest };
  }

  return { id, status: "error", error: lastError ?? "unknown error" };
}

async function readIndexEntries(indexPath: string): Promise<IndexEntry[]> {
  const entries: IndexEntry[] = [];
  const rl = createInterface({
    input: createReadStream(indexPath, "utf8"),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    entries.push(JSON.parse(line) as IndexEntry);
  }
  return entries;
}

// Download all entries from index.jsonl. On first run or subsequent runs,
// uses If-Modified-Since / ETag to skip unchanged PDFs.
export async function downloadAll(
  entries?: IndexEntry[],
  indexPath = INDEX_PATH,
): Promise<DownloadResult[]> {
  const items = entries ?? (await readIndexEntries(indexPath));
  const limit = pLimit(CONCURRENCY);
  return Promise.all(items.map((e) => limit(() => downloadOne(e.id, e.urlPdf))));
}

// Bulk download all RAN chapters from seed (intended for first-run bootstrap).
// RAN chapters are stable; this fetches all 98 in one pass with the same
// rate limits as downloadAll.
export async function downloadRanBulk(seedPath?: string): Promise<DownloadResult[]> {
  const entries = fetchRanFromSeed(seedPath);
  const limit = pLimit(CONCURRENCY);
  return Promise.all(entries.map((e) => limit(() => downloadOne(e.id, e.urlPdf))));
}
