const MAX_REPAIRS = 24;

const aliases = new Map([
	["absolutePath", "path"],
	["adapterId", "id"],
	["createDirs", "create_dirs"],
	["filePath", "path"],
	["file_path", "path"],
	["maxBytes", "max_bytes"],
	["maxChars", "max_chars"],
	["maxEntries", "max_entries"],
	["maxLineChars", "max_line_chars"],
	["maxResults", "max_results"],
	["recencyDays", "recency_days"],
	["rootId", "root_id"],
	["sessionId", "session_id"],
	["timeoutMs", "timeout_ms"],
	["workspaceId", "root_id"]
]);

function prepareToolArguments(toolName, rawArguments, schema) {
	let parsed;
	try {
		parsed = parseRootArguments(rawArguments);
	} catch (error) {
		if (error && error.code === "invalid_tool_arguments") {
			error.message = error.message.replace("Invalid tool arguments", `Invalid ${toolName} arguments`);
		}
		throw error;
	}
	if (!schema || typeof schema !== "object") return { arguments: parsed, repairs: [] };
	const prepared = prepareSchemaValue(toolName, parsed, schema);
	return { arguments: prepared.value, repairs: prepared.repairs };
}

function prepareSchemaValue(toolName, value, schema, rootPath = "") {
	const initialIssues = validateSchemaValue(value, schema, rootPath);
	const semanticIssue = containsRepairablePathAutolink(value, schema, rootPath);
	if (initialIssues.length === 0 && !semanticIssue) return { value, repairs: [] };

	const repairs = [];
	const candidate = repairValue(cloneJson(value), schema, rootPath, repairs, true);
	const issues = validateSchemaValue(candidate, schema, rootPath);
	if (issues.length > 0 || repairs.overflow === true) {
		throw invalidArgumentsError(toolName, issues.length ? issues : [{ path: "$", expected: `at most ${MAX_REPAIRS} repairs`, actual: "repair budget exceeded" }], repairs);
	}
	return { value: candidate, repairs };
}

function repairValue(value, schema, path, repairs, required) {
	if (!schema || typeof schema !== "object") return value;
	if (value === null && !required) {
		return REMOVED;
	}
	const expected = schema.type;
	if (expected === "array") {
		if (typeof value === "string") {
			const parsed = parseJsonContainer(value, Array.isArray);
			if (parsed) {
				value = parsed;
				addRepair(repairs, path, "json_array_parse");
			} else if (value.trim()) {
				value = [value];
				addRepair(repairs, path, "bare_string_wrap");
			}
		} else if (isPlainObject(value) && Object.keys(value).length === 0) {
			value = [];
			addRepair(repairs, path, "empty_placeholder_to_array");
		}
		if (Array.isArray(value) && schema.items) {
			value = value.map((entry, index) => {
				const repaired = repairValue(entry, schema.items, joinPath(path, index), repairs, true);
				return repaired === REMOVED ? null : repaired;
			});
		}
		return value;
	}
	if (expected === "object") {
		if (typeof value === "string") {
			const parsed = parseJsonContainer(value, isPlainObject);
			if (parsed) {
				value = parsed;
				addRepair(repairs, path, "json_object_parse");
			}
		}
		if (!isPlainObject(value)) return value;
		value = applyAliases(value, schema, path, repairs);
		const requiredKeys = new Set(Array.isArray(schema.required) ? schema.required : []);
		for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
			if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
			const repaired = repairValue(value[key], propertySchema, joinPath(path, key), repairs, requiredKeys.has(key));
			if (repaired === REMOVED) {
				delete value[key];
				addRepair(repairs, joinPath(path, key), "optional_null_omit");
			} else {
				value[key] = repaired;
			}
		}
		return value;
	}
	if (expected === "integer" || expected === "number") {
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed) && (expected !== "integer" || Number.isInteger(parsed))) {
				addRepair(repairs, path, expected === "integer" ? "integer_string_coerce" : "number_string_coerce");
				return parsed;
			}
		}
		return value;
	}
	if (expected === "boolean" && typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true" || normalized === "false") {
			addRepair(repairs, path, "boolean_string_coerce");
			return normalized === "true";
		}
	}
	if (expected === "string" && isPathField(path) && typeof value === "string") {
		const repaired = unwrapDegenerateMarkdownAutolink(value);
		if (repaired !== value) {
			addRepair(repairs, path, "markdown_autolink_unwrap");
			return repaired;
		}
	}
	return value;
}

