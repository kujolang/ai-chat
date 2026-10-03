const { test } = require('node:test');
const assert = require('node:assert/strict');
const { receiptPrefix, legacyReceiptPrefix, parseReceipts, coalesceRecoveredFacts } = require('../lib/receipt-context');
const { budgetContext } = require('../lib/context-budget');

const envelope = (rows, prefix = receiptPrefix) => ({role:'assistant',content:prefix+JSON.stringify(rows)});
const recovered = (id, result, overrides={}) => ({call_id:id,tool:'tool_result_read',returned_ok:true,result_ref:'command',source_tool:'local_shell',offset:0,next_offset:null,outcome:{ok:true,result_ref:'command',tool:'local_shell',offset:0,next_offset:null,content:JSON.stringify(result)},...overrides});

test('legacy checkpoints migrate without claiming retained facts are absent', () => {
 const rows=[{call_id:'action',tool:'local_shell',result_ref:'command',outcome:{exit_code:0,stdout:'168\n'}}];
 const messages=[{role:'user',content:'Task'},envelope(rows,legacyReceiptPrefix)];
 budgetContext(messages,[],{window_tokens:8192,output_tokens:1000});
 assert.deepEqual(parseReceipts(messages[1]),rows);
 assert.doesNotMatch(messages[1].content,/output omitted/);
 assert.match(messages[1].content,/untrusted evidence/);
});

test('recovered command facts reattach to their original action across receipt groups', () => {
 const result={command:'go',args:['test'],exit_code:0,stdout:'PASS\n'};
 const original={call_id:'action',tool:'local_shell',result_ref:'command'};
 const messages=[envelope([original]),{role:'user',content:'Continue'},envelope(Array.from({length:30},(_,i)=>recovered(`read-${i}`,result)))];
 assert.equal(coalesceRecoveredFacts(messages),30);
 const retained=parseReceipts(messages[0]);
 assert.equal(retained.length,1);assert.equal(retained[0].call_id,'action');
 assert.deepEqual(retained[0].outcome,result);
 assert.deepEqual(retained[0].read_call_ids,Array.from({length:30},(_,i)=>`read-${i}`));
 assert.equal(messages.length,2);assert.equal(coalesceRecoveredFacts(messages),0);
});

test('partial, erroneous, mismatched and ambiguous evidence cannot rewrite action facts', () => {
 const source={call_id:'action',tool:'local_shell',result_ref:'command'};
 const invalid=[recovered('partial',{exit_code:0},{next_offset:100}),recovered('failed',{exit_code:0},{returned_ok:false}),recovered('wrong-tool',{exit_code:0},{source_tool:'local_file_write'}),recovered('wrong-reference',{exit_code:0},{result_ref:'other'})];
 const messages=[envelope([source,...invalid])];
 assert.equal(coalesceRecoveredFacts(messages),0);assert.deepEqual(parseReceipts(messages[0]),[source,...invalid]);
 const ambiguous=[envelope([source,{...source,call_id:'different'},recovered('read',{exit_code:0})])];
 assert.equal(coalesceRecoveredFacts(ambiguous),0);
});

test('obsolete standalone reasoning gives way before command evidence, while current protocol stays intact', () => {
 const facts={command:'go',exit_code:0,stdout:'proof '.repeat(180)};
 const page=JSON.stringify({ok:true,content:'fresh evidence',offset:0,next_offset:null});
 const messages=[{role:'user',content:'Complete this task'},envelope([{call_id:'command',tool:'local_shell',result_ref:'command',outcome:facts}]),
  {role:'assistant',content:'',thinking:'obsolete deliberation '.repeat(700)},
  {role:'user',content:'Continue'},
  {role:'assistant',content:'',thinking:'current',tool_calls:[{id:'read',function:{name:'tool_result_read',arguments:'{}'}}]},
  {role:'tool',tool_call_id:'read',content:page}];
 const report=budgetContext(messages,[],{window_tokens:8192,output_tokens:2048});
 assert.equal(report.removed_messages,1);assert.deepEqual(parseReceipts(messages[1])[0].outcome,facts);
 assert.equal(messages.at(-2).thinking,'current');assert.equal(messages.at(-1).content,page);
 assert.ok(report.after_upper_bound<=6144);
});

test('native compacted receipts use durable identities rather than reused per-round indices', () => {
 const messages=[{role:'user',content:'Task'}];
 for(let i=0;i<2;i++)messages.push({role:'assistant',content:'',thinking:'old '.repeat(2000),tool_calls:[{function:{index:0,name:'local_shell',arguments:{command:'go',args:['version']}}}]},{role:'tool',tool_name:'local_shell',content:JSON.stringify({saved_result_ref:`call-${i}`,exit_code:0,stdout:'go version'})});
 budgetContext(messages,[],{window_tokens:8192,output_tokens:2048});
 const rows=messages.flatMap(m=>parseReceipts(m)||[]);
 assert.deepEqual(rows.map(r=>r.call_id),['call-0','call-1']);
});

test('identical historical live file snapshots fold across groups without suppressing reads or losing identities', () => {
 const {fileReadFingerprint,coalesceFileReads}=require('../lib/receipt-context');
 const args={path:'program.go',offset:0};
 const result={path:'program.go',content:'package main',meta:{mtime_ms:12},saved_result_ref:'first'};
 const fingerprint=fileReadFingerprint('local_file_read',result,args);
 assert.equal(fileReadFingerprint('local_file_read',{...result,saved_result_ref:'other',unchanged:true,deduplicated:true,meta:{mtime_ms:12,deduplicated:true,cache:'bounded_reread'}},args),fingerprint);
 assert.notEqual(fileReadFingerprint('local_file_read',{...result,content:'changed'},args),fingerprint);
 assert.notEqual(fileReadFingerprint('local_file_read',result,{...args,offset:1}),fingerprint);
 assert.equal(fileReadFingerprint('local_shell',result,args),null);
 assert.equal(fileReadFingerprint('local_file_read',{...result,error:{code:'failure'}},args),null);
 const rows=Array.from({length:70},(_,i)=>({tool:'local_file_read',call_id:`read-${i}`,result_ref:`read-${i}`,read_fingerprint:fingerprint,outcome:result}));
 const messages=rows.map(row=>envelope([row]));
 assert.equal(coalesceFileReads(messages),69);
 assert.equal(messages.length,1);
 assert.deepEqual(parseReceipts(messages[0])[0].read_call_ids,rows.map(r=>r.call_id));
 assert.deepEqual(parseReceipts(messages[0])[0].outcome,result);
 assert.equal(coalesceFileReads(messages),0);
});

test('historical read excerpts give way before recent execution results under pressure', () => {
 const rows=[{tool:'local_file_read',call_id:'docs',result_ref:'docs',outcome:{content:'old docs '.repeat(200)}},
  {tool:'local_shell',call_id:'check',result_ref:'check',outcome:{command:'kujo',exit_code:4,stderr:'range exceeds maximum generated sequence length'}}];
 const messages=[{role:'user',content:'Complete the task'},envelope(rows)];
 budgetContext(messages,[],{window_tokens:3200,output_tokens:1024});
 const kept=parseReceipts(messages[1]);
 assert.equal(kept[0].outcome,undefined);
 assert.deepEqual(kept[1].outcome,rows[1].outcome);
});
