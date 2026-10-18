CREATE INDEX `report_versions_report_id_idx` ON `report_versions` (`report_id`);--> statement-breakpoint
CREATE INDEX `reports_date_topic_idx` ON `reports` (`date`,`topic`);--> statement-breakpoint
CREATE INDEX `sync_runs_received_at_idx` ON `sync_runs` (`received_at`);