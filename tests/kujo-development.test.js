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

test('guide discloses known default-VM defect without claiming general runtime qualification',async()=>{
 const f=fixture();const r=await executeKujo({operation:'guide'},{},f.deps);
 assert.equal(r.runtime.warnings.length,1);assert.match(r.runtime.warnings[0],/Never automatically replay/);
 const old=f.deps.runCommand;f.deps.runCommand=async a=>({...await old(a),kujo_runtime:{backend:'interpreter'}});
 const interpreter=await executeKujo({operation:'guide'},{},f.deps);assert.deepEqual(interpreter.runtime.warnings,[]);
});

test('declared dependency changes invalidate verification even when entry file is unchanged', async () => {
 const f = fixture(); let changed = false;
 f.deps.snapshot = a => ({ path: a.path, absolute_path: '/workspace/' + a.path, sha256: a.path === 'dep.json' && changed ? 'new' : 'old' });
 const run = f.deps.runCommand;
 f.deps.runCommand = async a => { const r = await run(a); if (a.args[0] === 'run') changed = true; return r; };
 const r = await executeKujo({ operation: 'run', path: 'a.kujo', verification_paths: ['dep.json'] }, {}, f.deps);
 assert.equal(r.ok, false); assert.equal(r.source_unchanged, false);
 assert.deepEqual(r.verification_manifest.map(s => s.path), ['a.kujo', 'dep.json']);
 assert.equal(r.verification_manifest_after[1].sha256, 'new');
});
test('invalid or unreadable verification paths fail before executing any commands', async () => {
 for (const verification_paths of [['x', 'x'], [''], Array(17).fill('x'), [null], ['a\0b']]) {
  const f = fixture(); await assert.rejects(executeKujo({ operation: 'run', verification_paths }, {}, f.deps)); assert.equal(f.calls.length, 0);
 }
 const f = fixture(); f.deps.snapshot = a => { if (a.path === 'missing') throw Error('not readable'); return { path: a.path, sha256: 'old' }; };
 await assert.rejects(executeKujo({ operation: 'run', path: 'a.kujo', verification_paths: ['missing'] }, {}, f.deps), e => e.execution_started === false);
 assert.equal(f.calls.length, 0);
});
test('individual examples cannot inherit verification from an unsupported runtime version', async () => {
 const f = fixture({ version: 'kujo 1.5.0' });
 const r = await executeKujo({ operation: 'guide', topic: 'validation' }, {}, f.deps);
 assert.equal(r.example, null); assert.equal(r.runtime.reference_verified, false);
 assert.deepEqual(r.tested_versions, ['1.7.0']);
});
test('a fully successful benchmark is usable as executable contract evidence', async () => {
 const f = fixture(); const input = { operation: 'benchmark', path: 'a.kujo', pure: true, budget_ms: 20000, trials: 1 };
 const result = await executeKujo(input, {}, f.deps);
 const { applyContract } = require('../lib/engineering-contract'); const state = {};
 applyContract(state, { action: 'plan', invariants: [{ id: 'repeat', invariant: 'Pure script runs successfully', check: 'Execute bounded trial' }] }, []);
 const receipt = { call_id: 'trial', tool_name: 'local_kujo', status: 'completed', input, result };
 assert.equal(applyContract(state, { action: 'evidence', evidence: [{ id: 'repeat', result_ref: 'trial' }] }, [receipt]).complete, true);
});
test('removed dependency after calibration stops benchmark without an uncertain thrown execution', async () => {
 const f = fixture(); let removed = false; const run = f.deps.runCommand;
 f.deps.snapshot = a => { if (a.path === 'dep.kujo' && removed) throw Error('missing'); return { path: a.path, absolute_path: '/workspace/a.kujo', sha256: 'old' }; };
 f.deps.runCommand = async a => { const r = await run(a); if (a.args[0] === 'run') removed = true; return r; };
 const r = await executeKujo({ operation: 'benchmark', path: 'a.kujo', verification_paths: ['dep.kujo'], pure: true, budget_ms: 20000 }, {}, f.deps);
 assert.equal(r.ok, false); assert.equal(r.source_unchanged, false); assert.equal(f.calls.length, 2);
});
test('1.7 guide discloses unsupported nested assignment and provides a verified replacement pattern', async () => {
 const f = fixture({ version: 'kujo 1.7.0' });
 const r = await executeKujo({ operation: 'guide', topic: 'nested_collections' }, {}, f.deps);
 assert.match(r.runtime.warnings[0], /Complex index assignment not yet supported/);
 assert.match(r.example, /rows\[0\] = \[row\[0\], 9\]/);
 assert.equal(r.expected_output, '[[1,9]]');
});

test('maintenance patterns stay unavailable on unqualified language versions',async()=>{
 for(const topic of ['presence','staged_validation','quoted_text']){
  const old=fixture({version:'kujo 1.5.0'});const r=await executeKujo({operation:'guide',topic},{},old.deps);assert.equal(r.example,null);
  const current=fixture({version:'kujo 1.7.0'});const supported=await executeKujo({operation:'guide',topic},{},current.deps);assert.ok(supported.example);assert.equal(supported.expected_exit_code,0);
 }
});

test('maintenance examples do not claim qualification on an untested interpreter backend',async()=>{
 const f=fixture({version:'kujo 1.7.0'}),run=f.deps.runCommand;
 f.deps.runCommand=async a=>({...await run(a),kujo_runtime:{backend:'interpreter'}});
 const r=await executeKujo({operation:'guide',topic:'presence'},{},f.deps);
 assert.equal(r.example,null);assert.equal(r.runtime.reference_verified,false);
});
