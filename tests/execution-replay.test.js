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
