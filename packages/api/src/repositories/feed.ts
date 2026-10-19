import type { FeedSeverity, FeedSource } from '#shared';
import type { FeedChannel } from '../feeds/channels.ts';
import type { FeedDraft } from '../feeds/parsers.ts';

interface FeedItemRow {
  id: string;
  source: string;
  channel: string;
  title: string;
  url: string;
  discussion_url: string | null;
  summary: string;
  author: string | null;
  score: number | null;
  severity: string | null;
  tags: string;
  published_at: string;
}

export interface StoredFeedItem {
  id: string;
  source: FeedSource;
  channel: string;
  title: string;
  url: string;
  discussionUrl: string | null;
  summary: string;
  author: string | null;
  score: number | null;
  severity: FeedSeverity | null;
  tags: string[];
  publishedAt: string;
}

export interface FeedChannelRow {
  id: string;
  lastRunAt: string;
  ok: boolean;
  fetched: number;
  error: string | null;
  /** 上次抓取时源里最新一篇的发布时间（包括超出保留期没有入库的）；还没抓到过时为 null。 */
  latestAt: string | null;
}

function parseTags(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function toItem(row: FeedItemRow): StoredFeedItem {
  return {
    id: String(row.id),
    source: row.source as FeedSource,
    channel: String(row.channel),
    title: String(row.title),
    url: String(row.url),
    discussionUrl: row.discussion_url ?? null,
    summary: String(row.summary ?? ''),
    author: row.author ?? null,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    severity: (row.severity as FeedSeverity | null) ?? null,
    tags: parseTags(String(row.tags ?? '[]')),
    publishedAt: String(row.published_at),
  };
}

export interface FeedPage {
  source: FeedSource | null;
  limit: number;
  /** 只取排在这一条之后（更早）的条目。 */
  before: { publishedAt: string; id: string } | null;
}

/** 按发布时间倒序；走 feed_items_published_idx / feed_items_source_published_idx。多取一条用来判断是否还有下一页。 */
export async function listFeedItems(db: D1Database, page: FeedPage): Promise<StoredFeedItem[]> {
  const where: string[] = [];
  const values: (string | number)[] = [];
  if (page.source) {
    where.push('source = ?');
    values.push(page.source);
  }
  if (page.before) {
    where.push('(published_at < ? OR (published_at = ? AND id < ?))');
    values.push(page.before.publishedAt, page.before.publishedAt, page.before.id);
  }
  const sql =
    'SELECT id,source,channel,title,url,discussion_url,summary,author,score,severity,tags,published_at FROM feed_items' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY published_at DESC, id DESC LIMIT ?';
  const { results } = await db
    .prepare(sql)
    .bind(...values, page.limit + 1)
    .all<FeedItemRow>();
  return results.map(toItem);
}

export async function listFeedChannels(db: D1Database): Promise<FeedChannelRow[]> {
  const { results } = await db.prepare('SELECT id,last_run_at,ok,fetched,error,latest_at FROM feed_channels').all<{
    id: string;
    last_run_at: string;
    ok: number;
    fetched: number;
    error: string | null;
    latest_at: string | null;
  }>();
  return results.map((row) => ({
    id: String(row.id),
    lastRunAt: String(row.last_run_at),
    ok: Boolean(row.ok),
    fetched: Number(row.fetched),
    error: row.error ?? null,
    latestAt: row.latest_at ?? null,
  }));
}

/**
 * 写入一次抓取的结果：新条目插入，已有条目有变化时更新标题、得分等，但保留第一次的发布时间
 * （GitHub Trending 的发布时间即首次上榜时间）。同一个 batch 里清理过期条目、记录频道状态。
 */
export async function saveFeedRun(
  db: D1Database,
  channel: FeedChannel,
  drafts: readonly FeedDraft[],
  run: { at: string; error: string | null; pruneBefore: string; fetched: number; latestAt: string | null },
): Promise<void> {
  const upserts = drafts.map((d) =>
    db
      .prepare(
        'INSERT INTO feed_items (id,source,channel,title,url,discussion_url,summary,author,score,severity,tags,published_at,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ' +
          'ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,discussion_url=excluded.discussion_url,summary=excluded.summary,' +
          'author=excluded.author,score=excluded.score,severity=excluded.severity,tags=excluded.tags,fetched_at=excluded.fetched_at ' +
          // 内容没变就不写：同一批条目每次抓取都会再出现，跳过可以省下大部分 D1 写入。
          'WHERE feed_items.title IS NOT excluded.title OR feed_items.url IS NOT excluded.url OR feed_items.discussion_url IS NOT excluded.discussion_url ' +
          'OR feed_items.summary IS NOT excluded.summary OR feed_items.author IS NOT excluded.author OR feed_items.score IS NOT excluded.score ' +
          'OR feed_items.severity IS NOT excluded.severity OR feed_items.tags IS NOT excluded.tags',
      )
      .bind(
        `${channel.id}:${d.key}`,
        channel.source,
        channel.id,
        d.title,
        d.url,
        d.discussionUrl,
        d.summary,
        d.author,
        d.score,
        d.severity,
        JSON.stringify(d.tags),
        d.publishedAt,
        run.at,
      ),
  );
  await db.batch([
    ...upserts,
    db.prepare('DELETE FROM feed_items WHERE published_at < ?').bind(run.pruneBefore),
    db
      .prepare(
        'INSERT INTO feed_channels (id,last_run_at,ok,fetched,error,latest_at) VALUES (?,?,?,?,?,?) ' +
          // 这次失败或没有条目时，保留上次记下的最新发布时间。
          'ON CONFLICT(id) DO UPDATE SET last_run_at=excluded.last_run_at,ok=excluded.ok,fetched=excluded.fetched,error=excluded.error,' +
          'latest_at=COALESCE(excluded.latest_at,feed_channels.latest_at)',
      )
      .bind(channel.id, run.at, run.error ? 0 : 1, run.fetched, run.error, run.latestAt),
  ]);
}
