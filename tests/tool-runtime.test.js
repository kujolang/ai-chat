const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
	createToolRuntime,
	canonicalizeResultUrl,
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
		nowMs: () => Date.parse("2026-07-18T00:00:00Z"),
		fetchFn: async (url, options) => {
			observed = { url, options };
			return jsonResponse({
				results: [
					{ title: "Kujo", url: "https://example.com/kujo#fragment", content: "Evidence", published_at: "2026-07-12" },
					{ title: "Duplicate", url: "https://example.com:443/kujo", content: "Ignore me" }
				]
			});
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
	assert.equal(result.results.length, 1);
	assert.equal(result.results[0].url, "https://example.com/kujo");
	assert.equal(result.results[0].domain, "example.com");
	assert.equal(result.results[0].published_date, "2026-07-12");
	assert.equal(result.results[0].provenance.backend, "searxng");
	assert.equal(result.meta.backend, "searxng");
	assert.equal(result.meta.capabilities.freshness.mode, "native");
	assert.equal(result.meta.cache.hit, false);
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
	assert.equal(result.meta.capabilities.safe_search.supported, false);
	assert.equal(result.meta.policy.freshness, "query_after_fallback");
});

test("tool runtime rejects unknown tools and missing search credentials", async () => {
	const runtime = createToolRuntime({ searchBackend: "ollama", fetchFn: async () => jsonResponse({}) });
	assert.equal(runtime.canExecute("web_search"), true);
	assert.equal(runtime.canExecute("browser_open"), false);
	await assert.rejects(() => runtime.execute("browser_open", {}), (error) => error.code === "tool_execution_unavailable");
	await assert.rejects(() => runtime.execute("web_search", { query: "Kujo" }), (error) => error.code === "web_search_auth_required");
});

test("tool runtime exposes read-only skill tools when a skill runtime is connected", async () => {
	const runtime = createToolRuntime({
		skillRuntime: {
			canExecute: () => true,
			status: () => ({ enabled: true, available: true, skill_count: 1 }),
			list: () => ({ skills: [{ id: "skill_0_demo", name: "Demo" }] }),
			read: () => ({ skill: { id: "skill_0_demo", name: "Demo" }, content: "# Demo" }),
			readFile: () => ({ skill: { id: "skill_0_demo", name: "Demo" }, file: "references/demo.md", content: "Demo" })
		}
	});
	assert.equal(runtime.canExecute("skill_list"), true);
	assert.equal(runtime.schemas().some((schema) => schema.function.name === "skill_file_read"), true);
	assert.deepEqual(await runtime.execute("skill_read", { id: "skill_0_demo" }), { skill: { id: "skill_0_demo", name: "Demo" }, content: "# Demo" });
});

test("tool runtime exposes local tools when a local runtime is connected", async () => {
	const runtime = createToolRuntime({
		localRuntime: {
			canExecute: () => true,
			status: () => ({ enabled: true, available: true, workspace_count: 1 }),
			listWorkspaces: () => ({ workspaces: [{ id: "workspace_0", label: "demo" }] }),
			listFiles: () => ({ entries: [] }),
			readFile: () => ({ path: "README.md", content: "hi" }),
			writeFile: () => ({ ok: true, path: "README.md" }),
			runCommand: async () => ({ command: "pwd", args: [], exit_code: 0, stdout: "", stderr: "" })
		}
	});
	assert.equal(runtime.canExecute("local_workspace_list"), true);
	assert.equal(runtime.schemas().some((schema) => schema.function.name === "local_shell"), true);
	assert.deepEqual(await runtime.execute("local_file_read", { path: "README.md" }), { path: "README.md", content: "hi" });
});

test("browser tool schemas steer models toward absolute HTTP URLs", () => {
	const runtime = createToolRuntime({
		browserRuntime: {
			list: () => ["browser_open", "browser_snapshot", "browser_act", "browser_close", "browser_use"],
			canExecute: () => true,
			execute: async () => ({})
		}
	});
	const schemas = Object.fromEntries(runtime.schemas().filter((schema) => schema.function.name.startsWith("browser_")).map((schema) => [schema.function.name, schema.function.parameters]));
	assert.equal(schemas.browser_open.properties.url.pattern, "^https?://");
	assert.equal(schemas.browser_act.properties.action.properties.url.pattern, "^https?://");
	assert.equal(schemas.browser_use.properties.url.pattern, "^https?://");
});

test("SearXNG URL policy permits local HTTP and requires HTTPS elsewhere", () => {
	assert.equal(normalizeSearxngBaseUrl("http://localhost:8080/"), "http://localhost:8080");
	assert.equal(normalizeSearxngBaseUrl("https://search.example.com/"), "https://search.example.com");
	assert.throws(() => normalizeSearxngBaseUrl("http://search.example.com"), /HTTPS or loopback HTTP/);
	assert.throws(() => normalizeSearxngBaseUrl("https://user:pass@search.example.com"), /unsupported URL components/);
});

test("web search coalesces repeated requests, caches results, and exposes cache metadata", async () => {
	let calls = 0;
	let now = Date.parse("2026-07-18T00:00:00Z");
	const runtime = createToolRuntime({
		searchBackend: "searxng",
		searxngBaseUrl: "http://127.0.0.1:8080",
		nowMs: () => now,
		searchCacheTtlMs: 5000,
		fetchFn: async () => {
			calls += 1;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return jsonResponse({ results: [{ title: "One", url: "https://example.com/one", content: "Body" }] });
		}
	});

	const [first, second] = await Promise.all([
		runtime.execute("web_search", { query: "cache me" }),
		runtime.execute("web_search", { query: "cache me" })
	]);
	assert.equal(calls, 1);
	assert.equal(first.meta.cache.hit, false);
	assert.equal(second.meta.cache.hit, true);
	now += 1000;
	const third = await runtime.execute("web_search", { query: "cache me" });
	assert.equal(third.meta.cache.hit, true);
	assert.equal(calls, 1);
});

test("web search enforces timeout and cancellation with sanitized errors", async () => {
	const timeoutRuntime = createToolRuntime({
		searchBackend: "searxng",
		searxngBaseUrl: "http://127.0.0.1:8080",
		searchTimeoutMs: 20,
		fetchFn: async () => {
			await new Promise((resolve) => setTimeout(resolve, 400));
			return jsonResponse({ results: [] });
		}
	});
	await assert.rejects(() => timeoutRuntime.execute("web_search", { query: "slow" }), (error) => error.code === "web_search_timeout");

	const controller = new AbortController();
	const abortRuntime = createToolRuntime({
		searchBackend: "searxng",
		searxngBaseUrl: "http://127.0.0.1:8080",
		fetchFn: async (url, options) => new Promise((resolve, reject) => {
			options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
		})
	});
	const promise = abortRuntime.execute("web_search", { query: "abort" }, { signal: controller.signal });
	controller.abort();
	await assert.rejects(() => promise, (error) => error.code === "web_search_aborted");
});

test("canonicalizeResultUrl strips hashes, rejects unsafe schemes, and removes credentials", () => {
	assert.equal(canonicalizeResultUrl("https://example.com/path#hash").url, "https://example.com/path");
	assert.equal(canonicalizeResultUrl("https://user:pass@example.com/private"), null);
	assert.equal(canonicalizeResultUrl("javascript:alert(1)"), null);
});
