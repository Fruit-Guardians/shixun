import { readReport } from '@/lib/reports';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const report=await readReport(id);
 if(!report)return Response.json({error:'日报不存在。'},{status:404});
 return new Response(report.raw,{headers:{'Content-Type':'text/markdown; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(report.date+'_'+report.topic+'.md')}`}});
}
