import type { Config } from "drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.CMF_DB_PATH ?? "data/cmf_norms.db",
  },
} satisfies Config;
