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

// Line-anchored: only matches "Artículo N" at the START of a line.
// Negative lookahead: rejects inline citations like "artículo 65 de la Ley General de Bancos".
// Without both constraints, inline LGB references shred RAN chapter bodies into fragments.
// No `s` flag intentionally: `.` stops at \n so each match covers exactly one header line.
const RE_ARTICULO_HEADER = /^Artículo\s+(?:N[°º]?\s*)?(\d+)(?!\s+de\s+la\b)[\s.:-]*(.*)/gim;

const MIN_BODY_LEN = 100;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function buildId(normId: string, numero: string): string {
  return `${normId}-art-${numero}`;
}

function detectMode(text: string): NormMode {
  const matches = [...text.matchAll(RE_ARTICULO_HEADER)];
  return matches.length >= 2 ? "substantive" : "modifier";
}

// Locates article header boundaries, then slices the text between them.
// Returns null if any resulting body is shorter than MIN_BODY_LEN — that
// signals spurious detection (inline LGB citations landing as fake headers).
function splitOnArticulos(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> | null {
  type Boundary = { start: number; headerEnd: number; numero: string; restOfLine: string };
  const boundaries: Boundary[] = [];

  for (const m of text.matchAll(RE_ARTICULO_HEADER)) {
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: m[1] ?? "",
      restOfLine: (m[2] ?? "").trim(),
    });
  }

  if (boundaries.length < 2) return null;

  const segments: Array<{ numero: string; rubrica: string | null; body: string }> = [];

  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (!b) continue;
    const nextStart = boundaries[i + 1]?.start ?? text.length;

    // Full content = tail of the header line + all subsequent lines until next article
    const afterHeader = text.slice(b.headerEnd, nextStart).trim();
    const fullContent = b.restOfLine ? `${b.restOfLine}\n${afterHeader}`.trim() : afterHeader;

    // First line may be a rubric (short, no trailing period, more content follows)
    const lines = fullContent.split("\n");
    let rubrica: string | null = null;
    let body = fullContent;
    const firstLine = (lines[0] ?? "").trim();
    if (firstLine && firstLine.length < 120 && !firstLine.endsWith(".") && lines.length > 1) {
      rubrica = firstLine;
      body = lines.slice(1).join("\n").trim();
    }

    if (body.length < MIN_BODY_LEN) return null;

    segments.push({ numero: b.numero, rubrica, body });
  }

  return segments.length > 0 ? segments : null;
}

function splitOnDispositivos(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> {
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

function buildArticles(
  normId: string,
  segments: Array<{ numero: string; rubrica: string | null; body: string }>,
): Article[] {
  const seen = new Set<string>();
  return segments
    .filter((s) => s.body.length > 0)
    .map((s, i) => {
      const texto = s.body;
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
}

export function segmentNorm(normId: string, rawText: string): SegmentResult {
  const mode = detectMode(rawText);

  if (mode === "substantive") {
    const artSegments = splitOnArticulos(rawText);
    if (artSegments !== null) {
      return { mode: "substantive", articles: buildArticles(normId, artSegments) };
    }
    // Spurious article detection (inline citations) — fall through to modifier
  }

  return { mode: "modifier", articles: buildArticles(normId, splitOnDispositivos(rawText)) };
}
