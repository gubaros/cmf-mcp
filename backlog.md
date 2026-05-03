# Backlog — CMF MCP Server

> Backlog vivo. Cuando una HdU arranca, se convierte en GitHub Issue y se referencia con `Closes #N` desde el PR. Marcar `[x]` cuando el PR esté mergeado.
> Estructura: alineada al roadmap de [DEVELOPER.md](DEVELOPER.md) §8.
>
> **Nota arquitectónica:** server MCP y scraper viven en el **mismo repo** (`src/server.ts` y `src/scraper/`), comparten schema Drizzle y tipos, pero **nunca corren en el mismo proceso**. Entry points separados: `pnpm start` y `pnpm scrape`.

---

## Fase 1 — MVP

**Done criteria:** validador firma 20 normas sample con 0 errores graves. Release público v0.1 en GitHub. Tools 1-4 + `server_info` operativas. Cobertura: NCG vigentes + RAN + Compendio Seguros. Audit trail completo desde la primera tool. **Scraper end-to-end produciendo `cmf_norms.db`**.

### Infra y bootstrap

- [ ] **HdU-01 — Bootstrap del proyecto**
  Como dev, quiero `package.json`, `tsconfig.json` estricto, `biome.json`, `vitest.config.ts`, `tsup.config.ts` y `.gitignore` (excluyendo `data/`, `dist/`, `node_modules/`) listos, para poder ejecutar `pnpm install && pnpm typecheck && pnpm lint && pnpm test` sin errores en un repo vacío. Scripts incluidos: `start` (MCP server), `scrape` (entry del scraper), `db:generate`, `db:migrate`.

- [ ] **HdU-02 — Setup Drizzle + better-sqlite3**
  Como dev, quiero `drizzle.config.ts`, `src/db/client.ts` (singleton de `better-sqlite3`) y scripts `pnpm db:generate` / `pnpm db:migrate`, para poder generar y aplicar migraciones contra `data/cmf_norms.db`.

- [ ] **HdU-03 — Schema Drizzle (tablas core)**
  Como dev, quiero `src/db/schema.ts` con `norms`, `sections`, `articles`, `articles_history`, `norm_relations`, `validation_log` siguiendo DEVELOPER.md §4, para que server y scraper compartan una única fuente de verdad tipada.

- [ ] **HdU-04 — Migración FTS5 manual**
  Como dev, quiero una migración SQL cruda que cree `articles_fts` (`tokenize='unicode61 remove_diacritics 2'`) con triggers `AFTER INSERT/UPDATE/DELETE` sobre `articles`, para que la búsqueda full-text esté siempre sincronizada.

- [ ] **HdU-05 — MCP server stdio esqueleto**
  Como dev, quiero `src/server.ts` que arranque el MCP SDK por stdio sin tools registradas, para validar la integración con Claude Desktop antes de implementar tools.

### Trazabilidad

