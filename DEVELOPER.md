# CMF MCP Server — Guía del Desarrollador

> **Producto:** Servidor MCP local que expone toda la normativa vigente de la Comisión para el Mercado Financiero (Chile) como herramientas consultables por agentes IA.
> **Audiencia:** desarrollador a cargo de la implementación.
> **Repos:**
> - MCP Server: `git@github.com:gubaros/cmf-mcp.git`
> - Scraper: `git@github.com:gubaros/cmf-scrapper.git`
> **Distribución:** producto **gratuito**, open-source friendly. La estrategia comercial es demostrar capacidad geográfica y generar leads, no monetizar el corpus directamente.
> **Independencia:** no comparte código, esquemas ni configuración con otros productos internos. Es deliberado y refuerza la narrativa multi-jurisdicción.

---

## 1. Objetivo técnico

Construir un servidor MCP que, dado un cliente compatible (Claude Desktop, Claude API con MCP, Cursor, etc.), permita:

1. Listar normas CMF por filtros (tipo, sector regulado, vigencia, fecha).
2. Recuperar el texto íntegro de un artículo, capítulo o anexo.
3. Buscar texto libre con ranking por relevancia.
4. Devolver metadata estructural (índice, vigencia, modificaciones, normas relacionadas).
5. Comparar dos artículos o dos versiones del mismo artículo.

El servidor **no genera opinión legal**. Es una capa de recuperación auditada. La interpretación queda en manos del modelo cliente y del usuario.

---

## 2. Stack técnico

| Componente | Elección | Razón |
|---|---|---|
| Lenguaje / runtime | **TypeScript 5.x sobre Node.js 20 LTS** | Tipado estricto, ecosistema MCP de primer nivel en TS, mismo runtime que el scraper |
| SDK MCP | `@modelcontextprotocol/sdk` (oficial) | Soporte TS nativo, transporte stdio y SSE estables |
| Storage | **SQLite + FTS5** vía `better-sqlite3` | Sincrónico, rapidísimo en read-heavy, cero infra. FTS5 nativo |
| Acceso a DB | `drizzle-orm` con driver `better-sqlite3` | Tipado end-to-end, migraciones limpias, overhead mínimo |
| Validación de input | `zod` | Schemas MCP definidos una vez, reutilizados en runtime y tipos |
| Parsing PDF | `pdfjs-dist`; `pdf-parse` como fallback | Cubre el 95% de PDFs CMF; OCR solo si es inevitable |
| Parsing HTML | `cheerio` | Suficiente para plantillas CMF |
| Tests | `vitest` + snapshots | Rápido, integrado con TS sin config |
| Lint/format | `biome` | Único binario, reemplaza ESLint + Prettier |
| Build | `tsup` (o `tsc` directo) | Sin bundlers complejos para un server stdio |
| Package manager | `pnpm` | Install rápido, workspaces si escalamos |

**No se usa:** Postgres, Docker en MVP, Elasticsearch, frameworks web, Express. Todo lo que no sea SQLite + SDK MCP es gasto innecesario en esta fase.

---

## 3. Arquitectura

```
cmf-mcp/
├── src/
│   ├── server.ts              # Entry point MCP (stdio)
│   ├── tools/                 # Una función + schema zod por tool
│   │   ├── listNorms.ts
│   │   ├── getNorm.ts
│   │   ├── getArticle.ts
│   │   ├── searchArticles.ts
│   │   ├── compareArticles.ts
│   │   ├── getRelations.ts
│   │   └── serverInfo.ts
│   ├── db/
│   │   ├── schema.ts          # Drizzle schema (fuente de verdad)
│   │   ├── client.ts          # Singleton de better-sqlite3
│   │   ├── queries.ts         # Queries tipadas reutilizables
│   │   └── migrations/        # Generadas por drizzle-kit
│   ├── ingest/                # Carga desde el output del scraper
│   │   ├── loader.ts
│   │   ├── normalizer.ts
│   │   └── validator.ts
│   └── shared/
│       ├── enums.ts           # TipoNorma, Sector, EstadoVigencia
│       ├── types.ts
│       └── citations.ts
├── data/
│   └── cmf_norms.db           # SQLite (no se commitea; va por GitHub Release)
├── tests/
├── package.json
├── tsconfig.json
├── biome.json
├── drizzle.config.ts
├── README.md
└── DEVELOPER.md               # Este archivo
```

