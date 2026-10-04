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
