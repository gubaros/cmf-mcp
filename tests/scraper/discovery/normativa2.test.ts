import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNormativa2Html } from "../../../src/scraper/discovery/normativa2";

const FIXTURE_DIR = resolve(__dirname, "../../fixtures/normativa2");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf8");
}

describe("parseNormativa2Html", () => {
  it("parsea filas NCG correctamente", () => {
    const html = loadFixture("ncg_valores.html");
    const entries = parseNormativa2Html(html, "NCG", "V");

    expect(entries).toHaveLength(3);

    const ncg461 = entries.find((e) => e.numero === "461");
    expect(ncg461).toBeDefined();
    expect(ncg461?.id).toBe("ncg-461");
    expect(ncg461?.tipo).toBe("NCG");
    expect(ncg461?.sector).toBe("VALORES");
    expect(ncg461?.fechaEmision).toBe("2021-01-15");
    expect(ncg461?.estado).toBe("VIGENTE");
    expect(ncg461?.urlPdf).toBe("https://www.cmfchile.cl/normativa/ncg_461_2021.pdf");
    expect(ncg461?.modifica).toEqual(["ncg-461"]);
    expect(ncg461?.modificadaPor).toEqual([]);
  });

  it("mapea NoVigente correctamente", () => {
    const html = loadFixture("ncg_valores.html");
    const entries = parseNormativa2Html(html, "NCG", "V");

    const ncg221 = entries.find((e) => e.numero === "221");
    expect(ncg221?.estado).toBe("DEROGADA");
    expect(ncg221?.modificadaPor).toEqual(["ncg-461"]);
  });

  it("sector SEGUROS para mercado S", () => {
    const html = loadFixture("ncg_valores.html");
    const entries = parseNormativa2Html(html, "NCG", "S");

    expect(entries[0]?.sector).toBe("SEGUROS");
  });

  it("sector BANCARIO para mercado B", () => {
    const html = loadFixture("ncg_valores.html");
    const entries = parseNormativa2Html(html, "NCG", "B");

    expect(entries[0]?.sector).toBe("BANCARIO");
  });

  it("retorna vacío con tabla sin filas de datos", () => {
    const html = `<html><body><table><tr>${Array(18).fill("<th>X</th>").join("")}</tr></table></body></html>`;
    const entries = parseNormativa2Html(html, "NCG", "V");
    expect(entries).toHaveLength(0);
  });

  it("omite filas con número o fecha vacíos", () => {
    // Row 1: no number; Row 2: no date — both should be skipped
    const empties = (n: number) => Array(n).fill("<td></td>").join("");
    const html = `<html><body><table>
      <tr><td></td><td></td><td>01/01/2024</td><td>Titulo</td>${empties(14)}</tr>
      <tr><td>NCG</td><td>100</td><td></td><td>Titulo</td>${empties(14)}</tr>
    </table></body></html>`;
    const entries = parseNormativa2Html(html, "NCG", "V");
    expect(entries).toHaveLength(0);
  });

  it("extrae múltiples referencias en columna modifica (números planos)", () => {
    // Columns 0-17, with Modifica (col 9) = "100\n200"
    const empties = (n: number) => Array(n).fill("<td></td>").join("");
    const html = `<html><body><table>
      <tr><td>NCG</td><td>400</td><td>10/03/2020</td><td>Norma multi</td>${empties(5)}<td>100
200</td>${empties(8)}</tr>
    </table></body></html>`;
    const entries = parseNormativa2Html(html, "NCG", "V");
    expect(entries[0]?.modifica).toEqual(["ncg-100", "ncg-200"]);
  });
});
