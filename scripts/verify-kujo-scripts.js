#!/usr/bin/env node
"use strict";
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const {tasks,cases,control}=require('../lib/kujo-script-benchmark');

function invoke(binary,file,args) {
 if(process.platform!=='darwin')throw Error('This evaluator requires the macOS sandbox; no unsandboxed fallback.');
 const literal=x=>JSON.stringify(fs.realpathSync(x));
 const profile=`(version 1)(allow default)(deny network*)(deny file-write*)(deny file-read* (subpath "/Users") (subpath "/private/tmp"))(allow file-read-metadata)(allow file-read* (literal ${literal(binary)}) (literal ${literal(file)}))`;
 return spawnSync('/usr/bin/sandbox-exec',['-p',profile,binary,'run',file,'--',...args],{encoding:'utf8',timeout:2500,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',HOME:path.dirname(file),TMPDIR:path.dirname(file)},cwd:path.dirname(file)});
}
function assess(row,r) {
 if(r.error||r.signal)throw Error(r.error?.code||r.signal);
 if(row.invalid) {
  if(r.status!==1||r.stdout.trim())throw Error('Expected exit 1 with empty stdout');
  const e=JSON.parse(r.stderr);
  if(!e||Object.keys(e).join()!=='error'||typeof e.error!=='string'||!e.error.trim())throw Error('Expected one JSON error on stderr');
 } else {
  if(r.status!==0||r.stderr.trim())throw Error(`Expected clean success: ${r.stderr.slice(0,180)}`);
  if(!isDeepStrictEqual(JSON.parse(r.stdout),row.expected))throw Error('Incorrect JSON result');
 }
}
function evaluate(task,binary,file) {
 let rows=[];
 for(const [index,row] of cases(task).entries()) {
  const r=invoke(binary,file,row.args);
  try { assess(row,r); rows.push({case:index+1,passed:true}); }
  catch(e){rows.push({case:index+1,passed:false,error:e.message});}
  // A timeout is a failed task; avoid repeatedly running a stuck program.
  if(r.error?.code==='ETIMEDOUT'){rows.push(...cases(task).slice(index+1).map((_,i)=>({case:index+i+2,passed:false,error:'Not run after timeout'})));break;}
 }
 return{checks:rows.length,passed:rows.filter(r=>r.passed).length,complete:rows.every(r=>r.passed),rows};
}
function extract(content) {
 const blocks=[...String(content).matchAll(/```(?:kujo)?\s*\n([\s\S]*?)```/g)];
 if(blocks.length!==1)throw Error('Expected exactly one Kujo code block');
 return blocks[0][1];
}
async function main() {
 const [mode,rootArg,binaryArg]=process.argv.slice(2);
 const root=path.resolve(rootArg||'');const binary=fs.realpathSync(binaryArg||process.env.AI_CHAT_AGENT_KUJO_BIN||'');
 if(!['calibrate','grade'].includes(mode)||!rootArg)throw Error('Usage: verify-kujo-scripts.js calibrate|grade ROOT BINARY');
 fs.mkdirSync(root,{recursive:true});
 const report={mode,runtime_sha256:crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),rows:[]};
 if(mode==='calibrate'){
  for(const t of tasks){const file=path.join(root,t.id+'.kujo');fs.writeFileSync(file,control(t));report.rows.push({task:t.id,...evaluate(t,binary,file)});}
  const broken=path.join(root,'broken.kujo');fs.writeFileSync(broken,'print("null")');
  report.negative_control_rejected=tasks.every(t=>!evaluate(t,binary,broken).complete);
 }else{
  const run=JSON.parse(fs.readFileSync(path.join(root,'run.json'),'utf8'));
  const {assertAcceptanceUnchanged}=require('../lib/acceptance-integrity');
  assertAcceptanceUnchanged(JSON.parse(fs.readFileSync(path.join(root,'acceptance.json'),'utf8')));
  for(const test of run.tests){
   const r=await fetch(`${run.base_url}/api/chats/${encodeURIComponent(test.chat_id)}`,{headers:{'X-API-Token':process.env.API_AUTH_TOKEN},signal:AbortSignal.timeout(30000)});
   if(!r.ok)throw Error(`Chat fetch failed: ${r.status}`);
   const payload=await r.json();const chat=payload.chat;
   if(!chat?.panes)throw Error('Missing chat panes');
   fs.writeFileSync(path.join(root,`chat-${test.number}.json`),JSON.stringify(chat,null,2));
   for(const pane of test.panes){
    const task=tasks[test.number-1];const row={task:task.id,model:pane.model,transport_ok:pane.ok,duration_ms:pane.duration_ms,usage:pane.usage};
    try{
     if(!pane.ok)throw Error(pane.error||'Transport failed');
     const saved=chat.panes.find(p=>p.model===pane.model&&p.profile_id===pane.profile_id);
     const code=extract(saved?.messages?.find(m=>m.role==='assistant')?.content);
     const dir=path.join(root,'generated',String(test.number),String(pane.lane_index));fs.mkdirSync(dir,{recursive:true});
     const file=path.join(dir,'main.kujo');fs.writeFileSync(file,code);
     Object.assign(row,{source_sha256:crypto.createHash('sha256').update(code).digest('hex'),...evaluate(task,binary,file)});
    }catch(e){Object.assign(row,{complete:false,passed:0,checks:cases(task).length,error:e.message});}
    report.rows.push(row);
   }
  }
 }
 report.ok=report.rows.every(r=>r.complete)&&report.negative_control_rejected!==false;
 fs.writeFileSync(path.join(root,mode+'.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({mode,ok:report.ok,rows:report.rows.length,complete:report.rows.filter(r=>r.complete).length,failed:report.rows.filter(r=>!r.complete).map(r=>({task:r.task,model:r.model,first:r.rows?.find(x=>!x.passed)||r.error}))}));
 if(mode==='calibrate'&&!report.ok)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={assess,extract,evaluate};
