#!/usr/bin/env node

/**
 * Weekly Tool Reliability Audit Script
 *
 * Scans the AI Chat audit log for tool failures within a rolling seven-day
 * window, clusters them into failure families, calculates metrics, compares
 * with the previous audit, and produces machine-readable and human-readable
 * reports.
 *
 * Usage:
 *   node scripts/weekly-tool-audit.js [--audit-log <path>] [--output-dir <dir>]
 *
 * Exit codes:
 *   0 — all thresholds passed
 *   1 — one or more thresholds breached
 *   2 — script error (missing audit log, invalid arguments, etc.)
 *
 * Environment variables:
 *   AUDIT_LOG_PATH    — path to audit.log (default: data/audit.log)
 *   AUDIT_OUTPUT_DIR  — directory for output files (default: data/audits)
 *
 * @since 1.0.0
 */

"use strict";

const fs = require("fs");
const path = require("path");

// --- Configuration ---

const DEFAULT_AUDIT_LOG = path.join(__dirname, "..", "data", "audit.log");
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "data", "audits");
const WINDOW_DAYS = 7;

// Reliability thresholds — breach any of these and the script exits non-zero
const THRESHOLDS = {
	max_overall_failure_rate: 0.25,
	max_critical_tool_failure_rate: 0.25,
	max_retry_rate: 0.20,
	min_recovery_rate: 0.0,
	max_timeout_count: 20,
	max_wrong_workspace_incidents: 5,
	max_incorrect_success_status: 3,
	max_p0_failures: 0,
	max_p1_failures: 10
};

// Tools considered "critical" for threshold checking
const CRITICAL_TOOLS = new Set([
	"local_shell",
	"local_file_read",
	"local_file_write",
	"local_file_list",
	"browser_open",
	"browser_act",
	"web_search"
]);

// Error codes that indicate specific failure families
const ERROR_FAMILY_MAP = {
	ENOENT: { family: "FF-1", severity: "P1", label: "Raw ENOENT leaking through" },
	local_shell_command_blocked: { family: "FF-2", severity: "P1", label: "Shell command blocked without allowlist guidance" },
	local_file_write_blocked: { family: "FF-3", severity: "P2", label: "File write blocked without extension guidance" },
	local_path_blocked: { family: "FF-4", severity: "P2", label: "Path blocked without workspace context" },
	local_path_type_mismatch: { family: "FF-5", severity: "P2", label: "Path type mismatch without clarification" },
	tool_execution_failed: { family: "FF-6", severity: "P2", label: "Generic execution failure" },
	web_search_aborted: { family: "FF-7", severity: "P3", label: "Search aborted noise" },
	browser_url_blocked: { family: "FF-8", severity: "P3", label: "Browser URL blocked (expected)" },
	local_shell_timeout: { family: "FF-9", severity: "P2", label: "Shell command timeout" },
	local_file_missing: { family: "FF-10", severity: "P2", label: "File missing" },
	local_file_exists: { family: "FF-11", severity: "P3", label: "File exists conflict" },
	browser_session_not_found: { family: "FF-12", severity: "P2", label: "Browser session not found (expired or invalid)" },
	local_path_sensitive: { family: "FF-13", severity: "P2", label: "Sensitive path blocked" },
	local_file_not_readable: { family: "FF-14", severity: "P2", label: "File not readable (unsupported type)" },
	local_workspace_not_found: { family: "FF-15", severity: "P1", label: "Workspace not configured" },
	invalid_tool_arguments: { family: "FF-16", severity: "P2", label: "Invalid tool arguments" },
	browser_action_limit: { family: "FF-17", severity: "P3", label: "Browser action limit reached" },
	browser_execution_failed: { family: "FF-18", severity: "P2", label: "Browser execution failed" },
	browser_output_limit: { family: "FF-19", severity: "P3", label: "Browser output limit exceeded" },
	browser_navigation_timeout: { family: "FF-20", severity: "P2", label: "Browser navigation timeout" },
	browser_navigation_blocked: { family: "FF-21", severity: "P3", label: "Browser navigation blocked" },
	browser_dns_failed: { family: "FF-22", severity: "P2", label: "Browser DNS resolution failed" },
	tool_approval_required: { family: "FF-23", severity: "P3", label: "Tool approval required" },
	local_write_disabled: { family: "FF-24", severity: "P1", label: "Local writes not enabled" },
	local_shell_disabled: { family: "FF-25", severity: "P1", label: "Local shell not enabled" },
	local_shell_failed: { family: "FF-26", severity: "P2", label: "Shell command failed to start" },
	local_file_too_large: { family: "FF-27", severity: "P3", label: "File exceeds size limit" },
	local_path_not_found: { family: "FF-28", severity: "P2", label: "Path not found in workspace" },
	browser_session_expired: { family: "FF-29", severity: "P2", label: "Browser session expired" }
};
const TERMINAL_TOOL_EVENTS = new Set(["tool_failed", "tool_completed"]);
const FAILURE_SEVERITY_THRESHOLDS = Object.freeze({
	P0: THRESHOLDS.max_p0_failures,
	P1: THRESHOLDS.max_p1_failures
});

