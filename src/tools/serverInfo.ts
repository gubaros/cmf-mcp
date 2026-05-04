import { constants, accessSync, existsSync } from "node:fs";
import { count, max, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { DATA_DIR, DB_PATH, getDb } from "../db/client";
import { norms, validationLog } from "../db/schema";

export type ServerInfoResult = {
  version: string;
  repoUrl: string;
  totalNormas: number;
  porSector: Record<string, number>;
  ultimoScrape: string | null;
  normasValidadas: number;
  dataDir: string;
  dataDirWritable: boolean;
  dbInitialized: boolean;
  scrapeStale: boolean;
};

function isDirWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isScrapeStale(ultimoScrape: string | null): boolean {
  if (!ultimoScrape) return true;
  return Date.now() - new Date(ultimoScrape).getTime() > 30 * 24 * 60 * 60 * 1000;
}

export async function serverInfoHandler(_input: Record<string, never>): Promise<ServerInfoResult> {
  const dataDir = DATA_DIR;
  const dataDirWritable = isDirWritable(dataDir);
  const dbInitialized = existsSync(DB_PATH);

  try {
    const db = getDb();

    const [totalRow] = db
      .select({ value: count() })
      .from(norms)
      .where(eq(norms.estado, "VIGENTE"))
      .all();

    const sectorRows = db
      .select({ sector: norms.sector, cnt: count() })
      .from(norms)
      .where(eq(norms.estado, "VIGENTE"))
      .groupBy(norms.sector)
      .all();

    const [scrapeRow] = db
      .select({ value: max(norms.fechaScrape) })
      .from(norms)
      .all();

    const [validadoRow] = db
      .select({ value: sql<number>`COUNT(DISTINCT ${validationLog.normId})` })
      .from(validationLog)
      .all();

    const porSector: Record<string, number> = {};
    for (const row of sectorRows) {
      porSector[row.sector] = row.cnt;
    }

    const ultimoScrape = scrapeRow?.value ?? null;

    return {
      version: "0.1.0",
      repoUrl: "https://github.com/gubaros/cmf-mcp",
      totalNormas: totalRow?.value ?? 0,
      porSector,
      ultimoScrape,
      normasValidadas: validadoRow?.value ?? 0,
      dataDir,
      dataDirWritable,
      dbInitialized,
      scrapeStale: isScrapeStale(ultimoScrape),
    };
  } catch {
    return {
      version: "0.1.0",
      repoUrl: "https://github.com/gubaros/cmf-mcp",
      totalNormas: 0,
      porSector: {},
      ultimoScrape: null,
      normasValidadas: 0,
      dataDir,
      dataDirWritable,
      dbInitialized,
      scrapeStale: true,
    };
  }
}
