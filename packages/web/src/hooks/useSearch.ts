import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client.ts';

/** 停止输入多久后才发起搜索。 */
export const SEARCH_DEBOUNCE_MS = 200;

interface SearchResult {
  query: string;
  hits: ReadonlySet<string> | null;
  failed: boolean;
}

/**
 * 服务端全文搜索（动态标题 + 正文）。
 * `hits` 只在结果对应当前搜索词时给出；等待中或失败时为 null，调用方退回本地匹配。
 */
export function useSearch(api: ApiClient, query: string) {
  const trimmed = query.trim();
  const [result, setResult] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.search(trimmed, controller.signal).then(
        (data) => setResult({ query: trimmed, hits: new Set(data.storyIds), failed: false }),
        () => !controller.signal.aborted && setResult({ query: trimmed, hits: null, failed: true }),
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, trimmed]);

  const current = trimmed && result?.query === trimmed ? result : null;
  return {
    hits: current?.hits ?? null,
    pending: Boolean(trimmed) && !current,
    failed: current?.failed ?? false,
  };
}
