const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contextPolicy, estimateContext, budgetContext } = require("../lib/context-budget");
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
