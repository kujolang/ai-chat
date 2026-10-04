const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probe } = require('../scripts/probe-entry-short-write');

async function fixture(retry, run) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-write-control-'));
 const server = path.join(dir, 'server.js');
 // Small test-only control for this probe's ASCII request, never model context.
 fs.writeFileSync(server, `
const fs=require('node:fs'),http=require('node:http');
const file=process.argv[process.argv.indexOf('--file')+1];let state=JSON.parse(fs.readFileSync(file,'utf8'));
const server=http.createServer((req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 if(req.method==='GET')return send(200,state);
 let body='';req.on('data',d=>body+=d);req.on('end',async()=>{
  const input=JSON.parse(body),next={entries:{...state.entries,[input.key]:input.value}},text=JSON.stringify(next),tmp=file+'.tmp-control';
  try {
   const handle=await fs.promises.open(tmp,'wx');
   try {
    ${retry ? "let offset=0;while(offset<text.length){const {bytesWritten}=await handle.write(text.slice(offset),offset,'utf8');if(!bytesWritten)throw Error('no progress');offset+=bytesWritten;}" : "await handle.write(text,0,'utf8');"}
   }finally{await handle.close();}
   await fs.promises.rename(tmp,file);state=next;send(200,state);
  }catch(e){send(500,{error:e.message});}
 });
});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
`);
 try { await run(server); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('partial-write probe distinguishes ordinary success from falsely acknowledged persistence', async () => {
 await fixture(false, async server => {
  assert.equal((await probe(server, { control: true })).passed, true);
  const result = await probe(server);
  assert.equal(result.injections, 1); assert.equal(result.http_status, 200);
  assert.equal(result.disk_valid_json, false); assert.equal(result.passed, false);
 });
});
test('partial-write probe accepts a writer that completes the remaining bytes', async () => {
 await fixture(true, async server => {
  const result = await probe(server);
  assert.equal(result.injections, 1); assert.equal(result.passed, true);
 });
});
