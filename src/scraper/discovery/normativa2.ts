import * as cheerio from "cheerio";
import { request } from "undici";
import { EstadoVigencia, Sector, TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";
import { BROWSER_HEADERS, CMF_DISPATCHER, withRetry } from "../http";

const BASE_URL = "https://www.cmfchile.cl/institucional/legislacion_normativa/normativa2.php";

export type TipoForm = "NCG" | "CIR" | "OFC";
export type Mercado = "V" | "S" | "B";

// Column indices in the normativa2.php results table (18 columns total):
// 0=Tipo 1=Número 2=Fecha 3=Título 4=TextoRefundido 5=InformeNormativo
// 6-8=Resolución(Nro,Fecha,Referencia) 9-10=ModificaA(Nro,Fecha)
// 11-12=ModificadaPor(Nro,Fecha) 13-14=DerogaA(Nro,Fecha)
// 15-16=DerogadaPor(Nro,Fecha) 17=Vigencia
const COL = {
  TIPO: 0,
  NUMERO: 1,
  FECHA: 2,
  TITULO: 3,
  MODIFICA: 9,
  MODIFICADA_POR: 11,
  DEROGA: 13,
  DEROGADA_POR: 15,
  VIGENCIA: 17,
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
  const s = raw.trim();
  // DD/MM/YYYY or DD-MM-YYYY (both used by CMF)
  const ddmmyyyy = /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/.exec(s);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return { iso: `${yyyy}-${mm}-${dd}`, year: yyyy ?? "" };
  }
  // ISO fallback
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (isoMatch) {
    return { iso: s, year: isoMatch[1] ?? "" };
  }
  return null;
}

function parseEstado(vigenciaRaw: string): EstadoVigencia {
  // normativa2.php encodes non-vigente norms as "NoVigente"; empty = VIGENTE
  return vigenciaRaw.trim() === "NoVigente" ? EstadoVigencia.DEROGADA : EstadoVigencia.VIGENTE;
}

// Parses norm references from a table cell. The real CMF HTML contains plain
// numbers (e.g. "550") without type prefix. We default to same type as the
// parent norm; cross-type references will appear as "desaparecidas" in the index.
function parseNormRefs(raw: string, defaultTipo: TipoForm): string[] {
  const defaultPrefix = defaultTipo === "NCG" ? "ncg" : defaultTipo === "CIR" ? "circ" : "ofc";
  const seen = new Set<string>();
  const result: string[] = [];

  // Explicit "TYPE N°num" pattern (tests/fixtures may use this form)
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

  // Plain numbers (actual CMF format): only use if no typed refs were found
  if (result.length === 0) {
    for (const m of raw.matchAll(/\b(\d{1,5})\b/g)) {
      const num = m[1] ?? "";
      const id = `${defaultPrefix}-${num}`;
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
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
  const sector =
    mercado === "V" ? Sector.VALORES : mercado === "S" ? Sector.SEGUROS : Sector.BANCARIO;
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
      modifica: parseNormRefs(cells.eq(COL.MODIFICA).text(), tiponorma),
      modificadaPor: parseNormRefs(cells.eq(COL.MODIFICADA_POR).text(), tiponorma),
      deroga: parseNormRefs(cells.eq(COL.DEROGA).text(), tiponorma),
      derogadaPor: parseNormRefs(cells.eq(COL.DEROGADA_POR).text(), tiponorma),
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

  return withRetry(async () => {
    const { body, statusCode } = await request(`${BASE_URL}?${params}`, {
      headers: {
        ...BROWSER_HEADERS,
        Referer: "https://www.cmfchile.cl/institucional/legislacion_normativa/normativa2.php",
      },
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
      dispatcher: CMF_DISPATCHER,
    });

    if (statusCode !== 200) {
      await body.dump();
      throw new Error(`normativa2.php returned HTTP ${statusCode}`);
    }

    const html = await body.text();
    const entries = parseNormativa2Html(html, tiponorma, mercado);
    if (entries.length === 0) {
      console.warn(
        `[normativa2] ${tiponorma}/${mercado}: 0 entradas (${html.length} bytes). ` +
          `Primeros 200 chars: ${html.slice(0, 200).replace(/\s+/g, " ")}`,
      );
    }
    return entries;
  });
}
