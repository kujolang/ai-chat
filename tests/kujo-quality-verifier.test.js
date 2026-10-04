const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {verify}=require('../scripts/verify-kujo-quality');
function fixtures(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'kujo-oracle-test-'));for(const task of ['01','02','03']){fs.mkdirSync(path.join(root,task));fs.writeFileSync(path.join(root,task,'main.kujo'),'');}return root;}
test('independent verifier does not award completion to an always-failing program',()=>{
 const root=fixtures();try{const r=verify(root,'fixture',()=>({status:1,stdout:'',stderr:'invalid'}));assert.equal(r.checks,31);assert.ok(r.passed<r.checks);assert.equal(r.results.find(x=>x.name==='persist then restart').passed,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('crashes and spawn timeouts cannot masquerade as correctly rejected input',()=>{
 const root=fixtures();try{for(const result of [{status:null,signal:'SIGSEGV'}, {error:Error('timeout')}]){const r=verify(root,'fixture',()=>result);assert.equal(r.passed,0);}}finally{fs.rmSync(root,{recursive:true,force:true});}
});
