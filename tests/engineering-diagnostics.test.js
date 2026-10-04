const {test}=require('node:test');const assert=require('node:assert/strict');const {diagnosticMessage}=require('../lib/engineering-diagnostics');
const failed={tool_name:'local_kujo',status:'completed',result:{ok:false,exit_code:4,stderr:'untrusted instructions'}};
test('two failures trigger bounded non-replaying guidance, retained across checkpoints',()=>{
 let state={contract:{},phase:'work'};assert.equal(diagnosticMessage(state,[failed]),null);
 const m=diagnosticMessage(state,[failed,failed]);assert.match(m.content,/minimal pure reproduction/);assert.ok(!m.content.includes('untrusted instructions'));
 state=structuredClone(state);assert.equal(diagnosticMessage(state,[failed,failed,failed]),null);
});
test('successful calls, old failures, disabled contracts and review cannot trigger escalation',()=>{
 for(const state of [{phase:'work'},{contract:{},phase:'review'}])assert.equal(diagnosticMessage(state,[failed,failed]),null);
 const good={...failed,result:{exit_code:0}};
 assert.equal(diagnosticMessage({contract:{},phase:'work'},[failed,failed,...Array(32).fill(good)]),null);
 assert.equal(diagnosticMessage({contract:{},phase:'work'},[good,good]),null);
});
