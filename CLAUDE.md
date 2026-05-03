# CMF MCP Server

> Servidor MCP que expone normativa de la CMF (Chile) — NCG, RAN, Compendio Seguros — a clientes MCP (Claude Desktop, Cursor, Claude API con MCP).
> Producto **gratuito y open-source**. No genera opinión legal: es capa de recuperación auditada. La interpretación queda en el modelo cliente y el usuario.

## Estado actual

- Bootstrap pendiente (HdU-01). Existen docs (CLAUDE.md, DEVELOPER.md, SCRAPER.md, COMPLIANCE_ANALYST.md, LEGAL_VALIDATOR.md, backlog.md, testing.md), LICENSE y workflows CI; el código TypeScript aún no se escribió.
- **Monorepo:** server MCP (`src/server.ts` + `src/tools/`) y scraper (`src/scraper/`) viven en el mismo repo. **Comparten** schema Drizzle, tipos y utilidades; **nunca corren en el mismo proceso** (entry points separados: `pnpm start` vs `pnpm scrape`). El MCP no scrapea en runtime — solo lee SQLite.

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
├── server.ts          # entry MCP stdio (pnpm start)
├── tools/             # un archivo + schema zod por tool MCP
├── scraper/           # pipeline de scraping (pnpm scrape)
│   ├── discovery.ts
│   ├── downloader.ts
│   ├── parsers/{pdf,html}.ts
│   ├── segmenter.ts
│   ├── changeDetector.ts
│   └── runner.ts
├── ingest/            # JSON parsed → SQLite (loader, normalizer, validator)
├── db/                # COMPARTIDO: schema drizzle, client, queries, migrations
├── shared/            # COMPARTIDO: enums, types, citations
└── cli/               # entry points separados: server.ts y scrape.ts
data/cmf_norms.db      # NO se commitea — distribuida vía GitHub Release
data/{raw,parsed,runs,logs}/  # NO se commitean — artefactos locales
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
5. **Scraper y MCP nunca corren en el mismo proceso** (aunque vivan en el mismo repo). Entry points separados; nada de `src/scraper/` se importa desde `src/server.ts` ni `src/tools/`.
6. **Toda norma servida debe tener entrada en `validation_log`** (en release público; en `dev` se puede saltar).
7. **Cada cambio de schema → migración Drizzle.** Sin SQL manual sobre la DB distribuida.

## Cómo correr (cuando exista código)

```bash
pnpm install
cp /path/to/cmf_norms.db data/    # release distribuido aparte
pnpm typecheck && pnpm lint && pnpm test
pnpm start                         # MCP server (stdio) — lee SQLite
pnpm scrape                        # scraper (proceso aparte) — escribe SQLite
```

## Documentación canónica por rol

- Desarrollador → [DEVELOPER.md](DEVELOPER.md)
- Scraper      → [SCRAPER.md](SCRAPER.md)
- Compliance   → [COMPLIANCE_ANALYST.md](COMPLIANCE_ANALYST.md)
- Validador legal → [LEGAL_VALIDATOR.md](LEGAL_VALIDATOR.md)

## Lo que NO entra en este repo

- El binario `data/cmf_norms.db` (se distribuye por GitHub Release con SHA256 publicado).
- Artefactos locales del scraper (`data/raw/`, `data/parsed/`, `data/runs/`) ni audit logs del MCP (`data/logs/`).
- Leyes habilitantes (18.045, 18.046, DFL 3, DFL 251, 20.712, 21.000) — solo normativa CMF.
- Estadísticas, registros públicos, hechos esenciales, jurisprudencia administrativa, instructivos UAF/SII.
