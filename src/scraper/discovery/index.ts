import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";
import { jitter } from "../http";
import { fetchCompendioSeguros } from "./compendio_seguros";
import { fetchNormativa2 } from "./normativa2";
import { fetchRan } from "./ran";

const INDEX_PATH = resolve("data/index.jsonl");

// Norma types covered by normativa2.php for each market
const TIPOS_NORMATIVA2 = ["NCG", "CIR", "OFC"] as const;
const MERCADOS = ["V", "S", "B"] as const;

export type DiscoveryThresholds = {
  normativa2Ncg: number;
  normativa2Cir: number;
  normativa2Ofc: number;
  normativa2Banca: number;
  ran: number;
  compendioSeguros: number;
};

export const DEFAULT_THRESHOLDS: DiscoveryThresholds = {
  normativa2Ncg: 300,
  normativa2Cir: 150,
  normativa2Ofc: 30,
  normativa2Banca: 0, // pending live verification of hidden_mercado=B — raise once confirmed
  ran: 90,
  compendioSeguros: 0, // URL desconocida — no bloquear hasta que esté resuelto
};

export type ThresholdViolation = {
  source: string;
  count: number;
  threshold: number;
  gap: number;
};

export class DiscoveryGateError extends Error {
  violations: ThresholdViolation[];
  constructor(violations: ThresholdViolation[]) {
    const summary = violations.map((v) => `${v.source}: ${v.count}/${v.threshold}`).join(", ");
    super(`Corpus gate falló — umbrales no alcanzados: ${summary}`);
    this.name = "DiscoveryGateError";
    this.violations = violations;
  }
}

export type DiscoveryStats = {
  total: number;
  bySource: { normativa2: number; ran: number; compendioSeguros: number };
  desaparecidas: number;
};

function dedup(entries: IndexEntry[]): IndexEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

async function writeJsonl(entries: IndexEntry[], path: string): Promise<void> {
  await mkdir(resolve("data"), { recursive: true });
  return new Promise((resolve2, reject) => {
    const stream = createWriteStream(path, { encoding: "utf8" });
    stream.on("error", reject);
    stream.on("finish", resolve2);
    for (const entry of entries) {
      stream.write(`${JSON.stringify(entry)}\n`);
    }
    stream.end();
  });
}

export async function runDiscovery(
  outputPath = INDEX_PATH,
  thresholds = DEFAULT_THRESHOLDS,
): Promise<DiscoveryStats> {
  const normativa2Entries: IndexEntry[] = [];
  for (const mercado of MERCADOS) {
    for (const tipo of TIPOS_NORMATIVA2) {
      const batch = await fetchNormativa2(tipo, mercado);
      normativa2Entries.push(...batch);
      await jitter(800, 2_000);
    }
  }

  const ranEntries = await fetchRan();
  await jitter(800, 2_000);
  const compendioEntries = await fetchCompendioSeguros();

  // Corpus gate — check before writing anything
  const ncgCount = normativa2Entries.filter((e) => e.tipo === TipoNorma.NCG).length;
  const cirCount = normativa2Entries.filter((e) => e.tipo === TipoNorma.CIRCULAR).length;
  const ofcCount = normativa2Entries.filter((e) => e.tipo === TipoNorma.OFICIO_CIRC).length;
  const bancaCount = normativa2Entries.filter((e) => e.sector === "BANCARIO").length;

  const checks: Array<[string, number, number]> = [
    ["normativa2_ncg", ncgCount, thresholds.normativa2Ncg],
    ["normativa2_cir", cirCount, thresholds.normativa2Cir],
    ["normativa2_ofc", ofcCount, thresholds.normativa2Ofc],
    ["normativa2_banca", bancaCount, thresholds.normativa2Banca],
    ["ran", ranEntries.length, thresholds.ran],
    ["compendio_seguros", compendioEntries.length, thresholds.compendioSeguros],
  ];

  const violations: ThresholdViolation[] = checks
    .filter(([, count, threshold]) => threshold > 0 && count < threshold)
    .map(([source, count, threshold]) => ({ source, count, threshold, gap: threshold - count }));

  if (violations.length > 0) {
    throw new DiscoveryGateError(violations);
  }

  const all = dedup([...normativa2Entries, ...ranEntries, ...compendioEntries]);

  // DESAPARECIDA: entries referenced in modifica/deroga but not present as top-level entry
  const known = new Set(all.map((e) => e.id));
  const referenced = new Set(
    all.flatMap((e) => [...e.modifica, ...e.modificadaPor, ...e.deroga, ...e.derogadaPor]),
  );
  const desaparecidas = [...referenced].filter((id) => !known.has(id)).length;

  await writeJsonl(all, outputPath);

  return {
    total: all.length,
    bySource: {
      normativa2: normativa2Entries.length,
      ran: ranEntries.length,
      compendioSeguros: compendioEntries.length,
    },
    desaparecidas,
  };
}
