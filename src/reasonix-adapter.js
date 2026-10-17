import {parseForESLint,getStaticTOMLValue} from 'toml-eslint-parser';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {reasonixGoBase} from './go-routing.js';
const quote=JSON.stringify,list=items=>'['+items.map(quote).join(', ')+']';
export function readReasonix(text){try{const ast=parseForESLint(text.replace(/^\uFEFF/,''),{tomlVersion:'1.0'}).ast;return{ast,data:getStaticTOMLValue(ast)};}catch{throw Error('Reasonix 配置不是有效 TOML，未修改原文件');}}
export function buildReasonix(files,groups,defaultProvider,defaultModel,owns){
 let text=files[0].exists?files[0].text:'';if(text.charCodeAt(0)===0xfeff)throw Error('Reasonix TOML 含 BOM，请先另存为 UTF-8 无 BOM');
 const{ast,data}=readReasonix(text),nodes=ast.body[0].body,edits=[],providers=data.providers??[];
 if(!Array.isArray(providers))throw Error('Reasonix providers 格式不受支持');
 const managed=providers.filter(p=>typeof p.name==='string'&&owns(p.name));
 const rootDefault=nodes.find(n=>n.type==='TOMLKeyValue'&&n.key.keys.length===1&&(n.key.keys[0].name??n.key.keys[0].value)==='default_model');
 const newDefault=defaultProvider+'/'+defaultModel;
 if(rootDefault)edits.push({start:rootDefault.value.range[0],end:rootDefault.value.range[1],text:quote(newDefault)});else edits.push({start:0,end:0,text:'default_model = '+quote(newDefault)+'\n'});
 const accessBefore=data.desktop?.provider_access;
 if(accessBefore!==undefined&&(!Array.isArray(accessBefore)||accessBefore.some(v=>typeof v!=='string')))throw Error('Reasonix 桌面服务列表格式不受支持');
 const access=[...new Set([...(accessBefore??providers.map(p=>p.name)).filter(p=>!owns(p)),...groups.keys()])];
 const desktop=nodes.find(n=>n.type==='TOMLTable'&&n.resolvedKey.length===1&&n.resolvedKey[0]==='desktop');
 const dotted=nodes.find(n=>n.type==='TOMLKeyValue'&&n.key.keys.map(k=>k.name??k.value).join('.')==='desktop.provider_access');
 const accessNode=desktop?.body.find(n=>n.type==='TOMLKeyValue'&&n.key.keys.length===1&&(n.key.keys[0].name??n.key.keys[0].value)==='provider_access')??dotted;
 if(accessNode)edits.push({start:accessNode.value.range[0],end:accessNode.value.range[1],text:list(access)});
 else if(desktop){const end=text.indexOf('\n',desktop.range[0]);if(end<0)edits.push({start:text.length,end:text.length,text:'\nprovider_access = '+list(access)+'\n'});else edits.push({start:end+1,end:end+1,text:'provider_access = '+list(access)+'\n'});}
 else if(data.desktop!==undefined)throw Error('Reasonix 桌面配置使用特殊表结构，暂不自动修改');
 const indices=new Set(managed.map(p=>providers.indexOf(p)));
 for(const n of nodes)if(n.type==='TOMLTable'&&n.resolvedKey[0]==='providers'&&indices.has(n.resolvedKey[1]))edits.push({start:n.range[0],end:n.range[1],text:''});
 const credentialNames=new Set();let appended='\n';const generated=[];
 for(const[name,g]of groups){const kind={'openai-chat':'openai','openai-responses':'responses',anthropic:'anthropic'}[g.protocol];if(!kind)throw Error('Reasonix 暂不支持此模型的协议');if(/[\r\n']/.test(g.key))throw Error('密钥含此适配器暂不支持的字符，未写入');const env='STARBRIDGE_'+createHash('sha256').update(name).digest('hex').slice(0,16).toUpperCase()+'_API_KEY';credentialNames.add(env);const base=reasonixGoBase(g.baseUrl,g.protocol).replace(/\/$/,'');const request=base+(kind==='openai'?'/chat/completions':kind==='responses'?'/responses':base.endsWith('/v1')?'/messages':'/v1/messages');const p={name,display_name:'星桥 · '+(g.name??g.profileId)+' · '+kind,kind,base_url:base,request_url:request,models:g.ids,default:g.profileId===groups.get(defaultProvider).profileId&&g.ids.includes(defaultModel)?defaultModel:g.ids[0],api_key_env:env};generated.push(p);appended+='[[providers]]\n'+Object.entries(p).map(([k,v])=>k+' = '+(Array.isArray(v)?list(v):quote(v))).join('\n')+'\n\n';g.reasonixEnv=env;}
 if(!desktop&&!dotted)appended+='[desktop]\nprovider_access = '+list(access)+'\n';
 for(const e of edits.sort((a,b)=>b.start-a.start||b.end-a.end))text=text.slice(0,e.start)+e.text+text.slice(e.end);
 text+=appended;const after=readReasonix(text).data;
 if(after.default_model!==newDefault||!after.providers?.some(p=>p.name===defaultProvider))throw Error('Reasonix 配置生成校验失败');
 const obsolete=new Set(managed.map(p=>p.api_key_env).filter(k=>/^STARBRIDGE_[A-F0-9]{16}_API_KEY$/.test(k)&&!providers.some(p=>!owns(p.name)&&p.api_key_env===k)));
 const envBefore=files[1].exists?files[1].text:'';const lines=envBefore.split(/\r?\n/);let multilineQuote=null;
 for(const line of lines){if(multilineQuote)throw Error('Reasonix 凭据包含多行值，暂不自动修改');const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['"])/);if(match){const rest=line.slice(line.indexOf(match[2],line.indexOf('='))+1);if(!rest.endsWith(match[2])&&!new RegExp('['+match[2]+']\\s*(?:#.*)?$').test(rest))multilineQuote=match[2];}}
 const retained=lines.filter(line=>{const tombstone=line.match(/^\s*#\s*reasonix-cleared\s+(\w+)\s*$/);if(tombstone&&credentialNames.has(tombstone[1]))return false;const m=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);return !m||(!obsolete.has(m[1])&&!credentialNames.has(m[1]));}).join('\n');
 const envAfter=retained+(retained.endsWith('\n')||!retained?'':'\n')+[...groups.values()].map(g=>g.reasonixEnv+"='"+(g.key||'local')+"'").join('\n')+'\n';
 // Preserve the original formatting when the generated TOML has no semantic changes.
 files[0].after=files[0].exists&&isDeepStrictEqual(data,after)?files[0].text:text;files[0].preview=[{path:'default_model',before:data.default_model??null,after:newDefault},{path:'desktop.provider_access',before:accessBefore??null,after:access},{path:'providers（星桥管理项）',before:managed.map(p=>p.name),after:generated}];
 files[1].after=envAfter;files[1].preview=[{path:'独立凭据变量',before:files[1].exists?'保留其他已有变量':'新建文件',after:[...credentialNames].map(name=>({name,value:'••••••••'}))}];
 return files;
}
