const {test} = require('node:test');
const assert = require('node:assert/strict');
const {receiptOutcome} = require('../lib/receipt-outcome');
const {budgetContext} = require('../lib/context-budget');

test('small runtime and command evidence survives context compaction exactly', () => {
 const result={command:'go',args:['version'],cwd:'.',exit_code:0,stdout:'go version go1.25.3 darwin/amd64\n',stderr:'',saved_result_ref:'version'};
 const messages=[{role:'user',content:'Build a program'},
 {role:'assistant',content:'Planning '.repeat(3000),tool_calls:[{id:'version',function:{name:'local_shell',arguments:JSON.stringify({root_id:'workspace_0',command:'go',args:['version']})}}]},
 {role:'tool',tool_call_id:'version',content:JSON.stringify(result)}];
 budgetContext(messages,[],{window_tokens:4096,output_tokens:1024});
 assert.match(messages[1].content,/go1.25.3/);
 assert.match(messages[1].content,/"exit_code":0/);
 assert.match(messages[1].content,/"result_ref":"version"/);
 assert.match(messages[1].content,/"input":\{"root_id":"workspace_0","command":"go","args":\["version"\]\}/);
});
test('large reads preserve an identified bounded excerpt and pagination without claiming completeness', () => {
 const result={path:'docs/language.md',content:'😀 syntax '.repeat(5000),next_offset:100,next_column:2,truncated:true};
 const receipt=receiptOutcome(result,{path:result.path,offset:0});
 assert.equal(receipt.outcome.excerpt,true);
 assert.equal(receipt.outcome.content.omitted,true);
 assert.equal(receipt.outcome.next_offset,100);
 assert.equal(receipt.outcome.next_column,2);
 assert.ok(Buffer.byteLength(JSON.stringify(receipt))<3200);
 assert.equal(receipt.input.path,result.path);
});
test('receipt inputs do not duplicate write payloads, and malformed result arrays remain bounded', () => {
 const r=receiptOutcome({ok:true,path:'main.go'},JSON.stringify({path:'main.go',content:'secret'.repeat(10000)}));
 assert.deepEqual(r.input,{path:'main.go'});
 const large=receiptOutcome({entries:[null,...Array.from({length:100},()=>({name:'x'.repeat(10000)}))],citations:[null]},{});
 assert.ok(Buffer.byteLength(JSON.stringify(large))<3200);
 assert.equal(large.outcome.omitted,true);
});

test('tight budgets discard optional excerpts before losing protected execution identities', () => {
 const {receiptPrefix:prefix}=require('../lib/receipt-context');
 const records=Array.from({length:8},(_,i)=>({call_id:`write-${i}`,tool:'local_file_write',result_ref:`write-${i}`,outcome:{content:'evidence'.repeat(300)}}));
 const messages=[{role:'system',content:'Never replay a write'}, {role:'user',content:'Continue'}, {role:'assistant',content:prefix+JSON.stringify(records)}];
 const report=budgetContext(messages,[],{window_tokens:4096,output_tokens:1024});
 assert.ok(report.after_upper_bound<=3072);
 const remaining=JSON.parse(messages[2].content.slice(prefix.length));
 assert.deepEqual(remaining.map(r=>r.call_id),records.map(r=>r.call_id));
 assert.deepEqual(remaining.map(r=>r.result_ref),records.map(r=>r.result_ref));
 assert.equal(messages[0].content,'Never replay a write');
});

test('identical immutable evidence pages share outcomes but keep every read ID; actions and distinct pages stay separate', () => {
 const {receiptPrefix:prefix}=require('../lib/receipt-context');
 const page={tool:'tool_result_read',returned_ok:true,result_ref:'source',source_tool:'local_shell',offset:0,next_offset:100,outcome:{stdout:'result'}};
 const receipts=[{...page,call_id:'a'},{call_id:'write',tool:'local_file_write',returned_ok:true,result_ref:'write'}, {...page,call_id:'b'}, {...page,call_id:'other-page',offset:100,next_offset:null}, {...page,call_id:'failed',returned_ok:false}, {...page,call_id:'different-source',result_ref:'other'}, {call_id:'shell',tool:'local_shell',result_ref:'source'}];
 const messages=[{role:'user',content:'Task'},{role:'assistant',content:prefix+JSON.stringify(receipts)}];
 budgetContext(messages,[],{window_tokens:10000,output_tokens:1000});
 const compacted=JSON.parse(messages[1].content.slice(prefix.length));
 assert.equal(compacted.length,6);
 assert.deepEqual(compacted[0].read_call_ids,['a','b']);
 assert.deepEqual(compacted[0].outcome,page.outcome);
 assert.deepEqual(compacted.slice(1).map(r=>r.call_id),['write','other-page','failed','different-source','shell']);
 budgetContext(messages,[],{window_tokens:10000,output_tokens:1000});
 assert.deepEqual(JSON.parse(messages[1].content.slice(prefix.length)),compacted);
});

test('long command excerpts preserve the real final test summary within the same bound', () => {
 const result={exit_code:1,stdout:'test started\n'+'verbose 😀 '.repeat(4000)+'\nFAIL: 1 regression\n',stderr:''};
 const receipt=receiptOutcome(result);
 assert.equal(receipt.outcome.exit_code,1);
 assert.match(receipt.outcome.stdout.head,/test started/);
 assert.match(receipt.outcome.stdout.tail,/FAIL: 1 regression\n$/);
 assert.equal(receipt.outcome.stdout.omitted,true);
 assert.ok(Buffer.byteLength(JSON.stringify(receipt.outcome.stdout))<=400);
});
