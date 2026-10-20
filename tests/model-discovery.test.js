import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverConnectionModels,parseConnectionModels,modelMetadata} from '../src/model-discovery.js';
const profile={baseUrl:'https://example.com/v1',protocol:'openai-responses',key:'secret'};
const reply=json=>({ok:true,text:async()=>JSON.stringify(json)});
test('extracts metadata without inventing missing capabilities',()=>{
 assert.deepEqual(modelMetadata({limits:{context_length:128000,max_output_tokens:8192},capabilities:{tool_call:false,reasoning:true},modalities:{input:['text','image']}}),{contextWindow:128000,maxOutputTokens:8192,toolCall:false,reasoning:true,inputModalities:['text','image']});
 assert.deepEqual(modelMetadata({}),{});
 assert.deepEqual(modelMetadata({context_length:-1,max_output_tokens:'invalid'}),{});
});
test('fetches current connection with auth, preserves routes, follows pagination',async()=>{
 const calls=[];const r=await discoverConnectionModels(profile,async(url,options)=>{calls.push({url,options});return reply(calls.length===1?{data:[{id:'a',context_window:100,max_output_tokens:10}],has_more:true,last_id:'a'}:{data:[{id:'b',context_window:200,max_output_tokens:20}]});});
 assert.equal(calls[0].url,'https://example.com/v1/models');assert.equal(calls[0].options.headers.Authorization,'Bearer secret');assert.equal(calls[0].options.redirect,'error');assert.equal(new URL(calls[1].url).searchParams.get('after'),'a');assert.equal(r.entries.length,2);assert.equal(r.entries[0].protocol,'openai-responses');
});
test('optional enrichment never forwards credentials and failure preserves list',async()=>{
 const r=await discoverConnectionModels(profile,async(url,options)=>{if(url.includes('models.dev')){assert.equal(options.headers,undefined);throw Error('offline');}return reply({data:[{id:'custom'}]});});assert.equal(r.entries[0].contextWindow,undefined);
});
test('uses protocol-specific credentials and rejects HTTP remote URLs',async()=>{
 for(const [protocol,header]of [['anthropic','x-api-key'],['gemini','x-goog-api-key']])await discoverConnectionModels({...profile,protocol},async(url,options)=>{if(url.includes('models.dev'))return {ok:false};assert.equal(options.headers[header],'secret');assert.equal(options.headers.Authorization,undefined);return reply({models:[{name:'models/custom',inputTokenLimit:100,outputTokenLimit:10}]});});
 await assert.rejects(discoverConnectionModels({...profile,baseUrl:'http://remote.test'},()=>assert.fail()),/不安全/);
 assert.throws(()=>parseConnectionModels({data:[]},profile),/没有返回/);
});
import {previewConnectionModels} from '../src/model-preview.js';
import {modelEndpoints} from '../src/model-discovery.js';
test('draft fetch reuses stored key only on the same origin and never saves',async()=>{
 const store={read:async()=>({profiles:[{id:'saved',...profile}]})};
 const r=await previewConnectionModels(store,{id:'saved',...profile,key:''},async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer secret');return reply({data:[{id:'a',context_window:100,max_output_tokens:10}]});});assert.equal(r.entries.length,1);
 await assert.rejects(previewConnectionModels(store,{id:'saved',...profile,baseUrl:'https://other.test',key:''},()=>assert.fail()),/域名已改变/);
});
test('model endpoint fallback follows compatible subpaths only for 404/405',async()=>{
 assert.deepEqual(modelEndpoints({...profile,baseUrl:'https://api.deepseek.com/anthropic'}),['https://api.deepseek.com/anthropic/v1/models','https://api.deepseek.com/anthropic/models','https://api.deepseek.com/v1/models','https://api.deepseek.com/models']);
 let calls=0;const r=await discoverConnectionModels({...profile,baseUrl:'https://example.com/anthropic'},async()=>++calls<3?{ok:false,status:404}:reply({models:[{slug:'custom',context_window:100,max_output_tokens:10}]}));assert.equal(r.entries[0].id,'custom');assert.equal(calls,3);
});
