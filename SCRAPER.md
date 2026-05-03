# CMF MCP Server — Guía del Scraper

> **Audiencia:** ingeniero/a a cargo de la extracción y carga de la normativa CMF.
> **Ubicación:** **mismo repo que el MCP** (`gubaros/cmf-mcp`), bajo `src/scraper/`. Comparte schema Drizzle, tipos y utilidades con el server MCP — pero **corre como proceso separado** (entry point `pnpm scrape`, nunca dentro del proceso del MCP).
> **Output principal:** `data/cmf_norms.db` distribuido vía GitHub Release.
> **Independencia operacional:** aunque el código vive en el mismo repo, scraper y MCP server nunca corren en el mismo proceso. Lo único que comparten es schema, tipos y la SQLite resultante.

---

## 1. Misión

Mantener un mirror estructurado, versionado y auditable de la normativa vigente y derogada emitida por la Comisión para el Mercado Financiero (Chile), priorizando precisión textual sobre cobertura amplia. **Si dudas entre velocidad y exactitud, eliges exactitud siempre.**

---

## 2. Stack técnico

Mismo runtime que el MCP — TypeScript / Node.js — y mismo `package.json`, ya que viven en el mismo repo.

| Componente | Elección | Razón |
|---|---|---|
| Lenguaje / runtime | **TypeScript 5.x sobre Node.js 20 LTS** | Coherencia con el MCP, tipado fuerte para parsing |
| HTTP client | `undici` (fetch de Node 20) o `got` | Retries, timeouts, streaming nativos |
| Concurrencia | `p-limit` | Control simple de concurrency, sin frameworks |
| Parsing PDF | `pdfjs-dist`; `pdf-parse` como fallback | Coverage del 95% de los PDFs CMF |
| OCR (último recurso) | `tesseract.js` | Solo si el PDF no tiene capa de texto |
| Parsing HTML | `cheerio` | Selector CSS sobre las plantillas CMF |
| Storage | **SQLite + drizzle-orm** | Misma DB que consume el MCP, mismo schema importado desde `src/db/schema.ts` |
| Testing | `vitest` + snapshot por norma testigo | Detecta regresiones de parseo silenciosas |
| Lint/format | `biome` | Mismo binario que el MCP |
| Schedule local | `node-cron` o cron del sistema | No introducir Airflow/Temporal en MVP |

**No se usa:** Puppeteer/Playwright en MVP (CMF sirve PDFs y HTML estáticos, no SPA), Docker, S3, Postgres, colas. Si llega a necesitarse un browser headless es síntoma de que estamos atacando el endpoint equivocado.

---

## 3. Fuentes oficiales

Toda extracción parte de URLs de `cmfchile.cl`. **No se usan agregadores ni copias de terceros.** Si la fuente no es CMF, no entra al corpus.

### 3.1 Normativa de mercado de valores y emisores

- **Portal de Normativa Vigente** en cmfchile.cl, sección regulación de mercado de valores.
- Tipos: **Normas de Carácter General (NCG)**, Circulares, Oficios Circulares, Resoluciones Exentas.
- Formato típico: PDF firmado + a veces HTML resumen.

### 3.2 Normativa bancaria (RAN)

- **Recopilación Actualizada de Normas (RAN):** índice navegable en cmfchile.cl, sección "Bancos e Instituciones Financieras".
- Estructura: Capítulos (1, 2, 3...) → Secciones numeradas (1-13, 12-1, etc.).
- Formato: PDF por sección. Cada sección es la unidad de versionado.

### 3.3 Compendio de Normas para Compañías de Seguros

- Dividido en libros romanos (I a V), títulos y capítulos.
- Formato: PDF por capítulo o anexo.
- **En MVP.** Volumen acotado y demanda real en el mercado asegurador chileno justifica incluirlo.

### 3.4 Excluido del MVP

- Estadísticas, fichas de fiscalizados, registro público de valores, hechos esenciales, jurisprudencia administrativa.
- **Razón:** no es normativa propiamente tal. Cada uno justifica un módulo aparte si llega a haber demanda.

---

## 4. Estrategia de scraping

### 4.1 Discovery

