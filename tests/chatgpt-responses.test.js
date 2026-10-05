const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestBody, stream, listModels } = require('../lib/providers/chatgpt-responses');
const lease = { accessToken: 'test-only-token' };
const complete = output => ({ type: 'response.completed', response: { status: 'completed', model: 'test-model', output, usage: { input_tokens: 4, output_tokens: 8 } } });
const text = delta => ({ type: 'response.output_text.delta', delta });
function sse(events, chunkSize = 7) {
 const bytes = new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(''));
 let offset = 0;
 return new Response(new ReadableStream({ pull(controller) { if (offset === bytes.length) return controller.close(); controller.enqueue(bytes.slice(offset, offset += Math.min(chunkSize, bytes.length - offset))); } }), { headers: { 'content-type': 'text/event-stream' } });
}
const collect = async iterator => { const result = []; for await (const value of iterator) result.push(value); return result; };

test('ChatGPT request allowlist separates Responses input and namespaced neutral tools from API-key parameters', () => {
 const body = requestBody({ model: 'test', messages: [{ role: 'system', content: 'Rules' }, { role: 'user', content: 'hello' }], tools: [{ type: 'function', function: { name: 'system_time', parameters: { type: 'object' } } }], temperature: 1, max_tokens: 200 });
 assert.deepEqual(Object.keys(body).sort(), ['input', 'model', 'store', 'stream', 'tools']);
 assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.input[0].role, 'developer');
 assert.equal(body.tools[0].type, 'namespace'); assert.equal(body.tools[0].name, 'ai_chat'); assert.equal(body.tools[0].tools[0].strict, false);
 assert.throws(() => requestBody({ model: 'test', messages: [], tools: [{ type: 'mcp' }] }), { code: 'chatgpt_unsupported_tool' });
});
test('ChatGPT fragmented UTF-8 stream preserves opaque reasoning, call IDs, usage and completion', async () => {
 const output = [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'opaque', summary: [] }, { type: 'function_call', namespace: 'ai_chat', name: 'system_time', call_id: 'call_1', arguments: '{}' }];
 let outbound;
 const events = await collect(stream({ lease, model: 'test', messages: [{ role: 'user', content: 'hello' }], fetchFn: async (url, init) => { outbound = { url, init }; return sse([text('Hello 🌍'), complete(output)], 1); } }));
 assert.equal(events[0].choices[0].delta.content, 'Hello 🌍');
 assert.equal(events[1].choices[0].delta.tool_calls[0].id, 'call_1'); assert.equal(events[1].done, true);
 assert.equal(outbound.url, 'https://api.openai.com/v1/responses'); assert.equal(outbound.init.redirect, 'error');
 const continued = requestBody({ model: 'test', messages: [{ role: 'assistant', responses_output: events[1].responses_output }, { role: 'tool', tool_call_id: 'call_1', content: '{"now":"today"}' }] });
 assert.deepEqual(continued.input.slice(0, 2), output); assert.equal(continued.input[2].type, 'function_call_output');
});
for (const kind of ['response.failed', 'response.incomplete', 'error', 'eof']) test(`ChatGPT ${kind} never authorizes tool execution or reports success`, async () => {
 const events = [text('partial')]; if (kind !== 'eof') events.push({ type: kind, response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'secret upstream detail' } } });
 const received = [];
 await assert.rejects(async () => { for await (const r of stream({ lease, model: 'test', messages: [], fetchFn: async () => sse(events) })) received.push(r); }, error => { assert.doesNotMatch(error.message, /secret upstream detail/); return true; });
 assert.equal(received.length, 1); assert.equal(received[0].done, undefined);
});
test('ChatGPT model catalog uses account-specific models shape, display names and visibility', async () => {
 let calls = 0;
 const models = await listModels({ lease, fetchFn: async (url, init) => { calls++; assert.equal(url, 'https://api.openai.com/v1/models'); assert.equal(init.headers.Authorization, 'Bearer test-only-token'); return new Response(JSON.stringify({ models: [{ slug: 'shown', display_name: 'Shown Model', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }] })); } });
 assert.equal(calls, 1); assert.deepEqual(models, [{ slug: 'shown', display_name: 'Shown Model' }]);
});
test('ChatGPT rejects duplicate and foreign namespace tool calls', async () => {
 for (const output of [[{ type: 'function_call', call_id: 'a', namespace: 'foreign', name: 'system_time', arguments: '{}' }], [{ type: 'function_call', call_id: 'a', name: 'system_time', arguments: '{}' }, { type: 'function_call', call_id: 'a', name: 'system_time', arguments: '{}' }]]) {
  await assert.rejects(collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => sse([complete(output)]) })), { code: 'chatgpt_invalid_tool_call' });
 }
});
test('ChatGPT malformed and oversized records fail closed', async () => {
 for (const data of ['data: {invalid}\n\n', `data: ${'x'.repeat(2 * 1024 * 1024 + 1)}\n\n`]) {
  await assert.rejects(collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => new Response(data, { headers: { 'content-type': 'text/event-stream' } }) })));
 }
});

