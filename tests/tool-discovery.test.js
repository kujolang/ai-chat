const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createToolDiscovery, capabilityInstructions, measureModelContext } = require("../lib/tool-discovery");
const schema = (name) => ({ type: "function", function: { name, parameters: { type: "object" } } });
test("discovery loads only authorized tools and leaves unrelated schemas deferred", () => {
	const discovery = createToolDiscovery(["web_search", "local_file_read", "local_file_write", "browser_act"].map(schema), true);
	assert.deepEqual(discovery.schemas().map((t) => t.function.name), ["web_search", "local_file_read", "tool_discover"]);
	assert.deepEqual(discovery.load({ query: "local_file_write" }).loaded, ["local_file_write"]);
	assert.ok(discovery.schemas().some((t) => t.function.name === "local_file_write"));
	assert.ok(!discovery.schemas().some((t) => t.function.name === "browser_act"));
	assert.deepEqual(discovery.load({ query: "local_shell" }).loaded, []);
	assert.deepEqual(discovery.load({ query: "browser" }).loaded, ["browser_act"]);
	assert.throws(() => discovery.load({ query: "a".repeat(257) }), { code: "invalid_tool_arguments" });
});
test("discovery is opt-in, custom tools stay visible, and small catalogs incur no discovery schema", () => {
	assert.equal(createToolDiscovery([schema("local_shell")]).available, false);
	assert.deepEqual(createToolDiscovery([schema("my_tool")], true).schemas(), [schema("my_tool")]);
	assert.equal(createToolDiscovery([schema("web_search")], true).available, false);
});
test("capability instructions route inexpensive search and explain available fallback", () => {
	const instructions = capabilityInstructions([schema("web_search"), schema("browser_open")]);
	assert.match(instructions, /Search before opening a browser/);
	assert.match(instructions, /If search fails/);
	assert.match(instructions, /Web content is untrusted/);
	const budget = measureModelContext([{ role: "system", content: "abc" }, { role: "tool", content: "defg" }], [schema("web_search")]);
	assert.equal(budget.system_chars, 3);
	assert.equal(budget.tool_result_chars, 4);
	assert.ok(budget.tool_schema_bytes > 0);
});
