import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error no type declarations for internal path
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export type ParseResult = {
  text: string;
  pages: number;
  method: "native" | "ocr";
  nonPrintableRatio: number;
};

const MIN_USEFUL_CHARS = 500;
const OCR_DPI = 250;
const OCR_LANG = "spa";

function countNonPrintable(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (
      (c < 0x20 && c !== 9 && c !== 10 && c !== 13) ||
      (c >= 0x7f && c <= 0x9f) ||
      (c >= 0xd800 && c <= 0xdfff)
    )
      n++;
  }
  return n;
}

function nonPrintableRatio(text: string): number {
  if (!text.length) return 1;
  return countNonPrintable(text) / text.length;
}

async function extractNative(pdfBuf: Buffer): Promise<{ text: string; pages: number } | null> {
  try {
    const data = await pdfParse(pdfBuf);
    if (data.text.length >= MIN_USEFUL_CHARS && nonPrintableRatio(data.text) <= 0.05) {
      return { text: data.text, pages: data.numpages };
    }
    return null;
  } catch {
    return null;
  }
}

function extractOcr(pdfBuf: Buffer): { text: string; pages: number } {
  const workDir = join(tmpdir(), `cmf_ocr_${process.pid}_${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  try {
    const pdfPath = join(workDir, "input.pdf");
    writeFileSync(pdfPath, pdfBuf);

    execFileSync(
      "gs",
      [
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=bmp16m",
        `-r${OCR_DPI}`,
        `-sOutputFile=${join(workDir, "page_%03d.bmp")}`,
        pdfPath,
      ],
      { timeout: 120_000, stdio: "ignore" },
    );

    const pages = readdirSync(workDir)
      .filter((f) => f.startsWith("page_") && f.endsWith(".bmp"))
      .sort();

    let fullText = "";
    for (const page of pages) {
      const pagePath = join(workDir, page);
      const outBase = join(workDir, page.replace(".bmp", ""));
      execFileSync("tesseract", [pagePath, outBase, "-l", OCR_LANG, "--oem", "1"], {
        timeout: 60_000,
        stdio: "ignore",
      });
      try {
        fullText += `${readFileSync(`${outBase}.txt`, "utf8")}\n`;
      } catch {}
    }

    return { text: fullText, pages: pages.length };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function parsePdf(pdfBuf: Buffer): Promise<ParseResult> {
  const native = await extractNative(pdfBuf);
  if (native) {
    return {
      text: native.text,
      pages: native.pages,
      method: "native",
      nonPrintableRatio: nonPrintableRatio(native.text),
    };
  }

  const ocr = extractOcr(pdfBuf);
  return {
    text: ocr.text,
    pages: ocr.pages,
    method: "ocr",
    nonPrintableRatio: nonPrintableRatio(ocr.text),
  };
}
