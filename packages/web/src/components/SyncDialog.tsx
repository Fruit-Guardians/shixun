import { ArrowUpRight, Check, Cloud, Copy, Download, ExternalLink, Folder, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { DRIVE_FOLDER_ID } from '#shared';
import type { SyncState } from '#shared';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '../api/client.ts';
import type { ApiClient } from '../api/client.ts';
import { SYNC_LABELS } from '../lib/labels.ts';
import ModalFrame from './ModalFrame.tsx';

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
  sync: SyncState | null;
  onRefresh: () => void;
}

export default function SyncDialog({ open, onOpenChange, api, sync, onRefresh }: SyncDialogProps) {
  return (
    <ModalFrame open={open} onOpenChange={onOpenChange} title="sync --setup">
      <SyncPanel api={api} sync={sync} onRefresh={onRefresh} />
    </ModalFrame>
  );
}

function SyncPanel({ api, sync, onRefresh }: Omit<SyncDialogProps, 'open' | 'onOpenChange'>) {
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');

  async function copyCredential() {
    setCopying(true);
    setMessage('');
    try {
      await navigator.clipboard.writeText(await api.setupCredential());
      setMessage('已复制。请粘贴到脚本属性 SITE_SERVICE_TOKEN，不要粘贴到代码或聊天中。');
    } catch (error) {
      setMessage(errorMessage(error, '复制未完成，请重试。'));
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <span className="modal-icon">
        <Cloud size={27} />
      </span>
      <span className="eyebrow">GOOGLE-HOSTED · NO AI IN THE MIDDLE</span>
      <DialogTitle>写完之后，自动到达。</DialogTitle>
      <DialogDescription className="modal-subtitle">Grok 写日报，Google 脚本搬运原文，拾讯负责阅读。同步过程不调用 AI，电脑关闭也能运行。</DialogDescription>
      <div className="pipeline">
        <span>Grok · Markdown</span>
        <ArrowUpRight size={16} />
        <span>Google Drive</span>
        <ArrowUpRight size={16} />
        <span>拾讯归档</span>
      </div>
      <div className={`sync-status-box ${sync?.state === 'active' ? 'running' : ''}`}>
        <span className="pending-label">
          <i />
          {sync ? SYNC_LABELS[sync.state] : '同步状态暂未读取'}
        </span>
        <p>
          {sync?.lastCheckedAt
            ? `最近回执：${new Date(sync.lastCheckedAt).toLocaleString('zh-CN')} · 新增 ${sync.created} / 更新 ${sync.updated} / 未变 ${sync.unchanged} / 失败 ${sync.failed}`
            : '接收端已就绪；尚未收到 Google 脚本的真实运行回执。完成下面的一次性设置后，才会显示运行中。'}
        </p>
        <button className="text-button" onClick={onRefresh}>
          <RefreshCw size={14} />
          刷新状态
        </button>
      </div>
      <div className="setup-heading">
        <h3>一次设置，以后只管阅读。</h3>
        <span>每 15 分钟检查更新</span>
      </div>
      <ol className="setup-steps">
        <li>
          <span>01</span>
          <div>
            <strong>创建 Google 脚本</strong>
            <p>下载同步器，新建 Apps Script 项目。将 Code.gs 与 appsscript.json 分别粘贴到对应文件。</p>
            <div className="setup-actions">
              <a className="outline-button" href="/downloads/shixun-drive-sync.zip" download>
                <Download size={15} />
                下载同步器
              </a>
              <a className="text-button" href="https://script.google.com/home/start" target="_blank" rel="noopener noreferrer">
                打开 Apps Script
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <strong>设置私密连接凭证</strong>
            <p>
              项目设置 → 脚本属性 → 添加 <code>SITE_SERVICE_TOKEN</code>，将复制的凭证作为值保存。凭证提供站点访问权限，请仅存入你自己的脚本属性。
            </p>
            <button className="outline-button" disabled={copying} onClick={copyCredential}>
              <Copy size={15} />
              {copying ? '正在复制…' : '复制站点连接凭证'}
            </button>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <strong>运行 installSync，完成 Google 授权</strong>
            <p>选择 installSync 后点击运行。脚本先同步并逐字回读，再安装一个定时触发器。返回这里刷新，确认真实回执。</p>
            <a className="text-button" href="/sync-instructions.md" target="_blank">
              查看完整安装与停用说明
              <ArrowUpRight size={14} />
            </a>
          </div>
        </li>
      </ol>
      {message && (
        <p className="setup-message" role="status">
          {message}
        </p>
      )}
      <a className="folder-link" href={`https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`} target="_blank" rel="noopener noreferrer">
        <Folder size={19} />
        <span>
          <strong>日报源文件夹</strong>
          <small>仅读取 Markdown · 去重 · 全文回读校验</small>
        </span>
        <ExternalLink size={16} />
      </a>
      <p className="setup-footnote">
        <Check size={14} />
        旧 AI 写入协议已停用；无需再建 Codex 定时任务。
      </p>
    </>
  );
}
