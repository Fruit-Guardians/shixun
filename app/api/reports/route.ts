import { listReports, ingestReport } from '@/lib/reports';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { env } from 'cloudflare:workers';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(){try{const reports=await listReports();return Response.json({reports,drive:{status:reports.some(r=>r.sourceFileId)?'imported':'not_connected',folderId:'1K0N3bIvwxE8x38BKc9vVeKxqqDdlGjpT'}},{headers});}catch{return Response.json({error:'归档暂时读取失败，请稍后刷新。'},{status:503,headers});}}
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'请求来源不匹配。'},{status:403,headers});
 const user=await getChatGPTUser();
 const token=(env as Cloudflare.Env & {INGEST_TOKEN?:string}).INGEST_TOKEN;
 const serviceAllowed=Boolean(token&&request.headers.get('authorization')===`Bearer ${token}`);
 if(!user&&!serviceAllowed)return Response.json({error:'请先登录，再导入日报。'},{status:401,headers});
 if(Number(request.headers.get('content-length')??0)>600000)return Response.json({error:'文件过大。'},{status:413,headers});
 try{const raw=await request.text();if(new TextEncoder().encode(raw).length>600000)return Response.json({error:'文件过大。'},{status:413,headers});let input;try{input=JSON.parse(raw);}catch{return Response.json({error:'提交格式无效。'},{status:400,headers});}return Response.json(await ingestReport(input),{headers});}
 catch(error){const message=error instanceof Error?error.message:'';const known=/请|正文|文件|日期|格式/.test(message);return Response.json({error:known?message:'导入暂时失败，原文件保持不变。'},{status:known?400:503,headers});}
}
