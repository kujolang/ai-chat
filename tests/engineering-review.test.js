const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngineeringReview, parseVerdict, evidencePacket, LIMITS } = require('../lib/engineering-review');
const tools = ['local_file_read', 'local_file_write', 'local_shell', 'tool_discover', 'browser_act', 'tool_result_read'].map(name => ({ type: 'function', function: { name } }));
const originalMessages = [{ role: 'system', content: 'Keep permissions.' }, { role: 'user', content: 'Implement a task.' }];
const receipts = [{ call_id: 'write1', tool_name: 'local_file_write', status: 'completed', input: { root_id: 'repo', path: 'main.go', content: 'private draft' } }];
const verdict = (v = 'revise') => JSON.stringify({ verdict: v, findings: v === 'revise' ? ['main.go: overflow, add a boundary test.'] : [], checks: v === 'pass' ? [{ result_ref: 'read1', claim: 'inspected main.go' }] : [] });
test('review starts only after executable engineering work and excludes worker reasoning', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages });
 assert.equal(r.onStop(originalMessages, 'Explanation', []), null);
 const review = r.onStop([...originalMessages, { role: 'assistant', content: 'private worker plan', thinking: 'secret reasoning' }], 'Finished', receipts);
 assert.ok(!JSON.stringify(review).includes('private worker plan'));
 assert.ok(!JSON.stringify(review).includes('secret reasoning'));
 assert.ok(!JSON.stringify(review).includes('private draft'));
 assert.match(JSON.stringify(review), /write1/);
 assert.deepEqual(r.schemas(tools).map(t => t.function.name), ['local_file_read', 'tool_result_read', 'engineering_review_submit']);
});
test('two repairs and three reviews are the absolute maximum; restore worker context', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages });
 let messages = [...originalMessages, { role: 'assistant', content: 'candidate' }];
 for (let n = 0; n < 3; n++) {
  messages = r.onStop(messages, 'candidate', receipts);
  assert.equal(r.state.phase, 'review');
  r.beforeRound(messages);
  messages = r.onStop(messages, verdict(), receipts);
  assert.equal(r.state.phase, n < 2 ? 'repair' : 'final');
  assert.match(JSON.stringify(messages), /candidate/);
 }
 assert.equal(r.state.repairs, 2); assert.equal(r.state.reviews, 3);
 assert.deepEqual(r.schemas(tools), []);
 assert.equal(r.onStop(messages, 'final', receipts), null);
});
test('malformed, unsupported, empty or uninspected passes are inconclusive', () => {
 for (const text of ['garbage', '{}', verdict('pass'), JSON.stringify({ verdict: 'revise', findings: [], checks: [] })]) assert.equal(parseVerdict(text, []).verdict, 'inconclusive');
 assert.equal(parseVerdict(verdict('pass'), ['read1']).verdict, 'pass');
 assert.equal(parseVerdict(verdict(), ['read1']).verdict, 'revise');
});
test('review round budget and time budget survive checkpoints', () => {
 let now = 100;
 let r = createEngineeringReview({ enabled: true, originalMessages, now: () => now });
 let messages = r.onStop([...originalMessages], 'candidate', receipts);
 for (let i = 0; i < LIMITS.reviewRounds; i++) r.beforeRound(messages);
 r = createEngineeringReview({ enabled: true, originalMessages, checkpoint: { engineering_review: r.state }, now: () => now });
 messages = r.beforeRound(messages);
 assert.equal(r.state.phase, 'final'); assert.equal(r.state.outcome, 'inconclusive');
 assert.match(messages.at(-1).content, /budget was exhausted/);
 r = createEngineeringReview({ enabled: true, originalMessages, now: () => now });
 messages = r.onStop([...originalMessages], 'candidate', receipts);
 now += LIMITS.durationMs;
 r.beforeRound(messages);
 assert.equal(r.state.phase, 'final'); assert.equal(r.state.repairs, 0);
});
test('repair round limit closes without granting further tools', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages });
 let m = r.onStop([...originalMessages], 'candidate', receipts);
 m = r.onStop(m, verdict(), receipts);
 for (let i = 0; i < LIMITS.repairRounds; i++) r.beforeRound(m);
 m = r.beforeRound(m);
 assert.equal(r.state.phase, 'final'); assert.deepEqual(r.schemas(tools), []);
 assert.match(m.at(-1).content, /incomplete/);
});
test('disabled and pre-feature checkpoints cannot gain reviews on resume', () => {
 for (const options of [{ enabled: false }, { enabled: true, checkpoint: { messages: originalMessages } }]) {
  const r = createEngineeringReview({ ...options, originalMessages });
  assert.equal(r.onStop(originalMessages, 'Finished', receipts), null);
  assert.deepEqual(r.schemas(tools), tools);
 }
});
test('evidence packets disclose omission and never include write contents', () => {
 const packet = JSON.parse(evidencePacket('x'.repeat(33000), Array(70).fill(receipts[0]), 'y'.repeat(7000)));
 assert.equal(packet.request_truncated, true); assert.equal(packet.candidate_truncated, true);
 assert.equal(packet.omitted_receipts, 6); assert.equal(packet.evidence.length, 64);
 assert.ok(!JSON.stringify(packet).includes('private draft'));
});

test('verdict checks must reference evidence actually read; malformed checks fail closed', () => {
 const make = checks => JSON.stringify({ verdict: 'pass', findings: [], checks });
 assert.equal(parseVerdict(make([{ result_ref: 'invented', claim: 'all tests pass' }]), ['real']).verdict, 'inconclusive');
 assert.equal(parseVerdict(make([null]), ['real']).verdict, 'inconclusive');
 assert.equal(parseVerdict(make([{ result_ref: 'real', claim: '' }]), ['real']).verdict, 'inconclusive');
 assert.equal(parseVerdict(make([{ result_ref: 'real', claim: 'source inspected' }]), ['real']).verdict, 'pass');
});
test('failed and deferred engineering calls do not trigger review', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages });
 for (const result of [{ ok: false, error: { code: 'tool_schema_required' } }, { ok: false, error: { code: 'invalid_tool_arguments' } }]) {
  assert.equal(r.onStop(originalMessages, 'Blocked', [{ ...receipts[0], result }]), null);
 }
});
test('failed reads cannot support a passing review', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages });
 const m = r.onStop([...originalMessages], 'candidate', receipts);
 r.noteResults([{ id: 'read1', function: { name: 'local_file_read' } }], [{ error: { code: 'not_found' } }]);
 r.onStop(m, verdict('pass'), receipts);
 assert.equal(r.state.outcome, 'inconclusive');
 assert.match(r.completionNotice(), /inconclusive/);
});

test('exhausted outer round budget discloses skipped review without another repair', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages });
 r.onStop([...originalMessages], 'candidate', receipts, false);
 assert.equal(r.state.phase, 'final'); assert.equal(r.state.reviews, 0); assert.equal(r.state.repairs, 0);
 assert.match(r.completionNotice(), /budget was exhausted before independent review/);
});
test('truncated request context cannot receive a pass even with a valid evidence reference', () => {
 const r = createEngineeringReview({ enabled: true, originalMessages: [{ role: 'user', content: 'x'.repeat(33000) }] });
 const m = r.onStop([...originalMessages], 'candidate', receipts);
 r.noteResults([{ id: 'read1', function: { name: 'local_file_read' } }], [{ content: 'source' }]);
 r.onStop(m, verdict('pass'), receipts);
 assert.equal(r.state.outcome, 'inconclusive'); assert.match(r.completionNotice(), /complete scope/);
});
