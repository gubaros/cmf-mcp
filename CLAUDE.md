# CMF MCP Server

> Servidor MCP que expone normativa de la CMF (Chile) — NCG, RAN, Compendio Seguros — a clientes MCP (Claude Desktop, Cursor, Claude API con MCP).
> Producto **gratuito y open-source**. No genera opinión legal: es capa de recuperación auditada. La interpretación queda en el modelo cliente y el usuario.

## Estado actual (2026-05-04)

- **Pipeline completo implementado y funcionando.** Discovery → download → parse+OCR → ingest → MCP server con 5 tools operativas.
- **DB en producción:** ~668+ normas RAN ingresadas; ingest del corpus completo (~3960 normas) corriendo. 89% del corpus CMF son PDFs escaneados (Alaris Capture Pro); OCR via tesseract-spa a 250 DPI.
- **5 tools MCP operativas:** `server_info`, `list_norms`, `get_norm`, `get_article`, `search_articles` (FTS5 con snippets). Conectado a Claude Desktop.
- **Scripts disponibles:** `pnpm discover` (solo fase discovery), `pnpm ingest` (solo parse+OCR+DB), `pnpm scrape` (pipeline completo), `pnpm start` (MCP server).
- **Compendio Seguros pendiente (HdU-07c):** URL correcta del índice desconocida — devuelve 404. El resto del corpus (NCG, CIR, OFC, RAN) está operativo.
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

## Lecciones aprendidas del corpus (post-mortem 2026-05-04)

Estas lecciones surgieron de un bug de segmentación que destruyó silenciosamente ~770 normas RAN en el primer ingest de producción. Se agregan aquí para que ningún componente futuro repita los mismos errores de diseño.

### 1. El corpus CMF tiene tres patrones estructurales distintos — testar los tres

Toda lógica de parsing/segmentación debe tener al menos un fixture de cada tipo:

| Patrón | Ejemplos | Estructura |
|---|---|---|
| **NCG/Circular sustantiva** | `ncg-461`, `circ-2238` | `Artículo N°X.-` como headers reales de la norma |
| **RAN** | `ran-1-13`, `ran-4-2`, `ran-20-9` | Secciones romanas (I., II., III.) + referencias inline a LGB |
| **Modificadora corta** | mayoría de OFC | Dispositivos numerados `1.`, `2.` o prosa sin estructura |

El patrón RAN es el más traicionero: usa "artículo 65 de la Ley General de Bancos" en prosa corrida, que es léxicamente idéntico a un header de artículo. La diferencia está en el contexto (mid-sentence vs. inicio de línea) y en lo que sigue (preposición "de la Ley" vs. contenido dispositivo).

### 2. Nunca retornar un resultado "válido" cuando el texto fue destruido

Un fallo silencioso en un sistema legal es peor que un error ruidoso. Cualquier etapa del pipeline que produzca datos estructurados debe validar antes de persistir:

- **Segmentador:** `sum(article.texto.length) >= 0.5 * source_text.length`. Si falla, lanzar error o retornar fallback explícito — nunca guardar fragmentos.
- **Parser:** si el texto extraído tiene >5% caracteres no imprimibles, activar OCR. Si ambos fallan, marcar `PARSE_FAIL` y no ingestar.
- **Ingest:** si una norma ya existe con `hashContenido` vacío (`''`), fue marcada para re-segmentación forzada — no saltear.

### 3. Tests antes del primer ingest de producción, no después

El pipeline fue "probado" ingiriendo 3956 normas reales. El bug se encontró cuando un analista de compliance usó el sistema. El orden correcto es:

1. Fixture con texto representativo de cada patrón estructural
2. Test que afirme invariantes de completitud (no solo "parseo sin error")
3. Ingest de producción

Agregar un fixture por tipo de norma a `tests/fixtures/` es una precondición para declarar cualquier componente de parsing como "done".

---

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
