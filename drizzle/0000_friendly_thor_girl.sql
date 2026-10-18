CREATE TABLE `report_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`raw` text NOT NULL,
	`hash` text NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`raw` text NOT NULL,
	`hash` text NOT NULL,
	`source` text NOT NULL,
	`source_file_id` text,
	`imported_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
