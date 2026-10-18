import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '#web';
import './globals.css';

export const metadata: Metadata = {
  title: '拾讯 · 每日技术观察',
  description: '来自开发者、研究员与开源社区的每日技术情报。保留原文，认真阅读。',
  icons: { icon: '/favicon.svg' },
  metadataBase: new URL('https://daily-tech-observer.breezy-spool-0232.chatgpt.site'),
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2efe4' },
    { media: '(prefers-color-scheme: dark)', color: '#07090a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
