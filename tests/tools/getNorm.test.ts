import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ getDb: vi.fn() }));

import { getDb } from "../../src/db/client";
import { getNormHandler } from "../../src/tools/getNorm";

const mockGetDb = vi.mocked(getDb);

const NORM = {
  id: "ncg-461",
  tipo: "NCG",
  numero: "461",
  titulo: "Norma de prueba",
  sector: "VALORES",
  fechaEmision: "2021-01-15",
  estado: "VIGENTE",
  urlOficial: "https://www.cmfchile.cl/normativa/ncg_461_2021.pdf",
};

const ARTICLES = [
  { id: "ncg-461-art-1", numero: "1", rubrica: "Objeto", texto: "La presente norma..." },
  { id: "ncg-461-art-2", numero: "2", rubrica: null, texto: "Se deroga..." },
];

function makeDb(norm: typeof NORM | undefined, articles = ARTICLES) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnValue(norm),
    all: vi.fn().mockReturnValue(articles),
  } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => vi.clearAllMocks());

describe("getNormHandler", () => {
  it("retorna la norma sin artículos por defecto", async () => {
    mockGetDb.mockReturnValue(makeDb(NORM));
    const result = await getNormHandler({ id: "ncg-461" });
    expect(result.id).toBe("ncg-461");
    expect(result.urlOficial).toBe(NORM.urlOficial);
    expect(result.articles).toBeUndefined();
  });

  it("incluye artículos cuando includeArticles=true", async () => {
    mockGetDb.mockReturnValue(makeDb(NORM));
    const result = await getNormHandler({ id: "ncg-461", includeArticles: true });
    expect(result.articles).toHaveLength(2);
    expect(result.articles?.[0]?.id).toBe("ncg-461-art-1");
    expect(result.articles?.[1]?.rubrica).toBeNull();
  });

  it("lanza error si la norma no existe", async () => {
    mockGetDb.mockReturnValue(makeDb(undefined));
    await expect(getNormHandler({ id: "ncg-999" })).rejects.toThrow("Norma no encontrada: ncg-999");
  });
});