test('ChatGPT record limits count UTF-8 bytes including fragmented unfinished records', async () => {
 const wire = `data: ${JSON.stringify(text('界'.repeat(750000)))}\n\n`;
 for (const chunkSize of [wire.length * 4, 65536]) {
  const events = sse([text('界'.repeat(750000))], chunkSize);
  await assert.rejects(collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => events })), { code: 'chatgpt_record_too_large' });
 }
});

test('ChatGPT accepts many bounded events delivered in one large transport chunk', async () => {
 const events = Array.from({ length: 2200 }, () => text('x'.repeat(1000)));
 events.push(complete([]));
 const result = await collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => sse(events, 4 * 1024 * 1024) }));
 assert.equal(result.length, 2201);
 assert.equal(result.at(-1).done, true);
 assert.equal(result.slice(0, -1).reduce((sum, event) => sum + event.choices[0].delta.content.length, 0), 2200000);
});

test('ChatGPT aggregate output limit counts multibyte content', async () => {
 const events = Array.from({ length: 60 }, () => text('界'.repeat(100000)));
 events.push(complete([]));
 await assert.rejects(collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => sse(events, 400000) })), { code: 'chatgpt_output_too_large' });
});

test('ChatGPT accepts validated SSE without Content-Type and normalizes MIME case', async () => {
 for (const mediaType of [null, 'Text/Event-Stream; charset=utf-8']) {
  const response = sse([text('OK'), complete([])]);
  if (mediaType === null) response.headers.delete('content-type');
  else response.headers.set('content-type', mediaType);
  const records = await collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => response }));
  assert.equal(records[0].choices[0].delta.content, 'OK');
  assert.equal(records.at(-1).done, true);
 }
});

test('ChatGPT missing Content-Type never accepts HTML, JSON, malformed SSE or missing completion', async () => {
 for (const wire of ['<!doctype html><html>not a stream</html>', '{"ok":true}', 'data: {broken}\n\n', `data: ${JSON.stringify(text('partial'))}\n\n`]) {
  const response = new Response(new TextEncoder().encode(wire));
  assert.equal(response.headers.get('content-type'), null);
  const records = [];
  await assert.rejects(async () => { for await (const record of stream({ lease, model: 'test', messages: [], fetchFn: async () => response })) records.push(record); });
  assert.ok(records.every(record => !record.done && !record.choices?.[0]?.delta?.tool_calls));
 }
});

test('ChatGPT explicit non-SSE response is cancelled with bounded safe diagnostics', async () => {
 let cancelled = false;
 const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } });
 await assert.rejects(collect(stream({ lease, model: 'test', messages: [], fetchFn: async () => response })), error => {
  assert.equal(error.code, 'chatgpt_invalid_stream');
  assert.match(error.message, /HTTP 200; application\/json/);
  return true;
 });
 assert.equal(cancelled, true);
});

test('ChatGPT preserves completed streaming items when terminal output is empty', async () => {
 const item = {type:'function_call',namespace:'ai_chat',name:'system_time',call_id:'call_1',arguments:'{}'};
 const done = {type:'response.output_item.done',output_index:0,item};
 const records = await collect(stream({lease,model:'test',messages:[],fetchFn:async()=>sse([done,complete([])],1)}));
 assert.equal(records.length,1);
 assert.deepEqual(records[0].responses_output,[item]);
 assert.equal(records[0].choices[0].delta.tool_calls[0].id,'call_1');
 // A populated final envelope must not duplicate already received calls.
 const populated = await collect(stream({lease,model:'test',messages:[],fetchFn:async()=>sse([done,complete([item])])}));
 assert.equal(populated[0].choices[0].delta.tool_calls.length,1);
 for (const ending of [[],[{type:'response.incomplete'}]]) {
  const received=[];
  await assert.rejects(async()=>{for await(const r of stream({lease,model:'test',messages:[],fetchFn:async()=>sse([done,...ending])}))received.push(r);});
  assert.equal(received.length,0);
 }
});

test('ChatGPT rejects invalid completed streaming items and retains aggregate bounds', async () => {
 const done = (index,item)=>({type:'response.output_item.done',output_index:index,item});
 for(const events of [[done(-1,{})],[done(0,{}),done(0,{})],[done(0,{type:'function_call',namespace:'foreign',call_id:'a',name:'x',arguments:'{}'}),complete([])]]) {
  await assert.rejects(collect(stream({lease,model:'test',messages:[],fetchFn:async()=>sse(events)})));
 }
 const events=Array.from({length:18},(_,i)=>done(i,{type:'reasoning',encrypted_content:'x'.repeat(1024*1024)}));
 await assert.rejects(collect(stream({lease,model:'test',messages:[],fetchFn:async()=>sse(events,1024*1024)})),{code:'chatgpt_output_too_large'});
});
