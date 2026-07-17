const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { once } = require("events");
const { test } = require("node:test");

const { createBrowserRuntime, isBlockedIp } = require("../lib/browser-runtime");
const { createToolRuntime } = require("../lib/tool-runtime");

async function withFixture(handler, callback) {
	const server = http.createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = server.address().port;
	try {
		return await callback({ port, url: `http://127.0.0.1:${port}` });
	} finally {
		server.close();
		await once(server, "close");
	}
}

function createRuntime(overrides = {}) {
	const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-artifacts-"));
	const runtime = createBrowserRuntime({
		enabled: true,
		headless: true,
		artifactDir,
		allowPrivateHosts: ["127.0.0.1"],
		...overrides
	});
	return {
		runtime,
		artifactDir,
		async destroy() {
			await runtime.close();
			fs.rmSync(artifactDir, { recursive: true, force: true });
		}
	};
}

test("browser tools register only when Playwright Chromium is executable", async () => {
	const unavailable = createBrowserRuntime({ enabled: true, playwrightModule: null });
	const unavailableTools = createToolRuntime({ browserRuntime: unavailable });
	assert.equal(unavailable.status().available, false);
	assert.equal(unavailable.status().unavailable_reason, "playwright_unavailable");
	assert.equal(unavailableTools.canExecute("browser_open"), false);
	await assert.rejects(() => unavailable.execute("browser_open", { url: "https://example.com" }, { scopeId: "chat-a" }), (error) => error.code === "browser_not_configured" && !error.message.includes("/"));
	await unavailable.close();

	const { runtime, destroy } = createRuntime();
	try {
		const tools = createToolRuntime({ browserRuntime: runtime });
		assert.equal(runtime.status().backend, "playwright-chromium");
		assert.deepEqual(tools.list().filter((name) => name.startsWith("browser_")), ["browser_open", "browser_snapshot", "browser_act", "browser_close", "browser_use"]);
		assert.ok(tools.schemas().some((schema) => schema.function.name === "browser_open"));
	} finally {
		await destroy();
	}
});

test("browser opens a controlled fixture, snapshots readable content, scrolls, and stores a bounded screenshot", async () => {
	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Fixture</title><main><h1>Controlled browser fixture</h1><p>Readable evidence.</p><a href='/next'>Next page</a><input aria-label='Search terms'></main>");
	}, async ({ url }) => {
		const { runtime, artifactDir, destroy } = createRuntime();
		try {
			const state = {};
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: state });
			assert.match(opened.title, /Fixture/);
			assert.equal(opened.session_id.startsWith("brs_"), true);
			const snapshot = await runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-a", requestState: state });
			assert.match(snapshot.text, /Readable evidence/);
			assert.ok(snapshot.links.some((entry) => entry.name === "Next page" && /^e\d+$/.test(entry.ref)));
			await runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "scroll", direction: "down", amount: 300 } }, { scopeId: "chat-a", requestState: state });
			const screenshot = await runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "screenshot" } }, { scopeId: "chat-a", requestState: state });
			assert.equal(screenshot.media_type, "image/png");
			assert.equal(fs.readdirSync(artifactDir).some((name) => name.startsWith(screenshot.artifact_id)), true);
		} finally {
			await destroy();
		}
	});
});

