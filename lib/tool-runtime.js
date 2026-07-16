const net = require("net");

const supportedFreshness = new Set(["day", "week", "month", "year"]);

function createToolRuntime(options = {}) {
	const fetchFn = options.fetchFn || fetch;
	const nowMs = options.nowMs || (() => Date.now());
	const maxSearchResults = clampInteger(options.maxSearchResults, 1, 10, 5);
	const searchBackend = normalizeSearchBackend(options.searchBackend);
	const searxngBaseUrl = normalizeSearxngBaseUrl(options.searxngBaseUrl);
	const getOllamaApiKey = typeof options.getOllamaApiKey === "function" ? options.getOllamaApiKey : (() => "");
	const browserRuntime = options.browserRuntime || null;
	const registry = new Map();

	register("web_search", async (rawArguments, context = {}) => {
		const args = normalizeWebSearchArguments(rawArguments, maxSearchResults);
		const backend = resolveSearchBackend(searchBackend, searxngBaseUrl);
		if (backend === "searxng") {
			return executeSearxngSearch({ fetchFn, baseUrl: searxngBaseUrl, args, signal: context.signal });
		}

		const apiKey = String(context.credentials && context.credentials.ollamaApiKey || getOllamaApiKey() || "").trim();
		return executeOllamaSearch({ fetchFn, apiKey, args, signal: context.signal, nowMs });
	});

	if (browserRuntime && browserRuntime.canExecute()) {
		for (const name of ["browser_open", "browser_snapshot", "browser_act", "browser_close", "browser_use"]) {
			register(name, (rawArguments, context = {}) => browserRuntime.execute(name, rawArguments, context));
		}
	}

	function register(name, executor) {
		const normalizedName = String(name || "").trim();
		if (!normalizedName || typeof executor !== "function") {
			throw new Error("Tool registration requires a name and executor function.");
		}
		registry.set(normalizedName, executor);
	}

	function canExecute(name) {
		return registry.has(String(name || "").trim());
	}

	async function execute(name, rawArguments, context = {}) {
		const normalizedName = String(name || "").trim();
		const executor = registry.get(normalizedName);
		if (!executor) {
			throw toolError("tool_execution_unavailable", `No executor is connected for ${normalizedName || "the requested tool"}.`);
		}
		return executor(rawArguments, context);
	}

	return {
		register,
		canExecute,
		execute,
		list: () => [...registry.keys()],
		schemas: () => builtinToolSchemas().filter((schema) => registry.has(schema.function.name)),
		searchBackend: () => resolveSearchBackend(searchBackend, searxngBaseUrl),
		browserStatus: () => browserRuntime ? browserRuntime.status() : { enabled: false, available: false, backend: null, headless: true, action_policy: "read-only", unavailable_reason: "disabled" },
		close: async () => {
			if (browserRuntime && typeof browserRuntime.close === "function") await browserRuntime.close();
		}
	};
}

