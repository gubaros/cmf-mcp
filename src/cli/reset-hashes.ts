#!/usr/bin/env tsx
/**
 * Resets article data and norm hashes so the next `pnpm ingest` re-segments
 * the affected norms with the current segmenter.
 *
 * Usage:
 *   pnpm reset-hashes --sector BANCARIO
 *   pnpm reset-hashes --sector RAN          (matches id LIKE 'ran-%')
 *   pnpm reset-hashes --all
 */
import { eq, inArray, like, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { articles, norms } from "../db/schema";

function parseArgs(): { sector: string | undefined; all: boolean } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--sector");
  if (idx !== -1 && args[idx + 1]) return { sector: args[idx + 1] as string, all: false };
  if (args.includes("--all")) return { sector: undefined, all: true };
  console.error("Usage: reset-hashes --sector <SECTOR|RAN> | --all");
  process.exit(1);
}

const CHUNK = 499; // SQLite SQLITE_LIMIT_VARIABLE_NUMBER is 999; stay safe

async function main() {
  const { sector, all } = parseArgs();
  const db = getDb();

  let normIds: string[];

  if (all) {
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

  const label = all ? "ALL" : sector;
  console.log(`✓ Reset ${normIds.length} norms [${label}] — ${deletedArticles} articles deleted`);
  console.log("  Run `pnpm ingest` to re-segment.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
