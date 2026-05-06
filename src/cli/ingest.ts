import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestAll } from "../ingest/loader";
import type { IndexEntry } from "../shared/types";

async function main() {
  const args = process.argv.slice(2);
  const idIdx = args.indexOf("--id");
  const targetId = idIdx !== -1 ? args[idIdx + 1] : undefined;
  const sectorIdx = args.indexOf("--sector");
  const targetSector = sectorIdx !== -1 ? args[sectorIdx + 1] : undefined;

  const indexPath = process.env.CMF_INDEX_PATH ?? resolve("data/index.jsonl");
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

  if (targetId) {
    const match = entries.find((e) => e.id === targetId);
    if (!match) {
      console.error(`[ingest] "${targetId}" no encontrado en index.jsonl`);
      process.exit(1);
    }
    entries = [match];
  } else if (targetSector) {
    const s = targetSector.toUpperCase();
    // "RAN" matches by id prefix; others match by sector field
    entries =
      s === "RAN"
        ? entries.filter((e) => e.id.startsWith("ran-"))
        : entries.filter((e) => e.sector === s);
    if (entries.length === 0) {
      console.error(`[ingest] No entries found for sector "${targetSector}"`);
      process.exit(1);
    }
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
