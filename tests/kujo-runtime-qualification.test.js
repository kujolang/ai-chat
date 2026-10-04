const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { qualify } = require('../scripts/qualify-kujo-runtime');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-qualification-test-'));
const binary = path.join(dir, 'runtime');
fs.writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
after(() => fs.rmSync(dir, { recursive: true, force: true }));
function runner(transform = r => r) {
 return (_binary, args) => {
  const name = path.basename(args[1] || '', '.kujo');
  const out = { core: '0\n1\n4', arguments: '42', collections: '3\n3', timing: '100\n123', nested_arithmetic: '12' }[name];
  return transform({ status: 0, stdout: args[0] === '--version' ? 'kujo fixture' : args[0] === 'run' ? out : '', stderr: '' }, args);
 };
}
test('qualification identifies exact binary/backend and requires all probe outputs', () => {
 const result = qualify(binary, 'interpreter', runner((r, args) => {
  if (args[0] === 'run') assert.ok(args.includes('--interpreter'));
  return r;
 }));
 assert.equal(result.ok, true);
 assert.equal(result.results.length, 5);
 assert.match(result.sha256, /^[a-f0-9]{64}$/);
 assert.equal(result.executable_unchanged, true);
});
test('wrong output, compiler failures, signals and timeouts cannot qualify', () => {
 for (const failure of [{ stdout: 'wrong' }, { status: 4 }, { status: null, signal: 'SIGTERM' }, { error: { code: 'ETIMEDOUT' } }]) {
  const result = qualify(binary, 'default', runner((r, args) => args[0] === 'run' ? { ...r, ...failure } : r));
  assert.equal(result.ok, false);
 }
 assert.equal(qualify(binary, 'default', runner((r, args) => args[0] === 'check' ? { ...r, status: 1 } : r)).ok, false);
});
test('qualification rejects unknown backends before executing', () => {
 assert.throws(() => qualify(binary, 'auto', () => assert.fail('must not execute')), /Backend/);
});
test('executable replacement invalidates an otherwise passing qualification', () => {
 const result = qualify(binary, 'default', runner((r, args) => {
  if (args[0] === '--version') fs.appendFileSync(binary, '# changed\n');
  return r;
 }));
 assert.equal(result.ok, false);
 assert.equal(result.executable_unchanged, false);
});
