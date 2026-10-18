import { ArrowRight, Upload } from 'lucide-react';
import { useState } from 'react';
import type { DragEvent } from 'react';
import { DEFAULT_TOPIC, SIGN_IN_PATH, TOPICS } from '#shared';
import type { ImportRequest, ReportTopic } from '#shared';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError, errorMessage } from '../api/client.ts';
import { formatCount } from '../lib/format.ts';
import { fileProblem, guessMetadata } from '../lib/import-file.ts';
import ModalFrame from './ModalFrame.tsx';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存成功时 resolve；失败时 reject，错误信息会显示在表单里。 */
  onSubmit: (input: ImportRequest) => Promise<void>;
}

interface Problem {
  message: string;
  needsLogin: boolean;
}

export default function ImportDialog({ open, onOpenChange, onSubmit }: ImportDialogProps) {
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState('');
  const [topic, setTopic] = useState<ReportTopic>(DEFAULT_TOPIC);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  function fail(message: string) {
    setProblem({ message, needsLogin: false });
  }

  async function loadFile(file: File) {
    const rejected = fileProblem(file);
    if (rejected) return fail(rejected);
    const text = await file.text();
    const guess = guessMetadata(file.name, text);
    setRaw(text);
    setDate(guess.date);
    setTopic(guess.topic);
    setProblem(null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit({ raw, date, topic });
      setRaw('');
    } catch (error) {
      setProblem({ message: errorMessage(error, '导入失败。'), needsLogin: error instanceof ApiError && error.status === 401 });
    } finally {
      setBusy(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setProblem(null);
    onOpenChange(next);
  }

  return (
    <ModalFrame open={open} onOpenChange={handleOpenChange} title="import report.md">
      <span className="eyebrow">ADD TO YOUR ARCHIVE</span>
      <DialogTitle>导入一份完整日报。</DialogTitle>
      <DialogDescription className="modal-subtitle">文件原文完整保存；重复内容自动复用，更新保留历史版本。</DialogDescription>
      <label className="upload-drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <Upload size={22} />
        <strong>选择文件，或将 Markdown 拖到这里</strong>
        <span>.md / .markdown / .txt · 最大 500 KB</span>
        <input
          type="file"
          accept=".md,.markdown,.txt"
          aria-label="选择 Markdown 文件"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />
      </label>
      <div className="form-row">
        <label>
          内容日期（UTC−8）
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          日报主题
          <select value={topic} onChange={(e) => setTopic(e.target.value as ReportTopic)}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="textarea-label">
        或直接粘贴完整 Markdown <span>{formatCount(raw.length)} 字符</span>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="# YYYY-MM-DD 全球技术社区日报…" rows={7} />
      </label>
      {problem && (
        <p className="form-error" role="alert">
          {problem.message}
          {problem.needsLogin && (
            <a href={`${SIGN_IN_PATH}?return_to=/`} target="_top">
              登录后导入 →
            </a>
          )}
        </p>
      )}
      <button disabled={busy || !raw.trim() || !date} className="primary-button wide" onClick={submit}>
        {busy ? '正在保存并回读校验…' : '保存至阅读归档'}
        <ArrowRight size={16} />
      </button>
    </ModalFrame>
  );
}
