import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const n=v=>Number.isFinite(v)&&v>=0?v:0;
export function analyzeSession(tool,text,file,mtime){
 let title=path.basename(file),timestamp=mtime;const models=new Set(),requests=new Map();let codexTotals=null,records=0;
 for(const line of text.split(/\r?\n/)){if(!line||line.length>1000000)continue;let e;try{e=JSON.parse(line);}catch{continue;}records++;
  if(typeof e.title==='string'&&e.title.trim())title=e.title.slice(0,200);
  if(typeof e.customTitle==='string')title=e.customTitle.slice(0,200);
  if(['session','session_info'].includes(e.type)&&typeof e.name==='string')title=e.name.slice(0,200);
  const m=e.message??e.payload??{};if(typeof m.model==='string')models.add(m.model);
  if(tool==='codex'&&e.type==='event_msg'&&m.type==='token_count'&&m.info?.total_token_usage){const u=m.info.total_token_usage;codexTotals={input:n(u.input_tokens),output:n(u.output_tokens),cache:n(u.cached_input_tokens),cost:null};continue;}
  const u=m.usage;if(!u||(m.role!=='assistant'&&e.type!=='assistant'))continue;
  const cache=n(u.cache_read_input_tokens??u.cacheRead)+n(u.cache_creation_input_tokens??u.cacheWrite),input=n(u.input_tokens??u.input)+cache,output=n(u.output_tokens??u.output);
  const key=m.id??e.uuid??e.id??String(records),prior=requests.get(key),cost=typeof u.cost?.total==='number'?n(u.cost.total):null;
  // Streaming records for the same message replace cumulative snapshots rather than adding them.
  requests.set(key,{input:Math.max(input,prior?.input??0),output:Math.max(output,prior?.output??0),cache:Math.max(cache,prior?.cache??0),cost:cost===null?(prior?.cost??null):Math.max(cost,prior?.cost??0)});
 }
 const totals=codexTotals??[...requests.values()].reduce((a,b)=>({input:a.input+b.input,output:a.output+b.output,cache:a.cache+b.cache,cost:b.cost===null?a.cost:(a.cost??0)+b.cost}),{input:0,output:0,cache:0,cost:null});
 return{id:createHash('sha256').update(file).digest('hex').slice(0,24),tool,title,path:file,updatedAt:new Date(timestamp).toISOString(),models:[...models],...totals,records};
}
export async function sessionIndex(home,locations={}){
 const sources=[{tool:'codex',root:path.join(home,'.codex/sessions')},{tool:'claude-code',root:path.join(home,'.claude/projects')},{tool:'pi',root:path.join(locations.pi||path.join(home,'.pi/agent'),'sessions')}];
 const sessions=[];let partial=false,visited=0,bytesRead=0,folders=0;const maxFiles=600;const status=[];
 for(const source of sources){let found=0,unreadable=0,sourceFiles=0;const files=[];
  async function walk(dir,depth=0){if(depth>8||visited>=maxFiles||sourceFiles>=200||folders++>=1500){partial=true;return;}let entries;try{const s=await fs.lstat(dir);if(s.isSymbolicLink()){unreadable++;partial=true;return;}if(!s.isDirectory())return;entries=(await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>b.name.localeCompare(a.name));}catch(e){if(e.code!=='ENOENT'){unreadable++;partial=true;}return;}
   for(const e of entries){if(visited>=maxFiles||sourceFiles>=200){partial=true;break;}if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p,depth+1);else if(e.isFile()&&e.name.endsWith('.jsonl')){visited++;sourceFiles++;files.push(p);}}
  }
  await walk(source.root);
  for(const file of files){try{const stat=await fs.lstat(file);if(stat.isSymbolicLink()||stat.size>8*1024*1024||bytesRead+stat.size>64*1024*1024){partial=true;continue;}bytesRead+=stat.size;const text=await fs.readFile(file,'utf8');sessions.push(analyzeSession(source.tool,text,file,stat.mtimeMs));found++;}catch{unreadable++;partial=true;}}
  status.push({tool:source.tool,root:source.root,sessions:found,unreadable});
 }
 sessions.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const usage=sessions.reduce((a,s)=>({sessions:a.sessions+1,input:a.input+s.input,output:a.output+s.output,cache:a.cache+s.cache,cost:s.cost===null?a.cost:(a.cost??0)+s.cost}),{sessions:0,input:0,output:0,cache:0,cost:null});
 const costReported=sessions.filter(s=>s.cost!==null).length;
 usage.costReportedSessions=costReported;usage.costMissingSessions=sessions.length-costReported;
 return{sessions,usage,sources:status,partial,notice:`费用报告覆盖 ${costReported}/${sessions.length} 个会话；缺失费用不会按零费用计算。`+'仅索引 Codex / Claude Code / Pi 的本机 JSONL 日志；不含全部工具或远端设备。费用只汇总日志明确报告的金额，不代表套餐余额或服务商账单；尚未按 API Key 归属。'};
}
export async function authOverview(home,profiles,locations={}){
 const paths=[['opencode',path.join(home,'.local/share/opencode/auth.json')],['pi',path.join(locations.pi??path.join(home,'.pi/agent'),'auth.json')],['codex',path.join(home,'.codex/auth.json')],['claude-code',path.join(home,'.claude/.credentials.json')],['deepseek-harness',path.join(home,'.dsh/.credentials.yaml')]];
 const native=[];for(const[tool,file]of paths){let exists=false;try{const s=await fs.lstat(file);exists=s.isFile()&&!s.isSymbolicLink();}catch(e){if(e.code!=='ENOENT'){native.push({tool,path:file,exists:null,status:'凭据文件无法检查 · 请检查路径或读取权限'});continue;}}native.push({tool,path:file,exists,status:exists?'凭据文件存在 · 登录状态未校验':'未发现此处的凭据文件 · 可能使用其他凭据来源'});}
 return{connections:profiles.profiles.map(p=>({id:p.id,name:p.name,enabled:p.enabled,hasKey:p.hasKey,tools:[...new Set([...Object.entries(profiles.bindings??{}).filter(([,id])=>id===p.id).map(([tool])=>tool),...Object.entries(profiles.toolModels??{}).filter(([,c])=>(c.connections??[{profileId:c.profileId}]).some(x=>x.profileId===p.id)).map(([tool])=>tool)])]})),native,notice:'停用连接会阻止星桥再次应用，不会撤销已经写入工具的密钥。API Key 可跨兼容工具分配；OAuth 会话不能直接通用复制，登录、注销与服务端撤销请在原工具或服务商进行。'};
}
