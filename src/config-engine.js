import {buildCodex,buildHarness} from './additional-adapters.js';
import {apiTools,assessCompatibility,isGo} from './compatibility.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parse,modify,applyEdits} from 'jsonc-parser';
import {toolConnections} from './tool-config.js';
import {buildReasonix} from './reasonix-adapter.js';
import {modelFor,compatibleModels} from './model-catalog.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>JSON.stringify(value,null,2);
// Ownership and expected hashes must describe the files restored from the backup.
const restoredRecord=(record,backup)=>({...record,phase:'restored',managedProviders:backup.previousRecord?.managedProviders??[],files:backup.files.map(({file,beforeHash})=>({file,afterHash:beforeHash}))});
const api={'openai-chat':'openai-completions','openai-responses':'openai-responses',anthropic:'anthropic-messages',gemini:'google-generative-ai'};
const sdk={'openai-chat':'@ai-sdk/openai-compatible','openai-responses':'@ai-sdk/openai',anthropic:'@ai-sdk/anthropic',gemini:'@ai-sdk/google'};
const redact=(value,key='')=>/key|token|secret|password|authorization|headers|env/i.test(key)?'••••••••':Array.isArray(value)?value.map(v=>redact(v)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v,k)])):value;
function document(text){const errors=[];const data=parse(text,errors,{allowTrailingComma:true,disallowComments:false});if(errors.length||!data||Array.isArray(data)||typeof data!=='object')throw Error('配置不是有效 JSON/JSONC，未修改原文件');return data;}
function patched(text,changes){for(const change of changes)text=applyEdits(text,modify(text,change.path,change.value,{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));document(text);return text;}
export class ConfigEngine {
 constructor({home,stateDir,store,crypto,env={},getLocations=async()=>({}),supportedTools=apiTools}){Object.assign(this,{home:path.resolve(home),stateDir,store,crypto,env,getLocations,supportedTools});this.plans=new Map();this.queue=Promise.resolve();}
 serial(fn){const r=this.queue.then(fn);this.queue=r.catch(()=>{});return r;}
 async safePath(file){const absolute=path.resolve(file),roots=[this.home,...Object.values(await this.getLocations()).filter(Boolean).map(p=>path.resolve(p))];if(!roots.some(root=>{const relative=path.relative(root,absolute);return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}))throw Error('配置路径不在已授权目录');let current=absolute;while(true){try{if((await fs.lstat(current)).isSymbolicLink())throw Error('配置路径包含符号链接，暂不自动写入');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=path.dirname(current);if(parent===current)break;current=parent;}return absolute;}

 async snapshot(file,{binary=false}={}){await this.safePath(file);try{const s=await fs.stat(file);if(!s.isFile()||s.size>2*1024*1024)throw Error('配置文件过大或不是普通文件');const bytes=await fs.readFile(file);let text;if(binary)return{file,exists:true,text:bytes.toString('base64'),encoding:'base64',hash:hash(bytes)};try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error('配置文件不是有效 UTF-8，未修改原文件；请先检查编码');}return {file,exists:true,text,hash:hash(bytes)};}catch(e){if(e.code!=='ENOENT')throw e;return{file,exists:false,text:binary?'':'{}\n',hash:null,...(binary?{encoding:'base64'}:{})};}}
 async write(file,text,encoding='utf8'){await this.safePath(file);await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.starbridge-${randomUUID()}.tmp`;try{await fs.writeFile(tmp,text,{encoding,flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}}
 async stagedFiles(backup){const result=[];for(const f of backup.files){let names;try{names=await fs.readdir(path.dirname(f.file));}catch(e){if(e.code==='ENOENT')continue;throw e;}for(const name of names){const prefix=path.basename(f.file)+'.starbridge-';if(!name.startsWith(prefix)||!/^[-a-f0-9]{36}\.tmp$/.test(name.slice(prefix.length)))continue;const file=path.join(path.dirname(f.file),name),snap=await this.snapshot(file);result.push({path:file,state:[f.beforeHash,f.afterHash].includes(snap.hash)?'temporary':'conflict',temporary:true,hash:snap.hash});}}return result;}
 async pending(){let names;try{names=await fs.readdir(this.stateDir);}catch(e){if(e.code==='ENOENT')return[];throw e;}const result=[];for(const name of names.filter(n=>this.supportedTools.some(t=>n.startsWith(t+'-'))&&/-[a-f0-9-]{36}\.enc\.enc$/.test(n))){const id=name.slice(0,-4);try{const b=await this.record(id);if(!['prepared','restoring','recovery-required'].includes(b.phase)){if(b.phase!=='applied')continue;const active=await this.record(b.toolId);if(active?.backupName===id||active?.appliedAt>=b.createdAt)continue;}const files=[];for(const f of b.files){const now=await this.snapshot(f.file);files.push({path:f.file,state:now.hash===f.beforeHash?'original':now.hash===f.afterHash?'written':'conflict'});}files.push(...(await this.stagedFiles(b)).map(({hash,...f})=>f));result.push({id,toolId:b.toolId,createdAt:b.createdAt,phase:b.phase,files,canRecover:files.every(f=>f.state!=='conflict')});}catch{result.push({id,toolId:this.supportedTools.find(t=>name.startsWith(t+'-')),phase:'unreadable',files:[],canRecover:false,message:'加密记录或目标文件无法读取，请保留备份并检查权限'});}}return result;}
 async ensureSettled(toolId){if((await this.pending()).some(p=>p.toolId===toolId)||await this.hasPeerPending?.(toolId))throw Error('此工具存在未完成操作，请先在备份与恢复中检查处理');}
 recover(id){return this.serial(async()=>{const item=(await this.pending()).find(p=>p.id===id);if(!item||!item.canRecover)throw Error('恢复条件不满足，请检查外部改动或文件权限');const b=await this.record(id);for(const f of b.files){const current=await this.snapshot(f.file);if(current.hash===f.beforeHash)continue;if(current.hash!==f.afterHash)throw Error('检测到外部改动，已停止恢复；可重新检查');if(f.exists)await this.write(f.file,f.text,f.encoding);else await fs.rm(f.file,{force:true});if((await this.snapshot(f.file)).hash!==f.beforeHash)throw Error('恢复校验失败，请重新检查');}for(const f of await this.stagedFiles(b)){if(f.state!=='temporary'||(await this.snapshot(f.path)).hash!==f.hash)throw Error('临时文件发生变化，请重新检查');await fs.unlink(f.path);}const latest=await this.record(b.toolId);if(latest?.backupName===id){if(b.phase!=='restoring'&&b.recoveryMode!=='restore'&&Object.hasOwn(b,'previousRecord'))await this.saveRecord(b.toolId,b.previousRecord);else await this.saveRecord(b.toolId,restoredRecord(latest,b));}b.phase='recovered';await this.saveRecord(id,b);return{message:'已恢复到该次应用之前；请检查 Agent 状态后重新应用'};});}
 async context(toolId){const data=await this.store.read(),config=data.toolModels?.[toolId];if(!config)throw Error('请先保存此工具的模型预设');const connections=toolConnections(config).map(c=>({config:c,profile:data.profiles.find(p=>p.id===c.profileId)}));for(const{config:c,profile:p}of connections){if(!p?.enabled||p.archived)throw Error('预设中的连接已移除或停用');if(c.models.some(m=>!compatibleModels(p,toolId).includes(m)))throw Error('模型预设不完整或协议不匹配');}const profile=connections.find(c=>c.profile.id===config.profileId)?.profile;if(!profile||!connections.find(c=>c.profile===profile).config.models.includes(config.defaultModel))throw Error('默认模型不在预设中');return{profile,config,connections,fingerprint:hash(JSON.stringify({adapterRevision:toolId==='reasonix'?2:1,connections:connections.map(({profile:p,config:c})=>({id:p.id,name:p.name,key:p.key,models:c.models.map(id=>[id,modelFor(p,id)])})),defaultProfile:config.profileId,defaultModel:config.defaultModel,locations:await this.getLocations()}))};}

 async targets(toolId){
  const locations=await this.getLocations();
  if(toolId==='opencode'){if(!locations.opencode&&(this.env.OPENCODE_CONFIG||this.env.OPENCODE_CONFIG_DIR||this.env.OPENCODE_CONFIG_CONTENT||this.env.XDG_CONFIG_HOME))throw Error('检测到自定义 OpenCode 配置路径，暂不自动写入');const base=locations.opencode||path.join(this.home,'.config/opencode');const json=await this.snapshot(path.join(base,'opencode.json')),jsonc=await this.snapshot(path.join(base,'opencode.jsonc'));if(json.exists&&jsonc.exists)throw Error('同时发现 JSON 和 JSONC 配置，请先明确使用的配置文件');return[jsonc.exists?jsonc:json];}
  if(toolId==='pi'){if(!locations.pi&&this.env.PI_CODING_AGENT_DIR)throw Error('检测到自定义 Pi 目录，暂不自动写入');return Promise.all(['models.json','auth.json','settings.json'].map(n=>this.snapshot(path.join(locations.pi||path.join(this.home,'.pi/agent'),n))));}
  if(toolId==='reasonix'){const base=locations.reasonix||this.env.REASONIX_HOME||(process.platform==='win32'?path.join(this.env.APPDATA||path.join(this.home,'AppData','Roaming'),'reasonix'):path.join(this.home,'.reasonix'));return Promise.all(['config.toml','.env'].map(n=>this.snapshot(path.join(base,n))));}
  if(toolId==='claude-code'){if(!locations[toolId]&&this.env.CLAUDE_CONFIG_DIR)throw Error('检测到自定义 Claude 目录，请先在设置选择目录');return Promise.all([this.snapshot(path.join(locations[toolId]||path.join(this.home,'.claude'),'settings.json'))]);}
  if(toolId==='codex')return Promise.all([this.snapshot(path.join(locations.codex||this.env.CODEX_HOME||path.join(this.home,'.codex'),'config.toml'))]);
  if(toolId==='deepseek-harness'){if(this.env.DSH_PROFILE&&this.env.DSH_PROFILE!=='desktop')throw Error('Harness 非 desktop profile 暂不支持自动写入');const base=locations[toolId]||this.env.DSH_HOME||path.join(this.home,'.dsh'),files=await Promise.all(['profiles/desktop/cordis.patch.yml','.credentials.yaml'].map(n=>this.snapshot(path.join(base,n))));if(!files[0].exists)throw Error('未发现 Harness desktop profile，请先在 Harness 配置原生 OpenCode Go');return files;}
  throw Error(toolId==='zcode'?'ZCode 当前版本配置结构仍在核验，暂不开放写入':'此工具尚未开放写入适配器');
 }
 async preview(toolId){
  await this.ensureSettled(toolId);
  const ctx=await this.context(toolId),{profile:p,config:c}=ctx,files=await this.targets(toolId);
  const compatibility=assessCompatibility(toolId,p,c,await this.getVersion?.(toolId));if(!compatibility.compatible)throw Error(compatibility.issues.filter(i=>i.level==='error').map(i=>i.message).join('；'));
  const prefixes=ctx.connections.map(({profile})=>`starbridge-${profile.id.replace(/[^a-zA-Z0-9]/g,'').slice(0,16)}`),groups=new Map();
  for(const{profile,config}of ctx.connections)for(const id of config.models){const d=modelFor(profile,id),prefix=`starbridge-${profile.id.replace(/[^a-zA-Z0-9]/g,'').slice(0,16)}`,group=`${prefix}-${hash(JSON.stringify(d)).slice(0,8)}`;if(!groups.has(group))groups.set(group,{...d,profileId:profile.id,key:profile.key,name:profile.name,ids:[]});groups.get(group).ids.push(id);}
  const previous=await this.record(toolId),managed=previous?.managedProviders??[];
  const owns=id=>prefixes.some(prefix=>id.startsWith(prefix+'-'))||managed.includes(id);
  const defaultProvider=[...groups].find(([,g])=>g.profileId===p.id&&g.ids.includes(c.defaultModel))[0];
  if(toolId==='codex'){if(groups.size!==1)throw Error('Codex 当前只写入同一接口的默认连接');buildCodex(files[0],defaultProvider,groups.get(defaultProvider),c.defaultModel,owns);}
  if(toolId==='deepseek-harness')buildHarness(files,p,c.defaultModel);
  if(toolId==='reasonix'){buildReasonix(files,groups,defaultProvider,c.defaultModel,owns);}
  const changes=files.map(()=>[]);
  // Only prune entries in this connection's reserved namespace; retain other providers.
  if(!['reasonix','codex','deepseek-harness'].includes(toolId)){
  const existing=document(files[0].text)[toolId==='opencode'?'provider':'providers']??{};
  for(const id of Object.keys(existing))if(owns(id)&&!groups.has(id)){changes[0].push({path:[toolId==='opencode'?'provider':'providers',id],value:undefined});if(toolId==='pi')changes[1].push({path:[id],value:undefined});}
  if(toolId==='opencode'){
   for(const[id,g]of groups)changes[0].push({path:['provider',id],value:{name:`Starbridge · ${g.name}`,npm:sdk[g.protocol],options:{baseURL:g.baseUrl,apiKey:g.key},models:Object.fromEntries(g.ids.map(m=>[m,{name:m}]))}});
   changes[0].push({path:['model'],value:`${defaultProvider}/${c.defaultModel}`});
  }else if(toolId==='claude-code'){
   const d=modelFor(p,c.defaultModel);const native=new URL(d.baseUrl).hostname==='api.anthropic.com',auth=native?'ANTHROPIC_API_KEY':'ANTHROPIC_AUTH_TOKEN';changes[0].push({path:['model'],value:c.defaultModel},{path:['env','ANTHROPIC_BASE_URL'],value:d.baseUrl},{path:['env',auth],value:p.key},{path:['env',native?'ANTHROPIC_AUTH_TOKEN':'ANTHROPIC_API_KEY'],value:undefined});
  }else{
   if([...groups.values()].some(g=>/^[!$]/.test(g.key)))throw Error('此密钥格式可能被 Pi 解析为命令或变量，暂不写入');
   for(const[id,g]of groups){changes[0].push({path:['providers',id],value:{baseUrl:g.baseUrl,api:api[g.protocol],models:g.ids.map(m=>({id:m}))}});changes[1].push({path:[id],value:{type:'api_key',key:g.key||'local'}});}
   changes[2].push({path:['defaultProvider'],value:defaultProvider},{path:['defaultModel'],value:c.defaultModel});
   const settings=document(files[2].text);if(Array.isArray(settings.enabledModels))changes[2].push({path:['enabledModels'],value:[...new Set([...settings.enabledModels.filter(m=>typeof m!=='string'||!owns(m.split('/')[0])),...[...groups].flatMap(([id,g])=>g.ids.map(m=>`${id}/${m}`))])]});
  }
  }
  for(let i=0;i<files.length;i++){if(['reasonix','codex','deepseek-harness'].includes(toolId)){files[i].afterHash=hash(files[i].after);continue;}const old=document(files[i].text);files[i].changes=changes[i];files[i].after=patched(files[i].text,changes[i]);files[i].afterHash=hash(files[i].after);files[i].preview=changes[i].map(x=>{let before=old;for(const key of x.path)before=before?.[key];return{path:x.path.join('.'),before:redact(before,x.path.at(-1))??null,after:redact(x.value,x.path.at(-1))};});}
  const id=randomUUID();this.plans.set(id,{id,toolId,...ctx,managedProviders:[...groups.keys()],files,created:Date.now()});if(this.plans.size>30)this.plans.delete(this.plans.keys().next().value);
  return{id,toolId,compatibility,defaultModel:c.defaultModel,profileName:p.name,files:files.map(f=>({path:f.file,newFile:!f.exists,changes:f.preview})),notice:(toolId==='deepseek-harness'?'Harness YAML 可能重新排版；保留其他字段。':'')+compatibility.issues.map(i=>i.message).join(' ')+' 目标工具需将密钥保存在本机配置文件中。星桥备份使用系统加密；应用后请新开会话，项目级设置可能覆盖全局默认值。'};
 }
 async record(toolId){if(!/^[a-zA-Z0-9-]+(?:\.enc)?$/.test(toolId))throw Error('记录名称无效');try{return JSON.parse(this.crypto.decrypt(await fs.readFile(path.join(this.stateDir,`${toolId}.enc`))));}catch(e){if(e.code==='ENOENT')return null;throw Error('应用记录无法读取，未改动工具配置');}}
 async saveRecord(toolId,data){await fs.mkdir(this.stateDir,{recursive:true});const file=path.join(this.stateDir,`${toolId}.enc`),temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,this.crypto.encrypt(JSON.stringify(data)),{mode:0o600,flag:'wx'});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}}
 apply(id){return this.serial(async()=>{
  const plan=this.plans.get(id);if(!plan||Date.now()-plan.created>10*60*1000)throw Error('预览已过期，请重新预览');this.plans.delete(id);await this.ensureSettled(plan.toolId);
  if((await this.context(plan.toolId)).fingerprint!==plan.fingerprint)throw Error('预设已变化，请重新预览');
  for(const f of plan.files)if((await this.snapshot(f.file)).hash!==f.hash)throw Error('配置被外部修改，请重新预览');
  const previous=await this.record(plan.toolId);
  if(previous?.phase==='applied'&&plan.files.every(f=>f.hash===f.afterHash)&&previous.files.length===plan.files.length&&plan.files.every(f=>previous.files.some(old=>old.file===f.file&&old.afterHash===f.hash))){
   if(previous.fingerprint!==plan.fingerprint)await this.saveRecord(plan.toolId,{...previous,fingerprint:plan.fingerprint,defaultModel:plan.config.defaultModel,profileName:plan.profile.name,managedProviders:plan.managedProviders});
   return{...await this.status(plan.toolId),unchanged:true,message:'配置未变化，无需重复写入；已保留原有恢复备份'};
  }
  const backup={id:randomUUID(),toolId:plan.toolId,createdAt:new Date().toISOString(),fingerprint:plan.fingerprint,defaultModel:plan.config.defaultModel,profileName:plan.profile.name,files:plan.files.map(({file,exists,text,encoding,hash:beforeHash,afterHash})=>({file,exists,text,...(encoding?{encoding}:{}),beforeHash,afterHash})),phase:'prepared',previousRecord:await this.record(plan.toolId)};
  const backupName=`${plan.toolId}-${backup.id}.enc`;await this.saveRecord(backupName,backup);const written=[];
  try{for(const f of plan.files){if(f.hash===f.afterHash)continue;if((await this.snapshot(f.file)).hash!==f.hash)throw Error('写入期间配置发生变化');if(f.after===null)await fs.rm(f.file,{force:true});else await this.write(f.file,f.after,f.encoding);written.push(f);if((await this.snapshot(f.file)).hash!==f.afterHash)throw Error('写入校验失败');}
   await this.saveRecord(plan.toolId,{backupName,fingerprint:plan.fingerprint,files:backup.files.map(({file,afterHash})=>({file,afterHash})),defaultModel:backup.defaultModel,profileName:backup.profileName,managedProviders:plan.managedProviders,appliedAt:backup.createdAt,phase:'applied'});backup.phase='applied';await this.saveRecord(backupName,backup);
  }catch(error){const failures=[];for(const f of written.reverse()){try{if((await this.snapshot(f.file)).hash!==f.afterHash)throw Error();if(f.exists)await this.write(f.file,f.text,f.encoding);else await fs.rm(f.file,{force:true});}catch{failures.push(f.file);}}if(!failures.length){try{await this.saveRecord(plan.toolId,backup.previousRecord);}catch{failures.push('application-record');}}backup.phase=failures.length?'recovery-required':'rolled-back';await this.saveRecord(backupName,backup);throw Error(failures.length?'应用失败且存在外部修改，已保留加密备份，需手动处理':'应用失败，已回滚本次写入');}
  return this.status(plan.toolId);
 });}
 async status(toolId){
  if(!this.supportedTools.includes(toolId))return{toolId,status:'unsupported',message:'适配器待核验'};
  if((await this.pending()).some(p=>p.toolId===toolId)||await this.hasPeerPending?.(toolId))return{toolId,status:'recovery-required',message:'发现未完成操作，请打开备份与恢复检查',canRestore:false};
  const record=await this.record(toolId);if(!record)return{toolId,status:'not-applied',message:'尚未应用'};if(record.phase==='restored')return{toolId,status:'restored',message:'已恢复上次应用前的文件'};
  const changed=[];for(const f of record.files){const snap=await this.snapshot(f.file);if(snap.hash!==f.afterHash)changed.push(snap);}
  if(changed.length){const peer=await this.peerRecord?.(toolId);if(peer?.phase==='applied'&&changed.every(f=>peer.files.some(p=>p.file===f.file&&p.afterHash===f.hash))){
    try{const preview=await this.preview(toolId),plan=this.plans.get(preview.id);this.plans.delete(preview.id);const same=plan.files.every(f=>f.hash===f.afterHash);if(!same&&plan.fingerprint===record.fingerprint)return{toolId,status:'external-change',message:'共享文件中本模块的托管内容被修改，请检查差异',canRestore:false};return{toolId,status:same?'applied':'preset-changed',message:same?'文件已同步并核对托管内容；共享文件随后由星桥其他模块更新，新会话验证实际调用':'预设待同步；共享文件已由星桥其他模块更新',profileName:record.profileName,defaultModel:record.defaultModel,canRestore:false,sharedUpdate:true};}catch{}
   }return{toolId,status:'external-change',message:'配置文件已在外部变化，需检查',canRestore:false};}
  let desired;try{desired=await this.context(toolId);}catch{return{toolId,status:'preset-changed',message:'文件已写入，但预设已移除或连接已停用',canRestore:true};}
  return{toolId,status:desired.fingerprint===record.fingerprint?'applied':'preset-changed',message:desired.fingerprint===record.fingerprint?'文件已写入并校验；新会话生效，运行时未验证':'预设已改变，文件仍是上次应用版本',defaultModel:record.defaultModel,profileName:record.profileName,appliedAt:record.appliedAt,canRestore:true};
 }

 restore(toolId){return this.serial(async()=>{if(!this.supportedTools.includes(toolId))throw Error('工具不支持恢复');const record=await this.record(toolId);if(!record||record.phase!=='applied')throw Error('没有可恢复的应用记录');const backup=await this.record(record.backupName);if(!backup||backup.phase!=='applied')throw Error('备份不可用');await this.ensureSettled(toolId);const originals=new Map();for(const f of backup.files){const snap=await this.snapshot(f.file);if(snap.hash!==f.afterHash)throw Error('配置已在外部改变，拒绝覆盖；加密备份仍保留');originals.set(f.file,snap);}backup.phase='restoring';backup.recoveryMode='restore';await this.saveRecord(record.backupName,backup);const restored=[];try{for(const f of backup.files){if((await this.snapshot(f.file)).hash!==f.afterHash)throw Error();if(f.exists)await this.write(f.file,f.text,f.encoding);else await fs.rm(f.file,{force:true});restored.push(f);if((await this.snapshot(f.file)).hash!==f.beforeHash)throw Error();}}catch{const failed=[];for(const f of restored.reverse()){try{if((await this.snapshot(f.file)).hash!==f.beforeHash)throw Error();const original=originals.get(f.file);if(original.exists)await this.write(f.file,original.text,original.encoding);else await fs.rm(f.file,{force:true});}catch{failed.push(f.file);}}backup.phase=failed.length?'recovery-required':'applied';await this.saveRecord(record.backupName,backup);throw Error(failed.length?'恢复中遇到外部修改，需手动处理；备份仍保留':'恢复失败，已撤销本次恢复；备份仍保留');}await this.saveRecord(toolId,restoredRecord(record,backup));backup.phase='restored';await this.saveRecord(record.backupName,backup);return this.status(toolId);});}
}
