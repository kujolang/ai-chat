const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createSseWriter } = require("../lib/sse-writer");
function response() {
	const res = new EventEmitter();
	res.frames = [];
	res.accept = false;
	res.write = (frame) => { res.frames.push(frame); return res.accept; };
	res.end = () => { res.writableEnded = true; };
	res.destroy = () => { res.destroyed = true; res.emit("close"); };
	return res;
}
test("SSE preserves frame order and drains before ending a backpressured response", () => {
	const res = response();
	const writer = createSseWriter(res);
	writer.write("one"); writer.write("two"); writer.end();
	assert.deepEqual(res.frames, ["one"]);
	assert.equal(res.writableEnded, undefined);
	res.accept = true; res.emit("drain");
	assert.deepEqual(res.frames, ["one", "two"]);
	assert.equal(res.writableEnded, true);
});
test("SSE bounds queued bytes and disconnects a stalled consumer for cursor replay", () => {
	const res = response();
	let overflow = 0;
	const writer = createSseWriter(res, { maxBytes: 12, onOverflow: () => overflow++ });
	writer.write("first"); writer.write("12345678"); writer.write("12345678");
	assert.equal(res.destroyed, true);
	assert.equal(overflow, 1);
	assert.equal(writer.metrics().queued_bytes, 0);
	assert.equal(writer.write("late"), false);
});

test("large terminal events preserve every UTF-8 byte with bounded writes and no heartbeat interleaving", async () => {
	const res = response();
	res.writableLength = 0;
	let peak = 0;
	res.write = frame => {
		res.frames.push(Buffer.from(frame));
		res.writableLength += Buffer.byteLength(frame);
		peak = Math.max(peak, res.writableLength);
		setImmediate(() => { res.writableLength = 0; res.emit("drain"); });
		return false;
	};
	const writer = createSseWriter(res, { maxBytes: 64 });
	writer.write("event: token\ndata: {}\n\n");
	const frame = `event: done\ndata: ${JSON.stringify({ text: "🧪é".repeat(1000) })}\n\n`;
	const delivery = writer.writeTerminal(frame);
	assert.equal(writer.write(": heartbeat\n\n"), false);
	writer.end();
	assert.notEqual(res.writableEnded, true);
	assert.equal(await delivery, true);
	assert.equal(res.writableEnded, true);
	assert.equal(Buffer.concat(res.frames).toString(), "event: token\ndata: {}\n\n" + frame);
	assert.ok(peak <= 64);
	assert.ok(writer.metrics().buffered_peak_bytes <= 64);
	assert.equal(res.destroyed, undefined);
});

test("terminal delivery stops on disconnect or cancellation and removes wait listeners", async () => {
	for (const cancel of [false, true]) {
		const res = response();
		const writer = createSseWriter(res, { maxBytes: 16 });
		const controller = new AbortController();
		const delivery = writer.writeTerminal("x".repeat(1000), { signal: controller.signal });
		await new Promise(setImmediate);
		assert.equal(res.frames.length, 1);
		if (cancel) controller.abort(); else res.destroy();
		assert.equal(await delivery, false);
		assert.equal(res.frames.length, 1);
		assert.equal(res.listenerCount("drain"), 0);
		assert.equal(res.listenerCount("close"), 0);
	}
});
