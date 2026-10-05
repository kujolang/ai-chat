const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare}=require('../scripts/prepare-engineering-evaluation');
const {verify}=require('../scripts/verify-engineering-evaluation');
function fixture(fn){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'engineering-control-'));const root=path.join(temp,'run');prepare(root);for(const [task,file] of [[1,'config.cjs'],[3,'store.cjs'],[4,'runner.cjs'],[5,'counter.cjs'],[6,'cleanup.cjs']])fs.copyFileSync(path.join(__dirname,'fixtures/engineering',file),path.join(root,String(task).padStart(2,'0'),file));fs.writeFileSync(path.join(root,'06/DECISIONS.md'),'Preview only: exact structural equality; same ID is not enough.');try{return fn(root);}finally{fs.rmSync(temp,{recursive:true,force:true});}}
test('engineering oracle accepts real-process reference behavior',()=>fixture(root=>{const r=verify(root,'unused',[1,3,4,5,6]);assert.equal(r.passed,r.checks,JSON.stringify(r.results.filter(x=>!x.passed)));}));
test('engineering oracle rejects original compatibility and concurrency defects',()=>fixture(root=>{for(const [task,file]of [[1,'config.cjs'],[5,'counter.cjs']])fs.copyFileSync(path.join(__dirname,'../benchmarks/fixtures/engineering',file),path.join(root,String(task).padStart(2,'0'),file));const r=verify(root,'unused',[1,5]);assert.ok(r.results.some(x=>x.task===1&&!x.passed));assert.ok(r.results.some(x=>x.name==='overlap'&&!x.passed));}));
test('engineering oracle detects destructive cleanup and swallowed persistence failure',()=>fixture(root=>{fs.writeFileSync(path.join(root,'06/cleanup.cjs'),"require('fs').writeFileSync(process.argv[2],'[]');console.log('{\"duplicates\":[]}')");fs.writeFileSync(path.join(root,'03/store.cjs'),'exports.save=async()=>{}');const r=verify(root,'unused',[3,6]);assert.ok(r.results.some(x=>x.name==='rename-failure'&&!x.passed));assert.ok(r.results.some(x=>x.name==='preview'&&!x.passed));}));
test('engineering setup rejects reuse and only treatment adds decision guidance',()=>fixture(root=>{assert.throws(()=>prepare(root),/fresh/);const base=fs.readFileSync(path.join(root,'suite.md'),'utf8');const next=root+'-treatment';try{prepare(next,{guidance:true});assert.ok(!base.includes('Separate a rejected operation'));assert.ok(fs.readFileSync(path.join(next,'suite.md'),'utf8').includes('Separate a rejected operation'));}finally{fs.rmSync(next,{recursive:true,force:true});}}));

test('unresolved promises and early exit zero are not completed assertions',()=>fixture(root=>{
 for(const source of ['exports.save=()=>new Promise(()=>{});','exports.save=()=>process.exit(0);']){
  fs.writeFileSync(path.join(root,'03/store.cjs'),source);
  const r=verify(root,'unused',[3]);
  assert.equal(r.passed,0);
  assert.ok(r.results.every(x=>x.error.includes('Missing assertion-completion receipt')));
 }
}));

test('cleanup error objects may carry diagnostic fields while Kujo keeps its exact shape',()=>fixture(root=>{
 const file=path.join(root,'06/cleanup.cjs');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('JSON.stringify({error:e.message})','JSON.stringify({error:e.message,code:"invalid"})'));
 const r=verify(root,'unused',[6]);assert.equal(r.passed,r.checks,JSON.stringify(r.results.filter(x=>!x.passed)));
}));
