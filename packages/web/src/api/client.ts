import { apiPaths } from '#shared';
import type {
  ApiErrorBody,
  DeleteReportResponse,
  ImportRequest,
  IngestResult,
  ReportVersionsResponse,
  ReportsResponse,
  SearchResponse,
  SessionResponse,
  SetupCredentialResponse,
} from '#shared';

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

  /** 发请求；非 2xx 统一转成 ApiError（优先使用服务端给出的 JSON 错误信息）。 */
  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(baseUrl + path, { cache: 'no-store', credentials: 'same-origin', ...init });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiError('网络连接失败，请检查网络后重试。', 0, 'network');
    }
    if (!response.ok) {
      const failure = ((await response.json().catch(() => null)) ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(failure.error ?? `请求失败（${response.status}）。`, response.status, failure.code);
    }
    return response;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await send(path, init);
    return (await response.json().catch(() => null)) as T;
  }

  const postJson = (path: string, payload: unknown): Promise<unknown> =>
    request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

  return {
    async listReports(): Promise<ReportsResponse> {
      const data = await request<Partial<ReportsResponse> | null>(apiPaths.reports);
      if (!data || !Array.isArray(data.reports)) throw new ApiError('归档返回格式异常。', 200, 'bad_response');
      return data as ReportsResponse;
    },
    /** 某一期的 Markdown 原文（列表里不含原文，阅读时按需读取）。 */
    async getReportText(id: string, signal?: AbortSignal): Promise<string> {
      const response = await send(apiPaths.report(id), { signal });
      return response.text();
    },
    /** 在全部动态的标题与正文里搜索，返回命中的动态 id。 */
    async search(query: string, signal?: AbortSignal): Promise<SearchResponse> {
      const data = await request<Partial<SearchResponse>>(`${apiPaths.search}?${new URLSearchParams({ q: query })}`, { signal });
      if (!data || !Array.isArray(data.storyIds)) throw new ApiError('搜索返回格式异常。', 200, 'bad_response');
      return data as SearchResponse;
    },
    /** 当前访客是否登录、是否所有者；只决定界面显示哪些按钮。 */
    async getSession(signal?: AbortSignal): Promise<SessionResponse> {
      const data = await request<Partial<SessionResponse> | null>(apiPaths.session, { signal });
      if (!data || typeof data.owner !== 'boolean') throw new ApiError('身份返回格式异常。', 200, 'bad_response');
      return { signedIn: Boolean(data.signedIn), owner: data.owner, email: data.email ?? null, loginPath: data.loginPath ?? null, logoutPath: data.logoutPath ?? null };
    },
    async importReport(input: ImportRequest): Promise<IngestResult> {
      return (await postJson(apiPaths.reports, input)) as IngestResult;
    },
    /** 当前版本与历史版本的元数据。 */
    async listVersions(id: string, signal?: AbortSignal): Promise<ReportVersionsResponse> {
      const data = await request<Partial<ReportVersionsResponse>>(apiPaths.reportVersions(id), { signal });
      if (!data || !data.current || !Array.isArray(data.versions)) throw new ApiError('版本历史返回格式异常。', 200, 'bad_response');
      return data as ReportVersionsResponse;
    },
    /** 所有者把某个历史版本恢复为当前版本（作为新版本写入）。 */
    async restoreVersion(id: string, versionId: string): Promise<IngestResult> {
      return (await postJson(apiPaths.restoreVersion(id, versionId), {})) as IngestResult;
    },
    /** 所有者删除一期；当前版本仍保留在库内历史里。 */
    async deleteReport(id: string): Promise<DeleteReportResponse> {
      return request<DeleteReportResponse>(apiPaths.report(id), { method: 'DELETE' });
    },
    async setupCredential(): Promise<string> {
      const data = (await postJson(apiPaths.setupCredential, {})) as Partial<SetupCredentialResponse>;
      if (!data.token) throw new ApiError('凭证尚未配置', 503, 'not_configured');
      return data.token;
    },
    /** 原文下载地址；用于 <a href>，不发请求。 */
    reportUrl: (id: string): string => baseUrl + apiPaths.report(id),
    /** 历史版本下载地址。 */
    versionUrl: (id: string, versionId: string): string => baseUrl + apiPaths.reportVersion(id, versionId),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
