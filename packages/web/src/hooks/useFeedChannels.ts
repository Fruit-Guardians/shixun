import { useCallback, useEffect, useState } from 'react';
import type { FeedChannelStatus } from '#shared';
import { errorMessage } from '../api/client.ts';
import type { ApiClient } from '../api/client.ts';

export interface FeedChannelsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  channels: FeedChannelStatus[];
  error: string | null;
  /** 最近一次读取的时间，用来显示相对时间（不在渲染时读时钟）。 */
  loadedAt: number;
}

type Loaded = Omit<FeedChannelsState, 'status'> & { status: 'ready' | 'error'; generation: number };

const EMPTY: Loaded = { status: 'ready', channels: [], error: null, loadedAt: 0, generation: -1 };

/** 信息源页面：打开时读取全部频道的介绍与状态；「读取中」由请求的批次推出来，不在 effect 里同步设置。 */
export function useFeedChannels(api: ApiClient, active: boolean) {
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    api.getFeedChannels(controller.signal).then(
      (data) => setLoaded({ status: 'ready', channels: data.channels, error: null, loadedAt: Date.now(), generation }),
      (error: unknown) =>
        !controller.signal.aborted && setLoaded((s) => ({ ...s, status: 'error', error: errorMessage(error, '信息源列表暂时读取失败。'), generation })),
    );
    return () => controller.abort();
  }, [api, active, generation]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);

  const { generation: loadedFor, ...rest } = loaded;
  const status: FeedChannelsState['status'] = !active && loadedFor < 0 ? 'idle' : loadedFor === generation ? rest.status : 'loading';
  return { ...rest, status, error: status === 'loading' ? null : rest.error, reload };
}
