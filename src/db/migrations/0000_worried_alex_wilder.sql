CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`norm_id` text NOT NULL,
	`section_id` text,
	`numero` text NOT NULL,
	`rubrica` text,
	`texto` text NOT NULL,
	`texto_original` text NOT NULL,
	`sector` text NOT NULL,
	`estado` text NOT NULL,
	`orden` integer NOT NULL,
	`hash_contenido` text NOT NULL,
	`fecha_ultima_modificacion` text NOT NULL,
	FOREIGN KEY (`norm_id`) REFERENCES `norms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `articles_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` text NOT NULL,
	`norm_id` text NOT NULL,
	`section_id` text,
	`numero` text NOT NULL,
	`rubrica` text,
	`texto` text NOT NULL,
	`texto_original` text NOT NULL,
	`sector` text NOT NULL,
	`estado` text NOT NULL,
	`orden` integer NOT NULL,
	`hash_contenido` text NOT NULL,
	`fecha_ultima_modificacion` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `norm_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_norm_id` text NOT NULL,
	`target_norm_id` text NOT NULL,
	`tipo` text NOT NULL,
	`detalle` text,
	FOREIGN KEY (`source_norm_id`) REFERENCES `norms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_norm_id`) REFERENCES `norms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `norms` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`numero` text NOT NULL,
	`titulo` text NOT NULL,
	`sector` text NOT NULL,
	`fecha_emision` text NOT NULL,
	`fecha_vigencia` text,
	`estado` text NOT NULL,
	`norma_origen_id` text,
	`url_oficial` text NOT NULL,
	`hash_contenido` text NOT NULL,
	`fecha_scrape` text NOT NULL,
	`validado_por` text,
	`fecha_validacion` text
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`norm_id` text NOT NULL,
	`parent_id` text,
	`nivel` text NOT NULL,
	`numero` text NOT NULL,
	`rubrica` text,
	`orden` integer NOT NULL,
	FOREIGN KEY (`norm_id`) REFERENCES `norms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `validation_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`norm_id` text NOT NULL,
	`validador` text NOT NULL,
	`fecha` text NOT NULL,
	`tipo_revision` text NOT NULL,
	`resultado` text NOT NULL,
	`comentario` text,
	FOREIGN KEY (`norm_id`) REFERENCES `norms`(`id`) ON UPDATE no action ON DELETE no action
);
