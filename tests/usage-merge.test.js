const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

function extractFunction(name) {
	const start = appSource.indexOf(`function ${name}(`);
	assert.notEqual(start, -1, `${name} should exist`);
	const bodyStart = appSource.indexOf("{", start);
	let depth = 0;
	for (let index = bodyStart; index < appSource.length; index += 1) {
		const char = appSource[index];
		if (char === "{") depth += 1;
		if (char === "}") depth -= 1;
		if (depth === 0) return appSource.slice(start, index + 1);
	}
	throw new Error(`Could not extract ${name}`);
}

const { mergeUsageTotals } = Function(`
${extractFunction("finiteUsageValue")}
${extractFunction("nullableUsageValue")}
${extractFunction("mergeUsageTotals")}
return { mergeUsageTotals };
`)();

test("mergeUsageTotals tolerates a null accumulator before the first usage payload", () => {
	assert.deepEqual(mergeUsageTotals(null, {
		input_tokens: 10,
		output_tokens: 5,
		total_tokens: 15,
		cached_input_tokens: null,
		cache_write_input_tokens: null
	}), {
		input_tokens: 10,
		output_tokens: 5,
		total_tokens: 15,
		cached_input_tokens: null,
		cache_write_input_tokens: null,
		cache_details_reported: false
	});
});

test("mergeUsageTotals preserves reported cache values across multiple usage payloads", () => {
	const first = mergeUsageTotals(null, {
		input_tokens: 10,
		output_tokens: 5,
		total_tokens: 15,
		cached_input_tokens: 3,
		cache_details_reported: true
	});

	assert.deepEqual(mergeUsageTotals(first, {
		input_tokens: 4,
		output_tokens: 2,
		total_tokens: 6,
		cache_write_input_tokens: 1
	}), {
		input_tokens: 14,
		output_tokens: 7,
		total_tokens: 21,
		cached_input_tokens: 3,
		cache_write_input_tokens: 1,
		cache_details_reported: true
	});
});
