import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "cmf-mcp",
  version: "0.0.1",
  description: "Normativa CMF (Chile) — NCG, RAN, Compendio Seguros",
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`[cmf-mcp] fatal: ${String(error)}\n`);
  process.exit(1);
});
