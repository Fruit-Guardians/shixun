import type { SessionResponse } from '#shared';
import { ACCESS_LOGIN_PATH, ACCESS_LOGOUT_PATH } from '../auth.ts';
import { json } from '../http.ts';
import type { Handler } from '../router.ts';
import { isCallerOwner } from './owner.ts';

/**
 * GET /api/session — 当前访客是谁，前端据此隐藏写操作按钮。
 * 这里只是展示提示：隐藏按钮不是防线，每个写接口仍然各自校验身份。
 */
export const sessionRoute: Handler = async (context) => {
  const { user, access } = await context.caller();
  const body: SessionResponse = {
    signedIn: Boolean(user),
    owner: await isCallerOwner(context),
    email: user?.email ?? null,
    loginPath: access ? ACCESS_LOGIN_PATH : null,
    logoutPath: access && user ? ACCESS_LOGOUT_PATH : null,
  };
  return json(body);
};
