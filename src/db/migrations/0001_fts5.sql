CREATE VIRTUAL TABLE articles_fts USING fts5(
  id UNINDEXED,
  norm_id UNINDEXED,
  sector UNINDEXED,
  texto,
  content=articles,
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, id, norm_id, sector, texto)
  VALUES (new.rowid, new.id, new.norm_id, new.sector, new.texto);
END;
--> statement-breakpoint
CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, id, norm_id, sector, texto)
  VALUES ('delete', old.rowid, old.id, old.norm_id, old.sector, old.texto);
END;
--> statement-breakpoint
CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, id, norm_id, sector, texto)
  VALUES ('delete', old.rowid, old.id, old.norm_id, old.sector, old.texto);
  INSERT INTO articles_fts(rowid, id, norm_id, sector, texto)
  VALUES (new.rowid, new.id, new.norm_id, new.sector, new.texto);
END;
