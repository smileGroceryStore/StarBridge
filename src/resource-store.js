import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';
export const resourceSupport={mcp:['opencode','claude-code'],skill:['opencode','pi','claude-code'],prompt:['opencode','pi','claude-code']};
const mask='••••••••';
export class ResourceStore{
 constructor(file,crypto){Object.assign(this,{file,crypto});this.queue=Promise.resolve();}
 async read(){try{const d=JSON.parse(this.crypto.decrypt(await fs.readFile(this.file)));if(d.version!==1||!Array.isArray(d.items))throw Error();return d;}catch(e){if(e.code==='ENOENT')return{version:1,items:[]};throw Error('共享资源库无法解密，请保留原文件');}}
 view(item){const copy=structuredClone(item);if(copy.kind==='mcp')for(const key of ['env','headers'])if(copy.config[key])copy.config[key]=Object.fromEntries(Object.keys(copy.config[key]).map(k=>[k,mask]));return copy;}
 async list(){await this.queue;return{items:(await this.read()).items.map(i=>this.view(i)),support:resourceSupport};}
 mutate(fn){const r=this.queue.then(async()=>{const d=await this.read();await fn(d);await fs.mkdir(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,this.crypto.encrypt(JSON.stringify(d)),{flag:'wx',mode:0o600});await fs.rename(tmp,this.file);}finally{await fs.rm(tmp,{force:true});}return{items:d.items.map(i=>this.view(i)),support:resourceSupport};});this.queue=r.catch(()=>{});return r;}
 save(input){return this.mutate(d=>{
  if(!input||!resourceSupport[input.kind]||typeof input.name!=='string'||!input.name.trim()||input.name.length>100||typeof input.enabled!=='boolean'||!Array.isArray(input.tools)||input.tools.some(t=>!resourceSupport[input.kind].includes(t)))throw Error('资源名称、类型或目标工具无效');
  const old=input.id?d.items.find(i=>i.id===input.id):null;if(input.id&&!old)throw Error('资源不存在');if(old&&old.kind!==input.kind)throw Error('不能更改已有资源的类型');
  if(!old&&d.items.length>=200)throw Error('最多保存 200 项共享资源');
  const item={id:old?.id??randomUUID(),kind:input.kind,name:input.name.trim(),enabled:input.enabled,tools:[...new Set(input.tools)],updatedAt:new Date().toISOString()};
  if(input.kind==='mcp'){
   const c=structuredClone(input.config);if(!c||!['local','remote'].includes(c.type))throw Error('MCP 类型必须为 local 或 remote');
   const fields=c.type==='local'?['type','command','env']:['type','url','headers'];if(Object.keys(c).some(k=>!fields.includes(k)))throw Error('MCP 包含未支持字段；local 仅接受 type / command / env，remote 仅接受 type / url / headers');
   if(c.type==='local'&&(!Array.isArray(c.command)||!c.command.length||c.command.length>40||c.command.some(v=>typeof v!=='string'||!v.trim()||v.length>2048)))throw Error('本地 MCP 需要 command 字符串数组');
   if(c.type==='remote'){let u;try{u=new URL(c.url);}catch{}if(!u||u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('远程 MCP 需要 HTTPS 或本机 HTTP 地址，不允许在地址中嵌入凭据');}
   for(const field of ['env','headers'])if(c[field]){if(typeof c[field]!=='object'||Array.isArray(c[field])||Object.keys(c[field]).length>50)throw Error('环境变量或请求头格式无效');for(const[k,v]of Object.entries(c[field])){if(!k||['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'||v.length>8192||/[\r\n]/.test(k+v))throw Error('环境变量或请求头无效');if(v===mask){if(!Object.hasOwn(old?.config?.[field]??{},k))throw Error('新凭据不能使用掩码');c[field][k]=old.config[field][k];}}}
   if((c.type==='local'&&c.headers)||(c.type==='remote'&&c.env))throw Error('local 使用 env；remote 使用 headers');
   item.config=c.type==='local'?{type:c.type,command:c.command,...(c.env?{env:c.env}:{})}:{type:c.type,url:c.url,...(c.headers?{headers:c.headers}:{})};
  }else{if(typeof input.content!=='string'||!input.content.trim()||input.content.length>100000||input.content.includes('<!-- STARBRIDGE:'))throw Error('请填写有效 Markdown 正文（最多 100000 字符）');item.content=input.content;item.description=typeof input.description==='string'?input.description.slice(0,500):item.name;if(!item.description.trim())item.description=item.name;}
  if(old)d.items[d.items.indexOf(old)]=item;else d.items.push(item);
 });}
 remove(id){return this.mutate(async d=>{if(!d.items.some(i=>i.id===id))throw Error('资源不存在');await fs.copyFile(this.file,this.file+'.before-delete-'+randomUUID()+'.bak');d.items=d.items.filter(i=>i.id!==id);});}
 async portable(){await this.queue;return this.read();}
 import(data){if(data?.version!==1||!Array.isArray(data.items)||data.items.length>200)throw Error('共享资源迁移包无效');const staged=new ResourceStore('',this.crypto),normalized={version:1,items:[]};staged.mutate=fn=>fn(normalized);for(const item of data.items){if(typeof item?.name!=='string'||!item.name.trim())throw Error('共享资源名称无效');staged.save({...item,id:undefined,name:(String(item.name??'')+' · 导入').slice(0,100),enabled:false,tools:[]});}return this.mutate(async d=>{if(d.items.length+normalized.items.length>200)throw Error('导入后超过 200 项');await fs.copyFile(this.file,this.file+'.before-import-'+randomUUID()+'.bak').catch(e=>{if(e.code!=='ENOENT')throw e;});d.items.push(...normalized.items);});}
}
