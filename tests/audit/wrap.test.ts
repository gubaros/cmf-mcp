import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/audit/logger", () => ({
  writeAuditEntry: vi.fn(),
}));

import { writeAuditEntry } from "../../src/audit/logger";
import { withAudit } from "../../src/audit/wrap";

const mockWrite = vi.mocked(writeAuditEntry);

beforeEach(() => {
  mockWrite.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withAudit", () => {
  it("emite entrada OK en éxito con tool, requestId y latencyMs", async () => {
    const handler = vi.fn().mockResolvedValue({ data: "ok" });
    const wrapped = withAudit("test_tool", handler);

    await wrapped({ id: "ncg-1" });

    expect(mockWrite).toHaveBeenCalledOnce();
    const entry = mockWrite.mock.calls[0]?.[0];
    expect(entry?.tool).toBe("test_tool");
    expect(entry?.result).toBe("OK");
    expect(typeof entry?.requestId).toBe("string");
    expect(entry?.requestId).toHaveLength(36);
    expect(typeof entry?.latencyMs).toBe("number");
    expect(entry?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("emite entrada ERROR y re-lanza el error", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("norma no encontrada"));
    const wrapped = withAudit("get_norm", handler);

    await expect(wrapped({ normId: "ncg-999" })).rejects.toThrow("norma no encontrada");

    expect(mockWrite).toHaveBeenCalledOnce();
    const entry = mockWrite.mock.calls[0]?.[0];
    expect(entry?.result).toMatch(/^ERROR:/);
    expect(entry?.result).toContain("norma no encontrada");
  });

  it("usa el extractor para poblar normIds y articleIds", async () => {
    const handler = vi.fn().mockResolvedValue({
      norms: ["ncg-461", "ncg-385"],
      articles: ["ncg-461-art-1"],
      urls: ["https://cmf.cl/ncg461.pdf"],
    });
    const wrapped = withAudit("list_norms", handler, (r) => ({
      normIds: r.norms,
      articleIds: r.articles,
      urlsOficiales: r.urls,
    }));

    await wrapped({});

    const entry = mockWrite.mock.calls[0]?.[0];
    expect(entry?.normIds).toEqual(["ncg-461", "ncg-385"]);
    expect(entry?.articleIds).toEqual(["ncg-461-art-1"]);
    expect(entry?.urlsOficiales).toEqual(["https://cmf.cl/ncg461.pdf"]);
  });

  it("trunca el input a 1000 caracteres", async () => {
    const handler = vi.fn().mockResolvedValue(null);
    const wrapped = withAudit("search_articles", handler);
    const longInput = { query: "x".repeat(2000) };

    await wrapped(longInput);

    const entry = mockWrite.mock.calls[0]?.[0];
    expect(entry?.input.length).toBeLessThanOrEqual(1000);
  });
});