Generar y mantener un **índice maestro** (`data/index.jsonl`) con una entrada por norma detectada en CMF:

```typescript
type IndexEntry = {
  id: string;                  // "ncg-461"
  tipo: 'NCG' | 'CIRCULAR' | 'OFICIO_CIRC' | 'RES_EXENTA' | 'RAN' | 'COMPENDIO_SEG';
  numero: string;
  titulo: string;
  sector: 'BANCARIO' | 'VALORES' | 'SEGUROS' | 'FONDOS' | 'INFRA_MERCADO' | 'TRANSVERSAL';
  urlPdf: string;
  urlHtml?: string;
  fechaEmision: string;        // ISO
  estadoAparente: 'VIGENTE' | 'DEROGADA' | 'DESAPARECIDA';
  hashRemoto: string | null;
};
```

El índice se regenera **antes** de cada corrida. Si una norma desaparece del índice oficial entre dos corridas, se marca como `DESAPARECIDA` y se eleva al validador legal — nunca se borra de la DB en silencio.

### 4.2 Descarga

- **HTTP client:** `undici` con timeout 30s, retries exponenciales (3 intentos, base 2s).
- **Concurrencia:** máximo **4 requests simultáneos** a `cmfchile.cl` con `p-limit(4)`. No saturar al regulador.
- **User-Agent identificable:** `cmf-mcp-scraper/0.1 (+https://github.com/gubaros/cmf-mcp)`. Buena ciudadanía y margen si nos contactan.
- **Caché local:** todos los binarios descargados van a `data/raw/{id}/{fecha}.pdf`. Nunca se redescarga si `Last-Modified` o el hash remoto no cambió. Honrar `If-Modified-Since`.

### 4.3 Parsing

Pipeline por tipo de fuente:

| Fuente | Estrategia |
|---|---|
| PDF de NCG/Circular | `pdfjs-dist` para texto. Si la extracción tiene >5% de caracteres no imprimibles, fallback a `pdf-parse`. Si ambos fallan, marcar `PARSE_FAIL` y elevar a humano. |
| PDF escaneado | `tesseract.js` con idioma `spa`. **Solo si es inevitable.** Marcar artículos OCR-derivados con `requiresReview=true`. |
| HTML | `cheerio` con selectores CSS específicos por plantilla CMF. |

### 4.4 Segmentación estructural

La parte difícil y donde se concentra el valor. **Texto plano no sirve** — hay que segmentar.

1. **Detectar nivel jerárquico** con regex tolerante:
   - `^(LIBRO|TÍTULO|CAPÍTULO|SECCIÓN)\s+([IVXLCDM]+|\d+)`
   - `^Artículo\s+(\d+\w*)\.?` (cubre "Artículo 12 bis", "Artículo 12°")
   - `^Anexo\s+([IVXLCDM]+|\d+)`

2. **Construir el árbol** parent→child y persistirlo en `sections` y `articles`.

3. **Validar invariantes** post-parseo:
   - Numeración de artículos sin saltos no justificados.
   - Comillas y paréntesis balanceados.
   - Tablas no perdidas (heurística: ≥3 columnas detectadas → reportar).
   - Notas al pie capturadas y referenciadas.

4. **Output del parser:** archivo `data/parsed/{normId}.json` con la estructura completa antes de cargar a SQLite. Permite re-cargar sin re-parsear.

### 4.5 Versionado y detección de cambios

- Cada descarga calcula `sha256` del PDF y del texto normalizado.
- Hash de PDF cambió pero el de texto no → cambio cosmético, se actualiza `fechaScrape`, sin alerta.
- Hash de texto cambió → versionado: el registro previo pasa a `MODIFICADA` y se carga la nueva como `VIGENTE`. **Notificar al validador legal y al analista de compliance.**
- **Nunca se sobrescribe texto.** El histórico se conserva en `articles_history` (mismo schema + `validFrom`, `validTo`).

### 4.6 Cadencia

| Tipo de norma | Frecuencia |
|---|---|
| NCG y Circulares (valores) | Semanal |
| RAN (bancos) | Semanal |
| Compendio Seguros | Semanal |
| Oficios Circulares | Semanal |
| Resoluciones Exentas | Quincenal |

