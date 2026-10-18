CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`checked_at` text NOT NULL,
	`trigger_installed` integer NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`unchanged_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL
);
