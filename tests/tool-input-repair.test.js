const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
	prepareToolArguments,
	unwrapDegenerateMarkdownAutolink,
	validateSchemaValue
} = require("../lib/tool-input-repair");
const { builtinToolSchemas, createToolRuntime } = require("../lib/tool-runtime");

const schemas = new Map(builtinToolSchemas().map((entry) => [entry.function.name, entry.function.parameters]));

test("tool input repair leaves valid and content-bearing inputs unchanged", () => {
	const input = { path: "notes.md", content: '["keep","as","text"]', mode: "create", create_dirs: false };
	const prepared = prepareToolArguments("local_file_write", input, schemas.get("local_file_write"));
	assert.deepEqual(prepared.arguments, input);
	assert.deepEqual(prepared.repairs, []);
});

test("tool input repair handles aliases, exact scalar coercion, optional nulls, and markdown path leaks", () => {
	const prepared = prepareToolArguments("local_file_read", {
		rootId: null,
		filePath: "/workspace/[notes.md](http://notes.md)",
		offset: "2",
		maxLineChars: "400"
	}, schemas.get("local_file_read"));
	assert.deepEqual(prepared.arguments, {
		path: "/workspace/notes.md",
		offset: 2,
		max_line_chars: 400
	});
	assert.deepEqual(prepared.repairs.map((entry) => entry.kind), [
		"alias:filePath",
		"alias:maxLineChars",
		"alias:rootId",
		"optional_null_omit",
		"markdown_autolink_unwrap",
		"integer_string_coerce",
		"integer_string_coerce"
	]);
});

test("tool input repair parses arrays before wrapping bare strings and repairs empty placeholders", () => {
	const schema = schemas.get("local_shell");
	const parsed = prepareToolArguments("local_shell", { command: "rg", args: '["needle","README.md"]', timeoutMs: "5000" }, schema);
	assert.deepEqual(parsed.arguments, { command: "rg", args: ["needle", "README.md"], timeout_ms: 5000 });
	assert.deepEqual(parsed.repairs.map((entry) => entry.kind), ["alias:timeoutMs", "json_array_parse", "integer_string_coerce"]);

	const wrapped = prepareToolArguments("local_shell", { command: "pwd", args: "--version" }, schema);
	assert.deepEqual(wrapped.arguments.args, ["--version"]);
	assert.equal(wrapped.repairs[0].kind, "bare_string_wrap");

	const empty = prepareToolArguments("local_shell", { command: "pwd", args: {} }, schema);
	assert.deepEqual(empty.arguments.args, []);
	assert.equal(empty.repairs[0].kind, "empty_placeholder_to_array");
});

test("tool input repair parses nested JSON containers for browser and action calls", () => {
	const browser = prepareToolArguments("browser_act", {
		sessionId: "brs_1",
		action: '{"type":"scroll","amount":"600"}'
	}, schemas.get("browser_act"));
	assert.deepEqual(browser.arguments, { session_id: "brs_1", action: { type: "scroll", amount: 600 } });
	assert.deepEqual(browser.repairs.map((entry) => entry.kind), ["alias:sessionId", "json_object_parse", "integer_string_coerce"]);

	const action = prepareToolArguments("action_adapter_call", { adapterId: "docx", input: '{"document_id":"doc-1"}' }, schemas.get("action_adapter_call"));
	assert.deepEqual(action.arguments, { id: "docx", input: { document_id: "doc-1" } });
	assert.deepEqual(action.repairs.map((entry) => entry.kind), ["alias:adapterId", "json_object_parse"]);
});

test("tool input repair rejects ambiguous coercion and unknown fields with model-readable guidance", () => {
	assert.throws(
		() => prepareToolArguments("local_file_read", { path: "README.md", offset: "2abc" }, schemas.get("local_file_read")),
		(error) => error.code === "invalid_tool_arguments" && /\$\.offset expected integer/.test(error.message) && /omit optional fields/.test(error.retry_hint)
	);
	assert.throws(
		() => prepareToolArguments("system_time", { surprise: true }, schemas.get("system_time")),
		(error) => error.code === "invalid_tool_arguments" && /unknown field/.test(error.message)
	);
	assert.deepEqual(validateSchemaValue({ query: "x", domains: ["example.com"] }, schemas.get("web_search")), []);
});

test("degenerate path auto-links are narrowly unwrapped", () => {
	assert.equal(unwrapDegenerateMarkdownAutolink("/tmp/[notes.md](http://notes.md)"), "/tmp/notes.md");
	assert.equal(unwrapDegenerateMarkdownAutolink("/tmp/[click](https://example.com)"), "/tmp/[click](https://example.com)");
});

test("tool runtime annotates repaired calls for the model and telemetry", async () => {
	let observed = null;
	const runtime = createToolRuntime({
		localRuntime: {
			canExecute: () => true,
			status: () => ({ enabled: true, available: true }),
			listWorkspaces: () => ({ workspaces: [] }),
			listFiles: () => ({ entries: [] }),
			readFile: (args) => { observed = args; return { path: args.path, content: "ok" }; },
			writeFile: () => ({ ok: true }),
			runCommand: () => ({ exit_code: 0 })
		}
	});
	const result = await runtime.execute("local_file_read", { filePath: "README.md", offset: "1" });
	assert.deepEqual(observed, { path: "README.md", offset: 1 });
	assert.deepEqual(result.input_repairs, [
		{ path: "$.path", kind: "alias:filePath" },
		{ path: "$.offset", kind: "integer_string_coerce" }
	]);
});
