const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
	createToolRuntime,
	normalizeSearxngBaseUrl
} = require("../lib/tool-runtime");

function jsonResponse(payload, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async text() {
			return JSON.stringify(payload);
		}
	};
}

test("auto selects configured SearXNG and applies the stable search contract", async () => {
	let observed = null;
	const runtime = createToolRuntime({
		searchBackend: "auto",
		searxngBaseUrl: "http://127.0.0.1:8080",
		fetchFn: async (url, options) => {
			observed = { url, options };
			return jsonResponse({ results: [{ title: "Kujo", url: "https://example.com/kujo", content: "Evidence" }] });
		}
	});

	const result = await runtime.execute("web_search", {
		query: "Kujo language",
		domains: ["example.com"],
		freshness: "week",
		max_results: 2
	});
	const url = new URL(observed.url);
	assert.equal(runtime.searchBackend(), "searxng");
	assert.equal(observed.options.method, "GET");
	assert.equal(url.pathname, "/search");
	assert.equal(url.searchParams.get("format"), "json");
	assert.equal(url.searchParams.get("time_range"), "week");
	assert.match(url.searchParams.get("q"), /site:example\.com/);
	assert.deepEqual(result.results, [{ title: "Kujo", url: "https://example.com/kujo", content: "Evidence" }]);
});

test("auto falls back to Ollama Web Search without SearXNG", async () => {
	let observed = null;
	const runtime = createToolRuntime({
		searchBackend: "auto",
		getOllamaApiKey: () => "secret-key",
		nowMs: () => Date.parse("2026-07-16T00:00:00Z"),
		fetchFn: async (url, options) => {
			observed = { url, options };
			return jsonResponse({ results: [{ title: "Result", url: "https://example.com", snippet: "Snippet" }] });
		}
	});

	const result = await runtime.execute("web_search", { query: "Kujo", freshness: "day" });
	const body = JSON.parse(observed.options.body);
	assert.equal(runtime.searchBackend(), "ollama");
	assert.equal(observed.url, "https://ollama.com/api/web_search");
	assert.equal(observed.options.headers.Authorization, "Bearer secret-key");
	assert.match(body.query, /after:2026-07-15/);
	assert.equal(JSON.stringify(result).includes("secret-key"), false);
	assert.equal(result.results[0].content, "Snippet");
});

test("tool runtime rejects unknown tools and missing search credentials", async () => {
	const runtime = createToolRuntime({ searchBackend: "ollama", fetchFn: async () => jsonResponse({}) });
	assert.equal(runtime.canExecute("web_search"), true);
	assert.equal(runtime.canExecute("browser_open"), false);
	await assert.rejects(() => runtime.execute("browser_open", {}), (error) => error.code === "tool_execution_unavailable");
	await assert.rejects(() => runtime.execute("web_search", { query: "Kujo" }), (error) => error.code === "tool_auth_error");
});

test("SearXNG URL policy permits local HTTP and requires HTTPS elsewhere", () => {
	assert.equal(normalizeSearxngBaseUrl("http://localhost:8080/"), "http://localhost:8080");
	assert.equal(normalizeSearxngBaseUrl("https://search.example.com/"), "https://search.example.com");
	assert.throws(() => normalizeSearxngBaseUrl("http://search.example.com"), /HTTPS or loopback HTTP/);
	assert.throws(() => normalizeSearxngBaseUrl("https://user:pass@search.example.com"), /unsupported URL components/);
});
