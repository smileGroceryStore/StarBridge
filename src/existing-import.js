import {parse} from 'jsonc-parser';
import {randomUUID} from 'node:crypto';
export function parseExisting(toolId,snapshots,env={}){
 const docs=snapshots.map(s=>{const errors=[],d=parse(s.text,errors,{allowTrailingComma:true});if(errors.length||!d||typeof d!=='object')throw Error('工具配置无法解析，原文件未修改');return d;});
 const providers=toolId==='opencode'?docs[0].provider:docs[0].providers,profiles=[],skipped=[];
 const sdk={'@ai-sdk/openai-compatible':'openai-chat','@ai-sdk/openai':'openai-responses','@ai-sdk/anthropic':'anthropic','@ai-sdk/google':'gemini'},api={'openai-completions':'openai-chat','openai-responses':'openai-responses','anthropic-messages':'anthropic','google-generative-ai':'gemini'};
 for(const[id,p]of Object.entries(providers??{})){
  const protocol=toolId==='opencode'?sdk[p.npm]:api[p.api],baseUrl=toolId==='opencode'?p.options?.baseURL:p.baseUrl;let key=toolId==='opencode'?p.options?.apiKey:(docs[1]?.[id]?.type==='api_key'?docs[1][id].key:p.apiKey);
  if(typeof key==='string'&&/^\{env:[A-Za-z_][A-Za-z0-9_]*\}$/.test(key))key=env[key.slice(5,-1)];
  let url;try{url=new URL(baseUrl);}catch{}
  const local=url&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(local&&key==null)key='';
  const models=(toolId==='opencode'?Object.entries(p.models??{}).map(([id,m])=>m?.id??id):(p.models??[]).map(m=>m.id)).filter(m=>typeof m==='string'&&m.trim());
  if(Object.keys(p.headers??p.options?.headers??{}).length){skipped.push({name:id,reason:'存在自定义请求头，需人工核实，未导入'});continue;}
  if(!protocol||!url||!(url.protocol==='https:'||(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||!models.length||models.length>100||(!local&&!key)||typeof key!=='string'||/^(\{|!|\$)/.test(key)){skipped.push({name:id,reason:'协议、模型、接口或密钥引用无法安全识别，未导入'});continue;}
  profiles.push({id:randomUUID(),name:String(p.name??id).slice(0,100),vendor:toolId==='opencode'?'OpenCode 导入':'Pi 导入',protocol,baseUrl,billing:url.hostname==='opencode.ai'&&url.pathname.includes('/go/')?'coding-plan':local?'local':'api',models:[...new Set(models)],modelDetails:{},key,notes:'从 '+toolId+' 现有配置导入，尚未应用到其他工具',enabled:true});
 }
 if(!profiles.length)throw Error('未发现可导入的完整连接。仅支持已声明模型、明确协议和明文或可解析环境变量密钥；OAuth、命令和文件引用暂不导入。');
 return{payload:{version:1,profiles,bindings:{},toolModels:{}},skipped};
}