function applyAliases(value, schema, path, repairs) {
	const properties = schema.properties || {};
	for (const [alias, canonical] of aliases.entries()) {
		if (!Object.prototype.hasOwnProperty.call(value, alias)) continue;
		if (!Object.prototype.hasOwnProperty.call(properties, canonical)) continue;
		if (Object.prototype.hasOwnProperty.call(value, canonical)) continue;
		value[canonical] = value[alias];
		delete value[alias];
		addRepair(repairs, joinPath(path, canonical), `alias:${alias}`);
	}
	return value;
}

function validateSchemaValue(value, schema, path = "") {
	const issues = [];
	validateNode(value, schema, path, issues);
	return issues.slice(0, 8);
}

function validateNode(value, schema, path, issues) {
	if (!schema || typeof schema !== "object" || issues.length >= 8) return;
	const expected = schema.type;
	if (expected && !matchesType(value, expected)) {
		issues.push({ path: displayPath(path), expected, actual: describeType(value) });
		return;
	}
	if (schema.enum && !schema.enum.includes(value)) {
		issues.push({ path: displayPath(path), expected: `one of ${schema.enum.join(", ")}`, actual: describeType(value) });
		return;
	}
	if (expected === "object") {
		const required = Array.isArray(schema.required) ? schema.required : [];
		for (const key of required) {
			if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) {
				issues.push({ path: displayPath(joinPath(path, key)), expected: "required field", actual: "missing" });
			}
		}
		const properties = schema.properties || {};
		for (const [key, entry] of Object.entries(value)) {
			if (Object.prototype.hasOwnProperty.call(properties, key)) {
				validateNode(entry, properties[key], joinPath(path, key), issues);
			} else if (schema.additionalProperties === false) {
				issues.push({ path: displayPath(joinPath(path, key)), expected: "declared field", actual: "unknown field" });
			} else if (isPlainObject(schema.additionalProperties)) {
				validateNode(entry, schema.additionalProperties, joinPath(path, key), issues);
			}
			if (issues.length >= 8) return;
		}
		return;
	}
	if (expected === "array") {
		if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
			issues.push({ path: displayPath(path), expected: `at most ${schema.maxItems} items`, actual: `${value.length} items` });
		}
		if (schema.items) value.forEach((entry, index) => validateNode(entry, schema.items, joinPath(path, index), issues));
		return;
	}
	if (expected === "integer" || expected === "number") {
		if (Number.isFinite(schema.minimum) && value < schema.minimum) issues.push({ path: displayPath(path), expected: `>= ${schema.minimum}`, actual: "out of range" });
		if (Number.isFinite(schema.maximum) && value > schema.maximum) issues.push({ path: displayPath(path), expected: `<= ${schema.maximum}`, actual: "out of range" });
		return;
	}
	if (expected === "string") {
		if (Number.isInteger(schema.minLength) && value.length < schema.minLength) issues.push({ path: displayPath(path), expected: `at least ${schema.minLength} characters`, actual: "too short" });
		if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) issues.push({ path: displayPath(path), expected: `at most ${schema.maxLength} characters`, actual: "too long" });
		if (schema.pattern) {
			let matches = false;
			try { matches = new RegExp(schema.pattern).test(value); } catch { matches = true; }
			if (!matches) issues.push({ path: displayPath(path), expected: `string matching ${schema.pattern}`, actual: "non-matching string" });
		}
	}
}

