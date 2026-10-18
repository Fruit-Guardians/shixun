import { isOwner, isSameOrigin, loginHint } from '../auth.ts';
import type { PlatformUser } from '../auth.ts';
import { HttpError } from '../http.ts';
import type { RequestContext } from '../router.ts';

/**
 * 只允许站点所有者在本站页面里发起的操作：必须同源（防 CSRF）、已登录，
 * 配置了 OWNER_EMAILS 时还要在名单内（Access 模式下必须配置）。`denied` 是不在名单内时的提示。
 */
export async function requireOwner({ request, env, caller }: RequestContext, denied: string): Promise<PlatformUser> {
  if (!isSameOrigin(request, { allowMissing: false })) throw new HttpError(403, '请求来源不匹配。');
  const { user, access } = await caller();
  if (!user) throw new HttpError(401, access ? loginHint(true, '操作') : '请先登录站点。');
  if (!isOwner(user, env.OWNER_EMAILS, access)) throw new HttpError(403, denied, { code: 'not_owner' });
  return user;
}
