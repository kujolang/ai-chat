#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { builtinToolSchemas } = require("../lib/tool-runtime");
const { TOOL_NAME_ALIASES, validateSchema, validateThenRepairToolCall } = require("../lib/tool-input-repair");

const fixturePath = path.resolve(process.argv[2] || path.join(__dirname, "..", "tests", "fixtures", "tool-repair-adversarial.json"));
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const schemas = new Map(builtinToolSchemas().map((entry) => [entry.function.name, entry.function.parameters]));
const rows = fixtures.map(runFixture);
const beforeCompleted = rows.filter((row) => row.before_valid).length;
const afterCompleted = rows.filter((row) => row.after_valid).length;
const beforeRetries = rows.length - beforeCompleted;
const afterRetries = rows.length - afterCompleted;
const inputBytes = rows.reduce((sum, row) => sum + row.input_bytes, 0);
const beforeInputBytesWithRetries = rows.reduce((sum, row) => sum + row.input_bytes * (row.before_valid ? 1 : 2), 0);
const report = {
	benchmark: "tool-call-repair-adversarial-v1",
	fixture_path: fixturePath,
	providers: [...new Set(rows.map((row) => row.provider))],
	models: [...new Set(rows.map((row) => row.model))],
	before: {
		repair_rate: 0,
		retry_count: beforeRetries,
		estimated_token_use: estimateTokens(beforeInputBytesWithRetries),
		latency_ms: Number(rows.reduce((sum, row) => sum + row.before_latency_ms, 0).toFixed(3)),
		task_completion: rate(beforeCompleted, rows.length)
	},
	after: {
		repair_rate: rate(rows.filter((row) => row.repaired).length, rows.length),
		retry_count: afterRetries,
		estimated_token_use: estimateTokens(inputBytes),
		latency_ms: Number(rows.reduce((sum, row) => sum + row.after_latency_ms, 0).toFixed(3)),
		task_completion: rate(afterCompleted, rows.length)
	},
	results: rows
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (afterCompleted !== rows.length) process.exitCode = 1;

function runFixture(fixture) {
	const canonicalName = schemas.has(fixture.tool) ? fixture.tool : (TOOL_NAME_ALIASES.get(fixture.tool) || fixture.tool);
	const schema = schemas.get(canonicalName);
	const beforeStarted = performance.now();
	const beforeIssues = validateSchema(fixture.input, schema);
	const beforeLatencyMs = performance.now() - beforeStarted;
	const row = {
		provider: fixture.provider,
		model: fixture.model,
		tool_name: canonicalName,
		input_bytes: Buffer.byteLength(JSON.stringify(fixture.input)),
		before_valid: beforeIssues.length === 0 && fixture.tool === canonicalName,
		before_latency_ms: Number(beforeLatencyMs.toFixed(3)),
		after_valid: false,
		after_latency_ms: 0,
		repaired: false,
		repair_types: []
	};
	const afterStarted = performance.now();
	try {
		const prepared = validateThenRepairToolCall({ name: fixture.tool, input: fixture.input, schema, canExecute: (name) => schemas.has(name) });
		row.after_latency_ms = Number((performance.now() - afterStarted).toFixed(3));
		row.after_valid = validateSchema(prepared.input, schema).length === 0 && prepared.name === canonicalName;
		row.repaired = prepared.repaired;
		row.repair_types = prepared.repair_types;
	} catch (error) {
		row.after_latency_ms = Number((performance.now() - afterStarted).toFixed(3));
		row.error_code = String(error && error.code || "invalid_tool_arguments");
	}
	return row;
}

function rate(value, total) {
	return total ? Number((value / total).toFixed(4)) : 0;
}

function estimateTokens(bytes) {
	return Math.ceil(bytes / 4);
}
