import { apiPaths } from '#shared';
import type { ApiErrorBody, ReportsResponse } from '#shared';
import { App } from '#web';
import type { InitialArchive } from '#web';
import { callApi } from './_host/api';

export const dynamic = 'force-dynamic';

/** 首屏数据：进程内调用同一个 /api/reports，失败时把错误交给前端展示并允许重试。 */
async function loadInitialArchive(): Promise<InitialArchive> {
  try {
    const response = await callApi(apiPaths.reports);
    const body: unknown = await response.json();
    if (!response.ok) return { data: null, error: (body as ApiErrorBody).error };
    return { data: body as ReportsResponse, error: null };
  } catch {
    return { data: null, error: '归档暂时读取失败，请稍后刷新。' };
  }
}

export default async function Page() {
  return <App initial={await loadInitialArchive()} />;
}
