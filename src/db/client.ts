import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const DATA_DIR = process.env.CMF_DATA_DIR ?? join(homedir(), ".cmf-mcp");
export const DB_PATH = process.env.CMF_DB_PATH ?? join(DATA_DIR, "cmf_norms.db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("cache_size = -40000"); // 40 MB — cabe toda la DB en RAM
  sqlite.pragma("temp_store = MEMORY"); // tablas temporales en RAM (GROUP BY, sort)
  _db = drizzle(sqlite, { schema });
  return _db;
}