- [ ] **HdU-06 — Logging estructurado y audit trail (BLOQUEANTE para tools)**
  Como auditor/validador, quiero que **cada llamada a una tool** quede registrada con: `timestamp`, `requestId` (uuid), `tool`, `input` (sanitizado), `normIds` y `articleIds` retornados, `urlOficial` de cada cita, `latencyMs`, `result` (`OK`/`ERROR`+código), y versión del corpus servida. Para que toda respuesta del MCP sea reconstruible y auditable hasta CMF (regla de oro #1).
  Criterios:
  - Formato JSON line-per-event a `data/logs/{YYYY-MM-DD}.jsonl` con rotación diaria.
  - **No** se loguea el texto íntegro de artículos (solo IDs y URLs).
  - Middleware/wrapper único que envuelve toda tool — imposible registrar una tool nueva sin que el log se emita.
  - Modo `dev` puede mandar a stderr; modo `release` siempre a archivo + consola.
  - Tests verifican que cada tool MVP emite el log esperado.
  - Esta HdU **debe estar mergeada antes que cualquier tool** (HdU-18 a 22).

### Scraper

> El scraper vive en `src/scraper/` y corre como proceso independiente del MCP. Comparte `src/db/schema.ts` y `src/shared/`. Cada subtarea es un módulo testeable contra fixtures.

- [ ] **HdU-07 — Discovery: índice maestro de normas CMF**
  Como dev del scraper, quiero `src/scraper/discovery.ts` que recorra los portales de CMF y genere `data/index.jsonl` con una entrada por norma detectada (`id`, `tipo`, `sector`, `urlPdf`, `hashRemoto`, `estadoAparente`), para que el resto del pipeline trabaje contra una lista determinística. Si una norma desaparece entre corridas, marcarla `DESAPARECIDA` (nunca borrar — SCRAPER.md §4.1).

- [ ] **HdU-08 — Downloader con caché y rate limit**
  Como dev del scraper, quiero `src/scraper/downloader.ts` que descargue PDFs/HTML del índice usando `undici` con `p-limit(4)`, retries exponenciales (3 intentos, base 2s), timeout 30s, User-Agent identificable y caché local en `data/raw/{id}/{fecha}.pdf` honrando `If-Modified-Since`, para no saturar a CMF ni re-descargar contenido inalterado.

- [ ] **HdU-09 — Parser de PDFs**
  Como dev del scraper, quiero `src/scraper/parsers/pdf.ts` con `pdfjs-dist` como primario y `pdf-parse` como fallback (cuando el primer extract tiene >5% caracteres no imprimibles), retornando texto plano + metadata, para cubrir el 95% de PDFs CMF. Si ambos fallan, marcar `PARSE_FAIL` y abortar esa norma sin parchar (SCRAPER.md §4.3).

- [ ] **HdU-10 — Parser de HTML**
  Como dev del scraper, quiero `src/scraper/parsers/html.ts` con `cheerio` y selectores específicos por plantilla CMF, para cubrir las normas que se sirven como HTML.

- [ ] **HdU-11 — Segmentador estructural**
  Como dev del scraper, quiero `src/scraper/segmenter.ts` que detecte jerarquía (`LIBRO`/`TÍTULO`/`CAPÍTULO`/`SECCIÓN`/`Artículo`/`Anexo`) con regex tolerantes y construya el árbol parent→child en `data/parsed/{normId}.json`, validando invariantes (numeración sin saltos, comillas balanceadas, tablas no perdidas, notas al pie referenciadas). Sin tree válido la norma no se carga (SCRAPER.md §4.4).

- [ ] **HdU-12 — Change detector y versionado**
  Como dev del scraper, quiero `src/scraper/changeDetector.ts` que compare `sha256` de PDF y de texto normalizado contra la última versión en DB: si solo cambió PDF (no texto) actualizar `fechaScrape`; si cambió texto, mover registro previo a `articles_history` con `validTo`, cargar nuevo como `VIGENTE`, registrar relación en `norm_relations`, y notificar al validador (SCRAPER.md §4.5).

- [ ] **HdU-13 — Run logger + reporte de diff**
  Como validador, quiero que cada corrida del scraper genere `data/runs/{timestamp}.log` (JSON estructurado por evento) y `data/runs/{timestamp}_diff.md` (humano-legible: normas nuevas / modificadas / desaparecidas / parse_fail), para tener input firmable y trazabilidad por corrida.

- [ ] **HdU-14 — CLI orquestador `pnpm scrape`**
  Como mantenedor, quiero `src/cli/scrape.ts` que oriente todo el pipeline (discovery → download → parse → segment → change-detect → ingest → run report) con flags `--dry-run`, `--only=<id>`, `--since=<date>`, y que aborte la corrida si >2% de fallos (SCRAPER.md §4.6). Entry point completamente separado del MCP server.

### Ingest (puente scraper → DB)

- [ ] **HdU-15 — Loader de JSON parsed → SQLite**
  Como dev, quiero `src/ingest/loader.ts` que lea los `data/parsed/{normId}.json` producidos por el segmentador y los inserte en SQLite respetando la convención de IDs (DEVELOPER.md §4), para desacoplar parsing de carga (permite re-cargar sin re-parsear).

- [ ] **HdU-16 — Validator de integridad post-ingest**
  Como dev, quiero `src/ingest/validator.ts` que rechace ingests con: artículos sin `urlOficial`, IDs malformados, hashes vacíos, o referencias a `normaOrigenId` inexistente; para que la DB nunca quede en estado inconsistente.

- [ ] **HdU-17 — Normalizer de campos**
  Como dev, quiero `src/ingest/normalizer.ts` que aplique reglas de SCRAPER.md §5 (NFC, espacios, comillas rectas, eliminación de cabeceras/pies repetitivos) sobre `texto` preservando `texto_original`, para que FTS5 indexe contenido consistente.

### Tools MCP

- [ ] **HdU-18 — Tool `server_info`**
  Como cliente MCP, quiero llamar `server_info` y recibir versión, fecha del último scrape, total de normas, cobertura por sector, link al repo y conteo de normas firmadas por validador, para confirmar la salud y procedencia del corpus.

- [ ] **HdU-19 — Tool `list_norms`**
  Como cliente MCP, quiero filtrar por `tipo`, `sector`, `estado`, `fechaDesde`, `fechaHasta` con `limit` (default 50, máx 200) y recibir solo metadata (no texto), para explorar el corpus sin saturar el contexto.

- [ ] **HdU-20 — Tool `get_norm`**
  Como cliente MCP, quiero pasar un `normId` y recibir metadata + índice estructural (secciones y lista de artículos con id/numero/rubrica), para entender la estructura antes de pedir texto.

- [ ] **HdU-21 — Tool `get_article`**
  Como cliente MCP, quiero pasar un `articleId` y recibir el texto íntegro + `urlOficial` + `fechaUltimaModificacion`, para citar la norma con trazabilidad.

- [ ] **HdU-22 — Tool `search_articles` (FTS5 + BM25)**
  Como cliente MCP, quiero buscar texto libre con filtros opcionales (`sector`, `tipo`, `estado` default `VIGENTE`, `limit` default 10 máx 50) y recibir snippets con score, para encontrar pasajes relevantes sin leer normas completas. La query se normaliza (lowercase, sin diacríticos) antes de FTS.

### Reglas de oro y validación

- [ ] **HdU-23 — Bloqueo de normas no validadas en modo release**
  Como validador, quiero que en modo `release` el servidor MCP rehúse servir normas sin entrada en `validation_log`, para que el corpus público sea siempre validado. Modo `dev` lo salta.

- [ ] **HdU-24 — Errores explícitos por ID inexistente**
  Como cliente MCP, quiero que `get_norm`/`get_article` devuelvan error tipado cuando el ID no existe (no "mejor coincidencia"), para evitar que el agente alucine respuestas (regla de oro #2).

### Quality y CI

- [ ] **HdU-25 — Fixtures de 20 normas sample**
  Como dev, quiero `tests/fixtures/` con 20 normas representativas (mix NCG/RAN/Compendio) en formato JSON parsed, para correr tests del MCP y del segmentador sin depender de la red.

- [ ] **HdU-26 — Snapshot tests por tool MCP y por etapa del scraper**
  Como dev, quiero un snapshot por cada tool MCP con input/output esperado contra fixtures (incluyendo el log emitido) y snapshots por etapa del scraper (PDF parsed → segmenter output → JSON normalizado), para detectar regresiones silenciosas en cualquier capa.

- [ ] **HdU-27 — GitHub Actions: typecheck + lint + test (Node 20 y 22)**
  Como dev, quiero CI en cada PR que corra `pnpm typecheck && pnpm lint && pnpm test` sobre Node 20 y 22, para no mergear regresiones. (Workflows `build.yml` y `test.yml` ya existen — esta HdU se cierra cuando pasen verde después de HdU-01.)

### Distribución

- [ ] **HdU-28 — README de uso para Claude Desktop**
  Como usuario externo, quiero instrucciones claras de configuración en `claude_desktop_config.json` (DEVELOPER.md §6) y dónde descargar la `.db`, para tener el MCP corriendo en menos de 10 minutos. Incluye sección sobre dónde encontrar los logs locales y cómo interpretarlos.

- [ ] **HdU-29 — Release v0.1 con `cmf_norms.db`**
  Como mantenedor, quiero un GitHub Release `v0.1` con `cmf_norms.db` adjunto, SHA256 publicado en notas y tag separado del corpus (`corpus-2026.MM.DD` distinto del tag de código `v0.1.0`), para distribuir sin que el usuario corra el scraper.

---

## Fase 2

**Done criteria:** validación automática de hashes vs fuente CMF >95%. `npx @gubaros/cmf-mcp` funcional. Cobertura ampliada a Circulares + Oficios Circulares.

- [ ] **HdU-30 — Tool `compare_articles`**
  Como compliance, quiero pasar dos `articleId` y recibir ambos textos en paralelo con metadata, para que el modelo cliente analice diferencias.

- [ ] **HdU-31 — Tool `get_relations`**
  Como compliance, quiero pasar un `normId` y recibir todas sus relaciones (`MODIFICA`, `DEROGA`, `COMPLEMENTA`, `CITA`) con `targetNormId` y detalle, para reconstruir el árbol normativo.

- [ ] **HdU-32 — Scraper de Circulares**
  Como dev, quiero extender `discovery`, `parsers` y `loader` para soportar Circulares (id `circ-{numero}`), para ampliar la cobertura del corpus.

- [ ] **HdU-33 — Scraper de Oficios Circulares**
  Como dev, quiero soportar Oficios Circulares (id por convención a definir con validador), para cerrar los tipos normativos principales.

- [ ] **HdU-34 — Validación automática de hashes vs fuente CMF**
  Como validador, quiero un job que recalcule hash del PDF en CMF y lo compare con `hashContenido` en DB, alertando discrepancias >5%, para detectar drift sin revisar manualmente.

- [ ] **HdU-35 — Scheduling local (cron) del scraper**
  Como mantenedor, quiero `node-cron` o equivalente que dispare `pnpm scrape` con la cadencia de SCRAPER.md §4.6 (semanal NCG/RAN/Compendio/OficiosCirc, quincenal Resoluciones Exentas), para no depender de disparo manual.

- [ ] **HdU-36 — Paquete npm publicable (`@gubaros/cmf-mcp`)**
  Como usuario, quiero correr `npx @gubaros/cmf-mcp` y que descargue automáticamente la última `cmf_norms.db` del Release y arranque el MCP, para reducir fricción de adopción a un comando.

- [ ] **HdU-37 — Auto-update de DB con verificación de SHA256**
  Como usuario, quiero que el `npx` chequee periódicamente si hay nueva versión del corpus, descargue solo si SHA256 difiere, y verifique integridad antes de reemplazar, para mantenerme actualizado sin intervención.

---

## Fase 3

**Done criteria:** "cómo era el art. X antes de la NCG Y" responde correctamente. Glosario sectorial disponible.

- [ ] **HdU-38 — Exponer histórico vía `get_article` con `asOfDate`**
  Como compliance, quiero pasar `articleId` + `asOfDate` opcional y recibir la versión vigente en esa fecha desde `articles_history`, para investigación retrospectiva (caso COMPLIANCE_ANALYST.md §3.4).

- [ ] **HdU-39 — Tool `list_article_versions`**
  Como compliance, quiero ver todas las versiones de un artículo con `validFrom`/`validTo` y la norma modificadora, para entender el historial de cambios.

- [ ] **HdU-40 — Glosario sectorial**
  Como compliance, quiero un endpoint que devuelva definiciones de términos clave por sector (ej. "instrumento derivado" en valores vs banca), para resolver ambigüedades sin abandonar el MCP.

---

## Fase 4 — diferida

- [ ] **HdU-41 — API HTTP opcional**
  Como integrador, quiero el mismo set de tools disponibles vía HTTP además de stdio, para casos donde stdio no aplica.

- [ ] **HdU-42 — Telemetría anonimizada (opt-in) para endpoint HTTP**
  Como producto, quiero medir uso del endpoint HTTP gestionado (no del stdio local) con opt-in explícito, para informar el roadmap. Solo sobre el endpoint gestionado, nunca sobre instalaciones locales.

---

## Cross-cutting (continuo, sin fase fija)

- [ ] **HdU-43 — `gaps.md` versionado**
  Como compliance, quiero un `gaps.md` versionado donde registrar consultas que el MCP no responde bien y normas faltantes para responderlas, para guiar el roadmap (COMPLIANCE_ANALYST.md §5.4).

- [ ] **HdU-44 — `validation_decisions.md` versionado**
  Como validador, quiero documentar cada decisión de criterio (sectorización ambigua, parsing dudoso) en `validation_decisions.md`, para que el próximo validador pueda asumir el rol con criterio histórico (LEGAL_VALIDATOR.md §8).
