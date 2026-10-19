import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedChannelStatus, FeedItem, FeedSource } from '#shared';
import { errorMessage } from '../api/client.ts';
import type { ApiClient } from '../api/client.ts';

export interface FeedState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: FeedItem[];
  channels: FeedChannelStatus[];
  nextCursor: string | null;
  error: string | null;
  loadingMore: boolean;
  /** 最近一次读取的时间，用来显示相对时间（不在渲染时读时钟）。 */
  loadedAt: number;
}

const EMPTY: FeedState = { status: 'idle', items: [], channels: [], nextCursor: null, error: null, loadingMore: false, loadedAt: 0 };

/** 信源速递：只在打开这个视图时读取；切换来源重新读第一页，「加载更多」按游标追加。 */
export function useFeed(api: ApiClient, active: boolean, source: FeedSource | null) {
  const [state, setState] = useState<FeedState>(EMPTY);
  const [generation, setGeneration] = useState(0);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api.getFeed({ source }, controller.signal).then(
      (data) => setState({ status: 'ready', items: data.items, channels: data.channels, nextCursor: data.nextCursor, error: null, loadingMore: false, loadedAt: Date.now() }),
      (error: unknown) => !controller.signal.aborted && setState((s) => ({ ...s, status: 'error', error: errorMessage(error, '信源暂时读取失败。') })),
    );
    return () => controller.abort();
  }, [api, active, source, generation]);

  const loadMore = useCallback(async () => {
    const cursor = state.nextCursor;
    if (!cursor || state.loadingMore) return;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const data = await api.getFeed({ source, cursor });
      setState((s) => {
        const known = new Set(s.items.map((item) => item.id));
        return { ...s, items: [...s.items, ...data.items.filter((item) => !known.has(item.id))], nextCursor: data.nextCursor, loadingMore: false };
      });
    } catch (error) {
      setState((s) => ({ ...s, loadingMore: false, error: errorMessage(error, '更早的条目读取失败。') }));
    }
  }, [api, source, state.nextCursor, state.loadingMore]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  return { ...state, loadMore, reload };
}
