'use client';

import { Command } from 'cmdk';
import { CornerDownLeft } from 'lucide-react';
import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { CATEGORIES } from '#shared';
import type { Category, ReportSummary } from '#shared';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { searchTerm } from '../lib/command.ts';
import { CATEGORY_LABELS, tagCode, topicLabel } from '../lib/labels.ts';
import { PALETTES } from '../lib/theme.ts';
import type { Palette, Theme } from '../lib/theme.ts';
import type { View } from '../state/browse.ts';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: ReportSummary[];
  theme: Theme;
  palette: Palette;
  onNavigate: (view: View) => void;
  onOpenReport: (id: string) => void;
  onCategory: (category: Category) => void;
  onSearch: (query: string) => void;
  onPalette: (palette: Palette) => void;
  onToggleTheme: () => void;
  /** 只有所有者才传：访客的命令面板里没有导入。 */
  onImport?: () => void;
  onOpenSync: () => void;
  onRefresh: () => void;
}

const VIEWS: { view: View; cmd: string; label: string; keywords: string[] }[] = [
  { view: 'today', cmd: 'cd ~/today', label: '每日观察', keywords: ['today', 'home', '首页'] },
  { view: 'archive', cmd: 'git log --reports', label: '日报归档', keywords: ['archive', '归档', '历史'] },
  { view: 'saved', cmd: 'ls ~/read-later', label: '稍后阅读', keywords: ['saved', '收藏', 'bookmark'] },
];

/** ⌘K 命令面板：跳转视图、打开日报、筛选领域、搜索与切换配色，全部键盘可达。 */
export default function CommandPalette(props: CommandPaletteProps) {
  const { open, onOpenChange, reports, theme, palette } = props;
  const [input, setInput] = useState('');
  const term = searchTerm(input);

  const run = (action: () => void) => () => {
    onOpenChange(false);
    setInput('');
    action();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setInput('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="modal cmdk-modal" showCloseButton={false} aria-describedby={undefined}>
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <div className="window-bar">
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="window-title">shixun — command</span>
          <kbd className="cmdk-esc">esc</kbd>
        </div>
        <Command loop label="命令面板">
          <div className="cmdk-input">
            <span className="prompt">$</span>
            <Command.Input value={input} onValueChange={setInput} placeholder="输入命令，或 grep 关键词…" />
          </div>
          <Command.List>
            <Command.Empty>
              <span className="dim">command not found:</span> {input}
            </Command.Empty>

            <Command.Group heading="navigate">
              {VIEWS.map((v) => (
                <Item key={v.view} value={v.cmd} keywords={[v.label, ...v.keywords]} onSelect={run(() => props.onNavigate(v.view))} hint={v.label}>
                  {v.cmd}
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading="reports">
              {reports.map((r) => (
                <Item
                  key={r.id}
                  value={`less ${r.date}.md ${r.id}`}
                  keywords={[r.title, topicLabel(r.topic)]}
                  onSelect={run(() => props.onOpenReport(r.id))}
                  hint={topicLabel(r.topic)}
                >
                  less {r.date}.md
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading="filter">
              {CATEGORIES.map((c) => (
                <Item
                  key={c}
                  value={`filter ${c === '全部' ? 'all' : tagCode(c).toLowerCase()}`}
                  keywords={[c, CATEGORY_LABELS[c]]}
                  onSelect={run(() => props.onCategory(c))}
                  hint={CATEGORY_LABELS[c]}
                >
                  filter --tag {c === '全部' ? 'all' : tagCode(c)}
                </Item>
              ))}
            </Command.Group>

            <Command.Group heading="theme">
              {PALETTES.map((p) => (
                <Item
                  key={p.id}
                  value={`theme ${p.id}`}
                  keywords={[p.label, p.hint, '配色', 'palette']}
                  onSelect={run(() => props.onPalette(p.id))}
                  hint={palette === p.id ? `${p.label} · 当前` : p.label}
                >
                  <span className="palette-swatch cmdk-swatch" data-p={p.id} aria-hidden="true" />
                  theme {p.id}
                </Item>
              ))}
              <Item
                value={`theme ${theme === 'dark' ? 'light' : 'dark'}`}
                keywords={['明暗', '深色', '浅色', 'mode']}
                onSelect={run(props.onToggleTheme)}
                hint={theme === 'dark' ? '切换到浅色' : '切换到深色'}
              >
                theme {theme === 'dark' ? 'light' : 'dark'}
              </Item>
            </Command.Group>

            <Command.Group heading="actions">
              {props.onImport && (
                <Item value="import .md" keywords={['导入', 'upload', 'markdown']} onSelect={run(props.onImport)} hint="导入日报">
                  import .md
                </Item>
              )}
              <Item value="systemctl status sync" keywords={['同步', 'sync', 'google']} onSelect={run(props.onOpenSync)} hint="同步状态">
                systemctl status sync
              </Item>
              <Item value="git pull" keywords={['刷新', 'refresh', 'reload']} onSelect={run(props.onRefresh)} hint="刷新归档">
                git pull
              </Item>
            </Command.Group>

            {term && (
              <Command.Group heading="search" forceMount>
                <Item value={`grep ${term}`} forceMount onSelect={run(() => props.onSearch(term))} hint="搜索全部动态">
                  grep -i &quot;{term}&quot;
                </Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
        <div className="cmdk-foot">
          <span>
            <kbd>↑↓</kbd> 选择
          </span>
          <span>
            <kbd>↵</kbd> 执行
          </span>
          <span>
            <kbd>/</kbd> 搜索框 · <kbd>1-3</kbd> 切换视图
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  children,
  hint,
  ...rest
}: { children: ReactNode; hint: string } & Pick<ComponentProps<typeof Command.Item>, 'value' | 'keywords' | 'onSelect' | 'forceMount'>) {
  return (
    <Command.Item {...rest}>
      <span className="cmdk-label">{children}</span>
      <span className="cmdk-hint">{hint}</span>
      <CornerDownLeft size={13} className="cmdk-enter" aria-hidden="true" />
    </Command.Item>
  );
}
