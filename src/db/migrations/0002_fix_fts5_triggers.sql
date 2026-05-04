-- Fix FTS5 insert trigger: '' is not a valid FTS5 command — omit the command column for plain inserts
DROP TRIGGER IF EXISTS articles_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS articles_au;
--> statement-breakpoint
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, id, norm_id, sector, texto)
  VALUES (new.rowid, new.id, new.norm_id, new.sector, new.texto);
END;
--> statement-breakpoint
CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, id, norm_id, sector, texto)
  VALUES ('delete', old.rowid, old.id, old.norm_id, old.sector, old.texto);
  INSERT INTO articles_fts(rowid, id, norm_id, sector, texto)
  VALUES (new.rowid, new.id, new.norm_id, new.sector, new.texto);
END;
