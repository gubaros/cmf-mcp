// Structural segmenter: converts raw norm text into article/section tree.
// Two norm modes:
//   - substantive: has "Artículo N°X" or "Artículo X" → numbered articles
//   - modifier: short, no formal articles → single DISPOSITIVO block per paragraph
import { createHash } from "node:crypto";

export type NormMode = "substantive" | "modifier";

export type Article = {
  id: string;
  normId: string;
  numero: string;
  rubrica: string | null;
  texto: string;
  textoOriginal: string;
  orden: number;
  hashContenido: string;
};

export type SegmentResult = {
  mode: NormMode;
  articles: Article[];
};

const RE_ARTICULO = /^Artículo\s+(?:N[°º]?\s*)?(\d+)[\s.:-]*(.*)/im;
const RE_ARTICULO_GLOBAL = /Artículo\s+(?:N[°º]?\s*)?(\d+)[\s.:-]*/gim;
const RE_DISPOSITIVO = /^(\d+)\.\s+/m;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function buildId(normId: string, numero: string): string {
  return `${normId}-art-${numero}`;
}

function detectMode(text: string): NormMode {
  const matches = [...text.matchAll(RE_ARTICULO_GLOBAL)];
  return matches.length >= 2 ? "substantive" : "modifier";
}

function splitOnArticulos(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> {
  const segments: Array<{ numero: string; rubrica: string | null; body: string }> = [];
  const re = /Artículo\s+(?:N[°º]?\s*)?(\d+)[\s.:-]*(.*?)(?=Artículo\s+(?:N[°º]?\s*)?\d+|$)/gims;

  for (const m of text.matchAll(re)) {
    const numero = m[1] ?? "";
    const rest = (m[2] ?? "").trim();
    // First line after "Artículo X" may be the rubric (short, ends without period or is all-caps)
    const lines = rest.split("\n");
    let rubrica: string | null = null;
    let bodyStart = 0;
    const firstLine = (lines[0] ?? "").trim();
    if (firstLine && firstLine.length < 120 && !firstLine.endsWith(".") && lines.length > 1) {
      rubrica = firstLine;
      bodyStart = 1;
    }
    const body = lines.slice(bodyStart).join("\n").trim();
    if (numero) segments.push({ numero, rubrica, body });
  }

  return segments;
}

function splitOnDispositivos(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> {
  // For modifier norms: split on numbered items "1.", "2.", etc.
  // If no numbered items, treat the whole text as a single block.
  const items: Array<{ numero: string; rubrica: string | null; body: string }> = [];
  const re = /(?:^|\n)(\d+)\.\s+([\s\S]*?)(?=\n\d+\.\s+|$)/g;
  let found = false;

  for (const m of text.matchAll(re)) {
    found = true;
    items.push({ numero: m[1] ?? "1", rubrica: null, body: (m[2] ?? "").trim() });
  }

  if (!found) {
    items.push({ numero: "1", rubrica: null, body: text.trim() });
  }

  return items;
}

export function segmentNorm(normId: string, rawText: string): SegmentResult {
  const mode = detectMode(rawText);
  const segments =
    mode === "substantive" ? splitOnArticulos(rawText) : splitOnDispositivos(rawText);

  const seen = new Set<string>();
  const articles: Article[] = segments
    .filter((s) => s.body.length > 0)
    .map((s, i) => {
      const texto = s.body;
      // Disambiguate repeated article numbers (e.g. OCR misreads) by appending order
      let id = buildId(normId, s.numero);
      if (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return {
        id,
        normId,
        numero: s.numero,
        rubrica: s.rubrica,
        texto,
        textoOriginal: texto,
        orden: i + 1,
        hashContenido: sha256(texto),
      };
    });

  return { mode, articles };
}
