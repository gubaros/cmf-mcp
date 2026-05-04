import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ getDb: vi.fn() }));

import { getDb } from "../../src/db/client";
import { listNormsHandler } from "../../src/tools/listNorms";

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

function makeDb(countVal: number, rows: (typeof NORM)[]) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    all: vi
      .fn()
      .mockReturnValueOnce([{ value: countVal }])
      .mockReturnValueOnce(rows),
  } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => vi.clearAllMocks());

describe("listNormsHandler", () => {
  it("retorna normas con defaults (estado=VIGENTE, limit=50)", async () => {
    mockGetDb.mockReturnValue(makeDb(1, [NORM]));
    const result = await listNormsHandler({});
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("ncg-461");
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("respeta limit máximo de 200", async () => {
    mockGetDb.mockReturnValue(makeDb(0, []));
    const result = await listNormsHandler({ limit: 999 });
    expect(result.limit).toBe(200);
  });

  it("retorna vacío si no hay normas", async () => {
    mockGetDb.mockReturnValue(makeDb(0, []));
    const result = await listNormsHandler({ tipo: "NCG", sector: "VALORES" });
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("paginación: respeta offset", async () => {
    mockGetDb.mockReturnValue(makeDb(100, []));
    const result = await listNormsHandler({ offset: 50, limit: 10 });
    expect(result.offset).toBe(50);
    expect(result.limit).toBe(10);
  });
});
