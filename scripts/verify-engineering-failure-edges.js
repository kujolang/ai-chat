#!/usr/bin/env node
// Post-hoc checks applied equally to all engineering-evaluation arms.
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
async function inspect(file) {
 const {save}=require(path.resolve(file));
 const serialError=Error('serialization sentinel');let touched=false,serialObserved;
 const noIO=new Proxy({}, {get(){touched=true;throw Error('I/O before serialization completed');}});
 try{await save('unused', {toJSON(){throw serialError;}}, noIO);}catch(e){serialObserved=e;}
 const serialization={passed:serialObserved===serialError&&!touched,original_error:serialObserved===serialError,touched};
 const io=require('node:fs/promises'),dir=await io.mkdtemp(path.join(os.tmpdir(),'engineering-close-'));
 let handle,attempts=0,observed;
 try {
  const target=path.join(dir,'state.json'),original=Error('close failed before closure');
  await io.writeFile(target,'old');
  const fault={...io,async open(...args){handle=await io.open(...args);return {
   write:(...a)=>handle.write(...a),writeFile:(...a)=>handle.writeFile(...a),
   async close(){if(++attempts===1)throw original;await handle.close();}
  };}};
  try{await save(target,{next:1},fault);}catch(e){observed=e;}
  const closed=handle?.fd===-1,unchanged=await io.readFile(target,'utf8')==='old';
  const files=await io.readdir(dir),clean=files.length===1&&files[0]==='state.json';
  return {serialization,close_failure:{passed:observed===original&&closed&&unchanged&&clean,original_error:observed===original,closed,close_attempts:attempts,unchanged,clean}};
 } finally {
  if(handle&&handle.fd!==-1)await handle.close();
  await io.rm(dir,{recursive:true,force:true});
 }
}
function verify(file) {
 const owned=fs.mkdtempSync(path.join(os.tmpdir(),'engineering-edges-worker-')),marker=randomUUID()+':';
 try {
  const r=spawnSync(process.execPath,[__filename,'--worker',path.resolve(file),marker],{encoding:'utf8',timeout:10000,maxBuffer:128*1024,detached:process.platform!=='win32',env:{...process.env,TMPDIR:owned,TMP:owned,TEMP:owned}});
  if(process.platform!=='win32'&&r.pid)try{process.kill(-r.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}
  const line=r.stdout?.split('\n').find(line=>line.startsWith(marker));
  if(r.error||r.status!==0||!line)return {completed:false,error:(r.error?.message||r.stderr||'Missing assertion-completion receipt').slice(0,1000)};
  return {completed:true,...JSON.parse(line.slice(marker.length))};
 } finally {fs.rmSync(owned,{recursive:true,force:true});}
}
if(require.main===module){
 if(process.argv[2]==='--worker')inspect(process.argv[3]).then(r=>console.log(process.argv[4]+JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
 else {if(!process.argv[2])throw Error('Usage: node scripts/verify-engineering-failure-edges.js STORE_MODULE');const r=verify(process.argv[2]);console.log(JSON.stringify(r,null,2));process.exitCode=r.completed&&r.serialization.passed&&r.close_failure.passed?0:1;}
}
module.exports={verify};
