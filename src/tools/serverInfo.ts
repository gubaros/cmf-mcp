import { count, max, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { norms, validationLog } from "../db/schema";

export type ServerInfoResult = {
  version: string;
  repoUrl: string;
  totalNormas: number;
  porSector: Record<string, number>;
  ultimoScrape: string | null;
  normasValidadas: number;
};

export async function serverInfoHandler(_input: Record<string, never>): Promise<ServerInfoResult> {
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

    return {
      version: "0.1.0",
      repoUrl: "https://github.com/gubaros/cmf-mcp",
      totalNormas: totalRow?.value ?? 0,
      porSector,
      ultimoScrape: scrapeRow?.value ?? null,
      normasValidadas: validadoRow?.value ?? 0,
    };
  } catch {
    return {
      version: "0.1.0",
      repoUrl: "https://github.com/gubaros/cmf-mcp",
      totalNormas: 0,
      porSector: {},
      ultimoScrape: null,
      normasValidadas: 0,
    };
  }
}
