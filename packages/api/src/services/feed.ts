import { FEED_RETENTION_MS } from '#shared';
import type { FeedChannelStatus, FeedChannelsResponse, FeedItem, FeedResponse, FeedSource } from '#shared';
import type { ApiEnv } from '../env.ts';
import { FEED_CHANNELS, OSV_DETAILS_PER_RUN, channelCost, findChannel, pickDueChannels, rankChannels } from '../feeds/channels.ts';
import type { FeedChannel } from '../feeds/channels.ts';
import {
  parseFeedXml,
  parseGhsa,
  parseGithubTrending,
  parseHackerNews,
  parseHfModels,
  parseHfPapers,
  parseKev,
  parseLobsters,
  parseNvd,
  parseOsv,
  parseOsvIndex,
  parseRuanyfWeekly,
  parseV2ex,
} from '../feeds/parsers.ts';
import type { FeedDraft } from '../feeds/parsers.ts';
import { readCapped } from '../feeds/text.ts';
import { listFeedChannels, listFeedItems, saveFeedRun } from '../repositories/feed.ts';

export type FeedFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface FeedDeps {
  fetch: FeedFetch;
  now: Date;
  env: Pick<ApiEnv, 'GITHUB_TOKEN' | 'NVD_API_KEY'>;
}

const USER_AGENT = 'shixun-feed/1.0 (+https://github.com/Fruit-Guardians/shixun)';
const TIMEOUT_MS = 20_000;
/** NVD 偶尔要十几秒才响应。 */
const NVD_TIMEOUT_MS = 45_000;
/** 单个响应最多读取的字节数；GitHub Blog、OpenAI 的 RSS 带全文，有 1MB 以上。 */
const MAX_RESPONSE_BYTES = 1_000_000;
/** NVD 查询的时间窗：最近 48 小时。频道约每小时抓一次，窗口有重叠，靠 id 去重。 */
const NVD_WINDOW_MS = 48 * 60 * 60 * 1000;
/** KEV 查询的时间窗（按列入 KEV 的日期）：与条目保留时长一致。NVD 要求不超过 120 天。 */
const KEV_WINDOW_MS = FEED_RETENTION_MS;
/** OSV 目录只需要开头几十行。 */
const OSV_INDEX_BYTES = 16_000;
/** 手动「全部抓取」一次最多用的子请求数；Workers 免费版每次调用上限 50，留一点余量。 */
export const FEED_REFRESH_BUDGET = 40;

/** 抓取失败；message 只含状态码、超时之类，会公开展示。 */
export class FeedFetchError extends Error {
  override readonly name = 'FeedFetchError';
}

async function get(deps: FeedDeps, url: string, headers: Record<string, string>, timeoutMs = TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES): Promise<string> {
  let response: Response;
  try {
    response = await deps.fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new FeedFetchError(error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? '请求超时' : '网络错误');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const limited = (response.status === 403 || response.status === 429) && url.startsWith('https://api.github.com/');
    throw new FeedFetchError(limited ? `HTTP ${response.status}：GitHub API 限流，可配置 GITHUB_TOKEN` : `HTTP ${response.status}`);
  }
  return readCapped(response, maxBytes);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new FeedFetchError('返回内容不是 JSON');
  }
}

