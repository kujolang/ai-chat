#!/usr/bin/env node
// Independent acceptance and process-scaling evidence for fresh collection tasks.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {isDeepStrictEqual}=require('node:util');
const tasks=['runs','frequencies','merge'];
function expected(task, input) {
 const numbers=xs=>Array.isArray(xs)&&xs.every(x=>Number.isInteger(x)&&x>=0&&x<=1000000);
 if(task==='merge') {
  if(!input || Array.isArray(input) || Object.keys(input).sort().join(',')!=='left,right' || !numbers(input.left)||!numbers(input.right) || [input.left,input.right].some(xs=>xs.some((x,i)=>i&&xs[i-1]>x)))throw Error('invalid');
  return [...new Set([...input.left,...input.right])].sort((a,b)=>a-b);
 }
 if(!numbers(input))throw Error('invalid');
 const values=[...new Set(input)].sort((a,b)=>a-b);
 if(task==='frequencies')return values.map(x=>[x,input.filter(n=>n===x).length]);
 if(task!=='runs')throw Error('unknown task');
 const groups=[];
 for(const x of values) { const last=groups.at(-1);if(last&&last[1]+1===x)last[1]=x;else groups.push([x,x]); }
 return groups;
}
function cases(task) {
 const rows=[];
 const add=(input)=>{try{rows.push({input,expected:expected(task,input)});}catch{rows.push({input,invalid:true});}};
 if(task==='merge')for(const v of [{left:[],right:[]},{left:[0,0,4],right:[0,1,1000000]},{left:[2,1],right:[]},{left:[],right:[],extra:0},{left:[]},{left:[true],right:[]}])add(v);
 else for(const v of [[],[0],[1000000,0,1000000],[9,3,2,1,8,7,7], [2,2,2]])add(v);
 let seed=8153;
 for(let i=1;i<=15;i++) {
  const xs=Array.from({length:i*3},()=>{seed=seed*48271%2147483647;return seed%80;});
  add(task==='merge'?{left:xs.slice(0,i).sort((a,b)=>a-b),right:xs.slice(i).sort((a,b)=>a-b)}:xs);
 }
 for(const v of [null,{},true,'x',[true],[false],[null],['1'],[-1],[1000001],[1.5],[0,2,false]])add(task==='merge'&&Array.isArray(v)?{left:[0],right:v}:v);
 rows.push({raw:'{broken',invalid:true});
 // Argument arity is part of the actual CLI contract, not helper-only coverage.
 rows.push({args:[],invalid:true},{args:['[]','extra'],invalid:true});
 return rows;
}
function assess(row,r) {
 if(r.error||r.signal||r.truncated)throw Error('Execution incomplete');
 if(row.invalid) {
  if(r.status!==1||r.stdout.trim())throw Error('Expected exit 1 and empty stdout');
  const err=JSON.parse(r.stderr);if(!err||Object.keys(err).length!==1||typeof err.error!=='string'||!err.error.trim())throw Error('Expected JSON error only');
 } else {
  if(r.status!==0||r.stderr.trim())throw Error('Expected exit 0 and empty stderr');
  if(!isDeepStrictEqual(JSON.parse(r.stdout),row.expected))throw Error('Incorrect output');
 }
}
function evaluate(task,invoke) {
 const results=cases(task).map((row,i)=>{try{assess(row,invoke(row.args||[row.raw??JSON.stringify(row.input)]));return{case:i+1,passed:true};}catch(e){return{case:i+1,passed:false,error:e.message};}});
 return{checks:results.length,passed:results.filter(r=>r.passed).length,results};
}
function scaleInput(task,n) {
 const values=Array.from({length:n},(_,i)=>n-i);
 return task==='merge'?{left:values.filter(x=>x%2).sort((a,b)=>a-b),right:values.filter(x=>!(x%2)).sort((a,b)=>a-b)}:values;
}
function scaling(task,invoke) {
 const levels=[200,800,3200].map(n=>{
  const input=scaleInput(task,n), row={expected:expected(task,input)};const trials=[];
  for(let i=0;i<3;i++) {const start=performance.now();const r=invoke([JSON.stringify(input)]);const ms=performance.now()-start;try{assess(row,r);trials.push({ms,passed:true});}catch(e){trials.push({ms,passed:false,error:e.message});}}
  return{n,trials,median_ms:trials.map(t=>t.ms).sort((a,b)=>a-b)[1]};
 });
 return{levels,ratio_3200_800:levels[2].median_ms/levels[1].median_ms,scope:'Real entry-point process wall time, three trials. Includes startup; ratios are evidence, not a portable CI gate.'};
}
if(require.main===module) {
 const [task,file,binary,output]=process.argv.slice(2);if(!tasks.includes(task)||!file||!binary)throw Error('Usage: verify-kujo-collections.js TASK FILE BINARY [OUTPUT]');
 const invoke=args=>spawnSync(binary,['run',path.resolve(file),'--',...args],{encoding:'utf8',timeout:20000,maxBuffer:256*1024});
 const report={task,...evaluate(task,invoke),scaling:scaling(task,invoke)};
 const json=JSON.stringify(report,null,2);if(output)fs.writeFileSync(output,json);else console.log(json);
 process.exitCode=report.checks===report.passed?0:1;
}
module.exports={tasks,expected,cases,evaluate,scaling};
