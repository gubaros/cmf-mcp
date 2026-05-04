import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { IndexEntry } from "../../shared/types";
import { jitter } from "../http";
import { fetchCompendioSeguros } from "./compendio_seguros";
import { fetchNormativa2 } from "./normativa2";
import { fetchRan } from "./ran";

const INDEX_PATH = resolve("data/index.jsonl");

// Norma types covered by normativa2.php for each market
const TIPOS_NORMATIVA2 = ["NCG", "CIR", "OFC"] as const;
const MERCADOS = ["V", "S"] as const;

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

export async function runDiscovery(outputPath = INDEX_PATH): Promise<DiscoveryStats> {
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
