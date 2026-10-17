import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const MODELS_DEV_URL='https://models.dev/api.json';
const fields=['input','output','cacheRead','cacheWrite'];
const validRate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1000000&&Number(v.toFixed(8))===v;
export function validatePrice(row){
 if(!row||typeof row!=='object'||typeof row.model!=='string'||!row.model.trim()||row.model.length>240||typeof row.provider!=='string'||!/^[a-z0-9._-]{0,80}$/.test(row.provider)||typeof row.name!=='string'||!row.name.trim()||row.name.length>240)throw Error('模型、服务商或名称格式无效');
 const item={id:row.provider+'/'+row.model.trim(),provider:row.provider,model:row.model.trim(),name:row.name.trim()};
 for(const key of fields){const value=row[key];if(value===null&&key.startsWith('cache'))item[key]=null;else if(validRate(value))item[key]=value;else throw Error('单价需为非负数，最多 8 位小数；缓存单价可留空表示未知');}
 item.source=row.source==='models.dev'?'models.dev':'manual';item.tiered=!!row.tiered;return item;
}
export function parseModelsDev(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('models.dev 目录格式无效');
 const items=new Map();let skipped=0;
 for(const[provider,p]of Object.entries(data)){
  if(!p?.models||typeof p.models!=='object')continue;
  for(const[id,m]of Object.entries(p.models)){
   try{if(!m?.cost||!validRate(m.cost.input)||!validRate(m.cost.output))throw Error();
    const row=validatePrice({provider,model:typeof m.id==='string'?m.id:id,name:m.name??id,input:m.cost.input,output:m.cost.output,cacheRead:m.cost.cache_read??null,cacheWrite:m.cost.cache_write??null,source:'models.dev',tiered:!!(m.cost.tiers?.length||m.cost.context_over_200k)});items.set(row.id,row);
   }catch{skipped++;}
  }
 }
 if(!items.size)throw Error('目录没有有效的模型定价，原定价库保留');
 return{items:[...items.values()].sort((a,b)=>a.id.localeCompare(b.id)),skipped};
}
export async function fetchModelsDev(fetcher=fetch){
 const response=await fetcher(MODELS_DEV_URL,{signal:AbortSignal.timeout(25000),redirect:'error'});
 if(!response.ok)throw Error(`models.dev 返回 ${response.status}，原定价库保留`);
 if(Number(response.headers?.get('content-length'))>20*1024*1024)throw Error('模型目录过大');
 let bytes=0;const chunks=[];
 for await(const chunk of response.body){bytes+=chunk.length;if(bytes>20*1024*1024)throw Error('模型目录过大');chunks.push(chunk);}
 return parseModelsDev(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
export class PricingStore{
 constructor(file,seed={items:[]}){this.file=file;this.seed=seed;this.queue=Promise.resolve();this.preview=null;}
 async read(){try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(data.version!==1||!Array.isArray(data.items)||data.items.length>20000)throw Error();const items=data.items.map(validatePrice);if(new Set(items.map(p=>p.id)).size!==items.length)throw Error();return{...data,items};}catch(e){if(e.code==='ENOENT')return{version:1,updatedAt:this.seed.updatedAt??null,items:this.seed.items.map(validatePrice)};throw Error('模型定价文件无法读取，请保留原文件');}}
 mutate(fn){const result=this.queue.then(async()=>{const data=await this.read(),result=await fn(data);await fs.mkdir(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+randomUUID()+'.tmp';try{data.updatedAt=new Date().toISOString();await fs.writeFile(tmp,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,this.file);}finally{await fs.rm(tmp,{force:true});}return result;});this.queue=result.catch(()=>{});return result;}
 save(input){const item=validatePrice({...input,source:'manual',tiered:false});return this.mutate(data=>{const i=data.items.findIndex(p=>p.id===item.id);if(i<0){if(data.items.length>=20000)throw Error('定价数量达到上限');data.items.push(item);}else data.items[i]=item;return item;});}
 remove(id){if(typeof id!=='string')throw Error('请选择模型');return this.mutate(data=>{const before=data.items.length;data.items=data.items.filter(p=>p.id!==id);if(before===data.items.length)throw Error('定价已不存在');return{removed:true};});}
 async prepare(fetcher){const catalog=await fetchModelsDev(fetcher),existing=new Set((await this.read()).items.map(p=>p.id));this.preview={id:randomUUID(),createdAt:Date.now(),items:catalog.items};return{id:this.preview.id,items:catalog.items.map(p=>({...p,exists:existing.has(p.id)})),skipped:catalog.skipped};}
 import(input){const preview=this.preview;if(!preview||input?.id!==preview.id||Date.now()-preview.createdAt>10*60*1000)throw Error('导入预览已失效，请重新拉取');if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>20000)throw Error('请勾选要新增的定价');const ids=new Set(input.ids),selected=preview.items.filter(p=>ids.has(p.id));if(selected.length!==ids.size)throw Error('所选模型不在本次目录中');return this.mutate(data=>{const existing=new Set(data.items.map(p=>p.id));let added=0;for(const p of selected)if(!existing.has(p.id)){data.items.push(p);existing.add(p.id);added++;}if(data.items.length>20000)throw Error('定价数量达到上限');return{added,skipped:selected.length-added};});}
}
export function matchPrice(rows,model,provider=''){
 if(typeof model!=='string'||!model)return null;
 const exact=rows.filter(p=>p.model===model);
 const preferred=exact.find(p=>p.provider===provider);if(preferred)return preferred;
 const generic=exact.find(p=>p.provider==='');if(generic)return generic;
 const qualified=rows.find(p=>p.provider+'/'+p.model===model);if(qualified&&(!provider||qualified.provider===provider))return qualified;
 if(provider)return null;
 // Unknown providers must never silently use the cheapest of different prices.
 if(exact.length&&exact.every(p=>fields.every(k=>p[k]===exact[0][k])&&p.tiered===exact[0].tiered))return exact[0];
 return null;
}
export function estimateRequest(usage,price){
 if(!price||usage.invalid)return null;
 let numerator=0n;
 for(const key of fields){const tokens=usage[key];if(!Number.isSafeInteger(tokens)||tokens<0)return null;if(tokens===0)continue;if(!validRate(price[key]))return null;numerator+=BigInt(tokens)*BigInt(Math.round(price[key]*1e8));}
 return Number(numerator)/1e14;
}
export function priceSessions(index,rows){
 const groups=new Map();let estimated=0,priced=0,missing=0,baseRateRequests=0;
 for(const session of index.sessions){let cost=0,unpriced=0,sessionPriced=0;
  for(const u of session.usageDetails??[]){const rate=matchPrice(rows,u.model,u.provider),amount=estimateRequest(u,rate);const key=JSON.stringify([u.model,u.provider]),group=groups.get(key)??{model:u.model||'未记录模型',provider:u.provider||'',input:0,output:0,cacheRead:0,cacheWrite:0,requests:0,priced:0,missing:0,estimatedCost:0};for(const f of fields)group[f]+=u[f]??0;group.requests++;
   if(amount===null){missing++;unpriced++;group.missing++;}else{estimated+=amount;cost+=amount;priced++;sessionPriced++;group.priced++;group.estimatedCost+=amount;if(rate.tiered)baseRateRequests++;}groups.set(key,group);
  }
  session.estimatedCost=sessionPriced?cost:null;session.unpricedRequests=unpriced;
 }
 return{...index,pricing:{estimatedCost:priced?estimated:null,pricedRequests:priced,missingRequests:missing,baseRateRequests,models:[...groups.values()].sort((a,b)=>b.estimatedCost-a.estimatedCost)}};
}
