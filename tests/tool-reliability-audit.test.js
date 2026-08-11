"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createLocalRuntime, localError } = require("../lib/local-runtime");

// --- FF-RETRY-1: localError sets retryable on permanent errors ---

test("FF-RETRY-1: permanent local errors set retryable=false", () => {
	const permanentCodes = [
		"local_path_not_found",
		"local_workspace_not_found",
		"local_shell_command_blocked",
		"local_shell_disabled",
		"local_file_not_readable",
		"local_path_blocked",
		"local_path_sensitive",
		"local_path_type_mismatch",
		"local_file_write_blocked",
		"local_file_exists",
		"local_file_missing",
		"local_file_too_large",
		"local_file_not_read",
		"local_file_partially_read",
		"local_file_changed_since_read",
		"local_write_disabled",
		"invalid_tool_arguments"
	];
	for (const code of permanentCodes) {
		const error = localError(code, "test message");
		assert.strictEqual(error.code, code, `error code should be ${code}`);
		assert.strictEqual(error.retryable, false, `${code} should have retryable=false`);
		assert.strictEqual(error.retry_hint, undefined, `${code} should not have retry_hint`);
	}
});

test("FF-RETRY-1: local errors set retryable only for genuinely retryable failures", () => {
	const timeoutError = localError("local_shell_timeout", "timed out");
	assert.strictEqual(timeoutError.code, "local_shell_timeout");
	assert.strictEqual(timeoutError.retryable, true);
	assert.ok(timeoutError.retry_hint, "timeout error should have retry_hint");
	assert.ok(timeoutError.retry_hint.length > 0, "retry_hint should not be empty");

	const failedError = localError("local_shell_failed", "failed to start");
	assert.strictEqual(failedError.code, "local_shell_failed");
	assert.strictEqual(failedError.retryable, undefined);
	assert.strictEqual(failedError.retry_hint, undefined);
});

test("FF-RETRY-1: unknown error codes do not set retryable", () => {
	const error = localError("some_unknown_code", "unknown");
	assert.strictEqual(error.code, "some_unknown_code");
	assert.strictEqual(error.retryable, undefined);
	assert.strictEqual(error.retry_hint, undefined);
});

// --- FF-RETRY-1: local runtime throws retryable errors ---

