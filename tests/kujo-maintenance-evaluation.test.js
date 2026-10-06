const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {verify,cases}=require('../scripts/verify-kujo-maintenance');
const {snapshot}=require('../scripts/run-kujo-maintenance-evaluation');
const binary=process.env.KUJO_REFERENCE_BIN;
test('development and holdout cases are distinct and the six specifications have matching cases',()=>{
 const tasks=require('../benchmarks/kujo-maintenance-tasks.json');assert.equal(tasks.length,6);
 for(const t of tasks){const c=cases[t.id];assert.ok(c.development.length&&c.holdout.length);const seen=new Set(c.development.map(v=>JSON.stringify(v.input)));assert.ok(c.holdout.every(v=>!seen.has(JSON.stringify(v.input))));}
});
test('maintenance snapshot rejects symlinks and preserves exact candidate bytes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintenance-snapshot-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const root=path.join(dir,'source');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'main.kujo'),'print(1)');
 const s=snapshot(root,path.join(dir,'copy'));assert.equal(s.files,1);assert.equal(fs.readFileSync(path.join(dir,'copy/main.kujo'),'utf8'),'print(1)');
 fs.symlinkSync(path.join(dir,'copy/main.kujo'),path.join(root,'external'));assert.throws(()=>snapshot(root,path.join(dir,'bad')),/symlinks/);
});
test('controller fails closed on absent source and expired verification budget',()=>{
 const r=verify('/nonexistent/maintenance.kujo',1,'development','missing');assert.equal(r.completed,false);
 const r2=verify(path.resolve('tests/fixtures/kujo-maintenance/01.kujo'),1,'development','missing',{deadline:0});assert.equal(r2.completed,false);assert.equal(r2.checks,0);
});
test('qualified Kujo controls pass both sets; defective legacy seeds fail development checks',{skip:!binary},()=>{
 for(let id=1;id<=6;id++){
  for(const phase of ['development','holdout']){const r=verify(path.resolve('tests/fixtures/kujo-maintenance',String(id).padStart(2,'0')+'.kujo'),id,phase,binary);assert.equal(r.completed,true);assert.equal(r.failures.length,0,JSON.stringify({id,phase,failures:r.failures}));}
  const r=verify(path.resolve('benchmarks/fixtures/kujo-maintenance',String(id).padStart(2,'0')+'.kujo'),id,'development',binary);assert.ok(r.failures.length,`seed ${id} must fail`);
 }
});
