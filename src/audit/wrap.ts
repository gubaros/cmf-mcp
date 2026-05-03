import { randomUUID } from "node:crypto";
import { writeAuditEntry } from "./logger";

type AuditInfo = {
  normIds?: string[];
  articleIds?: string[];
  urlsOficiales?: string[];
};

export function withAudit<I, O>(
  toolName: string,
  handler: (input: I) => Promise<O>,
  extract?: (result: O) => AuditInfo,
): (input: I) => Promise<O> {
  return async (input: I): Promise<O> => {
    const requestId = randomUUID();
    const startMs = Date.now();
    const inputStr = JSON.stringify(input).slice(0, 1000);

    try {
      const result = await handler(input);
      const info = extract?.(result) ?? {};
      writeAuditEntry({
        timestamp: new Date().toISOString(),
        requestId,
        tool: toolName,
        input: inputStr,
        normIds: info.normIds ?? [],
        articleIds: info.articleIds ?? [],
        urlsOficiales: info.urlsOficiales ?? [],
        latencyMs: Date.now() - startMs,
        result: "OK",
        corpusVersion: null,
      });
      return result;
    } catch (err) {
      const code = err instanceof Error ? err.message.slice(0, 64) : "UNKNOWN";
      writeAuditEntry({
        timestamp: new Date().toISOString(),
        requestId,
        tool: toolName,
        input: inputStr,
        normIds: [],
        articleIds: [],
        urlsOficiales: [],
        latencyMs: Date.now() - startMs,
        result: `ERROR:${code}`,
        corpusVersion: null,
      });
      throw err;
    }
  };
}
