const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { once } = require("events");

const { createServerRuntime } = require("../lib/server-runtime");

const API_TOKEN = "route-test-token";

function withAuthHeaders(headers = {}) {
	return {
		"x-api-token": API_TOKEN,
		...headers
	};
}

function createIsolatedRuntime(overrides = {}) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-routes-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const baseEnv = {
		...process.env,
		ENCRYPTION_SECRET: "route-test-secret",
		API_AUTH_TOKEN: API_TOKEN,
		AI_SDK_PATH: sdkPath,
		DB_PATH: path.join(tempRoot, "data", "test.db"),
		DB_BACKUP_DIR: path.join(tempRoot, "backups"),
		PORT: "0",
		KUJO_BIN: "/usr/bin/false"
	};
	const env = {
		...baseEnv,
		...(overrides.envMerge || {})
	};
	const runtimeOverrides = { ...overrides };
	delete runtimeOverrides.envMerge;

	const runtime = createServerRuntime({
		env,
		projectRoot: path.resolve(__dirname, ".."),
		...runtimeOverrides
	});

	return {
		runtime,
		destroy() {
			runtime.close();
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	};
}

async function withServer(app, callback) {
	const server = http.createServer(app);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		return await callback(baseUrl);
	} finally {
		server.close();
		await once(server, "close");
	}
}

async function fetchJson(baseUrl, endpoint, options = {}) {
	const response = await fetch(`${baseUrl}${endpoint}`, {
		...options,
		headers: withAuthHeaders(options.headers || {})
	});
	const text = await response.text();
	let json = null;
	try {
		json = JSON.parse(text);
	} catch (error) {
		json = null;
	}
	return { response, text, json };
}

function mockJsonResponse(data, status = 200, contentType = "application/json") {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get(name) {
				if (String(name).toLowerCase() === "content-type") {
					return contentType;
				}
				return null;
			}
		},
		async text() {
			return JSON.stringify(data);
		}
	};
}

function mockSseResponse(events) {
	const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
	return mockSseResponseFromPayload(payload);
}

function mockSseResponseFromPayload(payload) {
	const encoder = new TextEncoder();
	const chunks = [
		encoder.encode(payload.slice(0, Math.ceil(payload.length / 2))),
		encoder.encode(payload.slice(Math.ceil(payload.length / 2)))
	];
	let index = 0;
	return {
		ok: true,
		status: 200,
		headers: {
			get(name) {
				if (String(name).toLowerCase() === "content-type") {
					return "text/event-stream";
				}
				return null;
			}
		},
		body: {
			getReader() {
				return {
					async read() {
						if (index >= chunks.length) {
							return { done: true, value: undefined };
						}
						const value = chunks[index];
						index += 1;
						return { done: false, value };
					}
				};
			}
		},
		async text() {
			return payload;
		}
	};
}

function applyProfileMutation(runtime, callback) {
	const state = runtime.helpers.readState();
	callback(state.settings.profiles[0], state);
	runtime.helpers.writeState(state);
	return state.settings.profiles[0].id;
}

function parseSseEvents(raw) {
	const blocks = raw.split("\n\n").map((entry) => entry.trim()).filter(Boolean);
	const events = [];
	for (const block of blocks) {
		const lines = block.split("\n");
		let eventName = "message";
		let data = "";
		for (const line of lines) {
			if (line.startsWith("event:")) {
				eventName = line.slice(6).trim();
			}
			if (line.startsWith("data:")) {
				data = line.slice(5).trim();
			}
		}
		if (data) {
			let parsed = data;
			try {
				parsed = JSON.parse(data);
			} catch (error) {
				parsed = data;
			}
			events.push({ event: eventName, data: parsed });
		}
	}
	return events;
}

test("GET /api/health returns runtime metadata", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { response, json } = await fetchJson(baseUrl, "/api/health");
			assert.equal(response.status, 200);
			assert.equal(json.ok, true);
			assert.equal(typeof json.auth_configured, "boolean");
			assert.equal(typeof json.ai_sdk_available, "boolean");
		});
	} finally {
		destroy();
	}
});