Toda corrida deja un log estructurado en `data/runs/{timestamp}.log`. **Si una corrida tiene >2% de fallos, se aborta y se eleva.**

---

## 5. Normalización de texto

Reglas mínimas antes de calcular hash y antes de indexar FTS:

1. Normalización Unicode: NFC.
2. Espacios: múltiples espacios/tabs → uno. Saltos de línea preservados solo entre artículos.
3. Comillas tipográficas → comillas rectas (`"` y `'`).
4. Guiones largos consistentes (`—` se preserva, `--` no).
5. Números romanos en mayúscula.
6. Eliminación de cabeceras/pies de página repetitivos del PDF (heurística: líneas que aparecen en >70% de las páginas en misma posición).
7. **No** se altera el texto sustantivo: no se corrigen erratas, no se completan abreviaturas, no se modernizan términos.

El texto crudo (`textoOriginal`) se conserva siempre, separado del normalizado.

---

## 6. Manejo de errores

| Error | Acción |
|---|---|
| 4xx en CMF | Log + reintentar al día siguiente. Tres días seguidos → alerta humana. |
| 5xx en CMF | Backoff exponencial. Si persiste >2h, abortar corrida. |
| PDF corrupto | Marcar `PARSE_FAIL`, conservar archivo, alertar. **Nunca cargar parseo parcial.** |
| URL cambia de estructura | Tarea manual: actualizar selector. **No usar fallbacks "creativos"** que adivinen estructura. |
| Norma desaparece del índice | NO borrar. Marcar `DESAPARECIDA`. Validador decide si pasa a `DEROGADA`. |

---

## 7. Entregables del scraper

Cada corrida produce:

1. `data/cmf_norms.db` — SQLite listo para el MCP (mismo schema Drizzle).
2. `data/runs/{timestamp}.log` — log estructurado JSON.
3. `data/runs/{timestamp}_diff.md` — reporte humano-legible: normas nuevas, modificadas, desaparecidas. **Va al validador legal y al analista de compliance.**
4. `data/raw/` — copia íntegra de los PDFs descargados.

El MCP **solo consume** `cmf_norms.db`. Los demás artefactos son para auditoría.

### 7.1 Publicación del corpus

Cuando el validador firma la corrida:

1. Se sube `cmf_norms.db` a un **GitHub Release** del repo `cmf-mcp` (separado del release del código del server).
2. El release notes incluye:
   - Versión semver del corpus (ej. `corpus-2026.05.03`).
   - SHA256 del archivo `.db`.
   - Resumen del diff (normas nuevas, modificadas, derogadas).
   - Link al run del scraper (commit hash + timestamp) para trazabilidad.

El binario `.db` nunca se commitea al repo. Releases de código y de corpus usan tags distintos (`v0.1.0` vs `corpus-2026.05.03`) para separar versiones del software de versiones del dataset.

---

## 8. Lo que NO debe hacer el scraper

- No interpretar contenido normativo. La sectorización viene de metadatos del sitio CMF, no de NLP sobre el texto.
- No deducir vigencia. Vigencia = presencia/ausencia en índice oficial + revisión humana.
- No corregir el texto del regulador, ni siquiera erratas obvias.
- No scrappear contenido fuera de cmfchile.cl, aunque parezca complementario.
- No correr en producción sin que el último diff esté firmado por el validador legal.

---

## 9. Costo y eficiencia

Reglas para no quemar tiempo ni plata:

- **No paralelizar más de 4 requests.** Hacer 50 en paralelo no acelera el scrape (CMF no responde más rápido) y genera bloqueos.
- **No correr OCR sobre PDFs con capa de texto.** Verificar antes con `pdfjs-dist`.
- **No re-descargar PDFs que no cambiaron.** Usar `If-Modified-Since` y caché de hashes.
- **No mantener infra dedicada en MVP.** El scraper corre en cron en una VM modesta o en el laptop del responsable. Migrar a infra solo cuando el corpus exceda los 5GB o un consumidor exija SLA. Como el producto es gratuito, no hay urgencia para sostener infra paga.
