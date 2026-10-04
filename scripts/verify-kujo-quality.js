#!/usr/bin/env node
// Independent process-level oracles, deliberately outside the model's task root.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
function verify(root, binary = process.env.KUJO_REFERENCE_BIN || 'kujo', run = spawnSync) {
 const rows = [];
 const invoke = (task, args) => {
  const file = path.resolve(root, String(task).padStart(2, '0'), 'main.kujo');
  if (!fs.existsSync(file)) throw new Error(`Missing artifact: ${file}`);
  const r = run(binary, ['run', file, '--', ...args], { encoding: 'utf8', timeout: 10000, maxBuffer: 128 * 1024 });
  if (r.error) throw r.error;
  if (!Number.isInteger(r.status)) throw new Error(`Process did not exit normally: ${r.signal || 'unknown'}`);
  return r;
 };
 const check = (task, name, fn) => {
  try { fn(); rows.push({ task, name, passed: true }); }
  catch (e) { rows.push({ task, name, passed: false, error: e.message.slice(0, 1200) }); }
 };
 const success = (task, args, expected) => { const r = invoke(task, args); assert.equal(r.status, 0, r.stderr); assert.deepEqual(JSON.parse(r.stdout), expected); };
 const rejected = (task, args) => { const r = invoke(task, args); assert.notEqual(r.status, 0); assert.ok((r.stdout + r.stderr).trim()); };
 for (const [input, expected] of [['0ms',0],['001s',1000],['12ms',12],['2s',2000],['3m',180000],['1440m',86400000],['86400000ms',86400000]]) {
  check(1, input, () => success(1, [input], { milliseconds: expected }));
 }
 for (const input of ['', '-1s', '+1s', '1.5s', '1e3ms', ' 2s', '2s ', '86400001ms', '999999999999999999999999m']) check(1, `reject ${JSON.stringify(input)}`, () => rejected(1,[input]));
 const stock = { a: 8, b: 2 };
 check(2,'empty moves',()=>success(2,[JSON.stringify({stock,moves:[]})],{stock}));
 check(2,'ordered transfers preserve total',()=>success(2,[JSON.stringify({stock,moves:[{from:'a',to:'b',amount:5},{from:'b',to:'a',amount:1}]})],{stock:{a:4,b:6}}));
 for (const moves of [[{from:'a',to:'b',amount:9}],[{from:'a',to:'missing',amount:1}],[{from:'a',to:'a',amount:1}],[{from:'a',to:'b',amount:1.5}],[{from:'a',to:'b',amount:5},{from:'a',to:'b',amount:4}]]) check(2,JSON.stringify(moves),()=>rejected(2,[JSON.stringify({stock,moves})]));
 for (const input of ['null','[]','{"stock":null,"moves":[]}','{"stock":{"a":-1},"moves":[]}']) check(2,`reject ${input}`,()=>rejected(2,[input]));
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-kujo-quality-')); const file = path.join(dir,'counter.json');
 try {
  check(3,'persist then restart',()=>{success(3,[file,'4'],{value:4});success(3,[file,'-1'],{value:3});assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{value:3});});
  check(3,'reject range without mutation',()=>{fs.writeFileSync(file,'{"value":3}');rejected(3,[file,'-4']);assert.equal(fs.readFileSync(file,'utf8'),'{"value":3}');});
  check(3,'preserve corrupt state',()=>{fs.writeFileSync(file,'broken');rejected(3,[file,'1']);assert.equal(fs.readFileSync(file,'utf8'),'broken');});
  check(3,'failed write preserves disk and reports failure',()=>{
   fs.writeFileSync(file,'{"value":3}');fs.chmodSync(file,0o400);fs.chmodSync(dir,0o500);
   try { rejected(3,[file,'1']);assert.equal(fs.readFileSync(file,'utf8'),'{"value":3}'); }
   finally { fs.chmodSync(dir,0o700);fs.chmodSync(file,0o600); }
  });
 } finally { fs.chmodSync(dir,0o700);fs.rmSync(dir,{recursive:true,force:true}); }
 return { checks: rows.length, passed: rows.filter(r=>r.passed).length, results: rows };
}
if (require.main === module) {
 if (!process.argv[2]) throw new Error('Usage: node scripts/verify-kujo-quality.js RUN_ROOT');
 const result=verify(process.argv[2]);console.log(JSON.stringify(result,null,2));process.exitCode=result.passed===result.checks?0:1;
}
module.exports={verify};
