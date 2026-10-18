import { useCallback, useEffect, useState } from 'react';
import type { ReportSummary } from '#shared';
import { errorMessage } from '../api/client.ts';
import type { ApiClient } from '../api/client.ts';

/** 原文缓存：同一版本只下载一次。版本变化（重新导入）时键随之变化。 */
const cache = new Map<string, string>();
const cacheKey = (report: ReportSummary) => `${report.id}@${report.revision ?? ''}@${report.importedAt ?? ''}`;

export type ReportText =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; raw: string }
  | { status: 'error'; message: string; retry: () => void };

/** 阅读页按需读取一期的 Markdown 原文（列表里只有元数据与动态摘要）。 */
export function useReportText(api: ApiClient, report: ReportSummary | undefined): ReportText {
  const key = report ? cacheKey(report) : '';
  const id = report?.id ?? '';
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [, setLoaded] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || cache.has(key)) return;
    const controller = new AbortController();
    api.getReportText(id, controller.signal).then(
      (raw) => {
        cache.set(key, raw);
        setFailure(null);
        setLoaded((n) => n + 1);
      },
      (error) => !controller.signal.aborted && setFailure({ key, message: errorMessage(error, '原文暂时读取失败，请稍后重试。') }),
    );
    return () => controller.abort();
  }, [api, id, key, attempt]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  if (!key) return { status: 'idle' };
  const raw = cache.get(key);
  if (raw !== undefined) return { status: 'ready', raw };
  if (failure?.key === key) return { status: 'error', message: failure.message, retry };
  return { status: 'loading' };
}
