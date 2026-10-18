import { ingestReport } from '@/lib/reports';
export const dynamic='force-dynamic';
// This writer is protected by the owner-private Sites ingress. Non-browser
// service callers must pass OAI-Sites-Authorization to that ingress. Dispatch
// consumes the credential before this handler. Never deploy this route publicly.
export async function POST(request:Request){
 if(request.headers.has('origin')||request.headers.get('sec-fetch-site')||request.headers.get('x-sites-report-sync')!=='google-drive')return Response.json({error:'仅接受受保护的后台同步请求。'},{status:403});
 const text=await request.text();if(new TextEncoder().encode(text).length>600000)return Response.json({error:'文件过大。'},{status:413});
 let data;try{data=JSON.parse(text);}catch{return Response.json({error:'JSON 格式无效。'},{status:400});}
 if(!data.sourceFileId)return Response.json({error:'同步需要已核实的 Drive 文件 ID。'},{status:400});
 try{const result=await ingestReport(data);return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});}catch(error){const message=error instanceof Error?error.message:'';return Response.json({error:/请|正文|日期|格式|文件/.test(message)?message:'归档暂时写入失败。'},{status:400});}
}
