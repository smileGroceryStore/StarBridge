import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import{randomBytes,createCipheriv,createDecipheriv}from'node:crypto';
import{ResourceStore}from'../src/resource-store.js';import{ResourceEngine}from'../src/resource-engine.js';import{ConfigEngine}from'../src/config-engine.js';import{analyzeSession,sessionIndex,authOverview}from'../src/session-index.js';
import{ResourceImporter}from'../src/resource-import.js';import{readSkillDirectory,validateBundle}from'../src/skill-bundle.js';import{analyzeGeminiSession}from'../src/gemini-session.js';
async function setup(t){const home=await fs.mkdtemp(path.join(os.tmpdir(),'starbridge-assets-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));const key=randomBytes(32),crypto={encrypt:s=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(s),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]);},decrypt:b=>{const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString();}};const store=new ResourceStore(path.join(home,'assets.enc'),crypto),apiEngine=new ConfigEngine({home,stateDir:path.join(home,'backups'),store:{},crypto}),engine=new ResourceEngine({store,apiEngine});return{home,store,engine};}
test('one encrypted MCP definition applies to two tools, preserves unrelated configuration and masked edits retain credentials',async t=>{
 const{home,store,engine}=await setup(t);let state=await store.save({kind:'mcp',name:'Fixture MCP',enabled:true,tools:['opencode','claude-code'],config:{type:'local',command:['fixture-command','--arg'],env:{TEST_KEY:'secret-fixture-only'}}});
 const existingOpen=path.join(home,'.config/opencode/opencode.json');await fs.mkdir(path.dirname(existingOpen),{recursive:true});await fs.writeFile(existingOpen,JSON.stringify({theme:'user-theme',mcp:{unrelated:{type:'local',command:['keep-me']}}}));const existingClaude='{"userSetting":true}';await fs.writeFile(path.join(home,'.claude.json'),existingClaude);
 assert.equal(state.items[0].config.env.TEST_KEY,'••••••••');assert.ok(!(await fs.readFile(store.file)).includes(Buffer.from('secret-fixture-only')));
 state=await store.save({...state.items[0],name:'Updated shared MCP'});assert.equal((await store.read()).items[0].config.env.TEST_KEY,'secret-fixture-only');
 for(const tool of ['opencode','claude-code']){const p=await engine.preview('asset-'+tool);assert.ok(!JSON.stringify(p).includes('secret-fixture-only'));await engine.apply(p.id);assert.equal((await engine.status('asset-'+tool)).status,'applied');}
 const open=JSON.parse(await fs.readFile(path.join(home,'.config/opencode/opencode.json'))),claude=JSON.parse(await fs.readFile(path.join(home,'.claude.json')));const id='starbridge-'+state.items[0].id;
 assert.equal(open.mcp[id].environment.TEST_KEY,'secret-fixture-only');assert.equal(claude.mcpServers[id].command,'fixture-command');
 assert.equal(open.theme,'user-theme');assert.deepEqual(open.mcp.unrelated.command,['keep-me']);assert.equal(claude.userSetting,true);
 await engine.restore('asset-claude-code');assert.equal(await fs.readFile(path.join(home,'.claude.json'),'utf8'),existingClaude);
});
test('shared prompts preserve user instructions and disabling a Skill removes only its managed file with reversible restore',async t=>{
 const{home,store,engine}=await setup(t);const prompt=path.join(home,'.pi/agent/AGENTS.md');await fs.mkdir(path.dirname(prompt),{recursive:true});await fs.writeFile(prompt,'User instructions\n');
 await store.save({kind:'prompt',name:'Reply in Chinese',content:'Use Chinese.',enabled:true,tools:['pi','opencode']});let state=await store.save({kind:'skill',name:'Review',description:'Review changes',content:'Check the diff.',enabled:true,tools:['pi','opencode']});
 await engine.apply((await engine.preview('asset-pi')).id);const skill=state.items.find(i=>i.kind==='skill'),file=path.join(home,'.pi/agent/skills','starbridge-'+skill.id,'SKILL.md');assert.match(await fs.readFile(prompt,'utf8'),/^User instructions/);assert.match(await fs.readFile(file,'utf8'),/description: "Review changes"/);
 await store.save({...skill,enabled:false});await engine.apply((await engine.preview('asset-pi')).id);await assert.rejects(fs.access(file));await engine.restore('asset-pi');assert.match(await fs.readFile(file,'utf8'),/Check the diff/);
 await engine.apply((await engine.preview('asset-opencode')).id);const config=JSON.parse(await fs.readFile(path.join(home,'.config/opencode/opencode.json')));assert.ok(config.instructions[0].endsWith('/starbridge-instructions.md'));
});
test('resource changes invalidate previews and interrupted resource writes participate in startup recovery',async t=>{
 const{store,engine}=await setup(t);const state=await store.save({kind:'prompt',name:'Rules',content:'First.',enabled:true,tools:['pi']});const preview=await engine.preview('asset-pi');await store.save({...state.items[0],content:'Second.'});await assert.rejects(engine.apply(preview.id),/预设已变化/);
 const p=await engine.preview('asset-pi'),plan=engine.plans.get(p.id),id='asset-pi-11111111-1111-4111-8111-111111111111.enc';await engine.saveRecord(id,{toolId:'asset-pi',phase:'prepared',createdAt:new Date().toISOString(),files:plan.files.map(({file,exists,text,hash:beforeHash,afterHash})=>({file,exists,text,beforeHash,afterHash}))});await engine.write(plan.files[0].file,plan.files[0].after);assert.equal((await engine.pending()).length,1);await assert.rejects(engine.apiEngine.preview('pi'),/未完成/);assert.equal((await engine.apiEngine.status('pi')).status,'recovery-required');await engine.recover(id);assert.deepEqual(await engine.pending(),[]);
});
test('unsupported MCP targets, credential URLs and invalid imported resources fail without writes',async t=>{
 const{store}=await setup(t);await assert.rejects(store.save({kind:'mcp',name:'No',tools:['pi'],enabled:true,config:{type:'remote',url:'https://example.com'}}),/目标工具/);
 await assert.rejects(store.save({kind:'mcp',name:'No',tools:['opencode'],enabled:true,config:{type:'remote',url:'https://user:secret@example.com'}}),/地址/);
 await assert.rejects(store.save({kind:'mcp',name:'No',tools:['opencode'],enabled:true,config:{type:'remote',url:'https://example.com',oauth:false}}),/未支持字段/);
 assert.throws(()=>store.import({version:1,items:[{kind:'skill',name:'Bad',content:'<!-- STARBRIDGE:BAD -->'}]}),/Markdown/);assert.deepEqual((await store.list()).items,[]);
});
test('usage deduplicates streamed message snapshots and Codex cumulative totals without returning conversations',async()=>{
 const lines=[{type:'assistant',message:{id:'same',role:'assistant',model:'m',content:'private conversation',usage:{input_tokens:10,output_tokens:1,cache_read_input_tokens:4}}},{type:'assistant',message:{id:'same',role:'assistant',model:'m',usage:{input_tokens:10,output_tokens:7,cache_read_input_tokens:4}}}];
 const c=analyzeSession('claude-code',lines.map(JSON.stringify).join('\n'),'fixture.jsonl',Date.now());assert.equal(c.input,14);assert.equal(c.output,7);assert.ok(!JSON.stringify(c).includes('private conversation'));
 const codex=[10,20].map(v=>({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:v,output_tokens:v/2,cached_input_tokens:5}}}}));const x=analyzeSession('codex',codex.map(JSON.stringify).join('\n'),'fixture.jsonl',Date.now());assert.equal(x.input,20);assert.equal(x.output,10);
});
test('session and authorization centers are read-only and report limited local evidence',async t=>{
 const{home}=await setup(t);const dir=path.join(home,'.pi/agent/sessions/project');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'one.jsonl'),JSON.stringify({type:'message',message:{role:'assistant',model:'m',usage:{input:10,output:2,cost:{total:0.01}}}}));const index=await sessionIndex(home);assert.equal(index.sessions.length,1);assert.equal(index.usage.cost,0.01);const auth=await authOverview(home,{profiles:[],toolModels:{}});assert.ok(auth.native.every(i=>!i.exists));
});
test('failed metadata commit after removing a managed skill restores the file and the previous active record',async t=>{
 const{home,store,engine}=await setup(t);const state=await store.save({kind:'skill',name:'Review',content:'Keep this.',enabled:true,tools:['pi']});await engine.apply((await engine.preview('asset-pi')).id);const record=await engine.record('asset-pi'),file=path.join(home,'.pi/agent/skills','starbridge-'+state.items[0].id,'SKILL.md'),before=await fs.readFile(file,'utf8');await store.save({...state.items[0],enabled:false});const preview=await engine.preview('asset-pi'),save=engine.saveRecord.bind(engine);let failed=false;engine.saveRecord=async(id,data)=>{if(!failed&&id.startsWith('asset-pi-')&&data.phase==='applied'){failed=true;throw Error('fixture metadata failure');}return save(id,data);};await assert.rejects(engine.apply(preview.id),/已回滚/);assert.equal(await fs.readFile(file,'utf8'),before);assert.deepEqual(await engine.record('asset-pi'),record);assert.deepEqual(await engine.pending(),[]);
});
test('shared resource import copies validated entries disabled and unassigned while preserving existing items',async t=>{
 const{store}=await setup(t);await store.save({kind:'mcp',name:'Original',enabled:true,tools:['opencode'],config:{type:'remote',url:'https://example.com/mcp',headers:{Authorization:'secret-fixture'}}});const exported=await store.portable();await store.import(exported);const d=await store.read();assert.equal(d.items.length,2);assert.notEqual(d.items[0].id,d.items[1].id);assert.equal(d.items[1].enabled,false);assert.deepEqual(d.items[1].tools,[]);assert.equal(d.items[1].config.headers.Authorization,'secret-fixture');
});

