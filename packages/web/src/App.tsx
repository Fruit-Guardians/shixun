'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Category, FeedSource, ImportRequest, IngestResult } from '#shared';
import { createApiClient, errorMessage } from './api/client.ts';
import type { ApiClient } from './api/client.ts';
import BrowseView from './components/BrowseView.tsx';
import CommandPalette from './components/CommandPalette.tsx';
import { LoadingState } from './components/EmptyState.tsx';
import FeedView from './components/FeedView.tsx';
import ImportDialog from './components/ImportDialog.tsx';
import ReaderView from './components/ReaderView.tsx';
import SourcesView from './components/SourcesView.tsx';
import Sidebar from './components/Sidebar.tsx';
import SyncDialog from './components/SyncDialog.tsx';
import { BackToTop, Toast } from './components/Toast.tsx';
import Topbar from './components/Topbar.tsx';
import VersionsDialog from './components/VersionsDialog.tsx';
import { useArchive } from './hooks/useArchive.ts';
import { useFeed } from './hooks/useFeed.ts';
import { useFeedChannels } from './hooks/useFeedChannels.ts';
import { useLocalStore } from './hooks/useLocalStore.ts';
import { useReportRoute } from './hooks/useReportRoute.ts';
import { useReportText } from './hooks/useReportText.ts';
import { useShowBackToTop } from './hooks/useScroll.ts';
import { useSearch } from './hooks/useSearch.ts';
import { useSession } from './hooks/useSession.ts';
import { useShortcuts } from './hooks/useShortcuts.ts';
import { usePalette, useTheme } from './hooks/useTheme.ts';
import { useToast } from './hooks/useToast.ts';
import { densityStore, savedStore } from './lib/preferences.ts';
import { syncThemeColor } from './lib/theme.ts';
import type { Density } from './lib/preferences.ts';
import { deriveBrowse } from './lib/selectors.ts';
import type { InitialArchive } from './state/archive.ts';
import { browseReducer, initialBrowse } from './state/browse.ts';
import type { View } from './state/browse.ts';
import './styles/ui.css';

const defaultApi = createApiClient();

export interface AppProps {
  /** 宿主预取的归档（服务端渲染用）。缺省时挂载后自行请求。 */
  initial?: InitialArchive;
  /** 后端客户端；默认同源 `/api/*`，可换成其他地址的后端。 */
  api?: ApiClient;
}

type Modal = 'import' | 'sync' | 'command' | 'versions' | null;

