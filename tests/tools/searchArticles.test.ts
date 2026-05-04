import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ getDb: vi.fn() }));

import { getDb } from "../../src/db/client";
import { searchArticlesHandler } from "../../src/tools/searchArticles";

const mockGetDb = vi.mocked(getDb);

const HIT = {
  article_id: "ran-1-13-art-3",
  norm_id: "ran-1-13",
  numero: "3",
  rubrica: null,
  snippet: "...las [entidades] bancarias deben...",
  sector: "BANCARIO",
  url_oficial: "https://www.cmfchile.cl/portal/principal/613/articles-28888_doc_pdf.pdf",
};

function makeDb(hits: (typeof HIT)[]) {
  return {
    all: vi.fn().mockReturnValueOnce(hits),
  } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => vi.clearAllMocks());

describe("searchArticlesHandler", () => {
  it("retorna hits mapeados correctamente", async () => {
    mockGetDb.mockReturnValue(makeDb([HIT]));
    const result = await searchArticlesHandler({ q: "entidades bancarias" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.articleId).toBe("ran-1-13-art-3");
    expect(result.items[0]?.urlOficial).toBe(HIT.url_oficial);
    expect(result.items[0]?.snippet).toContain("[entidades]");
  });

  it("retorna vacío cuando no hay resultados", async () => {
    mockGetDb.mockReturnValue(makeDb([]));
    const result = await searchArticlesHandler({ q: "inexistente" });
    expect(result.items).toHaveLength(0);
  });

  it("respeta limit máximo de 50", async () => {
    mockGetDb.mockReturnValue(makeDb([]));
    const result = await searchArticlesHandler({ q: "test", limit: 999 });
    expect(result.items).toHaveLength(0);
  });
});
