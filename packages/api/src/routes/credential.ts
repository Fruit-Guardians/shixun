import type { SetupCredentialResponse } from '#shared';
import { getPlatformUser, isOwner, isSameOrigin } from '../auth.ts';
import { HttpError, json } from '../http.ts';
import type { Handler } from '../router.ts';

/** POST /api/integration/setup-credential — 登录的站点所有者一次性取回同步凭证（不写入客户端源码）。 */
export const setupCredentialRoute: Handler = ({ request, env }) => {
  if (!isSameOrigin(request, { allowMissing: false })) throw new HttpError(403, '请求来源不匹配。');
  const user = getPlatformUser(request.headers);
  if (!user) throw new HttpError(401, '请先登录站点。');
  if (!isOwner(user, env.OWNER_EMAILS)) throw new HttpError(403, '只有站点所有者可以取回同步凭证。', { code: 'not_owner' });
  if (!env.SITES_SERVICE_ACCESS) throw new HttpError(503, '站点后台凭证尚未配置。');
  const body: SetupCredentialResponse = { token: env.SITES_SERVICE_ACCESS };
  return json(body);
};
