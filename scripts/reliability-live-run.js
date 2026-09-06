#!/usr/bin/env node
// Real providers only. Each invocation owns a new database and bounded fixtures.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { execFileSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { setTimeout: sleep } = require('node:timers/promises');
const { createServerRuntime } = require('../lib/server-runtime');
const projectRoot = path.resolve(__dirname, '..');

function options(argv) {
 const result = { mode: 'eval', hours: 8, interval: 90000, timeout: 180000 };
 for (let i=0;i<argv.length;i+=2) {
  const name=argv[i]?.replace(/^--/,'');
  if(!['mode','hours','interval','timeout','targets','output'].includes(name)||argv[i+1]===undefined) throw Error('Use --mode eval|soak --targets FILE --output NEW_DIRECTORY [--hours 8 --interval 90000 --timeout 180000].');
  result[name]=['hours','interval','timeout'].includes(name)?Number(argv[i+1]):argv[i+1];
 }
 if(!['eval','soak'].includes(result.mode)||!result.targets||!result.output)throw Error('mode, targets and a new output directory are required.');
 if(!Number.isFinite(result.hours)||result.hours<8||result.hours>24)throw Error('A soak must last 8–24 hours; short runs are not soak evidence.');
 if(!Number.isSafeInteger(result.interval)||result.interval<10000||result.interval>300000)throw Error('interval must be 10000–300000 ms.');
 if(!Number.isSafeInteger(result.timeout)||result.timeout<1000||result.timeout>600000)throw Error('timeout must be 1000–600000 ms.');
 return result;
}
function localEnv() {
 const env={...process.env};
 if(fs.existsSync(path.join(projectRoot,'.env')))for(const line of fs.readFileSync(path.join(projectRoot,'.env'),'utf8').split(/\r?\n/)) {
  const match=line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if(match&&!Object.hasOwn(env,match[1]))env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
 }
 return env;
}
function scoreTask(task, text, calls, artifactDir) {
 const completed=calls.filter(call=>call.status==='completed'&&call.result?.ok!==false);
 if(!completed.some(call=>call.tool_name===task.required)||!text.includes(task.expected))return false;
 if(task.name==='local-report')return /"revenue"\s*:\s*146(?:[,\s}])/.test(text)&&text.includes(task.expected_file);
 if(task.name==='rendered-evidence')return completed.some(call=>call.tool_name==='browser_close')&&completed.some(call=>call.result?.action==='screenshot'&&/^[A-Za-z0-9_-]+$/.test(call.result.artifact_id||'')&&fs.existsSync(path.join(artifactDir,call.result.artifact_id+'.png')));
 return true;
}
function percentile(values,p) { const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:null; }
function summarize(rows, durationMs, mode) {
 const groups={};
 for(const row of rows) {
  const key=`${row.provider}:${row.model}:${row.discovery?'deferred':'eager'}`;
  const group=groups[key]||={attempts:0,completed:0,correct:0,rounds:0,input_tokens:0,output_tokens:0,usage_reported:0,cost_reported:0,cost:0,latencies:[],discovery_loaded:0,discovery_relevant:0};
  group.attempts++;group.completed+=Number(row.terminal==='done');group.correct+=Number(row.correct);group.rounds+=row.rounds||0;
  if(row.usage){group.usage_reported++;group.input_tokens+=Number(row.usage.input_tokens)||0;group.output_tokens+=Number(row.usage.output_tokens)||0;}
  if(Number.isFinite(row.reported_cost)){group.cost_reported++;group.cost+=row.reported_cost;}
  group.latencies.push(row.duration_ms);group.discovery_loaded+=row.discovery_loaded;group.discovery_relevant+=row.discovery_relevant;
 }
 for(const group of Object.values(groups)) {
  group.p50_ms=percentile(group.latencies,0.5);group.p95_ms=percentile(group.latencies,0.95);delete group.latencies;
  group.discovery_precision=group.discovery_loaded?group.discovery_relevant/group.discovery_loaded:null;
  group.reported_cost_total=group.cost_reported===group.attempts?group.cost:null;delete group.cost;
 }
 return {mode,duration_ms:durationMs,all_day_elapsed:mode==='soak'&&durationMs>=8*3600000,groups};
}
async function consume(response,signal,startedAt) {
 if(!response.ok)throw Object.assign(Error('Request failed'),{code:`http_${response.status}`});
 const reader=response.body.getReader(), decoder=new TextDecoder();
 let buffer='', bytes=0, terminal=null, errorCode=null, errorStatus=null, done=null, firstToken=null, text='';
 try {
  while(true) {
   signal.throwIfAborted();const item=await reader.read();if(item.done)break;
   bytes+=item.value.byteLength;if(bytes>2*1024*1024)throw Object.assign(Error('Bound exceeded'),{code:'harness_response_limit'});
   buffer+=decoder.decode(item.value,{stream:true});
   let split;
   while((split=buffer.indexOf('\n\n'))>=0) {
    const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);
    const kind=frame.match(/^event:\s*(.+)$/m)?.[1];const data=frame.match(/^data:\s*(.+)$/m)?.[1];if(!data)continue;
    const payload=JSON.parse(data);
    if(kind==='token'){firstToken??=Date.now()-startedAt;text+=String(payload.delta||'');}
    if(kind==='done'){terminal='done';done=payload;}
    if(kind==='error'){terminal='error';errorCode=payload.code||'unknown';errorStatus=Number.isInteger(payload.status)?payload.status:null;}
   }
  }
  return {terminal:terminal||'eof',error_code:errorCode,provider_http_status:errorStatus,done,first_token_ms:firstToken,bytes,text};
 } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function main() {
 const config=options(process.argv.slice(2));
 const targets=JSON.parse(fs.readFileSync(path.resolve(config.targets),'utf8'));
 if(!Array.isArray(targets)||targets.length<2||targets.length>8||targets.some(t=>!['watchdog','watchdog_openrouter','watchdog_ollama_tud','hermes','xai_oauth'].includes(t.provider)||typeof t.model!=='string'||!t.model||t.model.length>160||typeof t.family!=='string'))throw Error('Provide 2–8 managed-provider targets with provider, model and family.');
 if(new Set(targets.map(t=>t.provider)).size<2)throw Error('Mixed-provider validation requires at least two providers.');
 const directory=path.resolve(config.output);fs.mkdirSync(directory,{mode:0o700});
 const write=(name,value)=>{const file=path.join(directory,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);};
 const append=(name,value)=>fs.appendFileSync(path.join(directory,name),JSON.stringify(value)+'\n',{mode:0o600});
 const fixtureDir=path.join(directory,'fixtures');fs.mkdirSync(fixtureDir,{mode:0o700});
 const nonce=crypto.randomBytes(8).toString('hex');
 const reportName=`orders-${nonce}.csv`;
 fs.writeFileSync(path.join(fixtureDir,reportName),'sku,quantity,unit_price\nA,4,12\nB,7,14\n');
 const pageCode=`STATIC-${nonce}`, browserCode=`RENDER-${nonce}`;
 const fixture=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/render')res.end(`<html><body><h1>Render fixture</h1><p id="value"></p><script>document.getElementById('value').textContent=atob('${Buffer.from(browserCode).toString('base64')}');</script></body></html>`);
  else res.end(`<html><body><h1>Shipping schedule</h1><p>Shipment reference: ${pageCode}</p></body></html>`);
 });
 fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
 const fixtureHost="live-fixture.invalid";
 const fixtureUrl=`http://${fixtureHost}:${fixture.address().port}`;
 const fixtureNetwork={allowPrivateHosts:[fixtureHost],resolveHost:async host=>{if(host!==fixtureHost)throw Error("Unexpected fixture host");return [{address:"127.0.0.1",family:4}];}};
 const env={...localEnv(),DB_PATH:path.join(directory,'runtime.db'),DB_BACKUP_DIR:path.join(directory,'backups'),AUDIT_LOG_PATH:path.join(directory,'audit.log'),BENCHMARK_OUTPUT_DIR:path.join(directory,'benchmarks'),BROWSER_ARTIFACT_DIR:path.join(directory,'browser'),ENCRYPTION_SECRET:crypto.randomBytes(32).toString('hex'),API_AUTH_TOKEN:crypto.randomBytes(24).toString('hex'),AI_CHAT_HOST:'127.0.0.1',PORT:'0',AI_CHAT_INSTANCE_ROLE:'benchmark',AI_CHAT_INSTANCE_LABEL:'isolated-reliability-validation',AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_WORKSPACE_ROOTS:fixtureDir,AI_CHAT_LOCAL_WRITE_ENABLED:'0',AI_CHAT_LOCAL_SHELL_ENABLED:'0',AI_CHAT_SKILLS_ENABLED:'0',BROWSER_ENABLED:'1',BROWSER_HEADLESS:'1',BROWSER_ALLOWED_HOSTS:fixtureHost,BROWSER_MAX_SESSIONS:'8',BROWSER_SESSION_TTL_MS:'30000',MAX_ACTIVE_STREAMS:'8',MAX_TOOL_ROUNDS:'8',MAX_TOOL_CALLS_PER_REQUEST:'24',STREAM_REQUEST_TIMEOUT_MS:String(config.timeout),WATCHDOG_TELEMETRY_CONTENT_MODE:'off'};
 let runtime,server,metricsTimer,sampling=false,stopping=false,fatal=null;const stop=new AbortController();
 const rows=[],samples=[];let startedAt=Date.now();
 const onSignal=()=>{stopping=true;stop.abort();};process.once('SIGTERM',onSignal);process.once('SIGINT',onSignal);
 const loop=monitorEventLoopDelay({resolution:20});loop.enable();
 try {
  runtime=createServerRuntime({projectRoot,env,pageFetchRuntimeOptions:fixtureNetwork,browserRuntimeOptions:fixtureNetwork,skillRuntimeOptions:{homeDir:fixtureDir},warnFn:()=>{}});
  const state=runtime.helpers.readState();
  for(const target of targets){const profile=state.settings.profiles.find(p=>p.provider_id===target.provider);if(!profile)throw Error(`Managed provider unavailable: ${target.provider}`);profile.models_csv=[...new Set([...profile.models_csv.split(','),target.model])].join(',');target.profile_id=profile.id;}
  runtime.helpers.writeState(state);
  server=http.createServer(runtime.app);server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const json=async (url,init={})=>{const res=await fetch(base+url,{...init,signal:AbortSignal.timeout(10000),headers:{'x-api-token':env.API_AUTH_TOKEN,'Content-Type':'application/json'}});return res.json();};
  const health=await json('/api/health');if(!health.tool_runtime.browser.available)throw Error('Contained browser unavailable for live task matrix.');
  const allowed=new Set(['local_workspace_list','local_file_list','local_file_read','web_fetch','browser_open','browser_snapshot','browser_act','browser_close','system_time']);
  const schemas=health.tool_runtime.schemas.filter(t=>allowed.has(t.function.name));
  const cases=[
   {name:'local-report',prompt:'Find the orders CSV in the available workspace. Read it and calculate total revenue as quantity times unit_price. Return JSON with revenue and the source filename.',expected:'146',expected_file:reportName,required:'local_file_read',relevant:['local_workspace_list','local_file_list','local_file_read']},
   {name:'static-evidence',prompt:`Read ${fixtureUrl}/shipping with the page reader and return the exact shipment reference.`,expected:pageCode,required:'web_fetch',relevant:['web_fetch']},
   {name:'rendered-evidence',prompt:`Open ${fixtureUrl}/render in the browser. Read the dynamically rendered reference and take a screenshot as evidence. Return the exact reference and screenshot artifact. Close the browser session afterward.`,expected:browserCode,required:'browser_act',relevant:['browser_open','browser_snapshot','browser_act','browser_close']}
  ];
  let commit='unknown';try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim();}catch{}
  const dirty=execFileSync('git',['status','--porcelain'],{cwd:projectRoot,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  startedAt=Date.now();
  write('manifest.json',{pid:process.pid,started_at:new Date(startedAt).toISOString(),mode:config.mode,duration_hours:config.hours,interval_ms:config.interval,request_timeout_ms:config.timeout,commit,dirty_files:dirty,targets,case_names:cases.map(c=>c.name),provider_calls:'real',database:'isolated; ephemeral encryption key not persisted',output_text:'not persisted; scored against local fixture',cost_policy:'provider-reported only; absent cost remains null'});
  async function sample() {
   if(sampling)return;sampling=true;
   try {
    const health=await json('/api/health');
    const sample={at_ms:Date.now()-startedAt,memory:process.memoryUsage(),event_loop_p99_ms:loop.percentile(99)/1e6,requests:health.streaming,benchmark:health.benchmark.queue};
    const processes=execFileSync('/bin/ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));
    const owned=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const [pid,parent] of processes)if(owned.has(parent)&&!owned.has(pid)){owned.add(pid);changed=true;}}
    sample.process_count=owned.size;sample.process_tree_rss_bytes=processes.filter(([pid])=>owned.has(pid)).reduce((n,p)=>n+p[2]*1024,0);
    samples.push(sample);append('metrics.jsonl',sample);loop.reset();
   } catch(error){append('metrics.jsonl',{at_ms:Date.now()-startedAt,error_code:error.code||error.name});}
   finally{sampling=false;}
  }
  metricsTimer=setInterval(()=>void sample(),5000);await sample();
  const plan=cases.flatMap(task=>[false,true].flatMap(discovery=>targets.map(target=>({target,task,discovery}))));
  let index=0;
  do {
   const {target,task,discovery}=plan[index%plan.length];const requestId=`live-${nonce}-${index}`;const begin=Date.now();
   const signal=AbortSignal.any([stop.signal,AbortSignal.timeout(config.timeout)]);
   let result;
   try {
    const response=await fetch(`${base}/api/chat/stream`,{method:'POST',headers:{'x-api-token':env.API_AUTH_TOKEN,'Content-Type':'application/json'},signal,body:JSON.stringify({request_id:requestId,profile_id:target.profile_id,model:target.model,messages:[{role:'user',content:task.prompt}],temperature:0,max_tokens:1024,max_retries:0,tools:schemas,include_saved_runtime_presets:false,tool_discovery:discovery})});
    result=await consume(response,signal,begin);
   } catch(error){await json('/api/chat/stream/cancel',{method:'POST',body:JSON.stringify({request_id:requestId})}).catch(()=>{});result={terminal:'error',error_code:signal.aborted?(stopping?'stopped':'harness_timeout'):(error.code||error.name),text:''};}
   const receipt=await json(`/api/executions/${encodeURIComponent(requestId)}`).catch(()=>({}));
   const calls=receipt.receipts||[];const names=calls.map(c=>c.tool_name);
   const loaded=calls.filter(c=>c.tool_name==='tool_discover').flatMap(c=>c.result?.loaded||[]);
   const done=result.done;const usage=done?.usage||null;
   const cost=typeof usage?.cost==='number'?usage.cost:typeof usage?.total_cost==='number'?usage.total_cost:null;
   const row={index,request_id:requestId,trace_id:done?.trace_id||null,at_ms:begin-startedAt,provider:target.provider,model:target.model,family:target.family,task:task.name,discovery,terminal:result.terminal,error_code:result.error_code||null,provider_http_status:result.provider_http_status||null,correct:result.terminal==='done'&&scoreTask(task,result.text,calls,env.BROWSER_ARTIFACT_DIR),duration_ms:Date.now()-begin,first_token_ms:result.first_token_ms||null,rounds:done?.provider_rounds||null,usage,reported_cost:cost,tools:names,tool_errors:calls.filter(c=>c.result?.ok===false).map(c=>({tool:c.tool_name,code:c.result.error?.code||'unknown'})),discovery_loaded:loaded.length,discovery_relevant:loaded.filter(name=>task.relevant.includes(name)).length,context:done?.context_budget||null,response_bytes:result.bytes||0};
   rows.push(row);append('requests.jsonl',row);
   write('status.json',{status:'running',pid:process.pid,elapsed_ms:Date.now()-startedAt,attempts:rows.length,last:{provider:row.provider,task:row.task,terminal:row.terminal,correct:row.correct}});
   console.log(JSON.stringify({attempt:rows.length,provider:row.provider,model:row.model,task:row.task,discovery,terminal:row.terminal,correct:row.correct,error_code:row.error_code}));
   index++;await sample();
   if(config.mode==='eval'&&index>=plan.length)break;
   if(config.mode==='soak')await sleep(Math.max(0,config.interval-(Date.now()-begin)),undefined,{signal:stop.signal}).catch(()=>{});
  } while(!stopping&&(config.mode==='eval'||Date.now()-startedAt<config.hours*3600000));
  await sample();
 } catch(error){fatal=error.code||error.message;}
 finally {
  clearInterval(metricsTimer);
  while(sampling)await sleep(5);
  loop.disable();
  await runtime?.close().catch(error=>{fatal||=error.code||'drain_failed';});
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));
  process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);
  const summary=summarize(rows,Date.now()-startedAt,config.mode);
  summary.status=fatal?'failed':stopping?'interrupted':'completed';summary.fatal=fatal;
  summary.metrics={samples:samples.length,process_rss_max:Math.max(0,...samples.map(s=>s.process_tree_rss_bytes)),sse_pending_max:Math.max(0,...samples.map(s=>s.requests.output.pending_bytes)),sse_buffered_peak:Math.max(0,...samples.map(s=>s.requests.output.buffered_peak_bytes)),sse_overflows:Math.max(0,...samples.map(s=>s.requests.output.overflows)),event_loop_p99_max_ms:Math.max(0,...samples.map(s=>s.event_loop_p99_ms))};
  const warm=samples.filter(s=>s.at_ms>=600000&&s.at_ms<900000);
  const tail=samples.filter(s=>s.at_ms>=summary.duration_ms-300000);
  summary.metrics.warm_to_final_median_rss_growth=warm.length&&tail.length?percentile(tail.map(s=>s.process_tree_rss_bytes),0.5)-percentile(warm.map(s=>s.process_tree_rss_bytes),0.5):null;
  summary.metrics.process_count_max=Math.max(0,...samples.map(s=>s.process_count));
  summary.acceptance={all_tasks_correct:rows.length>0&&rows.every(r=>r.correct),mixed_provider_success:new Set(rows.filter(r=>r.correct).map(r=>r.provider)).size>=2,all_day_elapsed:summary.all_day_elapsed,no_fatal_error:!fatal&&!stopping};
  write('summary.json',summary);write('status.json',{status:summary.status,pid:process.pid,attempts:rows.length,elapsed_ms:summary.duration_ms});
  if(fatal||stopping)process.exitCode=1;
 }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={options,summarize,consume,scoreTask};
