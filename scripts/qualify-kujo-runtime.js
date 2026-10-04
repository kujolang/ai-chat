#!/usr/bin/env node
// Operator-run qualification of trusted probes, never model-generated code.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { reference, referenceExpected } = require('../lib/kujo-development');

function resolveBinary(binary) {
 const candidates = binary.includes(path.sep) ? [path.resolve(binary)] : (process.env.PATH || '').split(path.delimiter).map(dir => path.resolve(dir, binary));
 for (const candidate of candidates) {
  try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate); } catch { /* Continue PATH lookup. */ }
 }
 throw new Error(`Executable unavailable: ${binary}`);
}
function qualify(binary = 'kujo', backend = 'default', run = spawnSync) {
 if (!['default', 'interpreter'].includes(backend)) throw new Error('Backend must be default or interpreter.');
 const executable = resolveBinary(binary);
 const digest = () => crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
 const sha256 = digest();
 const invoke = args => {
  const r = run(executable, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 128 * 1024 });
  return { exit_code: r.status, signal: r.signal || null, stdout: String(r.stdout || '').trim(), stderr: String(r.stderr || '').slice(0, 2000), error: r.error?.code || null };
 };
 const version = invoke(['--version']);
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-kujo-qualification-'));
 const results = [];
 try {
  const sources = { ...reference.topics, nested_arithmetic: fs.readFileSync(path.join(__dirname, '../tests/fixtures/kujo-runtime/nested-arithmetic.kujo'), 'utf8') };
  for (const [name, source] of Object.entries(sources)) {
   const file = path.join(dir, `${name}.kujo`); fs.writeFileSync(file, source);
   const checked = invoke(['check', file]);
   const executed = invoke(['run', file, ...(backend === 'interpreter' ? ['--interpreter'] : []), '--', ...(name === 'arguments' ? ['41'] : name === 'persistence' ? [dir] : [])]);
   const expected = { ...referenceExpected, nested_arithmetic: '12' }[name];
   const ok = [checked, executed].every(r => r.exit_code === 0 && !r.error && !r.signal) && (expected === undefined ? /^100\n\d+$/.test(executed.stdout) : executed.stdout === expected);
   results.push({ name, ok, checked, executed });
  }
  const unchanged = digest() === sha256;
  return { ok: version.exit_code === 0 && !version.error && unchanged && results.every(r => r.ok), executable, sha256, backend, version: version.stdout, executable_unchanged: unchanged, results,
   scope: 'These trusted probes only; not certification of arbitrary programs or language conformance. No runtime is installed or switched.' };
 } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (require.main === module) {
 const result = qualify(process.argv[2] || 'kujo', process.argv[3] || 'default');
 console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
}
module.exports = { qualify };
