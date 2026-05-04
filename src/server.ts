import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { withAudit } from "./audit/wrap";
import { getArticleHandler } from "./tools/getArticle";
import { getNormHandler } from "./tools/getNorm";
import { listNormsHandler } from "./tools/listNorms";
import { searchArticlesHandler } from "./tools/searchArticles";
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

server.registerTool(
  "list_norms",
  {
    description:
      "Lista normas CMF con filtros opcionales. Por defecto retorna VIGENTES. Parámetros: tipo (NCG|CIRCULAR|OFICIO_CIRC|RAN|COMPENDIO_SEG), sector (VALORES|SEGUROS|BANCARIO), estado (VIGENTE|DEROGADA), limit (máx 200), offset.",
    inputSchema: {
      tipo: z.string().optional(),
      sector: z.string().optional(),
      estado: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
  },
  async (input) => {
    const data = await withAudit("list_norms", listNormsHandler, (r) => ({
      urlsOficiales: r.items.map((i) => i.urlOficial),
    }))(input);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.registerTool(
  "get_norm",
  {
    description:
      "Obtiene una norma por su ID (ej: ncg-461, ran-1-13). Incluye artículos si includeArticles=true.",
    inputSchema: {
      id: z.string(),
      includeArticles: z.boolean().optional(),
    },
  },
  async (input) => {
    const data = await withAudit("get_norm", getNormHandler, (r) => ({
      normIds: [r.id],
      urlsOficiales: [r.urlOficial],
    }))(input);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.registerTool(
  "get_article",
  {
    description:
      "Obtiene el texto de un artículo por su ID (ej: ncg-461-art-12). Incluye urlOficial de la norma padre.",
    inputSchema: {
      id: z.string(),
    },
  },
  async (input) => {
    const data = await withAudit("get_article", getArticleHandler, (r) => ({
      articleIds: [r.id],
      normIds: [r.normId],
      urlsOficiales: [r.urlOficial],
    }))(input);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
);

server.registerTool(
  "search_articles",
  {
    description:
      "Búsqueda full-text (FTS5) sobre artículos de normas CMF. Retorna snippets con contexto. Parámetros: q (requerido), sector, estado (default VIGENTE), limit (máx 50).",
    inputSchema: {
      q: z.string(),
      sector: z.string().optional(),
      estado: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  async (input) => {
    const data = await withAudit("search_articles", searchArticlesHandler, (r) => ({
      articleIds: r.items.map((i) => i.articleId),
      normIds: r.items.map((i) => i.normId),
      urlsOficiales: r.items.map((i) => i.urlOficial),
    }))(input);
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
