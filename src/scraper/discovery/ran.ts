import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Agent, request } from "undici";
import { EstadoVigencia, Sector, TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";

const DISPATCHER = new Agent({ connect: { timeout: 30_000 } });

// Verified 2026-05-04 — source: w3-propertyvalue-29580.html
const SEED_PATH = resolve(__dirname, "ran_seed.json");
const PORTAL_URL = "https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-29580.html";
const PDF_BASE = "https://www.cmfchile.cl/portal/principal/613/";
const USER_AGENT = "cmf-mcp/0.1 (+https://github.com/gubaros/cmf-mcp)";
const MIN_CHAPTERS = 90; // abort threshold — real count is 98

type SeedChapter = { id: string; cap: string; articleId: string; titulo: string };
type SeedFile = { source: string; fechaExtraccion: string; total: number; chapters: SeedChapter[] };

function buildPdfUrl(articleId: string): string {
  return `${PDF_BASE}articles-${articleId}_doc_pdf.pdf`;
}

function seedToEntries(chapters: SeedChapter[]): IndexEntry[] {
  return chapters.map((c) => ({
    id: c.id,
    tipo: TipoNorma.RAN,
    numero: c.cap,
    titulo: c.titulo,
    sector: Sector.BANCARIO,
    fechaEmision: null,
    estado: EstadoVigencia.VIGENTE,
    urlPdf: buildPdfUrl(c.articleId),
    modifica: [],
    modificadaPor: [],
    deroga: [],
    derogadaPor: [],
  }));
}

// Parse the live portal page to refresh the seed. Used by `pnpm scrape:verify-ran`.
export function parseRanPortalHtml(html: string): SeedChapter[] {
  const chapters: SeedChapter[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(
    /<h4[^>]+aid-(\d+)[^>]*>\s*Cap[ií]tulo\s+([\d]+-[\d]+)\s+([^<]{0,200})<\/h4>/gi,
  )) {
    const [, articleId, cap, titulo] = m;
    if (!articleId || !cap || !titulo) continue;
    const parts = cap.split("-");
    const id = `ran-${parts[0]}-${parts[1]}`;
    const key = `${id}:${articleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chapters.push({ id, cap, articleId, titulo: titulo.trim() });
  }

  chapters.sort((a, b) => {
    const [a1, a2] = a.cap.split("-").map(Number);
    const [b1, b2] = b.cap.split("-").map(Number);
    return a1 !== b1 ? (a1 ?? 0) - (b1 ?? 0) : (a2 ?? 0) - (b2 ?? 0);
  });

  return chapters;
}

// Primary discovery: read from versioned seed file in the repo.
export function fetchRanFromSeed(seedPath = SEED_PATH): IndexEntry[] {
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;
  const entries = seedToEntries(seed.chapters);
  if (entries.length < MIN_CHAPTERS) {
    throw new Error(
      `RAN seed has only ${entries.length} chapters (minimum ${MIN_CHAPTERS}). Refresh with pnpm scrape:verify-ran.`,
    );
  }
  return entries;
}

// Live fetch — used by scrape:verify-ran to update the seed against CMF.
export async function fetchRanLive(): Promise<SeedChapter[]> {
  const { body, statusCode } = await request(PORTAL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "es-CL,es;q=0.9",
    },
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
    dispatcher: DISPATCHER,
  });

  if (statusCode !== 200) {
    await body.dump();
    throw new Error(`RAN portal returned HTTP ${statusCode}`);
  }

  const html = await body.text();
  const chapters = parseRanPortalHtml(html);

  if (chapters.length < MIN_CHAPTERS) {
    throw new Error(
      `RAN live fetch returned only ${chapters.length} chapters (minimum ${MIN_CHAPTERS}). Site structure may have changed.`,
    );
  }

  return chapters;
}

// Default export used by runDiscovery — reads seed, never hits network.
export async function fetchRan(): Promise<IndexEntry[]> {
  return fetchRanFromSeed();
}
