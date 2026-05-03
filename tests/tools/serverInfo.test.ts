import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ getDb: vi.fn() }));

import { getDb } from "../../src/db/client";
import { serverInfoHandler } from "../../src/tools/serverInfo";

const mockGetDb = vi.mocked(getDb);

function makeDb(overrides: {
  total?: number;
  sectors?: { sector: string; cnt: number }[];
  lastScrape?: string | null;
  validated?: number;
}) {
  const { total = 0, sectors = [], lastScrape = null, validated = 0 } = overrides;
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    all: vi
      .fn()
      .mockReturnValueOnce([{ value: total }])
      .mockReturnValueOnce(sectors)
      .mockReturnValueOnce([{ value: lastScrape }])
      .mockReturnValueOnce([{ value: validated }]),
  } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("serverInfoHandler", () => {
  it("retorna ceros con DB vacía", async () => {
    mockGetDb.mockReturnValue(makeDb({}));

    const result = await serverInfoHandler({} as never);

    expect(result.totalNormas).toBe(0);
    expect(result.porSector).toEqual({});
    expect(result.ultimoScrape).toBeNull();
    expect(result.normasValidadas).toBe(0);
    expect(result.version).toBe("0.0.1");
    expect(result.repoUrl).toBe("https://github.com/gubaros/cmf-mcp");
  });

  it("retorna conteos correctos con datos en DB", async () => {
    mockGetDb.mockReturnValue(
      makeDb({
        total: 42,
        sectors: [
          { sector: "BANCARIO", cnt: 20 },
          { sector: "VALORES", cnt: 22 },
        ],
        lastScrape: "2026-05-01",
        validated: 15,
      }),
    );

    const result = await serverInfoHandler({} as never);

    expect(result.totalNormas).toBe(42);
    expect(result.porSector).toEqual({ BANCARIO: 20, VALORES: 22 });
    expect(result.ultimoScrape).toBe("2026-05-01");
    expect(result.normasValidadas).toBe(15);
  });
});
