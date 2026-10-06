#!/usr/bin/env node
// Explicit opt-in live comparison. Never starts/stops Watchdog or modifies live state.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {fork, spawn, spawnSync} = require('node:child_process');
const {parseBenchmarkCliArgs, resolveBenchmarkSelection, configuredModels} = require('../lib/benchmark-selection');
const {acceptanceManifest, assertAcceptanceUnchanged} = require('../lib/acceptance-integrity');
const {validateConfig, runComparison, summarize, executionSettled} = require('../lib/hybrid-benchmark');
const {verify} = require('./verify-kujo-maintenance');
const repo = path.resolve(__dirname,'..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function api(base, endpoint, body, method = 'PUT') {
 const response = await fetch(base+endpoint,{signal:AbortSignal.timeout(10000), headers:{'X-API-Token':process.env.API_AUTH_TOKEN,'Content-Type':'application/json'},
  ...(body ? {method,body:JSON.stringify(body)} : {})});
 if (!response.ok) throw Error(`App API ${endpoint} returned HTTP ${response.status}`);
 return response.json();
}

function listenerIdentity(proxyUrl) {
 const url = new URL(proxyUrl);
 if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('This local comparison requires a loopback Watchdog proxy');
 const port = url.port || (url.protocol === 'https:' ? '443' : '80');
 const result = spawnSync('lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-Fp'],{encoding:'utf8',timeout:5000,maxBuffer:16384});
 if (result.error || result.status !== 0) throw Error('Cannot establish proxy listener ownership; lsof and one running proxy are required');
 const pids = [...new Set(result.stdout.split('\n').filter(s => /^p\d+$/.test(s)))];
 if (pids.length !== 1) throw Error(`Proxy port ${port} has ${pids.length} listeners; stop the conflicting instance before benchmarking`);
 return {port:Number(port),pid:Number(pids[0].slice(1))};
}

function childInstance() {
 const runtime = require('../server');
 const server = runtime.app.listen(0,'127.0.0.1',() => process.send({port:server.address().port}));
 let closing = false;
 const close = async () => {
  if (closing) return; closing = true;
  server.close();
  try { await runtime.close(); process.exit(0); }
  catch { process.exit(1); }
 };
 process.on('SIGTERM',close); process.on('SIGINT',close); process.on('disconnect',close);
}

function startInstance(root, binary, sha) {
 const fd = fs.openSync(path.join(root,'server.log'),'a');
 const child = fork(__filename,['--instance-child'],{cwd:repo,stdio:['ignore',fd,fd,'ipc'],env:{...process.env,
  PORT:'0',AI_CHAT_HOST:'127.0.0.1',AI_CHAT_INSTANCE_ROLE:'benchmark',AI_CHAT_INSTANCE_LABEL:path.basename(root),
  DB_PATH:path.join(root,'benchmark.db'),DB_BACKUP_DIR:path.join(root,'backups'),AUDIT_LOG_PATH:path.join(root,'audit.log'),
  AI_CHAT_AGENT_KUJO_BIN:binary,AI_CHAT_AGENT_KUJO_SHA256:sha,
  CODEX_SANDBOX_MODE:'workspace-write',
  // The explicit frontier stage is the review treatment. Avoid a hidden second
  // in-app model reviewer on one route but not the native Codex route.
  ENGINEERING_REVIEW_ENABLED:'0',ENGINEERING_CONTRACT_ENABLED:'0',KUJO_GROUNDING_MODE:'compact',
  KUJO_VERIFICATION_BATCH_ENABLED:'1',KUJO_ALLOCATION_GUIDANCE:'1'}});
 fs.closeSync(fd);
 return new Promise((resolve,reject) => {
  const timer = setTimeout(() => {child.kill('SIGTERM');reject(Error('Benchmark instance did not become ready'));},30000);
  child.once('error',error => {clearTimeout(timer);reject(error);});
  child.once('exit',code => {clearTimeout(timer);reject(Error(`Benchmark instance exited during startup: ${code}`));});
  child.once('message',message => {
   clearTimeout(timer);
   if (!Number.isInteger(message.port)) {child.kill('SIGTERM');reject(Error('Invalid benchmark listener'));return;}
   resolve({child,base:`http://127.0.0.1:${message.port}`});
  });
 });
}

async function stopInstance(child) {
 if (!child || child.exitCode !== null || child.signalCode !== null) return;
 await new Promise(resolve => {
  const timer = setTimeout(() => child.kill('SIGKILL'),10000);
  child.once('exit',() => {clearTimeout(timer);resolve();});child.kill('SIGTERM');
 });
}