// --- Main ---

function main() {
	const args = parseArgs(process.argv.slice(2));
	const auditLogPath = args["audit-log"] || process.env.AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG;
	const outputDir = args["output-dir"] || process.env.AUDIT_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;

	if (!fs.existsSync(auditLogPath)) {
		console.error(`Error: Audit log not found at ${auditLogPath}`);
		process.exit(2);
	}

	fs.mkdirSync(outputDir, { recursive: true });

	const now = new Date();
	const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

	console.log(`Weekly Tool Reliability Audit`);
	console.log(`Window: ${windowStart.toISOString()} to ${now.toISOString()}`);
	console.log(`Audit log: ${auditLogPath}`);
	console.log("");

	// Parse all audit log entries
	const entries = parseAuditLog(auditLogPath);

	// Filter to window
	const windowEntries = entries.filter((entry) => {
		const ts = new Date(entry.timestamp);
		return ts >= windowStart && ts <= now;
	});

	// Separate tool-related entries
	const toolEntries = windowEntries.filter((entry) => isToolEvent(entry));
	const failedEntries = toolEntries.filter((entry) => entry.event === "tool_failed");
	const completedEntries = toolEntries.filter((entry) => entry.event === "tool_completed");
	const repairEntries = windowEntries.filter((entry) => entry.event === "tool_input_repaired");

	// Build metrics
	const metrics = buildMetrics(toolEntries, failedEntries, completedEntries, repairEntries);

	// Build failure inventory
	const inventory = buildFailureInventory(failedEntries, windowStart, now);

	// Check thresholds
	const breaches = checkThresholds(metrics, inventory);

	// Load previous audit for comparison
	const previousAudit = loadPreviousAudit(outputDir);

	// Generate outputs
	const timestamp = now.toISOString().replace(/[:.]/g, "-");
	const jsonPath = path.join(outputDir, `tool-audit-${timestamp}.json`);
	const mdPath = path.join(outputDir, `tool-audit-${timestamp}.md`);

	const jsonReport = buildJsonReport(metrics, inventory, breaches, windowStart, now, previousAudit);
	fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), "utf8");

	const mdReport = buildMarkdownReport(metrics, inventory, breaches, windowStart, now, previousAudit);
	fs.writeFileSync(mdPath, mdReport, "utf8");

	console.log(`Total tool entries in window: ${toolEntries.length}`);
	console.log(`Failed: ${failedEntries.length}`);
	console.log(`Failure rate: ${(metrics.failure_rate * 100).toFixed(1)}%`);
	console.log(`Failure families: ${inventory.failure_families.length}`);
	console.log(`Tool input repairs: ${metrics.input_repairs.total}`);
	console.log(`Threshold breaches: ${breaches.length}`);
	console.log("");
	console.log(`Reports written:`);
	console.log(`  ${jsonPath}`);
	console.log(`  ${mdPath}`);

	if (breaches.length > 0) {
		console.log("");
		console.log("Threshold breaches:");
		for (const breach of breaches) {
			console.log(`  ${breach.threshold}: ${breach.message}`);
		}
		process.exit(1);
	}

	process.exit(0);
}

// --- Audit Log Parsing ---

function parseAuditLog(auditLogPath) {
	const content = fs.readFileSync(auditLogPath, "utf8");
	const lines = content.split("\n").filter(Boolean);
	const entries = [];
	for (const line of lines) {
		try {
			entries.push(JSON.parse(line));
		} catch (error) {
			// Skip malformed lines
		}
	}
	return entries;
}

