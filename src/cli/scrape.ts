import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestAll } from "../ingest/loader";
import { runDiscovery } from "../scraper/discovery/index";
import { downloadAll, downloadRanBulk } from "../scraper/downloader";
import type { DownloadResult } from "../scraper/downloader";
import type { IndexEntry } from "../shared/types";

async function main() {
  console.log("[scrape] Fase 1: discovery...");
  const stats = await runDiscovery();
  console.log(
    `[scrape] Discovery completo: ${stats.total} normas ` +
      `(normativa2=${stats.bySource.normativa2}, ran=${stats.bySource.ran}, ` +
      `compendio=${stats.bySource.compendioSeguros}, desaparecidas=${stats.desaparecidas})`,
  );

  console.log("[scrape] Fase 2: bulk download RAN (98 capítulos)...");
  const ranResults = await downloadRanBulk();
  summarize("RAN bulk", ranResults);

  console.log("[scrape] Fase 3: download resto del índice (NCG/CIR/OFC/Compendio)...");
  const allResults = await downloadAll();
  summarize("downloadAll", allResults);

  console.log("[scrape] Fase 4: ingest PDF → SQLite...");
  const indexPath = resolve("data/index.jsonl");
  let entries: IndexEntry[] = [];
  try {
    entries = readFileSync(indexPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as IndexEntry);
  } catch {
    console.warn("[scrape] No se pudo leer data/index.jsonl — saltando ingest");
  }
  if (entries.length > 0) {
    const ingestStats = await ingestAll(entries);
    console.log(
      `[scrape] Ingest: total=${ingestStats.total} inserted=${ingestStats.inserted} ` +
        `skipped=${ingestStats.skipped} errors=${ingestStats.errors} ` +
        `(native=${ingestStats.byMethod.native} ocr=${ingestStats.byMethod.ocr})`,
    );
  }

  console.log("[scrape] Listo.");
}

function summarize(label: string, results: DownloadResult[]) {
  const ok = results.filter((r) => r.status === "ok").length;
  const notModified = results.filter((r) => r.status === "not-modified").length;
  const errors = results.filter((r) => r.status === "error");
  console.log(`[${label}] ok=${ok} not-modified=${notModified} errores=${errors.length}`);
  for (const e of errors) {
    console.error(`  ERROR ${e.id}: ${e.error}`);
  }
}

main().catch((err) => {
  console.error("[scrape] Fatal:", err);
  process.exit(1);
});
