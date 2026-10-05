#!/usr/bin/env node
// Controller-owned black-box checks. Never include this file in builder context.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const cases = {
 1: ['defaults','explicit-values','isolation','validation','consumer'],
 2: ['legacy','sum','boundaries','invalid','arity','large'],
 3: ['replace','short-write','write-failure','rename-failure','collision','serialization'],
 4: ['literal-argv','nonzero','spawn-error','pre-abort','abort-reap','output-limit','validation'],
 5: ['overlap','failure-recovery','validation','publish-after-persist'],
 6: ['preview','nested-equality','distinct','invalid','arity']
};
async function runCase(task, name, dir, bin) {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-engineering-oracle-'));
 const load=file=>require(path.join(dir,file));
 const cli=(file,args,command=process.execPath)=>{
  const r=spawnSync(command,[...(command===process.execPath?[]:['run']),path.join(dir,file),...(command===process.execPath?[]:['--']),...args],{encoding:'utf8',timeout:5000,maxBuffer:256*1024,cwd:temp});
  assert.ifError(r.error); assert.equal(r.signal,null); return r;
 };
 const good=(r,expected)=>{assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');assert.deepEqual(JSON.parse(r.stdout),expected);};
 const bad=r=>{assert.equal(r.status,1,r.stderr);assert.equal(r.stdout,'');const body=JSON.parse(r.stderr);assert.deepEqual(Object.keys(body),['error']);assert.ok(typeof body.error==='string'&&body.error.trim());};
 try {
 if(task===1){const {resolve}=load('config.cjs');
  if(name==='defaults')assert.deepEqual(resolve(),{enabled:true,retries:3,label:'default'});
  if(name==='explicit-values')assert.deepEqual(resolve({enabled:false,retries:0,label:''}),{enabled:false,retries:0,label:''});
  if(name==='isolation'){const input={label:'x'};const first=resolve(input);first.retries=9;assert.deepEqual(resolve(),{enabled:true,retries:3,label:'default'});assert.deepEqual(input,{label:'x'});assert.notEqual(resolve(),resolve());}
  if(name==='validation')for(const v of [null,[],{enabled:0},{retries:1.5},{retries:-1},{retries:11},{label:null},{other:1}])assert.throws(()=>resolve(v),TypeError);
  if(name==='consumer')good(cli('consumer.cjs',['{"enabled":false,"retries":0,"label":""}']),{enabled:false,retries:0,label:''});
 }
 if(task===2){
  const invoke=(...a)=>cli('main.kujo',a,bin);
  if(name==='legacy')for(const input of [[],[1,-2,0]])good(invoke(JSON.stringify(input)),{count:input.length});
  if(name==='sum')good(invoke('[3,-2,0,3]','sum'),{count:4,sum:4});
  if(name==='boundaries') {good(invoke('[]','sum'),{count:0,sum:0});good(invoke('[-1000,1000]','sum'),{count:2,sum:0});}
  if(name==='invalid')for(const raw of ['broken','null','{}','[true]','[1.5]','["1"]','[1001]','[-1001]',JSON.stringify(Array(10001).fill(0))])bad(invoke(raw,'sum'));
  if(name==='arity')for(const a of [[],['[]','bad'],['[]','sum','extra']])bad(invoke(...a));
  if(name==='large')good(invoke(JSON.stringify(Array(10000).fill(7)),'sum'),{count:10000,sum:70000});
 }
 if(task===3){
  const {save}=load('store.cjs'), real=require('node:fs/promises');const file=path.join(temp,'state.json');fs.writeFileSync(file,'old bytes');
  const sentinel=Object.assign(Error('injected failure'),{code:'EIO'});let opens=0,closes=0;let collided='';
  const io={...real,async open(p,flags,...rest){
   assert.notEqual(path.resolve(p),file,'must not open destination for writing');assert.equal(path.dirname(path.resolve(p)),temp);assert.ok(String(flags).includes('x'),'exclusive creation required');
   if(name==='collision'&&opens++===0){collided=p;fs.writeFileSync(p,'not yours');throw Object.assign(Error('collision'),{code:'EEXIST'});}
   const h=await real.open(p,flags,...rest);let writes=0;
   return {async write(buffer,...args){writes++;if(name==='write-failure'&&writes>1)throw sentinel;
    if(name==='short-write'||name==='write-failure'){assert.ok(Buffer.isBuffer(buffer),'write must account for byte counts');return h.write(buffer,args[0]||0,Math.min(args[1]??buffer.length,2),args[2]??null);}
    return h.write(buffer,...args);}, async writeFile(...args){if(name==='write-failure')throw sentinel;return h.writeFile(...args);},async close(){closes++;return h.close();}};
  },async rename(a,b){if(name==='rename-failure')throw sentinel;return real.rename(a,b);}};
  if(name==='serialization'){for(const value of [undefined,1n])await assert.rejects(save(file,value,io));assert.equal(fs.readFileSync(file,'utf8'),'old bytes');assert.deepEqual(fs.readdirSync(temp),['state.json']);}
  else if(name==='write-failure'||name==='rename-failure'){await assert.rejects(save(file,{text:'héllo'},io),e=>e===sentinel);assert.equal(fs.readFileSync(file,'utf8'),'old bytes');assert.deepEqual(fs.readdirSync(temp),['state.json']);assert.equal(closes,1);}
  else if(name==='collision'){try{await save(file,{ok:true},io);}catch(e){assert.equal(e.code,'EEXIST');}assert.equal(fs.readFileSync(collided,'utf8'),'not yours');}
  else {await save(file,{text:'héllo',n:2},io);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{text:'héllo',n:2});assert.deepEqual(fs.readdirSync(temp),['state.json']);assert.equal(closes,1);}
 }
 if(task===4){const {run}=load('runner.cjs');
  if(name==='literal-argv'){const arg='$(touch forbidden);*';assert.deepEqual(await run(process.execPath,['-e','process.stdout.write(process.argv[1])',arg]),{code:0,stdout:arg,stderr:''});assert.equal(fs.existsSync(path.join(temp,'forbidden')),false);}
  if(name==='nonzero')assert.deepEqual(await run(process.execPath,['-e','process.stderr.write("bad");process.exit(7)']),{code:7,stdout:'',stderr:'bad'});
  if(name==='spawn-error')await assert.rejects(run(path.join(temp,'missing'),[]));
  if(name==='pre-abort'){const ac=new AbortController();ac.abort();const marker=path.join(temp,'launched');await assert.rejects(run(process.execPath,['-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'yes')`],{signal:ac.signal}),e=>e.code==='ABORT_ERR');assert.equal(fs.existsSync(marker),false);}
  if(name==='abort-reap'){
   const ac=new AbortController(),marker=path.join(temp,'pid');let pid;
   const watcher=fs.watch(temp,()=>{if(fs.existsSync(marker)){const text=fs.readFileSync(marker,'utf8');if(/^\d+$/.test(text)){pid=Number(text);ac.abort();}}});
   try{await assert.rejects(run(process.execPath,['-e',`process.on('SIGTERM',()=>{});require('fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`],{signal:ac.signal}),e=>e.code==='ABORT_ERR');assert.ok(pid);assert.throws(()=>process.kill(pid,0),e=>e.code==='ESRCH');}finally{watcher.close();if(pid)try{process.kill(pid,'SIGKILL');}catch{}}
  }
  if(name==='output-limit')await assert.rejects(run(process.execPath,['-e','process.stdout.write("é".repeat(1000));process.stderr.write("x".repeat(1000))'],{maxBytes:2000}),e=>e.code==='OUTPUT_LIMIT');
  if(name==='validation')for(const maxBytes of [0,-1,1.5,Infinity])await assert.rejects(async()=>run(process.execPath,['-e',''],{maxBytes}));
 }
 if(task===5){const {createCounter}=load('counter.cjs');
  if(name==='overlap'){const calls=[];const c=createCounter(0,async n=>{calls.push(n);await Promise.resolve();});assert.deepEqual(await Promise.all([c.increment(1),c.increment(2),c.increment(3)]),[1,3,6]);assert.deepEqual(calls,[1,3,6]);assert.equal(c.read(),6);}
  if(name==='failure-recovery'){const err=Error('disk');let n=0;const c=createCounter(10,async()=>{if(n++===0)throw err;});const a=c.increment(2),b=c.increment(3);await assert.rejects(a,e=>e===err);assert.equal(await b,13);assert.equal(c.read(),13);}
  if(name==='validation'){assert.throws(()=>createCounter(1.5,async()=>{}));const c=createCounter(Number.MAX_SAFE_INTEGER,async()=>{throw Error('must not persist');});for(const d of [true,1.5,Infinity,1])await assert.rejects(async()=>c.increment(d));assert.equal(c.read(),Number.MAX_SAFE_INTEGER);}
  if(name==='publish-after-persist'){let release,started;const entered=new Promise(r=>started=r);const barrier=new Promise(r=>release=r);const c=createCounter(4,async()=>{started();await barrier;});const p=c.increment(3);await entered;assert.equal(c.read(),4);release();assert.equal(await p,7);assert.equal(c.read(),7);}
 }
 if(task===6){const file=path.join(temp,'records.json');
  const invoke=value=>{const raw=JSON.stringify(value);fs.writeFileSync(file,raw);const r=cli('cleanup.cjs',[file]);assert.equal(fs.readFileSync(file,'utf8'),raw);assert.deepEqual(fs.readdirSync(temp),['records.json']);return r;};
  const preview=(value,duplicates)=>{const r=invoke(value);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');assert.deepEqual(JSON.parse(r.stdout).duplicates,duplicates);};
  if(name==='preview'){preview([{id:'a',value:1},{id:'a',value:2},{value:1,id:'a'}],[2]);assert.ok(fs.readFileSync(path.join(dir,'DECISIONS.md'),'utf8').trim());}
  if(name==='nested-equality')preview([{x:{a:1,b:2},y:[1,2]},{y:[1,2],x:{b:2,a:1}},{x:{a:1,b:2},y:[2,1]}],[1]);
  if(name==='distinct')preview([{}, {x:null},{x:0},{x:false},{x:''},{x:[]},{x:{}}],[]);
  if(name==='invalid')for(const value of [null,{},[null],[1],[[]]])bad(invoke(value));
  if(name==='arity'){bad(cli('cleanup.cjs',[]));bad(cli('cleanup.cjs',[file,'extra']));}
 }
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
function verify(root, bin, tasks = Object.keys(cases)) {
 const results=[];
 for(const [task,names] of Object.entries(cases).filter(([task])=>tasks.map(String).includes(task)))for(const name of names){
  const r=spawnSync(process.execPath,[__filename,'--case',task,name,path.resolve(root,task.padStart(2,'0')),bin||'kujo'],{encoding:'utf8',timeout:15000,maxBuffer:128*1024,detached:process.platform!=='win32'});
  if(process.platform!=='win32'&&r.pid)try{process.kill(-r.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}
  results.push({task:Number(task),name,passed:!r.error&&r.status===0&&r.signal===null,...(r.status===0&&!r.error?{}:{error:(r.error?.message||r.stderr||`exit ${r.status}`).slice(0,1200)})});
 }
 return {checks:results.length,passed:results.filter(r=>r.passed).length,results};
}
if(require.main===module){
 if(process.argv[2]==='--case')runCase(Number(process.argv[3]),process.argv[4],process.argv[5],process.argv[6]).catch(e=>{console.error(e.stack);process.exitCode=1;});
 else {const r=verify(process.argv[2],process.argv[3]);console.log(JSON.stringify(r,null,2));process.exitCode=r.passed===r.checks?0:1;}
}
module.exports={verify,runCase,cases};
