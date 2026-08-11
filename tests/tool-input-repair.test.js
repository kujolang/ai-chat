const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { createLocalRuntime } = require("../lib/local-runtime");
const { builtinToolSchemas, createToolRuntime } = require("../lib/tool-runtime");
const { validateThenRepairToolCall } = require("../lib/tool-input-repair");

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "tool-repair-adversarial.json"), "utf8"));
const schemaByName = new Map(builtinToolSchemas().map((schema) => [schema.function.name, schema.function.parameters]));

test("validate-then-repair leaves already-valid object inputs untouched", () => {
	const input = { path: "README.md", offset: 1, limit: 30 };
	const prepared = validateThenRepairToolCall({
		name: "local_file_read",
		input,
		schema: schemaByName.get("local_file_read"),
		canExecute: () => true
	});
	assert.equal(prepared.repaired, false);
	assert.equal(prepared.input, input);
});

test("relational read defaults are repaired even when individual fields satisfy the JSON Schema", () => {
	const withOffset = validateThenRepairToolCall({
		name: "local_file_read",
		input: { path: "README.md", offset: 25 },
		schema: schemaByName.get("local_file_read"),
		canExecute: () => true
	});
	assert.equal(withOffset.input.limit, 2000);
	assert.ok(withOffset.repair_types.includes("relational_default"));

	const withLimit = validateThenRepairToolCall({
		name: "local_file_read",
		input: { path: "README.md", limit: 25 },
		schema: schemaByName.get("local_file_read"),
		canExecute: () => true
	});
	assert.equal(withLimit.input.offset, 1);
});

test("markdown-linked canonical path fields trigger repair despite satisfying the string schema", () => {
	const prepared = validateThenRepairToolCall({
		name: "local_file_read",
		input: { path: "docs/[API_CONTRACT.md](http://API_CONTRACT.md)" },
		schema: schemaByName.get("local_file_read"),
		canExecute: () => true
	});
	assert.equal(prepared.input.path, "docs/API_CONTRACT.md");
	assert.deepEqual(prepared.repair_types, ["markdown_path"]);
	const legitimate = { path: "docs/[label](https://example.com/file.md)" };
	const unchanged = validateThenRepairToolCall({
		name: "local_file_read",
		input: legitimate,
		schema: schemaByName.get("local_file_read"),
		canExecute: () => true
	});
	assert.equal(unchanged.input, legitimate);
	assert.equal(unchanged.repaired, false);
});

test("adversarial multi-provider fixtures repair to the advertised schemas", () => {
	for (const fixture of fixtures) {
		const canonical = fixture.tool === "webSearch" ? "web_search" : fixture.tool;
		const prepared = validateThenRepairToolCall({
			name: fixture.tool,
			input: fixture.input,
			schema: schemaByName.get(canonical),
			canExecute: (name) => schemaByName.has(name)
		});
		assert.equal(prepared.name, canonical, `${fixture.provider}/${fixture.model}`);
		for (const type of fixture.expected_types) {
			assert.ok(prepared.repair_types.includes(type), `${fixture.provider}/${fixture.model} missing ${type}`);
		}
	}
});

test("repairs are surfaced and telemetry records only model/tool counters", async () => {
	let observed;
	const runtime = createToolRuntime({
		localRuntime: {
			canExecute: () => true,
			status: () => ({ enabled: true, available: true }),
			listWorkspaces: () => ({ workspaces: [] }),
			listFiles: () => ({ entries: [] }),
			readFile: (args) => { observed = args; return { ok: true, content: "fixture-secret-value" }; },
			writeFile: () => ({ ok: true }),
			runCommand: () => ({ ok: true })
		}
	});
	const result = await runtime.execute("localFileRead", { filePath: "[README.md](http://README.md)", limit: "10" }, { model: "fixture-model" });
	assert.deepEqual(observed, { path: "README.md", limit: 10, offset: 1 });
	assert.equal(result.tool_input_repair.repaired, true);
	assert.ok(result.tool_input_repair.notes.every((note) => !JSON.stringify(note).includes("fixture-secret-value")));
	const status = runtime.repairStatus();
	assert.deepEqual(status.models[0], {
		model: "fixture-model",
		tool_name: "local_file_read",
		calls: 1,
		repaired_calls: 1,
		invalid_calls: 0,
		oversized_results: 0,
		repair_types: {
			tool_alias: 1,
			canonical_alias: 1,
			markdown_path: 1,
			numeric_coercion: 1,
			relational_default: 1
		}
	});
	assert.equal(JSON.stringify(status).includes("fixture-secret-value"), false);
});

test("unrecoverable additional properties return a model-readable retry error", async () => {
	const runtime = createToolRuntime();
	await assert.rejects(
		() => runtime.execute("system_time", { surprise: "value-must-not-appear" }, { model: "fixture-model" }),
		(error) => error.code === "invalid_tool_arguments"
			&& error.retryable === true
			&& error.message.includes("$.surprise")
			&& !error.message.includes("value-must-not-appear")
	);
	assert.equal(runtime.repairStatus().models[0].invalid_calls, 1);
});

test("global result guard rejects oversized executor output without returning values", async () => {
	const runtime = createToolRuntime({
		maxToolResultBytes: 16 * 1024,
		actionRuntime: {
			canExecute: () => true,
			status: () => ({ enabled: true, available: true }),
			list: () => ({ adapters: [] }),
			call: () => ({ content: "sensitive".repeat(4096) })
		}
	});
	await assert.rejects(
		() => runtime.execute("action_adapter_call", { id: "fixture", input: {} }, { model: "fixture-model" }),
		(error) => error.code === "tool_result_too_large" && !error.message.includes("sensitive")
	);
	assert.equal(runtime.repairStatus().models[0].oversized_results, 1);
});

test("repair does not weaken local workspace containment or read-only defaults", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-repair-boundary-"));
	const workspace = path.join(tempRoot, "workspace");
	fs.mkdirSync(workspace);
	fs.writeFileSync(path.join(workspace, "inside.md"), "inside\n");
	fs.writeFileSync(path.join(tempRoot, "outside.md"), "outside\n");
	const localRuntime = createLocalRuntime({
		env: {
			AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
			AI_CHAT_LOCAL_WORKSPACE_ROOTS: workspace,
			AI_CHAT_LOCAL_WRITE_ENABLED: "0",
			AI_CHAT_LOCAL_SHELL_ENABLED: "0"
		},
		projectRoot: workspace
	});
	const runtime = createToolRuntime({ localRuntime });
	try {
		await assert.rejects(
			() => runtime.execute("localFileRead", { rootId: "workspace_0", filePath: "../outside.md", limit: "10" }),
			(error) => error.code === "local_path_blocked"
		);
		await assert.rejects(
			() => runtime.execute("local_file_write", { path: "new.md", content: "no" }),
			(error) => error.code === "local_write_disabled"
		);
		await assert.rejects(
			() => runtime.execute("local_shell", { command: "pwd", args: [] }),
			(error) => error.code === "local_shell_disabled"
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
