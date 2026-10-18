import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'请求来源不匹配。'},{status:403});
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录站点。'},{status:401});
 const token=(env as Cloudflare.Env&{SITES_SERVICE_ACCESS?:string}).SITES_SERVICE_ACCESS;
 if(!token)return Response.json({error:'站点后台凭证尚未配置。'},{status:503});
 return Response.json({token},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
