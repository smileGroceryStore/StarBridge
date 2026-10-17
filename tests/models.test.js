import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {ProfileStore} from '../src/profile-store.js';import {parseGoModels,compatibleModels} from '../src/model-catalog.js';
test('model routes are explicit and unknown Go protocols are not guessed',()=>{const r=parseGoModels({data:[{id:'deepseek-v4.1-flash'},{id:'gpt-6-luna'},{id:'claude-haiku-5-5'},{id:'unverified-new-model'}]});assert.equal(r.skipped,1);assert.deepEqual(r.entries.map(e=>e.protocol),['openai-chat','openai-responses','anthropic']);assert.deepEqual(compatibleModels({models:r.entries.map(e=>e.id),modelDetails:Object.fromEntries(r.entries.map(e=>[e.id,e]))},'claude-code'),['claude-haiku-5-5']);});
test('legacy bindings survive; agents independently select models and invalid changes are atomic',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'starbridge-models-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'store');const crypto={encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()};
 const p={id:'go',name:'Go',vendor:'OpenCode',baseUrl:'https://opencode.ai/inference/go/openai/v1',protocol:'openai-chat',billing:'coding-plan',models:['deepseek-v4.1-flash'],key:'fixture-only',notes:'',enabled:true};
 await fs.writeFile(file,JSON.stringify({version:1,profiles:[p],bindings:{pi:'go'}}));const store=new ProfileStore(file,crypto,['pi','opencode','claude-code']);assert.equal((await store.list()).bindings.pi,'go');
 await store.addModels('go',parseGoModels({data:[{id:'deepseek-v4.1-flash'},{id:'deepseek-v4-pro'},{id:'claude-haiku-5-5'}]}).entries);
 await store.configureTool({toolId:'pi',profileId:'go',models:['deepseek-v4.1-flash','deepseek-v4-pro'],defaultModel:'deepseek-v4-pro'});
 await store.configureTool({toolId:'opencode',profileId:'go',models:['deepseek-v4.1-flash'],defaultModel:'deepseek-v4.1-flash'});
 const state=await store.list();assert.notEqual(state.toolModels.pi.defaultModel,state.toolModels.opencode.defaultModel);assert.equal(state.profiles[0].key,undefined);
 await assert.rejects(store.configureTool({toolId:'claude-code',profileId:'go',models:['deepseek-v4-pro'],defaultModel:'deepseek-v4-pro'}),/匹配/);
 await assert.rejects(store.save({...p,key:'',models:['deepseek-v4.1-flash']}),/引用/);
 assert.equal((await store.list()).toolModels.pi.defaultModel,'deepseek-v4-pro');
 await store.bind('go',['pi','opencode']);assert.equal((await store.list()).toolModels.pi.defaultModel,'deepseek-v4-pro');
 await store.clearTool('pi');assert.equal((await store.list()).toolModels.pi,undefined);assert.equal((await store.read()).profiles[0].key,'fixture-only');
 await store.toggle('go',false);await assert.rejects(store.configureTool({toolId:'pi',profileId:'go',models:['deepseek-v4-pro'],defaultModel:'deepseek-v4-pro'}),/停用/);
});
