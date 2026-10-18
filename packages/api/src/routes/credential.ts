import type { SetupCredentialResponse } from '#shared';
import { getPlatformUser, isSameOrigin } from '../auth.ts';
import { HttpError, SAFE_HEADERS, json } from '../http.ts';
import type { Handler } from '../router.ts';

/** POST /api/integration/setup-credential — 登录用户一次性取回同步凭证（不写入客户端源码）。 */
export const setupCredentialRoute: Handler = ({ request, env }) => {
  if (!isSameOrigin(request, { allowMissing: false })) throw new HttpError(403, '请求来源不匹配。');
  if (!getPlatformUser(request.headers)) throw new HttpError(401, '请先登录站点。');
  if (!env.SITES_SERVICE_ACCESS) throw new HttpError(503, '站点后台凭证尚未配置。');
  const body: SetupCredentialResponse = { token: env.SITES_SERVICE_ACCESS };
  return json(body, { headers: SAFE_HEADERS });
};
