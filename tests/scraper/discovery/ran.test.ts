import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchRanFromSeed, parseRanPortalHtml } from "../../../src/scraper/discovery/ran";

const SEED_PATH = resolve(__dirname, "../../../src/scraper/discovery/ran_seed.json");
const FIXTURE_DIR = resolve(__dirname, "../../fixtures/ran");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf8");
}

describe("fetchRanFromSeed", () => {
  it("carga los 98 capítulos del seed real", () => {
    const entries = fetchRanFromSeed(SEED_PATH);
    expect(entries.length).toBeGreaterThanOrEqual(90);
  });

  it("construye ID, URL y campos correctamente", () => {
    const entries = fetchRanFromSeed(SEED_PATH);
    const ran11 = entries.find((e) => e.id === "ran-1-1");
    expect(ran11).toBeDefined();
    expect(ran11?.tipo).toBe("RAN");
    expect(ran11?.sector).toBe("BANCARIO");
    expect(ran11?.urlPdf).toBe(
      "https://www.cmfchile.cl/portal/principal/613/articles-28888_doc_pdf.pdf",
    );
    expect(ran11?.titulo).toBeTruthy();
    expect(ran11?.fechaEmision).toBeNull();
  });

  it("lanza error si el seed tiene menos de 90 capítulos", () => {
    const tinyPath = resolve(FIXTURE_DIR, "ran_seed_tiny.json");
    expect(() => fetchRanFromSeed(tinyPath)).toThrow(/minimum/);
  });
});

describe("parseRanPortalHtml", () => {
  it("extrae capítulos desde HTML del portal real (fixture)", () => {
    const html = loadFixture("portal_ran_snippet.html");
    const chapters = parseRanPortalHtml(html);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  it("construye IDs y extrae título correctamente", () => {
    const html = loadFixture("portal_ran_snippet.html");
    const chapters = parseRanPortalHtml(html);
    const c11 = chapters.find((c) => c.id === "ran-1-1");
    expect(c11).toBeDefined();
    expect(c11?.articleId).toBe("28888");
    expect(c11?.titulo).toContain("sociedades anónimas");
  });

  it("deduplica entradas con mismo id+articleId", () => {
    const html = loadFixture("portal_ran_snippet.html");
    const chapters = parseRanPortalHtml(html);
    const ids = chapters.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("retorna vacío en HTML sin capítulos RAN", () => {
    const chapters = parseRanPortalHtml("<html><body>Sin contenido</body></html>");
    expect(chapters).toHaveLength(0);
  });
});
