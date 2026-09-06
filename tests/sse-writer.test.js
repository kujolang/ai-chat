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
