import {discoverConnectionModels} from './model-discovery.js';

// Fetch against the form draft without persisting it or exposing stored credentials.
export async function previewConnectionModels(store,input,fetcher){
  if(!input||typeof input.baseUrl!=='string'||input.baseUrl.length>2048||typeof input.key!=='string'||input.key.length>8192||!['anthropic','gemini','openai-chat','openai-responses'].includes(input.protocol))throw Error('连接字段无效');
  const old=input.id?(await store.read()).profiles.find(p=>p.id===input.id):null;
  if(input.id&&!old)throw Error('连接不存在');
  let key=input.key;
  if(!key&&old?.key){
    if(new URL(old.baseUrl).origin!==new URL(input.baseUrl).origin)throw Error('接口域名已改变，请重新输入 API Key 后获取模型');
    key=old.key;
  }
  if(!key&&input.billing!=='local')throw Error('请先填写 API Key');
  return discoverConnectionModels({...input,key,modelDetails:old?.modelDetails},fetcher);
}
