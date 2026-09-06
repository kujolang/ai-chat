const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { gzipSync } = require("node:zlib");
const { createPageFetchRuntime, extractHtml } = require("../lib/page-fetch");
const { createToolRuntime } = require("../lib/tool-runtime");
async function fixture(handler, run) {
	const server = http.createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try { await run(`http://127.0.0.1:${server.address().port}`); }
	finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("static HTML extraction follows redirects, strips active/hidden content and exposes final provenance without Chromium", async () => {
	let requests = 0;
	await fixture((req, res) => {
		requests++;
		assert.equal(req.headers.cookie, undefined);
		assert.equal(req.headers.authorization, undefined);
		if (req.url === "/start") { res.writeHead(302, { location: "/article" }); res.end(); return; }
		res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "session=untrusted" });
		res.end('<title>Article &amp; evidence</title><h1>Public evidence</h1><p>Text &lt;tag&gt; <b>bold</b>.</p><script>fetch("/unexpected")</script><style>secret-style</style><div hidden>hidden-secret</div><a href="/next">Next</a><a href="javascript:alert(1)">Unsafe link</a>');
	}, async (url) => {
		const page = createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] });
		const tools = createToolRuntime({ pageFetchRuntime: page });
		assert.equal(tools.canExecute("browser_open"), false);
		const result = await tools.execute("web_fetch", { url: `${url}/start` });
		assert.equal(requests, 2);
		assert.equal(result.title, "Article & evidence");
		assert.match(result.text, /Text <tag> bold/);
		assert.doesNotMatch(result.text, /fetch|secret-style|hidden-secret/);
		assert.equal(result.provenance.final_url, `${url}/article`);
		assert.equal(result.provenance.redirect_count, 1);
		assert.equal(result.provenance.backend, "http-static");
		assert.equal(result.rendering.performed, false);
		assert.deepEqual(result.links, [{ url: `${url}/next` }]);
		await tools.close();
	});
});

test("page reader rejects private, mixed DNS, rebinding, disallowed hosts, unsafe schemes and destinations", async () => {
	let hits = 0;
	await fixture((_req, res) => { hits++; res.end("private"); }, async (url) => {
		await assert.rejects(createPageFetchRuntime().execute({ url }), { code: "web_fetch_url_blocked" });
		await assert.rejects(createPageFetchRuntime({ resolveHost: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] }).execute({ url: "https://public.example/page" }), { code: "web_fetch_url_blocked" });
		let lookups = 0;
		await assert.rejects(createPageFetchRuntime({ resolveHost: async () => [{ address: ++lookups === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }] }).execute({ url: url.replace("127.0.0.1", "rebind.example") }), { code: "web_fetch_url_blocked" });
		assert.equal(hits, 0);
		for (const target of ["file:///etc/passwd", "https://user:pass@example.com/", "http://127.0.0.1/login"]) {
			await assert.rejects(createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] }).execute({ url: target }), { code: "web_fetch_url_blocked" });
		}
		await assert.rejects(createPageFetchRuntime({ allowedHosts: ["allowed.example"] }).execute({ url: "https://other.example/" }), { code: "web_fetch_url_blocked" });
	});
});

test("every redirect repeats destination policy and redirect loops are bounded", async () => {
	let hits = 0;
	await fixture((_req, res) => { hits++; res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); }, async (url) => {
		await assert.rejects(createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] }).execute({ url }), { code: "web_fetch_url_blocked" });
		assert.equal(hits, 1);
	});
	hits = 0;
	await fixture((_req, res) => { hits++; res.writeHead(302, { location: "/again" }); res.end(); }, async (url) => {
		await assert.rejects(createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] }).execute({ url }), { code: "web_fetch_navigation_blocked" });
		assert.equal(hits, 6);
	});
});

test("decoded bytes, final JSON, unsupported MIME, and incomplete responses are bounded", async () => {
	await fixture((req, res) => {
		res.setHeader("Content-Type", "text/plain");
		if (req.url === "/bomb") { res.setHeader("Content-Encoding", "gzip"); res.end(gzipSync("x".repeat(2 * 1024 * 1024))); }
		else if (req.url === "/binary") { res.setHeader("Content-Type", "application/octet-stream"); res.end("binary"); }
		else if (req.url === "/oversized") res.end("x".repeat(2 * 1024 * 1024));
		else if (req.url === "/partial") { res.setHeader("Content-Length", "1000"); res.write("partial"); setTimeout(() => res.destroy(), 10); }
		else res.end("😀".repeat(80000));
	}, async (url) => {
		const runtime = createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] });
		for (const [path, code] of [["bomb", "web_fetch_output_limit"], ["binary", "web_fetch_content_type"], ["oversized", "web_fetch_output_limit"], ["partial", "web_fetch_execution_failed"]]) {
			await assert.rejects(runtime.execute({ url: `${url}/${path}` }), { code });
		}
		const result = await runtime.execute({ url, max_chars: 30000 });
		assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 96 * 1024);
		assert.equal(result.truncated, true);
	});
});

