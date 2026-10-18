import { useEffect, useState } from 'react';
import type { SessionResponse } from '#shared';
import type { ApiClient } from '../api/client.ts';

/** 读取前与读取失败时都按访客处理：写操作按钮宁可不显示。 */
export const VISITOR: SessionResponse = { signedIn: false, owner: false, email: null, loginPath: null, logoutPath: null };

/**
 * 当前访客的身份，挂载后读取一次。只用来隐藏访客用不了的按钮；
 * 授权仍由每个写接口在服务端校验，这里看错了也写不进去。
 */
export function useSession(api: ApiClient): SessionResponse {
  const [session, setSession] = useState<SessionResponse>(VISITOR);

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal).then(
      (data) => setSession(data),
      () => {},
    );
    return () => controller.abort();
  }, [api]);

  return session;
}