El scraper vive en `cmf-scrapper`. El MCP **no scrappea en runtime** — solo lee SQLite. Esto:
- Evita rate limits de CMF en respuestas a usuarios.
- Permite que un cambio en CMF rompa el scraper sin tumbar el servicio.
- Da control sobre qué versión del corpus se distribuye.

---

## 4. Modelo de datos

Definido en Drizzle (TypeScript). Schema específico para CMF; no copiar de otros proyectos.

```typescript
// src/db/schema.ts (extracto representativo)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const norms = sqliteTable('norms', {
  id: text('id').primaryKey(),                      // "ncg-461", "ran-1-13", "circ-2238", "cseg-iii-2"
  tipo: text('tipo').notNull(),                     // NCG | CIRCULAR | OFICIO_CIRC | RES_EXENTA | RAN | COMPENDIO_SEG
  numero: text('numero').notNull(),
  titulo: text('titulo').notNull(),
  sector: text('sector').notNull(),                 // BANCARIO | VALORES | SEGUROS | FONDOS | INFRA_MERCADO | TRANSVERSAL
  fechaEmision: text('fecha_emision').notNull(),
  fechaVigencia: text('fecha_vigencia'),
  estado: text('estado').notNull(),                 // VIGENTE | DEROGADA | MODIFICADA | SUSPENDIDA
  normaOrigenId: text('norma_origen_id'),
  urlOficial: text('url_oficial').notNull(),
  hashContenido: text('hash_contenido').notNull(),
  fechaScrape: text('fecha_scrape').notNull(),
  validadoPor: text('validado_por'),
  fechaValidacion: text('fecha_validacion'),
});

export const sections = sqliteTable('sections', { /* parent_id, nivel, numero, rubrica, orden */ });
export const articles = sqliteTable('articles', { /* norm_id, section_id, numero, texto, texto_original, estado, orden */ });
export const articlesHistory = sqliteTable('articles_history', { /* idem articles + valid_from, valid_to */ });
export const normRelations = sqliteTable('norm_relations', { /* source, target, tipo: MODIFICA|DEROGA|COMPLEMENTA|CITA */ });
export const validationLog = sqliteTable('validation_log', { /* norm_id, validador, fecha, tipo_revision, resultado, comentario */ });
```

### FTS5

Drizzle no cubre virtual tables nativamente. Se crea con SQL crudo en una migración manual:

```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(
  article_id UNINDEXED,
  norm_id UNINDEXED,
  sector UNINDEXED,
  texto,
  content='articles',
  tokenize='unicode61 remove_diacritics 2'
);
```

Triggers `AFTER INSERT/UPDATE/DELETE` sobre `articles` mantienen `articles_fts` sincronizada. Las búsquedas usan `better-sqlite3` directo con statements preparados.

### Convención de IDs

Predecible para que el agente IA pueda construir IDs sin adivinar:

- NCG: `ncg-{numero}` → `ncg-461`
- Circular: `circ-{numero}` → `circ-2238`
- RAN: `ran-{cap}-{seccion}` → `ran-1-13`
- Compendio Seguros: `cseg-{libro}-{titulo}` → `cseg-iii-2`
- Artículo: `{normId}-art-{numero}` → `ncg-461-art-12`

---

## 5. Tools MCP a exponer

Cada tool define su input con `zod`. El schema se publica al cliente MCP automáticamente.

### `list_norms`
Lista normas con filtros. **No retorna texto completo** — solo metadata.
- **Input:** `tipo?`, `sector?`, `estado?`, `fechaDesde?`, `fechaHasta?`, `limit?` (default 50, máx 200)
- **Output:** `Array<{ id, tipo, numero, titulo, sector, fechaEmision, estado }>`

### `get_norm`
Metadata + índice estructural de una norma. **No el texto.**
- **Input:** `normId`
- **Output:** `{ ...metadata, secciones: Section[], articulos: Array<{ id, numero, rubrica }> }`

