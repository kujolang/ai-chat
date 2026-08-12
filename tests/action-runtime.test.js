const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const {
	createActionRuntime,
	normalizeAdapterUrl
} = require("../lib/action-runtime");

function jsonResponse(payload, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async text() {
			return JSON.stringify(payload);
		}
	};
}

test("action runtime loads loopback manifest adapters and calls bounded JSON", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-actions-"));
	try {
		const manifestPath = path.join(tempRoot, "actions.json");
		fs.writeFileSync(manifestPath, JSON.stringify({
			adapters: [
				{
					id: "docx_summary",
					name: "DOCX Summary",
					description: "Summarize a document.",
					url: "http://127.0.0.1:8787/actions/docx-summary",
					input_schema: {
						type: "object",
						properties: { document_id: { type: "string" } },
						required: ["document_id"],
						additionalProperties: false
					}
				},
				{
					id: "blocked",
					url: "https://example.com/actions/blocked"
				}
			]
		}));
		let observed = null;
		const runtime = createActionRuntime({
			env: {
				AI_CHAT_ACTIONS_ENABLED: "1",
				AI_CHAT_ACTION_MANIFEST_PATH: manifestPath
			},
			fetchFn: async (url, options) => {
				observed = { url, options };
				return jsonResponse({ ok: true, summary: "done" });
			}
		});

		const listed = runtime.list();
		assert.equal(listed.adapters.length, 1);
		assert.equal(listed.adapters[0].id, "docx_summary");
		assert.equal(listed.meta.available, true);

		const called = await runtime.call({ id: "docx_summary", input: { document_id: "doc-1" } });
		assert.equal(observed.url, "http://127.0.0.1:8787/actions/docx-summary");
		assert.equal(observed.options.method, "POST");
		assert.deepEqual(JSON.parse(observed.options.body), { input: { document_id: "doc-1" } });
		assert.deepEqual(called.result, { ok: true, summary: "done" });
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("action runtime rejects non-loopback URLs and adapter failures are sanitized", async () => {
	assert.equal(normalizeAdapterUrl("https://example.com/action"), "");
	assert.equal(normalizeAdapterUrl("http://192.168.1.10/action"), "");
	assert.equal(normalizeAdapterUrl("http://user:pass@127.0.0.1/action"), "");
	assert.equal(normalizeAdapterUrl("http://localhost:8787/action"), "http://localhost:8787/action");

	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-actions-"));
	try {
		const manifestPath = path.join(tempRoot, "actions.json");
		fs.writeFileSync(manifestPath, JSON.stringify({
			adapters: [{ id: "fails", url: "http://127.0.0.1:8787/fails" }]
		}));
		const runtime = createActionRuntime({
			env: {
				AI_CHAT_ACTIONS_ENABLED: "1",
				AI_CHAT_ACTION_MANIFEST_PATH: manifestPath
			},
			fetchFn: async () => jsonResponse({ error: "nope" }, 500)
		});
		await assert.rejects(() => runtime.call({ id: "fails", input: {} }), (error) => error.code === "action_adapter_failed" && error.status === 500);
		await assert.rejects(() => runtime.call({ id: "missing", input: {} }), (error) => error.code === "action_adapter_not_found");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("action runtime validates then repairs manifest-specific input schemas", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-actions-"));
	try {
		const manifestPath = path.join(tempRoot, "actions.json");
		fs.writeFileSync(manifestPath, JSON.stringify({
			adapters: [{
				id: "batch",
				url: "http://127.0.0.1:8787/batch",
				input_schema: {
					type: "object",
					properties: {
						files: { type: "array", items: { type: "string" }, maxItems: 5 },
						limit: { type: "integer", minimum: 1, maximum: 100 },
						note: { type: "string" }
					},
					required: ["files"],
					additionalProperties: false
				}
			}]
		}));
		let body = null;
		let repairs = null;
		const runtime = createActionRuntime({
			env: { AI_CHAT_ACTIONS_ENABLED: "1", AI_CHAT_ACTION_MANIFEST_PATH: manifestPath },
			fetchFn: async (_url, options) => { body = JSON.parse(options.body); return jsonResponse({ ok: true }); }
		});
		const result = await runtime.call({ id: "batch", input: { files: '["a.md","b.md"]', limit: "20", note: null } }, {
			onToolInputRepair(metadata) { repairs = metadata; }
		});
		assert.deepEqual(body, { input: { files: ["a.md", "b.md"], limit: 20 } });
		assert.deepEqual(repairs.repair_types, ["stringified_array", "numeric_coercion", "null_optional"]);
		assert.deepEqual(result.action_input_repair, repairs);
		await assert.rejects(
			() => runtime.call({ id: "batch", input: { files: [], limit: "2abc" } }),
			(error) => error.code === "invalid_tool_arguments" && /\$\.limit: expected integer/.test(error.message)
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("action adapters do not follow redirects outside the loopback boundary", async (t) => {
	const externalAddress = Object.values(os.networkInterfaces())
		.flat()
		.find((entry) => entry && entry.family === "IPv4" && !entry.internal)?.address;
	if (!externalAddress) {
		t.skip("No non-loopback IPv4 address is available for the redirect-boundary fixture.");
		return;
	}

	const receivedBodies = [];
	const sink = http.createServer((req, res) => {
		let body = "";
		req.setEncoding("utf8");
		req.on("data", (chunk) => { body += chunk; });
		req.on("end", () => {
			receivedBodies.push(body);
			res.setHeader("content-type", "application/json");
			res.setHeader("connection", "close");
			res.end(JSON.stringify({ ok: true }));
		});
	});
	const redirect = http.createServer((req, res) => {
		res.writeHead(307, {
			connection: "close",
			location: `http://${externalAddress}:${sink.address().port}/capture`
		});
		res.end();
	});
	await Promise.all([
		new Promise((resolve) => sink.listen(0, "0.0.0.0", resolve)),
		new Promise((resolve) => redirect.listen(0, "127.0.0.1", resolve))
	]);
	t.after(() => {
		sink.closeAllConnections();
		redirect.closeAllConnections();
		return Promise.all([
			new Promise((resolve) => sink.close(resolve)),
			new Promise((resolve) => redirect.close(resolve))
		]);
	});

	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-actions-redirect-"));
	t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
	const manifestPath = path.join(tempRoot, "actions.json");
	fs.writeFileSync(manifestPath, JSON.stringify({
		adapters: [{ id: "redirect", url: `http://127.0.0.1:${redirect.address().port}/start` }]
	}));
	const runtime = createActionRuntime({
		env: {
			AI_CHAT_ACTIONS_ENABLED: "1",
			AI_CHAT_ACTION_MANIFEST_PATH: manifestPath
		}
	});

	await assert.rejects(
		() => runtime.call({ id: "redirect", input: { synthetic_secret: "SYNTHETIC-ONLY" } }),
		(error) => error.code === "action_adapter_redirect_blocked"
	);
	assert.deepEqual(receivedBodies, []);
});
