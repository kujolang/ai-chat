#!/usr/bin/env node
// Offline check of trusted, repository-owned examples against an explicit runtime.
const {spawnSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {reference,referenceExpected}=require('../lib/kujo-development');
const binary=process.env.KUJO_REFERENCE_BIN || 'kujo';
const invoke=args=>{const r=spawnSync(binary,args,{encoding:'utf8',timeout:15000,maxBuffer:128*1024});if(r.error || r.status!==0)throw Error(`${args[0]} failed: ${r.error?.message || r.stderr}`);return r.stdout.trim();};
const version=invoke(['--version']);const v=/\bkujo\s+(\d+\.\d+\.\d+)\b/i.exec(version)?.[1];
if(!reference.tested_versions.includes(v))throw Error(`Reference is not declared verified for ${version}`);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-kujo-reference-'));
try{
 for(const [topic,source] of Object.entries(reference.topics)){
  const file=path.join(dir,`${topic}.kujo`);fs.writeFileSync(file,source+'\n');invoke(['check',file]);
  const out=invoke(['run',file,'--',...(topic==='arguments'?['41']:topic==='persistence'?[dir]:[])]);
  const expected=referenceExpected[topic];
  if(expected ? out!==expected : !/^100\n\d+$/.test(out))throw Error(`${topic}: unexpected output ${JSON.stringify(out)}`);
 }
 console.log(JSON.stringify({ok:true,runtime:version,examples:Object.keys(reference.topics).length,checks:Object.keys(reference.topics).length*2}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
