import { readFileSync } from "node:fs";
import { parsePdf } from "../src/scraper/parsers/pdf";
import { segmentNorm } from "../src/scraper/segmenter";

function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main() {
  for (const id of ["ran-21-13", "ran-12-3", "ran-12-4"]) {
    const buf = readFileSync(`data/raw/${id}/2026-05-04.pdf`);
    const parsed = await parsePdf(buf);
    const text = normalize(parsed.text);
    const { articles } = segmentNorm(id, text);
    console.log(`\n=== ${id} (${articles.length} arts) ===`);
    for (const a of articles) {
      console.log(
        `  art-${a.numero}  [${a.texto.length}c]  "${(a.rubrica ?? "(null)").slice(0, 70)}"`,
      );
    }
  }
}
main().catch(console.error);
