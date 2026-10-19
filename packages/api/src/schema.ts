import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 只用于 drizzle-kit 生成迁移；运行时 SQL 在 repositories/ 里。 */
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    title: text('title').notNull(),
    topic: text('topic').notNull(),
    raw: text('raw').notNull(),
    hash: text('hash').notNull(),
    source: text('source').notNull(),
    sourceFileId: text('source_file_id'),
    importedAt: text('imported_at').notNull(),
    revision: integer('revision').notNull().default(1),
    /** 由原文派生的统计；digest_version 落后于 DIGEST_VERSION 时会被重建。 */
    charCount: integer('char_count').notNull().default(0),
    linkCount: integer('link_count').notNull().default(0),
    digestVersion: integer('digest_version').notNull().default(0),
  },
  (table) => [index('reports_date_topic_idx').on(table.date, table.topic)],
);

/** 每期「① 昨日重要动态」解析出的条目；列表读摘要，搜索读正文。 */
export const reportStories = sqliteTable(
  'report_stories',
  {
    reportId: text('report_id').notNull(),
    idx: integer('idx').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    body: text('body').notNull(),
    /** JSON 字符串数组。 */
    tags: text('tags').notNull(),
  },
  (table) => [primaryKey({ columns: [table.reportId, table.idx] })],
);

export const reportVersions = sqliteTable(
  'report_versions',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id').notNull(),
    raw: text('raw').notNull(),
    hash: text('hash').notNull(),
    savedAt: text('saved_at').notNull(),
  },
  (table) => [index('report_versions_report_id_idx').on(table.reportId)],
);

export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: text('id').primaryKey(),
    receivedAt: text('received_at').notNull(),
    checkedAt: text('checked_at').notNull(),
    triggerInstalled: integer('trigger_installed').notNull(),
    created: integer('created_count').notNull().default(0),
    updated: integer('updated_count').notNull().default(0),
    unchanged: integer('unchanged_count').notNull().default(0),
    failed: integer('failed_count').notNull().default(0),
    /** JSON 数组：SyncFailure[]。 */
    failures: text('failures').notNull().default('[]'),
  },
  (table) => [index('sync_runs_received_at_idx').on(table.receivedAt)],
);

/** 信源速递：定时抓取的公开条目。id 为 `<channel>:<来源内 id>`，重复抓到时更新标题、得分等。 */
export const feedItems = sqliteTable(
  'feed_items',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    channel: text('channel').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    /** 讨论或详情页（Hacker News 评论、GitHub 公告页）；没有时为 null。 */
    discussionUrl: text('discussion_url'),
    summary: text('summary').notNull().default(''),
    author: text('author'),
    score: integer('score'),
    severity: text('severity'),
    /** JSON 字符串数组。 */
    tags: text('tags').notNull().default('[]'),
    publishedAt: text('published_at').notNull(),
    fetchedAt: text('fetched_at').notNull(),
  },
  (table) => [
    index('feed_items_published_idx').on(table.publishedAt, table.id),
    index('feed_items_source_published_idx').on(table.source, table.publishedAt, table.id),
  ],
);

/** 每个频道最近一次抓取的结果。 */
export const feedChannels = sqliteTable('feed_channels', {
  id: text('id').primaryKey(),
  lastRunAt: text('last_run_at').notNull(),
  ok: integer('ok').notNull(),
  fetched: integer('fetched').notNull().default(0),
  error: text('error'),
  /** 最近一次抓到的条目里最新的发布时间（含保留期以外的），供信息源页面显示「最近文章」；没抓到过为 null。 */
  latestAt: text('latest_at'),
});
