export const CATEGORIES = ['全部','AI','网安','Web 安全','二进制安全','开源社区','软件工程','互联网资讯'];
export function plain(text='') { return text.replace(/^\s*#{1,6}\s+/gm,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').trim(); }
export function tagsFor(text) {
 const rules=[['二进制安全',/内核|kernel|二进制(?!曲线)|逆向|reverse.engineer|Binder|UAF|反作弊|Vanguard|Frida|Android root|KVM|Firecracker|microVM/i],['Web 安全',/web.?安全|XSS|SQL.?注入|SSRF|OAuth|Deep Link|会话劫持|账号接管|认证绕过|Connect Secure/i],['网安',/安全|漏洞|CVE-|沙箱|CERT|KEV|投毒|安全扫描|密钥|exploit|bounty|MOTW/i],['AI',/\bAI\b|Agent|LLM|模型|推理|Claude|Gemini|OpenAI|RL|METR|机器学习|Neural|神经元/i],['开源社区',/开源|Apache|GitHub|许可证|权重|仓库/i],['软件工程',/编码|coding|代码|工具|性能|设计|软件|开发者|terminal|编排|QuickJS|WASM|Terminal-Bench/i]];
 const tags=rules.filter(([,r])=>r.test(text)).map(([k])=>k);
 return tags.length?tags:['互联网资讯'];
}
export function sectionsFor(raw) {
 return raw.split(/\r?\n/).map((line,i)=>({line:plain(line),index:i})).filter(x=>/^[①②③④⑤⑥]|^如果我今天只有|^只有\s*10\s*分钟/.test(x.line)).map((x,i)=>({id:`section-${i}`,label:x.line,index:x.index}));
}
export function storiesFor(report) {
 const lines=report.raw.replace(/\r\n/g,'\n').split('\n');
 const start=lines.findIndex(l=>/^①/.test(plain(l)));
 if(start<0)return [];
 let end=lines.findIndex((l,i)=>i>start&&/^②/.test(plain(l))); if(end<0)end=lines.length;
 const body=lines.slice(start+1,end);const starts=[];
 for(let i=0;i<body.length;i++){
  const s=body[i].trim();if(/^\d+\.\s+\*\*/.test(s)){starts.push(i);continue;}
  const next=body.slice(i+1).find(l=>l.trim())?.trim()??'';
  if(s&&!/^[-*#（]|^按技术|^作者|^原始|^相关|^热度/.test(s)&&/^(作者[：:]|多源讨论)/.test(next))starts.push(i);
 }
 return starts.map((index,i)=>{
  const block=body.slice(index,starts[i+1]??body.length).join('\n').trim();
  const title=plain(body[index]).replace(/^\d+\.\s*/,'').replace(/^标题[：:]\s*/,'');
  const clean=plain(block);const summaryLine=block.split('\n').map(plain).find(l=>/^发生了什么[：:]/.test(l));
  const summary=summaryLine?.replace(/^发生了什么[：:]\s*/,'')??clean.slice(title.length).trim();
  return {id:`${report.id}--${i}`,index:i,title,summary,body:clean,tags:tagsFor(title+"\n"+summary),reportId:report.id,date:report.date,topic:report.topic};
 });
}
export function validDate(date) { if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const d=new Date(date+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===date; }
export function validateImport(input) {
 if(!input||typeof input!=='object')throw new Error('请提交 Markdown 正文和内容日期。');
 if(typeof input.raw!=='string'||input.raw.trim().length<100)throw new Error('正文过短，请导入完整日报（至少 100 字符）。');
 if(new TextEncoder().encode(input.raw).length>500000)throw new Error('文件超过 500 KB，请分篇导入。');
 if(!validDate(input.date))throw new Error('内容日期应为有效的 YYYY-MM-DD 日期。');
 const topic=input.topic==='安全专题'?'安全专题':'全球技术社区';
 const fileId=typeof input.sourceFileId==='string'&&/^[A-Za-z0-9_-]{10,150}$/.test(input.sourceFileId)?input.sourceFileId:null;
 if(input.sourceFileId&&!fileId)throw new Error('Drive 文件 ID 格式无效。');
 return {raw:input.raw,date:input.date,topic,id:fileId?`drive-${fileId}`:`${input.date}_${topic==='安全专题'?'security':'global'}`,title:`${input.date} ${topic}日报`,sourceFileId:fileId,source:fileId?'Google Drive 导入':'手动导入'};
}
