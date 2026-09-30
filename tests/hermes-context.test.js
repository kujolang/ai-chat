const test = require("node:test");
const assert = require("node:assert/strict");
const { contextSnapshot } = require("../scripts/refresh-hermes-context");

test("Hermes context refresh preserves exact IDs and only bounded numeric metadata", () => {
	const snapshot = contextSnapshot({ data: [
		{ id: "stealth/example", context_length: 1000000, description: "untrusted", token: "not persisted" },
		{ id: "invalid", context_length: "1000000" },
		{ id: "oversized", context_length: 4000001 }
	] }, new Date("2026-09-30T00:00:00Z"));
	assert.deepEqual(snapshot, { fetched_at: "2026-09-30T00:00:00.000Z", models: [{ provider: "hermes", model: "stealth/example", context_window: 1000000 }] });
	assert.throws(() => contextSnapshot({ data: [] }), /no usable/);
	assert.throws(() => contextSnapshot({ error: "unauthorized" }), /invalid/);
});
