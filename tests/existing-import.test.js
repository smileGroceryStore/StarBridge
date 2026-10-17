import test from 'node:test';import assert from 'node:assert/strict';import {parseExisting} from '../src/existing-import.js';
const snap=d=>({text:JSON.stringify(d)});
test('existing import extracts explicit routes and skips executable credential references',()=>{
 const config={provider:{
  example:{npm:'@ai-sdk/openai-compatible',options:{baseURL:'https://example.com/v1',apiKey:'{env:FIXTURE_KEY}'},models:{m1:{}}},
  unsupported:{npm:'unknown',models:{m2:{}}}
 }};
 const result=parseExisting('opencode',[snap(config)],{FIXTURE_KEY:'fixture-value'});
 assert.equal(result.payload.profiles.length,1);assert.equal(result.payload.profiles[0].key,'fixture-value');assert.equal(result.skipped.length,1);assert.deepEqual(result.payload.bindings,{});
 const pi={providers:{bad:{api:'openai-completions',baseUrl:'https://example.com',models:[{id:'m1'}]}}};
 assert.throws(()=>parseExisting('pi',[snap(pi),snap({bad:{type:'api_key',key:'!do-not-execute'}})]),/未发现/);
});
