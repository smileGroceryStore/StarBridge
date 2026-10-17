import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export class DeviceSettings {
 constructor(file){this.file=file;this.queue=Promise.resolve();}
 async read(){try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));return{closeToTray:true,minimizeToTray:false,startAtLogin:false,backupRetentionDays:30,toolDirs:{},...data};}catch(e){if(e.code==='ENOENT')return{closeToTray:true,minimizeToTray:false,startAtLogin:false,backupRetentionDays:30,toolDirs:{}};throw Error('本机设置无法读取，请保留原文件');}}
 update(input){const result=this.queue.then(async()=>{const data=await this.read();for(const key of ['closeToTray','minimizeToTray','startAtLogin'])if(key in input){if(typeof input[key]!=='boolean')throw Error('设置格式无效');data[key]=input[key];}if('backupRetentionDays' in input){if(!Number.isInteger(input.backupRetentionDays)||input.backupRetentionDays<7||input.backupRetentionDays>365)throw Error('备份保留期限需在 7–365 天');data.backupRetentionDays=input.backupRetentionDays;}if(input.toolDirs){for(const[tool,dir]of Object.entries(input.toolDirs)){if(!['opencode','pi','reasonix','claude-code','codex','deepseek-harness'].includes(tool)||typeof dir!=='string'||(dir&&!path.isAbsolute(dir)))throw Error('配置目录无效');data.toolDirs[tool]=dir;}}await fs.mkdir(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});await fs.rename(tmp,this.file);}finally{await fs.rm(tmp,{force:true});}return data;});this.queue=result.catch(()=>{});return result;}
}
