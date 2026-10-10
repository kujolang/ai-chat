const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {tasks,cases,suite}=require('../lib/kujo-script-benchmark');
const {assess,extract}=require('../scripts/verify-kujo-scripts');
test('ten script prompts match the frozen suite and include rejection cases',()=>{
 assert.equal(tasks.length,10);
 assert.equal(new Set(tasks.map(t=>t.id)).size,10);
 assert.equal(fs.readFileSync(path.join(__dirname,'../benchmarks/kujo-scripts.md'),'utf8'),suite());
 for(const task of tasks){assert.ok(cases(task).some(r=>r.invalid));assert.ok(cases(task).some(r=>!r.invalid));}
});
test('oracles distinguish order, touching endpoints, prefixes and intermediate ledger rejection',()=>{
 const t=Object.fromEntries(tasks.map(t=>[t.id,t]));
 assert.deepEqual(t.unique.oracle([2,1,2]),[2,1]);
 assert.deepEqual(t.rle.oracle([2,1,2]),[[2,1],[1,1],[2,1]]);
 assert.deepEqual(t.intervals.oracle([[3,4],[1,2],[2,2]]),[[1,2],[3,4]]);
 assert.deepEqual(t.balance.oracle(')('),{balanced:false,max_depth:0});
 assert.equal(t.ledger.valid({initial:0,deltas:[-1,1]}),false);
 assert.equal(t.dot.valid({left:[true],right:[1]}),false);
 assert.equal(t.rotate.valid({values:[],steps:1,extra:true}),false);
});
test('grading rejects crashes, wrong JSON, extra output and malformed error contracts',()=>{
 const ok={status:0,stdout:'[1,2]',stderr:''};
 assess({expected:[1,2]},ok);
 assert.throws(()=>assess({expected:[2,1]},ok));
 assert.throws(()=>assess({expected:[1,2]},{...ok,signal:'SIGKILL'}));
 assert.throws(()=>assess({expected:[1,2]},{...ok,stdout:'debug\n[1,2]'}));
 assess({invalid:true},{status:1,stdout:'',stderr:'{"error":"bad"}'});
 assert.throws(()=>assess({invalid:true},{status:1,stdout:'',stderr:'{"error":""}'}));
 assert.throws(()=>assess({invalid:true},{status:1,stdout:'',stderr:'{"error":"bad","extra":1}'}));
 assert.equal(extract('```kujo\nprint(1)\n```'),'print(1)\n');
 assert.throws(()=>extract('No script'));
 assert.throws(()=>extract('```kujo\nx\n```\n```kujo\ny\n```'));
});
