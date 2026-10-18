// Reads one JSON object from stdin. No credentials are stored or logged.
import { readFile } from 'node:fs/promises';
let input='';for await(const chunk of process.stdin) input+=chunk;
const args=JSON.parse(input);const url=new URL(args.siteUrl);
if(url.protocol!=='https:'||!url.hostname.endsWith('.chatgpt.site'))throw new Error('Only the configured Sites HTTPS origin is accepted.');
const auth={'OAI-Sites-Authorization':`Bearer ${args.accessToken}`};
const raw=args.filePath?await readFile(args.filePath,'utf8'):args.raw;
const response=await fetch(new URL('/api/sync',url),{method:'POST',headers:{...auth,'Content-Type':'application/json','X-Sites-Report-Sync':'google-apps-script'},body:JSON.stringify({raw,date:args.date,topic:args.topic,sourceFileId:args.sourceFileId})});
if(!response.ok)throw new Error(`Site write failed: ${response.status}`);
const result=await response.json();if(!result.id)throw new Error('Writer did not return a record id.');
const check=await fetch(new URL(`/api/reports/${encodeURIComponent(result.id)}`,url),{headers:auth});
if(!check.ok||(await check.text())!==raw)throw new Error('Full readback mismatch.');
console.log(JSON.stringify({...result,fullReadbackMatch:true,bytes:new TextEncoder().encode(raw).length}));
