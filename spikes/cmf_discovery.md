# Spike: descubrimiento del sitio CMF (cmfchile.cl)

> **Fecha:** 2026-05-03
> **Objetivo:** validar supuestos de SCRAPER.md §3-4 contra el sitio real, identificar URL patterns y bloqueantes para HdU-07 a HdU-14, antes de comprometer schema y código.
> **Método:** WebFetch + cURL + pdftotext sobre URLs públicas. Sin escribir código del scraper. User-Agent identificable, máximo 1 request a la vez.
> **Conclusión one-liner:** sí se puede; el supuesto "PDFs estáticos parseables" se confirma; el camino de discovery es más complejo de lo asumido (3 caminos distintos: form de búsqueda para NCG/Circulares, crawl de portal para RAN, ídem para Compendio Seguros).

---

## 1. Resumen ejecutivo

| Aspecto | Estado | Comentario |
|---|---|---|
| Acceso público sin auth | ✅ | NCG, Circulares, RAN y Compendio Seguros descargables sin login |
| PDFs con capa de texto | ✅ | 2/2 samples extrajeron texto limpio con `pdftotext` (poppler) |
| Sitio estático (sin SPA) | ✅ | HTML + PDF servidos directos. No hace falta headless browser |
| `robots.txt` | ⚠️ | Responde 404 (HTML "Página no encontrada"). No hay directivas de crawl |
| Rate limit aparente | 🟢 | Sin throttling visible en pruebas puntuales. `p-limit(4)` es prudente |
| URL pattern para NCG/Circulares | ✅ | `cmfchile.cl/normativa/{tipo}_{numero}_{año}.pdf` — predecible |
| URL pattern para RAN | ⚠️ | `articles-{ID}_doc_pdf.pdf` — el ID no es el número de capítulo, requiere lookup |
| URL pattern para Compendio Seguros | ⚠️ | `ver_archivo.php?archivo=/web/compendio/...` — requiere crawl del índice |
| Metadata estructurada disponible | ✅ | Form de búsqueda devuelve número, fecha, modifica/modificada-por, vigencia |
| OCR necesario | ❌ (en sample) | Mantener `tesseract.js` solo como último recurso, según SCRAPER.md §4.3 |

---

## 2. Endpoints descubiertos

### 2.1 Listado/búsqueda de NCG, Circulares, Oficios Circulares (mercado de valores y seguros)

**URL base:** `https://www.cmfchile.cl/institucional/legislacion_normativa/normativa2.php`

**Parámetros:**
- `tiponorma`: `NCG` | `CIR` | `OFC` (probable: confirmar con request real)
- `numero`: número de la norma (vacío = todas)
- `dd`, `mm`, `aa`, `dd2`, `mm2`, `aa2`: rango de fechas
- `entidad_web`: `ALL` | código de entidad (ej. `RVEMI` = Registro Valores Emisores)
- `materia`: `ALL` | código de materia
- `hidden_mercado`: `V` (valores) | `S` (seguros) | (banca usa otro portal)
- `enviado=1`: dispara la búsqueda

**Respuesta:** HTML con tabla. Columnas observadas:
- Tipo (NCG/CIR/OFC)
- Número
- Fecha
- Título / Referencia
- Documentos modificadores / sustitutorios
- Reportes normativos / complementarios
- Resolución
- Modifica
- Modificada por
- Deroga
- Derogada por
- Vigencia (estado)

**Decisión:** parser HTML con `cheerio` cubre esto. El form devuelve casi todo el modelo de `norms` + `norm_relations` en una sola pasada — gran win para `discovery.ts`.

### 2.2 PDFs de NCG, Circulares, Resoluciones Exentas

**Patrón:** `https://www.cmfchile.cl/normativa/{tipo}_{numero}_{año}.pdf`

**Ejemplo confirmado (HTTP 200):**
```
https://www.cmfchile.cl/normativa/ncg_564_2026.pdf
```

**Implicación para `id`:** la convención `ncg-{numero}` en CLAUDE.md/DEVELOPER.md funciona. El año está en la URL pero no en el ID — está bien, porque el número es único por tipo.

**Headers de respuesta relevantes:**
- `Content-Type: application/pdf`
- `Last-Modified` presente (apto para `If-Modified-Since`)
- `Server` ofuscado (`XXXXXXX`) — anti-fingerprinting, no afecta scraping

### 2.3 Portal RAN (Bancos)

**Index del portal:** `https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-28192.html`

