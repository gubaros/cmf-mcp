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

// RAN chapters (e.g. 20-7) use TÍTULO I / TÍTULO II / ANEXO N° 1 headings.
// The T[IÍ] covers both the accented (TÍTULO) and unaccented (TITULO) variants.
const RE_TITULO_HEADER = /^T[IÍ]TULO\s+([IVXLCDM]+)(?:[.\s:-]*([^\n]{0,200}))?/gim;
const RE_ANEXO_HEADER = /^ANEXO\s+N[°º]?\s*(\d+)(?:[.\s:-]*([^\n]{0,200}))?/gim;

// PDF running headers that OCR embeds on every page in RAN documents.
// Each pattern matches only when the line contains NOTHING else (start + end anchors).
const RE_PDF_RAN_HEADER = /^RECOPILACI[OÓ]N ACTUALIZADA DE NORMAS\s*$/gim;
const RE_PDF_CHAPTER_REF = /^Cap[ií]tulo\s+\d+[-–]\d+\s*$/gim;
const RE_PDF_PAGE_NUM = /^Hoja\s+N[°º]?\s*\d+\s*$/gim;
// "Circular N° 3.629 / 27.12.2017" — date separators can be . - or /
const RE_PDF_CIRCULAR_HEADER =
  /^Circular\s+N[°º]\s*[\d.]+\s*\/\s*\d{2}[.\-/]\d{2}[.\-/]\d{4}\s*$/gim;

const MIN_BODY_LEN = 100;

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Removes PDF page headers/footers that OCR embeds verbatim in RAN chapter text.
// Uses line-anchored patterns so mid-sentence circular citations are never touched.
function stripPdfArtifacts(text: string): string {
  return text
    .replace(RE_PDF_RAN_HEADER, "")
    .replace(RE_PDF_CHAPTER_REF, "")
    .replace(RE_PDF_PAGE_NUM, "")
    .replace(RE_PDF_CIRCULAR_HEADER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

// Splits on TÍTULO I / TÍTULO II / ANEXO N° 1 headings, which are the structural
// units in RAN chapters. Populates rubrica from the heading's description text.
// Unlike splitOnArticulos, short sections are skipped (not a bail-out signal).
function splitOnTitulos(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> | null {
  type Boundary = { start: number; headerEnd: number; numero: string; rubrica: string | null };
  const boundaries: Boundary[] = [];

  for (const m of text.matchAll(RE_TITULO_HEADER)) {
    const romano = (m[1] ?? "").toUpperCase();
    const desc = (m[2] ?? "").trim();
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: romano,
      rubrica: desc || null,
    });
  }

  for (const m of text.matchAll(RE_ANEXO_HEADER)) {
    const num = m[1] ?? "";
    const desc = (m[2] ?? "").trim();
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: `Anexo-${num}`,
      rubrica: desc ? `Anexo N° ${num} — ${desc}` : `Anexo N° ${num}`,
    });
  }

  if (boundaries.length < 2) return null;

  boundaries.sort((a, b) => a.start - b.start);

  const segments: Array<{ numero: string; rubrica: string | null; body: string }> = [];

  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if (!b) continue;
    const nextStart = boundaries[i + 1]?.start ?? text.length;
    const body = text.slice(b.headerEnd, nextStart).trim();
    if (body.length === 0) continue;
    segments.push({ numero: b.numero, rubrica: b.rubrica, body });
  }

  return segments.length >= 2 ? segments : null;
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
  const text = stripPdfArtifacts(rawText);

  // NCG / norma con artículos numerados
  if (detectMode(text) === "substantive") {
    const artSegments = splitOnArticulos(text);
    if (artSegments !== null) {
      return { mode: "substantive", articles: buildArticles(normId, artSegments) };
    }
    // Spurious article detection (inline citations) — fall through
  }

  // RAN / capítulos con TÍTULO I, TÍTULO II, ANEXO N° 1
  const tituloSegments = splitOnTitulos(text);
  if (tituloSegments !== null) {
    return { mode: "substantive", articles: buildArticles(normId, tituloSegments) };
  }

  // Dispositivos numerados o prosa sin estructura reconocida
  return { mode: "modifier", articles: buildArticles(normId, splitOnDispositivos(text)) };
}
