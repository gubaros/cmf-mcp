import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCompendioHtml } from "../../../src/scraper/discovery/compendio_seguros";

const FIXTURE_DIR = resolve(__dirname, "../../fixtures/compendio_seguros");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf8");
}

describe("parseCompendioHtml", () => {
  it("extrae entradas del compendio de seguros", () => {
    const html = loadFixture("index.html");
    const entries = parseCompendioHtml(html);

    // 3 unique entries (duplicate deduplicated, non-compendio links skipped)
    expect(entries).toHaveLength(3);
  });

  it("construye ID y URL correctamente", () => {
    const html = loadFixture("index.html");
    const entries = parseCompendioHtml(html);

    const csi12 = entries.find((e) => e.id === "cseg-i-2");
    expect(csi12).toBeDefined();
    expect(csi12?.tipo).toBe("COMPENDIO_SEG");
    expect(csi12?.sector).toBe("SEGUROS");
    expect(csi12?.numero).toBe("i-2");
    expect(csi12?.urlPdf).toBe(
      "https://www.cmfchile.cl/institucional/mercados/ver_archivo.php?archivo=/web/compendio/libro_i/titulo_2_autorizacion.pdf",
    );
  });

  it("extrae título sin los prefijos libro/título", () => {
    const html = loadFixture("index.html");
    const entries = parseCompendioHtml(html);

    const csi1 = entries.find((e) => e.id === "cseg-i-1");
    expect(csi1?.titulo).toContain("Disposiciones Generales");
  });

  it("deduplica entradas con mismo ID", () => {
    const html = loadFixture("index.html");
    const entries = parseCompendioHtml(html);

    const dupes = entries.filter((e) => e.id === "cseg-i-1");
    expect(dupes).toHaveLength(1);
  });

  it("ignora links sin /web/compendio/ en el path", () => {
    const html = loadFixture("index.html");
    const entries = parseCompendioHtml(html);

    expect(entries.every((e) => e.urlPdf.includes("/web/compendio/"))).toBe(true);
  });

  it("fechaEmision es null", () => {
    const html = loadFixture("index.html");
    const entries = parseCompendioHtml(html);

    expect(entries[0]?.fechaEmision).toBeNull();
  });

  it("retorna vacío cuando no hay links de compendio", () => {
    const html = "<html><body><a href='pagina.php'>Sin compendio</a></body></html>";
    const entries = parseCompendioHtml(html);
    expect(entries).toHaveLength(0);
  });
});
