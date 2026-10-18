import type { ApiErrorBody } from '#shared';

/** 所有 API 响应都带的头：不缓存（含登录态与同步状态）、禁止 MIME 嗅探。 */
export const SAFE_HEADERS: Readonly<Record<string, string>> = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

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
  return Response.json(body, { status: init.status ?? 200, headers: { ...SAFE_HEADERS, ...init.headers } });
}

export function errorResponse(error: HttpError): Response {
  const body: ApiErrorBody = error.code ? { error: error.message, code: error.code } : { error: error.message };
  return json(body, { status: error.status, headers: error.headers });
}

export interface ReadBodyOptions {
  maxBytes: number;
  tooLarge: string;
  invalid: string;
}

/** 读取并解析 JSON 请求体，先看 Content-Length 再看实际字节数。 */
export async function readJsonBody(request: Request, options: ReadBodyOptions): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > options.maxBytes) throw new HttpError(413, options.tooLarge);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > options.maxBytes) throw new HttpError(413, options.tooLarge);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, options.invalid);
  }
}
