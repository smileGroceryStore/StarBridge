import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import{randomBytes,createCipheriv,createDecipheriv}from'node:crypto';
import{ResourceStore}from'../src/resource-store.js';import{ResourceEngine}from'../src/resource-engine.js';import{ConfigEngine}from'../src/config-engine.js';import{analyzeSession,sessionIndex,authOverview}from'../src/session-index.js';
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
