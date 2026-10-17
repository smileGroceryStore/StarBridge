import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {configurationInfo} from '../src/configuration-info.js';
test('settings shows unsupported tools but never sends configuration contents or errors to the renderer',async()=>{
 const catalog={tools:[{id:'opencode',name:'OpenCode',source:'https://example.com/open'},{id:'reasonix',name:'Reasonix Studio'},{id:'deepseek-harness',name:'DeepSeek Harness'}]};
 const engine={getLocations:async()=>({opencode:path.resolve('fixture/custom')}),targets:async id=>{if(id==='reasonix')throw Error('secret-from-invalid-file');if(id==='deepseek-harness')throw Error('unsupported tool must not be inspected');return[{file:path.resolve('fixture/custom/opencode.jsonc'),exists:true,text:'secret-api-key'}];}};
 const result=await configurationInfo(catalog,engine);
 assert.equal(result.length,3);assert.equal(result[0].custom,true);assert.equal(result[0].directory,path.resolve('fixture/custom'));
 assert.deepEqual(result[0].files,[{name:'opencode.jsonc',exists:true}]);
 assert.equal(result[1].directory,null);assert.match(result[1].message,/检查失败/);
 assert.equal(result[2].writable,false);assert.equal(result[2].directory,undefined);
 assert.ok(!JSON.stringify(result).includes('secret-'));
});