test('restoring removed resources retains ownership for subsequent cleanup',async t=>{
 const{home,store,engine}=await setup(t);
 const state=await store.save({kind:'mcp',name:'Shared',enabled:true,tools:['opencode'],config:{type:'local',command:['fixture']}});
 const skillState=await store.save({kind:'skill',name:'Review',description:'Review',content:'Inspect changes.',enabled:true,tools:['opencode']});
 await engine.apply((await engine.preview('asset-opencode')).id);
 for(const item of skillState.items)await store.remove(item.id);
 await engine.apply((await engine.preview('asset-opencode')).id);
 await engine.restore('asset-opencode');
 const configFile=path.join(home,'.config/opencode/opencode.json'),skillFile=path.join(home,'.config/opencode/skills','starbridge-'+skillState.items.find(i=>i.kind==='skill').id,'SKILL.md');
 assert.ok(JSON.parse(await fs.readFile(configFile)).mcp['starbridge-'+state.items[0].id]);
 await fs.access(skillFile);
 await engine.apply((await engine.preview('asset-opencode')).id);
 assert.equal(JSON.parse(await fs.readFile(configFile)).mcp['starbridge-'+state.items[0].id],undefined);
 await assert.rejects(fs.access(skillFile));
});

test('usage identifies missing cost reports instead of treating them as free sessions',async t=>{
 const{home}=await setup(t),dir=path.join(home,'.pi/agent/sessions');await fs.mkdir(dir,{recursive:true});
 for(const[name,usage]of [['reported',{input:3,output:2,cost:{total:0.02}}],['missing',{input:4,output:1}]])await fs.writeFile(path.join(dir,name+'.jsonl'),JSON.stringify({type:'message',message:{role:'assistant',usage}}));
 const index=await sessionIndex(home);assert.equal(index.usage.cost,0.02);assert.equal(index.usage.costReportedSessions,1);assert.equal(index.usage.costMissingSessions,1);assert.match(index.notice,/1\/2/);
});

