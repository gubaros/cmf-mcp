import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EstadoVigencia, Sector, TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";

// Verified 2026-05-04 — source: w3-propertyvalue-29580.html
const SEED_PATH = resolve(__dirname, "ran_seed.json");
const PDF_BASE = "https://www.cmfchile.cl/portal/principal/613/";
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

// Default export used by runDiscovery — reads seed, never hits network.
export async function fetchRan(): Promise<IndexEntry[]> {
  return fetchRanFromSeed();
}
