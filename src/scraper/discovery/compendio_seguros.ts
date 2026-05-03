import * as cheerio from "cheerio";
import { request } from "undici";
import { EstadoVigencia, Sector, TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";

const INDEX_URL =
  "https://www.cmfchile.cl/institucional/mercados/publicaciones_compendionormas_seguros.php";
const PDF_WRAPPER = "https://www.cmfchile.cl/institucional/mercados/ver_archivo.php?archivo=";
const USER_AGENT = "cmf-mcp/0.1 (+https://github.com/gubaros/cmf-mcp)";

// Matches: ver_archivo.php?archivo=/web/compendio/...  (relative or absolute)
const RE_COMPENDIO_HREF = /ver_archivo\.php\?archivo=(\/web\/compendio\/[^"'\s&]+)/i;

// Libro roman numeral from link text or path: "libro i", "libro iii", "libro_iv"
const RE_LIBRO = /libro[_\s]+(i{1,3}|iv|vi{0,3}|ix|xi{0,2}|xii)/i;

// Título number from link text or path: "titulo 2", "titulo_3"
const RE_TITULO = /t[ií]tulo[_\s]+(\d+)/i;

function buildId(libro: string, titulo: string): string {
  return `cseg-${libro.toLowerCase()}-${titulo}`;
}

function buildPdfUrl(path: string): string {
  return `${PDF_WRAPPER}${path}`;
}

export function parseCompendioHtml(html: string): IndexEntry[] {
  const $ = cheerio.load(html);
  const entries: IndexEntry[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const pathMatch = RE_COMPENDIO_HREF.exec(href);
    if (!pathMatch) return;

    const compendioPath = pathMatch[1] ?? "";
    const text = $(el).text().trim();

    // Try extracting libro/titulo from link text first, then fallback to path
    const source = text || compendioPath;
    const libroMatch = RE_LIBRO.exec(source);
    const tituloMatch = RE_TITULO.exec(source);
    if (!libroMatch || !tituloMatch) return;

    const libro = libroMatch[1] ?? "";
    const titulo = tituloMatch[1] ?? "";
    const id = buildId(libro, titulo);

    if (seen.has(id)) return;
    seen.add(id);

    const titulo_text = text
      .replace(RE_LIBRO, "")
      .replace(RE_TITULO, "")
      .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
      .trim();

    entries.push({
      id,
      tipo: TipoNorma.COMPENDIO_SEG,
      numero: `${libro.toLowerCase()}-${titulo}`,
      titulo: titulo_text || text,
      sector: Sector.SEGUROS,
      fechaEmision: null,
      estado: EstadoVigencia.VIGENTE,
      urlPdf: buildPdfUrl(compendioPath),
      modifica: [],
      modificadaPor: [],
      deroga: [],
      derogadaPor: [],
    });
  });

  return entries;
}

export async function fetchCompendioSeguros(): Promise<IndexEntry[]> {
  const { body, statusCode } = await request(INDEX_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (statusCode !== 200) {
    await body.dump();
    throw new Error(`Compendio Seguros index returned HTTP ${statusCode}`);
  }

  const html = await body.text();
  return parseCompendioHtml(html);
}
