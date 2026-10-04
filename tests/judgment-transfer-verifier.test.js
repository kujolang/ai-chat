const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {spawnSync}=require('node:child_process');const {verify}=require('../scripts/verify-judgment-transfer');
async function fixture(mutation,runOverride){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-transfer-control-'));fs.mkdirSync(path.join(dir,'03'));
 fs.writeFileSync(path.join(dir,'03/server.js'),`process.env.JUDGMENT_MUTATION=${JSON.stringify(mutation)};\n`+fs.readFileSync(path.join(__dirname,'fixtures/judgment/entry-server.js'),'utf8'));
 try{return await verify(dir,'test-driver',runOverride||((_binary,args,options)=>spawnSync(process.execPath,[path.join(__dirname,'fixtures/judgment/cli-driver.js'),...args],{...options,env:{...process.env,JUDGMENT_MUTATION:mutation}})));}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('independent verifier accepts reference behavior across real processes',async()=>{const r=await fixture('');assert.equal(r.passed,r.checks,JSON.stringify(r.results.filter(x=>!x.passed)));assert.ok(r.checks>=35);});
test('independent verifier detects arithmetic and failed-write visible-state mutants',async()=>{
 const money=await fixture('money');assert.ok(money.results.some(r=>r.task===1&&!r.passed));
 const memory=await fixture('memory');assert.equal(memory.results.find(r=>r.name==='failed write preserves disk AND visible state').passed,false);
});
test('crashes and timeouts cannot count as valid rejected input',async()=>{for(const result of [{status:null,signal:'SIGTERM',stdout:'',stderr:''},{error:Error('timeout'),status:null,signal:null}]){const r=await fixture('',()=>result);assert.equal(r.results.filter(x=>x.task===1&&x.passed).length,0);}});