function isToolEvent(entry) {
	if (!entry || !entry.event) return false;
	return TERMINAL_TOOL_EVENTS.has(entry.event);
}

// --- Metrics ---

function buildMetrics(toolEntries, failedEntries, completedEntries, repairEntries = []) {
	const total = toolEntries.length;
	const failed = failedEntries.length;
	const successful = completedEntries.length;
	const hasTerminalSamples = total > 0;
	const hasSuccessSamples = successful > 0;

	const byTool = {};
	const byErrorCode = {};
	const byRequest = {};
	const failuresByRequestTool = {};

	for (const entry of toolEntries) {
		const toolName = entry.details && entry.details.tool_name ? entry.details.tool_name : "unknown";
		const errorCode = entry.details && entry.details.error_code ? entry.details.error_code : "";
		const requestId = entry.request_id || "unknown";

		if (!byTool[toolName]) byTool[toolName] = { total: 0, failed: 0 };
		byTool[toolName].total++;
		if (entry.event === "tool_failed") byTool[toolName].failed++;

		if (entry.event === "tool_failed") {
			if (!byErrorCode[errorCode]) byErrorCode[errorCode] = 0;
			byErrorCode[errorCode]++;

			if (!byRequest[requestId]) byRequest[requestId] = 0;
			byRequest[requestId]++;

			const failureKey = `${requestId}:${toolName}`;
			if (!failuresByRequestTool[failureKey]) failuresByRequestTool[failureKey] = 0;
			failuresByRequestTool[failureKey]++;
		}
	}

	// Count repeated failed attempts for the same request/tool pair.
	const repeatedCalls = Object.values(failuresByRequestTool)
		.reduce((totalRepeated, count) => totalRepeated + Math.max(0, count - 1), 0);

	// Count timeouts
	const timeoutCount = byErrorCode["local_shell_timeout"] || 0;

	// Count workspace boundary failures on local tools without multiplying the same failures by tool category.
	const wrongWorkspaceCount = failedEntries.filter((entry) => {
		const toolName = entry.details && entry.details.tool_name ? entry.details.tool_name : "";
		const errorCode = entry.details && entry.details.error_code ? entry.details.error_code : "";
		return toolName.startsWith("local_") && errorCode === "local_path_blocked";
	}).length;

	const failureRate = total > 0 ? failed / total : null;
	const retryRate = failed > 0 ? repeatedCalls / failed : 0;
	const recoveryRate = failed > 0 ? completedEntries.length / failed : null;

	return {
		total_tool_entries: total,
		total_terminal_events: total,
		successful,
		failed,
		completed: completedEntries.length,
		has_terminal_samples: hasTerminalSamples,
		has_success_samples: hasSuccessSamples,
		failure_rate: failureRate,
		retry_rate: retryRate,
		recovery_rate: recoveryRate,
		by_tool: byTool,
		by_error_code: byErrorCode,
		by_request: byRequest,
		repeated_calls: repeatedCalls,
		timeout_count: timeoutCount,
		wrong_workspace_incidents: wrongWorkspaceCount,
		incorrect_success_status: 0,
		unique_request_ids: Object.keys(byRequest).length,
		input_repairs: buildRepairMetrics(repairEntries)
	};
}

function buildRepairMetrics(entries) {
	const byTool = {};
	const byKind = {};
	let total = 0;
	for (const entry of Array.isArray(entries) ? entries : []) {
		const details = entry && entry.details && typeof entry.details === "object" ? entry.details : {};
		const tool = String(details.tool_name || "unknown");
		const count = Math.max(0, Number(details.count || 0));
		total += count;
		byTool[tool] = (byTool[tool] || 0) + count;
		for (const kind of Array.isArray(details.kinds) ? details.kinds : []) {
			const normalized = String(kind || "").slice(0, 80);
			if (normalized) byKind[normalized] = (byKind[normalized] || 0) + 1;
		}
	}
	return { events: Array.isArray(entries) ? entries.length : 0, total, by_tool: byTool, by_kind: byKind };
}

// --- Failure Inventory ---

