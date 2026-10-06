const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectReadProgress,resumeReadProgress,compactRepeatedReads}=require('../lib/read-progress');
const read=(id,path='a',content='evidence '.repeat(100),extra={})=>({call_id:String(id),tool_name:'local_file_read',status:'completed',input:{root_id:'root',path},result:{path,content,complete:true,truncated:false,meta:{mtime_ms:1}},...extra});
const sequence=(n)=>Array.from({length:n},(_,i)=>read(i,i%2?'b':'a'));
test('warns once then stops a two-file loop before another provider request',()=>{
 let state={};const rows=sequence(12);
 assert.equal(inspectReadProgress(state,rows.slice(0,5)).action,'none');
 let p=inspectReadProgress(state,rows.slice(0,6));assert.equal(p.action,'recover');assert.equal(p.warn,true);
 state=structuredClone(state);assert.equal(inspectReadProgress(state,rows.slice(0,8)).warn,false);
 assert.equal(inspectReadProgress(state,rows).action,'stop');assert.equal(state.stopped_at,'11');
});
test('changed content or mtime resets a view even after multiple new reads',()=>{
 for(const changed of [r=>({...r,content:'changed'}),r=>({...r,meta:{mtime_ms:2}})]){
  const rows=Array.from({length:12},(_,i)=>read(i));
  for(let i=9;i<12;i++)rows[i].result=changed(rows[i].result);
  assert.equal(inspectReadProgress({},rows).action,'none');
 }
});
test('writes, errors, partial pages, new ranges and distinct roots interrupt the streak',()=>{
 const rows=sequence(11);
 const last=read(11);
 for(const r of [ {...last,tool_name:'local_file_write'}, {...last,status:'failed'},
  {...last,result:{...last.result,error:{code:'denied'}}},
  {...last,result:{...last.result,complete:false,truncated:true}},
  {...last,input:{...last.input,offset:2}}, {...last,input:{...last.input,root_id:'other'}}])
  assert.equal(inspectReadProgress({},[...rows,r]).action,'none');
});
test('explicit resume gets a fresh bounded window; checkpoints retain recovery state',()=>{
 const rows=sequence(12),state={};inspectReadProgress(state,rows.slice(0,6));
 assert.equal(resumeReadProgress(state).warned_at,'5');
 inspectReadProgress(state,rows);const resumed=resumeReadProgress(state);
 assert.deepEqual(resumed,{after_call_id:'11'});
 assert.equal(inspectReadProgress(resumed,rows).action,'none');
 const next=sequence(12).map(r=>({...r,call_id:'new-'+r.call_id}));
 assert.equal(inspectReadProgress(resumed,[...rows,...next]).action,'stop');
});
test('deduplication retains latest full evidence, every call identity and journal contents',()=>{
 const rows=sequence(6),original=structuredClone(rows),messages=rows.flatMap(r=>[
  {role:'assistant',reasoning:'retained reasoning',tool_calls:[{id:r.call_id}]},
  {role:'tool',tool_call_id:r.call_id,content:JSON.stringify({...r.result,saved_result_ref:r.call_id})}]);
 const before=JSON.stringify(messages).length,p=inspectReadProgress({},rows);
 assert.equal(compactRepeatedReads(messages,p.tail),4);
 assert.ok(JSON.stringify(messages).length<before);
 assert.deepEqual(rows,original);
 assert.equal(messages.filter(m=>m.reasoning==='retained reasoning').length,6);
 for(const m of messages.filter(m=>m.role==='tool')){
  const r=JSON.parse(m.content);assert.equal(r.saved_result_ref,m.tool_call_id);
  if(Number(m.tool_call_id)<4){assert.equal(r.duplicate_read,true);assert.ok(['4','5'].includes(r.same_content_as));}
  else assert.equal(r.content,rows[Number(m.tool_call_id)].result.content);
 }
});
test('no deduplication without the newest complete result; empty files still have bounded reads',()=>{
 const rows=sequence(6),p=inspectReadProgress({},rows);
 const messages=rows.slice(0,4).map(r=>({role:'tool',tool_call_id:r.call_id,content:JSON.stringify(r.result)}));
 assert.equal(compactRepeatedReads(messages,p.tail),0);
 assert.equal(inspectReadProgress({},Array.from({length:12},(_,i)=>read(i,'empty',''))).action,'stop');
});

test('bounded review and final-answer phases cannot turn completed work into a loop error',()=>{
 const {developmentProgressEnabled}=require('../lib/read-progress');
 const tools=[{function:{name:'local_file_write'}}];
 for(const phase of ['review','final'])assert.equal(developmentProgressEnabled(tools,phase),false);
 for(const phase of ['work','repair'])assert.equal(developmentProgressEnabled(tools,phase),true);
 assert.equal(developmentProgressEnabled([{function:{name:'local_file_read'}}],'work'),false);
});