test("FF-RETRY-1: local_shell_command_blocked error is not retryable", async () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-test-"));
	try {
		const runtime = createLocalRuntime({
			projectRoot: tmpDir,
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_SHELL_ENABLED: "1",
				AI_CHAT_LOCAL_SHELL_ALLOWLIST: "git,ls"
			}
		});
		await assert.rejects(
			runtime.runCommand({ command: "npm", args: ["test"], root_id: "workspace_0" }),
			(error) => {
				assert.strictEqual(error.code, "local_shell_command_blocked");
				assert.strictEqual(error.retryable, false);
				return true;
			}
		);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("FF-RETRY-1: local_file_write_blocked error is not retryable", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-test-"));
	try {
		const runtime = createLocalRuntime({
			projectRoot: tmpDir,
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WRITE_ENABLED: "1"
			}
		});
		assert.throws(
			() => runtime.writeFile({ path: "test.exe", content: "x", root_id: "workspace_0" }),
			(error) => {
				assert.strictEqual(error.code, "local_file_write_blocked");
				assert.strictEqual(error.retryable, false);
				return true;
			}
		);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("FF-RETRY-1: local_path_blocked error is not retryable", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-test-"));
	try {
		const runtime = createLocalRuntime({
			projectRoot: tmpDir,
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1"
			}
		});
		assert.throws(
			() => runtime.readFile({ path: "../../../etc/passwd", root_id: "workspace_0" }),
			(error) => {
				assert.strictEqual(error.code, "local_path_blocked");
				assert.strictEqual(error.retryable, false);
				return true;
			}
		);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

test("FF-RETRY-1: local_workspace_not_found error is not retryable", () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-test-"));
	try {
		const runtime = createLocalRuntime({
			projectRoot: tmpDir,
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1"
			}
		});
		assert.throws(
			() => runtime.readFile({ path: "test.txt", root_id: "workspace_999" }),
			(error) => {
				assert.strictEqual(error.code, "local_workspace_not_found");
				assert.strictEqual(error.retryable, false);
				return true;
			}
		);
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
});

// --- FF-OBS-1: tool_completed audit logging ---

test("FF-OBS-1: server-runtime.js contains audit tool_completed call", () => {
	const serverRuntimePath = path.resolve(__dirname, "..", "lib", "server-runtime.js");
	const content = fs.readFileSync(serverRuntimePath, "utf8");
	assert.ok(
		content.includes('audit("tool_completed", req, { tool_name: toolName })'),
		"server-runtime.js should call audit('tool_completed', ...) after successful tool execution"
	);
});

test("FF-OBS-1: tool_completed audit call is in the success path, not the error path", () => {
	const serverRuntimePath = path.resolve(__dirname, "..", "lib", "server-runtime.js");
	const content = fs.readFileSync(serverRuntimePath, "utf8");
	const completedIndex = content.indexOf('audit("tool_completed"');
	const failedIndex = content.indexOf('audit("tool_failed"');
	assert.ok(completedIndex > -1, "tool_completed audit call should exist");
	assert.ok(failedIndex > -1, "tool_failed audit call should exist");
	assert.ok(completedIndex < failedIndex, "tool_completed should be before tool_failed in the code (success path comes first)");
});

// --- FF-BROWSER-1: browser_session_not_found has retryable and retry_hint ---

test("FF-BROWSER-1: browser-runtime.js sets retryable on browser_session_not_found", () => {
	const browserRuntimePath = path.resolve(__dirname, "..", "lib", "browser-runtime.js");
	const content = fs.readFileSync(browserRuntimePath, "utf8");
	// Check that retryable is set near the retry_hint for session not found
	const retryableNearSessionNotFound = content.includes('error.retryable = true;\n\t\t\terror.retry_hint = "Open a new browser session');
	assert.ok(retryableNearSessionNotFound, "retryable should be set to true near retry_hint for browser_session_not_found");
});

// --- FF-OBS-1: weekly audit script handles tool_completed entries ---

test("FF-OBS-1: weekly audit buildMetrics counts tool_completed as successful", () => {
	const { buildMetrics } = require("../scripts/weekly-tool-audit.js");
	const toolEntries = [
		{ event: "tool_completed", details: { tool_name: "local_file_read" }, request_id: "r1" },
		{ event: "tool_completed", details: { tool_name: "local_file_read" }, request_id: "r1" },
		{ event: "tool_failed", details: { tool_name: "local_shell", error_code: "local_shell_command_blocked" }, request_id: "r2" }
	];
	const failedEntries = toolEntries.filter((e) => e.event === "tool_failed");
	const completedEntries = toolEntries.filter((e) => e.event === "tool_completed");
	const metrics = buildMetrics(toolEntries, failedEntries, completedEntries);
	assert.strictEqual(metrics.total_tool_entries, 3);
	assert.strictEqual(metrics.successful, 2);
	assert.strictEqual(metrics.failed, 1);
	assert.strictEqual(metrics.has_success_samples, true);
	assert.ok(metrics.failure_rate < 1.0, "failure rate should be less than 100% when there are success samples");
	assert.strictEqual(metrics.failure_rate, 1 / 3);
});

test("FF-OBS-1: weekly audit reports has_success_samples=true when tool_completed entries exist", () => {
	const { buildMetrics } = require("../scripts/weekly-tool-audit.js");
	const toolEntries = [
		{ event: "tool_completed", details: { tool_name: "local_file_read" }, request_id: "r1" },
		{ event: "tool_failed", details: { tool_name: "local_shell", error_code: "local_shell_command_blocked" }, request_id: "r2" }
	];
	const failedEntries = toolEntries.filter((e) => e.event === "tool_failed");
	const completedEntries = toolEntries.filter((e) => e.event === "tool_completed");
	const metrics = buildMetrics(toolEntries, failedEntries, completedEntries);
	assert.strictEqual(metrics.has_success_samples, true);
	assert.strictEqual(metrics.failure_rate, 0.5);
});

// --- Weekly audit: new error families are recognized ---

test("FF-12: weekly audit recognizes browser_session_not_found", () => {
	const { buildFailureInventory } = require("../scripts/weekly-tool-audit.js");
	const failedEntries = [
		{ event: "tool_failed", details: { tool_name: "browser_open", error_code: "browser_session_not_found" }, request_id: "r1", timestamp: "2026-07-25T00:00:00Z" }
	];
	const inventory = buildFailureInventory(failedEntries, new Date("2026-07-20"), new Date("2026-07-27"));
	const family = inventory.failure_families.find((f) => f.family_id === "FF-12");
	assert.ok(family, "FF-12 should be in the failure families");
	assert.strictEqual(family.severity, "P2");
	assert.strictEqual(family.frequency, 1);
});

test("FF-15: weekly audit recognizes local_workspace_not_found as P1", () => {
	const { buildFailureInventory } = require("../scripts/weekly-tool-audit.js");
	const failedEntries = [
		{ event: "tool_failed", details: { tool_name: "local_file_write", error_code: "local_workspace_not_found" }, request_id: "r1", timestamp: "2026-07-25T00:00:00Z" }
	];
	const inventory = buildFailureInventory(failedEntries, new Date("2026-07-20"), new Date("2026-07-27"));
	const family = inventory.failure_families.find((f) => f.family_id === "FF-15");
	assert.ok(family, "FF-15 should be in the failure families");
	assert.strictEqual(family.severity, "P1");
});

test("FF-16: weekly audit recognizes invalid_tool_arguments", () => {
	const { buildFailureInventory } = require("../scripts/weekly-tool-audit.js");
	const failedEntries = [
		{ event: "tool_failed", details: { tool_name: "local_shell", error_code: "invalid_tool_arguments" }, request_id: "r1", timestamp: "2026-07-25T00:00:00Z" }
	];
	const inventory = buildFailureInventory(failedEntries, new Date("2026-07-20"), new Date("2026-07-27"));
	const family = inventory.failure_families.find((f) => f.family_id === "FF-16");
	assert.ok(family, "FF-16 should be in the failure families");
	assert.strictEqual(family.severity, "P2");
});
