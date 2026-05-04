#!/usr/bin/env bash
# Crea el GitHub Release v0.1.0 con cmf_norms.db adjunto.
# Uso: bash scripts/release.sh
#
# Prerrequisitos:
#   - gh autenticado (gh auth login)
#   - data/cmf_norms.db existente y con ingest completo
#   - pnpm build exitoso

set -euo pipefail

VERSION="v0.1.0"
DB_PATH="data/cmf_norms.db"
CORPUS_TAG="corpus-$(date +%Y.%m.%d)"

# Verificaciones previas
if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: $DB_PATH no existe. Correr pnpm ingest primero." >&2
  exit 1
fi

echo "==> Build..."
pnpm build

echo "==> Typecheck + lint + test..."
pnpm typecheck && pnpm lint && pnpm test --run

echo "==> SHA256 de $DB_PATH..."
SHA256=$(shasum -a 256 "$DB_PATH" | awk '{print $1}')
DB_SIZE=$(du -sh "$DB_PATH" | awk '{print $1}')
echo "    $SHA256  $DB_PATH ($DB_SIZE)"

echo "==> Notas del release..."
NOTES=$(cat <<EOF
## CMF MCP Server $VERSION

Primer release público. Incluye normativa CMF (Chile): **NCG · Circulares · Oficios Circulares · RAN (Banca)**.

### Descarga

Descarga \`cmf_norms.db\` y colócala en \`data/\` del repo. Ver [README](https://github.com/gubaros/cmf-mcp#inicio-rápido) para instrucciones completas.

### Verificación de integridad

\`\`\`
SHA256: $SHA256
Tamaño: $DB_SIZE
\`\`\`

\`\`\`bash
shasum -a 256 data/cmf_norms.db
\`\`\`

### Cobertura del corpus

- NCG vigentes (valores + seguros)
- Circulares y Oficios Circulares
- RAN completo (Banca) — 98 capítulos/secciones
- **Pendiente v0.2:** Compendio Seguros (URL del índice desconocida)

### Tools MCP incluidas

\`server_info\` · \`list_norms\` · \`get_norm\` · \`get_article\` · \`search_articles\`

### Corpus tag

\`$CORPUS_TAG\` — tag separado para identificar la versión del corpus independientemente del código.
EOF
)

echo "==> Creando tag $VERSION..."
git tag -a "$VERSION" -m "Release $VERSION"
git tag -a "$CORPUS_TAG" -m "Corpus snapshot $CORPUS_TAG"
git push origin "$VERSION" "$CORPUS_TAG"

echo "==> Creando GitHub Release $VERSION..."
gh release create "$VERSION" \
  --title "CMF MCP Server $VERSION" \
  --notes "$NOTES" \
  "$DB_PATH#cmf_norms.db"

echo ""
echo "✓ Release $VERSION publicado."
echo "  DB: $DB_PATH ($DB_SIZE)"
echo "  SHA256: $SHA256"
echo "  Corpus tag: $CORPUS_TAG"
