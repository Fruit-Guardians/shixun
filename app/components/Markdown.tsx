import { Fragment, type ReactNode } from 'react';
import { plain } from '@/lib/report-parser.mjs';
function safeHref(url:string){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function inline(text:string):ReactNode[]{
 const tokens=text.split(/(\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>，；（）]+|\*\*[^*]+\*\*|`[^`]+`)/g);
 return tokens.map((t,i)=>{const md=t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);if(md){const href=safeHref(md[2]);return href?<a key={i} href={href} target="_blank" rel="noopener noreferrer">{md[1]}</a>:<Fragment key={i}>{md[1]}</Fragment>;}if(/^https?:\/\//.test(t)){const href=safeHref(t);if(href)return <a key={i} href={href} target="_blank" rel="noopener noreferrer">{t}</a>;}if(t.startsWith('**')&&t.endsWith('**'))return <strong key={i}>{inline(t.slice(2,-2))}</strong>;if(t.startsWith('`')&&t.endsWith('`'))return <code key={i}>{t.slice(1,-1)}</code>;return <Fragment key={i}>{t}</Fragment>;});
}
export default function Markdown({raw}:{raw:string}){
 let section=0;let story=0;let inTop=false;
 const lines=raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').split(/\r?\n/);
 return <div className="markdown">{lines.map((line,i)=>{
  const s=line.trim();if(!s)return null;const p=plain(s);
  if(/^[①②③④⑤⑥]|^如果我今天只有|^只有\s*10\s*分钟/.test(p)){inTop=p.startsWith('①');return <h2 key={i} id={`section-${section++}`}>{inline(p)}</h2>;}
  const first=i===lines.findIndex(l=>l.trim());
  if(first&&!/^(作者|发生了什么)/.test(p))return <h1 key={i}>{inline(p)}</h1>;
  const numbered=/^\d+\.\s+\*\*/.test(s);
  const next=lines.slice(i+1).find(l=>l.trim())?.trim()??'';
  const oldTitle=inTop&&!/^[-*#（]|^按技术|^作者|^原始|^相关|^热度/.test(s)&&/^(作者[：:]|多源讨论)/.test(next);
  if(numbered||oldTitle)return <h3 key={i} id={inTop?`story-${story++}`:undefined}>{inline(s)}</h3>;
  if(/^#{1,6}\s/.test(s))return <h3 key={i}>{inline(s.replace(/^#{1,6}\s+/,''))}</h3>;
  return <p key={i} className={/^(原始|相关|GitHub|热度)/.test(p)?'source-line':/^（/.test(p)?'aside-line':undefined}>{inline(s.replace(/^[-*]\s+/,''))}</p>;
 })}</div>;
}
