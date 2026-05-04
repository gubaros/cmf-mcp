import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "drizzle-kit";

const DATA_DIR = process.env.CMF_DATA_DIR ?? join(homedir(), ".cmf-mcp");
const DB_PATH = process.env.CMF_DB_PATH ?? join(DATA_DIR, "cmf_norms.db");

export default {
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: DB_PATH,
  },
} satisfies Config;
