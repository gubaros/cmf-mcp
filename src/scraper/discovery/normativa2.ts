import * as cheerio from "cheerio";
import { request } from "undici";
import { EstadoVigencia, Sector, TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";

const BASE_URL = "https://www.cmfchile.cl/institucional/legislacion_normativa/normativa2.php";
const USER_AGENT = "cmf-mcp/0.1 (+https://github.com/gubaros/cmf-mcp)";

export type TipoForm = "NCG" | "CIR" | "OFC";
export type Mercado = "V" | "S";

// Column indices in the normativa2.php results table
const COL = {
  TIPO: 0,
  NUMERO: 1,
  FECHA: 2,
  TITULO: 3,
  MODIFICA: 7,
  MODIFICADA_POR: 8,
  DEROGA: 9,
  DEROGADA_POR: 10,
  VIGENCIA: 11,
} as const;

function buildId(tipo: TipoForm, numero: string): string {
  const prefix = tipo === "NCG" ? "ncg" : tipo === "CIR" ? "circ" : "ofc";
  return `${prefix}-${numero}`;
}

function buildPdfUrl(tipo: TipoForm, numero: string, year: string): string {
  const prefix = tipo === "NCG" ? "ncg" : tipo === "CIR" ? "cir" : "ofc";
  return `https://www.cmfchile.cl/normativa/${prefix}_${numero}_${year}.pdf`;
}

function parseFecha(raw: string): { iso: string; year: string } | null {
  // DD-MM-YYYY (format used by CMF)
  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return { iso: `${yyyy}-${mm}-${dd}`, year: yyyy ?? "" };
  }
  // ISO fallback
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (isoMatch) {
    return { iso: raw.trim(), year: isoMatch[1] ?? "" };
  }
  return null;
}

function parseEstado(raw: string): EstadoVigencia {
  const v = raw.trim().toUpperCase();
  if (v.includes("DEROG")) return EstadoVigencia.DEROGADA;
  if (v.includes("MODIF")) return EstadoVigencia.MODIFICADA;
  if (v.includes("SUSPENDID")) return EstadoVigencia.SUSPENDIDA;
  return EstadoVigencia.VIGENTE;
}

function parseNormRefs(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of raw.matchAll(/\b(NCG|CIR|OFC)\s*N[°º]?\s*(\d+)/gi)) {
    const tipoRaw = m[1]?.toUpperCase() ?? "";
    const num = m[2] ?? "";
    const prefix = tipoRaw === "NCG" ? "ncg" : tipoRaw === "CIR" ? "circ" : "ofc";
    const id = `${prefix}-${num}`;
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export function parseNormativa2Html(
  html: string,
  tiponorma: TipoForm,
  mercado: Mercado,
): IndexEntry[] {
  const $ = cheerio.load(html);
  const entries: IndexEntry[] = [];
  const sector = mercado === "V" ? Sector.VALORES : Sector.SEGUROS;
  const tipoEnum =
    tiponorma === "NCG"
      ? TipoNorma.NCG
      : tiponorma === "CIR"
        ? TipoNorma.CIRCULAR
        : TipoNorma.OFICIO_CIRC;

  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < COL.VIGENCIA + 1) return;

    const numero = cells.eq(COL.NUMERO).text().trim();
    const fechaRaw = cells.eq(COL.FECHA).text().trim();
    const titulo = cells.eq(COL.TITULO).text().trim();

    if (!numero || !fechaRaw) return;

    const fecha = parseFecha(fechaRaw);
    if (!fecha) return;

    entries.push({
      id: buildId(tiponorma, numero),
      tipo: tipoEnum,
      numero,
      titulo,
      sector,
      fechaEmision: fecha.iso,
      estado: parseEstado(cells.eq(COL.VIGENCIA).text()),
      urlPdf: buildPdfUrl(tiponorma, numero, fecha.year),
      modifica: parseNormRefs(cells.eq(COL.MODIFICA).text()),
      modificadaPor: parseNormRefs(cells.eq(COL.MODIFICADA_POR).text()),
      deroga: parseNormRefs(cells.eq(COL.DEROGA).text()),
      derogadaPor: parseNormRefs(cells.eq(COL.DEROGADA_POR).text()),
    });
  });

  return entries;
}

export async function fetchNormativa2(
  tiponorma: TipoForm,
  mercado: Mercado,
): Promise<IndexEntry[]> {
  const params = new URLSearchParams({
    tiponorma,
    numero: "",
    dd: "",
    mm: "",
    aa: "",
    dd2: "",
    mm2: "",
    aa2: "",
    entidad_web: "ALL",
    materia: "ALL",
    hidden_mercado: mercado,
    enviado: "1",
  });

  const { body, statusCode } = await request(`${BASE_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (statusCode !== 200) {
    await body.dump();
    throw new Error(`normativa2.php returned HTTP ${statusCode}`);
  }

  const html = await body.text();
  return parseNormativa2Html(html, tiponorma, mercado);
}
