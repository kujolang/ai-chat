const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRagRuntime } = require('../lib/rag-runtime');
const { normalize, resolve } = require('../public/retrieval-preferences');

test('task preference normalization and explicit clearing suppress saved defaults', () => {
 const saved = {programming_language:'typescript'};
 assert.deepEqual(resolve({}, saved), saved);
 for (const clear of [{}, null, {programming_language:''}, {programming_language:'rust\r\nX-Test: 1'}]) assert.deepEqual(resolve({retrieval_preferences:clear}, saved), {});
 assert.deepEqual(resolve({retrieval_preferences:{programming_language:' Python '}}, saved), {programming_language:'python'});
 assert.deepEqual(normalize({programming_language:'c++'}), {programming_language:'cpp'});
 assert.deepEqual(normalize({programming_language:'new_lang-2'}), {programming_language:'new_lang-2'});
});

test('RAG sends one supported request and preserves shared evidence without altering unrelated traffic', async () => {
 for (const supports of ['0','1']) {
  const calls = [];
  const runtime = createRagRuntime({env:{AI_CHAT_RAG_URL:'http://127.0.0.1:8787',AI_CHAT_RAG_SUPPORTS_PREFERENCES:supports}, fetchFn:async (url, options) => {
   calls.push({url,options});
   return new Response(JSON.stringify({ok:true,data:{citations:[{chunk_id:'x',path:'guide.md',line_start:2,line_end:8,text:'Example and shared warning'}]}}), {headers:{'Content-Type':'application/json'}});
  }});
  const result = await runtime.execute({query:'query'}, {retrieval_preferences:{programming_language:'python'}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'http://127.0.0.1:8787/query');
  assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers['Accept-Language'],undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), supports === '1' ? {query:'query',retrieval_preferences:{programming_language:'python'}} : {query:'query'});
  assert.equal(result.citations[0].text,'Example and shared warning');
  assert.equal(result.citations[0].line_end,8);
 }
});

test('RAG errors do not retry or expose credentials and empty matches stay empty', async () => {
 let calls=0;
 const runtime=createRagRuntime({env:{AI_CHAT_RAG_URL:'https://docs.example',AI_CHAT_RAG_TOKEN:'fixture-only'},fetchFn:async () => {calls++;throw new Error('fixture-only');}});
 await assert.rejects(runtime.execute({query:'query'}), error => error.code === 'rag_transport_failed' && !error.message.includes('fixture-only'));
 assert.equal(calls,1);
 const empty=createRagRuntime({env:{AI_CHAT_RAG_URL:'https://docs.example'},fetchFn:async () => new Response(JSON.stringify({ok:true,data:{citations:[]}}))});
 assert.deepEqual(await empty.execute({query:'query'}), {ok:true,citations:[],count:0});
});

test('RAG preserves public source URLs while retaining local citation ranges', async () => {
 for (const source of ['https://docs.kujolang.ai/quickstart/', 'local_docs', 'javascript:alert(1)', 'https://secret:password@example.com/']) {
  const runtime = createRagRuntime({env:{AI_CHAT_RAG_URL:'http://127.0.0.1:8787'}, fetchFn:async () => new Response(JSON.stringify({ok:true,data:{citations:[{path:'snapshot.md',text:'Published docs',line_start:4,line_end:9,source_system:source}]}}))});
  const result = await runtime.execute({query:'quickstart'});
  assert.equal(result.citations[0].source_url, source.startsWith('https://docs.kujolang.ai/') ? source : undefined);
  assert.equal(result.citations[0].path, 'snapshot.md');
  assert.equal(result.citations[0].line_start, 4);
 }
});
