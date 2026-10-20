import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { modelMetadata } from './model-discovery.js';
import { compatibleModels } from './model-catalog.js';
import {toolConnections,modelsForProfile} from './tool-config.js';
import {validatePortable} from './portable.js';

export const checkFingerprint=p=>createHash('sha256').update(JSON.stringify({key:p.key,baseUrl:p.baseUrl,protocol:p.protocol,models:p.models,details:p.modelDetails??{}})).digest('hex');
export class ProfileStore {
  constructor(file, crypto, toolIds) { this.file = file; this.crypto = crypto; this.toolIds = new Set(toolIds); this.queue = Promise.resolve(); }
  async read() {
    try { const bytes = await fs.readFile(this.file); const data = JSON.parse(this.crypto.decrypt(bytes)); if (data.version !== 1 || !Array.isArray(data.profiles) || !data.bindings || typeof data.bindings !== 'object') throw Error(); data.toolModels ??= {}; return data; }
    catch (e) { if (e.code === 'ENOENT') return { version: 1, profiles: [], bindings: {} }; throw Error('套餐库无法解密或已损坏，请保留原文件并检查当前 Windows 用户'); }
  }
  summary(data) { return { profiles: data.profiles.map(({ key, ...p }) => ({ ...p, checks:Object.fromEntries(Object.entries(p.checks??{}).map(([mode,{fingerprint,...c}])=>[mode,{...c,stale:fingerprint!==checkFingerprint({...p,key})}])), hasKey: !!key })), bindings: data.bindings, toolModels: data.toolModels ?? {},schemes:data.schemes??[] }; }
  async list() { await this.queue; return this.summary(await this.read()); }
  mutate(fn) {
    const operation = this.queue.then(async () => {
      const data = await this.read(); data.toolModels ??= {}; await fn(data);
      const encrypted = this.crypto.encrypt(JSON.stringify(data));
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, encrypted, { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, this.file); }
      finally { await fs.rm(temporary, { force: true }); }
      return this.summary(data);
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  save(input) {
    if (!input || typeof input !== 'object') throw Error('套餐数据无效');
    const string = (v, max) => typeof v === 'string' && v.length <= max;
    if (!string(input.name, 100) || !input.name.trim()) throw Error('请填写套餐名称');
    if (!string(input.vendor, 100) || !string(input.baseUrl, 2048) || !string(input.notes, 4000) || !string(input.key, 8192)) throw Error('字段格式或长度不正确');
    if (!['openai-chat', 'openai-responses', 'anthropic', 'gemini'].includes(input.protocol) || !['api', 'coding-plan', 'local'].includes(input.billing)) throw Error('协议或计费类型无效');
    let url; try { url = new URL(input.baseUrl); } catch { throw Error('接口地址不是有效 URL'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('接口地址必须为 HTTP(S)，且不能包含密码、查询参数或片段');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('远程接口请使用 HTTPS；HTTP 仅允许本机服务');
    if (!Array.isArray(input.models) || input.models.length > 20000 || input.models.some(m => !string(m, 200) || !m.trim() || ['__proto__','constructor','prototype'].includes(m))) throw Error('模型列表无效');
    if (typeof input.enabled !== 'boolean') throw Error('启用状态无效');
    return this.mutate(data => {
      const old = input.id ? data.profiles.find(p => p.id === input.id) : null;
      if (input.id && !old) throw Error('套餐不存在，请刷新后重试');
      const key = input.clearKey ? '' : input.key || old?.key || '';
      if (input.billing !== 'local' && !key) throw Error('请填写 API Key');
      const models = [...new Set(input.models.map(m => m.trim()))];
      for (const config of Object.values(data.toolModels)) if (modelsForProfile(config,old?.id).some(m => !models.includes(m))) throw Error('待移除模型仍被 Agent 预设引用，请先调整 Agent 模型');
      const profile = { id: old?.id ?? randomUUID(), name: input.name.trim(), vendor: input.vendor.trim(), baseUrl: input.baseUrl.trim(), protocol: input.protocol, billing: input.billing, models, modelDetails: Object.fromEntries(Object.entries(old?.modelDetails ?? {}).filter(([id])=>models.includes(id))), notes: input.notes.trim(), enabled: input.enabled&&!old?.archived, archived:old?.archived??false, checks:old?.checks,favorite:old?.favorite??false,lastUsedAt:old?.lastUsedAt, key, updatedAt: new Date().toISOString() };
      for (const [toolId, config] of Object.entries(data.toolModels)) if (modelsForProfile(config,profile.id).some(m => !compatibleModels(profile, toolId).includes(m))) throw Error('协议变更会使 Agent 预设不兼容，请先调整 Agent 模型');
      if (old) data.profiles[data.profiles.indexOf(old)] = profile; else data.profiles.push(profile);
    });
  }
  toggle(id, enabled) { if (typeof enabled !== 'boolean') throw Error('状态无效'); return this.mutate(data => { const p = data.profiles.find(p => p.id === id); if (!p) throw Error('套餐不存在'); if(p.archived&&enabled)throw Error('请先恢复归档连接');p.enabled = enabled; p.updatedAt = new Date().toISOString(); }); }
  bind(profileId, toolIds) {
    if (!Array.isArray(toolIds) || toolIds.some(id => !this.toolIds.has(id))) throw Error('工具选择无效');
    return this.mutate(data => {
      const p = data.profiles.find(p => p.id === profileId); if (!p || !p.enabled) throw Error('请先启用此套餐');
      for (const [id, bound] of Object.entries(data.bindings)) if (bound === profileId && !toolIds.includes(id)) { delete data.bindings[id]; delete data.toolModels[id]; }
      for (const id of toolIds) { const compatible = compatibleModels(p, id); if (!compatible.length) throw Error('所选工具没有协议匹配的模型'); if (data.bindings[id] !== profileId) delete data.toolModels[id]; data.bindings[id] = profileId; }
    });
  }
  addModels(profileId, entries, source = 'manual') {
    if (!Array.isArray(entries) || entries.length > 20000 || entries.some(e => typeof e.id !== 'string' || !e.id.trim() || ['__proto__','constructor','prototype'].includes(e.id.trim()) || e.id.length > 200 || !['openai-chat','openai-responses','anthropic','gemini'].includes(e.protocol) || typeof e.baseUrl !== 'string')) throw Error('模型格式无效');
    for (const entry of entries) { let u; try { u = new URL(entry.baseUrl); } catch { throw Error('模型接口地址无效'); } if (u.username || u.password || u.search || u.hash || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw Error('模型接口地址不安全'); }
    return this.mutate(data => {
      const p = data.profiles.find(p => p.id === profileId); if (!p) throw Error('连接不存在');
      p.modelDetails ??= {};
      for (const entry of entries) { const id = entry.id.trim(); if (!p.models.includes(id)) p.models.push(id); if(entry.inherit===true)delete p.modelDetails[id];else p.modelDetails[id] = { ...p.modelDetails[id], ...modelMetadata(entry), protocol: entry.protocol, baseUrl: entry.baseUrl }; }
      if (p.models.length > 20000) throw Error('每个连接最多保存 20000 个模型');
      for (const [tool, config] of Object.entries(data.toolModels)) if (modelsForProfile(config,p.id).some(id => !compatibleModels(p, tool).includes(id))) throw Error('模型协议更新与已有 Agent 预设冲突');
      p.modelsUpdatedAt = new Date().toISOString(); p.modelsSource = source;
    });
  }
  configureTool(input) {
    if(!input||!this.toolIds.has(input.toolId))throw Error('工具无效');
    const connections=input.connections??[{profileId:input.profileId,models:input.models}];
    if(!Array.isArray(connections)||!connections.length||connections.length>10||new Set(connections.map(c=>c.profileId)).size!==connections.length||connections.some(c=>!Array.isArray(c.models)||!c.models.length||c.models.length>100)||connections.reduce((sum,c)=>sum+c.models.length,0)>300)throw Error('请选择连接和可选模型（最多10个连接、300个模型）');
    if(connections.length>1&&!['opencode','pi','reasonix'].includes(input.toolId))throw Error('此工具尚不支持多连接共存');
    const primary=connections.find(c=>c.profileId===input.profileId);if(!primary?.models.includes(input.defaultModel))throw Error('默认模型必须在默认连接的可选模型中');
    return this.mutate(data=>{for(const c of connections){const p=data.profiles.find(p=>p.id===c.profileId);if(!p?.enabled||p.archived)throw Error('连接不存在、已停用或已归档');if(c.models.some(m=>!compatibleModels(p,input.toolId).includes(m)))throw Error('模型不属于此连接或与工具协议不匹配');}data.bindings[input.toolId]=input.profileId;data.toolModels[input.toolId]={profileId:input.profileId,models:[...new Set(primary.models)],defaultModel:input.defaultModel,...(connections.length>1?{connections:connections.map(c=>({profileId:c.profileId,models:[...new Set(c.models)]}))}:{}),status:'preset',updatedAt:new Date().toISOString()};});
  }
  preference(id,favorite){if(typeof favorite!=='boolean')throw Error('收藏状态无效');return this.mutate(data=>{const p=data.profiles.find(p=>p.id===id);if(!p)throw Error('连接不存在');p.favorite=favorite;});}
  markUsed(ids){return this.mutate(data=>{for(const p of data.profiles)if(ids.includes(p.id))p.lastUsedAt=new Date().toISOString();});}
  saveScheme(name){if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('请填写方案名称');return this.mutate(data=>{data.schemes??=[];if(data.schemes.length>=30)throw Error('最多保存30个方案');data.schemes.push({id:randomUUID(),name:name.trim(),bindings:structuredClone(data.bindings),toolModels:structuredClone(data.toolModels),createdAt:new Date().toISOString()});});}
  activateScheme(id){return this.mutate(data=>{const scheme=data.schemes?.find(s=>s.id===id);if(!scheme)throw Error('方案不存在');for(const profileId of Object.values(scheme.bindings))if(!data.profiles.some(p=>p.id===profileId&&p.enabled))throw Error('方案中的连接已移除或停用');for(const[tool,c]of Object.entries(scheme.toolModels))for(const part of toolConnections(c)){const p=data.profiles.find(p=>p.id===part.profileId);if(!p?.enabled||part.models.some(m=>!compatibleModels(p,tool).includes(m)))throw Error('方案中存在已移除、停用或模型不兼容的连接，请先调整');}data.bindings=structuredClone(scheme.bindings);data.toolModels=structuredClone(scheme.toolModels);});}
  deleteScheme(id){return this.mutate(data=>{data.schemes=(data.schemes??[]).filter(s=>s.id!==id);});}
  clearTool(toolId) { if (!this.toolIds.has(toolId)) throw Error('工具不存在'); return this.mutate(data=>{ delete data.bindings[toolId]; delete data.toolModels[toolId]; }); }
  deleteModel(profileId,model){return this.mutate(data=>{const p=data.profiles.find(p=>p.id===profileId);if(!p||!p.models.includes(model))throw Error('模型不存在');const tools=Object.entries(data.toolModels).filter(([,c])=>modelsForProfile(c,profileId).includes(model)).map(([id])=>id);if(tools.length)throw Error(`模型正在被 ${tools.join('、')} 引用，请先调整预设`);p.models=p.models.filter(m=>m!==model);delete p.modelDetails?.[model];p.modelsUpdatedAt=new Date().toISOString();});}
  async backups(){await this.queue;let names;try{names=await fs.readdir(path.dirname(this.file));}catch(e){if(e.code==='ENOENT')return[];throw e;}const prefix=path.basename(this.file)+'.before-';const result=[];for(const name of names.filter(n=>n.startsWith(prefix)&&/^[a-zA-Z0-9.-]+\.bak$/.test(n))){const target=path.join(path.dirname(this.file),name);try{const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024*1024)continue;const d=JSON.parse(this.crypto.decrypt(await fs.readFile(target)));result.push({id:name,createdAt:stat.mtime.toISOString(),profiles:d.profiles.map(p=>({id:p.id,name:p.name})),reason:name.includes('before-delete')?'删除前':name.includes('before-import')?'导入前':'库备份'});}catch{result.push({id:name,unreadable:true,profiles:[],reason:'备份无法读取'});}}return result.sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));}
  async restoreBackup(id,profileIds){const entry=(await this.backups()).find(b=>b.id===id&&!b.unreadable);if(!entry||!Array.isArray(profileIds)||!profileIds.length||profileIds.some(id=>!entry.profiles.some(p=>p.id===id)))throw Error('请选择有效备份和连接');const payload=validatePortable(JSON.parse(this.crypto.decrypt(await fs.readFile(path.join(path.dirname(this.file),id)))),this.toolIds);return this.mutate(async data=>{const missing=payload.profiles.filter(p=>profileIds.includes(p.id)&&!data.profiles.some(c=>c.id===p.id));if(!missing.length)throw Error('所选连接已存在，无需恢复；不会覆盖现有连接');await fs.copyFile(this.file,`${this.file}.before-restore-${randomUUID()}.bak`);for(const p of missing){const restored=structuredClone(p);restored.enabled=false;restored.archived=false;delete restored.checks;data.profiles.push(restored);}});}
  async cleanupBackups(){const backups=await this.backups(),cutoff=Date.now()-30*86400000;let removed=0;for(const b of backups.slice(10)){if(!b.unreadable&&Date.parse(b.createdAt)<cutoff){await fs.unlink(path.join(path.dirname(this.file),b.id));removed++;}}return{removed};}
  async previewImport(input){validatePortable(input,this.toolIds);const current=await this.portable();return input.profiles.map(p=>({id:p.id,name:p.name,modelCount:p.models.length,matches:current.profiles.filter(c=>(c.name.replace(/ · 导入$/,'')===p.name.replace(/ · 导入$/,''))||(c.baseUrl===p.baseUrl&&c.protocol===p.protocol&&c.key===p.key)).map(c=>({id:c.id,name:c.name}))}));}
  remove(id){return this.mutate(async data=>{if(!data.profiles.some(p=>p.id===id))throw Error('连接不存在，请刷新后重试');await fs.copyFile(this.file,`${this.file}.before-delete-${randomUUID()}.bak`);data.profiles=data.profiles.filter(p=>p.id!==id);for(const[tool,profileId]of Object.entries(data.bindings))if(profileId===id)delete data.bindings[tool];for(const[tool,preset]of Object.entries(data.toolModels))if(toolConnections(preset).some(c=>c.profileId===id)){delete data.toolModels[tool];delete data.bindings[tool];}});}
  clone(id){return this.mutate(data=>{const p=data.profiles.find(p=>p.id===id);if(!p)throw Error('连接不存在');const copy=structuredClone(p);copy.id=randomUUID();copy.name=(p.name+' · 副本').slice(0,100);copy.enabled=false;copy.archived=false;copy.favorite=false;delete copy.lastUsedAt;delete copy.checks;data.profiles.push(copy);});}
  archive(id,archived){if(typeof archived!=='boolean')throw Error('归档状态无效');return this.mutate(data=>{const p=data.profiles.find(p=>p.id===id);if(!p)throw Error('连接不存在');p.archived=archived;p.enabled=false;});}
  recordCheck(id,result){return this.mutate(data=>{const p=data.profiles.find(p=>p.id===id);if(!p)throw Error('连接不存在');p.checks??={};p.checks[result.mode]={...result,checkedAt:new Date().toISOString()};});}
  async portable(){await this.queue;const d=await this.read();return{version:1,profiles:d.profiles,bindings:d.bindings,toolModels:d.toolModels??{}};}
  importPortable(input,choices){const payload=validatePortable(input,this.toolIds);return this.mutate(async data=>{if(choices){if(!Array.isArray(choices)||choices.length!==payload.profiles.length||new Set(choices.map(c=>c.id)).size!==choices.length)throw Error('导入选择无效');for(const c of choices)if(!payload.profiles.some(p=>p.id===c.id)||!['skip','copy','update'].includes(c.mode))throw Error('导入选择无效');await fs.copyFile(this.file,`${this.file}.before-import-${randomUUID()}.bak`).catch(e=>{if(e.code!=='ENOENT')throw e;});}const idMap=new Map(),updated=new Set();for(const p of payload.profiles){const choice=choices?.find(c=>c.id===p.id);if(choice?.mode==='skip')continue;const target=choice?.mode==='update'?data.profiles.find(c=>c.id===choice.targetId):null;if(choice?.mode==='update'&&!target)throw Error('更新目标已不存在');if(target&&updated.has(target.id))throw Error('多个导入连接不能同时更新同一目标');const id=target?.id??randomUUID();idMap.set(p.id,id);const imported={id,name:(target?target.name:p.name+' · 导入').slice(0,100),vendor:p.vendor,baseUrl:p.baseUrl,protocol:p.protocol,billing:p.billing,models:[...new Set(p.models)],modelDetails:structuredClone(p.modelDetails??{}),key:p.key,notes:p.notes,enabled:p.enabled&&!p.archived,archived:!!p.archived,updatedAt:new Date().toISOString()};if(target){for(const[tool,c]of Object.entries(data.toolModels))if(modelsForProfile(c,id).some(m=>!compatibleModels(imported,tool).includes(m)))throw Error('更新会影响现有 Agent 模型，请选择另存副本');data.profiles[data.profiles.indexOf(target)]=imported;updated.add(id);}else data.profiles.push(imported);}for(const[tool,id]of Object.entries(payload.bindings))if(idMap.has(id)&&!data.bindings[tool]){data.bindings[tool]=idMap.get(id);const c=payload.toolModels[tool];if(c){const importedProfile=data.profiles.find(p=>p.id===idMap.get(id));if(c.models.some(m=>!compatibleModels(importedProfile,tool).includes(m)))continue;const connections=toolConnections(c);if(connections.some(part=>!idMap.has(part.profileId)))continue;if(connections.some(part=>part.models.some(m=>!compatibleModels(data.profiles.find(p=>p.id===idMap.get(part.profileId)),tool).includes(m))))continue;data.toolModels[tool]={profileId:idMap.get(id),models:[...new Set(c.models)],defaultModel:c.defaultModel,...(connections.length>1?{connections:connections.map(part=>({profileId:idMap.get(part.profileId),models:part.models}))}:{}),status:'preset',updatedAt:new Date().toISOString()};}}});}
}
