import type { ApiErrorBody } from '#shared';

export const NO_STORE: Readonly<Record<string, string>> = { 'Cache-Control': 'private, no-store' };
export const SAFE_HEADERS: Readonly<Record<string, string>> = { ...NO_STORE, 'X-Content-Type-Options': 'nosniff' };

/** 携带 HTTP 状态码的错误；message 会原样返回给调用方，请勿放入内部细节。 */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  readonly status: number;
  readonly code?: string;
  readonly headers?: Readonly<Record<string, string>>;

  constructor(status: number, message: string, options: { code?: string; headers?: Readonly<Record<string, string>> } = {}) {
    super(message);
    this.status = status;
    this.code = options.code;
    this.headers = options.headers;
  }
}

export function json(body: unknown, init: { status?: number; headers?: Readonly<Record<string, string>> } = {}): Response {
  return Response.json(body, { status: init.status ?? 200, headers: { ...init.headers } });
}

export function errorResponse(error: HttpError, fallbackHeaders: Readonly<Record<string, string>> = NO_STORE): Response {
  const body: ApiErrorBody = error.code ? { error: error.message, code: error.code } : { error: error.message };
  return json(body, { status: error.status, headers: { ...fallbackHeaders, ...error.headers } });
}

export interface ReadBodyOptions {
  maxBytes: number;
  tooLarge: string;
  invalid: string;
  headers?: Readonly<Record<string, string>>;
}

/** 读取并解析 JSON 请求体，先看 Content-Length 再看实际字节数。 */
export async function readJsonBody(request: Request, options: ReadBodyOptions): Promise<unknown> {
  const failure = (status: number, message: string) => new HttpError(status, message, { headers: options.headers });
  if (Number(request.headers.get('content-length') ?? 0) > options.maxBytes) throw failure(413, options.tooLarge);

  const text = await request.text();
  if (new TextEncoder().encode(text).length > options.maxBytes) throw failure(413, options.tooLarge);
  try {
    return JSON.parse(text);
  } catch {
    throw failure(400, options.invalid);
  }
}
