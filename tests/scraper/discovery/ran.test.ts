import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRanPortalHtml } from "../../../src/scraper/discovery/ran";

const FIXTURE_DIR = resolve(__dirname, "../../fixtures/ran");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf8");
}

describe("parseRanPortalHtml", () => {
  it("extrae capítulos RAN del índice del portal", () => {
    const html = loadFixture("portal_index.html");
    const entries = parseRanPortalHtml(html);

    // 3 unique entries (duplicate deduplicated, non-article links skipped)
    expect(entries).toHaveLength(3);
  });

  it("construye ID y URL correctamente", () => {
    const html = loadFixture("portal_index.html");
    const entries = parseRanPortalHtml(html);

    const ran117 = entries.find((e) => e.id === "ran-11-7");
    expect(ran117).toBeDefined();
    expect(ran117?.tipo).toBe("RAN");
    expect(ran117?.sector).toBe("BANCARIO");
    expect(ran117?.numero).toBe("11-7");
    expect(ran117?.urlPdf).toBe(
      "https://www.cmfchile.cl/portal/principal/613/articles-28952_doc_pdf.pdf",
    );
  });

  it("extrae título sin el prefijo cap-seccion", () => {
    const html = loadFixture("portal_index.html");
    const entries = parseRanPortalHtml(html);

    const ran117 = entries.find((e) => e.id === "ran-11-7");
    expect(ran117?.titulo).toBe("Contratos de cobertura de riesgo financiero");
  });

  it("acepta hrefs absolutos con path /portal/principal/613/", () => {
    const html = loadFixture("portal_index.html");
    const entries = parseRanPortalHtml(html);

    const ran21 = entries.find((e) => e.id === "ran-2-1");
    expect(ran21).toBeDefined();
    expect(ran21?.urlPdf).toBe(
      "https://www.cmfchile.cl/portal/principal/613/articles-99999_doc_pdf.pdf",
    );
  });

  it("deduplica entradas con mismo ID", () => {
    const html = loadFixture("portal_index.html");
    const entries = parseRanPortalHtml(html);

    const ran117s = entries.filter((e) => e.id === "ran-11-7");
    expect(ran117s).toHaveLength(1);
  });

  it("fechaEmision es null (no disponible en el índice)", () => {
    const html = loadFixture("portal_index.html");
    const entries = parseRanPortalHtml(html);

    expect(entries[0]?.fechaEmision).toBeNull();
  });

  it("retorna vacío cuando no hay links de artículos", () => {
    const html = "<html><body><a href='w3-propertyvalue-1.html'>Índice</a></body></html>";
    const entries = parseRanPortalHtml(html);
    expect(entries).toHaveLength(0);
  });
});
