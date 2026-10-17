import yaml from 'js-yaml';
import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {parse,modify,applyEdits} from 'jsonc-parser';
import {resourceDiff} from './resource-diff.js';
import {isDeepStrictEqual} from 'node:util';
import {ConfigEngine} from './config-engine.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
function json(text){const errors=[],d=parse(text,errors,{allowTrailingComma:true});if(errors.length||!d||typeof d!=='object'||Array.isArray(d))throw Error('目标 JSON/JSONC 无法解析，未修改文件');return d;}
function edit(text,changes){for(const c of changes)text=applyEdits(text,modify(text,c.path,c.value,{formattingOptions:{insertSpaces:true,tabSize:2}}));json(text);return text;}
const begin='<!-- STARBRIDGE:BEGIN SHARED-PROMPTS -->',end='<!-- STARBRIDGE:END SHARED-PROMPTS -->';
function promptBlock(text,content){const a=text.indexOf(begin),b=text.indexOf(end);if((a<0)!==(b<0)||b<a||text.indexOf(begin,a+begin.length)>=0||text.indexOf(end,b+end.length)>=0)throw Error('提示词托管区标记异常，未修改文件');const block=content?begin+'\n'+content+'\n'+end:'';return a<0?(text+(text&&!text.endsWith('\n')?'\n':'')+(block?block+'\n':'')):text.slice(0,a)+block+text.slice(b+end.length);}
export class ResourceEngine extends ConfigEngine{
 constructor({apiEngine,store}){super({home:apiEngine.home,stateDir:apiEngine.stateDir,store,crypto:apiEngine.crypto,env:apiEngine.env,getLocations:apiEngine.getLocations,supportedTools:['asset-opencode','asset-pi','asset-claude-code','asset-gemini-cli']});this.apiEngine=apiEngine;this.serial=fn=>apiEngine.serial(fn);this.peerRecord=id=>apiEngine.record(id.slice(6));apiEngine.peerRecord=id=>this.record('asset-'+id);this.hasPeerPending=async id=>(await apiEngine.pending()).some(p=>p.toolId===id.slice(6));apiEngine.hasPeerPending=async id=>(await this.pending()).some(p=>p.toolId==='asset-'+id);}
 async snapshot(file){return super.snapshot(file,{binary:/[/\\]skills[/\\]starbridge-[a-f0-9-]{36}[/\\]/.test(file)&&!/[/\\]skills[/\\]starbridge-[a-f0-9-]{36}[/\\]SKILL\.md$/.test(file)});}
 async context(toolId){if(!this.supportedTools.includes(toolId))throw Error('此工具尚无共享资源适配器');const tool=toolId.slice(6),items=(await this.store.read()).items.filter(i=>i.tools.includes(tool));return{items,tool,profile:{name:'共享 MCP / Skills / 提示词'},config:{defaultModel:'共享资源'},fingerprint:hash(JSON.stringify({items,locations:await this.getLocations()}))};}
 async preview(toolId){
  await this.ensureSettled(toolId);const ctx=await this.context(toolId),items=ctx.items.filter(i=>i.enabled),previous=await this.record(toolId),files=new Map();
  if(!items.length&&!previous)throw Error('请先添加并启用分配给此工具的共享资源');
  if(ctx.tool==='claude-code'&&(this.env.CLAUDE_CONFIG_DIR||(await this.getLocations())['claude-code']))throw Error('检测到自定义 Claude 配置目录；当前共享资源适配仅支持默认目录，未写入文件');
  const get=async file=>{if(!files.has(file))files.set(file,await this.snapshot(file));return files.get(file);};
  let base;if(ctx.tool==='opencode')base=path.dirname((await this.apiEngine.targets('opencode'))[0].file);else if(ctx.tool==='pi')base=path.dirname((await this.apiEngine.targets('pi'))[0].file);else base=path.join(this.home,ctx.tool==='gemini-cli'?'.gemini':'.claude');
  if(ctx.tool==='gemini-cli'&&this.env.GEMINI_CLI_HOME)throw Error('检测到自定义 Gemini CLI 目录，暂不自动写入');
  const prompts=items.filter(i=>i.kind==='prompt'),skills=items.filter(i=>i.kind==='skill'),mcps=items.filter(i=>i.kind==='mcp');
  const promptText=prompts.map(i=>'## '+i.name+'\n\n'+i.content).join('\n\n');
  const managed=new Set([...(previous?.managedProviders??[]),...ctx.items.filter(i=>i.kind==='mcp').map(i=>'starbridge-'+i.id)]);
  if(ctx.tool!=='pi'&&(mcps.length||managed.size||(ctx.tool==='opencode'&&(prompts.length||previous?.files?.some(f=>f.file.endsWith('starbridge-instructions.md')))))){
   const config=ctx.tool==='opencode'?(await this.apiEngine.targets('opencode'))[0].file:ctx.tool==='gemini-cli'?path.join(base,'settings.json'):path.join(this.home,'.claude.json');
   const f=await get(config),d=json(f.text),key=ctx.tool==='opencode'?'mcp':'mcpServers',changes=[];
   if(d[key]!==undefined&&(!d[key]||typeof d[key]!=='object'||Array.isArray(d[key])))throw Error('目标 MCP 配置格式不受支持');
   for(const id of Object.keys(d[key]??{}))if(managed.has(id))changes.push({path:[key,id],value:undefined});
   for(const item of mcps){const c=item.config;let value;
    if(ctx.tool==='opencode')value=c.type==='local'?{type:'local',command:c.command,environment:c.env??{},enabled:true}:{type:'remote',url:c.url,headers:c.headers??{},enabled:true};
    else if(ctx.tool==='gemini-cli')value=c.type==='local'?{command:c.command[0],args:c.command.slice(1),env:c.env??{}}:{httpUrl:c.url,headers:c.headers??{}};
    else value=c.type==='local'?{type:'stdio',command:c.command[0],args:c.command.slice(1),env:c.env??{}}:{type:'http',url:c.url,headers:c.headers??{}};
    changes.push({path:[key,'starbridge-'+item.id],value});
   }
   if(ctx.tool==='opencode'){
    const instructions=path.join(base,'starbridge-instructions.md').replaceAll('\\','/');
    if(d.instructions!==undefined&&(!Array.isArray(d.instructions)||d.instructions.some(v=>typeof v!=='string')))throw Error('OpenCode instructions 格式不受支持');
    const refs=(d.instructions??[]).filter(v=>v!==instructions);if(prompts.length)refs.push(instructions);
    if(d.instructions!==undefined||refs.length)changes.push({path:['instructions'],value:refs});
   }
   const after=edit(f.text,changes);f.after=f.exists&&isDeepStrictEqual(d,json(after))?f.text:after;
  }
  const promptFile=path.join(base,ctx.tool==='opencode'?'starbridge-instructions.md':ctx.tool==='pi'?'AGENTS.md':ctx.tool==='gemini-cli'?'GEMINI.md':'CLAUDE.md');
  const priorPrompt=previous?.files?.some(f=>f.file===promptFile);if(prompts.length||priorPrompt){const f=await get(promptFile);const original=f.exists?f.text:'';if(ctx.tool==='opencode'){if(f.exists&&!original.startsWith('<!-- STARBRIDGE:SHARED-PROMPTS -->'))throw Error('专用提示词文件已被其他内容占用');f.after=promptText?'<!-- STARBRIDGE:SHARED-PROMPTS -->\n'+promptText+'\n':null;}else f.after=f.exists||promptText?promptBlock(original,promptText):null;}
  const activeSkillFiles=new Set();
  for(const item of skills){const name='starbridge-'+item.id,file=path.join(base,'skills',name,'SKILL.md');activeSkillFiles.add(file);const f=await get(file);if(f.exists&&!f.text.includes('<!-- STARBRIDGE:SKILL '+item.id+' -->'))throw Error('Skill 目录已存在非星桥内容，未覆盖');f.after='---\n'+'name: '+name+'\ndescription: '+JSON.stringify(item.description)+(Object.keys(item.metadata??{}).length?'\n'+yaml.dump(item.metadata,{schema:yaml.JSON_SCHEMA,noRefs:true,lineWidth:-1}).trimEnd():'')+'\n---\n<!-- STARBRIDGE:SKILL '+item.id+' -->\n\n'+item.content+'\n';
   for(const attachment of item.files??[]){const target=path.join(base,'skills',name,...attachment.path.split('/'));activeSkillFiles.add(target);const a=await get(target),owned=previous?.files?.some(old=>old.file===target);if(a.exists&&!owned)throw Error('Skill 附件路径已存在非托管文件，未覆盖');a.after=attachment.data;}
  }
  for(const old of previous?.files??[])if(/[/\\]skills[/\\]starbridge-[a-f0-9-]{36}[/\\]/.test(old.file)&&!activeSkillFiles.has(old.file)){const f=await get(old.file);if(f.hash!==old.afterHash)throw Error('待移除 Skill 已被外部修改，请先检查');f.after=null;}
  if(!files.size)throw Error('没有已分配资源或可更新的应用记录');
  for(const f of files.values()){f.afterHash=f.after===null?null:hash(f.encoding==='base64'?Buffer.from(f.after,'base64'):f.after);f.preview=[resourceDiff(f)];}
  const id=randomUUID(),plan={id,toolId,...ctx,files:[...files.values()],managedProviders:mcps.map(i=>'starbridge-'+i.id),created:Date.now()};this.plans.set(id,plan);if(this.plans.size>30)this.plans.delete(this.plans.keys().next().value);
  return{id,toolId,defaultModel:'共享资源',profileName:ctx.profile.name,files:plan.files.map(f=>({path:f.file,newFile:!f.exists,changes:f.preview})),notice:'显示实际文件增删改（凭据已隐藏），无变化项不会重复写入。只同步星桥管理项，保留其他配置。MCP 配置可能在目标工具启动时执行命令；请核对命令与目标工具。星桥不会执行 MCP 或 Skill。共享目标文件由不同模块更新时，旧恢复操作可能因文件变化被阻止。'};
 }
}
