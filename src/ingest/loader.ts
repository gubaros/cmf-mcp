import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { getDb } from "../db/client";
import { articles, norms } from "../db/schema";
import { parsePdf } from "../scraper/parsers/pdf";
import { segmentNorm } from "../scraper/segmenter";
import type { IndexEntry } from "../shared/types";

export type IngestStats = {
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  byMethod: { native: number; ocr: number };
};

const RAW_DIR = resolve("data/raw");
const CONCURRENCY = 16;

function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'")
    .trim();
}

function findLatestPdf(id: string): string | null {
  const dir = resolve(RAW_DIR, id);
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".pdf"))
      .sort()
      .reverse();
    return files[0] ? resolve(dir, files[0]) : null;
  } catch {
    return null;
  }
}

async function ingestOne(
  entry: IndexEntry,
  db: ReturnType<typeof getDb>,
): Promise<{
  status: "inserted" | "skipped" | "error";
  method?: "native" | "ocr";
  error?: string;
}> {
  const pdfPath = findLatestPdf(entry.id);
  if (!pdfPath) return { status: "skipped" };

  const existing = db.select({ id: norms.id }).from(norms).where(eq(norms.id, entry.id)).get();
  const pdfBuf = readFileSync(pdfPath);
  const pdfHash = createHash("sha256").update(pdfBuf).digest("hex");

  if (existing) {
    // Already loaded — skip unless hash changed (handled by change detector, not here)
    return { status: "skipped" };
  }

  let parseResult: Awaited<ReturnType<typeof parsePdf>>;
  try {
    parseResult = await parsePdf(pdfBuf);
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  const normalizedText = normalize(parseResult.text);
  const { articles: segs } = segmentNorm(entry.id, normalizedText);

  const now = new Date().toISOString().slice(0, 10);

  db.transaction(() => {
    db.insert(norms)
      .values({
        id: entry.id,
        tipo: entry.tipo,
        numero: entry.numero,
        titulo: entry.titulo,
        sector: entry.sector,
        fechaEmision: entry.fechaEmision ?? "",
        estado: entry.estado,
        urlOficial: entry.urlPdf,
        hashContenido: pdfHash,
        fechaScrape: now,
      })
      .run();

    for (const art of segs) {
      db.insert(articles)
        .values({
          id: art.id,
          normId: art.normId,
          numero: art.numero,
          rubrica: art.rubrica ?? null,
          texto: art.texto,
          textoOriginal: art.textoOriginal,
          sector: entry.sector,
          estado: entry.estado,
          orden: art.orden,
          hashContenido: art.hashContenido,
          fechaUltimaModificacion: now,
        })
        .run();
    }
  });

  return { status: "inserted", method: parseResult.method };
}

export async function ingestAll(entries: IndexEntry[]): Promise<IngestStats> {
  const db = getDb();
  const limit = pLimit(CONCURRENCY);
  const stats: IngestStats = {
    total: entries.length,
    inserted: 0,
    skipped: 0,
    errors: 0,
    byMethod: { native: 0, ocr: 0 },
  };

  const results = await Promise.all(entries.map((e) => limit(() => ingestOne(e, db))));

  for (const r of results) {
    if (r.status === "inserted") {
      stats.inserted++;
      if (r.method) stats.byMethod[r.method]++;
    } else if (r.status === "skipped") {
      stats.skipped++;
    } else {
      stats.errors++;
    }
  }

  return stats;
}
