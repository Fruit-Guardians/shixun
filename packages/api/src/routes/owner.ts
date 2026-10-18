import { getPlatformUser, isOwner, isSameOrigin } from '../auth.ts';
import type { PlatformUser } from '../auth.ts';
import type { ApiEnv } from '../env.ts';
import { HttpError } from '../http.ts';

/**
 * 只允许站点所有者在本站页面里发起的操作：必须同源（防 CSRF）、已登录，
 * 配置了 OWNER_EMAILS 时还要在名单内。`denied` 是不在名单内时的提示。
 */
export function requireOwner(request: Request, env: ApiEnv, denied: string): PlatformUser {
  if (!isSameOrigin(request, { allowMissing: false })) throw new HttpError(403, '请求来源不匹配。');
  const user = getPlatformUser(request.headers);
  if (!user) throw new HttpError(401, '请先登录站点。');
  if (!isOwner(user, env.OWNER_EMAILS)) throw new HttpError(403, denied, { code: 'not_owner' });
  return user;
}
