#!/usr/bin/env tsx
/**
 * Resets article data and norm hashes so the next `pnpm ingest` re-segments
 * the affected norms with the current segmenter.
 *
 * Usage:
 *   pnpm reset-hashes --id ran-8-41           (single norm)
 *   pnpm reset-hashes --sector BANCARIO
 *   pnpm reset-hashes --sector RAN            (matches id LIKE 'ran-%')
 *   pnpm reset-hashes --all
 */
import { eq, inArray, like } from "drizzle-orm";
import { getDb } from "../db/client";
import { articles, norms } from "../db/schema";

function parseArgs(): { id: string | undefined; sector: string | undefined; all: boolean } {
  const args = process.argv.slice(2);
  const idIdx = args.indexOf("--id");
  if (idIdx !== -1 && args[idIdx + 1])
    return { id: args[idIdx + 1] as string, sector: undefined, all: false };
  const sectorIdx = args.indexOf("--sector");
  if (sectorIdx !== -1 && args[sectorIdx + 1])
    return { id: undefined, sector: args[sectorIdx + 1] as string, all: false };
  if (args.includes("--all")) return { id: undefined, sector: undefined, all: true };
  console.error("Usage: reset-hashes --id <normId> | --sector <SECTOR|RAN> | --all");
  process.exit(1);
}

const CHUNK = 499; // SQLite SQLITE_LIMIT_VARIABLE_NUMBER is 999; stay safe

async function main() {
  const { id, sector, all } = parseArgs();
  const db = getDb();

  let normIds: string[];

  if (id) {
    const exists = db.select({ id: norms.id }).from(norms).where(eq(norms.id, id)).get();
    if (!exists) {
      console.error(`reset-hashes: norm "${id}" not found in DB`);
      process.exit(1);
    }
    normIds = [id];
  } else if (all) {
    normIds = db
      .select({ id: norms.id })
      .from(norms)
      .all()
      .map((r) => r.id);
  } else {
    const s = (sector ?? "").toUpperCase();
    // "RAN" is a pseudo-sector: the real sector is BANCARIO but id prefix is ran-
    const where = s === "RAN" ? like(norms.id, "ran-%") : eq(norms.sector, s);
    normIds = db
      .select({ id: norms.id })
      .from(norms)
      .where(where)
      .all()
      .map((r) => r.id);
  }

  if (normIds.length === 0) {
    console.log("No norms matched. Nothing to reset.");
    process.exit(0);
  }

  let deletedArticles = 0;

  for (let i = 0; i < normIds.length; i += CHUNK) {
    const chunk = normIds.slice(i, i + CHUNK);
    const res = db.delete(articles).where(inArray(articles.normId, chunk)).run();
    deletedArticles += res.changes;
    db.update(norms).set({ hashContenido: "" }).where(inArray(norms.id, chunk)).run();
  }

  const label = id ?? (all ? "ALL" : sector);
  console.log(`✓ Reset ${normIds.length} norms [${label}] — ${deletedArticles} articles deleted`);
  console.log("  Run `pnpm ingest` to re-segment.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
