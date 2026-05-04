import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { articles, norms } from "../db/schema";

export type GetArticleInput = {
  id: string;
};

export type GetArticleResult = {
  id: string;
  normId: string;
  numero: string;
  rubrica: string | null;
  texto: string;
  sector: string;
  estado: string;
  urlOficial: string;
};

export async function getArticleHandler(input: GetArticleInput): Promise<GetArticleResult> {
  const db = getDb();

  const row = db
    .select({
      id: articles.id,
      normId: articles.normId,
      numero: articles.numero,
      rubrica: articles.rubrica,
      texto: articles.texto,
      sector: articles.sector,
      estado: articles.estado,
      urlOficial: norms.urlOficial,
    })
    .from(articles)
    .innerJoin(norms, eq(articles.normId, norms.id))
    .where(eq(articles.id, input.id))
    .get();

  if (!row) {
    throw new Error(`Artículo no encontrado: ${input.id}`);
  }

  return row;
}
