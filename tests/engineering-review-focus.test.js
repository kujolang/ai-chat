const {test}=require('node:test');const assert=require('node:assert/strict');
const {createEngineeringReview}=require('../lib/engineering-review');
const {focusedPacket}=require('../lib/engineering-review-focus');
const originalMessages=[{role:'user',content:'Implement Kujo CLI'}];
const write={call_id:'w',tool_name:'local_file_write',status:'completed',input:{root_id:'r',path:'main.kujo',content:'print(2)'},result:{ok:true}};
const check={call_id:'v',tool_name:'local_kujo',status:'completed',input:{root_id:'r',path:'main.kujo',operation:'verify'},result:{ok:true,exit_code:0,source_unchanged:true,verification:{kind:'cli_cases',passed:2,total:2}}};
test('selective review repairs deterministic gaps before spending model review rounds',()=>{
 const r=createEngineeringReview({enabled:true,mode:'selective',originalMessages});
 let m=r.onStop([...originalMessages],'done',[write]);
 assert.equal(r.state.phase,'repair');assert.equal(r.state.reviews,0);assert.equal(r.state.deterministic_repairs,1);
 m=r.onStop(m,'checked',[write,check]);
 assert.equal(r.state.phase,'review');assert.equal(r.state.reviews,1);
 assert.match(m.at(-1).content,/decisive_checks/);
 assert.equal(r.state.outcome,'pending'); // caller-authored tests cannot auto-pass
});
test('failed or stale checks never satisfy deterministic gate; repairs stay bounded across resume',()=>{
 let r=createEngineeringReview({enabled:true,mode:'selective',originalMessages});
 let m=[...originalMessages];
 for(let i=0;i<3;i++) {
  m=r.onStop(m,'done',[check,write]);
  r=createEngineeringReview({enabled:true,mode:'always',originalMessages,checkpoint:{engineering_review:r.state}});
 }
 assert.equal(r.state.phase,'final');assert.equal(r.state.repairs,2);assert.equal(r.state.reviews,0);
 assert.match(r.completionNotice(),/unresolved/);
});
test('focused packet selects final writes, bounded diff, linked checks and original requirements',()=>{
 const old={...write,call_id:'old',input:{...write.input,content:'print(0)'}};
 const read={call_id:'read',tool_name:'local_file_read',status:'completed',input:{root_id:'r',path:'main.kujo'},result:{content:'print(1)',truncated:false}};
 const p=JSON.parse(focusedPacket('original requirements',[old,read,write,check],'done',null,['design question']));
 assert.equal(p.final_changes.length,1);assert.equal(p.final_changes[0].result_ref,'w');
 assert.equal(p.final_changes[0].diff.added,'print(2)');assert.equal(p.final_changes[0].diff.removed,'print(1)');
 assert.equal(p.decisive_checks[0].verification.passed,2);assert.equal(p.request,'original requirements');
 assert.deepEqual(p.prior_findings,['design question']);
});
test('focused review cannot certify a truncated set of changed files',()=>{
 const r=createEngineeringReview({enabled:true,mode:'selective',originalMessages});
 const rs=[...Array.from({length:17},(_,i)=>({...write,call_id:'w'+i,input:{...write.input,path:`file${i}.kujo`}})),check];
 const m=r.onStop([...originalMessages],'done',rs);
 r.noteResults([{id:'read',function:{name:'local_file_read'}}],[{ok:true,content:'source'}]);
 r.onStop(m,JSON.stringify({verdict:'pass',findings:[],checks:[{result_ref:'read',claim:'checked'}]}),rs);
 assert.equal(r.state.outcome,'inconclusive');assert.match(r.completionNotice(),/complete scope/);
});

test('append writes and partial reads cannot manufacture final-source diffs',()=>{
 const read={call_id:'r',tool_name:'local_file_read',status:'completed',input:{root_id:'r',path:'main.kujo'},result:{content:'old',truncated:false}};
 for(const [before,after] of [[read,{...write,input:{...write.input,mode:'append'}}],[{...read,result:{...read.result,truncated:true}},write],[{...read,input:{...read.input,offset:2}},write]]) {
  const p=JSON.parse(focusedPacket('task',[before,after,check],'done'));
  assert.equal(p.final_changes[0].diff,null);assert.equal(p.final_changes[0].requires_final_read,true);
 }
});

test('focused review retains earlier execution and failed custom-tool references without their payloads',()=>{
 const shell={call_id:'shell',tool_name:'local_shell',status:'completed',input:{command:'node',args:['writer.js']},result:{stdout:'large payload'}};
 const partial={call_id:'partial',tool_name:'custom_mutator',status:'failed',input:{},result:{error:'partial failure'}};
 const child={call_id:'v:case:1',tool_name:'local_kujo_case',status:'completed',input:{},result:{}};
 const p=JSON.parse(focusedPacket('task',[shell,partial,child,write,check],'done'));
 assert.deepEqual(p.activity_index.map(r=>r.result_ref),['shell','partial','w','v']);
 assert.equal(p.activity_index[0].tool,'local_shell');assert.equal(p.omitted_activity,0);
 assert.equal(JSON.stringify(p).includes('large payload'),false);
 assert.match(p.selection,/partial failures/);
});
test('omitted activity prevents a focused review from certifying complete scope',()=>{
 const r=createEngineeringReview({enabled:true,mode:'selective',originalMessages});
 const rs=[...Array.from({length:65},(_,i)=>({call_id:'s'+i,tool_name:'local_shell',status:'completed',input:{command:'node'},result:{exit_code:0}})),write,check];
 const m=r.onStop([...originalMessages],'done',rs);
 assert.equal(JSON.parse(m.at(-1).content).omitted_activity,3);
 r.noteResults([{id:'read',function:{name:'local_file_read'}}],[{ok:true,content:'source'}]);
 r.onStop(m,JSON.stringify({verdict:'pass',findings:[],checks:[{result_ref:'read',claim:'checked'}]}),rs);
 assert.equal(r.state.outcome,'inconclusive');assert.match(r.completionNotice(),/complete scope/);
});