### `get_article`
Texto íntegro de un artículo o anexo.
- **Input:** `articleId`
- **Output:** `{ id, normId, numero, texto, estado, fechaUltimaModificacion, urlOficial }`

### `search_articles`
Full-text con BM25 (FTS5). La query se normaliza (lowercase, sin diacríticos) antes de FTS.
- **Input:** `query`, `sector?`, `tipo?`, `estado?` (default `VIGENTE`), `limit?` (default 10, máx 50)
- **Output:** `Array<{ articleId, normId, snippet, score }>`

### `compare_articles`
Devuelve dos artículos en paralelo para que el modelo cliente analice diferencias.
- **Input:** `articleIdA`, `articleIdB`
- **Output:** `{ a: Article, b: Article }`

### `get_relations`
Modificaciones, derogaciones y referencias cruzadas de una norma.
- **Input:** `normId`
- **Output:** `Array<{ tipoRelacion, targetNormId, detalle }>`

### `server_info`
Versión, fecha del último scrape, total de normas, cobertura por sector, link a repo.

---

## 6. Setup local

```bash
git clone git@github.com:gubaros/cmf-mcp.git
cd cmf-mcp
pnpm install

# Carga la DB ya scrapeada (release distribuido aparte; no en el repo)
cp /path/to/cmf_norms.db data/

# Tipos y lint
pnpm typecheck
pnpm lint

# Tests
pnpm test

# Levanta el servidor MCP en stdio
pnpm start
```

Configuración Claude Desktop (`claude_desktop_config.json`) en producción:
```json
{
  "mcpServers": {
    "cmf": {
      "command": "node",
      "args": ["/ruta/absoluta/cmf-mcp/dist/server.js"]
    }
  }
}
```

En desarrollo con `tsx`:
```json
{
  "mcpServers": {
    "cmf": {
      "command": "pnpm",
      "args": ["--silent", "start"],
      "cwd": "/ruta/absoluta/cmf-mcp"
    }
  }
}
```

---

## 7. Distribución

Como el producto es gratuito, la distribución define la fricción de adopción. Tres canales:

1. **Repo público en GitHub** (`gubaros/cmf-mcp`) — código + instrucciones.
2. **GitHub Releases** con `cmf_norms.db` ya generado y SHA256 publicado en release notes. El usuario no necesita correr el scraper para usar el MCP.
3. **(Fase 2)** Paquete npm publicable: `npx @gubaros/cmf-mcp` que descarga la última DB y lanza el servidor. Reduce la fricción a un comando.

**La gratuidad no implica anonimato.** El `server_info` y el README dejan visible que el producto está construido y mantenido por la firma. Cada uso del MCP en una conversación con un cliente es una mini-impresión de marca.

---

## 8. Roadmap por fases

| Fase | Alcance | Done criteria |
|---|---|---|
| **MVP (semanas 1–4)** | NCG vigentes + RAN + **Compendio Seguros** + Tools 1–4 + `server_info`. | Validador firma 20 normas sample con 0 errores graves. Release público v0.1 en GitHub. |
| **Fase 2 (semanas 5–8)** | Circulares + Oficios Circulares. `compare_articles`, `get_relations`. Paquete npm. | Validación automática de hashes vs fuente CMF >95%. `npx` funcional. |
| **Fase 3 (semanas 9–12)** | Histórico de versiones (`articles_history` expuesto). Glosario sectorial. | Permite "cómo era el art. X antes de la NCG Y". |
| **Fase 4** | API HTTP opcional, telemetría anonimizada de uso para informar producto comercial. | — |

---

## 9. Reglas de oro

1. **Nunca citar una norma sin `urlOficial`.** Toda respuesta auditable hasta CMF.
2. **No inventar IDs.** Si el agente pide algo que no está en DB, error explícito, no "mejor coincidencia".
3. **`VIGENTE` es default en búsquedas.** Para devolver derogadas hay que pedirlo explícito.
4. **No hay endpoint de interpretación.** El MCP entrega texto y metadata.
5. **Scraper y MCP nunca corren en el mismo proceso.**
6. **Toda norma servida debe tener entrada en `validation_log`.** En modo `dev` se puede saltar; en release público no.
7. **Cada cambio de schema → migración Drizzle.** Sin SQL manual sobre la DB distribuida.
