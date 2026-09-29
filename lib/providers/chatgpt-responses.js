const { readBoundedResponse } = require('../bounded-response');
const BASE = 'https://api.openai.com/v1';
const failure = (code, message) => Object.assign(new Error(message), { code, retryable: false });
const limitMessages = {
 subscription_sharing_usage_limit_exceeded: 'ChatGPT plan usage limit reached. Review usage in ChatGPT or explicitly choose another provider.',
 subscription_sharing_usage_unavailable: 'ChatGPT plan usage is unavailable for this account. Review permissions and eligibility in ChatGPT.'
};
function providerError(code, status) {
 return failure(Object.hasOwn(limitMessages, code) ? code : 'chatgpt_provider_error', (Object.hasOwn(limitMessages, code) ? limitMessages[code] : null) || `ChatGPT could not complete this request${status ? ` (HTTP ${status})` : ''}. Reconnect for authentication errors; check your plan permission and model access. No API-key fallback was used.`);
}
function requestBody({ model, messages, tools = [] }) {
 const input = [];
 for (const message of messages) {
  if (Array.isArray(message.responses_output)) { input.push(...message.responses_output); continue; }
  if (message.role === 'tool') {
   input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: String(message.content || '') }); continue;
  }
  if (!['system', 'developer', 'user', 'assistant'].includes(message.role)) throw failure('chatgpt_invalid_input', 'Unsupported message role.');
  if (message.content) input.push({ role: message.role === 'system' ? 'developer' : message.role, content: String(message.content) });
  for (const call of message.tool_calls || []) input.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments, namespace: 'ai_chat' });
 }
 return {
  model, input, store: false, stream: true,
  ...(tools.length ? { tools: [{ type: 'namespace', name: 'ai_chat', description: 'Tools executed by AI Chat under its local permission policy.', tools: tools.map(t => {
   if (t.type !== 'function' || !t.function?.name) throw failure('chatgpt_unsupported_tool', 'Only local function tools are supported.');
   return { type: 'function', name: t.function.name, description: t.function.description || '', parameters: t.function.parameters, strict: false };
  }) }] } : {})
 };
}
async function listModels({ lease, fetchFn = fetch, signal }) {
 const response = await fetchFn(`${BASE}/models`, { headers: { Authorization: `Bearer ${lease.accessToken}` }, redirect: 'error', signal: signal || AbortSignal.timeout(15000) });
 const raw = await readBoundedResponse(response, 1024 * 1024, 'chatgpt_models_too_large');
 let data; try { data = JSON.parse(raw); } catch { throw failure('chatgpt_invalid_catalog', 'ChatGPT returned an invalid model catalog.'); }
 if (!response.ok) throw providerError(data.error?.code, response.status);
 if (!Array.isArray(data.models)) throw failure('chatgpt_invalid_catalog', 'ChatGPT returned an invalid model catalog.');
 return data.models.filter(m => m && m.visibility === 'list' && typeof m.slug === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(m.slug)).slice(0, 200).map(m => ({ slug: m.slug, display_name: String(m.display_name || m.slug).slice(0, 200) }));
}
// The transport yields provider-neutral records, while retaining opaque output
// items for the next tool round. Only a completed response authorizes tool use.
async function* stream({ lease, model, messages, tools, fetchFn = fetch, signal, onConnect = () => {}, onActivity = () => {} }) {
 const response = await fetchFn(`${BASE}/responses`, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${lease.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody({ model, messages, tools })), signal });
 onConnect(response.status);
 if (!response.ok) {
  const raw = await readBoundedResponse(response, 256 * 1024, 'chatgpt_error_too_large');
  let code; try { code = JSON.parse(raw).error?.code; } catch {}
  throw providerError(code, response.status);
 }
 if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw failure('chatgpt_invalid_stream', 'ChatGPT did not return an event stream.');
 const reader = response.body.getReader(); const decoder = new TextDecoder();
 let buffer = ''; let lines = []; let eventSize = 0; let completed = false;
 let outputBytes = 0;
 function parseEvent() {
  const data = lines.join('\n'); lines = []; eventSize = 0;
  if (!data) return null;
  let event; try { event = JSON.parse(data); } catch { throw failure('chatgpt_invalid_stream', 'ChatGPT returned malformed event data.'); }
  return event;
 }
 function normalize(event) {
  if (!event) return null;
  if (completed) throw failure('chatgpt_invalid_stream', 'ChatGPT sent data after completion.');
  if (['response.failed', 'response.incomplete', 'error'].includes(event.type)) throw providerError(event.response?.error?.code || event.code || event.error?.code);
  if (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') return { choices: [{ delta: { content: String(event.delta || '') } }] };
  if (event.type === 'response.reasoning_summary_text.delta') return { choices: [{ delta: { reasoning_content: String(event.delta || '') } }] };
  if (event.type === 'response.completed') {
   const result = event.response;
   if (!result || result.status !== 'completed' || !Array.isArray(result.output)) throw failure('chatgpt_invalid_stream', 'ChatGPT returned an invalid completion.');
   const calls = result.output.filter(item => item.type === 'function_call');
   const ids = new Set();
   for (const call of calls) {
    if (!call.call_id || ids.has(call.call_id) || call.namespace && call.namespace !== 'ai_chat' || typeof call.name !== 'string' || typeof call.arguments !== 'string') throw failure('chatgpt_invalid_tool_call', 'ChatGPT returned an invalid or duplicate function call.');
    ids.add(call.call_id);
   }
   if (result.output.some(item => !['message', 'reasoning', 'function_call'].includes(item.type))) throw failure('chatgpt_unsupported_output', 'ChatGPT returned an unsupported tool or output item.');
   completed = true;
   return { done: true, model: result.model, usage: result.usage, responses_output: result.output,
    choices: [{ finish_reason: calls.length ? 'tool_calls' : 'stop', delta: { tool_calls: calls.map((call, index) => ({ index, id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } }] };
  }
  return null;
 }
 try {
  while (!completed) {
   signal?.throwIfAborted();
   const { value, done } = await reader.read();
   onActivity();
   buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
   let newline;
   while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
    if (Buffer.byteLength(line) > 2 * 1024 * 1024) throw failure('chatgpt_record_too_large', 'ChatGPT event exceeded the bounded stream size.');
    if (line === '') {
     const record = normalize(parseEvent());
     if (record) { outputBytes += Buffer.byteLength(JSON.stringify(record)); if (outputBytes > 16 * 1024 * 1024) throw failure('chatgpt_output_too_large', 'ChatGPT response exceeded the output limit.'); yield record; }
     if (completed) break;
    } else if (line.startsWith('data:')) {
     const data = line.slice(5).replace(/^ /, ''); eventSize += Buffer.byteLength(data);
     if (eventSize > 2 * 1024 * 1024) throw failure('chatgpt_record_too_large', 'ChatGPT event exceeded the bounded stream size.');
     lines.push(data);
    }
   }
   if (!completed && Buffer.byteLength(buffer) + eventSize > 2 * 1024 * 1024) throw failure('chatgpt_record_too_large', 'ChatGPT event exceeded the bounded stream size.');
   if (done && !completed) throw failure('chatgpt_stream_interrupted', 'ChatGPT stream ended without response.completed. Partial output was preserved.');
  }
 } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
module.exports = { requestBody, listModels, stream };
