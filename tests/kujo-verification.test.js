const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateCases, assessCase, verifyCases } = require('../lib/kujo-verification');
const { executeKujo } = require('../lib/kujo-development');
const cases = [
 { id: 'normal', args: ['[]'], exit_code: 0, stdout_json: '[]' },
 { id: 'rejection', args: ['broken'], exit_code: 1, stderr_error: true }
];
test('batch assertions distinguish expected rejection, real failure, timeout and truncation', () => {
 assert.equal(assessCase(cases[1], { exit_code: 1, stdout: '', stderr: '{"error":"invalid"}\n' }).passed, true);
 for (const result of [
  { exit_code: 1, stderr: 'crashed' }, { exit_code: 0, stdout: '[]' },
  { exit_code: 1, stderr: '{"error":"invalid"}', error: { code: 'timeout' } },
  { exit_code: 1, stderr: '{"error":"invalid"}', truncated: true },
  { exit_code: 1, stderr: '{"error":"invalid","extra":1}' }
 ]) assert.equal(assessCase(cases[1], result).passed, false);
 assert.equal(assessCase({ ...cases[0], max_duration_ms: 20 }, { exit_code: 0, stdout: '[]', duration_ms: 21 }).passed, false);
 assert.equal(assessCase({ ...cases[0], stdout_json: '{"a":1,"b":2}' }, { exit_code: 0, stdout: '{"b":2,"a":1}' }).passed, true);
 assert.equal(assessCase(cases[0], { exit_code: 0, stdout: '[]', stderr: 'unexpected warning' }).passed, false);
});
test('all input assertions validate before any script can execute', async () => {
 for (const rows of [[], Array(33).fill(cases[0]), [cases[0], cases[0]], [{...cases[0],stdout_json:'bad'}], [{...cases[0],stdout:'also'}], [{...cases[0],args:['a\0b']}], [{...cases[0],exit_code:null}], [{id:'none',args:[],exit_code:0}]]) assert.throws(() => validateCases(rows), e => e.execution_started === false);
 let invoked = 0;
 await assert.rejects(executeKujo({operation:'verify',cases:[cases[0],{...cases[1],exit_code:-1}]},{},{snapshot:()=>assert.fail(),runCommand:()=>{invoked++;}}));
 assert.equal(invoked,0);
});
test('one batch probes runtime once and preserves literal argv, final-source hashes and recoverable case evidence', async () => {
 const calls = [], saved = [];
 const result = await executeKujo({ operation:'verify', path:'main.kujo', cases }, { saveVerificationCase: async (i, detail) => { saved.push(detail); return `batch:case:${i+1}`; } }, {
  snapshot: () => ({ path:'main.kujo', absolute_path:'/root/main.kujo', sha256:'hash' }),
  runCommand: async a => { calls.push(a.args); return a.args[0] === '--version' ? {exit_code:0,stdout:'kujo 1.7.0'} : a.args.at(-1) === 'broken' ? {exit_code:1,stdout:'',stderr:'{"error":"invalid"}',duration_ms:2} : {exit_code:0,stdout:'[]\n',stderr:'',duration_ms:1}; }
 });
 assert.equal(calls.length,3); assert.deepEqual(calls[1],['run','/root/main.kujo','--','[]']);
 assert.equal(result.ok,true); assert.equal(result.exit_code,0); assert.equal(result.verification.passed,2);
 assert.equal(result.source_unchanged,true); assert.equal(result.case_evidence,undefined);
 assert.equal(saved[1].execution.exit_code,1); assert.equal(result.verification.cases[1].result_ref,'batch:case:2');
});
test('incomplete execution, source changes, aborts and uncertain termination never trigger automatic replay', async () => {
 let count=0;
 const result=await verifyCases(validateCases(cases), {unchanged:()=>true,execute:async()=>{count++;return {exit_code:null,error:{code:'timeout'}};}});
 assert.equal(count,1);assert.equal(result.ok,false);assert.equal(result.verification.executed,1);
 assert.equal(result.verification.stopped,'execution_incomplete');assert.ok(result.case_evidence);
 count=0;
 const changed=await verifyCases(cases,{unchanged:()=>count===0,execute:async()=>{count++;return {exit_code:0,stdout:'[]'};}});
 assert.equal(changed.verification.stopped,'source_changed_or_unavailable');assert.equal(count,1);
 const controller=new AbortController();controller.abort();
 await assert.rejects(verifyCases(cases,{signal:controller.signal,unchanged:()=>true,execute:()=>assert.fail()}), /abort/i);
 await assert.rejects(verifyCases(cases,{unchanged:()=>true,execute:async()=>{throw Object.assign(Error('uncertain'),{execution_completed:false});}}),/uncertain/);
});
test('a mismatched assertion runs remaining explicit cases but cannot certify the batch', async () => {
 let count=0;const r=await verifyCases(cases,{unchanged:()=>true,execute:async()=>{count++;return {exit_code:0,stdout:'[]'};}});
 assert.equal(count,2);assert.equal(r.ok,false);assert.equal(r.verification.passed,1);assert.equal(r.verification.failed,1);
});
test('maximum batch emits bounded summaries and validates arguments at the shell boundary before execution', async()=>{
 const rows=Array.from({length:32},(_,i)=>({id:`case-${i}`,args:['[]'],exit_code:0,stdout_json:'[]'}));
 const r=await verifyCases(rows,{unchanged:()=>true,saveCase:async i=>'ref:'+i,execute:async()=>({exit_code:0,stdout:'[]\n',stderr:'',duration_ms:1})});
 assert.equal(r.verification.passed,32);assert.ok(Buffer.byteLength(JSON.stringify(r))<8192);
 assert.equal(r.case_evidence,undefined);
 assert.throws(()=>validateCases([{...rows[0],args:['x'.repeat(1001)]}]),e=>e.execution_started===false);
});
