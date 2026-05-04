import { runDiscovery } from "../scraper/discovery/index";

async function main() {
  console.log("[discover] Fase 1: discovery (normativa2 + RAN seed + Compendio)...");
  const stats = await runDiscovery();
  console.log(
    `[discover] Listo: ${stats.total} normas ` +
      `(normativa2=${stats.bySource.normativa2}, ran=${stats.bySource.ran}, ` +
      `compendio=${stats.bySource.compendioSeguros}, desaparecidas=${stats.desaparecidas})`,
  );
  console.log("[discover] Índice escrito en data/index.jsonl");
}

main().catch((err) => {
  console.error("[discover] Fatal:", err);
  process.exit(1);
});
