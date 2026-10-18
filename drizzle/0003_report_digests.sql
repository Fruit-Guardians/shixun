CREATE TABLE `report_stories` (
	`report_id` text NOT NULL,
	`idx` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text NOT NULL,
	`tags` text NOT NULL,
	PRIMARY KEY(`report_id`, `idx`)
);
--> statement-breakpoint
ALTER TABLE `reports` ADD `char_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `link_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `digest_version` integer DEFAULT 0 NOT NULL;