import path from 'node:path';
import {createHash} from 'node:crypto';
const n=v=>Number.isFinite(v)&&v>=0?v:0;
export function analyzeGeminiSession(text,file,mtime){
 let entries=[],partial=false;
 if(file.endsWith('.json')){const d=JSON.parse(text);if(!Array.isArray(d?.messages))throw Error('非 Gemini 会话格式');entries=d.messages;}
 else for(const line of text.split(/\r?\n/)){if(!line.trim())continue;try{entries.push(JSON.parse(line));}catch{partial=true;}}
 const messages=new Map();
 for(const e of entries){if(!e||typeof e!=='object')continue;if(e.id&&e.type==='gemini')messages.set(e.id,{model:e.model,tokens:e.tokens});
  // Token patches are supported without retaining conversation text or tool output.
  if(e.$patch){for(const p of [e.$patch,...(Array.isArray(e.$patch.updates)?e.$patch.updates:[])])if(p?.id&&p.tokens&&messages.has(p.id))messages.set(p.id,{...messages.get(p.id),tokens:p.tokens});}
 }
 let input=0,output=0,cache=0;const models=new Set();
 for(const m of messages.values()){if(typeof m.model==='string')models.add(m.model);input+=n(m.tokens?.input);output+=n(m.tokens?.output)+n(m.tokens?.thoughts);cache+=n(m.tokens?.cached);}
 return{id:createHash('sha256').update(file).digest('hex').slice(0,24),tool:'gemini-cli',title:path.basename(file),path:file,updatedAt:new Date(mtime).toISOString(),models:[...models],input,output,cache,cost:null,records:entries.length,partial};
}
