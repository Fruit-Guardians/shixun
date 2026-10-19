import { FEED_PAGE_SIZE, FEED_SOURCES, MAX_FEED_PAGE_SIZE } from '#shared';
import type { FeedRefreshResponse, FeedSource } from '#shared';
import { hasBearerToken, isSameOrigin, loginHint } from '../auth.ts';
import { requireDb } from '../database.ts';
import { findChannel } from '../feeds/channels.ts';
import { HttpError, json, readJsonBody } from '../http.ts';
import type { Handler } from '../router.ts';
import { decodeCursor, readFeed, readFeedChannels, refreshFeed } from '../services/feed.ts';
import { requireOwner } from './owner.ts';
import { mapServiceErrors } from './service-errors.ts';

/** GET /api/feed?source=&limit=&cursor= — 信源速递，按发布时间倒序分页。 */
export const feedRoute: Handler = async ({ url, env }) => {
  const sourceParam = url.searchParams.get('source');
  if (sourceParam !== null && !(FEED_SOURCES as readonly string[]).includes(sourceParam)) throw new HttpError(400, '未知的来源。');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam === null ? FEED_PAGE_SIZE : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_PAGE_SIZE) throw new HttpError(400, `limit 必须是 1 到 ${MAX_FEED_PAGE_SIZE} 之间的整数。`);
  const cursorParam = url.searchParams.get('cursor');
  const cursor = cursorParam === null ? null : decodeCursor(cursorParam);
  if (cursorParam !== null && !cursor) throw new HttpError(400, '分页游标无效。');
  const source = sourceParam as FeedSource | null;
  return json(await mapServiceErrors('feed.list', '信源暂时读取失败，请稍后刷新。', () => readFeed(requireDb(env), { source, limit, cursor })));
};

/** GET /api/feed/channels — 信息源页面：全部频道的介绍、抓取频率与最近状态。 */
export const feedChannelsRoute: Handler = async ({ env }) =>
  json(await mapServiceErrors('feed.channels', '信息源列表暂时读取失败，请稍后刷新。', () => readFeedChannels(requireDb(env))));

/**
 * POST /api/feed/refresh — 立即抓取。请求体可选 `{ "channel": "<频道 id>" }`，省略则依次抓取全部频道。
 * 身份与手动导入相同：持 INGEST_TOKEN 的程序，或站点所有者。
 */
export const refreshFeedRoute: Handler = async (context) => {
  const { request, env, now, caller, feedFetch } = context;
  if (!isSameOrigin(request, { allowMissing: true })) throw new HttpError(403, '请求来源不匹配。');
  if (!hasBearerToken(request, env.INGEST_TOKEN)) {
    const { user, access } = await caller();
    if (access) await requireOwner(context, '只有站点所有者可以刷新信源。');
    else if (!user) throw new HttpError(401, loginHint(false, '刷新信源'));
  }
  const empty = request.headers.get('content-length') === '0' || request.body === null;
  const body = empty ? {} : await readJsonBody(request, { maxBytes: 1024, tooLarge: '请求体过大。', invalid: '提交格式无效。' });
  const channel = body && typeof body === 'object' && 'channel' in body ? (body as { channel: unknown }).channel : undefined;
  if (channel !== undefined && (typeof channel !== 'string' || !findChannel(channel))) throw new HttpError(400, '未知的频道。');
  const channels = await mapServiceErrors('feed.refresh', '信源刷新失败，请稍后重试。', () =>
    refreshFeed(requireDb(env), channel ?? null, { fetch: feedFetch, now, env }),
  );
  const result: FeedRefreshResponse = { channels };
  return json(result);
};
