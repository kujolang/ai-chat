const TOOL_NAME_ALIASES = new Map([
	["systemTime", "system_time"],
	["webSearch", "web_search"],
	["skillList", "skill_list"],
	["skillRead", "skill_read"],
	["skillFileRead", "skill_file_read"],
	["localWorkspaceList", "local_workspace_list"],
	["localFileList", "local_file_list"],
	["localFileRead", "local_file_read"],
	["localFileWrite", "local_file_write"],
	["localShell", "local_shell"],
	["actionAdapterList", "action_adapter_list"],
	["actionAdapterCall", "action_adapter_call"],
	["browserOpen", "browser_open"],
	["browserSnapshot", "browser_snapshot"],
	["browserAct", "browser_act"],
	["browserClose", "browser_close"],
	["browserUse", "browser_use"]
]);

const FIELD_ALIASES = new Map([
	["rootId", "root_id"],
	["maxEntries", "max_entries"],
	["maxChars", "max_chars"],
	["maxBytes", "max_bytes"],
	["maxLineChars", "max_line_chars"],
	["createDirs", "create_dirs"],
	["timeoutMs", "timeout_ms"],
	["sessionId", "session_id"],
	["maxResults", "max_results"],
	["skillId", "id"],
	["adapterId", "id"]
]);

const TOOL_FIELD_ALIASES = {
	local_file_list: { filePath: "path", file_path: "path", absolutePath: "path", absolute_path: "path" },
	local_file_read: { filePath: "path", file_path: "path", absolutePath: "path", absolute_path: "path" },
	local_file_write: { filePath: "path", file_path: "path", absolutePath: "path", absolute_path: "path" },
	skill_file_read: { filePath: "path", file_path: "path" }
};

const ENUM_ALIASES = {
	web_search: { freshness: { past_day: "day", past_week: "week", past_month: "month", past_year: "year" } },
	browser_act: { "action.type": { open: "navigate", extract: "snapshot" } }
};

function validateThenRepairToolCall({ name, input, schema, canExecute = () => true }) {
	const requestedName = String(name || "").trim();
	const canonicalName = canExecute(requestedName)
		? requestedName
		: (TOOL_NAME_ALIASES.get(requestedName) || requestedName);
	const parsed = parseToolInput(input);
	const initialIssues = [
		...validateSchema(parsed, schema),
		...validateToolInvariants(parsed, canonicalName),
		...validateRepairableSemantics(parsed, schema)
	];
	const nameRepaired = canonicalName !== requestedName && canExecute(canonicalName);

	if (initialIssues.length === 0 && !nameRepaired) {
		return { name: requestedName, input: parsed, repaired: false, notes: [], repair_types: [] };
	}

	let working = cloneJson(parsed);
	const notes = [];
	if (nameRepaired) notes.push(repairNote("tool_alias", "$", `Used canonical tool name ${canonicalName}.`));
	if (schema && schema.type === "object" && !isPlainObject(working)) {
		const requiredKeys = Array.isArray(schema.required) ? schema.required : [];
		if (requiredKeys.length === 1 && scalar(working)) {
			working = { [requiredKeys[0]]: working };
			notes.push(repairNote("bare_scalar_wrap", "$", `Wrapped a scalar as ${requiredKeys[0]}.`));
		}
	}
	applyObjectAliases(working, schema, canonicalName, "$", notes);
	applySchemaRepairs(working, schema, canonicalName, "$", notes);
	applyRelationalDefaults(working, canonicalName, notes);
	const repairedIssues = [
		...validateSchema(working, schema),
		...validateToolInvariants(working, canonicalName),
		...validateRepairableSemantics(working, schema)
	];
	if (repairedIssues.length > 0) {
		throw invalidArgumentsError(canonicalName, repairedIssues);
	}
	return {
		name: canonicalName,
		input: working,
		repaired: notes.length > 0,
		notes,
		repair_types: [...new Set(notes.map((note) => note.type))]
	};
}

