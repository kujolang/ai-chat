const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
	buildFailureInventory,
	buildMetrics,
	buildRepairMetrics,
	checkThresholds,
	formatPercent,
	isToolEvent
} = require("../scripts/weekly-tool-audit");

test("weekly audit metrics ignore non-terminal events and count repeated failures precisely", () => {
	const toolEntries = [
		{ event: "tool_failed", request_id: "req-1", details: { tool_name: "local_shell", error_code: "local_shell_timeout" } },
		{ event: "tool_failed", request_id: "req-1", details: { tool_name: "local_shell", error_code: "local_shell_timeout" } },
		{ event: "tool_completed", request_id: "req-2", details: { tool_name: "browser_open" } }
	];
	const failedEntries = toolEntries.filter((entry) => entry.event === "tool_failed");
	const completedEntries = toolEntries.filter((entry) => entry.event === "tool_completed");

	const metrics = buildMetrics(toolEntries, failedEntries, completedEntries);

	assert.equal(metrics.total_tool_entries, 3);
	assert.equal(metrics.successful, 1);
	assert.equal(metrics.failed, 2);
	assert.equal(metrics.repeated_calls, 1);
	assert.equal(metrics.retry_rate, 0.5);
	assert.equal(metrics.failure_rate, 2 / 3);
});

test("weekly audit counts wrong-workspace incidents once per failed local event", () => {
	const toolEntries = [
		{ event: "tool_failed", request_id: "req-1", details: { tool_name: "local_file_read", error_code: "local_path_blocked" } },
		{ event: "tool_failed", request_id: "req-2", details: { tool_name: "local_shell", error_code: "local_path_blocked" } },
		{ event: "tool_failed", request_id: "req-3", details: { tool_name: "browser_open", error_code: "browser_url_blocked" } }
	];
	const metrics = buildMetrics(toolEntries, toolEntries, []);
	assert.equal(metrics.wrong_workspace_incidents, 2);
});

test("weekly audit reports unavailable success coverage without inventing successful samples", () => {
	const failedEntries = [
		{
			event: "tool_failed",
			timestamp: "2026-07-24T12:00:00.000Z",
			request_id: "req-1",
			details: { tool_name: "browser_open", error_code: "tool_execution_failed" }
		}
	];
	const metrics = buildMetrics(failedEntries, failedEntries, []);
	const inventory = buildFailureInventory(failedEntries, new Date("2026-07-17T12:00:00.000Z"), new Date("2026-07-24T12:00:00.000Z"));
	const breaches = checkThresholds(metrics, inventory);

	assert.equal(metrics.successful, 0);
	assert.equal(metrics.has_success_samples, false);
	assert.equal(metrics.failure_rate, 1);
	assert.ok(breaches.some((breach) => breach.threshold === "max_p1_failures" || breach.threshold === "max_overall_failure_rate"));
	assert.equal(formatPercent(null), "n/a");
});

test("weekly audit only accepts terminal tool events", () => {
	assert.equal(isToolEvent({ event: "tool_failed" }), true);
	assert.equal(isToolEvent({ event: "tool_completed" }), true);
	assert.equal(isToolEvent({ event: "tool_activity" }), false);
});

test("weekly audit reports schema-guided tool input repairs without treating them as terminal calls", () => {
	const repairs = buildRepairMetrics([
		{ event: "tool_input_repaired", details: { tool_name: "local_shell", count: 2, kinds: ["json_array_parse", "integer_string_coerce"] } },
		{ event: "tool_input_repaired", details: { tool_name: "local_shell", count: 1, kinds: ["json_array_parse"] } },
		{ event: "tool_input_repaired", details: { tool_name: "browser_act", count: 1, kinds: ["json_object_parse"] } }
	]);
	assert.deepEqual(repairs, {
		events: 3,
		total: 4,
		by_tool: { local_shell: 3, browser_act: 1 },
		by_kind: { json_array_parse: 2, integer_string_coerce: 1, json_object_parse: 1 }
	});
});
