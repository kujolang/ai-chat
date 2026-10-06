const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {validateConfig, makeHandoff, summarize, executionSettled, runComparison} = require('../lib/hybrid-benchmark');
const config = {builder:{profile:'local',model:'small'},frontier:{profile:'codex',model:'large'},task_ids:[1,2],stage_timeout_ms:60000,max_tokens:12000};
const checked = () => ({completed:true,checks:1,passed:1,failures:[]});
const run = (tokens = 100) => ({completed:true,usage_complete:true,usage:{total_tokens:tokens,input_tokens:tokens-10,output_tokens:10},tools:2,rounds:2,elapsed_ms:20});
const stage = tokens => ({run:run(tokens),development:checked(),holdout:checked()});

test('comparison requires explicit distinct lanes, bounded budgets and unique known tasks',() => {
 assert.equal(validateConfig(config),config);
 for (const patch of [{task_ids:[1,1]},{task_ids:[7]},{task_ids:[]},{max_tokens:999999},{stage_timeout_ms:0},{frontier:config.builder}]) assert.throws(() => validateConfig({...config,...patch}));
});

test('compact handoff excludes holdouts, reasoning and claimed model success',() => {
 const input = {source:{hashes:{'main.kujo':'a'.repeat(64)}},development:checked(),holdout:{secret:'HIDDEN_CASE'},run:{reasoning:'PRIVATE_THOUGHT',content:'UNVERIFIED_CLAIM'}};
 const handoff = makeHandoff(input);
 for (const text of ['HIDDEN_CASE','PRIVATE_THOUGHT','UNVERIFIED_CLAIM']) assert.ok(!handoff.includes(text));
 const many = {...input,source:{hashes:Object.fromEntries(Array.from({length:40},(_,i) => [i+'.kujo','a'.repeat(64)]))}};
 assert.equal(JSON.parse(makeHandoff(many)).omitted_files,10);
 assert.throws(() => makeHandoff({...input,development:{...checked(),failures:[{actual:'x'.repeat(25000)}]}}),/exceeds/);
});

test('savings use matched verified deliveries and require complete frontier accounting',() => {
 const good = {task:1,direct:stage(100),draft:stage(30),upgrade:stage(60)};
 const failed = {task:2,direct:stage(500),draft:stage(20),upgrade:stage(1)};
 failed.upgrade.run.completed=false;
 const s = summarize([good,failed]);
 assert.equal(s.frontier_hybrid.total_tokens,61);assert.equal(s.hybrid_total.total_tokens,111);
 assert.deepEqual(s.matched_verified_tasks,[1]);assert.equal(s.matched_frontier_token_reduction,0.4);
 good.upgrade.run.usage_complete=false;
 assert.equal(summarize([good]).matched_frontier_token_reduction,null);
 assert.equal(summarize([]).matched_frontier_token_reduction,null);
});

test('detached or uncertain executions cannot be snapshotted as settled work',() => {
 assert.equal(executionSettled({execution:{status:'running'},receipts:[]}),false);
 assert.equal(executionSettled({execution:{status:'interrupted'},receipts:[{status:'uncertain'}]}),false);
 assert.equal(executionSettled({execution:{status:'failed'},receipts:[{status:'started'}]}),false);
 assert.equal(executionSettled({execution:{status:'failed'},receipts:[{status:'failed'}]}),true);
 assert.equal(executionSettled({execution:{status:'completed'},receipts:[{status:'completed'}]}),true);
 assert.equal(executionSettled({}),false);
});

test('controller preserves draft, alternates order and separates holdout grading from review input',async t => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-'));
 t.after(() => fs.rmSync(root,{recursive:true,force:true}));
 const calls = [];let guards=0;
 const rows = await runComparison({root,config,guard:() => guards++,save:async () => {},
  execute:async ({kind,task,directory,prompt,lane}) => {
   calls.push(`${task.id}-${kind}`);
   assert.ok(!prompt.includes('HIDDEN_CASE'));
   assert.equal(lane,kind==='draft' ? config.builder : config.frontier);
   if(kind==='upgrade') assert.equal(fs.readFileSync(path.join(directory,'main.kujo'),'utf8'),'draft');
   fs.writeFileSync(path.join(directory,'main.kujo'),kind);return run();
  },verify:async (_file,_id,phase) => ({...checked(),...(phase==='holdout' ? {secret:'HIDDEN_CASE'} : {})})});
 assert.deepEqual(calls,['1-direct','1-draft','1-upgrade','2-draft','2-upgrade','2-direct']);
 assert.equal(fs.readFileSync(path.join(root,'candidates/1-draft/main.kujo'),'utf8'),'draft');
 assert.equal(fs.readFileSync(path.join(root,'snapshots/1-draft/main.kujo'),'utf8'),'draft');
 assert.equal(rows.length,2);assert.equal(guards,18);
});

test('failed builder stays failed, is graded and never launches a frontier upgrade',async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-failure-'));t.after(() => fs.rmSync(root,{recursive:true,force:true}));
 const calls=[];
 const rows=await runComparison({root,config:{...config,task_ids:[1]},guard:() => {},save:async () => {},
  execute:async ({kind}) => {calls.push(kind);return {...run(),completed:kind!=='draft'};},verify:async () => checked()});
 assert.deepEqual(calls,['direct','draft']);assert.equal(rows[0].hybrid_stopped,'builder_incomplete');
 assert.equal(rows[0].draft.holdout.passed,1);assert.equal(summarize(rows).hybrid_deliveries,0);
});

test('integrity or infrastructure change stops further model calls',async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-guard-'));t.after(() => fs.rmSync(root,{recursive:true,force:true}));
 let calls=0,guards=0;
 await assert.rejects(runComparison({root,config,guard:() => {if(++guards===2) throw Error('listener changed');},save:async () => {},execute:async () => {calls++;return run();},verify:async () => checked()}),/listener changed/);
 assert.equal(calls,1);
});

test('owned benchmark instance uses an ephemeral port and closes without touching live listeners',async t => {
 const {startInstance,stopInstance}=require('../scripts/run-hybrid-benchmark');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-server-'));t.after(() => fs.rmSync(root,{recursive:true,force:true}));
 const previous=process.env.API_AUTH_TOKEN;process.env.API_AUTH_TOKEN='hybrid-isolated-test-token';
 t.after(() => {if(previous===undefined) delete process.env.API_AUTH_TOKEN;else process.env.API_AUTH_TOKEN=previous;});
 const instance=await startInstance(root,process.execPath,'0'.repeat(64));
 try {
  const response=await fetch(instance.base+'/api/health',{headers:{'X-API-Token':'hybrid-isolated-test-token'}});
  const health=await response.json();assert.equal(response.status,200);assert.equal(health.instance.role,'benchmark');
  assert.equal(health.engineering_review.enabled,false);
  assert.notEqual(new URL(instance.base).port,'4174');
 } finally {await stopInstance(instance.child);}
 assert.equal(instance.child.exitCode,0);
});