function builtinToolSchemas() {
	return [
		{
			type: "function",
			function: {
				name: "web_search",
				description: "Search the live web through AI Chat's provider-neutral tool runtime and return sourced results.",
				parameters: {
					type: "object",
					properties: {
						query: { type: "string" },
						domains: { type: "array", items: { type: "string" }, maxItems: 10 },
						freshness: { type: "string", enum: ["day", "week", "month", "year"] },
						max_results: { type: "integer", minimum: 1, maximum: 10 }
					},
					required: ["query"],
					additionalProperties: false
				}
			}
		},
		{
			type: "function",
			function: {
				name: "browser_open",
				description: "Open or navigate an isolated local browser session to a public HTTP or HTTPS URL.",
				parameters: {
					type: "object",
					properties: { url: { type: "string" }, session_id: { type: "string" } },
					required: ["url"],
					additionalProperties: false
				}
			}
		},
		{
			type: "function",
			function: {
				name: "browser_snapshot",
				description: "Capture bounded readable text, links, and accessibility-oriented element refs from a browser session.",
				parameters: { type: "object", properties: { session_id: { type: "string" } }, required: ["session_id"], additionalProperties: false }
			}
		},
		{
			type: "function",
			function: {
				name: "browser_act",
				description: "Perform one bounded browser action using an element ref from the latest snapshot.",
				parameters: {
					type: "object",
					properties: {
						session_id: { type: "string" },
						action: {
							type: "object",
							properties: {
								type: { type: "string", enum: ["navigate", "click", "type", "scroll", "back", "screenshot", "snapshot", "close"] },
								url: { type: "string" },
								target: { type: "string" },
								text: { type: "string" },
								direction: { type: "string", enum: ["up", "down"] },
								amount: { type: "integer" }
							},
							required: ["type"],
							additionalProperties: false
						}
					},
					required: ["session_id", "action"],
					additionalProperties: false
				}
			}
		},
		{
			type: "function",
			function: {
				name: "browser_close",
				description: "Idempotently close an isolated browser session.",
				parameters: { type: "object", properties: { session_id: { type: "string" } }, required: ["session_id"], additionalProperties: false }
			}
		},
		{
			type: "function",
			function: {
				name: "browser_use",
				description: "Compatibility browser contract. Prefer browser_open, browser_snapshot, browser_act, and browser_close.",
				parameters: {
					type: "object",
					properties: {
						action: { type: "string", enum: ["navigate", "open", "snapshot", "extract", "click", "type", "scroll", "back", "screenshot", "close"] },
						url: { type: "string" }, session_id: { type: "string" }, target: { type: "string" }, ref: { type: "string" }, selector: { type: "string" }, text: { type: "string" }, direction: { type: "string" }, amount: { type: "integer" }
					},
					required: ["action"],
					additionalProperties: false
				}
			}
		}
	];
}

function normalizeWebSearchArguments(value, maxSearchResults = 5) {
	const args = normalizeObjectArguments(value);
	const query = String(args.query || "").trim();
	if (!query || query.length > 500) {
		throw toolError("invalid_tool_arguments", "web_search.query must contain between 1 and 500 characters.");
	}

	const requestedMax = Number(args.max_results);
	const maxResults = Number.isInteger(requestedMax)
		? Math.max(1, Math.min(requestedMax, maxSearchResults, 10))
		: maxSearchResults;
	const domains = normalizeDomains(args.domains);
	let freshness = String(args.freshness || "").trim().toLowerCase();
	if (freshness && !supportedFreshness.has(freshness)) {
		throw toolError("invalid_tool_arguments", "web_search.freshness must be day, week, month, or year.");
	}
	const recencyDays = Number(args.recency_days);
	if (!freshness && Number.isInteger(recencyDays) && recencyDays > 0 && recencyDays <= 3650) {
		freshness = recencyDays <= 1 ? "day" : (recencyDays <= 7 ? "week" : (recencyDays <= 31 ? "month" : "year"));
	}

	return { query, maxResults, domains, freshness };
}

async function executeSearxngSearch({ fetchFn, baseUrl, args, signal }) {
	if (!baseUrl) {
		throw toolError("tool_not_configured", "SearXNG is selected but SEARXNG_BASE_URL is not configured.");
	}
	const endpoint = new URL("search", ensureTrailingSlash(baseUrl));
	endpoint.searchParams.set("q", queryWithDomains(args.query, args.domains));
	endpoint.searchParams.set("format", "json");
	endpoint.searchParams.set("safesearch", "1");
	endpoint.searchParams.set("pageno", "1");
	if (args.freshness) endpoint.searchParams.set("time_range", args.freshness);

	const response = await fetchFn(endpoint.toString(), {
		method: "GET",
		headers: { Accept: "application/json" },
		signal
	});
	const payload = await readJsonResponse(response, "SearXNG");
	return {
		query: args.query,
		results: normalizeSearchResults(payload.results, args.maxResults)
	};
}

