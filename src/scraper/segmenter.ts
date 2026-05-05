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
// Bug #2: unnumbered annexes — "Anexo" alone or with title but no "N° X"
// Strip "Hoja X" artifacts that OCR appends on the same line as "Anexo".
const RE_ANEXO_STANDALONE = /^ANEXO\b(?!\s+N[°º]?\s*\d)(?:[.\s:-]*([^\n]{0,200}))?/gim;
const RE_HOJA_ARTIFACT = /\s*Hoja\s+(?:N[°º]?\s*)?\d+\s*$/i;
// Bug #1: Arabic numeral top-level sections — "1. Title" or "1.- Title"
// `^\s*` tolerates OCR-injected leading spaces on each line.
const RE_ARABIC_SECTION = /^\s*(\d{1,2})\.(?:-\s*|\s+)([^\n]*)/gim;
// RAN chapters like ran-20-7 use "I. ÁMBITO DE APLICACIÓN" (Roman numeral + period + ALL CAPS).
// No `i` flag: [a-z] must stay case-sensitive to distinguish "I. TITLE" from "I. lowercase body".
// `^\s*` tolerates OCR-injected leading spaces; `$` ensures the match spans the full line.
const RE_ROMAN_SECTION = /^\s*([IVXLCDM]+)\.\s+([^\na-z]{4,})\s*$/gm;

// PDF running headers that OCR embeds on every page in RAN documents.
// Each pattern matches only when the line contains NOTHING else (start + end anchors).
const RE_PDF_RAN_HEADER = /^RECOPILACI[OÓ]N ACTUALIZADA DE NORMAS\s*$/gim;
const RE_PDF_CHAPTER_REF = /^Cap[ií]tulo\s+\d+[-–]\d+\s*$/gim;
const RE_PDF_PAGE_NUM = /^Hoja\s+(?:N[°º]?\s*)?\d+\s*$/gim;
// "ANEXO N° 1 Hoja 2" — annex running header that includes the annexe number
const RE_PDF_ANEXO_HOJA = /^ANEXO\s+N[°º]?\s*\d+\s+Hoja\s+\d+\s*$/gim;
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
    .replace(RE_PDF_ANEXO_HOJA, "")
    .replace(RE_PDF_PAGE_NUM, "")
    .replace(RE_PDF_CIRCULAR_HEADER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Bug #3: OCR sometimes injects "ANEXO N°1" on the same line as "ANEXO N° 1",
// producing desc = "ANEXO N°1" and rubrica = "Anexo N° 1 — ANEXO N°1".
// Strip any leading self-referential "ANEXO N°X" from desc before building rubrica.
function buildAnexoRubrica(num: string, desc: string): string {
  const cleaned = desc.replace(/^ANEXO\s*N[°º]?\s*\d+\s*[-–—]?\s*/i, "").trim();
  return cleaned ? `Anexo N° ${num} — ${cleaned}` : `Anexo N° ${num}`;
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
  let tituloCount = 0;

  for (const m of text.matchAll(RE_TITULO_HEADER)) {
    const romano = (m[1] ?? "").toUpperCase();
    const desc = (m[2] ?? "").trim();
    // Reject inline cross-references: "TÍTULO II del Capítulo 20-9" or "TÍTULO I de la Ley"
    if (/^del?\s/i.test(desc)) continue;
    tituloCount++;
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: romano,
      rubrica: desc || null,
    });
  }

  // Without at least one real TÍTULO heading this strategy doesn't apply —
  // documents using only ANEXO boundaries or the "I." format fall through to
  // splitOnRomanSections.
  if (tituloCount === 0) return null;

  for (const m of text.matchAll(RE_ANEXO_HEADER)) {
    const num = m[1] ?? "";
    const desc = (m[2] ?? "").trim();
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: `Anexo-${num}`,
      rubrica: buildAnexoRubrica(num, desc),
    });
  }

  // Bug #2: collect unnumbered standalone annexes ("Anexo" without "N° X")
  for (const m of text.matchAll(RE_ANEXO_STANDALONE)) {
    const desc = (m[1] ?? "").trim().replace(RE_HOJA_ARTIFACT, "").trim();
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: "Anexo",
      rubrica: desc || "Anexo",
    });
  }

  if (boundaries.length < 2) return null;

  boundaries.sort((a, b) => a.start - b.start);

  // Deduplicate by numero: keep only the first occurrence of each heading.
  // PDF running headers repeat "ANEXO N° 1 Hoja N" on every page of an annexe,
  // causing spurious extra boundaries for the same structural section.
  const seenNumero = new Set<string>();
  const unique = boundaries.filter((b) => {
    if (seenNumero.has(b.numero)) return false;
    seenNumero.add(b.numero);
    return true;
  });

  if (unique.length < 2) return null;

  const segments: Array<{ numero: string; rubrica: string | null; body: string }> = [];

  for (let i = 0; i < unique.length; i++) {
    const b = unique[i];
    if (!b) continue;
    const nextStart = unique[i + 1]?.start ?? text.length;
    let body = text.slice(b.headerEnd, nextStart).trim();
    let rubrica = b.rubrica;

    // Bug #4: OCR splits heading across two lines — join continuation into rubrica
    if (rubrica) {
      const bodyLines = body.split("\n");
      const cont = (bodyLines[0] ?? "").trim();
      if (cont && cont.length < 120 && cont === cont.toUpperCase() && cont.endsWith(".") && bodyLines.length > 1) {
        rubrica = `${rubrica} ${cont}`;
        body = bodyLines.slice(1).join("\n").trim();
      }
    }

    if (body.length === 0) continue;
    segments.push({ numero: b.numero, rubrica, body });
  }

  return segments.length >= 2 ? segments : null;
}

