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

test("browser reuses a request-scoped session for repeated opens without a session id", async () => {
	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end(`<!doctype html><title>${req.url}</title><p>${req.url}</p>`);
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime({ maxSessionsPerScope: 1 });
		try {
			const requestState = {};
			const first = await runtime.execute("browser_open", { url: `${url}/first` }, { scopeId: "chat-a", requestState });
			const second = await runtime.execute("browser_open", { url: `${url}/second` }, { scopeId: "chat-a", requestState });
			assert.equal(second.session_id, first.session_id);
			assert.match(second.url, /\/second$/);
		} finally {
			await destroy();
		}
	});
});

test("browser normalizes blocked navigation failures into bounded tool errors", async () => {
	const fakePage = {
		setDefaultNavigationTimeout() {},
		setDefaultTimeout() {},
		on() {},
		async goto() {
			throw new Error('page.goto: net::ERR_BLOCKED_BY_CLIENT at https://github.com/omkhar/workcell');
		}
	};
	const fakeContext = {
		async newPage() {
			return fakePage;
		},
		on() {},
		async route() {},
		async close() {}
	};
	const fakeBrowser = {
		async newContext() {
			return fakeContext;
		},
		async close() {}
	};
	const fakePlaywright = {
		chromium: {
			executablePath() {
				return "/bin/sh";
			},
			async launch() {
				return fakeBrowser;
			}
		}
	};
	const { runtime, destroy } = createRuntime({
		playwrightModule: fakePlaywright,
		resolveHost: async () => [{ address: "140.82.112.4", family: 4 }]
	});
	try {
		await assert.rejects(
			() => runtime.execute("browser_open", { url: "https://github.com/omkhar/workcell" }, { scopeId: "chat-a", requestState: {} }),
			(error) => error.code === "browser_url_blocked" && /blocked/i.test(String(error.message || ""))
		);
	} finally {
		await destroy();
	}
});

test("browser sessions are isolated, expire, enforce action limits, and close idempotently", async () => {
	let clock = 1000;
	await withFixture((req, res) => res.end("<!doctype html><title>Limits</title><p>limits</p>"), async ({ url }) => {
		const { runtime, destroy } = createRuntime({ nowMs: () => clock, sessionTtlMs: 1000, maxActionsPerRequest: 2, maxActionsPerSession: 3 });
		try {
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			await assert.rejects(() => runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-b", requestState: {} }), (error) => error.code === "browser_session_not_found" && error.retryable === true);
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
			await assert.rejects(() => runtime.execute("browser_snapshot", { session_id: expiring.session_id }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_session_expired" && error.retryable === true);
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

test("read-only policy permits safe link clicks, blocks consequential controls, and gates typing behind explicit approval", async () => {
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
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "click", target: purchase.ref } }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_action_blocked");
			let approvalError = null;
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} }), (error) => {
				approvalError = error;
				return error.code === "tool_approval_required" && Boolean(error.approval_request && error.approval_request.request_id);
			});
			await runtime.approveAction({ requestId: approvalError.approval_request.request_id, scopeId: "chat-a", decision: "approve" });
			const typed = await runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} });
			assert.equal(typed.characters_typed, 5);
		} finally {
			await destroy();
		}
	});
});

test("browser snapshots include provenance metadata and short-lived cache hits", async () => {
	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Evidence</title><p>Source grounded.</p>");
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime({ snapshotCacheTtlMs: 5000 });
		try {
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			const first = await runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-a", requestState: {} });
			const second = await runtime.execute("browser_snapshot", { session_id: opened.session_id }, { scopeId: "chat-a", requestState: {} });
			assert.equal(first.page_content_is_untrusted, true);
			assert.equal(first.provenance.backend, "playwright-chromium");
			assert.equal(first.final_url, `${url}/`);
			assert.equal(second.cache.hit, true);
		} finally {
			await destroy();
		}
	});
});

test("browser allowlist and approval denial fail closed", async () => {
	const blocked = createRuntime({ allowedHosts: ["example.com"] });
	try {
		await assert.rejects(() => blocked.runtime.execute("browser_open", { url: "https://not-example.com" }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "browser_url_blocked");
	} finally {
		await blocked.destroy();
	}

	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Deny</title><input aria-label='Notes'>");
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime();
		try {
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			const input = opened.elements.find((entry) => entry.name === "Notes");
			let approvalError = null;
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} }), (error) => {
				approvalError = error;
				return error.code === "tool_approval_required";
			});
			await runtime.approveAction({ requestId: approvalError.approval_request.request_id, scopeId: "chat-a", decision: "deny" });
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "tool_approval_denied");
		} finally {
			await destroy();
		}
	});
});

test("browser approvals expire, reject scope mismatches, and are single-use", async () => {
	let clock = 1000;
	await withFixture((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Approve</title><input aria-label='Query'>");
	}, async ({ url }) => {
		const { runtime, destroy } = createRuntime({ nowMs: () => clock, approvalTtlMs: 1000 });
		try {
			const opened = await runtime.execute("browser_open", { url }, { scopeId: "chat-a", requestState: {} });
			const input = opened.elements.find((entry) => entry.name === "Query");

			let approvalError = null;
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} }), (error) => {
				approvalError = error;
				return error.code === "tool_approval_required";
			});
			await assert.rejects(() => runtime.approveAction({ requestId: approvalError.approval_request.request_id, scopeId: "chat-b", decision: "approve" }), (error) => error.code === "browser_approval_scope_mismatch");

			clock += 1001;
			await assert.rejects(() => runtime.approveAction({ requestId: approvalError.approval_request.request_id, scopeId: "chat-a", decision: "approve" }), (error) => error.code === "tool_approval_expired");

			let secondApprovalError = null;
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} }), (error) => {
				secondApprovalError = error;
				return error.code === "tool_approval_required";
			});
			await runtime.approveAction({ requestId: secondApprovalError.approval_request.request_id, scopeId: "chat-a", decision: "approve" });
			await runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "hello" } }, { scopeId: "chat-a", requestState: {} });
			await assert.rejects(() => runtime.execute("browser_act", { session_id: opened.session_id, action: { type: "type", target: input.ref, text: "world" } }, { scopeId: "chat-a", requestState: {} }), (error) => error.code === "tool_approval_required");
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

test("browser_use snapshot without a session returns guidance instead of aborting tool flow", async () => {
	const { runtime, destroy } = createRuntime();
	try {
		const result = await runtime.execute("browser_use", { action: "snapshot" }, { scopeId: "chat-a", requestState: {} });
		assert.equal(result.ok, false);
		assert.equal(result.code, "browser_session_required");
		assert.equal(result.deprecated_tool, true);
		assert.match(result.retry_hint, /browser_open/);
	} finally {
		await destroy();
	}
});

test("browser_use local URLs return guidance instead of aborting tool flow", async () => {
	const { runtime, destroy } = createRuntime();
	try {
		const result = await runtime.execute("browser_use", { action: "navigate", url: "file:///tmp/README.md" }, { scopeId: "chat-a", requestState: {} });
		assert.equal(result.ok, false);
		assert.equal(result.code, "browser_url_blocked");
		assert.equal(result.deprecated_tool, true);
		assert.match(result.message, /HTTP and HTTPS/);
		assert.match(result.retry_hint, /local_file_read/);
	} finally {
		await destroy();
	}
});
