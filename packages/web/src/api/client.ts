import { apiPaths } from '#shared';
import type { ApiErrorBody, ImportRequest, IngestResult, ReportsResponse, SetupCredentialResponse } from '#shared';

/** 后端返回的错误，或网络层失败（status = 0）。 message 可直接展示给用户。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetcher: Fetcher = (input, init) => fetch(input, init);

/**
 * 前端访问后端的唯一入口。只通过 HTTP 与 `#shared` 里的契约通信，
 * 不依赖 API 的任何实现，换成独立域名的后端只需改 `baseUrl`。
 */
export function createApiClient(options: { baseUrl?: string; fetcher?: Fetcher } = {}) {
  const baseUrl = options.baseUrl ?? '';
  const fetcher = options.fetcher ?? defaultFetcher;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(baseUrl + path, { cache: 'no-store', credentials: 'same-origin', ...init });
    } catch {
      throw new ApiError('网络连接失败，请检查网络后重试。', 0, 'network');
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = (body ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(failure.error ?? `请求失败（${response.status}）。`, response.status, failure.code);
    }
    return body as T;
  }

  const postJson = (path: string, payload: unknown): Promise<unknown> =>
    request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

  return {
    async listReports(): Promise<ReportsResponse> {
      const data = await request<Partial<ReportsResponse>>(apiPaths.reports);
      if (!Array.isArray(data.reports)) throw new ApiError('归档返回格式异常。', 200, 'bad_response');
      return data as ReportsResponse;
    },
    async importReport(input: ImportRequest): Promise<IngestResult> {
      return (await postJson(apiPaths.reports, input)) as IngestResult;
    },
    async setupCredential(): Promise<string> {
      const data = (await postJson(apiPaths.setupCredential, {})) as Partial<SetupCredentialResponse>;
      if (!data.token) throw new ApiError('凭证尚未配置', 503, 'not_configured');
      return data.token;
    },
    /** 原文下载地址；用于 <a href>，不发请求。 */
    reportUrl: (id: string): string => baseUrl + apiPaths.report(id),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
