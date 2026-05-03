import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type AuditEntry = {
  timestamp: string;
  requestId: string;
  tool: string;
  input: string;
  normIds: string[];
  articleIds: string[];
  urlsOficiales: string[];
  latencyMs: number;
  result: string;
  corpusVersion: string | null;
};

const LOG_DIR = process.env.CMF_LOG_DIR ?? "data/logs";
const IS_DEV = process.env.NODE_ENV !== "production";

function todayFile(): string {
  return join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
}

export function writeAuditEntry(entry: AuditEntry): void {
  const line = `${JSON.stringify(entry)}\n`;
  if (IS_DEV) {
    process.stderr.write(line);
    return;
  }
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(todayFile(), line, "utf8");
  process.stderr.write(line);
}
