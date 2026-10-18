import { SYNC_PROTOCOL_CURRENT, SYNC_PROTOCOL_HEADER } from '#shared';

export interface PlatformUser {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
}

const USER_ID = 'oai-authenticated-user-id';
const USER_EMAIL = 'oai-authenticated-user-email';
const USER_FULL_NAME = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING = 'oai-authenticated-user-full-name-encoding';
const PERCENT_ENCODED_UTF8 = 'percent-encoded-utf-8';

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** 站点入口（Sites ingress）在登录后注入的身份头；没有则视为未登录。 */
export function getPlatformUser(headers: Headers): PlatformUser | null {
  const userId = headers.get(USER_ID);
  const email = headers.get(USER_EMAIL);
  if (!userId || !email) return null;

  const encoded = headers.get(USER_FULL_NAME);
  const fullName = encoded && headers.get(USER_FULL_NAME_ENCODING) === PERCENT_ENCODED_UTF8 ? safeDecode(encoded) : null;
  return { userId, displayName: fullName ?? email, email, fullName };
}

/**
 * 程序同步协议标识：不得来自浏览器（无 Origin / Sec-Fetch-Site）。
 * 真正的凭证在站点私有入口校验，这里只识别协议，不能替代认证。
 */
export function isProgramSync(request: Request): boolean {
  return (
    !request.headers.has('origin') &&
    !request.headers.has('sec-fetch-site') &&
    request.headers.get(SYNC_PROTOCOL_HEADER) === SYNC_PROTOCOL_CURRENT
  );
}

/** 恒定时间比较，避免通过响应时间推测凭证。 */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function hasBearerToken(request: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const header = request.headers.get('authorization');
  return header !== null && safeEqual(header, `Bearer ${expected}`);
}

/**
 * 同源检查（防 CSRF）。allowMissing=true 时，没有 Origin 的请求（服务端调用）放行；
 * 否则必须带上并等于本站 Origin。
 */
export function isSameOrigin(request: Request, options: { allowMissing: boolean }): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return options.allowMissing;
  return origin === new URL(request.url).origin;
}

/**
 * 站点所有者检查。未配置 OWNER_EMAILS 时不额外限制（由站点私有访问兜底）；
 * 配置后邮箱必须在名单内（不区分大小写）。
 */
export function isOwner(user: PlatformUser, ownerEmails: string | undefined): boolean {
  const allowed = (ownerEmails ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(user.email.toLowerCase());
}
