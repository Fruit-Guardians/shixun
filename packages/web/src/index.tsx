/**
 * 前端包入口。宿主只需要 `<App />`，以及主题初始化脚本（避免深色模式闪白）。
 * 前端与后端之间只有 HTTP 契约（`#shared`），这里不引用 `#api`。
 */
export { default as App } from './App.tsx';
export type { AppProps } from './App.tsx';
export { createApiClient } from './api/client.ts';
export type { ApiClient } from './api/client.ts';
export type { InitialArchive } from './state/archive.ts';
export { THEME_INIT_SCRIPT } from './lib/theme.ts';
