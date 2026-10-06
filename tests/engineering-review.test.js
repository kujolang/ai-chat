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
 assert.equal(r.state.phase, 'review');
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

test('last review round reserves verdict-only schema including after resume', () => {
 let r = createEngineeringReview({ enabled: true, originalMessages });
 const m = r.onStop([...originalMessages], 'candidate', receipts);
 for (let i=0;i<3;i++) { r.beforeRound(m); assert.ok(r.schemas(tools).some(t=>t.function.name==='local_file_read')); }
 r = createEngineeringReview({ enabled: true, originalMessages, checkpoint: { engineering_review: r.state } });
 r.beforeRound(m);
 assert.deepEqual(r.schemas(tools).map(t=>t.function.name), ['engineering_review_submit']);
 assert.match(r.budgetMessage().content, /verdict-only/);
 r.noteResults([{ id:'read1', function:{name:'local_file_read'} }], [{content:'source'}]);
 r.onStop(m, verdict('pass'), receipts); assert.equal(r.state.outcome,'pass');
});
test('invalid verdict diagnoses fields without echoing untrusted values', () => {
 const v=parseVerdict(JSON.stringify({ verdict:'pass',findings:[],checks:[{result_ref:'private value',claim:'ok'}]}),[]);
 assert.deepEqual(v.diagnostic,{code:'uninspected_reference',field:'checks[0].result_ref'});
 assert.ok(!JSON.stringify(v).includes('private value'));
 assert.equal(parseVerdict('{').diagnostic.code,'invalid_json');
 assert.equal(parseVerdict(JSON.stringify({verdict:'pass',findings:[],checks:Array(13).fill({})})).diagnostic.field,'checks');
});
test('passing advisory review cannot certify code edited after successful tests', () => {
 const r=createEngineeringReview({enabled:true,originalMessages});
 const rs=[{call_id:'test',tool_name:'local_shell',status:'completed',input:{command:'go',args:['test','./...']},result:{exit_code:0}}, {call_id:'write',tool_name:'local_file_write',status:'completed',input:{path:'main.go'},result:{ok:true}}];
 const m=r.onStop([...originalMessages],'candidate',rs);
 r.noteResults([{id:'read1',function:{name:'local_file_read'}}],[{content:'source'}]);
 r.onStop(m,verdict('pass'),rs);assert.equal(r.state.phase,'repair');assert.match(r.state.lastVerdict.findings[0],/Source changed/);
});

test('invalid submission gets one bounded correction with only inspected reference choices', () => {
 let r = createEngineeringReview({ enabled: true, originalMessages });
 let m = r.onStop([...originalMessages], 'candidate', receipts);
 r.beforeRound(m);
 r.noteResults([{ id: 'read1', function: { name: 'local_file_read' } }], [{ content: 'source' }]);
 m = r.onStop(m, '{private invalid payload', receipts);
 assert.equal(r.state.phase, 'review');
 assert.match(m.at(-1).content, /invalid_json/);
 assert.match(m.at(-1).content, /read1/);
 assert.ok(!m.at(-1).content.includes('private invalid payload'));
 assert.equal(r.state.rounds, 1);
 r = createEngineeringReview({ enabled: true, originalMessages, checkpoint: { engineering_review: r.state } });
 r.beforeRound(m);
 r.onStop(m, verdict('pass'), receipts);
 assert.equal(r.state.outcome, 'pass');
 assert.equal(r.state.repairs, 0);
});

test('correction cannot extend time, rounds, or repeat after resume', () => {
 for (const bound of ['rounds', 'time', 'retry']) {
  let now = 100;
  let r = createEngineeringReview({ enabled: true, originalMessages, now: () => now });
  let m = r.onStop([...originalMessages], 'candidate', receipts);
  if (bound === 'rounds') for (let i = 0; i < LIMITS.reviewRounds; i++) r.beforeRound(m);
  if (bound === 'time') now += LIMITS.durationMs;
  if (bound === 'retry') {
   r.beforeRound(m);
   m = r.onStop(m, '{}', receipts);
   r = createEngineeringReview({ enabled: true, originalMessages, checkpoint: { engineering_review: r.state }, now: () => now });
  }
  r.onStop(m, '{}', receipts);
  assert.equal(r.state.phase, 'final');
  assert.equal(r.state.outcome, 'inconclusive');
  assert.equal(r.state.repairs, 0);
 }
});

test('review schema offers only successfully inspected references without leaking across reviews', () => {
 const r=createEngineeringReview({enabled:true,originalMessages});
 r.onStop([...originalMessages],'candidate',receipts);
 const checkSchema=review=>review.schemas(tools).find(t=>t.function.name==='engineering_review_submit').function.parameters.properties.checks;
 assert.equal(checkSchema(r).maxItems,0);
 r.noteResults([{id:'good',function:{name:'tool_result_read'}},{id:'bad',function:{name:'local_file_read'}}],[{result_ref:'original'},{ok:false,error:{code:'missing'}}]);
 const schema=checkSchema(r);
 assert.deepEqual(schema.items.properties.result_ref.enum,['good','original']);
 assert.equal(schema.maxItems,12);
 schema.items.properties.result_ref.enum.push('forged');
 assert.deepEqual(checkSchema(r).items.properties.result_ref.enum,['good','original']);
 const resumed=createEngineeringReview({enabled:true,originalMessages,checkpoint:{engineering_review:r.state}});
 assert.deepEqual(checkSchema(resumed).items.properties.result_ref.enum,['good','original']);
 const other=createEngineeringReview({enabled:true,originalMessages});other.onStop([...originalMessages],'candidate',receipts);
 assert.equal(checkSchema(other).maxItems,0);
});

test('review and repair never receive a deadline beyond the parent delivery reserve',()=>{
 let now=100000;
 const r=createEngineeringReview({enabled:true,originalMessages,taskDeadline:now+180000,now:()=>now});
 let messages=r.onStop([...originalMessages],'candidate',receipts);
 assert.equal(r.state.deadline,220000);
 now=220001;messages=r.beforeRound(messages);
 assert.equal(r.state.phase,'final');assert.equal(r.state.outcome,'inconclusive');
 assert.match(r.completionNotice(),/budget was exhausted/);
 const resumed=createEngineeringReview({enabled:true,originalMessages,taskDeadline:200000,checkpoint:{engineering_review:{...r.state,phase:'review',deadline:999999,actor:[...originalMessages]}},now:()=>now});
 assert.equal(resumed.state.deadline,140000,'resume cannot enlarge the parent budget');
});
test('late completed work is delivered with an inconclusive notice without another inference',()=>{
 const r=createEngineeringReview({enabled:true,originalMessages,taskDeadline:150000,now:()=>100000});
 assert.equal(r.onStop([...originalMessages],'candidate',receipts),null);
 assert.equal(r.state.phase,'final');assert.equal(r.state.reviews,0);assert.equal(r.state.repairs,0);
 assert.equal(r.state.outcome,'inconclusive');assert.match(r.completionNotice(),/reserved for delivery/);
});
