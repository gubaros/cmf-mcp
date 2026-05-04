import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/scraper/discovery/normativa2");
vi.mock("../../../src/scraper/discovery/ran");
vi.mock("../../../src/scraper/discovery/compendio_seguros");
vi.mock("../../../src/scraper/http", () => ({
  jitter: vi.fn().mockResolvedValue(undefined),
}));

import { fetchCompendioSeguros } from "../../../src/scraper/discovery/compendio_seguros";
import { runDiscovery } from "../../../src/scraper/discovery/index";
import { fetchNormativa2 } from "../../../src/scraper/discovery/normativa2";
import { fetchRan } from "../../../src/scraper/discovery/ran";
import type { IndexEntry } from "../../../src/shared/types";

const mockFetchNormativa2 = vi.mocked(fetchNormativa2);
const mockFetchRan = vi.mocked(fetchRan);
const mockFetchCompendioSeguros = vi.mocked(fetchCompendioSeguros);

function makeEntry(id: string, overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    id,
    tipo: "NCG",
    numero: "1",
    titulo: `Norma ${id}`,
    sector: "VALORES",
    fechaEmision: "2024-01-01",
    estado: "VIGENTE",
    urlPdf: `https://example.com/${id}.pdf`,
    modifica: [],
    modificadaPor: [],
    deroga: [],
    derogadaPor: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDiscovery", () => {
  it("combina los tres sources y escribe index.jsonl", async () => {
    mockFetchNormativa2.mockResolvedValue([makeEntry("ncg-100")]);
    mockFetchRan.mockResolvedValue([makeEntry("ran-1-1")]);
    mockFetchCompendioSeguros.mockResolvedValue([makeEntry("cseg-i-1")]);

    const outPath = resolve(tmpdir(), `index_test_${Date.now()}.jsonl`);
    const stats = await runDiscovery(outPath);

    expect(stats.total).toBe(3);
    expect(stats.bySource.ran).toBe(1);
    expect(stats.bySource.compendioSeguros).toBe(1);

    const lines = readFileSync(outPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l) as IndexEntry);
    expect(parsed.map((e) => e.id)).toEqual(
      expect.arrayContaining(["ncg-100", "ran-1-1", "cseg-i-1"]),
    );
  });

  it("deduplica entradas con el mismo ID entre sources", async () => {
    mockFetchNormativa2.mockResolvedValue([makeEntry("ncg-100"), makeEntry("ncg-100")]);
    mockFetchRan.mockResolvedValue([]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `index_test_${Date.now()}.jsonl`);
    const stats = await runDiscovery(outPath);

    expect(stats.total).toBe(1);
  });

  it("contabiliza IDs referenciados pero no presentes como desaparecidas", async () => {
    mockFetchNormativa2.mockResolvedValue([
      makeEntry("ncg-200", { modifica: ["ncg-100"] }), // ncg-100 referenced but not present
    ]);
    mockFetchRan.mockResolvedValue([]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `index_test_${Date.now()}.jsonl`);
    const stats = await runDiscovery(outPath);

    expect(stats.desaparecidas).toBe(1);
  });

  it("llama normativa2 para 6 combinaciones de tipo × mercado", async () => {
    mockFetchNormativa2.mockResolvedValue([]);
    mockFetchRan.mockResolvedValue([]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `index_test_${Date.now()}.jsonl`);
    await runDiscovery(outPath);

    // NCG/CIR/OFC × V/S = 6 calls
    expect(mockFetchNormativa2).toHaveBeenCalledTimes(6);
  });
});
