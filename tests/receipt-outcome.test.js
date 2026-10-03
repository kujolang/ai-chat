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
 const prefix='Completed tool-call receipts; output omitted to fit context. These calls already ran; do not repeat consequential work. Recover missing evidence using tool_result_read with result_ref. ';
 const records=Array.from({length:8},(_,i)=>({call_id:`write-${i}`,tool:'local_file_write',result_ref:`write-${i}`,outcome:{content:'evidence'.repeat(300)}}));
 const messages=[{role:'system',content:'Never replay a write'}, {role:'user',content:'Continue'}, {role:'assistant',content:prefix+JSON.stringify(records)}];
 const report=budgetContext(messages,[],{window_tokens:4096,output_tokens:1024});
 assert.ok(report.after_upper_bound<=3072);
 const remaining=JSON.parse(messages[2].content.slice(prefix.length));
 assert.deepEqual(remaining.map(r=>r.call_id),records.map(r=>r.call_id));
 assert.deepEqual(remaining.map(r=>r.result_ref),records.map(r=>r.result_ref));
 assert.equal(messages[0].content,'Never replay a write');
});