function parseRootArguments(value) {
	if (isPlainObject(value)) return { ...value };
	const text = String(value === undefined || value === null ? "{}" : value).trim() || "{}";
	try {
		const parsed = JSON.parse(text);
		if (isPlainObject(parsed)) return parsed;
	} catch {
		// Use the stable model-readable error below.
	}
	throw invalidArgumentsError("tool", [{ path: "$", expected: "JSON object", actual: describeType(value) }], []);
}

function invalidArgumentsError(toolName, issues, repairs) {
	const detail = issues.slice(0, 3).map((issue) => `${issue.path} expected ${issue.expected}; received ${issue.actual}`).join(" ");
	const error = new Error(`Invalid ${toolName} arguments. ${detail}`.trim());
	error.code = "invalid_tool_arguments";
	error.retryable = false;
	error.retry_hint = "Retry the tool with the named fields and JSON types from its schema; omit optional fields instead of sending null.";
	error.input_repairs = repairs.slice(0, MAX_REPAIRS);
	return error;
}

function annotateToolResult(result, repairs) {
	if (!Array.isArray(repairs) || repairs.length === 0) return result;
	const summary = repairs.slice(0, MAX_REPAIRS).map((entry) => ({ path: entry.path, kind: entry.kind }));
	if (isPlainObject(result)) return { ...result, input_repairs: summary };
	return { result: result === undefined ? null : result, input_repairs: summary };
}

function unwrapDegenerateMarkdownAutolink(value) {
	return String(value).replace(/\[([^\]\r\n]+)\]\((https?:\/\/[^)\s]+)\)/gi, (match, label, url) => {
		const withoutProtocol = String(url).replace(/^https?:\/\//i, "").replace(/\/$/, "");
		return label === withoutProtocol ? label : match;
	});
}

function containsRepairablePathAutolink(value, schema, path = "") {
	if (!schema || typeof schema !== "object") return false;
	if (schema.type === "string" && isPathField(path) && typeof value === "string") return unwrapDegenerateMarkdownAutolink(value) !== value;
	if (schema.type === "object" && isPlainObject(value)) {
		return Object.entries(schema.properties || {}).some(([key, propertySchema]) =>
			Object.prototype.hasOwnProperty.call(value, key) && containsRepairablePathAutolink(value[key], propertySchema, joinPath(path, key))
		);
	}
	if (schema.type === "array" && Array.isArray(value) && schema.items) {
		return value.some((entry, index) => containsRepairablePathAutolink(entry, schema.items, joinPath(path, index)));
	}
	return false;
}

function parseJsonContainer(value, predicate) {
	try {
		const parsed = JSON.parse(String(value));
		return predicate(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function matchesType(value, expected) {
	if (expected === "object") return isPlainObject(value);
	if (expected === "array") return Array.isArray(value);
	if (expected === "integer") return Number.isInteger(value);
	if (expected === "number") return typeof value === "number" && Number.isFinite(value);
	if (expected === "string") return typeof value === "string";
	if (expected === "boolean") return typeof value === "boolean";
	if (expected === "null") return value === null;
	return true;
}

function describeType(value) {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (value === undefined) return "missing";
	return typeof value;
}

function isPathField(path) {
	return /(?:^|\.)(?:path|cwd)$/.test(String(path));
}

function isPlainObject(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function addRepair(repairs, path, kind) {
	if (repairs.length >= MAX_REPAIRS) {
		repairs.overflow = true;
		return;
	}
	repairs.push({ path: displayPath(path), kind });
}

function joinPath(base, key) {
	return base ? `${base}.${key}` : String(key);
}

function displayPath(path) {
	return path ? `$.${path}` : "$";
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

const REMOVED = Symbol("removed");

module.exports = {
	annotateToolResult,
	prepareSchemaValue,
	prepareToolArguments,
	unwrapDegenerateMarkdownAutolink,
	validateSchemaValue
};