test('resource recovery lists missing entries and selectively restores them disabled without replacing edits',async t=>{
 const{store}=await setup(t);await store.save({kind:'prompt',name:'A',content:'A rules',enabled:true,tools:['pi']});let state=await store.save({kind:'prompt',name:'B',content:'B rules',enabled:true,tools:['pi']});const[a,b]=state.items;
 await store.remove(a.id);await store.save({...b,content:'Edited current rules'});const backups=await store.backups();assert.equal(backups.length,1);assert.equal(backups[0].items.find(i=>i.id===a.id).exists,false);assert.ok(!JSON.stringify(backups).includes('A rules'));
 await store.restoreBackup(backups[0].id,[a.id]);state=await store.read();assert.equal(state.items.find(i=>i.id===b.id).content,'Edited current rules');assert.equal(state.items.find(i=>i.id===a.id).enabled,false);assert.deepEqual(state.items.find(i=>i.id===a.id).tools,[]);await assert.rejects(store.restoreBackup(backups[0].id,[a.id]),/已存在/);assert.throws(()=>store.restoreBackup('../file.bak',[a.id]),/有效/);
});

test('complete Skill bundles preserve binary files and metadata through sync, removal, restore and migration',async t=>{
 const{home,store,engine}=await setup(t),dir=path.join(home,'fixture-skill');await fs.mkdir(path.join(dir,'references'),{recursive:true});await fs.mkdir(path.join(dir,'scripts'));
 await fs.writeFile(path.join(dir,'SKILL.md'),'---\nname: bundle\ndescription: |\n  Multiline description\nallowed-tools: Read\n---\nUse scripts/check.py and references/pixel.bin.');await fs.writeFile(path.join(dir,'scripts/check.py'),'print("fixture")\n');const bytes=Buffer.from([0,255,128,42]);await fs.writeFile(path.join(dir,'references/pixel.bin'),bytes);await fs.writeFile(path.join(dir,'references/SKILL.md'),'Nested markdown.');
 const bundle=await readSkillDirectory(dir);assert.match(bundle.description,/Multiline/);assert.equal(bundle.metadata['allowed-tools'],'Read');const state=await store.save({kind:'skill',...bundle,enabled:true,tools:['pi','gemini-cli']});assert.equal(state.items[0].fileCount,3);assert.equal(state.items[0].files,undefined);
 const p=await engine.preview('asset-pi');assert.equal(p.files.length,4);assert.ok(p.files.some(f=>f.changes[0].binary));await engine.apply(p.id);const base=path.join(home,'.pi/agent/skills','starbridge-'+state.items[0].id);assert.deepEqual(await fs.readFile(path.join(base,'references/pixel.bin')),bytes);assert.match(await fs.readFile(path.join(base,'references/SKILL.md'),'utf8'),/Nested markdown/);assert.match(await fs.readFile(path.join(base,'SKILL.md'),'utf8'),/allowed-tools: Read/);
 await store.save({...state.items[0],enabled:false});await engine.apply((await engine.preview('asset-pi')).id);await assert.rejects(fs.access(path.join(base,'references/pixel.bin')));await engine.restore('asset-pi');assert.deepEqual(await fs.readFile(path.join(base,'references/pixel.bin')),bytes);
 await store.import(await store.portable());const imported=(await store.read()).items[1];assert.deepEqual(imported.files,bundle.files);assert.equal(imported.metadata['allowed-tools'],'Read');
});

