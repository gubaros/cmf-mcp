import { runDiscovery } from "../scraper/discovery/index";
import { downloadAll, downloadRanBulk } from "../scraper/downloader";
import type { DownloadResult } from "../scraper/downloader";

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
