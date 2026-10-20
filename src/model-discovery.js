import {GO_MODELS_URL, parseGoModels} from './model-catalog.js';

const contextKeys=['contextWindow','context_window','context_length','context_tokens','max_context_tokens','max_context_window','inputTokenLimit','max_input_tokens','context'];
const outputKeys=['maxOutputTokens','max_output_tokens','max_completion_tokens','outputTokenLimit','output'];
function positive(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:undefined;}
export function modelMetadata(item){
  const containers=[item,item.limit,item.limits,item.capabilities,item.metadata].filter(v=>v&&typeof v==='object');
  const number=keys=>containers.flatMap(c=>keys.map(k=>positive(c[k]))).find(v=>v!==undefined);
  const bool=keys=>containers.flatMap(c=>keys.map(k=>c[k])).find(v=>typeof v==='boolean');
  const result={contextWindow:number(contextKeys),maxOutputTokens:number(outputKeys),toolCall:bool(['toolCall','tool_call','tool_use','supports_function_calling','supports_tools']),reasoning:bool(['reasoning','supports_reasoning'])};
  const modalities=item.inputModalities??item.modalities?.input??item.input_modalities??item.architecture?.input_modalities;
  if(Array.isArray(modalities))result.inputModalities=[...new Set(modalities.filter(m=>['text','image','audio','video','pdf'].includes(m)))];
  if(item.metadataSource==='models.dev（参考值，以当前接口为准）')result.metadataSource=item.metadataSource;
  return Object.fromEntries(Object.entries(result).filter(([,v])=>v!==undefined));
}
function endpoint(profile){
  const u=new URL(profile.baseUrl);
  if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('模型接口地址不安全');
  let path=u.pathname.replace(/\/+$/,'').replace(/\/(chat\/completions|responses|messages|models)$/,'');
  if(!path)path=profile.protocol==='gemini'?'/v1beta':'/v1';
  u.pathname=path+'/models';return u.href;
}
export function parseConnectionModels(json,profile){
  const rows=json?.data??json?.models??(Array.isArray(json)?json:null);
  if(!Array.isArray(rows)||rows.length>20000)throw Error('模型目录格式不正确或超过 20000 个模型');
  const seen=new Set(),entries=[];let skipped=0;
  for(const row of rows){const item=typeof row==='string'?{id:row}:row;const id=(item?.id??item?.name)?.replace(/^models\//,'');
    if(typeof id!=='string'||!id.trim()||id.length>200||['__proto__','constructor','prototype'].includes(id)||seen.has(id)){skipped++;continue;}
    seen.add(id);const detail=profile.modelDetails?.[id];entries.push({id,protocol:detail?.protocol??profile.protocol,baseUrl:detail?.baseUrl??profile.baseUrl,...modelMetadata(item)});
  }
  if(!entries.length)throw Error('接口没有返回可用模型');return {entries,skipped};
}
export async function discoverConnectionModels(profile,fetcher=fetch){
  const go=new URL(profile.baseUrl).origin==='https://opencode.ai'&&profile.billing==='coding-plan';
  let source=go?GO_MODELS_URL:endpoint(profile),headers={Accept:'application/json'};
  if(!go&&profile.key){if(profile.protocol==='anthropic'){headers['x-api-key']=profile.key;headers['anthropic-version']='2023-06-01';}else if(profile.protocol==='gemini')headers['x-goog-api-key']=profile.key;else headers.Authorization=`Bearer ${profile.key}`;}
  const entries=[];let skipped=0;const visited=new Set();
  for(let page=0;page<100;page++){
    if(visited.has(source))throw Error('模型目录分页重复');visited.add(source);
    let response;try{response=await fetcher(source,{headers,signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Error('无法获取模型目录，请检查地址、网络和凭据');}
    if(!response.ok)throw Error(`模型目录返回 HTTP ${response.status}，请检查接口地址及模型列表权限`);
    const body=await response.text();if(body.length>10*1024*1024)throw Error('模型目录响应过大');
    let json;try{json=JSON.parse(body);}catch{throw Error('模型目录未返回有效 JSON');}
    const parsed=go?parseGoModels(json):parseConnectionModels(json,profile);entries.push(...parsed.entries);skipped+=parsed.skipped;
    if(entries.length>20000)throw Error('模型目录超过 20000 个模型');
    const next=json.nextPageToken??(json.has_more?json.last_id:null);if(!next){if(!go)await enrichMetadata(entries,profile,fetcher);return {entries:[...new Map(entries.map(e=>[e.id,e])).values()],skipped,source:go?GO_MODELS_URL:endpoint(profile)};}
    const url=new URL(source);url.searchParams.set(json.nextPageToken?'pageToken':'after',next);source=url.href;
  }
  throw Error('模型目录分页过多，请缩小接口范围');
}

// A public catalog is a reference, not proof of gateway-specific limits.
async function enrichMetadata(entries,profile,fetcher){
  if(!entries.some(e=>e.contextWindow===undefined||e.maxOutputTokens===undefined))return;
  try{
    const response=await fetcher('https://models.dev/api.json',{signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)return;const body=await response.text();if(body.length>30*1024*1024)return;
    const providers=Object.values(JSON.parse(body)).filter(p=>p&&typeof p==='object');
    const matching=providers.filter(p=>{try{return new URL(p.api).hostname===new URL(profile.baseUrl).hostname;}catch{return false;}});
    for(const entry of entries){
      const candidates=(matching.length?matching:providers).flatMap(p=>Object.values(p.models??{}).filter(m=>m.id===entry.id));
      if(!candidates.length)continue;
      const details=candidates.map(modelMetadata),fields=['contextWindow','maxOutputTokens','toolCall','reasoning','inputModalities'];
      for(const field of fields)if(entry[field]===undefined&&details[0][field]!==undefined&&details.every(d=>JSON.stringify(d[field])===JSON.stringify(details[0][field]))){entry[field]=details[0][field];entry.metadataSource='models.dev（参考值，以当前接口为准）';}
    }
  }catch{/* An optional public catalog must not prevent importing the live list. */}
}
