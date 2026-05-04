import { eq } from "drizzle-orm";
import type { getDb } from "../db/client";
import { articles, articlesHistory, norms } from "../db/schema";
import type { Article } from "./segmenter";

export type UpdateResult = "unchanged" | "updated";

export function applyNormUpdate(
  normId: string,
  existingTextHash: string,
  existingFechaScrape: string,
  newTextHash: string,
  newSegs: Article[],
  db: ReturnType<typeof getDb>,
  now: string,
): UpdateResult {
  if (existingTextHash === newTextHash) {
    db.update(norms).set({ fechaScrape: now }).where(eq(norms.id, normId)).run();
    return "unchanged";
  }

  db.transaction(() => {
    // Archive current articles before replacing them
    const current = db.select().from(articles).where(eq(articles.normId, normId)).all();
    for (const art of current) {
      db.insert(articlesHistory)
        .values({
          articleId: art.id,
          normId: art.normId,
          sectionId: art.sectionId ?? null,
          numero: art.numero,
          rubrica: art.rubrica ?? null,
          texto: art.texto,
          textoOriginal: art.textoOriginal,
          sector: art.sector,
          estado: art.estado,
          orden: art.orden,
          hashContenido: art.hashContenido,
          fechaUltimaModificacion: art.fechaUltimaModificacion,
          validFrom: existingFechaScrape,
          validTo: now,
        })
        .run();
    }

    db.delete(articles).where(eq(articles.normId, normId)).run();

    for (const art of newSegs) {
      db.insert(articles)
        .values({
          id: art.id,
          normId: art.normId,
          numero: art.numero,
          rubrica: art.rubrica ?? null,
          texto: art.texto,
          textoOriginal: art.textoOriginal,
          sector: current[0]?.sector ?? "",
          estado: current[0]?.estado ?? "VIGENTE",
          orden: art.orden,
          hashContenido: art.hashContenido,
          fechaUltimaModificacion: now,
        })
        .run();
    }

    db.update(norms)
      .set({ hashContenido: newTextHash, fechaScrape: now })
      .where(eq(norms.id, normId))
      .run();
  });

  return "updated";
}
