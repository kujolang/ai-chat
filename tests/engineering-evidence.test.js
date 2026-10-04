const {test}=require('node:test');const assert=require('node:assert/strict');
const {verificationInventory}=require('../lib/engineering-evidence');
const receipt=(id,name,input,result={exit_code:0})=>({call_id:id,tool_name:name,input,result,status:'completed'});
test('inventory identifies code changed after tests without treating docs as stale source',()=>{
 const rows=[receipt('w','local_file_write',{root_id:'r',path:'a.go'}),receipt('t','local_shell',{command:'go',args:['test','./...']}),receipt('d','local_file_write',{root_id:'r',path:'README.md'})];
 assert.deepEqual(verificationInventory(rows).writes_after_last_successful_check,[]);
 rows.push(receipt('w2','local_file_write',{root_id:'r',path:'a.go'}));
 assert.deepEqual(verificationInventory(rows).writes_after_last_successful_check,['a.go']);
 rows.push(receipt('f','local_shell',{command:'go',args:['test','./...']},{exit_code:1}));
 assert.deepEqual(verificationInventory(rows).writes_after_last_successful_check,['a.go']);
 rows.push(receipt('t2','local_shell',{command:'go',args:['test','./...']}));
 assert.deepEqual(verificationInventory(rows).writes_after_last_successful_check,[]);
});
test('inventory retains versioned Kujo check evidence and does not claim coverage',()=>{
 const r=verificationInventory([receipt('k','local_kujo',{operation:'check'},{exit_code:0,source:{path:'x.kujo',sha256:'abc'}})]);
 assert.equal(r.checks[0].source.sha256,'abc');assert.match(r.limitation,/coverage/);
});

test('declared script checks resolve freshness without treating reads or failures as verification',()=>{
 const write=receipt('w','local_file_write',{path:'server.js'});
 const harness=receipt('h','local_shell',{command:'node',args:['test.js']},{exit_code:0,stdout:'x'.repeat(10000)+'passed=148 failed=0'});
 assert.deepEqual(verificationInventory([write,harness]).writes_after_last_successful_check,['server.js']);
 const linked=verificationInventory([write,harness],['h']);assert.deepEqual(linked.writes_after_last_successful_check,[]);assert.equal(linked.checks[0].evidence_kind,'contract_linked_execution');assert.equal(linked.checks[0].stdout_tail.length,500);assert.match(linked.checks[0].stdout_tail,/passed=148 failed=0$/);
 assert.deepEqual(verificationInventory([harness,write],['h']).writes_after_last_successful_check,['server.js']);
 assert.deepEqual(verificationInventory([write,{...harness,result:{exit_code:1}}],['h']).writes_after_last_successful_check,['server.js']);
 assert.deepEqual(verificationInventory([write,{...harness,tool_name:'local_file_read'}],['h']).writes_after_last_successful_check,['server.js']);
});