test("browser sessions are isolated, expire, enforce action limits, and close idempotently", async () => {
	let clock = 1000;
	await withFixture((req, res) => res.end("<!doctype html><title>Limits</title><p>limits</p>"), async ({ url }) => {
		const { runtime, destroy } = createRuntime({ nowMs: () => clock, sessionTtlMs: 1000, maxActionsPerRequest: 2, maxActionsPerSession: 3 });
		try {
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			await assert.rejects(() => runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-b", requestState: {} }), (error) => error.code === "browser_session_not_found");
			const requestState = {};
			await runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-a", requestState });
			await runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-a", requestState });
			await assert.rejects(() => runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-a", requestState }), (error) => error.code === "browser_action_limit");
			const firstClose = await runtime.execute("browser_close", { session_id: opened.session_id }, { scopeId: "chat-a" });
			const secondClose = await runtime.execute("browser_close", { session_id: opened.session_id }, { scopeId: "chat-a" });
			assert.equal(firstClose.already_closed, false);
			assert.equal(secondClose.already_closed, true);

			const expiring = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			clock += 1001;
			await assert.rejects(() => runtime.execute("browser_snapshot", { session_id: expiring.session_id }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_session_expired");
		} finally {
			await destroy();
		}
	});
});

test("browser network policy blocks unsafe schemes, private and metadata IPs, redirect-to-private, and DNS rebinding", async () => {
	assert.equal(isBlockedIp("127.0.0.1"), true);
	assert.equal(isBlockedIp("10.0.0.1"), true);
	assert.equal(isBlockedIp("169.254.169.254"), true);
	assert.equal(isBlockedIp("::1"), true);
	assert.equal(isBlockedIp("8.8.8.8"), false);

	const { runtime, destroy } = createRuntime({ allowPrivateHosts: [] });
	try {
		for (const url of ["file:///etc/passwd", "data:text/html,test", "javascript:alert(1)", "http://127.0.0.1", "http://169.254.169.254/latest/meta-data/"]) {
			await assert.rejects(() => runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_url_blocked");
		}
	} finally {
		await destroy();
	}

	await withFixture((req, res) => {
		res.statusCode = 302;
		res.setHeader("location", `http://127.0.0.1:${req.socket.localPort}/private`);
		res.end();
	}, async ({ port }) => {
		const redirected = createRuntime({
			allowPrivateHosts: ["public.test"],
			resolveHost: async () => [{ address: "127.0.0.1", family: 4 }]
		});
		try {
			await assert.rejects(() => redirected.runtime.execute("browser_open", { url: `http://public.test:${port}` }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_url_blocked");
		} finally {
			await redirected.destroy();
		}
	});

	let resolution = 0;
	const rebinding = createRuntime({
		allowPrivateHosts: [],
		resolveHost: async () => [{ address: resolution++ === 0 ? "8.8.8.8" : "127.0.0.1", family: 4 }]
	});
	try {
		await assert.rejects(() => rebinding.runtime.execute("browser_open", { url: "http://rebind.test" }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_url_blocked");
	} finally {
		await rebinding.destroy();
	}
});

test("read-only policy permits safe link clicks but requires approval for typing and consequential controls", async () => {
	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Policy</title><a href='/docs'>Read docs</a><button>Purchase now</button><input aria-label='Search terms'>");
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime();
		try {
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			const docs = opened.elements.find((entry) => entry.name === "Read docs");
			const purchase = opened.elements.find((entry) => entry.name === "Purchase now");
			const input = opened.elements.find((entry) => entry.name === "Search terms");
			await runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "click", target: docs.ref } }, { scopeId: "chat-a", requestState: {} });
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "click", target: purchase.ref } }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "tool_approval_required");
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "tool_approval_required");
		} finally {
			await destroy();
		}
	});
});

test("browser navigation remains usable when a page emits blocked background writes", async () => {
	await withFixture((req, res) => {
		if (req.method === "POST") {
			res.end("telemetry");
			return;
		}
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Read-only page</title><p>Visible page</p><script>fetch('/telemetry', { method: 'POST', body: 'ignored' }).catch(() => {});</script>");
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime();
		try {
			const result = await runtime.execute("browser_use", { action: "screenshot", url }, { scopeId: "chat-a", requestState: {} });
			assert.equal(result.media_type, "image/png");
		} finally {
			await destroy();
		}
	});
});

test("browser_use compatibility routing and result-size limits remain bounded", async () => {
	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end(`<!doctype html><title>Compatibility</title><p>${"bounded-text ".repeat(800)}</p>`);
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime({ maxTextChars: 1000, maxResultBytes: 4096 });
		try {
			const state = {};
			const opened = await runtime.execute("browser_use", { action: "navigate", url }, { scopeId: "chat-a", requestState: state });
			const extracted = await runtime.execute("browser_use", { action: "extract", session_id: opened.session_id }, { scopeId: "chat-a", requestState: state });
			assert.ok(extracted.text.length <= 1000);
			assert.ok(Buffer.byteLength(JSON.stringify(extracted)) <= 4096);
			assert.match(extracted.text, /bounded-text/);
			const screenshot = await runtime.execute("browser_use", { action: "screenshot", url }, { scopeId: "chat-b", requestState: {} });
			assert.equal(screenshot.media_type, "image/png");
			assert.ok(screenshot.session_id);
		} finally {
			await destroy();
		}
	});
});