test('Skill bundle paths, case collisions and oversized payloads fail before configuration writes',()=>{
 const data=Buffer.from('fixture').toString('base64');for(const name of ['../escape','/absolute','a\\b','CON.txt','trailing.','.env','a/.env.key','SKILL.md'])assert.throws(()=>validateBundle([{path:name,data}]),/路径/);
 assert.throws(()=>validateBundle([{path:'a.txt',data},{path:'A.txt',data}]),/重复/);assert.throws(()=>validateBundle([{path:'a',data:'%%%'}]),/编码/);
});

test('native resource import previews without credentials, selects copies and detects duplicate origins',async t=>{
 const{home,store,engine}=await setup(t),base=path.join(home,'.claude'),file=path.join(home,'.claude.json');await fs.mkdir(base,{recursive:true});const original=JSON.stringify({unrelated:true,mcpServers:{fixture:{command:'fixture',args:[],env:{API_KEY:'private-fixture-value'}},unsupported:{type:'sse',url:'https://example.com/sse'}}});await fs.writeFile(file,original);await fs.writeFile(path.join(base,'CLAUDE.md'),'Existing user rules.');
 const importer=new ResourceImporter(engine,store),p=await importer.scan('claude-code');assert.equal(p.rows.filter(r=>!r.skipped).length,2);assert.ok(p.rows.some(r=>r.skipped));assert.ok(!JSON.stringify(p).includes('private-fixture-value'));await importer.commit(p.id,p.rows.filter(r=>!r.skipped).map(r=>r.id));const d=await store.read();assert.equal(d.items.length,2);assert.ok(d.items.every(i=>!i.enabled&&!i.tools.length));assert.equal(d.items.find(i=>i.kind==='mcp').config.env.API_KEY,'private-fixture-value');assert.equal(await fs.readFile(file,'utf8'),original);
 const next=await importer.scan('claude-code');assert.ok(next.rows.filter(r=>!r.skipped).every(r=>r.duplicate));await assert.rejects(importer.commit(next.id,[next.rows.find(r=>r.duplicate).id]),/已导入/);
});

