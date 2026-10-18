import { env } from 'cloudflare:workers';
import type {SyncState} from './sync-types';
const empty:SyncState={mode:'google-apps-script',state:'awaiting_setup',lastCheckedAt:null,triggerInstalled:false,created:0,updated:0,unchanged:0,failed:0,legacyWriterDisabled:true};
export async function getSyncState():Promise<SyncState>{
 if(!env.DB)return empty;
 const row=await env.DB.prepare('SELECT * FROM sync_runs ORDER BY received_at DESC LIMIT 1').first();
 if(!row)return empty;
 const installed=Boolean(row.trigger_installed);const stale=Date.now()-Date.parse(String(row.received_at))>60*60*1000;
 return {...empty,state:!installed?'disabled':Number(row.failed_count)>0?'attention':stale?'stale':'active',lastCheckedAt:String(row.received_at),triggerInstalled:installed,created:Number(row.created_count),updated:Number(row.updated_count),unchanged:Number(row.unchanged_count),failed:Number(row.failed_count)};
}
export async function recordSyncRun(input:unknown){
 if(!input||typeof input!=='object')throw new Error('同步状态格式无效。');
 const v=input as Record<string,unknown>;
 if(typeof v.triggerInstalled!=='boolean')throw new Error('缺少 Google 触发器实际安装状态。');
 const counts=['created','updated','unchanged','failed'].map(k=>{const n=v[k]??0;if(typeof n!=='number'||!Number.isInteger(n)||n<0||n>10000)throw new Error('同步统计无效。');return n;});
 const now=new Date().toISOString();const checked=typeof v.checkedAt==='string'&&!Number.isNaN(Date.parse(v.checkedAt))?v.checkedAt:now;
 if(!env.DB)throw new Error('数据库尚未就绪。');
 await env.DB.prepare('INSERT INTO sync_runs (id,received_at,checked_at,trigger_installed,created_count,updated_count,unchanged_count,failed_count) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),now,checked,v.triggerInstalled?1:0,...counts).run();
 return getSyncState();
}
