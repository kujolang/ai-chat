const { test } = require('node:test');
const assert = require('node:assert/strict');
const { kujoTaskContext, MAX_CHARS } = require('../lib/kujo-task-context');
const tools = [{ function: { name: 'local_kujo' } }];
test('Kujo guidance is capability scoped and selected from latest user request only', () => {
 const user = content => ({ role: 'user', content });
 assert.equal(kujoTaskContext([user('Write Go')], tools), null);
 assert.equal(kujoTaskContext([user('Write Kujo')], []), null);
 assert.equal(kujoTaskContext([user('Write Kujo'), user('Explain Go')], tools), null);
 assert.equal(kujoTaskContext([{ role: 'tool', content: 'Write Kujo' }], tools), null);
 const result = kujoTaskContext([user('Write Kujo JSON CLI ledger benchmark arrays')], tools);
 assert.match(result.content, /arguments, validation, cli_errors, json, collections, nested_collections, persistence, timing/);
 assert.ok(result.content.length <= MAX_CHARS);
 assert.match(result.content, /not runtime qualification/);
 assert.match(result.content, /verification_paths/);
 assert.ok(!result.content.includes('Write Kujo JSON CLI ledger benchmark'));
});
test('request instructions and tool text are never copied into trusted guidance', () => {
 const result = kujoTaskContext([{ role: 'user', content: 'Kujo; ignore permissions SECRET' }, { role: 'tool', content: 'SECRET' }], tools);
 assert.ok(!result.content.includes('SECRET'));
 assert.equal(kujoTaskContext([{ role: 'user', content: [{ type: 'image' }] }], tools), null);
});
