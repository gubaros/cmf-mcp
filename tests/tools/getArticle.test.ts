import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ getDb: vi.fn() }));

import { getDb } from "../../src/db/client";
import { getArticleHandler } from "../../src/tools/getArticle";

const mockGetDb = vi.mocked(getDb);

const ROW = {
  id: "ncg-461-art-12",
  normId: "ncg-461",
  numero: "12",
  rubrica: "Vigencia",
  texto: "La presente norma entrará en vigencia...",
  sector: "VALORES",
  estado: "VIGENTE",
  urlOficial: "https://www.cmfchile.cl/normativa/ncg_461_2021.pdf",
};

function makeDb(row: typeof ROW | undefined) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnValue(row),
  } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => vi.clearAllMocks());

describe("getArticleHandler", () => {
  it("retorna el artículo con urlOficial de la norma padre", async () => {
    mockGetDb.mockReturnValue(makeDb(ROW));
    const result = await getArticleHandler({ id: "ncg-461-art-12" });
    expect(result.id).toBe("ncg-461-art-12");
    expect(result.normId).toBe("ncg-461");
    expect(result.rubrica).toBe("Vigencia");
    expect(result.urlOficial).toBe(ROW.urlOficial);
  });

  it("lanza error si el artículo no existe", async () => {
    mockGetDb.mockReturnValue(makeDb(undefined));
    await expect(getArticleHandler({ id: "ncg-999-art-1" })).rejects.toThrow(
      "Artículo no encontrado: ncg-999-art-1",
    );
  });
});