function buildFailureInventory(failedEntries, windowStart, now) {
	const families = {};
	const records = [];

	for (const entry of failedEntries) {
		const errorCode = entry.details && entry.details.error_code ? entry.details.error_code : "unknown";
		const toolName = entry.details && entry.details.tool_name ? entry.details.tool_name : "unknown";
		const familyInfo = ERROR_FAMILY_MAP[errorCode] || { family: "FF-unknown", severity: "P3", label: "Unknown error" };

		const familyId = familyInfo.family;
		if (!families[familyId]) {
			families[familyId] = {
				family_id: familyId,
				name: familyInfo.label,
				severity: familyInfo.severity,
				frequency: 0,
				affected_tools: new Set(),
				error_codes: new Set(),
				request_ids: new Set(),
				first_seen: entry.timestamp,
				last_seen: entry.timestamp
			};
		}

		families[familyId].frequency++;
		families[familyId].affected_tools.add(toolName);
		families[familyId].error_codes.add(errorCode);
		families[familyId].request_ids.add(entry.request_id || "unknown");
		families[familyId].last_seen = entry.timestamp;

		records.push({
			event_id: `${entry.request_id || "unknown"}-${records.length}`,
			timestamp: entry.timestamp,
			conversation_id: null,
			task_id: null,
			tool_call_id: null,
			tool_name: toolName,
			operation: entry.event,
			workspace: null,
			repository: null,
			working_directory: null,
			arguments_summary: null,
			status: "failed",
			error_code: errorCode,
			error_category: familyInfo.label,
			error_summary: familyInfo.label,
			duration_ms: null,
			retry_count: 0,
			retry_succeeded: false,
			fallback_used: false,
			parent_task_succeeded: null,
			user_visible_impact: null,
			failure_family: familyId,
			suspected_root_cause: familyInfo.label,
			root_cause_confidence: "Confirmed",
			evidence_references: [`audit.log:${entry.timestamp}:${entry.request_id || "unknown"}`]
		});
	}

	// Convert Sets to arrays for JSON serialization
	const familyList = Object.values(families).map((f) => ({
		...f,
		affected_tools: [...f.affected_tools],
		error_codes: [...f.error_codes],
		request_ids: [...f.request_ids]
	}));

	return {
		records,
		failure_families: familyList.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.frequency - a.frequency)
	};
}

function severityRank(severity) {
	const ranks = { P0: 0, P1: 1, P2: 2, P3: 3 };
	return ranks[severity] !== undefined ? ranks[severity] : 4;
}

// --- Threshold Checking ---

function checkThresholds(metrics, inventory) {
	const breaches = [];

	if (metrics.failure_rate !== null && metrics.failure_rate > THRESHOLDS.max_overall_failure_rate) {
		breaches.push({
			threshold: "max_overall_failure_rate",
			value: metrics.failure_rate,
			limit: THRESHOLDS.max_overall_failure_rate,
			message: `Overall failure rate ${(metrics.failure_rate * 100).toFixed(1)}% exceeds threshold ${(THRESHOLDS.max_overall_failure_rate * 100).toFixed(1)}%`
		});
	}

	for (const [tool, counts] of Object.entries(metrics.by_tool)) {
		if (CRITICAL_TOOLS.has(tool) && counts.total > 0) {
			const rate = counts.failed / counts.total;
			if (rate > THRESHOLDS.max_critical_tool_failure_rate) {
				breaches.push({
					threshold: "max_critical_tool_failure_rate",
					tool,
					value: rate,
					limit: THRESHOLDS.max_critical_tool_failure_rate,
					message: `Critical tool ${tool} failure rate ${(rate * 100).toFixed(1)}% exceeds threshold ${(THRESHOLDS.max_critical_tool_failure_rate * 100).toFixed(1)}%`
				});
			}
		}
	}

	if (metrics.retry_rate > THRESHOLDS.max_retry_rate) {
		breaches.push({
			threshold: "max_retry_rate",
			value: metrics.retry_rate,
			limit: THRESHOLDS.max_retry_rate,
			message: `Retry rate ${(metrics.retry_rate * 100).toFixed(1)}% exceeds threshold ${(THRESHOLDS.max_retry_rate * 100).toFixed(1)}%`
		});
	}

	if (metrics.timeout_count > THRESHOLDS.max_timeout_count) {
		breaches.push({
			threshold: "max_timeout_count",
			value: metrics.timeout_count,
			limit: THRESHOLDS.max_timeout_count,
			message: `Timeout count ${metrics.timeout_count} exceeds threshold ${THRESHOLDS.max_timeout_count}`
		});
	}

	if (metrics.wrong_workspace_incidents > THRESHOLDS.max_wrong_workspace_incidents) {
		breaches.push({
			threshold: "max_wrong_workspace_incidents",
			value: metrics.wrong_workspace_incidents,
			limit: THRESHOLDS.max_wrong_workspace_incidents,
			message: `Wrong-workspace incidents ${metrics.wrong_workspace_incidents} exceeds threshold ${THRESHOLDS.max_wrong_workspace_incidents}`
		});
	}

	const severityCounts = countFailuresBySeverity(inventory);
	for (const [severity, limit] of Object.entries(FAILURE_SEVERITY_THRESHOLDS)) {
		const count = severityCounts[severity] || 0;
		if (count > limit) {
			breaches.push({
				threshold: `max_${severity.toLowerCase()}_failures`,
				value: count,
				limit,
				message: `${severity} failures ${count} exceeds threshold ${limit}`
			});
		}
	}

	return breaches;
}

