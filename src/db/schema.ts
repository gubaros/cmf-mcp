import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const norms = sqliteTable("norms", {
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
});

export const sections = sqliteTable("sections", {
  id: text("id").primaryKey(),
  normId: text("norm_id")
    .notNull()
    .references(() => norms.id),
  parentId: text("parent_id"),
  nivel: text("nivel").notNull(),
  numero: text("numero").notNull(),
  rubrica: text("rubrica"),
  orden: integer("orden").notNull(),
});

export const articles = sqliteTable("articles", {
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
});

export const articlesHistory = sqliteTable("articles_history", {
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
});

export const normRelations = sqliteTable("norm_relations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceNormId: text("source_norm_id")
    .notNull()
    .references(() => norms.id),
  targetNormId: text("target_norm_id")
    .notNull()
    .references(() => norms.id),
  tipo: text("tipo").notNull(),
  detalle: text("detalle"),
});

export const validationLog = sqliteTable("validation_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  normId: text("norm_id")
    .notNull()
    .references(() => norms.id),
  validador: text("validador").notNull(),
  fecha: text("fecha").notNull(),
  tipoRevision: text("tipo_revision").notNull(),
  resultado: text("resultado").notNull(),
  comentario: text("comentario"),
});
