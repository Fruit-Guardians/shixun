import { Menu, Moon, Plus, Sun } from 'lucide-react';
import type { Theme } from '../lib/theme.ts';
import type { View } from '../state/browse.ts';

interface TopbarProps {
  view: View;
  reading: boolean;
  savedCount: number;
  theme: Theme;
  onNavigate: (view: View) => void;
  onToggleTheme: () => void;
  onToggleMobileNav: () => void;
  onImport: () => void;
}

const NAV: { view: View; label: string }[] = [
  { view: 'today', label: '每日观察' },
  { view: 'archive', label: '日报归档' },
  { view: 'saved', label: '稍后阅读' },
];

export default function Topbar({ view, reading, savedCount, theme, onNavigate, onToggleTheme, onToggleMobileNav, onImport }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={() => onNavigate('today')} aria-label="拾讯首页">
          <span className="brandmark" aria-hidden="true">
            &gt;_
          </span>
          <span className="brand-name">拾讯</span>
          <span className="brand-path">~/daily-signal</span>
        </button>
        <nav className="topnav" aria-label="主导航">
          {NAV.map((item, i) => (
            <button key={item.view} className={view === item.view && !reading ? 'active' : ''} onClick={() => onNavigate(item.view)}>
              <kbd>{i + 1}</kbd>
              {item.label}
              {item.view === 'saved' && <span className="nav-count">({savedCount})</span>}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="btn btn-ghost btn-icon mobile-menu" aria-label="展开分类导航" onClick={onToggleMobileNav}>
            <Menu size={18} />
          </button>
          <button className="btn btn-ghost btn-icon" aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="btn btn-primary btn-label-wrap" aria-label="导入 Markdown" onClick={onImport}>
            <Plus size={16} />
            <span className="btn-label">import .md</span>
          </button>
        </div>
      </div>
    </header>
  );
}
