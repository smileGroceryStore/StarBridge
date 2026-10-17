import test from 'node:test';import assert from 'node:assert/strict';
import {reasonixGoBase} from '../src/go-routing.js';
test('Reasonix Go routes preserve protocol while activating native session identity',()=>{
 assert.equal(reasonixGoBase('https://opencode.ai/inference/go/openai/v1','openai-chat'),'https://opencode.ai/zen/go/v1');
 assert.equal(reasonixGoBase('https://opencode.ai/inference/go/openai/v1/','openai-responses'),'https://opencode.ai/zen/go/v1');
 assert.equal(reasonixGoBase('https://opencode.ai/inference/go/anthropic/v1','anthropic'),'https://opencode.ai/zen/go');
 for(const url of ['https://opencode.ai/inference/openai/v1','https://relay.example/inference/go/openai/v1','https://opencode.ai.evil.example/inference/go/openai/v1','https://opencode.ai/inference/go/openai/v1?x=1'])assert.equal(reasonixGoBase(url,'openai-chat'),url);
});
