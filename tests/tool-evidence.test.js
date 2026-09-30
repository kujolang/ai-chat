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
