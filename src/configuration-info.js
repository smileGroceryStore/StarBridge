import path from 'node:path';
import {resourceSupport} from './resource-store.js';
export const writableTools=new Set(['opencode','pi','reasonix']);
// Return path metadata only. Configuration text and credentials stay in the main process.
export async function configurationInfo(catalog,engine){
 const locations=await engine.getLocations();
 return Promise.all(catalog.tools.map(async tool=>{
  const item={id:tool.id,name:tool.name,source:tool.source,writable:writableTools.has(tool.id),resourceKinds:Object.entries(resourceSupport).filter(([,tools])=>tools.includes(tool.id)).map(([kind])=>kind)};
  if(!item.writable)return{...item,message:'写入适配待核验，暂不提供配置目录修改'};
  try{const files=await engine.targets(tool.id);return{...item,custom:!!locations[tool.id],directory:path.dirname(files[0].file),files:files.map(f=>({name:path.basename(f.file),exists:f.exists})),message:'支持预览、备份、应用和恢复'};}
  catch{return{...item,custom:!!locations[tool.id],directory:locations[tool.id]||null,message:'目录检查失败，请检查路径、文件格式或环境变量设置'};}
 }));
}