function parseToolInput(value) {
	if (value && typeof value === "object" && !Array.isArray(value)) return value;
	if (typeof value === "string") {
		const text = value.trim();
		if (!text) return {};
		try {
			return JSON.parse(text);
		} catch (error) {
			return value;
		}
	}
	if (value === undefined || value === null) return {};
	return value;
}

function applyObjectAliases(value, schema, toolName, path, notes) {
	if (!value || typeof value !== "object" || Array.isArray(value) || !schema || schema.type !== "object") return;
	const properties = schema.properties || {};
	const aliases = { ...(TOOL_FIELD_ALIASES[toolName] || {}) };
	for (const [alias, canonical] of FIELD_ALIASES) aliases[alias] = canonical;
	for (const [alias, canonical] of Object.entries(aliases)) {
		if (!Object.hasOwn(value, alias) || Object.hasOwn(value, canonical) || !Object.hasOwn(properties, canonical)) continue;
		value[canonical] = value[alias];
		delete value[alias];
		notes.push(repairNote("canonical_alias", `${path}.${canonical}`, `Mapped ${alias} to ${canonical}.`));
	}
	for (const [key, childSchema] of Object.entries(properties)) {
		if (Object.hasOwn(value, key)) applyObjectAliases(value[key], childSchema, toolName, `${path}.${key}`, notes);
	}
}

function applySchemaRepairs(value, schema, toolName, path, notes, parent = null, key = null) {
	if (!schema) return;
	const required = new Set(Array.isArray(schema.required) ? schema.required : []);
	if (schema.type === "object" && typeof value === "string" && parent) {
		const parsed = parseStructuredString(value, "object");
		if (parsed) {
			parent[key] = parsed;
			notes.push(repairNote("stringified_object", path, "Parsed a JSON-encoded object."));
			value = parsed;
		}
	}
	if (schema.type === "object") {
		if (!isPlainObject(value)) {
			const requiredKeys = [...required];
			if (parent && requiredKeys.length === 1 && scalar(value)) {
				parent[key] = { [requiredKeys[0]]: value };
				notes.push(repairNote("bare_scalar_wrap", path, `Wrapped a scalar as ${requiredKeys[0]}.`));
				value = parent[key];
			} else {
				return;
			}
		}
		for (const [childKey, childSchema] of Object.entries(schema.properties || {})) {
			if (!Object.hasOwn(value, childKey)) continue;
			if (value[childKey] === null && !required.has(childKey)) {
				delete value[childKey];
				notes.push(repairNote("null_optional", `${path}.${childKey}`, `Omitted optional ${childKey}.`));
				continue;
			}
			applySchemaRepairs(value[childKey], childSchema, toolName, `${path}.${childKey}`, notes, value, childKey);
		}
		return;
	}

	if (schema.type === "array" && !Array.isArray(value) && parent) {
		if (typeof value === "string") {
			const parsed = parseStructuredString(value, "array");
			if (parsed) {
				parent[key] = parsed;
				notes.push(repairNote("stringified_array", path, "Parsed a JSON-encoded array."));
				value = parsed;
			} else {
				parent[key] = [value];
				notes.push(repairNote("bare_scalar_wrap", path, "Wrapped a scalar in an array."));
				value = parent[key];
			}
		} else if (scalar(value)) {
			parent[key] = [value];
			notes.push(repairNote("bare_scalar_wrap", path, "Wrapped a scalar in an array."));
			value = parent[key];
		}
	}

	if ((schema.type === "integer" || schema.type === "number") && typeof value === "string" && parent) {
		const text = value.trim();
		const numeric = text === "" ? NaN : Number(text);
		if (Number.isFinite(numeric) && (schema.type !== "integer" || Number.isInteger(numeric))) {
			parent[key] = numeric;
			notes.push(repairNote("numeric_coercion", path, `Coerced ${key} to ${schema.type}.`));
			value = numeric;
		}
	}

	if (schema.type === "boolean" && typeof value === "string" && parent) {
		const normalized = value.trim().toLowerCase();
		if (["true", "false", "1", "0", "yes", "no"].includes(normalized)) {
			parent[key] = ["true", "1", "yes"].includes(normalized);
			notes.push(repairNote("boolean_coercion", path, `Coerced ${key} to boolean.`));
			value = parent[key];
		}
	}

	if (schema.type === "string" && typeof value === "string" && parent && isPathField(key)) {
		const unwrapped = unwrapMarkdownPath(value);
		if (unwrapped !== value) {
			parent[key] = unwrapped;
			notes.push(repairNote("markdown_path", path, `Removed markdown link formatting from ${key}.`));
			value = unwrapped;
		}
	}

	const enumAlias = ENUM_ALIASES[toolName] && ENUM_ALIASES[toolName][path.replace(/^\$\.?/, "")];
	if (enumAlias && typeof value === "string" && Object.hasOwn(enumAlias, value) && parent) {
		parent[key] = enumAlias[value];
		notes.push(repairNote("canonical_alias", path, `Mapped ${key} to its canonical enum value.`));
		value = parent[key];
	}

	if (Array.isArray(value) && schema.items) {
		for (let index = 0; index < value.length; index += 1) {
			applySchemaRepairs(value[index], schema.items, toolName, `${path}[${index}]`, notes, value, index);
		}
	}
}

