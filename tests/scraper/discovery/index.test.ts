import { existsSync, readFileSync } from "node:fs";
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
import {
  DEFAULT_THRESHOLDS,
  DiscoveryGateError,
  type DiscoveryThresholds,
  runDiscovery,
} from "../../../src/scraper/discovery/index";
import { fetchNormativa2 } from "../../../src/scraper/discovery/normativa2";
import { fetchRan } from "../../../src/scraper/discovery/ran";
import type { IndexEntry } from "../../../src/shared/types";

// Thresholds that never block — used by tests that don't exercise the gate
const ZERO_THRESHOLDS: DiscoveryThresholds = {
  normativa2Ncg: 0,
  normativa2Cir: 0,
  normativa2Ofc: 0,
  ran: 0,
  compendioSeguros: 0,
};

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
    const stats = await runDiscovery(outPath, ZERO_THRESHOLDS);

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
    const stats = await runDiscovery(outPath, ZERO_THRESHOLDS);

    expect(stats.total).toBe(1);
  });

  it("contabiliza IDs referenciados pero no presentes como desaparecidas", async () => {
    mockFetchNormativa2.mockResolvedValue([
      makeEntry("ncg-200", { modifica: ["ncg-100"] }), // ncg-100 referenced but not present
    ]);
    mockFetchRan.mockResolvedValue([]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `index_test_${Date.now()}.jsonl`);
    const stats = await runDiscovery(outPath, ZERO_THRESHOLDS);

    expect(stats.desaparecidas).toBe(1);
  });

  it("llama normativa2 para 6 combinaciones de tipo × mercado", async () => {
    mockFetchNormativa2.mockResolvedValue([]);
    mockFetchRan.mockResolvedValue([]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `index_test_${Date.now()}.jsonl`);
    await runDiscovery(outPath, ZERO_THRESHOLDS);

    // NCG/CIR/OFC × V/S/B = 9 calls
    expect(mockFetchNormativa2).toHaveBeenCalledTimes(9);
  });
});

describe("corpus gate", () => {
  it("lanza DiscoveryGateError y no escribe el archivo si un source no alcanza el umbral", async () => {
    mockFetchNormativa2.mockResolvedValue([makeEntry("ncg-1", { tipo: "NCG" as never })]);
    mockFetchRan.mockResolvedValue([]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `gate_test_${Date.now()}.jsonl`);
    const thresholds: DiscoveryThresholds = { ...ZERO_THRESHOLDS, normativa2Ncg: 10 };

    await expect(runDiscovery(outPath, thresholds)).rejects.toThrow(DiscoveryGateError);
    expect(existsSync(outPath)).toBe(false);
  });

  it("incluye todos los sources fallidos en violations", async () => {
    mockFetchNormativa2.mockResolvedValue([]);
    mockFetchRan.mockResolvedValue([makeEntry("ran-1-1")]);
    mockFetchCompendioSeguros.mockResolvedValue([]);

    const outPath = resolve(tmpdir(), `gate_test_${Date.now()}.jsonl`);
    const thresholds: DiscoveryThresholds = { ...ZERO_THRESHOLDS, normativa2Ncg: 5, ran: 50 };

    const err = await runDiscovery(outPath, thresholds).catch((e) => e);
    expect(err).toBeInstanceOf(DiscoveryGateError);
    expect(err.violations).toHaveLength(2);
    expect(
      err.violations.find((v: { source: string }) => v.source === "normativa2_ncg"),
    ).toMatchObject({
      count: 0,
      threshold: 5,
      gap: 5,
    });
    expect(err.violations.find((v: { source: string }) => v.source === "ran")).toMatchObject({
      count: 1,
      threshold: 50,
      gap: 49,
    });
  });

  it("threshold=0 no bloquea aunque el source esté vacío (caso Compendio)", async () => {
    mockFetchNormativa2.mockResolvedValue([makeEntry("ncg-1", { tipo: "NCG" as never })]);
    mockFetchRan.mockResolvedValue([makeEntry("ran-1-1")]);
    mockFetchCompendioSeguros.mockResolvedValue([]); // 0 entradas

    const outPath = resolve(tmpdir(), `gate_test_${Date.now()}.jsonl`);
    // DEFAULT_THRESHOLDS tiene compendioSeguros: 0 — no debe bloquear
    const thresholds: DiscoveryThresholds = {
      ...ZERO_THRESHOLDS,
      compendioSeguros: DEFAULT_THRESHOLDS.compendioSeguros, // 0
    };

    await expect(runDiscovery(outPath, thresholds)).resolves.toBeDefined();
  });
});
