import type { ReportSummary, ReportsResponse, SyncState } from '#shared';

/** 宿主在服务端预取的归档；缺省时前端挂载后自行请求。 */
export interface InitialArchive {
  data: ReportsResponse | null;
  error: string | null;
}

export interface ArchiveState {
  status: 'loading' | 'ready';
  reports: ReportSummary[];
  sync: SyncState | null;
  hasDriveImports: boolean;
  error: string | null;
  refreshing: boolean;
}

export type ArchiveAction =
  | { type: 'refresh-start' }
  | { type: 'loaded'; data: ReportsResponse }
  | { type: 'failed'; message: string };

export function initialArchive(initial: InitialArchive | undefined): ArchiveState {
  return {
    status: initial ? 'ready' : 'loading',
    reports: initial?.data?.reports ?? [],
    sync: initial?.data?.sync ?? null,
    hasDriveImports: initial?.data?.drive.status === 'imported',
    error: initial?.error ?? null,
    refreshing: false,
  };
}

export function archiveReducer(state: ArchiveState, action: ArchiveAction): ArchiveState {
  switch (action.type) {
    case 'refresh-start':
      return { ...state, refreshing: true, error: null };
    case 'loaded':
      return {
        status: 'ready',
        reports: action.data.reports,
        sync: action.data.sync ?? null,
        hasDriveImports: action.data.drive?.status === 'imported' || action.data.reports.some((r) => r.sourceFileId),
        error: null,
        refreshing: false,
      };
    case 'failed':
      return { ...state, status: 'ready', refreshing: false, error: action.message };
  }
}
