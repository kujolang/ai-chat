const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { acceptanceManifest, assertAcceptanceUnchanged } = require('../lib/acceptance-integrity');
test('acceptance asset changes, deletion, and symlink replacement invalidate evaluation', t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-acceptance-'));
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 const file = path.join(dir, 'oracle.js'); fs.writeFileSync(file, 'original');
 const manifest = acceptanceManifest([file]); assert.equal(assertAcceptanceUnchanged(manifest), true);
 fs.writeFileSync(file, 'weakened'); assert.throws(() => assertAcceptanceUnchanged(manifest), /changed/);
 fs.unlinkSync(file); assert.throws(() => assertAcceptanceUnchanged(manifest));
 const target = path.join(dir, 'other'); fs.writeFileSync(target, 'original'); fs.symlinkSync(target, file);
 assert.throws(() => assertAcceptanceUnchanged(manifest), /regular file/);
 assert.throws(() => acceptanceManifest([])); assert.throws(() => assertAcceptanceUnchanged({}));
});
