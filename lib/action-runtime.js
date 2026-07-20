const fs = require("fs");
const net = require("net");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RESULT_BYTES = 128 * 1024;

function createActionRuntime(options = {}) {
	const env = options.env || process.env;
	const fetchFn = options.fetchFn || fetch;
	const enabled = parseBoolean(env.AI_CHAT_ACTIONS_ENABLED, false);
	const manifestPath = String(env.AI_CHAT_ACTION_MANIFEST_PATH || "").trim();
	const timeoutMs = clampInteger(env.AI_CHAT_ACTION_TIMEOUT_MS, 1000, 120000, DEFAULT_TIMEOUT_MS);
	const maxResultBytes = clampInteger(env.AI_CHAT_ACTION_MAX_RESULT_BYTES, 1024, 1024 * 1024, DEFAULT_MAX_RESULT_BYTES);
	const manifest = enabled && manifestPath ? loadManifest(manifestPath) : { adapters: [] };
	const adapters = normalizeAdapters(manifest.adapters || [], { timeoutMs });
	const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));

	function list() {
		return {
			adapters: adapters.map(publicAdapter),
			meta: status()
		};
	}

	async function call(rawArguments = {}, context = {}) {
		const args = normalizeCallArguments(rawArguments);
		const adapter = byId.get(args.id);
		if (!adapter) {
			throw actionError("action_adapter_not_found", "The requested action adapter is not configured.");
		}
		const controller = new AbortController();
		const cleanup = pipeAbort(context.signal, controller);
		const timer = setTimeout(() => controller.abort(actionError("action_adapter_timeout", "The action adapter timed out.")), adapter.timeout_ms);
		try {
			const response = await fetchFn(adapter.url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json"
				},
				body: JSON.stringify({ input: args.input }),
				signal: controller.signal
			});
			const raw = await response.text();
			if (Buffer.byteLength(raw, "utf8") > maxResultBytes) {
				throw actionError("action_adapter_result_too_large", "The action adapter response exceeded the configured result limit.");
			}
			let payload = null;
			try {
				payload = raw ? JSON.parse(raw) : null;
			} catch (error) {
				throw actionError("action_adapter_invalid_json", "The action adapter returned invalid JSON.");
			}
			if (!response.ok) {
				const error = actionError("action_adapter_failed", `The action adapter returned HTTP ${Number(response.status || 0) || "error"}.`);
				error.status = Number(response.status || 0);
				error.result = sanitizeResult(payload);
				throw error;
			}
			return {
				adapter: publicAdapter(adapter),
				result: sanitizeResult(payload)
			};
		} catch (error) {
			if (controller.signal.aborted && context.signal && context.signal.aborted) {
				throw actionError("action_adapter_aborted", "The action adapter call was cancelled.");
			}
			if (controller.signal.aborted && error && error.code === "action_adapter_timeout") throw error;
			throw error;
		} finally {
			clearTimeout(timer);
			cleanup();
		}
	}

	function status() {
		return {
			enabled,
			available: enabled && adapters.length > 0,
			adapter_count: adapters.length,
			adapters: adapters.map(publicAdapter),
			limits: {
				timeout_ms: timeoutMs,
				max_result_bytes: maxResultBytes
			}
		};
	}

	return {
		canExecute: () => enabled && adapters.length > 0,
		status,
		list,
		call
	};
}

function loadManifest(manifestPath) {
	let text = "";
	try {
		text = fs.readFileSync(manifestPath, "utf8");
	} catch (error) {
		return { adapters: [] };
	}
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { adapters: [] };
	} catch (error) {
		return { adapters: [] };
	}
}

function normalizeAdapters(rawAdapters, options = {}) {
	const seen = new Set();
	const out = [];
	for (const raw of Array.isArray(rawAdapters) ? rawAdapters : []) {
		if (!raw || typeof raw !== "object") continue;
		const id = sanitizeId(raw.id);
		if (!id || seen.has(id)) continue;
		const url = normalizeAdapterUrl(raw.url);
		if (!url) continue;
		seen.add(id);
		out.push({
			id,
			name: boundedText(raw.name || id, 120),
			description: boundedText(raw.description, 1000),
			url,
			input_schema: raw.input_schema && typeof raw.input_schema === "object" && !Array.isArray(raw.input_schema)
				? raw.input_schema
				: { type: "object", properties: {}, additionalProperties: true },
			timeout_ms: clampInteger(raw.timeout_ms, 1000, options.timeoutMs || DEFAULT_TIMEOUT_MS, options.timeoutMs || DEFAULT_TIMEOUT_MS)
		});
	}
	return out.slice(0, 64);
}

function normalizeAdapterUrl(value) {
	const text = String(value || "").trim();
	if (!text) return "";
	let parsed;
	try {
		parsed = new URL(text);
	} catch (error) {
		return "";
	}
	if (parsed.username || parsed.password || parsed.hash) return "";
	const host = parsed.hostname.toLowerCase();
	const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || (net.isIP(host) === 6 && host === "0:0:0:0:0:0:0:1");
	if (!loopback || parsed.protocol !== "http:") return "";
	return parsed.toString();
}

function normalizeCallArguments(value) {
	const args = normalizeObjectArguments(value);
	return {
		id: sanitizeId(args.id),
		input: args.input && typeof args.input === "object" && !Array.isArray(args.input) ? args.input : {}
	};
}

function normalizeObjectArguments(value) {
	if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
	const text = String(value || "").trim();
	if (!text) return {};
	try {
		const parsed = JSON.parse(text);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
	} catch (error) {
		// Use the stable invalid-arguments error below.
	}
	throw actionError("invalid_tool_arguments", "The provider returned invalid JSON tool arguments.");
}

function sanitizeResult(value) {
	return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

function publicAdapter(adapter) {
	return {
		id: adapter.id,
		name: adapter.name,
		description: adapter.description,
		input_schema: adapter.input_schema,
		timeout_ms: adapter.timeout_ms
	};
}

function pipeAbort(signal, controller) {
	if (!signal) return () => {};
	if (signal.aborted) {
		controller.abort(signal.reason || actionError("action_adapter_aborted", "The action adapter call was cancelled."));
		return () => {};
	}
	const onAbort = () => controller.abort(signal.reason || actionError("action_adapter_aborted", "The action adapter call was cancelled."));
	signal.addEventListener("abort", onAbort, { once: true });
	return () => signal.removeEventListener("abort", onAbort);
}

function sanitizeId(value) {
	return String(value || "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80);
}

function boundedText(value, maxLength) {
	return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampInteger(value, min, max, fallback) {
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function parseBoolean(value, fallbackValue) {
	if (value === undefined || value === null || value === "") return fallbackValue;
	const text = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(text)) return true;
	if (["0", "false", "no", "off"].includes(text)) return false;
	return fallbackValue;
}

function actionError(code, message) {
	const error = new Error(message);
	error.code = code;
	return error;
}

module.exports = {
	createActionRuntime,
	normalizeAdapters,
	normalizeAdapterUrl,
	actionError
};