// Handles RAN chapters that use "I. ÁMBITO DE APLICACIÓN" (Roman numeral + period)
// instead of the "TÍTULO I" keyword. Also collects ANEXO N° boundaries so annexes
// are segmented within the same pass.
// Bails out (returns null) if any non-empty section body is shorter than MIN_BODY_LEN —
// same guard as splitOnArticulos — to avoid treating numbered lists inside body text as
// structural sections.
function splitOnRomanSections(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> | null {
  type Boundary = { start: number; headerEnd: number; numero: string; rubrica: string | null };
  const boundaries: Boundary[] = [];

  for (const m of text.matchAll(RE_ROMAN_SECTION)) {
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
      rubrica: buildAnexoRubrica(num, desc),
    });
  }

  // Bug #2: collect unnumbered standalone annexes
  for (const m of text.matchAll(RE_ANEXO_STANDALONE)) {
    const desc = (m[1] ?? "").trim();
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: "Anexo",
      rubrica: desc || "Anexo",
    });
  }

  if (boundaries.length < 2) return null;

  boundaries.sort((a, b) => a.start - b.start);

  const seenNumero = new Set<string>();
  const unique = boundaries.filter((b) => {
    if (seenNumero.has(b.numero)) return false;
    seenNumero.add(b.numero);
    return true;
  });

  if (unique.length < 2) return null;

  const segments: Array<{ numero: string; rubrica: string | null; body: string }> = [];

  for (let i = 0; i < unique.length; i++) {
    const b = unique[i];
    if (!b) continue;
    const nextStart = unique[i + 1]?.start ?? text.length;
    let body = text.slice(b.headerEnd, nextStart).trim();
    let rubrica = b.rubrica;

    // Bug #4: OCR splits heading across two lines — join continuation into rubrica
    if (rubrica) {
      const bodyLines = body.split("\n");
      const cont = (bodyLines[0] ?? "").trim();
      if (cont && cont.length < 120 && cont === cont.toUpperCase() && cont.endsWith(".") && bodyLines.length > 1) {
        rubrica = `${rubrica} ${cont}`;
        body = bodyLines.slice(1).join("\n").trim();
      }
    }

    if (body.length < MIN_BODY_LEN) return null;
    segments.push({ numero: b.numero, rubrica, body });
  }

  return segments.length >= 2 ? segments : null;
}

// Bug #1: RAN chapters like ran-8-41 use "1. Title" or "1.- Title" as top-level structural
// sections. Guards: ≥2 boundaries, every body ≥ MIN_BODY_LEN (avoids numbered-list body text).
function splitOnArabicSections(
  text: string,
): Array<{ numero: string; rubrica: string | null; body: string }> | null {
  type Boundary = { start: number; headerEnd: number; numero: string; rubrica: string | null };
  const boundaries: Boundary[] = [];

  for (const m of text.matchAll(RE_ARABIC_SECTION)) {
    const num = m[1] ?? "";
    const title = (m[2] ?? "").trim();
    boundaries.push({
      start: m.index ?? 0,
      headerEnd: (m.index ?? 0) + m[0].length,
      numero: num,
      rubrica: title || null,
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
    if (body.length < MIN_BODY_LEN) return null;
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

  // RAN / capítulos con "I. ÁMBITO DE APLICACIÓN" (numeral romano + punto + MAYÚSCULAS)
  const romanSegments = splitOnRomanSections(text);
  if (romanSegments !== null) {
    return { mode: "substantive", articles: buildArticles(normId, romanSegments) };
  }

  // Bug #1: RAN chapters with Arabic numeral top-level sections (e.g. ran-8-41)
  const arabicSegments = splitOnArabicSections(text);
  if (arabicSegments !== null) {
    return { mode: "substantive", articles: buildArticles(normId, arabicSegments) };
  }

  // Dispositivos numerados o prosa sin estructura reconocida
  return { mode: "modifier", articles: buildArticles(normId, splitOnDispositivos(text)) };
}
