import * as cheerio from "cheerio";
import { request } from "undici";
import { EstadoVigencia, Sector, TipoNorma } from "../../shared/enums";
import type { IndexEntry } from "../../shared/types";

const PORTAL_INDEX = "https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-28192.html";
const PDF_BASE = "https://www.cmfchile.cl/portal/principal/613/";
const USER_AGENT = "cmf-mcp/0.1 (+https://github.com/gubaros/cmf-mcp)";

// Extracts numeric article ID from hrefs like "w3-article-28952.html"
const RE_ARTICLE_HREF = /w3-article-(\d+)\.html/i;

// Extracts "cap-seccion" like "11-7" or "1-13" from link text
const RE_CAP_SECCION = /(\d+)-(\d+)/;

function buildPdfUrl(articleId: string): string {
  return `${PDF_BASE}articles-${articleId}_doc_pdf.pdf`;
}

export function parseRanPortalHtml(html: string): IndexEntry[] {
  const $ = cheerio.load(html);
  const entries: IndexEntry[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const articleMatch = RE_ARTICLE_HREF.exec(href);
    if (!articleMatch) return;

    const articleId = articleMatch[1] ?? "";
    const text = $(el).text().trim();
    const capMatch = RE_CAP_SECCION.exec(text);
    if (!capMatch) return;

    const cap = capMatch[1] ?? "";
    const seccion = capMatch[2] ?? "";
    const id = `ran-${cap}-${seccion}`;

    if (seen.has(id)) return;
    seen.add(id);

    const titulo =
      text
        .slice((capMatch.index ?? 0) + capMatch[0].length)
        .replace(/^[\s\-–—:]+/, "")
        .trim() || text;

    entries.push({
      id,
      tipo: TipoNorma.RAN,
      numero: `${cap}-${seccion}`,
      titulo,
      sector: Sector.BANCARIO,
      fechaEmision: null,
      estado: EstadoVigencia.VIGENTE,
      urlPdf: buildPdfUrl(articleId),
      modifica: [],
      modificadaPor: [],
      deroga: [],
      derogadaPor: [],
    });
  });

  return entries;
}

export async function fetchRan(): Promise<IndexEntry[]> {
  const { body, statusCode } = await request(PORTAL_INDEX, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (statusCode !== 200) {
    await body.dump();
    throw new Error(`RAN portal returned HTTP ${statusCode}`);
  }

  const html = await body.text();
  return parseRanPortalHtml(html);
}
