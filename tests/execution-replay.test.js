const { test } = require("node:test");
const assert = require("node:assert/strict");
const { replayExecution } = require("../public/execution-replay");
test("cursor replay emits only unseen durable events and waits for the original execution", async () => {
	const seen = [];
	let reads = 0;
	const result = await replayExecution({ after: 2, pollMs: 1, fetchPage: async (cursor) => {
		reads++;
		if (reads === 1) { assert.equal(cursor, 2); return { status: "running", events: [{ sequence: 2, event: "token", data: "duplicate" }, { sequence: 3, event: "token", data: "new" }] }; }
		assert.equal(cursor, 3);
		return { status: "completed", events: [{ sequence: 4, event: "done", data: {} }] };
	}, onEvent: (event) => seen.push(event.sequence) });
	assert.deepEqual(seen, [3, 4]);
	assert.equal(result.recovered, true);
});
test("replay cancellation stops polling without launching a replacement execution", async () => {
	const controller = new AbortController();
	await assert.rejects(replayExecution({ signal: controller.signal, fetchPage: async () => { controller.abort(); return { status: "running", events: [] }; }, onEvent: () => {} }), { name: "AbortError" });
});

test('replay ignores a previous attempt error and reaches the current terminal record',async()=>{
 const seen=[];
 const result=await replayExecution({fetchPage:async()=>({status:'completed',terminal_cursor:4,events:[{sequence:1,event:'token',data:{}},{sequence:2,event:'error',data:{}},{sequence:3,event:'token',data:{}},{sequence:4,event:'done',data:{}}]}),onEvent:e=>seen.push(e.sequence)});
 assert.deepEqual(seen,[1,3,4]);assert.equal(result.cursor,4);
});

test('resume stream parser handles UTF-8 boundaries, cursor deduplication and unnumbered errors',async()=>{
 const {consumeExecutionResponse}=require('../public/execution-stream');
 const bytes=new TextEncoder().encode('id: 2\r\nevent: token\r\ndata: {"delta":"duplicate"}\r\n\r\nid: 3\r\nevent: token\r\ndata: {"delta":"café"}\r\n\r\nevent: error\ndata: {"code":"execution_running"}\n\n');
 const response=new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}}));
 const seen=[];const result=await consumeExecutionResponse(response,{after:2,onEvent:e=>seen.push(e)});
 assert.equal(seen.length,2);assert.equal(seen[0].data.delta,'café');assert.equal(result.terminal,'error');assert.equal(result.cursor,3);
});