export default function App({ initial, api = defaultApi }: AppProps) {
  const archive = useArchive(api, initial);
  // 只决定显示哪些按钮；写接口在服务端各自校验身份。
  const session = useSession(api);
  const owner = session.owner;
  const [browse, dispatch] = useReducer(browseReducer, initial?.data?.reports[0]?.id ?? '', initialBrowse);
  const { reportId, open: openRoute, close: closeReport, linkTo } = useReportRoute();
  const [theme, toggleTheme] = useTheme();
  const [palette, setPalette] = usePalette();
  const saved = useLocalStore(savedStore);
  const density = useLocalStore(densityStore);
  const savedIds = useMemo(() => new Set(saved), [saved]);
  const [modal, setModal] = useState<Modal>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, showToast] = useToast();
  const showBackToTop = useShowBackToTop();
  const searchRef = useRef<HTMLInputElement>(null);

  const fullText = useSearch(api, browse.query);
  const model = useMemo(
    () => deriveBrowse(archive.reports, browse, savedIds, fullText.hits),
    [archive.reports, browse, savedIds, fullText.hits],
  );
  const reading = archive.reports.find((r) => r.id === reportId);
  const [feedSource, setFeedSource] = useState<FeedSource | null>(null);
  const feed = useFeed(api, browse.view === 'feed' && !reading, feedSource);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const sources = useFeedChannels(api, browse.view === 'sources' && !reading);
  const readingText = useReportText(api, reading);

  // 地址栏颜色跟随配色与明暗。
  useEffect(syncThemeColor, [theme, palette]);

  const leaveReader = useCallback(() => {
    closeReport();
    setMobileNav(false);
    scrollTo({ top: 0, behavior: 'smooth' });
  }, [closeReport]);

  const navigate = useCallback(
    (view: View) => {
      dispatch({ type: 'navigate', view });
      leaveReader();
    },
    [leaveReader],
  );

  useShortcuts({
    onCommand: useCallback(() => setModal((m) => (m === 'command' ? null : 'command')), []),
    onSearch: useCallback(() => searchRef.current?.focus(), []),
    onView: navigate,
    onEscape: useCallback(() => setMobileNav(false), []),
  });

  const search = useCallback(
    (query: string) => {
      dispatch({ type: 'set-query', query });
      if (reading) leaveReader();
      else scrollTo({ top: 0, behavior: 'smooth' });
    },
    [reading, leaveReader],
  );

  const focusCategory = useCallback(
    (category: Category) => {
      dispatch({ type: 'focus-category', category, fromReader: Boolean(reading) });
      if (reading || browse.view === 'archive') leaveReader();
      setMobileNav(false);
    },
    [reading, browse.view, leaveReader],
  );

  const showEdition = useCallback(
    (id: string) => {
      dispatch({ type: 'show-edition', id });
      leaveReader();
    },
    [leaveReader],
  );

  const openReport = useCallback(
    (id: string, storyIndex?: number) => {
      setMobileNav(false);
      openRoute(id, storyIndex);
    },
    [openRoute],
  );

  const toggleSave = useCallback(
    (id: string) => {
      const nowSaved = !saved.includes(id);
      const persisted = savedStore.set(nowSaved ? [...saved, id] : saved.filter((x) => x !== id));
      showToast(persisted ? (nowSaved ? '已加入本机稍后阅读' : '已从稍后阅读移除') : '当前浏览器未保存收藏，关闭页面后会丢失。');
    },
    [saved, showToast],
  );

  const copyLink = useCallback(
    (id: string) => {
      navigator.clipboard.writeText(linkTo(id)).then(
        () => showToast('阅读链接已复制'),
        () => showToast('复制未完成，请手动复制地址栏链接。'),
      );
    },
    [linkTo, showToast],
  );

  const { refresh, importReport } = archive;
  const handleRefresh = useCallback(async () => {
    if (await refresh()) showToast('归档已刷新');
  }, [refresh, showToast]);

  const handleImport = useCallback(
    async (input: ImportRequest) => {
      const result = await importReport(input);
      dispatch({ type: 'show-edition', id: result.id });
      closeReport();
      setModal(null);
      showToast(result.status === 'unchanged' ? '内容相同，已复用现有日报' : '日报已保存，并通过全文回读校验');
    },
    [importReport, closeReport, showToast],
  );

  const handleRestored = useCallback(
    async (result: IngestResult) => {
      setModal(null);
      showToast(result.status === 'unchanged' ? '所选版本与当前内容相同' : `已恢复为第 ${result.revision} 版`);
      await refresh();
    },
    [refresh, showToast],
  );

  const handleDeleted = useCallback(async () => {
    setModal(null);
    navigate('today');
    showToast('已删除；原文仍保留在库内版本历史里');
    await refresh();
  }, [navigate, refresh, showToast]);

  // 首屏归档在服务端读取，不带登录身份，失败明细被省略；确认是所有者后重新读一次。
  const hasFailures = (archive.sync?.failed ?? 0) > 0;
  useEffect(() => {
    if (owner && hasFailures) void refresh();
  }, [owner, hasFailures, refresh]);

  const { reload: reloadFeed } = feed;
  const refreshAllFeeds = useCallback(async () => {
    setFeedRefreshing(true);
    try {
      const { channels } = await api.refreshFeed();
      const failed = channels.filter((c) => !c.ok).length;
      // 一次请求的子请求有上限，服务端会按过期程度抓一部分，剩下的交给定时任务。
      showToast(failed ? `已抓取 ${channels.length} 个频道，其中 ${failed} 个失败` : `已抓取 ${channels.length} 个频道`);
      reloadFeed();
    } catch (error) {
      showToast(errorMessage(error, '信源刷新失败，请稍后重试。'));
    } finally {
      setFeedRefreshing(false);
    }
  }, [api, reloadFeed, showToast]);

  const openFeedSource = useCallback(
    (source: FeedSource) => {
      setFeedSource(source);
      navigate('feed');
    },
    [navigate],
  );

  const changeDensity = useCallback((next: Density) => densityStore.set(next), []);

  return (
    <>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <Topbar
        view={browse.view}
        reading={Boolean(reading)}
        savedCount={saved.length}
        theme={theme}
        palette={palette}
        onPalette={setPalette}
        onNavigate={navigate}
        onToggleTheme={toggleTheme}
        onToggleMobileNav={() => setMobileNav((open) => !open)}
        onImport={owner ? () => setModal('import') : undefined}
        onCommand={() => setModal('command')}
      />
      <div className="app-shell">
        <Sidebar
          view={browse.view}
          reading={Boolean(reading)}
          mobileOpen={mobileNav}
          reportCount={archive.reports.length}
          savedCount={saved.length}
          category={browse.category}
          counts={model.counts}
          recent={archive.reports.slice(0, 4)}
          edition={model.activeReport?.id ?? ''}
          sync={archive.sync}
          onNavigate={navigate}
          onCategory={focusCategory}
          onEdition={showEdition}
          onOpenSync={() => setModal('sync')}
        />
        {mobileNav && <button className="nav-scrim" aria-label="关闭分类导航" onClick={() => setMobileNav(false)} />}
        <main className="main-content" id="main">
          {reading ? (
            <ReaderView
              report={reading}
              text={readingText}
              downloadUrl={api.reportUrl(reading.id)}
              onBack={() => navigate('today')}
              onCopyLink={copyLink}
              onOpenVersions={() => setModal('versions')}
            />
          ) : browse.view === 'feed' ? (
            <FeedView
              feed={feed}
              source={feedSource}
              onSource={setFeedSource}
              onLoadMore={feed.loadMore}
              onReload={reloadFeed}
              onRefreshAll={owner ? refreshAllFeeds : undefined}
              refreshingAll={feedRefreshing}
            />
          ) : browse.view === 'sources' ? (
            <SourcesView sources={sources} onReload={sources.reload} onOpenSource={openFeedSource} />
          ) : archive.status === 'loading' ? (
            <LoadingState />
          ) : (
            <BrowseView
              browse={browse}
              model={model}
              reports={archive.reports}
              sync={archive.sync}
              hasDriveImports={archive.hasDriveImports}
              error={archive.error}
              searchDegraded={fullText.failed}
              refreshing={archive.refreshing}
              density={density}
              saved={savedIds}
              searchRef={searchRef}
              onQuery={(query) => dispatch({ type: 'set-query', query })}
              onCategory={(category) => dispatch({ type: 'set-category', category })}
              onEdition={(id) => dispatch({ type: 'set-edition', id })}
              onDensity={changeDensity}
              onRefresh={handleRefresh}
              onClearFilters={() => dispatch({ type: 'clear-filters' })}
              onToggleSave={toggleSave}
              onOpenReport={openReport}
              onOpenSync={() => setModal('sync')}
            />
          )}
        </main>
      </div>
      <Toast message={toast} />
      {owner && <ImportDialog open={modal === 'import'} onOpenChange={(open) => setModal(open ? 'import' : null)} onSubmit={handleImport} />}
      <SyncDialog
        open={modal === 'sync'}
        onOpenChange={(open) => setModal(open ? 'sync' : null)}
        api={api}
        sync={archive.sync}
        session={session}
        onRefresh={handleRefresh}
      />
      {reading && (
        <VersionsDialog
          open={modal === 'versions'}
          onOpenChange={(open) => setModal(open ? 'versions' : null)}
          api={api}
          report={reading}
          canManage={owner}
          onRestored={handleRestored}
          onDeleted={handleDeleted}
        />
      )}
      <CommandPalette
        open={modal === 'command'}
        onOpenChange={(open) => setModal(open ? 'command' : null)}
        reports={archive.reports}
        theme={theme}
        palette={palette}
        onNavigate={navigate}
        onOpenReport={openReport}
        onCategory={focusCategory}
        onSearch={search}
        onPalette={setPalette}
        onToggleTheme={toggleTheme}
        onImport={owner ? () => setModal('import') : undefined}
        onOpenSync={() => setModal('sync')}
        onRefresh={handleRefresh}
      />
      <BackToTop show={showBackToTop} />
    </>
  );
}