function applyRelationalDefaults(value, toolName, notes) {
	if (!isPlainObject(value)) return;
	if (toolName === "local_file_read") {
		if (Object.hasOwn(value, "limit") && !Object.hasOwn(value, "offset")) {
			value.offset = 1;
			notes.push(repairNote("relational_default", "$.offset", "Defaulted offset to the first line because limit was provided."));
		}
		if (Object.hasOwn(value, "offset") && !Object.hasOwn(value, "limit")) {
			value.limit = 2000;
			notes.push(repairNote("relational_default", "$.limit", "Defaulted limit to 2000 lines because offset was provided."));
		}
	}
	if (toolName === "local_shell" && Object.hasOwn(value, "command") && !Object.hasOwn(value, "args")) {
		value.args = [];
		notes.push(repairNote("relational_default", "$.args", "Defaulted command arguments to an empty array."));
	}
	if (toolName === "action_adapter_call" && Object.hasOwn(value, "id") && !Object.hasOwn(value, "input")) {
		value.input = {};
		notes.push(repairNote("relational_default", "$.input", "Defaulted adapter input to an empty object."));
	}
}

function validateToolInvariants(value, toolName) {
	if (!isPlainObject(value)) return [];
	if (toolName === "local_file_read") {
		const hasOffset = Object.hasOwn(value, "offset") && value.offset !== null;
		const hasLimit = Object.hasOwn(value, "limit") && value.limit !== null;
		if (hasOffset !== hasLimit) {
			return [{
				path: hasOffset ? "$.limit" : "$.offset",
				code: "relational_invariant",
				expected: hasOffset ? "limit when offset is provided" : "offset when limit is provided"
			}];
		}
	}
	return [];
}

function validateRepairableSemantics(value, schema, path = "$") {
	if (!schema || typeof schema !== "object") return [];
	const issues = [];
	if (schema.type === "object" && isPlainObject(value)) {
		for (const [key, childSchema] of Object.entries(schema.properties || {})) {
			if (!Object.hasOwn(value, key)) continue;
			if (childSchema.type === "string" && isPathField(key) && typeof value[key] === "string" && unwrapMarkdownPath(value[key]) !== value[key]) {
				issues.push({ path: `${path}.${key}`, code: "markdown_path", expected: "literal filesystem path" });
			}
			issues.push(...validateRepairableSemantics(value[key], childSchema, `${path}.${key}`));
		}
	}
	if (schema.type === "array" && Array.isArray(value) && schema.items) {
		for (let index = 0; index < value.length; index += 1) issues.push(...validateRepairableSemantics(value[index], schema.items, `${path}[${index}]`));
	}
	return issues;
}