test("API routes reject requests without auth token", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/state`);
			assert.equal(response.status, 401);
		});
	} finally {
		destroy();
	}
});

test("API routes return auth_not_configured when token is not configured", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			API_AUTH_TOKEN: ""
		}
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/state`);
			const json = await response.json();
			assert.equal(response.status, 500);
			assert.equal(json.ok, false);
			assert.equal(json.error.code, "auth_not_configured");
		});
	} finally {
		destroy();
	}
});

test("API routes enforce per-scope rate limits", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			RATE_LIMIT_WINDOW_MS: "60000",
			RATE_LIMIT_API_MAX: "1"
		}
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const first = await fetchJson(baseUrl, "/api/state");
			assert.equal(first.response.status, 200);

			const second = await fetchJson(baseUrl, "/api/state");
			assert.equal(second.response.status, 429);
			assert.equal(second.json.ok, false);
			assert.equal(second.json.error.code, "rate_limited");
		});
	} finally {
		destroy();
	}
});

test("API routes reject requests when host is not allowlisted", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			ALLOWED_HOSTS: "example.com"
		}
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { response, json } = await fetchJson(baseUrl, "/api/state");
			assert.equal(response.status, 403);
			assert.equal(json.ok, false);
			assert.equal(json.error.code, "forbidden_host");
		});
	} finally {
		destroy();
	}
});

test("API routes reject requests when origin does not match allowed origin", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			ALLOWED_ORIGIN: "https://allowed.example"
		}
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { response, json } = await fetchJson(baseUrl, "/api/state", {
				headers: {
					Origin: "https://blocked.example"
				}
			});
			assert.equal(response.status, 403);
			assert.equal(json.ok, false);
			assert.equal(json.error.code, "forbidden_origin");
		});
	} finally {
		destroy();
	}
});

test("GET /api/providers returns provider catalog", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { response, json } = await fetchJson(baseUrl, "/api/providers");
			assert.equal(response.status, 200);
			assert.equal(Array.isArray(json.providers), true);
			assert.equal(json.providers.length >= 4, true);
		});
	} finally {
		destroy();
	}
});

test("GET /api/state returns seeded state", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { response, json } = await fetchJson(baseUrl, "/api/state");
			assert.equal(response.status, 200);
			assert.equal(json.ok, true);
			assert.equal(Array.isArray(json.state.chats), true);
			assert.equal(Object.prototype.hasOwnProperty.call(json.state.settings.profiles[0], "api_key"), false);
		});
	} finally {
		destroy();
	}
});

test("PUT /api/state rejects malformed payload", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { response, json } = await fetchJson(baseUrl, "/api/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ invalid: true })
			});
			assert.equal(response.status, 400);
			assert.equal(json.ok, false);
			assert.equal(json.error.code, "state_write_failed");
		});
	} finally {
		destroy();
	}
});

