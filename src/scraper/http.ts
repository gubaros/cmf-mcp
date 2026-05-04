import { Agent } from "undici";

export const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
};

export const CMF_DISPATCHER = new Agent({ connect: { timeout: 30_000 } });

// Random delay between min and max ms — breaks request bursts that look like scripts
export function jitter(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

const RETRYABLE = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"]);

// Retry wrapper for discovery HTTP calls (3 attempts, exponential backoff 2s/4s)
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!RETRYABLE.has(code)) throw err;
      await jitter(2_000 * 2 ** i, 3_000 * 2 ** i);
    }
  }
  throw lastErr;
}
