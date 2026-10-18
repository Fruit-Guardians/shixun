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

/** 日报正文里的一级章节（①②③…）。 */
export interface Section {
  id: string;
  label: string;
  index: number;
}

export type SyncStateName = 'awaiting_setup' | 'active' | 'stale' | 'attention' | 'disabled';

export interface SyncState {
  mode: 'google-apps-script';
  state: SyncStateName;
  lastCheckedAt: string | null;
  triggerInstalled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
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
}

/** 校验通过的运行回执；未上报的计数按 0 计。 */
export interface ValidatedSyncRun {
  triggerInstalled: boolean;
  checkedAt: string | null;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
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
  reports: Report[];
  sync: SyncState;
  drive: { status: 'imported' | 'not_connected'; folderId: string };
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