async function main(argv = process.argv.slice(2)) {
 if (process.cwd() !== repo) throw Error('Run this command from the AI Chat repository root');
 if (fs.existsSync(path.join(repo,'.env'))) process.loadEnvFile(path.join(repo,'.env'));
 const args = parseBenchmarkCliArgs(argv);
 if (!args.config || !args.kujo || !args.kujoSha256 || (!args.preflight && !args.run)) throw Error('Use --config FILE --kujo BINARY --kujo-sha256 SHA and --preflight or --run --root FRESH_DIRECTORY');
 if (args.preflight && args.run) throw Error('Choose preflight or run, not both');
 const configPath = path.resolve(args.config), config = validateConfig(JSON.parse(fs.readFileSync(configPath)));
 const binary = fs.realpathSync(args.kujo), sha = digest(fs.readFileSync(binary));
 if (sha !== args.kujoSha256) throw Error('Pinned runtime SHA mismatch');
 const qualification = spawnSync(process.execPath,['scripts/verify-kujo-reference.js'],{cwd:repo,encoding:'utf8',timeout:60000,maxBuffer:131072,env:{...process.env,KUJO_REFERENCE_BIN:binary}});
 if (qualification.error || qualification.status !== 0) throw Error('Runtime examples failed qualification; no model requests made');
 const qualified = JSON.parse(qualification.stdout);
 if (qualified.runtime !== 'kujo 1.7.0') throw Error('Requalify maintenance protocol for this runtime first');
 const sourceBase = String(args.sourceUrl || 'http://127.0.0.1:4174').replace(/\/$/,'');
 const source = (await api(sourceBase,'/api/state?messages=none')).state;
 const health = await api(sourceBase,'/api/health');
 const selected = {};
 for (const name of ['builder','frontier']) {
  const selection = resolveBenchmarkSelection({models:[config[name].model],providerProfile:config[name].profile},source).lanes[0];
  const profile = source.settings.profiles.find(p => p.id === selection.profile_id);
  if (!configuredModels(profile).includes(config[name].model)) throw Error(`${name} model is absent from the selected profile catalog`);
  // Public state contains no API secrets or ChatGPT connection tokens. Only
  // external managed credentials can be reused without copying live databases.
  if (!['watchdog','watchdog_ollama_tud','watchdog_openrouter','codex'].includes(profile.provider_id)) throw Error('Initial isolated runner supports managed Watchdog and Codex profiles only; never copy private credentials from API state');
  selected[name] = profile;
 }
 const proxyUrl = health.watchdog?.benchmark?.proxy_url;
 const usesWatchdog = Object.values(selected).some(p => p.provider_id.startsWith('watchdog'));
 const proxy = usesWatchdog ? listenerIdentity(proxyUrl) : null;
 const receipt = {status:'preflight_passed',preflight_model_requests:0,runtime_sha256:sha,qualification:qualified,
  lanes:Object.fromEntries(Object.entries(selected).map(([k,p]) => [k,{profile_id:p.id,provider_id:p.provider_id,model:config[k].model}])),proxy,
  tasks:config.task_ids, maximum_stage_requests:config.task_ids.length*3, limitations:['Catalog presence does not prove live entitlement or current provider availability.','Prompt/workspace boundaries are not OS isolation.','Each stage can make many provider inferences; eighteen stages is not eighteen model calls.']};
 if (args.preflight) {console.log(JSON.stringify(receipt,null,2));return receipt;}
 if (!args.root || args.root === true) throw Error('--run requires a fresh --root');
 const root = path.resolve(args.root);
 if (fs.existsSync(root)) throw Error('Comparison root already exists; previous results are never overwritten');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const tracked = spawnSync('git',['ls-files','-z','lib','scripts','benchmarks','tests/fixtures/kujo-maintenance','SYSTEM_PROMPT.md','server.js'],{cwd:repo,encoding:'utf8',maxBuffer:1048576});
 if (tracked.status !== 0) throw Error('Cannot freeze repository assets');
 const assets = [...new Set([...tracked.stdout.split('\0').filter(Boolean).map(f => path.join(repo,f)),__filename,path.join(repo,'lib/hybrid-benchmark.js'),configPath,binary])];
 const manifest = acceptanceManifest(assets);
 fs.writeFileSync(path.join(root,'acceptance.json'),JSON.stringify(manifest,null,2));
 const report = {...receipt,status:'running',started_at:new Date().toISOString(),config,stage_requests:0,rows:[],summary:null};
 const save = async rows => {report.rows=rows;report.summary=summarize(rows);fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));};
 await save([]);
 let instance;
 try {
  instance = await startInstance(root,binary,sha);
  const initial = (await api(instance.base,'/api/state?messages=none')).state;
  await api(instance.base,'/api/state',{stateVersion:initial.stateVersion || 0,settings:{...source.settings,profiles:[...new Map(Object.values(selected).map(p => [p.id,p])).values()],paneProfiles:[]},chats:[]});
  const infrastructureGuard = () => {
   if (instance.child.exitCode !== null || instance.child.signalCode !== null) throw Error('Owned benchmark server stopped; comparison invalid');
   if (usesWatchdog && JSON.stringify(listenerIdentity(proxyUrl)) !== JSON.stringify(proxy)) throw Error('Watchdog listener identity changed; comparison invalid');
  };
  const guard = () => {assertAcceptanceUnchanged(manifest);infrastructureGuard();};
  const execute = async ({task,kind,lane,prompt}) => {
   report.stage_requests++; await save(report.rows);
   const id = `t${task.id}-${kind}`, suite = path.join(root,id+'.md');
   console.log(JSON.stringify({stage:id,status:'started',model:lane.model}));
   fs.writeFileSync(suite,`# TEST ${task.id}: ${task.title}\n\n${prompt}\nUse this exact qualified Kujo executable for commands and generated test harnesses: ${binary}. Do not substitute a different kujo on PATH.\n`);
   const runManifest = path.join(root,id+'-acceptance.json');
   fs.writeFileSync(runManifest,JSON.stringify({...manifest,...acceptanceManifest([suite])}));
   const profile = kind === 'draft' ? selected.builder : selected.frontier;
   const fd = fs.openSync(path.join(root,id+'.log'),'w');
   const child = spawn(process.execPath,['scripts/run-benchmark-suite.js','--base-url',instance.base,'--tests',suite,'--provider-profile',profile.id,'--model',lane.model,'--tool-preset','local-dev','--require-instance-role','benchmark','--run-id',id,'--output-dir',path.join(root,'runs'),'--max-tokens',String(config.max_tokens),'--max-attempts','1','--concurrency','1','--stream-timeout-ms',String(config.stage_timeout_ms),'--acceptance-manifest',runManifest],{cwd:repo,stdio:['ignore',fd,fd],env:{...process.env,BENCHMARK_API_TOKEN:process.env.API_AUTH_TOKEN}});
   fs.closeSync(fd);
   let interrupted;
   const monitor = setInterval(() => {try {infrastructureGuard();} catch(e) {interrupted=e;child.kill('SIGTERM');}},5000);
   let code;
   try {code=await new Promise((resolve,reject) => {child.once('exit',resolve);child.once('error',reject);});} finally {clearInterval(monitor);}
   if (interrupted) throw interrupted;
   const result = JSON.parse(fs.readFileSync(path.join(root,'runs',id+'.json')));
   const panes = result.tests.flatMap(t => t.panes), summary = result.summary;
   console.log(JSON.stringify({stage:id,status:code === 0 && summary.completed === 1 ? 'delivered' : 'failed',reported_tokens:summary.token_use?.total_tokens}));
   if (panes.length !== 1 || !panes[0].execution_id) throw Error('Missing execution identity; cannot establish that candidate writes have stopped');
   for (const pane of panes) if (pane.execution_id) {
    const evidence = await api(instance.base,'/api/executions/'+pane.execution_id);
    fs.writeFileSync(path.join(root,id+'-evidence.json'),JSON.stringify(evidence));
    if (!executionSettled(evidence)) {
     await api(instance.base,'/api/chat/stream/cancel',{request_id:pane.execution_id},'POST');
     throw Error('Execution is active or has uncertain tools; cancellation requested, comparison stopped without grading or replay');
    }
   }
   return {id,model:lane.model,profile_id:profile.id,completed:code === 0 && summary.completed === 1,
    usage:{...summary.token_use,cached_input_tokens:panes.reduce((n,p) => n+(p.usage?.cached_input_tokens || 0),0)},
    usage_complete:panes.length > 0 && panes.every(p => p.usage_complete === true),
    tools:summary.tool_calls_executed,rounds:summary.provider_rounds,elapsed_ms:summary.latency_ms_total,
    errors:panes.map(p => p.error).filter(Boolean)};
  };
  await runComparison({root,config,execute,verify:(file,id,phase) => verify(file,id,phase,binary),guard,save});
  report.status='complete';report.finished_at=new Date().toISOString();await save(report.rows);
  fs.writeFileSync(path.join(root,'quality-review.json'),JSON.stringify({
   status:'pending_independent_review',scale:'0 missing/broken; 1 serious defects; 2 material gaps; 3 appropriate and verified; 4 exceptionally clear, complete and proportionate',
   rule:'Assess source and actual assertions. Do not infer quality from passing checks, model self-ratings or lower tokens. Review draft, upgrade and direct outputs; retain failed deliveries.',
   artifacts:report.rows.flatMap(row => ['draft','upgrade','direct'].filter(kind => row[kind]).map(kind => ({task:row.task,kind,
    delivered:row[kind].run.completed,snapshot:path.join(root,'snapshots',`${row.task}-${kind}`),hashes:row[kind].source.hashes,
    compatibility:null,maintainability:null,failure_handling:null,test_adequacy:null,evidence:[],limitations:[]})))
  },null,2));
  console.log(JSON.stringify({status:report.status,report:path.join(root,'report.json'),summary:report.summary},null,2));
 } catch(error) {
  report.status='aborted';report.error=error.message;await save(report.rows);throw error;
 } finally {await stopInstance(instance?.child);}
 return report;
}
if (require.main === module) {
 if (process.argv.includes('--instance-child')) childInstance();
 else main().catch(error => {console.error(error.message);process.exitCode=1;});
}
module.exports = {main, listenerIdentity, startInstance, stopInstance};
