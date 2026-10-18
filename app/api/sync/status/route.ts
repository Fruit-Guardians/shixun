import { getSyncState,recordSyncRun } from '@/lib/sync-state';
import { isProgramSync } from '@/lib/sync-request';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await getSyncState(),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'同步状态暂时读取失败。'},{status:503});}}
export async function POST(request:Request){
 if(!isProgramSync(request))return Response.json({error:'请求来源无效。'},{status:403});
 try{const raw=await request.text();if(raw.length>4096)return Response.json({error:'状态请求过大。'},{status:413});return Response.json(await recordSyncRun(JSON.parse(raw)),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'同步状态格式无效。'},{status:400});}
}
