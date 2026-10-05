const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {verify}=require('../scripts/verify-engineering-failure-edges');
const reference=path.join(__dirname,'fixtures/engineering/store.cjs');
test('supplemental oracle accepts original error propagation and retried close cleanup',()=>{
 const r=verify(reference);assert.equal(r.completed,true);assert.equal(r.serialization.passed,true);assert.equal(r.close_failure.passed,true);
});
test('supplemental oracle rejects swallowed errors and unsettled promises',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'engineering-edge-control-'));const file=path.join(root,'store.cjs');
 try{fs.writeFileSync(file,'exports.save=async()=>{};');const r=verify(file);assert.equal(r.completed,true);assert.equal(r.serialization.passed,false);assert.equal(r.close_failure.passed,false);
 fs.writeFileSync(file,'exports.save=()=>new Promise(()=>{});');assert.equal(verify(file).completed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
