import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { articles, norms } from "../db/schema";

export type GetNormInput = {
  id: string;
  includeArticles?: boolean | undefined;
};

export type ArticleSummary = {
  id: string;
  numero: string;
  rubrica: string | null;
  texto: string;
};

export type GetNormResult = {
  id: string;
  tipo: string;
  numero: string;
  titulo: string;
  sector: string;
  fechaEmision: string;
  estado: string;
  urlOficial: string;
  articles?: ArticleSummary[];
};

export async function getNormHandler(input: GetNormInput): Promise<GetNormResult> {
  const db = getDb();

  const norm = db.select().from(norms).where(eq(norms.id, input.id)).get();
  if (!norm) {
    throw new Error(`Norma no encontrada: ${input.id}`);
  }

  const result: GetNormResult = {
    id: norm.id,
    tipo: norm.tipo,
    numero: norm.numero,
    titulo: norm.titulo,
    sector: norm.sector,
    fechaEmision: norm.fechaEmision,
    estado: norm.estado,
    urlOficial: norm.urlOficial,
  };

  if (input.includeArticles) {
    result.articles = db
      .select({
        id: articles.id,
        numero: articles.numero,
        rubrica: articles.rubrica,
        texto: articles.texto,
      })
      .from(articles)
      .where(eq(articles.normId, input.id))
      .orderBy(articles.orden)
      .all();
  }

  return result;
}