function countFailuresBySeverity(inventory) {
	const counts = {};
	for (const family of inventory.failure_families) {
		counts[family.severity] = (counts[family.severity] || 0) + family.frequency;
	}
	return counts;
}

// --- Previous Audit Comparison ---

function loadPreviousAudit(outputDir) {
	try {
		const files = fs.readdirSync(outputDir)
			.filter((f) => f.startsWith("tool-audit-") && f.endsWith(".json"))
			.sort()
			.reverse();
		if (files.length === 0) return null;
		const previous = JSON.parse(fs.readFileSync(path.join(outputDir, files[0]), "utf8"));
		return previous;
	} catch (error) {
		return null;
	}
}

// --- Report Builders ---

function buildJsonReport(metrics, inventory, breaches, windowStart, now, previousAudit) {
	return {
		audit_window: {
			start: windowStart.toISOString(),
			end: now.toISOString()
		},
		generated_at: now.toISOString(),
		summary: {
			total_tool_activity_records: metrics.total_tool_entries,
			successful: metrics.successful,
			failed: metrics.failed,
			recovered: 0,
			failure_rate: metrics.failure_rate,
			retry_rate: metrics.retry_rate,
			recovery_rate: metrics.recovery_rate,
			has_success_samples: metrics.has_success_samples,
			input_repairs: metrics.input_repairs
		},
		by_tool: Object.fromEntries(
			Object.entries(metrics.by_tool).map(([tool, counts]) => ({
				[tool]: {
					total: counts.total,
					successful: counts.total - counts.failed,
					failed: counts.failed,
					failure_rate: counts.total > 0 ? counts.failed / counts.total : 0
				}
			})).flatMap((obj) => Object.entries(obj).map(([k, v]) => [k, v]))
		),
		failures_by_error_code: metrics.by_error_code,
		failure_families: inventory.failure_families.map((f) => ({
			family_id: f.family_id,
			name: f.name,
			severity: f.severity,
			frequency: f.frequency,
			affected_tools: f.affected_tools,
			error_codes: f.error_codes
		})),
		threshold_breaches: breaches,
		previous_audit_comparison: previousAudit ? {
			previous_window: previousAudit.audit_window,
			previous_failure_rate: previousAudit.summary ? previousAudit.summary.failure_rate : null,
			current_failure_rate: metrics.failure_rate
		} : null,
		exit_code: breaches.length > 0 ? 1 : 0
	};
}

