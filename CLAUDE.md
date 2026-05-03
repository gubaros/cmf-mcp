# CMF MCP Server

> Servidor MCP que expone normativa de la CMF (Chile) — NCG, RAN, Compendio Seguros — a clientes MCP (Claude Desktop, Cursor, Claude API con MCP).
> Producto **gratuito y open-source**. No genera opinión legal: es capa de recuperación auditada. La interpretación queda en el modelo cliente y el usuario.

## Estado actual

- Commit inicial. Solo existe `README.md`. El código aún no se escribió.
- Documentación de diseño en `DEVELOPER.md`, `SCRAPER.md`, `COMPLIANCE_ANALYST.md`, `LEGAL_VALIDATOR.md`.
- El scraper vive en un repo separado (`cmf-scrapper`). El MCP **no scrapea en runtime** — solo lee SQLite.

## Stack (decidido — ver [DEVELOPER.md](DEVELOPER.md) §2)

- TypeScript 5.x / Node 20 LTS
- `@modelcontextprotocol/sdk` (transporte stdio)
- SQLite + FTS5 vía `better-sqlite3`
- `drizzle-orm` + `drizzle-kit`
- `zod` para input schemas de tools
- `pdfjs-dist` (parsing PDF), `cheerio` (HTML)
- `vitest`, `biome`, `tsup`, `pnpm`

No se usa: Postgres, Docker en MVP, Elasticsearch, frameworks web, Express.

## Estructura planeada (ver [DEVELOPER.md](DEVELOPER.md) §3)

```
src/
├── server.ts          # entry MCP stdio
├── tools/             # un archivo + schema zod por tool
├── db/                # schema drizzle, client, queries, migrations
├── ingest/            # carga del output del scraper
└── shared/            # enums, types, citations
data/cmf_norms.db      # NO se commitea — distribuida vía GitHub Release
```

## Tools MCP que expondrá

`list_norms`, `get_norm`, `get_article`, `search_articles`, `compare_articles`, `get_relations`, `server_info`.

## Convención de IDs (predecible para que el agente no adivine)

- NCG: `ncg-{numero}` → `ncg-461`
- Circular: `circ-{numero}` → `circ-2238`
- RAN: `ran-{cap}-{seccion}` → `ran-1-13`
- Compendio Seguros: `cseg-{libro}-{titulo}` → `cseg-iii-2`
- Artículo: `{normId}-art-{numero}` → `ncg-461-art-12`

## Reglas de oro (NO romper — ver [DEVELOPER.md](DEVELOPER.md) §9)

1. **Nunca citar una norma sin `urlOficial`.** Toda respuesta auditable hasta CMF.
2. **No inventar IDs.** Si el agente pide algo que no está en DB, error explícito — no "mejor coincidencia".
3. **`estado=VIGENTE` es default en búsquedas.** Para devolver derogadas hay que pedirlo explícito.
4. **No hay endpoint de interpretación.** El MCP entrega texto y metadata.
5. **Scraper y MCP nunca corren en el mismo proceso.**
6. **Toda norma servida debe tener entrada en `validation_log`** (en release público; en `dev` se puede saltar).
7. **Cada cambio de schema → migración Drizzle.** Sin SQL manual sobre la DB distribuida.

## Cómo correr (cuando exista código)

```bash
pnpm install
cp /path/to/cmf_norms.db data/    # release distribuido aparte
pnpm typecheck && pnpm lint && pnpm test
pnpm start                         # stdio MCP server
```

## Documentación canónica por rol

- Desarrollador → [DEVELOPER.md](DEVELOPER.md)
- Scraper      → [SCRAPER.md](SCRAPER.md)
- Compliance   → [COMPLIANCE_ANALYST.md](COMPLIANCE_ANALYST.md)
- Validador legal → [LEGAL_VALIDATOR.md](LEGAL_VALIDATOR.md)

## Lo que NO entra en este repo

- El código del scraper (vive en `cmf-scrapper`).
- El binario `data/cmf_norms.db` (se distribuye por GitHub Release con SHA256 publicado).
- Leyes habilitantes (18.045, 18.046, DFL 3, DFL 251, 20.712, 21.000) — solo normativa CMF.
- Estadísticas, registros públicos, hechos esenciales, jurisprudencia administrativa, instructivos UAF/SII.