test('Gemini CLI resource adapter preserves settings and uses native HTTP MCP plus global context',async t=>{
 const{home,store,engine}=await setup(t),base=path.join(home,'.gemini');await fs.mkdir(base,{recursive:true});await fs.writeFile(path.join(base,'settings.json'),'{"theme":"user","mcpServers":{"user":{"command":"keep"}}}');await fs.writeFile(path.join(base,'GEMINI.md'),'User context\n');
 await store.save({kind:'mcp',name:'HTTP',enabled:true,tools:['gemini-cli'],config:{type:'remote',url:'https://example.com/mcp',headers:{Authorization:'fixture-secret'}}});await store.save({kind:'prompt',name:'Language',enabled:true,tools:['gemini-cli'],content:'Use Chinese.'});const preview=await engine.preview('asset-gemini-cli');assert.ok(!JSON.stringify(preview).includes('fixture-secret'));assert.ok(JSON.stringify(preview).includes('Use Chinese.'));await engine.apply(preview.id);const d=JSON.parse(await fs.readFile(path.join(base,'settings.json')));assert.equal(d.theme,'user');assert.equal(d.mcpServers.user.command,'keep');assert.ok(Object.values(d.mcpServers).some(c=>c.httpUrl==='https://example.com/mcp'));assert.match(await fs.readFile(path.join(base,'GEMINI.md'),'utf8'),/^User context/);
 const record=await engine.record('asset-gemini-cli');const again=await engine.preview('asset-gemini-cli');assert.ok(again.files.every(f=>f.changes[0].operation==='unchanged'));await engine.apply(again.id);assert.equal((await engine.record('asset-gemini-cli')).backupName,record.backupName);await engine.restore('asset-gemini-cli');assert.equal(await fs.readFile(path.join(base,'GEMINI.md'),'utf8'),'User context\n');
});

