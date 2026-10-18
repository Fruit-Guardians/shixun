import { useCallback, useEffect, useReducer } from 'react';
import type { ImportRequest, IngestResult } from '#shared';
import { errorMessage } from '../api/client.ts';
import type { ApiClient } from '../api/client.ts';
import { archiveReducer, initialArchive } from '../state/archive.ts';
import type { InitialArchive } from '../state/archive.ts';

/** 归档数据与它的两个动作：刷新、导入。所有请求都经过 ApiClient。 */
export function useArchive(api: ApiClient, initial: InitialArchive | undefined) {
  const [state, dispatch] = useReducer(archiveReducer, initial, initialArchive);

  // 宿主没有预取时（纯前端运行），挂载后自己加载一次。
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    api.listReports().then(
      (data) => !cancelled && dispatch({ type: 'loaded', data }),
      (error) => !cancelled && dispatch({ type: 'failed', message: errorMessage(error, '归档暂时读取失败，请稍后刷新。') }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, initial]);

  const refresh = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'refresh-start' });
    try {
      dispatch({ type: 'loaded', data: await api.listReports() });
      return true;
    } catch (error) {
      dispatch({ type: 'failed', message: errorMessage(error, '刷新失败，请稍后重试。') });
      return false;
    }
  }, [api]);

  /** 写入成功后重新读取归档；写入成功但读取失败时给出明确提示，数据不会丢。 */
  const importReport = useCallback(
    async (input: ImportRequest): Promise<IngestResult> => {
      const result = await api.importReport(input);
      try {
        dispatch({ type: 'loaded', data: await api.listReports() });
      } catch {
        throw new Error('已写入，刷新归档未完成，请稍后刷新。');
      }
      return result;
    },
    [api],
  );

  return { ...state, refresh, importReport };
}
