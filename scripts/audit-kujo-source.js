#!/usr/bin/env node
// Advisory, read-only duplication evidence for explicitly selected source files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {duplicateSpans}=require('../lib/source-duplication');
const names=process.argv.slice(2);if(!names.length||names.length>16)throw Error('Pass 1–16 explicit Kujo source file paths');
const files=names.map(name=>{
 const stat=fs.lstatSync(name);if(!stat.isFile()||stat.size>512*1024||!name.endsWith('.kujo'))throw Error('Expected bounded regular .kujo files');
 return{path:path.resolve(name),content:fs.readFileSync(name,'utf8')};
});
console.log(JSON.stringify({files:files.map(f=>({path:f.path,sha256:crypto.createHash('sha256').update(f.content).digest('hex'),bytes:Buffer.byteLength(f.content),lines:f.content.split('\n').length})),...duplicateSpans(files)},null,2));