async function fetchNvd(channel: FeedChannel, deps: FeedDeps): Promise<FeedDraft[]> {
  const end = deps.now;
  const start = new Date(end.getTime() - NVD_WINDOW_MS);
  const headers: Record<string, string> = deps.env.NVD_API_KEY ? { apiKey: deps.env.NVD_API_KEY } : {};
  // cvssV3Severity 一次只能给一个值；只有 v4 评分的高危条目目前几乎没有。
  const drafts: FeedDraft[] = [];
  for (const severity of ['CRITICAL', 'HIGH']) {
    const query = new URLSearchParams({ pubStartDate: start.toISOString(), pubEndDate: end.toISOString(), cvssV3Severity: severity });
    // noRejected 是不带值的开关参数。
    drafts.push(...parseNvd(parseJson(await get(deps, `${channel.url}?${query}&noRejected`, headers, NVD_TIMEOUT_MS)), deps.now));
  }
  return drafts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

async function fetchKev(channel: FeedChannel, deps: FeedDeps): Promise<FeedDraft[]> {
  const end = deps.now;
  const start = new Date(end.getTime() - KEV_WINDOW_MS);
  const headers: Record<string, string> = deps.env.NVD_API_KEY ? { apiKey: deps.env.NVD_API_KEY } : {};
  const query = new URLSearchParams({ kevStartDate: start.toISOString(), kevEndDate: end.toISOString() });
  // hasKev 也是不带值的开关参数。
  return parseKev(parseJson(await get(deps, `${channel.url}?hasKev&${query}`, headers, NVD_TIMEOUT_MS)), deps.now);
}

/** OSV：先读生态目录（按修改时间倒序），再取最新几条的详情；只收保留期内发布的。单条详情失败就跳过。 */
async function fetchOsv(channel: FeedChannel, deps: FeedDeps): Promise<FeedDraft[]> {
  const ids = parseOsvIndex(await get(deps, `${channel.url}modified_id.csv`, { Accept: 'text/csv' }, TIMEOUT_MS, OSV_INDEX_BYTES), OSV_DETAILS_PER_RUN);
  if (ids.length === 0) return [];
  const results = await Promise.allSettled(ids.map(async (id) => parseOsv(parseJson(await get(deps, `${channel.url}${encodeURIComponent(id)}.json`, { Accept: 'application/json' })), deps.now)));
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
  const since = new Date(deps.now.getTime() - FEED_RETENTION_MS).toISOString();
  return results
    .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    .filter((d) => d.publishedAt >= since)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

const JSON_ACCEPT = { Accept: 'application/json' };
const FEED_ACCEPT = { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' };

/** 抓取并解析一个频道（不写库）。 */
export async function fetchChannel(channel: FeedChannel, deps: FeedDeps): Promise<FeedDraft[]> {
  switch (channel.parser) {
    case 'hackernews':
      return parseHackerNews(parseJson(await get(deps, channel.url, JSON_ACCEPT)), deps.now);
    case 'lobsters':
      return parseLobsters(parseJson(await get(deps, channel.url, JSON_ACCEPT)), deps.now);
    case 'v2ex':
      return parseV2ex(parseJson(await get(deps, channel.url, JSON_ACCEPT)), deps.now);
    case 'hf-papers':
      return parseHfPapers(parseJson(await get(deps, channel.url, JSON_ACCEPT)), deps.now);
    case 'hf-models':
      return parseHfModels(parseJson(await get(deps, channel.url, JSON_ACCEPT)), deps.now);
    case 'github-trending':
      return parseGithubTrending(await get(deps, channel.url, { Accept: 'text/html' }), deps.now);
    case 'feed':
      return parseFeedXml(await get(deps, channel.url, FEED_ACCEPT, TIMEOUT_MS, channel.maxBytes), channel.url, deps.now, { titlePrefix: channel.titlePrefix });
    case 'ruanyf-weekly':
      return parseRuanyfWeekly(await get(deps, channel.url, FEED_ACCEPT), deps.now);
    case 'nvd':
      return fetchNvd(channel, deps);
    case 'kev':
      return fetchKev(channel, deps);
    case 'osv':
      return fetchOsv(channel, deps);
    case 'ghsa': {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
      if (deps.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${deps.env.GITHUB_TOKEN}`;
      const query = new URLSearchParams({ type: 'reviewed', per_page: '30', sort: 'published', direction: 'desc' });
      return parseGhsa(parseJson(await get(deps, `${channel.url}?${query}`, headers)), deps.now);
    }
  }
}


type ChannelRun = { lastRunAt: string; ok: boolean; fetched: number; error: string | null; latestAt: string | null };

function statusOf(channel: FeedChannel, row: ChannelRun | undefined): FeedChannelStatus {
  return {
    id: channel.id,
    source: channel.source,
    group: channel.group,
    name: channel.name,
    description: channel.description,
    homepage: channel.homepage,
    everyMinutes: channel.everyMinutes,
    lastRunAt: row?.lastRunAt ?? null,
    ok: row?.ok ?? false,
    fetched: row?.fetched ?? 0,
    error: row?.error ?? null,
    latestAt: row?.latestAt ?? null,
  };
}

/** 抓取一个频道并入库；失败也会记录频道状态，不抛出。 */
export async function runFeedChannel(db: D1Database, channel: FeedChannel, deps: FeedDeps): Promise<FeedChannelStatus> {
  let drafts: FeedDraft[] = [];
  let error: string | null = null;
  try {
    drafts = await fetchChannel(channel, deps);
    // 大多数来源正常时总有内容；解析出 0 条多半是页面或格式变了。
    if (drafts.length === 0 && !channel.mayBeEmpty) error = '没有解析出条目';
  } catch (caught) {
    if (!(caught instanceof FeedFetchError)) console.error('feed channel failed', channel.id, caught);
    error = caught instanceof FeedFetchError ? caught.message : '解析失败';
    drafts = [];
  }
  const at = deps.now.toISOString();
  const pruneBefore = new Date(deps.now.getTime() - FEED_RETENTION_MS).toISOString();
  // 最新一篇的时间从全部条目里算（很少更新的博客也能看出上次更新是什么时候），入库只收保留期内的。
  const latestAt = drafts.reduce<string | null>((latest, d) => (latest === null || d.publishedAt > latest ? d.publishedAt : latest), null);
  const fresh = drafts.filter((d) => d.publishedAt >= pruneBefore);
  await saveFeedRun(db, channel, fresh, { at, error, pruneBefore, fetched: drafts.length, latestAt });
  return statusOf(channel, { lastRunAt: at, ok: !error, fetched: drafts.length, error, latestAt });
}

async function lastRuns(db: D1Database): Promise<Map<string, string>> {
  return new Map((await listFeedChannels(db)).map((row) => [row.id, row.lastRunAt]));
}

/** Cron 入口：抓到期的、最过期的几个频道（见 pickDueChannels）。没有数据库时什么也不做。 */
export async function runScheduledFeed(env: ApiEnv, scheduledTime: number, fetcher: FeedFetch = (input, init) => fetch(input, init)): Promise<FeedChannelStatus[] | null> {
  if (!env.DB) return null;
  const db = env.DB;
  const deps: FeedDeps = { fetch: fetcher, now: new Date(scheduledTime), env };
  const out: FeedChannelStatus[] = [];
  for (const channel of pickDueChannels(await lastRuns(db), scheduledTime)) out.push(await runFeedChannel(db, channel, deps));
  return out;
}

/**
 * 立即抓取指定频道；不指定时按过期程度依次抓取，直到用完本次的子请求预算（FEED_REFRESH_BUDGET），
 * 剩下的留给下一次手动刷新或定时任务。
 */
export async function refreshFeed(db: D1Database, channelId: string | null, deps: FeedDeps): Promise<FeedChannelStatus[]> {
  let channels: FeedChannel[];
  if (channelId) {
    channels = [findChannel(channelId)].filter((c): c is FeedChannel => Boolean(c));
  } else {
    channels = [];
    let budget = FEED_REFRESH_BUDGET;
    for (const { channel } of rankChannels(await lastRuns(db), deps.now.getTime())) {
      if (channelCost(channel) > budget) continue;
      budget -= channelCost(channel);
      channels.push(channel);
    }
  }
  const out: FeedChannelStatus[] = [];
  for (const channel of channels) out.push(await runFeedChannel(db, channel, deps));
  return out;
}

export async function feedChannelStatuses(db: D1Database): Promise<FeedChannelStatus[]> {
  const rows = new Map((await listFeedChannels(db)).map((row) => [row.id, row]));
  return FEED_CHANNELS.map((channel) => statusOf(channel, rows.get(channel.id)));
}

/** 信息源页面：全部频道的介绍与最近一次抓取的状态。 */
export async function readFeedChannels(db: D1Database): Promise<FeedChannelsResponse> {
  return { channels: await feedChannelStatuses(db) };
}

export interface FeedQuery {
  source: FeedSource | null;
  limit: number;
  cursor: { publishedAt: string; id: string } | null;
}

const CURSOR_SEPARATOR = '|';

export function encodeCursor(item: Pick<FeedItem, 'publishedAt' | 'id'>): string {
  return `${item.publishedAt}${CURSOR_SEPARATOR}${item.id}`;
}

/** 游标格式：`<ISO 时间>|<id>`；格式不对返回 null。 */
export function decodeCursor(value: string): { publishedAt: string; id: string } | null {
  const at = value.indexOf(CURSOR_SEPARATOR);
  if (at < 0) return null;
  const publishedAt = value.slice(0, at);
  const id = value.slice(at + 1);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(publishedAt) && id && id.length <= 400 ? { publishedAt, id } : null;
}

export async function readFeed(db: D1Database, query: FeedQuery): Promise<FeedResponse> {
  const [rows, channels] = await Promise.all([listFeedItems(db, { source: query.source, limit: query.limit, before: query.cursor }), feedChannelStatuses(db)]);
  const names = new Map(FEED_CHANNELS.map((channel) => [channel.id, channel.name]));
  const page = rows.slice(0, query.limit);
  const items: FeedItem[] = page.map((row) => ({ ...row, channelName: names.get(row.channel) ?? row.channel }));
  return { items, channels, nextCursor: rows.length > query.limit && page.length ? encodeCursor(page[page.length - 1]) : null };
}
