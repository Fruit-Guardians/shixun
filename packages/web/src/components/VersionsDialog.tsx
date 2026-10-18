import { Download, History, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { IngestResult, ReportSummary, ReportVersionsResponse } from '#shared';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '../api/client.ts';
import type { ApiClient } from '../api/client.ts';
import { formatCount } from '../lib/format.ts';
import ModalFrame from './ModalFrame.tsx';

interface VersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
  report: ReportSummary;
  /** 所有者才能恢复和删除；访客只能查看与下载。 */
  canManage: boolean;
  /** 恢复成功后由上层刷新归档并提示。 */
  onRestored: (result: IngestResult) => Promise<void>;
  /** 删除成功后由上层离开阅读页并刷新归档。 */
  onDeleted: () => Promise<void>;
}

export default function VersionsDialog({ open, onOpenChange, report, ...rest }: VersionsDialogProps) {
  return (
    <ModalFrame open={open} onOpenChange={onOpenChange} title={`git log ${report.date}.md`}>
      {/* 每次打开重新挂载：版本列表与确认状态不跨次保留。 */}
      {open && <VersionsPanel report={report} {...rest} />}
    </ModalFrame>
  );
}

type Load = { status: 'loading' } | { status: 'ready'; data: ReportVersionsResponse } | { status: 'error'; message: string };
/** 需要二次确认的操作：恢复某个版本，或删除整期。 */
type Pending = { kind: 'restore'; versionId: string } | { kind: 'delete' } | null;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '随站点发布');
const shortHash = (hash: string) => hash.slice(0, 8);

function VersionsPanel({ api, report, canManage, onRestored, onDeleted }: Omit<VersionsDialogProps, 'open' | 'onOpenChange'>) {
  const [attempt, setAttempt] = useState(0);
  // 结果按 key 记录：归档刷新后 revision 变化或点了重试，key 随之变化，旧结果自然作废。
  const key = `${report.id}@${report.revision ?? ''}@${attempt}`;
  const [result, setResult] = useState<{ key: string; load: Load } | null>(null);
  const load: Load = result?.key === key ? result.load : { status: 'loading' };
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.listVersions(report.id, controller.signal).then(
      (data) => setResult({ key, load: { status: 'ready', data } }),
      (error) => !controller.signal.aborted && setResult({ key, load: { status: 'error', message: errorMessage(error, '版本历史暂时读取失败。') } }),
    );
    return () => controller.abort();
  }, [api, report.id, key]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setPending(null);
    } catch (error) {
      setMessage(errorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  const restore = (versionId: string) =>
    run(async () => {
      await onRestored(await api.restoreVersion(report.id, versionId));
    }, '恢复未完成，当前版本保持不变。');

  const remove = () =>
    run(async () => {
      await api.deleteReport(report.id);
      await onDeleted();
    }, '删除未完成，日报保持不变。');

  return (
    <>
      <span className="modal-icon">
        <History size={27} />
      </span>
      <span className="eyebrow">{canManage ? 'VERSIONS · OWNER' : 'VERSIONS · READ ONLY'}</span>
      <DialogTitle>版本历史</DialogTitle>
      <DialogDescription className="modal-subtitle">
        {canManage
          ? '每次内容变化都会保留被替换的原文。恢复会把所选版本写成新的一版，当前内容同样留在历史里。'
          : '每次内容变化都会保留被替换的原文，可以下载任意一版对照阅读。'}
      </DialogDescription>

      {load.status === 'loading' && (
        <p className="versions-note" role="status">
          正在读取版本…
        </p>
      )}
      {load.status === 'error' && (
        <div className="error-banner" role="alert">
          <span>{load.message}</span>
          <button onClick={() => setAttempt((n) => n + 1)}>重试</button>
        </div>
      )}
      {load.status === 'ready' && (
        <ol className="versions-list" aria-label="版本列表">
          <li className="current">
            <span className="version-tag">当前 · 第 {load.data.current.revision} 版</span>
            <span className="version-meta">
              {when(load.data.current.importedAt)} · {formatCount(load.data.current.chars)} 字 · {shortHash(load.data.current.hash)}
            </span>
          </li>
          {load.data.versions.map((version) => (
            <li key={version.id}>
              <span className="version-tag">替换于 {when(version.savedAt)}</span>
              <span className="version-meta">
                {formatCount(version.chars)} 字 · {shortHash(version.hash)}
                {version.hash === load.data.current.hash && ' · 与当前相同'}
              </span>
              <span className="version-actions">
                <a className="text-button" href={api.versionUrl(report.id, version.id)} aria-label={`下载 ${when(version.savedAt)} 的版本`}>
                  <Download size={14} />
                  下载
                </a>
                {!canManage ? null : pending?.kind === 'restore' && pending.versionId === version.id ? (
                  <>
                    <button className="text-button danger" disabled={busy} onClick={() => restore(version.id)}>
                      {busy ? '正在恢复…' : '确认恢复'}
                    </button>
                    <button className="text-button" disabled={busy} onClick={() => setPending(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    className="text-button"
                    disabled={busy || version.hash === load.data.current.hash}
                    onClick={() => setPending({ kind: 'restore', versionId: version.id })}
                  >
                    <RotateCcw size={14} />
                    恢复
                  </button>
                )}
              </span>
            </li>
          ))}
          {load.data.versions.length === 0 && <li className="dim">还没有历史版本：这一期导入后内容没有变过。</li>}
          {load.data.truncated && <li className="dim">只列出最近 {load.data.versions.length} 个历史版本。</li>}
        </ol>
      )}

      {/* 种子随站点发布，不能删除；读到版本信息之前也不显示删除。 */}
      {canManage && load.status === 'ready' && load.data.stored && (
        <div className="danger-zone">
          <div>
            <strong>删除这一期</strong>
            <p>
              从归档中移除 {report.title}。原文保留在库内版本历史里。
              {report.sourceFileId && ' 来自 Google Drive：源文件再次修改后会被重新同步回来。'}
            </p>
          </div>
          {pending?.kind === 'delete' ? (
            <span className="version-actions">
              <button className="outline-button danger" disabled={busy} onClick={remove}>
                <Trash2 size={14} />
                {busy ? '正在删除…' : '确认删除'}
              </button>
              <button className="text-button" disabled={busy} onClick={() => setPending(null)}>
                取消
              </button>
            </span>
          ) : (
            <button className="outline-button danger" disabled={busy} onClick={() => setPending({ kind: 'delete' })}>
              <Trash2 size={14} />
              删除
            </button>
          )}
        </div>
      )}

      {message && (
        <p className="setup-message is-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
