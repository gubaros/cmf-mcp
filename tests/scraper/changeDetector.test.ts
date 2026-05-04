import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ getDb: vi.fn() }));

import { getDb } from "../../src/db/client";
import { applyNormUpdate } from "../../src/scraper/changeDetector";
import type { Article } from "../../src/scraper/segmenter";

const mockGetDb = vi.mocked(getDb);

const NORM_ID = "ncg-100";
const OLD_HASH = "aaa111";
const NEW_HASH = "bbb222";
const OLD_FECHA = "2024-01-01";
const NOW = "2026-05-04";

const EXISTING_ARTICLE = {
  id: "ncg-100-art-1",
  normId: NORM_ID,
  sectionId: null,
  numero: "1",
  rubrica: "Objeto",
  texto: "Texto viejo",
  textoOriginal: "Texto viejo original",
  sector: "VALORES",
  estado: "VIGENTE",
  orden: 1,
  hashContenido: "art-hash-old",
  fechaUltimaModificacion: OLD_FECHA,
};

const NEW_SEG: Article = {
  id: "ncg-100-art-1",
  normId: NORM_ID,
  numero: "1",
  rubrica: "Objeto actualizado",
  texto: "Texto nuevo",
  textoOriginal: "Texto nuevo original",
  orden: 1,
  hashContenido: "art-hash-new",
};

function makeDb(overrides: {
  articles?: (typeof EXISTING_ARTICLE)[];
  updateRun?: ReturnType<typeof vi.fn>;
  deleteRun?: ReturnType<typeof vi.fn>;
  insertHistoryRun?: ReturnType<typeof vi.fn>;
  insertArticleRun?: ReturnType<typeof vi.fn>;
}) {
  const updateRun = overrides.updateRun ?? vi.fn();
  const deleteRun = overrides.deleteRun ?? vi.fn();
  const insertHistoryRun = overrides.insertHistoryRun ?? vi.fn();
  const insertArticleRun = overrides.insertArticleRun ?? vi.fn();

  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnValue(overrides.articles ?? [EXISTING_ARTICLE]),
    update: vi
      .fn()
      .mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: updateRun }) }),
      }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: deleteRun }) }),
    insert: vi
      .fn()
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue({ run: insertHistoryRun }) })
      .mockReturnValue({ values: vi.fn().mockReturnValue({ run: insertArticleRun }) }),
    transaction: vi.fn().mockImplementation((fn: () => void) => fn()),
  } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => vi.clearAllMocks());

describe("applyNormUpdate", () => {
  it("retorna 'unchanged' y solo actualiza fechaScrape si el hash no cambió", () => {
    const updateRun = vi.fn();
    const db = makeDb({ updateRun });
    mockGetDb.mockReturnValue(db);

    const result = applyNormUpdate(NORM_ID, OLD_HASH, OLD_FECHA, OLD_HASH, [NEW_SEG], db, NOW);

    expect(result).toBe("unchanged");
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("retorna 'updated', archiva artículos anteriores e inserta los nuevos si el hash cambió", () => {
    const insertHistoryRun = vi.fn();
    const deleteRun = vi.fn();
    const insertArticleRun = vi.fn();
    const updateRun = vi.fn();
    const db = makeDb({ insertHistoryRun, deleteRun, insertArticleRun, updateRun });
    mockGetDb.mockReturnValue(db);

    const result = applyNormUpdate(NORM_ID, OLD_HASH, OLD_FECHA, NEW_HASH, [NEW_SEG], db, NOW);

    expect(result).toBe("updated");
    expect(insertHistoryRun).toHaveBeenCalledTimes(1); // 1 artículo archivado
    expect(deleteRun).toHaveBeenCalledTimes(1); // artículos borrados
    expect(insertArticleRun).toHaveBeenCalledTimes(1); // 1 artículo nuevo
    expect(updateRun).toHaveBeenCalledTimes(1); // norm hash + fechaScrape
  });

  it("archiva con validFrom=fechaScrapeAnterior y validTo=now", () => {
    let capturedHistory: Record<string, unknown> | null = null;
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      all: vi.fn().mockReturnValue([EXISTING_ARTICLE]),
      update: vi
        .fn()
        .mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn() }) }),
        }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ run: vi.fn() }) }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
          if (v.validFrom !== undefined) capturedHistory = v;
          return { run: vi.fn() };
        }),
      }),
      transaction: vi.fn().mockImplementation((fn: () => void) => fn()),
    } as unknown as ReturnType<typeof getDb>;
    mockGetDb.mockReturnValue(db);

    applyNormUpdate(NORM_ID, OLD_HASH, OLD_FECHA, NEW_HASH, [NEW_SEG], db, NOW);

    expect(capturedHistory).toMatchObject({
      articleId: EXISTING_ARTICLE.id,
      validFrom: OLD_FECHA,
      validTo: NOW,
    });
  });
});