test("cancellation and runtime shutdown stop stalled fetches without launching a renderer", async () => {
	await fixture((_req, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.write("<p>Stalled"); }, async (url) => {
		const runtime = createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] });
		const controller = new AbortController();
		const pending = runtime.execute({ url }, { signal: controller.signal });
		controller.abort();
		await assert.rejects(pending, { code: "web_fetch_cancelled" });
		const second = runtime.execute({ url });
		runtime.close();
		await assert.rejects(second, { code: "web_fetch_cancelled" });
		await assert.rejects(runtime.execute({ url }), { code: "web_fetch_cancelled" });
	});
});

test("empty application shells recommend rendering and malformed HTML parses without executing content", () => {
	assert.deepEqual(extractHtml('<title>Shell</title><div id="root"></div><script>document.write("fake evidence")</script>', "https://example.com"), { title: "Shell", text: "", links: [] });
	assert.match(extractHtml("<p>One<p>Two &amp; three", "https://example.com").text, /One\nTwo & three/);
});

test("checked DNS is pinned to the actual socket and retains the original Host header", async () => {
	let hits = 0;
	let resolutions = 0;
	await fixture((req, res) => {
		hits++;
		assert.match(req.headers.host, /^pin-fixture\.invalid:/);
		res.setHeader("Content-Type", "text/plain");
		res.end("Pinned address evidence");
	}, async (url) => {
		const runtime = createPageFetchRuntime({ allowPrivateHosts: ["pin-fixture.invalid"], resolveHost: async () => { resolutions++; return [{ address: "127.0.0.1", family: 4 }]; } });
		const result = await runtime.execute({ url: url.replace("127.0.0.1", "pin-fixture.invalid") });
		assert.equal(hits, 1);
		assert.equal(resolutions, 2);
		assert.equal(result.text, "Pinned address evidence");
	});
});

test("deadline includes stalled DNS and late resolution cannot open a socket", async () => {
	let release;
	const dns = new Promise((resolve) => { release = resolve; });
	let hits = 0;
	await fixture((_req, res) => { hits++; res.end("Unexpected"); }, async (url) => {
		const runtime = createPageFetchRuntime({ timeoutMs: 20, allowPrivateHosts: ["slow.invalid"], resolveHost: () => dns });
		await assert.rejects(runtime.execute({ url: url.replace("127.0.0.1", "slow.invalid") }), { code: "web_fetch_timeout" });
		release([{ address: "127.0.0.1", family: 4 }]);
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(hits, 0);
	});
});

test("text truncation does not split a Unicode surrogate pair", async () => {
	await fixture((_req, res) => { res.setHeader("Content-Type", "text/plain"); res.end("😀".repeat(300)); }, async (url) => {
		const result = await createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] }).execute({ url, max_chars: 257 });
		assert.equal(result.text, "😀".repeat(128));
		assert.equal(result.truncated, true);
	});
});

test("page reader negotiates Markdown once and preserves code fences as untrusted text", async () => {
	const markdown = '# Rust example\n\n```rust\nlet x = "<tag>";\n```\n';
	let hits = 0;
	await fixture((req, res) => {
		hits++;
		assert.equal(req.headers.accept, "text/markdown, text/html;q=0.9, text/plain;q=0.8");
		assert.equal(req.headers["accept-language"], undefined);
		assert.equal(req.headers["x-code-language"], undefined);
		res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Vary": "Accept", "Content-Encoding": "gzip" });
		res.end(gzipSync(markdown));
	}, async (url) => {
		const runtime = createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] });
		const tools = createToolRuntime({ pageFetchRuntime: runtime });
		const result = await tools.execute("web_fetch", { url });
		assert.equal(result.text, markdown);
		assert.equal(result.provenance.content_is_untrusted, true);
		assert.equal(result.rendering.performed, false);
		assert.equal(hits, 1);
		await tools.close();
	});
});

test("servers ignoring Markdown negotiation retain HTML/plain fallback and request bounds", async () => {
	let hits = 0;
	await fixture((req, res) => {
		hits++;
		assert.match(req.headers.accept, /^text\/markdown,/);
		if (req.url === "/plain") { res.setHeader("Content-Type", "text/plain"); res.end("legacy plain text"); }
		else if (req.url === "/limited") { res.setHeader("Content-Type", "text/markdown"); res.end("x".repeat(500)); }
		else if (req.url === "/unacceptable") { res.writeHead(406); res.end(); }
		else { res.setHeader("Content-Type", "text/html"); res.end("<p>legacy HTML</p>"); }
	}, async (url) => {
		const runtime = createPageFetchRuntime({ allowPrivateHosts: ["127.0.0.1"] });
		assert.equal((await runtime.execute({ url })).text, "legacy HTML");
		assert.equal((await runtime.execute({ url: `${url}/plain` })).text, "legacy plain text");
		const limited = await runtime.execute({ url: `${url}/limited`, max_chars: 256 });
		assert.equal(limited.text.length, 256);
		assert.equal(limited.truncated, true);
		await assert.rejects(runtime.execute({ url: `${url}/unacceptable` }), { code: "web_fetch_upstream_failed" });
		assert.equal(hits, 4);
		runtime.close();
	});
});
