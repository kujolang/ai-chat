const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contextPolicy, loadContextMetadata, estimateContext, budgetContext } = require("../lib/context-budget");
test("context policy distinguishes provider/model overrides", () => {
	assert.equal(contextPolicy("openai", "small", { "openai:small": 8192, openai: 32768 }).window_tokens, 8192);
	assert.equal(contextPolicy("openai", "other", { openai: 32768 }).window_tokens, 32768);
	assert.throws(() => contextPolicy("x", "y", { default: "unbounded" }), { code: "context_budget_exceeded" });
});
test("whole-context budgeting includes call arguments, reasoning, schemas and completed receipts", () => {
	const messages = [{ role: "system", content: "Protected rule" }, { role: "user", content: "Write the file" },
		{ role: "assistant", content: "", thinking: "x".repeat(2000), tool_calls: [{ id: "write-1", function: { name: "local_file_write", arguments: "x".repeat(10000) } }] },
		{ role: "tool", tool_call_id: "write-1", content: JSON.stringify({ ok: true, content: "x".repeat(5000) }) },
		{ role: "user", content: "Continue" }];
	const schemas = [{ function: { name: "local_file_write", description: "d".repeat(1000) } }];
	const report = budgetContext(messages, schemas, { window_tokens: 8192, output_tokens: 4096 });
	assert.equal(report.compacted_calls, 1);
	assert.ok(report.after_upper_bound <= 4096);
	assert.match(messages[2].content, /write-1/);
	assert.match(messages[2].content, /returned_ok.*true/);
	assert.ok(!messages.some((m) => m.role === "tool" || m.tool_calls));
	assert.ok(estimateContext(messages, schemas) > estimateContext(messages, []));
});
test("an impossible fixed request fails before contacting a provider", () => {
	assert.throws(() => budgetContext([{ role: "system", content: "x".repeat(10000) }, { role: "user", content: "Keep this request" }], [], { window_tokens: 8192, output_tokens: 1024 }), { code: "context_budget_exceeded" });
});

test("receipts associate results by call ID rather than response order", () => {
	const messages = [{ role: "user", content: "Task" }, { role: "assistant", content: null, tool_calls: [
		{ id: "a", function: { name: "first", arguments: "x".repeat(5000) } }, { id: "b", function: { name: "second", arguments: "{}" } }
	] }, { role: "tool", tool_call_id: "b", content: '{"ok":false}' }, { role: "tool", tool_call_id: "a", content: '{"ok":true}' }];
	budgetContext(messages, [], { window_tokens: 4096, output_tokens: 1024 });
	assert.match(messages[1].content, /"call_id":"a","tool":"first","returned_ok":true/);
	assert.match(messages[1].content, /"call_id":"b","tool":"second","returned_ok":false/);
});

test("mismatched tool results cannot become misleading completed receipts", () => {
	const messages = [{ role: "user", content: "Task" }, { role: "assistant", content: null,
		tool_calls: [{ id: "a", function: { name: "write", arguments: "x".repeat(5000) } }] },
		{ role: "tool", tool_call_id: "other", content: '{"ok":true}' }];
	assert.throws(() => budgetContext(messages, [], { window_tokens: 4096, output_tokens: 1024 }), { code: "context_budget_exceeded" });
	assert.equal(messages[1].tool_calls[0].id, "a");
});

test("dated catalog metadata respects exact model identity, effective windows and operator overrides", () => {
	const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "context-metadata-"));
	const file = path.join(root, "catalog.json");
	const now = Date.now();
	try {
		fs.writeFileSync(file, JSON.stringify({ fetched_at: new Date(now).toISOString(), models: [
			{ slug: "native", context_window: 20000, effective_context_window_percent: 90 },
			{ slug: "bad", context_window: -1 }, { slug: "fraction", context_window: 8192.5 }
		] }));
		const metadata = loadContextMetadata(file, { codex: true, now });
		assert.equal(contextPolicy("codex", "native", { default: 65536 }, metadata).window_tokens, 18000);
		assert.match(contextPolicy("codex", "native", {}, metadata).source, /^codex_model_cache:/);
		assert.equal(contextPolicy("codex", "native", { codex: 10000 }, metadata).window_tokens, 10000);
		assert.equal(contextPolicy("custom", "native", {}, metadata).window_tokens, 65536);
		assert.equal(Object.keys(metadata).length, 1);
		assert.deepEqual(loadContextMetadata(file, { codex: true, now: now + 31 * 86400000 }), {});
		fs.writeFileSync(file, JSON.stringify({ fetched_at: new Date(now).toISOString(), models: [{ provider: "openrouter", model: "family/model", context_window: 12000 }] }));
		assert.equal(contextPolicy("openrouter", "family/model", {}, loadContextMetadata(file, { now })).window_tokens, 12000);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("native wrapper reservation cannot silently consume protected input allowance", () => {
	assert.throws(() => budgetContext([{ role: "user", content: "x".repeat(6000) }], [], { window_tokens: 8192, output_tokens: 1024, envelope_tokens: 1000 }), { code: "context_budget_exceeded" });
});
