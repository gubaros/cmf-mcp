import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const norms = sqliteTable(
  "norms",
  {
    id: text("id").primaryKey(),
    tipo: text("tipo").notNull(),
    numero: text("numero").notNull(),
    titulo: text("titulo").notNull(),
    sector: text("sector").notNull(),
    fechaEmision: text("fecha_emision").notNull(),
    fechaVigencia: text("fecha_vigencia"),
    estado: text("estado").notNull(),
    normaOrigenId: text("norma_origen_id"),
    urlOficial: text("url_oficial").notNull(),
    hashContenido: text("hash_contenido").notNull(),
    fechaScrape: text("fecha_scrape").notNull(),
    validadoPor: text("validado_por"),
    fechaValidacion: text("fecha_validacion"),
  },
  (t) => [
    // list_norms: WHERE estado [AND tipo] [AND sector] — cubre todas las combinaciones de filtro
    // server_info: WHERE estado = 'VIGENTE' GROUP BY sector
    index("norms_estado_tipo_sector_idx").on(t.estado, t.tipo, t.sector),
    // server_info: SELECT MAX(fecha_scrape) — evita full scan
    index("norms_fecha_scrape_idx").on(t.fechaScrape),
  ],
);

export const sections = sqliteTable(
  "sections",
  {
    id: text("id").primaryKey(),
    normId: text("norm_id")
      .notNull()
      .references(() => norms.id),
    parentId: text("parent_id"),
    nivel: text("nivel").notNull(),
    numero: text("numero").notNull(),
    rubrica: text("rubrica"),
    orden: integer("orden").notNull(),
  },
  (t) => [
    // get_norm con secciones: WHERE norm_id = ? ORDER BY orden
    index("sections_norm_id_orden_idx").on(t.normId, t.orden),
  ],
);

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    normId: text("norm_id")
      .notNull()
      .references(() => norms.id),
    sectionId: text("section_id").references(() => sections.id),
    numero: text("numero").notNull(),
    rubrica: text("rubrica"),
    texto: text("texto").notNull(),
    textoOriginal: text("texto_original").notNull(),
    sector: text("sector").notNull(),
    estado: text("estado").notNull(),
    orden: integer("orden").notNull(),
    hashContenido: text("hash_contenido").notNull(),
    fechaUltimaModificacion: text("fecha_ultima_modificacion").notNull(),
  },
  (t) => [
    // get_norm (includeArticles): WHERE norm_id = ? ORDER BY orden — cubre filtro Y sort
    // changeDetector: WHERE norm_id = ?
    index("articles_norm_id_orden_idx").on(t.normId, t.orden),
  ],
);

export const articlesHistory = sqliteTable(
  "articles_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: text("article_id").notNull(),
    normId: text("norm_id").notNull(),
    sectionId: text("section_id"),
    numero: text("numero").notNull(),
    rubrica: text("rubrica"),
    texto: text("texto").notNull(),
    textoOriginal: text("texto_original").notNull(),
    sector: text("sector").notNull(),
    estado: text("estado").notNull(),
    orden: integer("orden").notNull(),
    hashContenido: text("hash_contenido").notNull(),
    fechaUltimaModificacion: text("fecha_ultima_modificacion").notNull(),
    validFrom: text("valid_from").notNull(),
    validTo: text("valid_to").notNull(),
  },
  (t) => [
    // changeDetector: archiva artículos por norm_id
    index("art_hist_norm_id_idx").on(t.normId),
    // HdU-38: versiones históricas de un artículo: WHERE article_id = ?
    index("art_hist_article_id_idx").on(t.articleId),
  ],
);

export const normRelations = sqliteTable(
  "norm_relations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceNormId: text("source_norm_id")
      .notNull()
      .references(() => norms.id),
    targetNormId: text("target_norm_id")
      .notNull()
      .references(() => norms.id),
    tipo: text("tipo").notNull(),
    detalle: text("detalle"),
  },
  (t) => [
    // get_relations: normas que esta norma modifica/deroga
    index("norm_rel_source_idx").on(t.sourceNormId),
    // get_relations: normas que modifican/derogan a esta
    index("norm_rel_target_idx").on(t.targetNormId),
  ],
);

export const validationLog = sqliteTable(
  "validation_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    normId: text("norm_id")
      .notNull()
      .references(() => norms.id),
    validador: text("validador").notNull(),
    fecha: text("fecha").notNull(),
    tipoRevision: text("tipo_revision").notNull(),
    resultado: text("resultado").notNull(),
    comentario: text("comentario"),
  },
  (t) => [
    // server_info: COUNT(DISTINCT norm_id) FROM validation_log
    index("validation_log_norm_id_idx").on(t.normId),
  ],
);