test('Gemini usage supports JSON and deduplicated JSONL snapshots without double counting migrated logs',async t=>{
 const{home}=await setup(t),dir=path.join(home,'.gemini/tmp/project/chats');await fs.mkdir(dir,{recursive:true});const msg={id:'m1',type:'gemini',model:'fixture-model',content:'private chat',tokens:{input:10,output:3,thoughts:2,cached:4}};const legacy={sessionId:'fixture',messages:[msg]};await fs.writeFile(path.join(dir,'session-a.json'),JSON.stringify(legacy));await fs.writeFile(path.join(dir,'session-a.jsonl'),[{},msg,{...msg,tokens:{...msg.tokens,output:5}}].map(JSON.stringify).join('\n'));
 const index=await sessionIndex(home);assert.equal(index.sessions.length,1);assert.equal(index.usage.input,10);assert.equal(index.usage.output,7);assert.equal(index.usage.cache,4);assert.ok(!JSON.stringify(index).includes('private chat'));assert.equal(index.usage.cost,null);assert.equal(analyzeGeminiSession(JSON.stringify(legacy),'fixture.json',Date.now()).output,5);
});

test('binary Skill rollback and interrupted-operation recovery preserve exact original bytes',async t=>{
 const{home,store,engine}=await setup(t),data=Buffer.from([255,0,128]).toString('base64');const state=await store.save({kind:'skill',name:'Binary',content:'Use attachment.',enabled:true,tools:['pi'],files:[{path:'assets/data.bin',data}]});await engine.apply((await engine.preview('asset-pi')).id);const file=path.join(home,'.pi/agent/skills','starbridge-'+state.items[0].id,'assets/data.bin');
 await store.save({...state.items[0],files:[{path:'assets/data.bin',data:Buffer.from([2,3,4]).toString('base64')}]});const p=await engine.preview('asset-pi'),save=engine.saveRecord.bind(engine);let failed=false;engine.saveRecord=async(id,d)=>{if(!failed&&id.startsWith('asset-pi-')&&d.phase==='applied'){failed=true;throw Error('fixture commit failure');}return save(id,d);};await assert.rejects(engine.apply(p.id),/已回滚/);assert.equal((await fs.readFile(file)).toString('base64'),data);engine.saveRecord=save;
 const next=await engine.preview('asset-pi'),plan=engine.plans.get(next.id),changed=plan.files.find(f=>f.file===file),id='asset-pi-22222222-2222-4222-8222-222222222222.enc';await engine.saveRecord(id,{toolId:'asset-pi',phase:'prepared',createdAt:new Date().toISOString(),files:[{file,exists:true,text:changed.text,encoding:changed.encoding,beforeHash:changed.hash,afterHash:changed.afterHash}]});await engine.write(file,changed.after,changed.encoding);assert.equal((await engine.pending()).find(p=>p.id===id).canRecover,true);await engine.recover(id);assert.equal((await fs.readFile(file)).toString('base64'),data);
});

test('native resource import carries full Skill directories and skips managed prompt sections',async t=>{
 const{home,store,engine}=await setup(t),base=path.join(home,'.pi/agent'),skill=path.join(base,'skills/original/scripts');await fs.mkdir(skill,{recursive:true});await fs.writeFile(path.join(base,'skills/original/SKILL.md'),'---\nname: original\ndescription: Original rules\n---\nUse scripts/run.py.');await fs.writeFile(path.join(skill,'run.py'),'print("fixture")');await fs.writeFile(path.join(base,'AGENTS.md'),'User instructions\n<!-- STARBRIDGE:BEGIN SHARED-PROMPTS -->\nManaged rules\n<!-- STARBRIDGE:END SHARED-PROMPTS -->\n');
 const importer=new ResourceImporter(engine,store),p=await importer.scan('pi');assert.equal(p.rows.length,2);await importer.commit(p.id,p.rows.map(r=>r.id));const d=await store.read();assert.equal(d.items.find(i=>i.kind==='skill').files[0].path,'scripts/run.py');assert.equal(d.items.find(i=>i.kind==='prompt').content,'User instructions');
});
