import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'jsonc-parser';
import {readSkillDirectory} from './skill-bundle.js';
const idFor=s=>createHash('sha256').update(s).digest('hex');
export class ResourceImporter{
 constructor(engine,store){Object.assign(this,{engine,store});this.plan=null;}
 async scan(tool){
  if(!['opencode','pi','claude-code','gemini-cli'].includes(tool))throw Error('此工具尚无资源导入适配器');
  const engine=this.engine,home=engine.home,locations=await engine.getLocations();
  if(tool==='claude-code'&&(engine.env.CLAUDE_CONFIG_DIR||locations['claude-code']))throw Error('自定义 Claude 目录暂不支持导入');
  if(tool==='gemini-cli'&&engine.env.GEMINI_CLI_HOME)throw Error('自定义 Gemini CLI 目录暂不支持导入');
  const base=tool==='opencode'?path.dirname((await engine.apiEngine.targets(tool))[0].file):tool==='pi'?path.dirname((await engine.apiEngine.targets(tool))[0].file):path.join(home,tool==='claude-code'?'.claude':'.gemini');
  const rows=[],candidates=new Map(),existing=await this.store.read();
  const add=(item,source)=>{const id=idFor(tool+'\0'+source+'\0'+item.kind+'\0'+item.name),duplicate=existing.items.some(i=>i.importOrigin===id);item.importOrigin=id;candidates.set(id,item);rows.push({id,name:item.name,kind:item.kind,source,duplicate,fileCount:item.files?.length??0,description:item.kind==='mcp'?(item.config.type==='local'?'本地命令 · 凭据不在预览中显示':'远程 HTTP · 凭据不在预览中显示'):item.kind==='skill'?'包含正文与目录附件':'全局指令正文'});};
  const skipped=(source,reason)=>rows.push({id:idFor('skip'+source),name:path.basename(source),source,skipped:true,reason});
  let config={};
  if(tool!=='pi'){
   const file=tool==='opencode'?(await engine.apiEngine.targets(tool))[0].file:tool==='claude-code'?path.join(home,'.claude.json'):path.join(base,'settings.json');
   const snap=await engine.snapshot(file),errors=[];config=parse(snap.text,errors,{allowTrailingComma:true});if(errors.length||!config||typeof config!=='object'||Array.isArray(config))throw Error('来源配置格式无效');
   const servers=config[tool==='opencode'?'mcp':'mcpServers']??{};
   if(!servers||typeof servers!=='object'||Array.isArray(servers))throw Error('来源 MCP 配置格式无效');
   for(const[name,c]of Object.entries(servers).slice(0,100)){
    if(name.startsWith('starbridge-'))continue;
    try{
     if(!c||typeof c!=='object')throw Error();
     const local=tool==='opencode'?c.type==='local':typeof c.command==='string';
     const allowed=tool==='opencode'?(local?['type','command','environment','enabled']:['type','url','headers','enabled']):tool==='claude-code'?(local?['type','command','args','env']:['type','url','headers']):(local?['command','args','env']:['httpUrl','headers']);
     if(Object.keys(c).some(k=>!allowed.includes(k))||(!local&&tool==='claude-code'&&c.type!=='http')||(!local&&tool==='opencode'&&c.type!=='remote'))throw Error();
     const normalized=local?{type:'local',command:tool==='opencode'?c.command:[c.command,...(c.args??[])],env:c.environment??c.env??{}}:{type:'remote',url:tool==='gemini-cli'?c.httpUrl:c.url,headers:c.headers??{}};
     if(/\{env:|\$\{/.test(JSON.stringify(normalized)))throw Error();
     const item={kind:'mcp',name:name.slice(0,100),config:normalized};this.store.validateItems([item]);add(item,file+'#'+name);
    }catch{skipped(file+'#'+name,'包含专属字段、SSE/OAuth、变量引用或无效格式，保留原配置；请手动适配。');}
   }
  }
  const promptFiles=[path.join(base,tool==='claude-code'?'CLAUDE.md':tool==='gemini-cli'?'GEMINI.md':'AGENTS.md')];
  if(tool==='opencode')for(const entry of config.instructions??[]){if(typeof entry!=='string'||/[*?{}]|^https?:/i.test(entry)){skipped(String(entry),'非固定本地文件引用，未展开');continue;}const file=path.isAbsolute(entry)?entry:path.resolve(base,entry);if(!file.endsWith('starbridge-instructions.md'))promptFiles.push(file);}
  for(const file of new Set(promptFiles)){
   try{const snap=await engine.snapshot(file);if(!snap.exists)continue;const content=snap.text.replace(/<!-- STARBRIDGE:BEGIN SHARED-PROMPTS -->[\s\S]*?<!-- STARBRIDGE:END SHARED-PROMPTS -->/g,'').trim();if(!content)continue;
    const item={kind:'prompt',name:(tool+' · '+path.basename(file)).slice(0,100),content};this.store.validateItems([item]);add(item,file);
   }catch{skipped(file,'指令文件无法安全读取、正文过大或含异常托管标记');}
  }
  const skillRoots=[path.join(base,'skills'),...(tool==='gemini-cli'?[path.join(home,'.agents/skills')]:[])];
  for(const root of skillRoots){let entries;try{await engine.safePath(root);const stat=await fs.lstat(root);if(stat.isSymbolicLink())throw Error();entries=await fs.readdir(root,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')skipped(root,'Skill 目录无法安全读取');continue;}
   for(const entry of entries.slice(0,100)){if(!entry.isDirectory()||entry.name.startsWith('starbridge-'))continue;const source=path.join(root,entry.name);try{await engine.safePath(source);const bundle=await readSkillDirectory(source),item={kind:'skill',...bundle,name:bundle.name.slice(0,100)};this.store.validateItems([item]);add(item,source);}catch{skipped(source,'Skill 目录过大、存在链接/凭据文件或正文格式不支持');}}
  }
  const id=idFor(Date.now()+Math.random().toString());this.plan={id,tool,created:Date.now(),candidates};
  return{id,tool,rows,notice:'只读取此工具的全局资源，不改动来源。勾选后复制到共享库，默认停用、未分配；已有来源条目会跳过。OAuth、SSE、专属参数和动态变量引用不自动转换。'};
 }
 async commit(id,ids){const p=this.plan;if(!p||p.id!==id||Date.now()-p.created>600000)throw Error('导入预览已过期，请重新扫描');if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!p.candidates.has(id)))throw Error('请选择有效导入项');const items=ids.map(id=>p.candidates.get(id));await this.store.importSelected(items);this.plan=null;return{imported:items.length};}
}
