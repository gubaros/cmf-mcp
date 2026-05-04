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
    console.error("[ingest] No se encontró data/index.jsonl — corré pnpm discover primero");
    process.exit(1);
  }

  console.log(`[ingest] ${entries.length} entradas en el índice`);
  const stats = await ingestAll(entries);
  console.log(
    `[ingest] Listo: inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors} ` +
      `(native=${stats.byMethod.native} ocr=${stats.byMethod.ocr})`,
  );
  for (const e of stats.errorList) {
    console.error(`  [error] ${e.id}: ${e.error}`);
  }
}

main().catch((err) => {
  console.error("[ingest] Fatal:", err);
  process.exit(1);
});
