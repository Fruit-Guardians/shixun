import { env } from 'cloudflare:workers';
import seeds from '@/data/seed-reports.json';
import { validateImport } from './report-parser.mjs';
export type Report = {id:string;date:string;title:string;topic:string;source:string;sourceFileId:string|null;raw:string;importedAt:string|null;revision?:number};
function rowReport(row:Record<string,unknown>):Report { return {id:String(row.id),date:String(row.date),title:String(row.title),topic:String(row.topic),source:String(row.source),sourceFileId:row.source_file_id?String(row.source_file_id):null,raw:String(row.raw),importedAt:String(row.imported_at),revision:Number(row.revision)}; }
export async function listReports():Promise<Report[]> {
 if(!env.DB)throw new Error('归档数据库尚未配置。');
 const stored=await env.DB.prepare('SELECT * FROM reports ORDER BY date DESC').all();
 const map=new Map<string,Report>((seeds as Report[]).map(r=>[r.id,r]));
 for(const row of stored.results??[]) {
  const report=rowReport(row);
  for(const [id,seed] of map)if(seed.source==='用户提供的历史文案'&&seed.date===report.date&&seed.topic===report.topic)map.delete(id);
  map.set(report.id,report);
 }
 return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date)||(a.topic==='全球技术社区'?-1:1));
}
export async function readReport(id:string) {return (await listReports()).find(r=>r.id===id);}
export async function ingestReport(input:unknown) {
 const data=validateImport(input);if(!env.DB)throw new Error('归档数据库尚未配置。');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.raw)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const existing=await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(data.id).first();
 if(existing?.hash===hash)return {id:data.id,status:'unchanged',hash,revision:Number(existing.revision)};
 const now=new Date().toISOString();const revision=Number(existing?.revision??0)+1;
 const statements=[];
 if(existing)statements.push(env.DB.prepare('INSERT INTO report_versions (id,report_id,raw,hash,saved_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),data.id,existing.raw,existing.hash,now));
 statements.push(env.DB.prepare('INSERT INTO reports (id,date,title,topic,raw,hash,source,source_file_id,imported_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,title=excluded.title,topic=excluded.topic,raw=excluded.raw,hash=excluded.hash,source=excluded.source,source_file_id=excluded.source_file_id,imported_at=excluded.imported_at,revision=excluded.revision').bind(data.id,data.date,data.title,data.topic,data.raw,hash,data.source,data.sourceFileId,now,revision));
 await env.DB.batch(statements);
 const readback=await env.DB.prepare('SELECT raw, hash FROM reports WHERE id=?').bind(data.id).first();
 if(readback?.raw!==data.raw||readback?.hash!==hash)throw new Error('写入后回读校验失败，请重试。');
 return {id:data.id,status:existing?'updated':'created',hash,revision};
}
