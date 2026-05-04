import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("undici", () => ({
  request: vi.fn(),
}));

vi.mock("../../src/scraper/discovery/ran", () => ({
  fetchRanFromSeed: vi.fn(),
}));

import { request } from "undici";
import { fetchRanFromSeed } from "../../src/scraper/discovery/ran";
import { downloadAll, downloadRanBulk } from "../../src/scraper/downloader";
import { EstadoVigencia, Sector, TipoNorma } from "../../src/shared/enums";
import type { IndexEntry } from "../../src/shared/types";

const mockRequest = vi.mocked(request);
const mockFetchRanFromSeed = vi.mocked(fetchRanFromSeed);

beforeEach(() => {
  mockRequest.mockReset();
  mockFetchRanFromSeed.mockReset();
});

function makeEntry(id: string, urlPdf: string): IndexEntry {
  return {
    id,
    tipo: TipoNorma.RAN,
    numero: "1-1",
    titulo: "Test",
    sector: Sector.BANCARIO,
    fechaEmision: null,
    estado: EstadoVigencia.VIGENTE,
    urlPdf,
    modifica: [],
    modificadaPor: [],
    deroga: [],
    derogadaPor: [],
  };
}

function okResponse(content = "PDF-CONTENT"): ReturnType<typeof request> {
  return Promise.resolve({
    statusCode: 200,
    headers: { "last-modified": "Mon, 04 May 2026 00:00:00 GMT" },
    body: {
      arrayBuffer: () => Promise.resolve(Buffer.from(content).buffer),
      dump: () => Promise.resolve(),
    },
  }) as unknown as ReturnType<typeof request>;
}

function notModifiedResponse(): ReturnType<typeof request> {
  return Promise.resolve({
    statusCode: 304,
    headers: {},
    body: { dump: () => Promise.resolve() },
  }) as unknown as ReturnType<typeof request>;
}

function errorResponse(status: number): ReturnType<typeof request> {
  return Promise.resolve({
    statusCode: status,
    headers: {},
    body: { dump: () => Promise.resolve() },
  }) as unknown as ReturnType<typeof request>;
}

describe("downloadAll", () => {
  it("descarga una entrada y retorna status ok", async () => {
    mockRequest.mockReturnValue(okResponse());
    const entries = [makeEntry("ncg-461", "https://example.com/ncg-461.pdf")];
    const results = await downloadAll(entries);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("ok");
    expect(results[0]?.id).toBe("ncg-461");
    expect(results[0]?.path).toBeTruthy();
  });

  it("retorna status error después de agotar reintentos", async () => {
    // real timers — retry backoff is 2s+4s=6s total; allow 15s
    mockRequest.mockReturnValue(errorResponse(503));
    const entries = [makeEntry("ncg-999", "https://example.com/ncg-999.pdf")];
    const results = await downloadAll(entries);
    expect(results[0]?.status).toBe("error");
    expect(results[0]?.error).toContain("503");
    expect(mockRequest).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("retorna not-modified si el servidor responde 304", async () => {
    mockRequest.mockReturnValue(okResponse());
    const entries = [makeEntry("ncg-304-test", "https://example.com/ncg-304.pdf")];
    await downloadAll(entries);
    mockRequest.mockClear();
    mockRequest.mockReturnValue(notModifiedResponse());
    const results = await downloadAll(entries);
    expect(results[0]?.status).toBe("not-modified");
  });

  it("incluye If-Modified-Since en segunda petición si se guardó", async () => {
    mockRequest.mockReturnValue(okResponse());
    const entries = [makeEntry("ncg-lm-test", "https://example.com/ncg-lm.pdf")];
    await downloadAll(entries);
    mockRequest.mockClear();
    mockRequest.mockReturnValue(okResponse());
    await downloadAll(entries);
    const callHeaders = mockRequest.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(callHeaders?.["If-Modified-Since"]).toBeTruthy();
  });
});

describe("downloadRanBulk", () => {
  it("descarga todas las entradas del seed RAN", async () => {
    const ranEntries = [
      makeEntry(
        "ran-1-1",
        "https://www.cmfchile.cl/portal/principal/613/articles-28888_doc_pdf.pdf",
      ),
      makeEntry(
        "ran-1-3",
        "https://www.cmfchile.cl/portal/principal/613/articles-28889_doc_pdf.pdf",
      ),
    ];
    mockFetchRanFromSeed.mockReturnValue(ranEntries);
    mockRequest.mockReturnValue(okResponse());
    const results = await downloadRanBulk();
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });
});