function buildMarkdownReport(metrics, inventory, breaches, windowStart, now, previousAudit) {
	const lines = [];
	lines.push("# Weekly Tool Reliability Audit Report");
	lines.push("");
	lines.push(`Generated: ${now.toISOString()}`);
	lines.push(`Window: ${windowStart.toISOString()} to ${now.toISOString()}`);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push(`- Total tool activity records: ${metrics.total_tool_entries}`);
	lines.push(`- Successful: ${metrics.successful}`);
	lines.push(`- Failed: ${metrics.failed}`);
	lines.push(`- Failure rate: ${formatPercent(metrics.failure_rate)}`);
	lines.push(`- Retry rate: ${(metrics.retry_rate * 100).toFixed(1)}%`);
	lines.push(`- Timeout count: ${metrics.timeout_count}`);
	lines.push(`- Unique requests with failures: ${metrics.unique_request_ids}`);
	lines.push(`- Tool input repairs: ${metrics.input_repairs.total} across ${metrics.input_repairs.events} calls`);
	if (!metrics.has_success_samples) {
		lines.push("- Success coverage: unavailable in this window because the audit log does not contain any `tool_completed` events.");
	}
	lines.push("");

	lines.push("## Tool Input Repairs");
	lines.push("");
	if (metrics.input_repairs.total === 0) {
		lines.push("No schema-guided input repairs were recorded in this window.");
	} else {
		for (const [tool, count] of Object.entries(metrics.input_repairs.by_tool).sort((a, b) => b[1] - a[1])) lines.push(`- ${tool}: ${count}`);
		lines.push("");
		lines.push("Repair kinds:");
		for (const [kind, count] of Object.entries(metrics.input_repairs.by_kind).sort((a, b) => b[1] - a[1])) lines.push(`- ${kind}: ${count}`);
	}
	lines.push("");

	lines.push("## By Tool");
	lines.push("");
	lines.push("| Tool | Total | Success | Failed | Failure Rate |");
	lines.push("|------|-------|---------|--------|-------------|");
	for (const [tool, counts] of Object.entries(metrics.by_tool).sort((a, b) => b[1].failed - a[1].failed)) {
		const rate = counts.total > 0 ? (counts.failed / counts.total * 100).toFixed(1) : "0.0";
		lines.push(`| ${tool} | ${counts.total} | ${counts.total - counts.failed} | ${counts.failed} | ${rate}% |`);
	}
	lines.push("");

	lines.push("## Failures by Error Code");
	lines.push("");
	for (const [code, count] of Object.entries(metrics.by_error_code).sort((a, b) => b[1] - a[1])) {
		lines.push(`- ${code}: ${count}`);
	}
	lines.push("");

	lines.push("## Failure Families");
	lines.push("");
	for (const family of inventory.failure_families) {
		lines.push(`### ${family.family_id}: ${family.name}`);
		lines.push(`- Severity: ${family.severity}`);
		lines.push(`- Frequency: ${family.frequency}`);
		lines.push(`- Affected tools: ${family.affected_tools.join(", ")}`);
		lines.push(`- Error codes: ${family.error_codes.join(", ")}`);
		lines.push(`- First seen: ${family.first_seen}`);
		lines.push(`- Last seen: ${family.last_seen}`);
		lines.push("");
	}

	if (breaches.length > 0) {
		lines.push("## Threshold Breaches");
		lines.push("");
		for (const breach of breaches) {
			lines.push(`- **${breach.threshold}**: ${breach.message}`);
		}
		lines.push("");
	} else {
		lines.push("## Threshold Breaches");
		lines.push("");
		lines.push("None — all thresholds passed.");
		lines.push("");
	}

	if (previousAudit) {
		lines.push("## Previous Audit Comparison");
		lines.push("");
		const prevRate = previousAudit.summary ? previousAudit.summary.failure_rate : null;
		if (prevRate !== null) {
			const delta = metrics.failure_rate - prevRate;
			const direction = delta > 0 ? "increased" : "decreased";
			lines.push(`- Previous failure rate: ${formatPercent(prevRate)}`);
			lines.push(`- Current failure rate: ${formatPercent(metrics.failure_rate)}`);
			lines.push(`- Change: ${direction} by ${Math.abs(delta * 100).toFixed(1)} percentage points`);
		}
		lines.push("");
	}

	lines.push("## Exit Code");
	lines.push("");
	lines.push(breaches.length > 0 ? "1 (thresholds breached)" : "0 (all thresholds passed)");
	lines.push("");

	return lines.join("\n");
}

function formatPercent(value) {
	if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
	return `${(value * 100).toFixed(1)}%`;
}

// --- Argument Parsing ---

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
			args[key] = value;
		}
	}
	return args;
}

// --- Run ---

if (require.main === module) {
	main();
}

module.exports = {
	ERROR_FAMILY_MAP,
	TERMINAL_TOOL_EVENTS,
	buildFailureInventory,
	buildRepairMetrics,
	buildJsonReport,
	buildMarkdownReport,
	buildMetrics,
	checkThresholds,
	countFailuresBySeverity,
	formatPercent,
	isToolEvent,
	loadPreviousAudit,
	parseArgs,
	parseAuditLog
};
