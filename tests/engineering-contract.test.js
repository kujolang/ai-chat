const {test}=require('node:test');const assert=require('node:assert/strict');
const {applyContract,assessContract}=require('../lib/engineering-contract');
const {createEngineeringReview}=require('../lib/engineering-review');
const plan={action:'plan',invariants:[{id:'failure',invariant:'Failed writes preserve visible state',check:'Own fixture rejects write, then GET and restart compare unchanged state'}]};
const run={call_id:'check',tool_name:'local_shell',status:'completed',input:{command:'node',args:['--test']},result:{exit_code:0}};
const write={call_id:'write',tool_name:'local_file_write',status:'completed',input:{path:'api.js'},result:{ok:true}};
test('contract is immutable and requires real fresh successful executable evidence',()=>{
 const s={};assert.equal(applyContract(s,plan,[]).ok,true);
 assert.equal(applyContract(s,plan,[]).ok,false);
 assert.equal(assessContract(s,[]).complete,false);
 const evidence={action:'evidence',evidence:[{id:'failure',result_ref:'check'}]};
 assert.equal(applyContract(s,evidence,[]).ok,false);
 assert.equal(applyContract(s,evidence,[write,run]).complete,true);
 assert.equal(assessContract(s,[run,write]).complete,false);
 assert.match(assessContract(s,[write,run]).limitation,/not independent/);
});
test('read receipts, compiler-only checks, failed/truncated/pending runs cannot certify invariants',()=>{
 for(const receipt of [{...run,tool_name:'local_file_read'}, {...run,tool_name:'local_kujo',input:{operation:'check'}}, {...run,result:{exit_code:1}}, {...run,result:{exit_code:0,truncated:true}}, {...run,status:'running'}]){
  const s={};applyContract(s,plan,[]);assert.equal(applyContract(s,{action:'evidence',evidence:[{id:'failure',result_ref:'check'}]},[receipt]).ok,false);
 }
});
test('invalid and duplicate invariant IDs fail without mutation; late plans are disclosed',()=>{
 for(const invariants of [[...plan.invariants,...plan.invariants],[{...plan.invariants[0],id:123}],[]]) {const s={};assert.equal(applyContract(s,{action:'plan',invariants},[]).ok,false);assert.deepEqual(s,{});}
 const s={};assert.equal(applyContract(s,plan,[write]).late_plan,true);
});
test('review cannot pass missing contract evidence; checkpoints retain immutable plans',()=>{
 const originalMessages=[{role:'user',content:'Implement an API'}];
 let r=createEngineeringReview({enabled:true,contractEnabled:true,originalMessages});
 assert.ok(r.schemas([]).some(t=>t.function.name==='engineering_contract'));
 r.acceptContract(plan,[]);
 r=createEngineeringReview({enabled:true,contractEnabled:true,originalMessages,checkpoint:{engineering_review:r.state}});
 assert.equal(r.acceptContract(plan,[]).ok,false);
 const m=r.onStop(originalMessages,'done',[write]);
 assert.ok(!r.schemas([]).some(t=>t.function.name==='engineering_contract'));
 r.noteResults([{id:'read',function:{name:'local_file_read'}}],[{ok:true}]);
 r.onStop(m,JSON.stringify({verdict:'pass',findings:[],checks:[{result_ref:'read',claim:'read code'}]}),[write]);
 assert.equal(r.state.phase,'repair');assert.match(r.state.lastVerdict.findings[0],/Missing final-source/);
 assert.equal(r.acceptContract({action:'evidence',evidence:[{id:'failure',result_ref:'check'}]},[write,run]).ok,true);
});
test('old checkpoints cannot gain contract requirements retroactively',()=>{
 const r=createEngineeringReview({enabled:true,contractEnabled:true,originalMessages:[],checkpoint:{engineering_review:{enabled:true,phase:'work'}}});
 assert.equal(r.state.contract,undefined);assert.equal(r.contractMessage(),null);
});
