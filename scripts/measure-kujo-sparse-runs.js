#!/usr/bin/env node
// Supplemental real-CLI measurement: every value creates a separate output run.
// Kept separate from the frozen collection oracle; never rewrites generated code.
const {spawnSync}=require('node:child_process');
function measure(binary,file,execute=spawnSync) {
 const levels=[];
 for(const n of [200,800,3200]) {
  const values=Array.from({length:n},(_,i)=>i*2);
  const expected=JSON.stringify(values.map(x=>[x,x]));
  const trials=[];
  for(let i=0;i<3;i++) {
   const start=performance.now();
   const r=execute(binary,['run',file,'--',JSON.stringify(values)],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
   let correct=false;
   try {correct=r.status===0&&!r.error&&!r.signal&&!r.stderr&&JSON.stringify(JSON.parse(r.stdout))===expected;}catch{}
   trials.push({ms:performance.now()-start,correct,status:r.status??null,signal:r.signal||null,error:r.error?.code||null});
  }
  levels.push({n,trials,median_ms:trials.map(t=>t.ms).sort((a,b)=>a-b)[1]});
 }
 return{scope:'Supplemental sparse runs, three real entry-point process trials per size, startup included. Full output equality; no portable speed threshold.',levels,passed:levels.every(l=>l.trials.every(t=>t.correct))};
}
if(require.main===module) {
 const [binary,file]=process.argv.slice(2);if(!binary||!file)throw Error('Pass the qualified Kujo binary and generated main.kujo');
 const result=measure(binary,file);console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}
module.exports={measure};
