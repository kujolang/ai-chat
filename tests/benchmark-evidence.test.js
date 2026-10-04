const {test}=require('node:test');const assert=require('node:assert/strict');const {reconcileBenchmarkEvidence}=require('../lib/benchmark-evidence');
test('cancelled usage is recovered without turning failure into success or replaying work',async()=>{
 const result={ok:false,error:'deadline',usage:null};let reads=0;
 await reconcileBenchmarkEvidence(result,'id',async id=>{reads++;return {execution:{id,status:'cancelled',result:{usage:{total_tokens:123},usage_complete:true,provider_rounds:4,tool_calls_executed:2}}};});
 assert.equal(reads,1);assert.equal(result.ok,false);assert.equal(result.error,'deadline');assert.equal(result.usage.total_tokens,123);assert.equal(result.usage_complete,true);
});
test('incomplete, still-running and unavailable executions remain lower bounds',async()=>{
 for(const status of ['running','interrupted']){const r={};await reconcileBenchmarkEvidence(r,'id',async()=>({execution:{id:'id',status,checkpoint:{usage:{total_tokens:3}}}}));assert.equal(r.usage_complete,false);}
 const r={usage:{total_tokens:2}};await reconcileBenchmarkEvidence(r,'id',async()=>{throw Error('offline');});assert.equal(r.usage.total_tokens,2);assert.equal(r.usage_complete,false);
});
