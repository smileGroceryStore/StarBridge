import fs from 'node:fs/promises';
import path from 'node:path';
export async function backupInventory({engine,resources,profiles,days=30,now=Date.now()}){
 if(!Number.isInteger(days)||days<7||days>365)throw Error('备份保留期限需在 7–365 天');
 const candidates=[],protectedNames=new Set(),records=new Map();let retained=0;
 let names=[];try{names=await fs.readdir(engine.stateDir);}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const name of names.filter(n=>/\.enc$/.test(n))){const file=path.join(engine.stateDir,name);try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;const record=JSON.parse(engine.crypto.decrypt(await fs.readFile(file)));records.set(name,{record,stat,file});}catch{retained++;}}
 function protect(name){if(!name||protectedNames.has(name))return;protectedNames.add(name);}
 for(const[name,{record}]of records)if(!/-[a-f0-9-]{36}\.enc\.enc$/.test(name)||['prepared','restoring','recovery-required'].includes(record.phase)){protect(name);if(record.backupName)protect(record.backupName+'.enc');if(record.previousRecord?.backupName)protect(record.previousRecord.backupName+'.enc');}
 const groups=new Map();for(const[name,v]of records){if(!/-[a-f0-9-]{36}\.enc\.enc$/.test(name))continue;const key=v.record.toolId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({name,...v});}
 for(const group of groups.values())for(const[v,i]of group.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs).map((v,i)=>[v,i])){if(i<10||protectedNames.has(v.name)||!['applied','restored','recovered','rolled-back'].includes(v.record.phase)||now-v.stat.mtimeMs<days*86400000){retained++;continue;}candidates.push({file:v.file,mtime:v.stat.mtimeMs,size:v.stat.size});}
 for(const store of [profiles,resources.store]){let entries=[];try{entries=await fs.readdir(path.dirname(store.file));}catch(e){if(e.code!=='ENOENT')throw e;}const list=[];for(const name of entries.filter(n=>n.startsWith(path.basename(store.file)+'.before-')&&/\.before-(?:delete|import|restore)-[a-f0-9-]{36}\.bak$/.test(n))){try{const file=path.join(path.dirname(store.file),name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;const d=JSON.parse(store.crypto.decrypt(await fs.readFile(file)));if(d.version!==1||!Array.isArray(d.items??d.profiles))throw Error();list.push({file,stat});}catch{retained++;}}for(const[v,i]of list.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs).map((v,i)=>[v,i])){if(i<10||now-v.stat.mtimeMs<days*86400000){retained++;continue;}candidates.push({file:v.file,mtime:v.stat.mtimeMs,size:v.stat.size});}}
 return{days,retained,candidates,bytes:candidates.reduce((n,f)=>n+f.size,0)};
}
export async function cleanupInventory(inventory){let deleted=0;for(const f of inventory.candidates){const stat=await fs.lstat(f.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==f.size||stat.mtimeMs!==f.mtime)continue;await fs.unlink(f.file);deleted++;}return{deleted,retained:inventory.retained,message:`已清理 ${deleted} 个过期备份；保留每类最近 10 份、未完成操作与当前恢复所需备份。`};}
export function releaseInfo(data,current){
 if(!data||typeof data.tag_name!=='string'||!/^v?\d+\.\d+\.\d+$/.test(data.tag_name)||data.draft||data.prerelease||data.html_url!==`https://github.com/smileGroceryStore/StarBridge/releases/tag/${data.tag_name}`)throw Error('更新信息格式不受支持');
 const remote=data.tag_name.replace(/^v/,''),a=remote.split('.').map(Number),b=current.split('.').map(Number);let newer=false;for(let i=0;i<3;i++)if(a[i]!==b[i]){newer=a[i]>b[i];break;}
 return{current,latest:remote,newer,url:data.html_url,publishedAt:data.published_at??null,message:newer?'发现新版本 '+remote:'当前已是最新正式版本'};
}
