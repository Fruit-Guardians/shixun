CREATE TABLE `feed_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`last_run_at` text NOT NULL,
	`ok` integer NOT NULL,
	`fetched` integer DEFAULT 0 NOT NULL,
	`error` text,
	`latest_at` text
);
--> statement-breakpoint
CREATE TABLE `feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`channel` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`discussion_url` text,
	`summary` text DEFAULT '' NOT NULL,
	`author` text,
	`score` integer,
	`severity` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`published_at` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feed_items_published_idx` ON `feed_items` (`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `feed_items_source_published_idx` ON `feed_items` (`source`,`published_at`,`id`);