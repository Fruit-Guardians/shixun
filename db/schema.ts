import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(), date: text("date").notNull(), title: text("title").notNull(),
  topic: text("topic").notNull(), raw: text("raw").notNull(), hash: text("hash").notNull(),
  source: text("source").notNull(), sourceFileId: text("source_file_id"),
  importedAt: text("imported_at").notNull(), revision: integer("revision").notNull().default(1),
});
export const reportVersions = sqliteTable("report_versions", {
  id: text("id").primaryKey(), reportId: text("report_id").notNull(), raw: text("raw").notNull(),
  hash: text("hash").notNull(), savedAt: text("saved_at").notNull(),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(), receivedAt: text("received_at").notNull(),
  checkedAt: text("checked_at").notNull(), triggerInstalled: integer("trigger_installed").notNull(),
  created: integer("created_count").notNull().default(0), updated: integer("updated_count").notNull().default(0),
  unchanged: integer("unchanged_count").notNull().default(0), failed: integer("failed_count").notNull().default(0),
});
