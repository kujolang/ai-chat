const {test}=require('node:test');const assert=require('node:assert/strict');
const {executeKujo}=require('../lib/kujo-development');
function fixture({version='kujo 1.5.0',duration=10}={}){
 let now=0,hash='abc';const calls=[];
 return {calls,setHash:v=>hash=v,deps:{now:()=>now,snapshot:()=>({path:'a.kujo',absolute_path:'/workspace/a.kujo',sha256:hash}),runCommand:async args=>{calls.push(args);now+=duration;return {exit_code:0,stdout:args.args[0]==='--version'?version:'3\n',stderr:'',duration_ms:duration,truncated:false};}}};
}
test('grounding follows detected runtime; unknown versions get no claimed verified example',async()=>{
 for(const version of ['kujo 1.5.0','kujo 1.7.0','kujo 9.0.0']){const f=fixture({version});const r=await executeKujo({root_id:'r',operation:'guide',topic:'arguments'},{},f.deps);assert.equal(Boolean(r.example),version!=='kujo 9.0.0');assert.equal(f.calls.length,1);}
});
test('structured operations preserve literal argv and identify checked source',async()=>{
 const f=fixture();const r=await executeKujo({root_id:'r',operation:'run',path:'a.kujo',args:['hello world','$HOME']},{},f.deps);
 assert.deepEqual(f.calls[1].args,['run','/workspace/a.kujo','--','hello world','$HOME']);assert.equal(r.source.sha256,'abc');assert.equal(r.source_unchanged,true);
});
test('benchmark calibration reserves budget, uses requested trials and computes median',async()=>{
 const f=fixture({duration:1000});const r=await executeKujo({root_id:'r',operation:'benchmark',path:'a.kujo',pure:true,budget_ms:20000,trials:3},{},f.deps);
 assert.equal(r.ok,true);assert.equal(r.trials.length,3);assert.equal(r.median_wall_ms,1000);assert.equal(f.calls.length,5);
 const small=fixture({duration:2000});const denied=await executeKujo({root_id:'r',operation:'benchmark',pure:true,budget_ms:7000,trials:3},{},small.deps);assert.equal(denied.ok,false);assert.equal(denied.trials.length,0);assert.ok(small.calls.length<=2);
});
test('benchmark is opt-in; no automatic retry after failed execution',async()=>{
 const f=fixture();await assert.rejects(executeKujo({operation:'benchmark',budget_ms:5000},{},f.deps),/pure=true/);assert.equal(f.calls.length,0);
 const original=f.deps.runCommand;f.deps.runCommand=async a=>{const r=await original(a);return {...r,exit_code:a.args[0]==='--version'?0:1};};
 const r=await executeKujo({operation:'benchmark',pure:true,budget_ms:20000},{},f.deps);assert.equal(r.ok,false);assert.equal(f.calls.length,2);
});
test('changed or removed source cannot produce a successful verification',async()=>{
 const f=fixture();const original=f.deps.runCommand;f.deps.runCommand=async a=>{const r=await original(a);if(a.args[0]==='check')f.setHash('changed');return r;};
 const r=await executeKujo({operation:'check'},{},f.deps);assert.equal(r.ok,false);assert.equal(r.source_unchanged,false);
});
test('external deadline prevents commands even with a larger benchmark budget',async()=>{
 const f=fixture();await assert.rejects(executeKujo({operation:'check'},{task_deadline_ms:500},f.deps),/budget exhausted/);assert.equal(f.calls.length,0);
});
test('a stopped script timeout remains a known failed composite receipt without replay',async()=>{
 const f=fixture();const original=f.deps.runCommand;
 f.deps.runCommand=async a=>{if(a.args[0]!=='--version')throw Object.assign(Error('stopped'),{code:'local_shell_timeout',execution_completed:true,execution_result:{stdout:'partial',duration_ms:1000}});return original(a);};
 const r=await executeKujo({operation:'benchmark',pure:true,budget_ms:20000},{},f.deps);
 assert.equal(r.ok,false);assert.equal(r.calibration.error.code,'local_shell_timeout');assert.equal(r.calibration.stdout,'partial');assert.deepEqual(r.trials,[]);
});
