const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readSavedResult}=require('../lib/tool-evidence');
const {budgetContext}=require('../lib/context-budget');
test('saved evidence pages reconstruct exact JSON without rerunning a tool',()=>{
 const result={url:'https://example.com/source',text:'Evidence 😀 '.repeat(1400)};
 const lookup=id=>id==='read-1'?{status:'completed',tool_name:'web_fetch',result}:null;
 let offset=0,text='';
 do {const page=readSavedResult({result_ref:'read-1',offset,limit:301},lookup);assert.ok(page.content.length<=302);text+=page.content;offset=page.next_offset;}while(offset!==null);
 assert.deepEqual(JSON.parse(text),result);
 assert.equal(readSavedResult({result_ref:'other-run-id'},lookup).ok,false);
 for(const args of [{result_ref:'read-1',run_id:'other'},{result_ref:'read-1',offset:-1},{result_ref:'read-1',limit:4001}]) assert.throws(()=>readSavedResult(args,lookup),{code:'invalid_tool_arguments'});
});
test('compacted native and OpenAI results retain stable journal references',()=>{
 for(const native of [false,true]) {
 const messages=[{role:'user',content:'Research'}, {role:'assistant',tool_calls:[{...(native?{}:{id:'ref-1'}),function:{index:0,name:'web_fetch',arguments:{url:'https://example.com'}}}]}, {role:'tool',...(native?{tool_name:'web_fetch'}:{tool_call_id:'ref-1'}),content:JSON.stringify({ok:true,saved_result_ref:'ref-1',text:'evidence'.repeat(5000)})}];
 budgetContext(messages,[],{window_tokens:8192,output_tokens:1024});
 assert.match(messages[1].content,/"result_ref":"ref-1"/);
 assert.match(messages[1].content,/tool_result_read/);
 }
});

test('retrieving retrieval receipts reads original evidence without nested JSON growth',()=>{
 const rows={source:{status:'completed',tool_name:'documentation_query',result:{text:'useful example'}}};
 let ref='source';
 for(let i=0;i<10;i++) {
  const page=readSavedResult({result_ref:ref},id=>rows[id]);
  assert.equal(page.result_ref,'source');assert.deepEqual(JSON.parse(page.content),{text:'useful example'});
  const next='page'+i;rows[next]={status:'completed',tool_name:'tool_result_read',result:page};ref=next;
 }
 rows.loop={status:'completed',tool_name:'tool_result_read',result:{result_ref:'loop'}};
 assert.throws(()=>readSavedResult({result_ref:'loop'},id=>rows[id]),{code:'invalid_tool_arguments'});
});

test('compacted retrieval references source evidence and its page coordinates',()=>{
 const messages=[{role:'user',content:'Task'},
 {role:'assistant',tool_calls:[{id:'page',function:{name:'tool_result_read',arguments:'{}'}}]},
 {role:'tool',tool_call_id:'page',content:JSON.stringify({ok:true,saved_result_ref:'page',result_ref:'source',tool:'documentation_query',offset:3000,next_offset:6000,content:'x'.repeat(9000)})},
 {role:'assistant',tool_calls:[{id:'other',function:{name:'system_time',arguments:'{}'}}]},
 {role:'tool',tool_call_id:'other',content:'{}'}];
 budgetContext(messages,[],{window_tokens:4096,output_tokens:1024});
 assert.match(messages[1].content,/"result_ref":"source"/);
 assert.match(messages[1].content,/"offset":3000/);
 assert.doesNotMatch(messages[1].content,/"result_ref":"page"/);
});
