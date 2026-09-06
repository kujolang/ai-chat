// Live RAG + real AI Chat SSE/tool loop; the model response is a local fixture.
// AI_CHAT_RAG_URL must point to the running documentation pilot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { once } = require('node:events');
const { createServerRuntime } = require('../lib/server-runtime');
const { ragToolSchema } = require('../lib/rag-runtime');
async function main() {
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-rag-smoke-'));
 const observations=[];
 const ragUrl=process.env.AI_CHAT_RAG_URL;
 assert.ok(ragUrl,'Set AI_CHAT_RAG_URL');
 const runtime=createServerRuntime({projectRoot:path.resolve(__dirname,'..'),env:{
  PATH:process.env.PATH, HOME:tmp, DB_PATH:path.join(tmp,'chat.db'), ENCRYPTION_SECRET:'fixture-only-secret', API_AUTH_TOKEN:'fixture-only-token',
  AI_CHAT_RAG_URL:ragUrl, AI_CHAT_RAG_SUPPORTS_PREFERENCES:'1', AI_CHAT_SKILLS_ENABLED:'0', BROWSER_ENABLED:'0',
  WATCHDOG_TELEMETRY_URL:'',CODEX_MODEL_CACHE_PATH:path.join(tmp,'missing'), MODEL_CONTEXT_METADATA_PATH:path.join(tmp,'missing-context'),
 },fetchFn:async (url,options) => {
  if (String(url)===ragUrl.replace(/\/$/,'')+'/query') {
   observations.push({kind:'retrieval',body:JSON.parse(options.body)});
   return fetch(url,options);
  }
  if (!String(url).endsWith('/chat/completions')) return new Response('{"ok":true}');
  const payload=JSON.parse(options.body);
  assert.equal(payload.retrieval_preferences,undefined);
  assert.equal(options.headers['Accept-Language'],undefined);
  const toolMessages=payload.messages.filter(message=>message.role==='tool');
  let frame;
  if (!toolMessages.length) frame={choices:[{delta:{tool_calls:[{index:0,id:'documentation-call',type:'function',function:{name:'documentation_query',arguments:JSON.stringify({query:'How do I query the RAG API?'})}}]},finish_reason:'tool_calls'}]};
  else {
   observations.push({kind:'model_input',messages:toolMessages});
   frame={choices:[{delta:{content:'Documentation verified.'},finish_reason:'stop'}]};
  }
  return new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`,{headers:{'Content-Type':'text/event-stream'}});
 }});
 const server=http.createServer(runtime.app);server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const state=runtime.helpers.readState();const profile=state.settings.profiles[0];profile.provider_id='openai';profile.api_key='fixture-only-key';
  state.chats[0].retrieval_preferences={programming_language:'javascript'};
  runtime.helpers.writeState(state);
  const chat=state.chats[0];
  for (const preferences of [undefined,{programming_language:'python'},{}]) {
   const start=observations.length;
   const payload={profile_id:profile.id,model:'gpt-4.1-mini',chat_id:chat.id,messages:[{role:'user',content:'Read documentation'}],tools:[ragToolSchema],include_saved_runtime_presets:false};
   if (preferences!==undefined) payload.retrieval_preferences=preferences;
   const response=await fetch(`http://127.0.0.1:${server.address().port}/api/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json','X-API-Token':'fixture-only-token'},body:JSON.stringify(payload)});
   const text=await response.text();assert.equal(response.status,200);assert.ok(text.includes('Documentation verified.'),text);
   const current=observations.slice(start);assert.equal(current.filter(item=>item.kind==='retrieval').length,1);
   const input=current.find(item=>item.kind==='model_input');assert.ok(input);
   const content=JSON.stringify(input.messages);
   const language=preferences===undefined?'javascript':preferences.programming_language;
   assert.equal(content.includes('import urllib.request'),language!=='javascript');
   assert.equal(content.includes('const response'),language!=='python');
   assert.ok(content.includes('namespace selection does not grant permission'));
  }
  console.log(JSON.stringify({ok:true,requests:observations.filter(item=>item.kind==='retrieval').length,saved_default:true,task_override:true,explicit_clear:true,model_input:observations.filter(item=>item.kind==='model_input')}));
 } finally {
  await runtime.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
