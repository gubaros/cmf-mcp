# CMF MCP Server

Servidor [MCP](https://modelcontextprotocol.io/) que expone la normativa de la **Comisión para el Mercado Financiero (CMF) de Chile** a clientes como Claude Desktop, Cursor o cualquier agente que hable MCP.

Cubre: **NCG · Circulares · Oficios Circulares · RAN (Banca)**  
Estado Compendio Seguros: pendiente (URL del índice desconocida).

Gratuito y open-source. No genera opinión legal: es una capa de recuperación auditada. La interpretación queda en el modelo cliente y el usuario.

---

## Inicio rápido

### Prerrequisitos

- Node.js 20 LTS o superior
- pnpm (`npm i -g pnpm`)

### 1. Clonar e instalar

```bash
git clone https://github.com/gubaros/cmf-mcp.git
cd cmf-mcp
pnpm install
```

### 2. Descargar la base de datos

Descarga `cmf_norms.db` desde la [última Release](https://github.com/gubaros/cmf-mcp/releases/latest) y colócala en `data/`:

```bash
mkdir -p data
# descarga cmf_norms.db del Release y muévela aquí:
mv ~/Downloads/cmf_norms.db data/
```

Verifica la integridad con el SHA256 publicado en las notas de la Release:

```bash
shasum -a 256 data/cmf_norms.db
```

### 3. Compilar

```bash
pnpm build
```

### 4. Configurar Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) y agrega el servidor:

```json
{
  "mcpServers": {
    "cmf": {
      "command": "node",
      "args": ["/ruta/absoluta/a/cmf-mcp/dist/server.js"]
    }
  }
}
```

Reemplaza `/ruta/absoluta/a/cmf-mcp` con el path real donde clonaste el repo. Reinicia Claude Desktop.

---

## Tools disponibles

| Tool | Descripción |
|------|-------------|
| `server_info` | Versión, fecha del último scrape, total de normas por sector |
| `list_norms` | Filtra normas por tipo, sector, estado, fecha — solo metadata |
| `get_norm` | Metadata + índice de artículos de una norma por ID |
| `get_article` | Texto íntegro de un artículo con `urlOficial` para citar |
| `search_articles` | Búsqueda full-text FTS5 con snippets y score |

### Convención de IDs

```
NCG:          ncg-{numero}       → ncg-461
Circular:     circ-{numero}      → circ-2238
Oficio Circ:  ofc-{numero}       → ofc-123
RAN:          ran-{cap}-{sec}    → ran-1-13
Artículo:     {normId}-art-{num} → ncg-461-art-12
```

### Ejemplos de uso

```
# Listar NCG vigentes del sector valores
list_norms(tipo="NCG", sector="VALORES")

# Texto del artículo 5 de la NCG 461
get_article(id="ncg-461-art-5")

# Buscar normas sobre "capital mínimo" en banca
search_articles(q="capital mínimo", sector="BANCARIO")
```

---

## Audit trail

Cada llamada a una tool queda registrada en `data/logs/{YYYY-MM-DD}.jsonl` (modo producción) o en stderr (modo dev, por defecto).

Cada entrada incluye: `timestamp`, `requestId`, `tool`, `input`, `normIds` y `articleIds` retornados, `urlOficial` de cada cita, `latencyMs`, `result`.

Para activar el log a archivo:

```bash
NODE_ENV=production node dist/server.js
```

---

## Correr el scraper (opcional)

Si quieres generar la DB tú mismo en lugar de descargarla:

```bash
# Solo discovery (regenera data/index.jsonl):
pnpm discover

# Solo ingest (PDF → SQLite, requiere data/ con PDFs descargados):
pnpm ingest

# Pipeline completo:
pnpm scrape
```

El scraper requiere **tesseract** instalado (`brew install tesseract tesseract-lang`) para procesar los PDFs escaneados (89% del corpus CMF usa Alaris Capture Pro).

---

## Limitaciones conocidas

- **Compendio Seguros**: no incluido en v0.1. URL del índice desconocida. Contribuciones bienvenidas.
- **Normas derogadas**: incluidas en la DB pero excluidas por defecto en búsquedas. Pasar `estado="DEROGADA"` para consultarlas.
- **Interpretación**: este servidor devuelve texto y metadata. No interpreta, no opina, no asesora legalmente.

---

## Contribuir

Issues y PRs bienvenidos en [gubaros/cmf-mcp](https://github.com/gubaros/cmf-mcp).  
Para cambios de schema, crear migración Drizzle (`pnpm db:generate`). Ver [DEVELOPER.md](DEVELOPER.md) para arquitectura y [SCRAPER.md](SCRAPER.md) para el pipeline de datos.
