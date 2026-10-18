import type { CATEGORIES, TOPICS } from './constants.ts';

export type ReportTopic = (typeof TOPICS)[number];
export type Category = (typeof CATEGORIES)[number];

export interface Report {
  id: string;
  date: string;
  title: string;
  topic: ReportTopic;
  source: string;
  sourceFileId: string | null;
  raw: string;
  importedAt: string | null;
  revision?: number;
}

/** 日报中「①昨日重要动态」里的一条。 */
export interface Story {
  id: string;
  index: number;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  reportId: string;
  date: string;
  topic: ReportTopic;
}

/** 列表里的一条动态：不含正文，正文只在服务端用于搜索。 */
export type StorySummary = Omit<Story, 'body'>;

/** 列表里的一期日报：元数据、统计与动态摘要，不含原文。原文按需从 `apiPaths.report(id)` 读取。 */
export interface ReportSummary extends Omit<Report, 'raw'> {
  /** 原文字符数（UTF-16 长度）。 */
  chars: number;
  /** 原文里的链接数。 */
  links: number;
  stories: StorySummary[];
}

/** 由原文确定性地派生出的数据（服务端存储，原文变化或解析规则升级时重建）。 */
export interface ReportDigest {
  chars: number;
  links: number;
  stories: Story[];
}

/** 日报正文里的一级章节（①②③…）。 */
export interface Section {
  id: string;
  label: string;
  index: number;
}

export type SyncStateName = 'awaiting_setup' | 'active' | 'stale' | 'attention' | 'disabled';

/** 某个 Drive 文件同步失败的原因，由 Apps Script 上报。 */
export interface SyncFailure {
  fileId: string;
  name: string;
  reason: string;
}

export interface SyncState {
  mode: 'google-apps-script';
  state: SyncStateName;
  lastCheckedAt: string | null;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** 最近一轮失败文件的明细（最多 MAX_SYNC_FAILURES 条）；旧版脚本不上报时为空。 */
  failures: SyncFailure[];
  legacyWriterDisabled: true;
}

/** Apps Script 上报的运行回执。 */
export interface SyncRunInput {
  triggerInstalled: boolean;
  checkedAt?: string;
  created?: number;
  updated?: number;
  unchanged?: number;
  failed?: number;
  failures?: SyncFailure[];
}

/** 校验通过的运行回执；未上报的计数按 0 计。 */
export interface ValidatedSyncRun {
  triggerInstalled: boolean;
  checkedAt: string | null;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  failures: SyncFailure[];
}

/** 导入请求体（手动导入与程序同步共用）。 */
export interface ImportRequest {
  raw: string;
  date: string;
  topic?: ReportTopic;
  sourceFileId?: string;
}

/** 校验通过、可以入库的日报。 */
export interface ValidatedImport {
  id: string;
  raw: string;
  date: string;
  topic: ReportTopic;
  title: string;
  source: string;
  sourceFileId: string | null;
}

export type IngestStatus = 'created' | 'updated' | 'unchanged';

export interface IngestResult {
  id: string;
  status: IngestStatus;
  hash: string;
  revision: number;
}

export interface ReportsResponse {
  reports: ReportSummary[];
  sync: SyncState;
  drive: { status: 'imported' | 'not_connected'; folderId: string };
}

/** 全文搜索结果：命中的动态 id（覆盖动态正文，不只是标题与摘要）。 */
export interface SearchResponse {
  query: string;
  storyIds: string[];
}

export interface SetupCredentialResponse {
  token: string;
}

export interface HealthResponse {
  ok: true;
  database: boolean;
}

/** 所有错误响应的统一结构。 */
export interface ApiErrorBody {
  error: string;
  code?: string;
}