**Detalle de capítulo:** `https://www.cmfchile.cl/portal/principal/613/w3-article-{ID}.html`
- Ejemplo: Capítulo 11-7 → `w3-article-28952.html`

**PDF del capítulo:** `https://www.cmfchile.cl/portal/principal/613/articles-{ID}_doc_pdf.pdf`
- Ejemplo: `articles-28952_doc_pdf.pdf`

**El ID del PDF coincide con el ID del article HTML.** Eso simplifica: una vez que tenemos el link al detail page de un capítulo, el PDF se construye reemplazando `w3-article-{ID}.html` → `articles-{ID}_doc_pdf.pdf`.

**Lo que falta resolver:** el index portal no lista los capítulos. Hay que descubrir el mapping `{capítulo}-{sección}` → `{ID}` por otra vía:
- Opción A: crawl recursivo del sidebar del portal CMF (poco confiable, layout puede cambiar)
- Opción B: usar el endpoint legacy `cronologiabancaria.cmfchile.cl/sbifweb/servlet/LeyNorma?indice=...&LNAN=1` que apareció en búsqueda — promete índice estructurado por libro/capítulo/sección. **Probarlo en HdU-07.**
- Opción C: scrape de la sección "Sitemap" o "Mapa del sitio" si existe.

### 2.4 Compendio de Normas para Compañías de Seguros

**Patrón de PDF confirmado (HTTP 200):**
```
https://www.cmfchile.cl/institucional/mercados/ver_archivo.php?archivo=/web/compendio/ncg/ncg_221_2008.pdf
```

El path `archivo=/web/compendio/...` sugiere que **existe un árbol de archivos en `/web/compendio/`** organizado por tipo. La página `publicaciones_compendionormas_seguros.php` es comercial (vende ediciones impresas) y no expone el índice — pero los PDFs están públicos.

**Lo que falta resolver:** la convención de paths bajo `/web/compendio/`. Posibilidades a probar en HdU-07:
- `/web/compendio/libro_iii/...`
- `/web/compendio/{libro}_{titulo}_{capitulo}.pdf`
- Crawl del form `normativa.php?mercado=S` que sí devolvería el listado completo de seguros (incluyendo el compendio)

---

## 3. Validación de supuestos en SCRAPER.md

| Supuesto SCRAPER.md | Confirmación |
|---|---|
| §3.1 NCG/Circulares en formato PDF firmado | ✅ NCG 564 firmada digitalmente por presidenta CMF |
| §3.2 RAN organizado en capítulos navegables | ✅ Pero el índice "navegable" no está en la URL principal — hay que descubrir cuál es el master index |
| §3.3 Compendio Seguros: PDF por capítulo o anexo | ✅ Patrón `/web/compendio/...` confirmado para al menos NCG 221 |
| §4.1 `index.jsonl` único como master | ✅ Viable, alimentado desde 3 sources distintas (form + portal RAN + portal seguros) |
| §4.2 `p-limit(4)` no satura CMF | 🟢 Probable. No vi rate limiting en pruebas puntuales. Validar con corrida real |
| §4.2 User-Agent identificable | ✅ Server aceptó `cmf-mcp-spike/0.1 (+...)` sin warnings |
| §4.3 `pdfjs-dist` cubre 95% | 🟢 Sample de 2 (NCG 564 + NCG 221) ambos con texto limpio extraíble |
| §4.4 Segmentación con regex `^Artículo\s+(\d+\w*)` | ⚠️ NCG 564 (modificadora corta) **no tiene** artículos numerados, solo "1.", "2." como dispositivos. NCG 221 tiene estructura más típica. El segmenter debe tolerar normas modificadoras sin estructura jerárquica clásica |
| §4.6 Cadencia semanal | 🟢 Razonable. CMF emite varias normas por mes, no por día |

---

## 4. Sorpresas / hallazgos no contemplados

