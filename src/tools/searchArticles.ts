import { sql } from "drizzle-orm";
import { getDb } from "../db/client";

export type SearchArticlesInput = {
  q: string;
  sector?: string | undefined;
  estado?: string | undefined;
  limit?: number | undefined;
};

export type SearchHit = {
  articleId: string;
  normId: string;
  numero: string;
  rubrica: string | null;
  snippet: string;
  sector: string;
  urlOficial: string;
};

export type SearchArticlesResult = {
  items: SearchHit[];
  total: number;
};

export async function searchArticlesHandler(
  input: SearchArticlesInput,
): Promise<SearchArticlesResult> {
  const db = getDb();
  const lim = Math.min(input.limit ?? 20, 50);
  const estado = input.estado ?? "VIGENTE";

  // FTS5 content table query with snippet and optional sector filter
  // articles_fts has: id (UNINDEXED), norm_id (UNINDEXED), sector (UNINDEXED), texto
  const sectorFilter = input.sector ? `AND a.sector = '${input.sector.replace(/'/g, "''")}'` : "";

  const rows = db.all<{
    article_id: string;
    norm_id: string;
    numero: string;
    rubrica: string | null;
    snippet: string;
    sector: string;
    url_oficial: string;
  }>(sql`
    SELECT
      f.id        AS article_id,
      f.norm_id   AS norm_id,
      a.numero    AS numero,
      a.rubrica   AS rubrica,
      snippet(articles_fts, 3, '[', ']', '...', 32) AS snippet,
      a.sector    AS sector,
      n.url_oficial AS url_oficial
    FROM articles_fts f
    JOIN articles a ON a.id = f.id
    JOIN norms    n ON n.id = f.norm_id
    WHERE articles_fts MATCH ${input.q}
      AND a.estado = ${estado}
      ${sql.raw(sectorFilter)}
    ORDER BY rank
    LIMIT ${lim}
  `);

  // Total count (no LIMIT)
  const [countRow] = db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n
    FROM articles_fts f
    JOIN articles a ON a.id = f.id
    WHERE articles_fts MATCH ${input.q}
      AND a.estado = ${estado}
      ${sql.raw(sectorFilter)}
  `);

  return {
    items: rows.map((r) => ({
      articleId: r.article_id,
      normId: r.norm_id,
      numero: r.numero,
      rubrica: r.rubrica,
      snippet: r.snippet,
      sector: r.sector,
      urlOficial: r.url_oficial,
    })),
    total: countRow?.n ?? 0,
  };
}
