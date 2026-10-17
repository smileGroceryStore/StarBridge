import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const digest=b=>createHash('sha256').update(b).digest('hex');
export function validateBundle(files=[]){
 if(!Array.isArray(files)||files.length>64)throw Error('Skill 附件最多 64 个文件');
 const seen=new Set();let total=0;
 return files.map(f=>{
  if(!f||typeof f.path!=='string'||f.path.length>240||f.path.includes('\\')||f.path.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))||f.path.split('/').some(p=>p==='.git'||p==='.env'||p.startsWith('.env.'))||f.path.toLowerCase()==='skill.md'||seen.has(f.path.toLowerCase()))throw Error('Skill 附件路径无效或重复');
  if(typeof f.data!=='string'||f.data.length>700000)throw Error('Skill 附件过大');
  const bytes=Buffer.from(f.data,'base64');if(bytes.toString('base64')!==f.data)throw Error('Skill 附件编码无效');if(bytes.length>512*1024||(total+=bytes.length)>2*1024*1024)throw Error('Skill 目录最大 2 MiB，单文件最大 512 KiB');
  seen.add(f.path.toLowerCase());return{path:f.path,data:f.data,hash:digest(bytes),size:bytes.length};
 });
}
export async function readSkillDirectory(directory){
 const files=[];let count=0,total=0;
 async function walk(dir,relative='',depth=0){
  if(depth>8)throw Error('Skill 目录层级过深');
  const stat=await fs.lstat(dir);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Skill 目录不允许符号链接');
  for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(e.name==='.git'||e.name==='node_modules'||e.name==='.env'||e.name.startsWith('.env.'))throw Error('目录包含依赖、Git 数据或环境凭据，请先整理后导入');
   const name=relative?relative+'/'+e.name:e.name,file=path.join(dir,e.name);
   if(e.isSymbolicLink())throw Error('Skill 附件不允许符号链接');
   if(e.isDirectory())await walk(file,name,depth+1);else if(e.isFile()){
    if(++count>65)throw Error('Skill 文件数量超限');
    const s=await fs.lstat(file);if(s.size>512*1024||(total+=s.size)>2*1024*1024)throw Error('Skill 目录大小超限');
    files.push({path:name,data:(await fs.readFile(file)).toString('base64')});
   }
  }
 }
 await walk(directory);const main=files.find(f=>f.path==='SKILL.md');if(!main)throw Error('目录中缺少 SKILL.md');
 const text=new TextDecoder('utf8',{fatal:true}).decode(Buffer.from(main.data,'base64'));
 const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);let name=path.basename(directory),description=name,content=text,metadata={};
 if(match){if(match[1].length>16000||/(?:^|\s)[&*][a-zA-Z0-9_-]+/.test(match[1]))throw Error('Skill 头不支持 YAML 引用或超大元数据');const header=yaml.load(match[1],{schema:yaml.JSON_SCHEMA});if(!header||Array.isArray(header)||typeof header!=='object')throw Error('Skill frontmatter 无效');if(typeof header.name==='string')name=header.name;if(typeof header.description==='string')description=header.description;metadata=Object.fromEntries(Object.entries(header).filter(([k])=>!['name','description','__proto__','constructor','prototype'].includes(k)));content=text.slice(match[0].length);}
 return{name,description,metadata,content,files:validateBundle(files.filter(f=>f!==main))};
}