1. **Server header ofuscado** (`Server: XXXXXXX`). Probable WAF/CDN. No bloquea scraping pero indica que el sitio monitorea tráfico — un User-Agent identificable es buena ciudadanía y reduce riesgo de bloqueo.
2. **No hay `robots.txt`**. Sitios públicos del Estado chileno suelen omitirlo. Comportarnos como si dijera `Crawl-delay: 1` y respetar `If-Modified-Since` es lo correcto.
3. **Normas modificadoras vs normas sustantivas:** una NCG puede tener 2 párrafos (modificar otra) o 50 artículos (sustantiva). El segmenter debe distinguir y no asumir estructura jerárquica universal.
4. **Firma digital incrustada en el PDF.** Aparece como bloque al final ("Catherine Carolina Tornel Leon — Fecha: 2026.04.20 ..."). El segmenter debe identificarlo y no parsearlo como texto normativo.
5. **Cross-references textuales:** "modifica la Norma de Carácter General N°550", "Ley N°21.521". Útil para popular `norm_relations` automáticamente — regex `Norma de Car[áa]cter General N[°º]\s*(\d+)` es buena candidata.
6. **`cronologiabancaria.cmfchile.cl`** es un dominio aparte que parece ofrecer un índice cronológico estructurado de normativa bancaria (legacy SBIF). **Investigar en HdU-07** — podría ser la fuente más clean para el índice RAN.

---

## 5. Impacto en el backlog

### Sin cambios mayores
El schema (HdU-03) sigue válido. Los IDs predecibles para NCG (`ncg-{numero}`) confirmados.

### HdU-07 (Discovery) — **subdividir en 3 sub-tareas**
La estrategia única original ("recorrer portales y generar `index.jsonl`") debe partirse:
- **HdU-07a** — Discovery NCG/Circulares/Oficios vía form `normativa2.php` (mercados V y S). Output a `index.jsonl`.
- **HdU-07b** — Discovery RAN: probar `cronologiabancaria.cmfchile.cl` primero; si no sirve, crawl del portal de capítulos.
- **HdU-07c** — Discovery Compendio Seguros: form `normativa.php?mercado=S` + descubrir convención de paths bajo `/web/compendio/`.

### HdU-09 (PDF parser) — **agregar test contra norma modificadora**
Los samples de PDF parsean clean. Agregar a `tests/fixtures/pdfs/` al menos:
- 1 NCG modificadora corta (ej. NCG 564 — sin artículos numerados, solo dispositivos)
- 1 NCG sustantiva larga (ej. NCG 221 — 61 páginas, estructura completa)
- 1 capítulo RAN
- 1 capítulo Compendio Seguros

### HdU-11 (Segmentador) — **tolerar normas sin árbol clásico**
El segmenter no puede asumir que toda NCG tiene `Artículo 1`, `Artículo 2`, etc. Las modificadoras tienen "1.", "2." como dispositivos. El validator de invariantes debe ser configurable por tipo de norma.

### HdU-12 (Change detector) — **firmar metadata, no PDF binario**
El PDF binario incluye fecha de descarga implícita en metadata (timestamps PDF). Comparar `sha256` del **texto normalizado** es más estable que `sha256` del PDF crudo.

---

## 6. Próximos pasos sugeridos

1. **Cerrar el spike** — committear este documento y deletear `gbarosio/spike-cmf-discovery` cuando quede en main.
2. **Levantar issues GitHub** para las HdUs ajustadas (07a/b/c, 09 con fixtures específicos, 11 con tolerancia).
3. **Arrancar HdU-01 (bootstrap)** — los hallazgos de este spike no requieren código aún, así que el siguiente paso sigue siendo bootstrap del proyecto. El spike valida que el plan es ejecutable, no lo cambia drásticamente.
4. **Antes de HdU-07a:** descargar 5-10 PDFs reales (NCG, Circular, RAN, Compendio Seguros) a `tests/fixtures/pdfs/` para tener dataset offline durante todo el desarrollo del scraper.

---

## 7. Comandos reproducibles del spike

```bash
# Confirmar PDF de NCG accesible y parseable
curl -s -A "cmf-mcp-spike/0.1 (+https://github.com/gubaros/cmf-mcp)" \
  -o /tmp/ncg_564.pdf https://www.cmfchile.cl/normativa/ncg_564_2026.pdf
pdftotext /tmp/ncg_564.pdf - | head -40

# Confirmar PDF de Compendio Seguros accesible y parseable
curl -s -A "cmf-mcp-spike/0.1 (+https://github.com/gubaros/cmf-mcp)" \
  -o /tmp/compendio.pdf \
  "https://www.cmfchile.cl/institucional/mercados/ver_archivo.php?archivo=/web/compendio/ncg/ncg_221_2008.pdf"
pdftotext /tmp/compendio.pdf - | head -20

# Inspeccionar form de búsqueda para NCG mercado de valores
curl -s -A "cmf-mcp-spike/0.1 (+https://github.com/gubaros/cmf-mcp)" \
  "https://www.cmfchile.cl/institucional/legislacion_normativa/normativa2.php?tiponorma=NCG&hidden_mercado=V" \
  | head -200
```
