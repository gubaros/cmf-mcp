CREATE INDEX `articles_norm_id_orden_idx` ON `articles` (`norm_id`,`orden`);--> statement-breakpoint
CREATE INDEX `art_hist_norm_id_idx` ON `articles_history` (`norm_id`);--> statement-breakpoint
CREATE INDEX `art_hist_article_id_idx` ON `articles_history` (`article_id`);--> statement-breakpoint
CREATE INDEX `norm_rel_source_idx` ON `norm_relations` (`source_norm_id`);--> statement-breakpoint
CREATE INDEX `norm_rel_target_idx` ON `norm_relations` (`target_norm_id`);--> statement-breakpoint
CREATE INDEX `norms_estado_tipo_sector_idx` ON `norms` (`estado`,`tipo`,`sector`);--> statement-breakpoint
CREATE INDEX `sections_norm_id_orden_idx` ON `sections` (`norm_id`,`orden`);--> statement-breakpoint
CREATE INDEX `validation_log_norm_id_idx` ON `validation_log` (`norm_id`);