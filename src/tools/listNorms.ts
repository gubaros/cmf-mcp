import { and, count, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { norms } from "../db/schema";

export type ListNormsInput = {
  tipo?: string | undefined;
  sector?: string | undefined;
  estado?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

export type NormSummary = {
  id: string;
  tipo: string;
  numero: string;
  titulo: string;
  sector: string;
  fechaEmision: string;
  estado: string;
  urlOficial: string;
};

export type ListNormsResult = {
  items: NormSummary[];
  total: number;
  limit: number;
  offset: number;
};

export async function listNormsHandler(input: ListNormsInput): Promise<ListNormsResult> {
  const db = getDb();
  const estado = input.estado ?? "VIGENTE";
  const lim = Math.min(input.limit ?? 50, 200);
  const off = input.offset ?? 0;

  const filters = [eq(norms.estado, estado)];
  if (input.tipo) filters.push(eq(norms.tipo, input.tipo));
  if (input.sector) filters.push(eq(norms.sector, input.sector));
  const where = and(...filters);

  const [totalRow] = db.select({ value: count() }).from(norms).where(where).all();

  const rows = db
    .select({
      id: norms.id,
      tipo: norms.tipo,
      numero: norms.numero,
      titulo: norms.titulo,
      sector: norms.sector,
      fechaEmision: norms.fechaEmision,
      estado: norms.estado,
      urlOficial: norms.urlOficial,
    })
    .from(norms)
    .where(where)
    .limit(lim)
    .offset(off)
    .all();

  return {
    items: rows,
    total: totalRow?.value ?? 0,
    limit: lim,
    offset: off,
  };
}
