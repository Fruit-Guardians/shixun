import { ingestReport } from '@/lib/reports';
import { isProgramSync } from '@/lib/sync-request';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const protocol=request.headers.get('x-sites-report-sync');
 if(protocol==='google-drive')return Response.json({error:'旧 AI 定时同步通道已退役，请使用 Google Apps Script。',code:'legacy_ai_sync_retired'},{status:410});
 if(!isProgramSync(request))return Response.json({error:'仅接受受保护的程序同步请求。'},{status:403});
 const text=await request.text();if(new TextEncoder().encode(text).length>600000)return Response.json({error:'文件过大。'},{status:413});
 let data;try{data=JSON.parse(text);}catch{return Response.json({error:'JSON 格式无效。'},{status:400});}
 if(!data||typeof data!=='object'||Array.isArray(data)||!data.sourceFileId)return Response.json({error:'同步需要已核实的 Drive 文件 ID。'},{status:400});
 try{return Response.json(await ingestReport(data),{headers:{'Cache-Control':'private, no-store'}});}catch(error){const message=error instanceof Error?error.message:'';return Response.json({error:/请|正文|日期|格式|文件/.test(message)?message:'归档暂时写入失败。'},{status:400});}
}
