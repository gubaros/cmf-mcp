import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { withAudit } from "./audit/wrap";
import { serverInfoHandler } from "./tools/serverInfo";

const server = new McpServer({
  name: "cmf-mcp",
  version: "0.0.1",
  description: "Normativa CMF (Chile) — NCG, RAN, Compendio Seguros",
});

server.registerTool(
  "server_info",
  {
    description:
      "Retorna versión del servidor, fecha del último scrape, total de normas por sector y normas validadas. No requiere argumentos.",
    inputSchema: {},
  },
  async (input) => {
    const data = await withAudit("server_info", serverInfoHandler)(input as Record<string, never>);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`[cmf-mcp] fatal: ${String(error)}\n`);
  process.exit(1);
});
