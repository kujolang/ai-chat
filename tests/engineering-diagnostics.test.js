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
test('success resets consecutive failure evidence; persistent failures get one stronger notice',()=>{
 const state={contract:{},phase:'work'};
 const good={...failed,result:{exit_code:0}};
 assert.equal(diagnosticMessage(state,[failed,good,failed]),null);
 assert.ok(diagnosticMessage(state,[failed,failed]));
 const next=diagnosticMessage(state,Array(5).fill(failed));assert.match(next.content,/compact working state/);
 assert.equal(diagnosticMessage(structuredClone(state),Array(8).fill(failed)),null);
});

const read = (file='one.md', content='complete text') => ({tool_name:'local_file_read',status:'completed',input:{root_id:'workspace_0',path:file},result:{path:file,content,complete:true,truncated:false}});
test('repeated successful unchanged reads receive one bounded progress notice across resume',()=>{
 const state={contract:{},phase:'work'};
 const repeated=Array.from({length:6},(_,i)=>read(i%2?'two.md':'one.md','untrusted prompt text'));
 assert.equal(diagnosticMessage(state,repeated.slice(0,5)),null);
 const notice=diagnosticMessage(state,repeated);assert.match(notice.content,/Progress check/);assert.ok(!notice.content.includes('untrusted prompt text'));
 assert.equal(diagnosticMessage(structuredClone(state),repeated),null);
 assert.ok(repeated.every(r=>r.result.content==='untrusted prompt text'),'guidance must not strip evidence');
});
test('changed files, pagination, other activity and review do not count as stagnant reads',()=>{
 const state=()=>({contract:{},phase:'work'});
 const repeated=Array.from({length:6},()=>read());
 for(const replacement of [read('new.md','changed'),read('one.md','changed'),{...read(),result:{...read().result,complete:false,truncated:true}},{tool_name:'local_file_write',status:'completed',result:{ok:true}}, {...read(),input:{root_id:'workspace_0',offset:2}}]){
  const rows=[...repeated.slice(0,5),replacement];assert.equal(diagnosticMessage(state(),rows),null);
 }
 assert.equal(diagnosticMessage({contract:{},phase:'review'},repeated),null);
 assert.equal(diagnosticMessage({phase:'work'},repeated),null);
 assert.equal(diagnosticMessage({...state(),diagnostic_notices:Array(6).fill('earlier')},repeated),null);
});