test("PUT /api/state persists updates and can be re-read", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const initial = runtime.helpers.readState();
			initial.chats[0].title = "Updated via API";
			initial.searchQuery = "updated";

			const putResult = await fetchJson(baseUrl, "/api/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(initial)
			});
			assert.equal(putResult.response.status, 200);

			const getResult = await fetchJson(baseUrl, "/api/state");
			assert.equal(getResult.json.state.chats[0].title, "Updated via API");
			assert.equal(getResult.json.state.searchQuery, "updated");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat returns invalid_request when profile_id is missing", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
			});
			assert.equal(result.response.status, 400);
			assert.equal(result.json.error.code, "invalid_request");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat returns auth_error when profile has no key", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const profileId = runtime.helpers.readState().settings.profiles[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 400);
			assert.equal(result.json.error.code, "auth_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat returns sdk_not_configured when AI_SDK_PATH is invalid", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			AI_SDK_PATH: "/path/that/does/not/exist"
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "test-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 500);
			assert.equal(result.json.error.code, "sdk_not_configured");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat rejects custom provider URL when host is not allowlisted", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			ALLOWED_CUSTOM_PROVIDER_HOSTS: ""
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://api.example.com/v1";
			profile.api_key = "test-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 500);
			assert.equal(result.json.error.code, "chat_failed");
			assert.match(String(result.json.error.message || ""), /allowlisted/i);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat rejects custom provider URL for local host even when allowlisted", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			ALLOWED_CUSTOM_PROVIDER_HOSTS: "127.0.0.1"
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://127.0.0.1/v1";
			profile.api_key = "test-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 500);
			assert.equal(result.json.error.code, "chat_failed");
			assert.match(String(result.json.error.message || ""), /not allowed/i);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat returns bridge_exec_error when spawn fails", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		spawnSyncFn() {
			return { error: new Error("spawn failed"), stdout: "", stderr: "stderr" };
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "test-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 500);
			assert.equal(result.json.error.code, "bridge_exec_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat returns bridge_parse_error on invalid bridge output", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		spawnSyncFn() {
			return { error: null, stdout: "not-json", stderr: "" };
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "test-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 502);
			assert.equal(result.json.error.code, "bridge_parse_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat maps provider status_code from bridge error payload", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		spawnSyncFn() {
			return {
				error: null,
				stdout: JSON.stringify({
					ok: false,
					status_code: 429,
					error: { code: "rate_limited", message: "Too many requests" }
				}),
				stderr: ""
			};
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "test-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 429);
			assert.equal(result.json.ok, false);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat succeeds with offline fixture bridge response", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		spawnSyncFn() {
			return {
				error: null,
				stdout: JSON.stringify({
					ok: true,
					provider: "openai",
					model: "gpt-4.1-mini",
					output_text: "fixture response"
				}),
				stderr: ""
			};
		}
	});
	try {
		const profileId = runtime.helpers.readState().settings.profiles[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/chat", {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					offline_fixture: true,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			assert.equal(result.response.status, 200);
			assert.equal(result.json.ok, true);
			assert.equal(result.json.output_text, "fixture response");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream emits invalid_request SSE when profile_id is missing", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
			});
			const body = await response.text();
			const events = parseSseEvents(body);
			assert.equal(events[0].event, "error");
			assert.equal(events[0].data.code, "invalid_request");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream emits auth_error SSE when profile has no key", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const profileId = runtime.helpers.readState().settings.profiles[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			const body = await response.text();
			const events = parseSseEvents(body);
			assert.equal(events[0].event, "error");
			assert.equal(events[0].data.code, "auth_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream emits provider_http_error SSE on upstream failure", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => ({
			ok: false,
			status: 500,
			headers: { get: () => "application/json" },
			async text() {
				return "upstream fail";
			}
		})
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hi" }]
				})
			});
			const body = await response.text();
			const events = parseSseEvents(body);
			assert.equal(events[0].event, "error");
			assert.equal(events[0].data.code, "provider_http_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream emits token and done for non-SSE upstream responses", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockJsonResponse({
			model: "gpt-test",
			usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
			choices: [
				{
					finish_reason: "stop",
					message: {
						content: "hello world",
						reasoning: "thinking text"
					}
				}
			]
		})
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hello" }]
				})
			});
			const body = await response.text();
			const events = parseSseEvents(body);
			const names = events.map((entry) => entry.event);
			assert.equal(names.includes("token"), true);
			assert.equal(names.includes("thinking"), true);
			assert.equal(names[names.length - 1], "done");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream parses SSE upstream deltas into token/thinking/done", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockSseResponse([
			{
				model: "gpt-stream",
				choices: [
					{
						delta: { content: "hello " },
						finish_reason: null
					}
				]
			},
			{
				choices: [
					{
						delta: { reasoning_content: "thinking " },
						finish_reason: "stop"
					}
				],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
			}
		])
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hello" }]
				})
			});
			const body = await response.text();
			const events = parseSseEvents(body);
			const tokenEvent = events.find((entry) => entry.event === "token");
			const thinkingEvent = events.find((entry) => entry.event === "thinking");
			const doneEvent = events.find((entry) => entry.event === "done");
			assert.equal(tokenEvent.data.delta, "hello ");
			assert.equal(thinkingEvent.data.delta, "thinking ");
			assert.equal(doneEvent.data.usage.total_tokens, 2);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream handles final upstream SSE line without trailing newline", async () => {
	const lastEvent = {
		choices: [
			{
				delta: { content: "world" },
				finish_reason: "stop"
			}
		],
		usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
	};

	const rawPayload = [
		`data: ${JSON.stringify({
			model: "gpt-stream",
			choices: [{ delta: { content: "hello " }, finish_reason: null }]
		})}`,
		`data: ${JSON.stringify(lastEvent)}`
	].join("\n\n");

	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockSseResponseFromPayload(rawPayload)
	});

	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "hello" }]
				})
			});
			const body = await response.text();
			const events = parseSseEvents(body);
			const tokenEvents = events.filter((entry) => entry.event === "token");
			const doneEvent = events.find((entry) => entry.event === "done");
			assert.equal(tokenEvents.map((entry) => entry.data.delta).join(""), "hello world");
			assert.equal(doneEvent.data.output_text, "hello world");
			assert.equal(doneEvent.data.usage.total_tokens, 5);
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe rejects missing profile_id", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.error.code, "invalid_request");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe rejects missing audio file", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const profileId = runtime.helpers.readState().settings.profiles[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.error.code, "invalid_request");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe rejects profile without API key", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const profileId = runtime.helpers.readState().settings.profiles[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			form.append("audio", new Blob([Buffer.from("audio")], { type: "audio/webm" }), "voice.webm");
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.error.code, "auth_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe rejects providers without transcription support", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "deepseek";
			profile.api_key = "abc";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			form.append("audio", new Blob([Buffer.from("audio")], { type: "audio/webm" }), "voice.webm");
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.error.code, "unsupported_feature");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe rejects unsupported audio MIME types", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "openai";
			profile.api_key = "abc";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			form.append("audio", new Blob([Buffer.from("audio")], { type: "text/plain" }), "voice.txt");
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.error.code, "invalid_audio");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe rejects oversized audio uploads", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			MAX_AUDIO_UPLOAD_BYTES: "8"
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "openai";
			profile.api_key = "abc";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			form.append("audio", new Blob([Buffer.from("0123456789")], { type: "audio/webm" }), "voice.webm");
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 413);
			assert.equal(json.error.code, "file_too_large");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe returns transcription_http_error on upstream failure", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => ({
			ok: false,
			status: 502,
			headers: { get: () => "application/json" },
			async text() {
				return "upstream failed";
			}
		})
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "openai";
			profile.api_key = "abc";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			form.append("audio", new Blob([Buffer.from("audio")], { type: "audio/webm" }), "voice.webm");
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 502);
			assert.equal(json.error.code, "transcription_http_error");
		});
	} finally {
		destroy();
	}
});

test("POST /api/transcribe returns transcript text on success", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockJsonResponse({ text: "hello transcript" })
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "openai";
			profile.api_key = "abc";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const form = new FormData();
			form.append("profile_id", profileId);
			form.append("audio", new Blob([Buffer.from("audio")], { type: "audio/webm" }), "voice.webm");
			const response = await fetch(`${baseUrl}/api/transcribe`, { method: "POST", headers: withAuthHeaders(), body: form });
			const json = await response.json();
			assert.equal(response.status, 200);
			assert.equal(json.ok, true);
			assert.equal(json.text, "hello transcript");
		});
	} finally {
		destroy();
	}
});
