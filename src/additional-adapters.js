import yaml from 'js-yaml';
import {parseForESLint,getStaticTOMLValue} from 'toml-eslint-parser';
import {isDeepStrictEqual} from 'node:util';
const quote=JSON.stringify;
export function tomlDocument(text){try{const ast=parseForESLint(text,{tomlVersion:'1.0'}).ast;return{ast,data:getStaticTOMLValue(ast)};}catch{throw Error('Codex 配置不是有效 TOML，未修改原文件');}}
export function buildCodex(file,provider,group,model,owns){
 const text=file.exists?file.text:'',before=tomlDocument(text),nodes=before.ast.body[0].body,edits=[];
 for(const[key,value]of Object.entries({model,model_provider:provider})){
  const node=nodes.find(n=>n.type==='TOMLKeyValue'&&n.key.keys.length===1&&(n.key.keys[0].name??n.key.keys[0].value)===key);
  if(node)edits.push({start:node.value.range[0],end:node.value.range[1],text:quote(value)});else edits.push({start:0,end:0,text:key+' = '+quote(value)+'\n'});
 }
 const providers=before.data.model_providers??{};if(!providers||Array.isArray(providers)||typeof providers!=='object')throw Error('Codex model_providers 结构不受支持');
 // Dotted/inline provider objects cannot be safely rewritten using table ranges.
 for(const node of nodes){if(node.type==='TOMLKeyValue'&&(node.key.keys[0].name??node.key.keys[0].value)==='model_providers')throw Error('Codex 内联或点号 provider 结构暂不自动修改');if(node.type==='TOMLTable'&&node.resolvedKey[0]==='model_providers'&&owns(node.resolvedKey[1]))edits.push({start:node.range[0],end:node.range[1],text:''});}
 for(const e of edits.sort((a,b)=>b.start-a.start||b.end-a.end))file.after=(file.after??text).slice(0,e.start)+e.text+(file.after??text).slice(e.end);
 const value={name:'Starbridge · '+group.name,base_url:group.baseUrl,wire_api:'responses',requires_openai_auth:false,...(group.key?{experimental_bearer_token:group.key}:{})};
 file.after=(file.after??text)+'\n[model_providers.'+quote(provider)+']\n'+Object.entries(value).map(([k,v])=>k+' = '+quote(v)).join('\n')+'\n';
 const after=tomlDocument(file.after).data;if(isDeepStrictEqual(before.data,after)&&file.exists)file.after=file.text;
 file.preview=[{path:'model / model_provider',before:{model:before.data.model,provider:before.data.model_provider},after:{model,provider}},{path:'model_providers（仅星桥托管项）',before:Object.keys(providers).filter(owns),after:{...value,experimental_bearer_token:group.key?'••••••••':undefined}}];
}
export function buildHarness(files,profile,model){
 let patches,credentials;try{patches=yaml.load(files[0].text,{schema:yaml.JSON_SCHEMA});credentials=yaml.load(files[1].exists?files[1].text:'version: 1\nrefs: {}\n',{schema:yaml.JSON_SCHEMA});}catch{throw Error('Harness YAML 含特殊标签或无法解析，暂不自动修改');}
 if(!Array.isArray(patches)||credentials?.version!==1||!credentials.refs||typeof credentials.refs!=='object'||Array.isArray(credentials.refs))throw Error('Harness 配置结构与已核验版本不一致');
 const before=structuredClone(patches),defaultEntry=patches.find(e=>e.id==='agent-default-model'),llm=patches.find(e=>e.id==='llm-pi-ai');
 if(!defaultEntry||defaultEntry.name!=='@deepseek-ai/dsh-agent-default-model'||!llm||llm.name!=='@deepseek-ai/dsh-llm-pi-ai'||!llm.config?.providers||!llm.config.providers['opencode-go'])throw Error('Harness desktop profile 未发现原生 OpenCode Go 配置，请先在 Harness 添加此服务');
 const go=llm.config.providers['opencode-go'];if(Object.keys(go).some(k=>k!=='apiKeyEnv'))throw Error('Harness Go 含自定义路由或专属参数，请先在原工具核对');
 const previousModel=defaultEntry.config?.model;defaultEntry.config={...defaultEntry.config,provider:'opencode-go',model};
 const ref='STARBRIDGE_OPENCODE_GO_API_KEY',prior=structuredClone(credentials);go.apiKeyEnv=ref;credentials.refs[ref]=profile.key;
 files[0].after=isDeepStrictEqual(before,patches)?files[0].text:yaml.dump(patches,{noRefs:true,lineWidth:-1,schema:yaml.JSON_SCHEMA});files[1].after=isDeepStrictEqual(prior,credentials)&&files[1].exists?files[1].text:yaml.dump(credentials,{noRefs:true,lineWidth:-1,schema:yaml.JSON_SCHEMA});
 files[0].preview=[{path:'agent-default-model',before:previousModel,after:{provider:'opencode-go',model}},{path:'原生 Go 凭据引用',after:ref}];files[1].preview=[{path:'refs.'+ref,after:'••••••••'}];
}