async function executeOllamaSearch({ fetchFn, apiKey, args, signal, nowMs }) {
	if (!apiKey) {
		throw toolError("tool_auth_error", "Web Search requires an API-key-backed Ollama profile or a configured SearXNG instance.");
	}
	let query = queryWithDomains(args.query, args.domains);
	if (args.freshness) {
		const days = { day: 1, week: 7, month: 31, year: 365 }[args.freshness];
		const cutoff = new Date(nowMs() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		query = `${query} after:${cutoff}`;
	}
	const response = await fetchFn("https://ollama.com/api/web_search", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ query, max_results: args.maxResults }),
		signal
	});
	const payload = await readJsonResponse(response, "Ollama Web Search");
	return {
		query: args.query,
		results: normalizeSearchResults(payload.results, args.maxResults)
	};
}

async function readJsonResponse(response, label) {
	const raw = await response.text();
	if (!response.ok) {
		throw toolError("tool_execution_failed", `${label} returned HTTP ${response.status}.`);
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw toolError("tool_execution_failed", `${label} returned invalid JSON.`);
	}
}

function normalizeSearchResults(results, maxResults) {
	return (Array.isArray(results) ? results : []).slice(0, maxResults).map((entry) => ({
		title: String(entry && entry.title || "").slice(0, 500),
		url: String(entry && entry.url || "").slice(0, 2000),
		content: String(entry && (entry.content || entry.snippet) || "").slice(0, 5000)
	})).filter((entry) => entry.url);
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
	throw toolError("invalid_tool_arguments", "The provider returned invalid JSON tool arguments.");
}

function normalizeDomains(value) {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.length > 10) {
		throw toolError("invalid_tool_arguments", "web_search.domains must be an array of at most 10 domain names.");
	}
	return [...new Set(value.map((domain) => String(domain || "").trim().toLowerCase()).filter(Boolean))].map((domain) => {
		if (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) {
			throw toolError("invalid_tool_arguments", `Invalid web_search domain: ${domain}`);
		}
		return domain;
	});
}

function queryWithDomains(query, domains) {
	if (!domains.length) return query;
	return `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

function normalizeSearchBackend(value) {
	const backend = String(value || "auto").trim().toLowerCase() || "auto";
	if (!["auto", "searxng", "ollama"].includes(backend)) {
		throw new Error("WEB_SEARCH_BACKEND must be auto, searxng, or ollama.");
	}
	return backend;
}

function resolveSearchBackend(backend, searxngBaseUrl) {
	return backend === "auto" ? (searxngBaseUrl ? "searxng" : "ollama") : backend;
}

function normalizeSearxngBaseUrl(value) {
	const text = String(value || "").trim();
	if (!text) return "";
	let parsed;
	try {
		parsed = new URL(text);
	} catch (error) {
		throw new Error("SEARXNG_BASE_URL must be a valid URL.");
	}
	if (parsed.username || parsed.password || parsed.search || parsed.hash) {
		throw new Error("SEARXNG_BASE_URL contains unsupported URL components.");
	}
	const host = parsed.hostname.toLowerCase();
	const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || (net.isIP(host) === 6 && host === "0:0:0:0:0:0:0:1");
	if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
		throw new Error("SEARXNG_BASE_URL must use HTTPS or loopback HTTP.");
	}
	return parsed.toString().replace(/\/+$/, "");
}

function ensureTrailingSlash(value) {
	return String(value || "").replace(/\/+$/, "") + "/";
}

function clampInteger(value, min, max, fallback) {
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function toolError(code, message) {
	const error = new Error(message);
	error.code = code;
	return error;
}

module.exports = {
	createToolRuntime,
	builtinToolSchemas,
	normalizeWebSearchArguments,
	normalizeSearxngBaseUrl,
	normalizeSearchResults
};
