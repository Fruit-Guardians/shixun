import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'拾讯 · 每日技术观察',description:'来自开发者、研究员与开源社区的每日技术情报。保留原文，认真阅读。',icons:{icon:'/favicon.svg'},metadataBase:new URL('https://daily-tech-observer.breezy-spool-0232.chatgpt.site')};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