function validateSchema(value, schema, path = "$") {
	const issues = [];
	if (!schema || typeof schema !== "object") return issues;
	if (!matchesType(value, schema.type)) {
		issues.push({ path, code: "type", expected: schema.type || "schema-compatible value" });
		return issues;
	}
	if (schema.type === "object") {
		for (const required of schema.required || []) {
			if (!Object.hasOwn(value, required)) issues.push({ path: `${path}.${required}`, code: "required", expected: "required field" });
		}
		const properties = schema.properties || {};
		for (const [key, child] of Object.entries(properties)) {
			if (Object.hasOwn(value, key)) issues.push(...validateSchema(value[key], child, `${path}.${key}`));
		}
		if (schema.additionalProperties === false) {
			for (const key of Object.keys(value)) {
				if (!Object.hasOwn(properties, key)) issues.push({ path: `${path}.${key}`, code: "additional_property", expected: "declared field" });
			}
		}
	}
	if (schema.type === "array") {
		if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) issues.push({ path, code: "max_items", expected: `at most ${schema.maxItems} items` });
		for (let index = 0; index < value.length; index += 1) issues.push(...validateSchema(value[index], schema.items || {}, `${path}[${index}]`));
	}
	if (typeof value === "string") {
		if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) issues.push({ path, code: "pattern", expected: schema.pattern });
	}
	if (typeof value === "number") {
		if (Number.isFinite(schema.minimum) && value < schema.minimum) issues.push({ path, code: "minimum", expected: `>= ${schema.minimum}` });
		if (Number.isFinite(schema.maximum) && value > schema.maximum) issues.push({ path, code: "maximum", expected: `<= ${schema.maximum}` });
	}
	if (Array.isArray(schema.enum) && !schema.enum.includes(value)) issues.push({ path, code: "enum", expected: schema.enum.join(" | ") });
	return issues;
}

function matchesType(value, type) {
	if (!type) return true;
	if (type === "object") return isPlainObject(value);
	if (type === "array") return Array.isArray(value);
	if (type === "integer") return Number.isInteger(value);
	if (type === "number") return typeof value === "number" && Number.isFinite(value);
	if (type === "string") return typeof value === "string";
	if (type === "boolean") return typeof value === "boolean";
	return true;
}

function invalidArgumentsError(toolName, issues) {
	const summary = issues.slice(0, 8).map((issue) => `${issue.path}: expected ${issue.expected}`).join("; ");
	const compatibilityHint = toolName === "web_search" && issues.some((issue) => issue.path === "$.query")
		? " web_search.query must contain between 1 and 500 characters."
		: "";
	const error = new Error(`${toolName || "tool"} arguments could not be repaired. ${summary}.${compatibilityHint} Retry with the advertised schema.`);
	error.code = "invalid_tool_arguments";
	error.retryable = true;
	error.issue_count = issues.length;
	error.issue_codes = [...new Set(issues.map((issue) => issue.code))];
	return error;
}

function unwrapMarkdownPath(value) {
	return String(value).replace(/\[([^\]]+)\]\((?:https?:\/\/)?([^\s)]+)\)/g, (match, label, target) => {
		const normalizedTarget = String(target).replace(/^\/+|\/+$/g, "");
		return label === normalizedTarget ? label : match;
	});
}

function parseStructuredString(value, type) {
	try {
		const parsed = JSON.parse(String(value));
		if (type === "array" && Array.isArray(parsed)) return parsed;
		if (type === "object" && isPlainObject(parsed)) return parsed;
	} catch (error) {
		return null;
	}
	return null;
}

function repairNote(type, path, message) {
	return { type, path, message };
}

function isPathField(key) {
	return ["path", "cwd", "file_path", "absolute_path"].includes(String(key));
}

function isPlainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scalar(value) {
	return value !== null && value !== undefined && (typeof value === "string" || typeof value === "number" || typeof value === "boolean");
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

module.exports = {
	TOOL_NAME_ALIASES,
	validateThenRepairToolCall,
	validateSchema,
	unwrapMarkdownPath
};
