const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const http = require('node:http'); const crypto = require('node:crypto'); const { once } = require('node:events');
const { createServerRuntime } = require('../lib/server-runtime');
const { createConnectionStore } = require('../lib/connections/connection-store');
const secret = 'fixture-encryption-secret-long-enough'; const token = 'fixture-app-token';
const terminal = output => ({ type: 'response.completed', response: { status: 'completed', model: 'fixture', output, usage: { input_tokens: 3, output_tokens: 2 } } });
function sse(events) { return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }); }
const parse = text => text.split('\n\n').filter(part => part.split('\n').some(l => l.startsWith('event:'))).map(part => ({ event: part.split('\n').find(l => l.startsWith('event:')).slice(7), data: JSON.parse(part.split('\n').find(l => l.startsWith('data:')).slice(6)) }));
async function fixture(t, responder, options = {}) {
 const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-plan-routes-'))); const id = `connection-${crypto.randomUUID()}`;
 const store = createConnectionStore({ directory: path.join(root, 'credentials'), secret });
 store.save({ id, status: 'connected', issuer: 'https://auth.openai.com', client_id: 'oaiapp_fixture', subject: 'fixture-subject', label: 'fixture', scopes: options.identityOnly ? ['openid'] : ['openid', 'chatgpt.tokens.use.direct'], access_token: 'fixture-oauth-access', refresh_token: '', expires_at: Date.now() + 3600000, binding_epoch: 1 }); store.close();
 const calls = [];
 const runtime = createServerRuntime({ env: { API_AUTH_TOKEN: token, ENCRYPTION_SECRET: secret, CHATGPT_SIGN_IN_ENABLED: options.disabled ? '0' : '1', CHATGPT_CREDENTIAL_DIR: root, AI_CHAT_HOST: '127.0.0.1', DB_PATH: path.join(root, 'app.db'), DB_BACKUP_DIR: path.join(root, 'backups'), AUDIT_LOG_PATH: path.join(root, 'audit.jsonl'), BENCHMARK_OUTPUT_DIR: path.join(root, 'benchmark'), CODEX_HOME: root, AI_SDK_PATH: path.join(root, 'missing-sdk'), STREAM_HEARTBEAT_MS: '0' }, projectRoot: path.resolve(__dirname, '..'), warnFn() {}, fetchFn: async (url, init) => { calls.push({ url, init }); return responder(url, init, calls.length); }, skillRuntimeOptions: { homeDir: root } });
 runtime.db.prepare("INSERT INTO profiles (id,name,provider_id,connection_id,created_at,updated_at,models_csv) VALUES ('plan','Plan','openai_chatgpt_plan',?,?,?,'fixture')").run(id, Date.now(), Date.now());
 const server = http.createServer(runtime.app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
 t.after(async () => { await runtime.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
 const base = `http://127.0.0.1:${server.address().port}`;
 const request = (url, body, headers = {}) => fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-API-Token': token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
 const body = { profile_id: 'plan', model: 'fixture', messages: [{ role: 'user', content: 'What time is it?' }], include_saved_runtime_presets: false };
 return { runtime, root, id, calls, base, request, body };
}
test('ChatGPT routes remain behind App Access/Origin checks and export only connection references', async t => {
 const f = await fixture(t, async () => { throw new Error('Unexpected upstream'); });
 assert.equal((await fetch(`${f.base}/api/connections/chatgpt`)).status, 401);
 assert.equal((await f.request('/api/connections/chatgpt/login', {}, { Origin: 'https://evil.invalid' })).status, 403);
 const connections = await (await f.request('/api/connections/chatgpt')).json(); assert.equal(connections.connections[0].id, f.id);
 const state = await (await f.request('/api/state')).json();
 assert.equal(state.state.settings.profiles.find(p => p.id === 'plan').connection_id, f.id);
 assert.doesNotMatch(JSON.stringify({ state, connections }), /fixture-oauth-access|fixture-subject|oaiapp_fixture|refresh_token/);
 assert.equal((await f.request('/api/connections/chatgpt/host/disconnect', {})).status, 400);
});
test('ChatGPT JSON auxiliary route collects mandatory Responses stream with no Kujo or API key', async t => {
 const f = await fixture(t, async () => sse([{ type: 'response.output_text.delta', delta: 'Hello' }, terminal([])]));
 const result = await (await f.request('/api/chat', f.body)).json(); assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.output_text, 'Hello'); assert.equal(result.billing_source, 'chatgpt_plan');
 assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, 'https://api.openai.com/v1/responses');
 const payload = JSON.parse(f.calls[0].init.body); assert.equal(payload.stream, true); assert.equal(payload.store, false); assert.equal(payload.temperature, undefined);
 assert.equal(f.calls[0].init.headers.Authorization, 'Bearer fixture-oauth-access');
});
test('ChatGPT neutral tools keep namespaced protocol history and journal receipts across rounds', async t => {
 const output = [{ type: 'reasoning', id: 'reasoning1', summary: [], encrypted_content: 'opaque' }, { type: 'function_call', id: 'fc1', call_id: 'call_time', namespace: 'ai_chat', name: 'system_time', arguments: '{}' }];
 const f = await fixture(t, async (_url, init, count) => {
  const payload = JSON.parse(init.body);
  assert.equal(payload.tools[0].type, 'namespace');
  if (count === 1) return sse([terminal(output)]);
  assert.deepEqual(payload.input.filter(i => ['reasoning', 'function_call'].includes(i.type)), output);
  assert.equal(payload.input.find(i => i.type === 'function_call_output').call_id, 'call_time');
  return sse([{ type: 'response.output_text.delta', delta: 'Done' }, terminal([])]);
 });
 const events = parse(await (await f.request('/api/chat/stream', { ...f.body, request_id: 'plan-tools', tools: [{ type: 'function', function: { name: 'system_time', parameters: { type: 'object', properties: {} } } }] })).text());
 assert.equal(events.filter(e => e.event === 'error').length, 0, JSON.stringify(events)); assert.equal(events.find(e => e.event === 'done').data.output_text, 'Done'); assert.equal(f.calls.length, 2);
 const execution = await (await f.request('/api/executions/plan-tools')).json(); assert.equal(execution.receipts.length, 1); assert.equal(execution.receipts[0].status, 'completed');
 assert.deepEqual(execution.execution.request.connection_binding, { connection_id: f.id, binding_epoch: 1, billing_source: 'chatgpt_plan', harness: 'ai_chat' });
 assert.doesNotMatch(JSON.stringify(execution), /fixture-oauth-access/);
});
for (const mode of ['identityOnly', 'disabled']) test(`ChatGPT ${mode} never falls back to a key or another provider`, async t => {
 const f = await fixture(t, async () => { throw new Error('Must not dispatch'); }, { [mode]: true });
 const events = parse(await (await f.request('/api/chat/stream', f.body)).text());
 assert.ok(events.some(e => e.event === 'error')); assert.equal(f.calls.length, 0);
});
test('ChatGPT late usage failure preserves partial output, blocks tools, and rejects changed-connection resume', async t => {
 const f = await fixture(t, async () => sse([{ type: 'response.output_text.delta', delta: 'Partial' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]));
 const events = parse(await (await f.request('/api/chat/stream', { ...f.body, request_id: 'plan-partial' })).text());
 assert.equal(events.find(e => e.event === 'token').data.delta, 'Partial'); assert.equal(events.find(e => e.event === 'error').data.code, 'subscription_sharing_usage_limit_exceeded'); assert.equal(events.some(e => e.event === 'done'), false);
 f.runtime.db.prepare('UPDATE profiles SET connection_id=? WHERE id=?').run(`connection-${crypto.randomUUID()}`, 'plan');
 const resumed = parse(await (await f.request('/api/executions/plan-partial/resume', {})).text()); assert.ok(resumed.some(e => e.event === 'error')); assert.equal(f.calls.length, 1);
});
test('ChatGPT profiles survive full state and incremental persistence with credentials excluded', async t => {
 const f = await fixture(t, async () => { throw new Error('Unexpected'); });
 const initial = await (await f.request('/api/state')).json();
 const updated = await f.request('/api/state/changes', { base_version: initial.state.stateVersion, changes: [{ type: 'profile_upsert', profile: { id: 'plan', name: 'Renamed', provider_id: 'openai_chatgpt_plan', connection_id: f.id, base_url: '', models_csv: 'fixture' } }] }); assert.equal(updated.status, 200, await updated.text());
 assert.equal(f.runtime.helpers.readState().settings.profiles.find(p => p.id === 'plan').connection_id, f.id);
 const full = f.runtime.helpers.readState();
 const saved = await fetch(`${f.base}/api/state`, { method: 'PUT', headers: { 'X-API-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(full) }); assert.equal(saved.status, 200, await saved.text());
 assert.equal(f.runtime.helpers.readState().settings.profiles.find(p => p.id === 'plan').connection_id, f.id);
 const switched = await f.request('/api/state/changes', { changes: [{ type: 'profile_upsert', profile: { id: 'plan', name: 'Other', provider_id: 'openai_chatgpt_plan', connection_id: `connection-${crypto.randomUUID()}` } }] }); assert.equal(switched.status, 400);

 const invalid = await f.request('/api/state/changes', { changes: [{ type: 'profile_upsert', profile: { id: 'plan', name: 'Unsafe', provider_id: 'openai_chatgpt_plan', api_key: 'should-reject', connection_id: f.id } }] }); assert.equal(invalid.status, 400);
});

test('disconnect cancels active plan streams and blocks later dispatch', async t => {
 let started; const ready = new Promise(resolve => { started = resolve; });
 const f = await fixture(t, async (_url, init) => {
  started();
  return new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true }); } }), { headers: { 'content-type': 'text/event-stream' } });
 });
 const pending = f.request('/api/chat/stream', { ...f.body, request_id: 'disconnect-stream' }).then(r => r.text());
 await ready;
 const disconnected = await (await f.request(`/api/connections/chatgpt/${f.id}/disconnect`, {})).json(); assert.equal(disconnected.disconnected, true);
 const events = parse(await pending); assert.equal(events.find(e => e.event === 'error').data.code, 'stream_cancelled');
 const next = await (await f.request('/api/chat', f.body)).json(); assert.equal(next.ok, false); assert.equal(f.calls.length, 1);
});

test('ChatGPT fetch cause is classified safely and persisted without replay', async t => {
 const f = await fixture(t, async () => {
  throw new TypeError('fetch failed secret-token', {cause:Object.assign(Error('private address secret-token'),{code:'UND_ERR_CONNECT_TIMEOUT'})});
 });
 const events=parse(await(await f.request('/api/chat/stream',{...f.body,request_id:'plan-connect-timeout'})).text());
 const error=events.find(e=>e.event==='error').data;
 assert.equal(error.code,'chatgpt_connect_timeout');
 assert.doesNotMatch(JSON.stringify(events),/secret-token|private address/);
 assert.equal(f.calls.length,1);
 assert.equal(events.some(e=>e.event==='done'),false);
 const saved=await(await f.request('/api/executions/plan-connect-timeout')).json();
 assert.equal(saved.execution.result.code,'chatgpt_connect_timeout');
 assert.equal(saved.execution.result.retryable,false);
});
