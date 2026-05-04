import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestAll } from "../ingest/loader";
import type { IndexEntry } from "../shared/types";

async function main() {
  const indexPath = resolve("data/index.jsonl");
  let entries: IndexEntry[];
  try {
    entries = readFileSync(indexPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as IndexEntry);
  } catch {
    console.error("[ingest] No se encontró data/index.jsonl — corré pnpm scrape primero");
    process.exit(1);
  }

  console.log(`[ingest] ${entries.length} entradas en el índice`);
  const stats = await ingestAll(entries);
  console.log(
    `[ingest] Listo: inserted=${stats.inserted} skipped=${stats.skipped} errors=${stats.errors} ` +
      `(native=${stats.byMethod.native} ocr=${stats.byMethod.ocr})`,
  );
  if (stats.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[ingest] Fatal:", err);
  process.exit(1);
});
