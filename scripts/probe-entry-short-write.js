#!/usr/bin/env node
// Supplemental entry-service diagnostic, separate from the frozen transfer oracle.
// Inject one legal short FileHandle.write(string) per temp file. Never edit source.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { isDeepStrictEqual } = require('node:util');

async function probe(server, { control = false } = {}) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-short-write-'));
 const state = path.join(dir, 'state.json');
 const before = JSON.stringify({ entries: {} });
 let child, lines, injected = 0;
 try {
  fs.writeFileSync(state, before);
  const preload = path.join(dir, 'short-write.cjs');
  fs.writeFileSync(preload, `
const fs = require('node:fs');
const open = fs.promises.open;
fs.promises.open = async function(file, flags, ...args) {
 const handle = await open.call(this, file, flags, ...args);
 if (['w','wx'].includes(flags) && String(file).includes('.tmp-')) {
  const write = handle.write.bind(handle);
  let injected = false;
  handle.write = async function(data, ...args) {
   if (!injected && typeof data === 'string' && data.length > 1) {
    injected = true;
    const result = await write(data.slice(0, Math.floor(data.length / 2)), ...args);
    process.send?.({ probe: 'short-write', bytesWritten: result.bytesWritten });
    return result;
   }
   return write(data, ...args);
  };
 }
 return handle;
};
`);
  child = spawn(process.execPath, [...(control ? [] : ['--require', preload]), path.resolve(server), '--file', state, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.on('message', message => { if (message?.probe === 'short-write') injected++; });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
  lines = createInterface({ input: child.stdout });
  const port = await new Promise((resolve, reject) => {
   const finish = (error, value) => {
    clearTimeout(timer); child.off('error', onError); child.off('exit', onExit); lines.off('line', onLine);
    error ? reject(error) : resolve(value);
   };
   const onError = error => finish(error);
   const onExit = () => finish(Error('startup exited: ' + stderr));
   const onLine = line => {
    try {
     const { port } = JSON.parse(line);
     if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('invalid startup port');
     finish(null, port);
    } catch (error) { finish(error); }
   };
   const timer = setTimeout(() => finish(Error('startup timeout')), 5000);
   child.once('error', onError); child.once('exit', onExit); lines.once('line', onLine);
  });
  const url = `http://127.0.0.1:${port}/entries`;
  const post = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ada', value: 'one' }), signal: AbortSignal.timeout(5000) });
  const output = await post.json();
  const visible = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
  const disk = fs.readFileSync(state, 'utf8');
  let parsed, valid = true;
  try { parsed = JSON.parse(disk); } catch { valid = false; }
  const expected = { entries: { ada: 'one' } };
  const consistent = post.status === 200
   ? valid && isDeepStrictEqual(parsed, expected) && isDeepStrictEqual(visible, expected) && isDeepStrictEqual(output, expected)
   : post.status === 500 && disk === before && isDeepStrictEqual(visible, { entries: {} });
  return { probe: 'post-hoc partial FileHandle.write(string)', control, injections: injected, applicable: control || injected > 0, http_status: post.status, post: output, visible, disk, disk_valid_json: valid, passed: control || injected > 0 ? consistent : null, artifact_modified: false };
 } finally {
  lines?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
   await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
   });
  }
  fs.rmSync(dir, { recursive: true, force: true });
 }
}
if (require.main === module) {
 if (!process.argv[2]) throw Error('Usage: node scripts/probe-entry-short-write.js SERVER_JS [--control]');
 probe(process.argv[2], { control: process.argv.includes('--control') }).then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed === true ? 0 : result.passed === false ? 1 : 2;
 }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { probe };
