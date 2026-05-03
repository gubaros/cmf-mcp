# Testing — CMF MCP Server

> TDD obligatorio. Toda funcionalidad nueva arranca con un test que falla. La regla no es "alcanzar X% coverage": es que **el código exista porque un test lo necesitó**.
>
> **Por qué TDD acá:** el corpus se sirve a compliance officers que toman decisiones regulatorias. Un bug silencioso en una tool MCP puede traducirse en una decisión legal incorrecta. Test-first es el costo de admisión, no una opción de calidad.

---

## 1. Filosofía

- **Red → Green → Refactor.** Sin excepciones, ni siquiera para "fixes triviales".
- **No se mockea SQLite ni FTS5.** Los tests usan motor real (in-memory o tempfile). Bugs de FTS5 / drizzle / triggers solo aparecen contra el motor real, y la trazabilidad del MCP exige que lo que pasa en prod sea lo que se ejercitó en test.
- **No se mockea el logging.** El audit trail es parte del contrato — se testea como output más, no como side-effect ignorable.
- **Snapshot tests** donde la salida es estructural (output de tools MCP, eventos de log emitidos, JSON de ingest).
- **Property-based tests** para parsing/normalización (ej. `normalize(normalize(x)) === normalize(x)`).

---

## 2. Stack

- **Runner:** `vitest`
- **Snapshots:** `vitest` built-in (inline o file-based)
- **Property:** `fast-check` (cuando aplique)
- **DB de test:** `better-sqlite3` con `:memory:` o tempfile (con cleanup automático en `afterEach`)
- **Fixtures:** `tests/fixtures/` con normas sample en formato JSON parsed (ver HdU-17)
- **Coverage:** `vitest --coverage` (informativo, no gate bloqueante en MVP)

---

## 3. Estructura

```
src/
└── tools/
    └── getArticle.ts
tests/
├── fixtures/
│   ├── ncg-461.parsed.json
│   ├── ran-1-13.parsed.json
│   └── ...
├── helpers/
│   ├── db.ts            # crea DB in-memory + corre migrations + carga fixtures
│   ├── server.ts        # arma MCP server con tools y logging registrados
│   └── logSink.ts       # captura los eventos de log para assertions
├── unit/
│   └── ingest/
│       ├── normalizer.test.ts
│       └── validator.test.ts
├── integration/
│   └── tools/
│       ├── getArticle.test.ts
│       ├── searchArticles.test.ts
│       └── ...
└── __snapshots__/       # output esperado por tool
```

---

## 4. Workflow TDD por capa

### 4.1 Migración de schema (HdU-03, HdU-04)
1. Test: "tabla X existe con columnas A, B, C; trigger Y dispara INSERT en `articles_fts` al insertar en `articles`".
2. Generar migración drizzle (o SQL crudo para FTS5) hasta que pase.
3. Refactor.

### 4.2 Ingest — loader / normalizer / validator (HdU-07 a 09)
1. Fixture de norma input + estado esperado en DB.
2. Test: feliz path produce filas correctas.
3. Test: norma malformada (sin `urlOficial`, ID inválido, etc.) → validator rechaza con error tipado, **nada queda en DB**.
4. Implementar hasta verde.

### 4.3 Logging middleware (HdU-06 — bloqueante)
1. Test: tool dummy envuelta por el middleware emite log con `requestId`, `tool`, `input`, `latencyMs`, `result=OK`.
2. Test: tool que tira excepción → log con `result=ERROR` + código.
3. Test: el texto íntegro de un artículo **NO aparece** en el log (solo IDs y URLs).
4. Test: dos llamadas concurrentes generan dos `requestId` distintos.
5. Implementar middleware. **Esta capa pasa antes que cualquier tool real.**

### 4.4 Tool MCP (HdU-10 a 14, 22, 23, 29, 30)
1. Test: input válido (zod) → output con shape esperado contra fixture.
2. Test: input inválido → error MCP tipado (nunca excepción cruda al SDK).
3. Test: ID inexistente → error explícito, no "mejor coincidencia" (regla de oro #2).
4. Test: el log emitido para esa tool incluye los `normIds` / `articleIds` retornados y los `urlOficial` citados.
5. Snapshot del output completo.
6. Implementar la tool hasta los 5 verdes.

### 4.5 End-to-end (smoke)
- Un test integración que: (a) carga fixtures vía loader real, (b) levanta server con todas las tools, (c) ejerce un flujo `list_norms` → `get_norm` → `get_article` → verifica logs.

---

## 5. Cómo correr

```bash
pnpm test                # full suite, una pasada
pnpm test --watch        # modo TDD — re-corre al guardar
pnpm test path/to/test   # filtrar por path
pnpm test -t "nombre"    # filtrar por nombre del test
pnpm test --coverage     # report de coverage
pnpm test -u             # actualizar snapshots (revisar el diff antes de commitear)
```

---

## 6. CI gates (HdU-19)

GitHub Actions corre en cada PR:

1. `pnpm typecheck` — cero errores.
2. `pnpm lint` — `biome` sin warnings.
3. `pnpm test` — 100% pass.

**Sin los 3 verdes, el PR no se mergea.** Esto se enforce en branch protection sobre `main`.

---

## 7. Reglas no-negociables

1. **No commitear código sin test que lo justifique.** Si aparece un bug, primero el test que lo reproduce; después el fix.
2. **No mockear DB ni FTS5.** `:memory:` con migrations reales.
3. **No mockear logging.** Capturar con sink de test y assertir.
4. **Toda tool MCP nueva requiere:** test de output, test de error, test de ID inexistente, test de log emitido.
5. **Snapshots se actualizan deliberadamente** (`pnpm test -u`) y se revisan línea a línea en el PR. Un snapshot que cambia "solo" es regresión hasta probar lo contrario.
6. **No `.skip` sin issue abierto** explicando por qué y plazo de re-activación.
7. **Pre-commit local:** correr `pnpm test` antes del commit. (Opcional: husky/lefthook para enforce automático.)

---

## 8. Lo que NO hace falta testear

- Tipos puros (drizzle da tipado end-to-end — el typecheck es el test).
- Configuración (`biome.json`, `tsconfig.json`).
- Re-exports.
- Wrappers triviales sobre el SDK MCP.

Si dudás si algo entra acá: escribí el test. Los falsos positivos son baratos; los falsos negativos en regulación, no.
