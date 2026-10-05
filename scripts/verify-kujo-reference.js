#!/usr/bin/env node
// Offline check of trusted, repository-owned examples against an explicit runtime.
const {spawnSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {reference,referenceExpected,referenceStatus}=require('../lib/kujo-development');
const binary=process.env.KUJO_REFERENCE_BIN || 'kujo';
const invoke=(args,expectedStatus=0,expectedStderr='')=>{const r=spawnSync(binary,args,{encoding:'utf8',timeout:15000,maxBuffer:128*1024});if(r.error || r.status!==expectedStatus)throw Error(`${args[0]} failed: ${r.error?.message || r.stderr}`);if(r.stderr.trim()!==expectedStderr)throw Error('Unexpected stderr: '+r.stderr);return r.stdout.trim();};
const version=invoke(['--version']);const v=/\bkujo\s+(\d+\.\d+\.\d+)\b/i.exec(version)?.[1];
if(!reference.tested_versions.includes(v))throw Error(`Reference is not declared verified for ${version}`);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-kujo-reference-'));
let examples=0;const skipped=[];
try{
 for(const [topic,source] of Object.entries(reference.topics)){
  if(!(reference.topic_versions[topic] || reference.tested_versions).includes(v)){skipped.push(topic);continue;}
  examples++;
  const file=path.join(dir,`${topic}.kujo`);fs.writeFileSync(file,source+'\n');invoke(['check',file]);
  const out=invoke(['run',file,'--',...(topic==='arguments'?['41']:topic==='persistence'?[dir]:[])],referenceStatus[topic]?.exit_code || 0,referenceStatus[topic]?.stderr || '');
  const expected=referenceExpected[topic];
  if(expected !== undefined ? out!==expected : !/^100\n\d+$/.test(out))throw Error(`${topic}: unexpected output ${JSON.stringify(out)}`);
 }
 console.log(JSON.stringify({ok:true,runtime:version,examples,checks:examples*2,skipped}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
