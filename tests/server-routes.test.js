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
		KUJO_BIN: "/usr/bin/false",
		WEB_SEARCH_BACKEND: "auto",
		SEARXNG_BASE_URL: ""
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
	const payload = JSON.stringify(data);
	const encoder = new TextEncoder();
	let consumed = false;
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
		body: {
			getReader() {
				return {
					async read() {
						if (consumed) {
							return { done: true, value: undefined };
						}
						consumed = true;
						return { done: false, value: encoder.encode(payload) };
					}
				};
			}
		},
		async text() {
			return payload;
		}
	};
}

function mockChunkedResponse(chunks, contentType = "application/x-ndjson") {
	const encoder = new TextEncoder();
	let index = 0;
	return {
		ok: true,
		status: 200,
		headers: {
			get(name) {
				return String(name).toLowerCase() === "content-type" ? contentType : null;
			}
		},
		body: {
			getReader() {
				return {
					async read() {
						if (index >= chunks.length) {
							return { done: true, value: undefined };
						}
						const value = encoder.encode(chunks[index]);
						index += 1;
						return { done: false, value };
					}
				};
			}
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
			assert.equal(response.headers.get("cache-control"), "no-store");
			assert.equal(json.ok, true);
			assert.equal(typeof json.auth_configured, "boolean");
			assert.equal(typeof json.ai_sdk_available, "boolean");
			assert.deepEqual(json.tool_runtime.tools, ["web_search"]);
			assert.equal(json.tool_runtime.web_search_backend, "ollama");
			assert.equal(json.tool_runtime.browser.available, false);
			assert.equal(json.tool_runtime.browser.unavailable_reason, "disabled");
			assert.equal(json.tool_runtime.schemas.some((schema) => schema.function.name === "browser_open"), false);
		});
	} finally {
		destroy();
	}
});

test("GET /api/health advertises browser schemas only when Chromium is executable", async () => {
	const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-health-"));
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { BROWSER_ENABLED: "1" },
		browserRuntimeOptions: { artifactDir }
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const { json } = await fetchJson(baseUrl, "/api/health");
			assert.equal(json.tool_runtime.browser.available, true);
			assert.equal(json.tool_runtime.browser.backend, "playwright-chromium");
			assert.ok(json.tool_runtime.tools.includes("browser_open"));
			assert.ok(json.tool_runtime.schemas.some((schema) => schema.function.name === "browser_act"));
			assert.equal(JSON.stringify(json.tool_runtime.browser).includes(artifactDir), false);
		});
	} finally {
		await destroy();
		fs.rmSync(artifactDir, { recursive: true, force: true });
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

test("API routes validate auth before parsing JSON bodies", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{"
			});
			const json = await response.json();
			assert.equal(response.status, 401);
			assert.equal(json.error.code, "unauthorized");
		});
	} finally {
		destroy();
	}
});

test("API routes return JSON envelope for malformed authenticated JSON", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: "{"
			});
			const json = await response.json();
			assert.equal(response.status, 400);
			assert.equal(json.ok, false);
			assert.equal(json.error.code, "invalid_json");
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

test("API routes do not trust X-Forwarded-For for rate limits by default", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			RATE_LIMIT_WINDOW_MS: "60000",
			RATE_LIMIT_API_MAX: "1"
		}
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const first = await fetchJson(baseUrl, "/api/state", {
				headers: { "X-Forwarded-For": "203.0.113.10" }
			});
			assert.equal(first.response.status, 200);

			const second = await fetchJson(baseUrl, "/api/state", {
				headers: { "X-Forwarded-For": "203.0.113.11" }
			});
			assert.equal(second.response.status, 429);
		});
	} finally {
		destroy();
	}
});

test("API routes use X-Forwarded-For for rate limits only when proxy trust is enabled", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			TRUST_PROXY: "1",
			RATE_LIMIT_WINDOW_MS: "60000",
			RATE_LIMIT_API_MAX: "1"
		}
	});
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const first = await fetchJson(baseUrl, "/api/state", {
				headers: { "X-Forwarded-For": "203.0.113.10" }
			});
			assert.equal(first.response.status, 200);

			const second = await fetchJson(baseUrl, "/api/state", {
				headers: { "X-Forwarded-For": "203.0.113.11" }
			});
			assert.equal(second.response.status, 200);
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
			assert.deepEqual(json.state.settings.paneProfiles, []);
			assert.equal(typeof json.state.settings.defaultProfileId, "string");
			assert.equal(typeof json.state.settings.defaultModel, "string");
			assert.equal(Object.prototype.hasOwnProperty.call(json.state.settings.profiles[0], "api_key"), false);
		});
	} finally {
		destroy();
	}
});

test("POST /api/state/changes persists reusable pane profiles independently", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const seeded = runtime.helpers.readState();
		const providerProfileId = seeded.settings.profiles[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const paneProfiles = [{
					id: "content-benchmark",
					name: "Content Benchmark",
					panes: Array.from({ length: 20 }, (_, index) => ({
						profile_id: providerProfileId,
						model: `benchmark-model-${index + 1}`
					}))
				}];
			const result = await fetchJson(baseUrl, "/api/state/changes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ changes: [{ type: "pane_profiles_upsert", paneProfiles }] })
			});
			assert.equal(result.response.status, 200);

			const getResult = await fetchJson(baseUrl, "/api/state");
			assert.deepEqual(getResult.json.state.settings.paneProfiles, paneProfiles);

			const unrelatedSettings = getResult.json.state.settings;
			const settingsResult = await fetchJson(baseUrl, "/api/state/changes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ changes: [{
					type: "app_settings_upsert",
					settings: {
						temperature: unrelatedSettings.temperature,
						maxTokens: unrelatedSettings.maxTokens,
						activeChatId: getResult.json.state.activeChatId,
						projectFolders: getResult.json.state.projectFolders,
						tools: unrelatedSettings.tools,
						agentInstructions: unrelatedSettings.agentInstructions,
						agentInstructionProfiles: unrelatedSettings.agentInstructionProfiles,
						showArchived: getResult.json.state.showArchived,
						searchQuery: getResult.json.state.searchQuery
					}
				}] })
			});
			assert.equal(settingsResult.response.status, 200);
			const afterUnrelatedSettings = await fetchJson(baseUrl, "/api/state");
			assert.deepEqual(afterUnrelatedSettings.json.state.settings.paneProfiles, paneProfiles);

			const legacySnapshot = afterUnrelatedSettings.json.state;
			delete legacySnapshot.settings.paneProfiles;
			const putResult = await fetchJson(baseUrl, "/api/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(legacySnapshot)
			});
			assert.equal(putResult.response.status, 200);
			const afterLegacyPut = await fetchJson(baseUrl, "/api/state");
			assert.deepEqual(afterLegacyPut.json.state.settings.paneProfiles, paneProfiles);
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

test("PUT /api/state rejects payload without a state version", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const payload = runtime.helpers.readState();
			delete payload.stateVersion;
			payload.chats = [];
			payload.settings.profiles = [];

			const { response, json } = await fetchJson(baseUrl, "/api/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});
			assert.equal(response.status, 409);
			assert.equal(json.error.code, "state_version_conflict");

			const after = await fetchJson(baseUrl, "/api/state");
			assert.equal(after.json.state.settings.profiles.length > 0, true);
		});
	} finally {
		destroy();
	}
});

test("PUT /api/state rejects stale state version", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		await withServer(runtime.app, async (baseUrl) => {
			const payload = runtime.helpers.readState();

			const first = await fetchJson(baseUrl, "/api/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});
			assert.equal(first.response.status, 200);
			assert.equal(first.json.stateVersion, payload.stateVersion + 1);

			const second = await fetchJson(baseUrl, "/api/state", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload)
			});
			assert.equal(second.response.status, 409);
			assert.equal(second.json.error.code, "state_version_conflict");
			assert.equal(second.json.error.current_version, payload.stateVersion + 1);
		});
	} finally {
		destroy();
	}
});

test("POST /api/state/changes persists history larger than the per-request JSON limit", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			MAX_JSON_BODY_BYTES: "2048"
		}
	});
	try {
		const seeded = runtime.helpers.readState();
		const paneId = seeded.chats[0].panes[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			for (let index = 0; index < 12; index += 1) {
				const result = await fetchJson(baseUrl, "/api/state/changes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						changes: [{
							type: "message_upsert",
							message: {
								id: `large-history-${index}`,
								pane_id: paneId,
								role: "assistant",
								content: `${index}:`.padEnd(700, "x"),
								thinking: "",
								usage: { total_tokens: 175 },
								created_at: Date.now() + index,
								sort_order: index
							}
						}]
					})
				});
				assert.equal(result.response.status, 200);
			}

			const stateResult = await fetchJson(baseUrl, "/api/state");
			const messages = stateResult.json.state.chats[0].panes[0].messages;
			assert.equal(messages.length, 12);
			assert.equal(JSON.stringify(stateResult.json.state).length > 2048, true);
		});
	} finally {
		destroy();
	}
});

test("POST /api/state/changes reports committed assistant persistence by trace id", async () => {
	const telemetryCalls = [];
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { WATCHDOG_TELEMETRY_URL: "http://127.0.0.1:7700/api/telemetry/requests" },
		fetchFn: async (url, options) => {
			telemetryCalls.push({ url, options });
			return { ok: true, status: 200 };
		}
	});
	try {
		const seeded = runtime.helpers.readState();
		const paneId = seeded.chats[0].panes[0].id;
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/state/changes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ changes: [{
					type: "message_upsert",
					message: { id: "persisted-assistant", pane_id: paneId, role: "assistant", content: "done", thinking: "", usage: { trace_id: "trace-persist-1" }, created_at: Date.now(), sort_order: 0 }
				}] })
			});
			assert.equal(result.response.status, 200);
		});
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(telemetryCalls.length, 1);
		assert.equal(telemetryCalls[0].url, "http://127.0.0.1:7700/api/telemetry/traces");
		const payload = JSON.parse(telemetryCalls[0].options.body);
		assert.equal(payload.trace_id, "trace-persist-1");
		assert.equal(payload.events[0].event_name, "persistence_saved");
		assert.equal(payload.events[0].attributes.state, "committed");
	} finally {
		destroy();
	}
});

test("POST /api/state/changes rejects malformed changes without modifying state", async () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const before = runtime.helpers.readState();
		await withServer(runtime.app, async (baseUrl) => {
			const result = await fetchJson(baseUrl, "/api/state/changes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ changes: [{ type: "message_upsert", message: { id: "bad" } }] })
			});
			assert.equal(result.response.status, 400);
			assert.equal(result.json.error.code, "state_changes_failed");
		});
		const after = runtime.helpers.readState();
		assert.equal(after.stateVersion, before.stateVersion);
		assert.equal(after.chats[0].panes[0].messages.length, 0);
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

test("POST /api/chat/stream routes Watchdog profiles through the managed local proxy", async () => {
	const credentialDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-watchdog-token-"));
	const tokenFile = path.join(credentialDir, "proxy-token");
	fs.writeFileSync(tokenFile, "managed-watchdog-token\n", { mode: 0o600 });
	const observed = [];
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			WATCHDOG_PROXY_URL: "http://127.0.0.1:7700/proxy/v1",
			WATCHDOG_PROXY_TOKEN_FILE: tokenFile
		},
		fetchFn: async (url, options) => {
			observed.push({ url, options });
			return mockSseResponse([{ choices: [{ delta: { content: "ok" } }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "watchdog";
			profile.base_url = "";
			profile.api_key = "";
			profile.models_csv = "qwen3.5:397b-cloud";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, model: "qwen3.5:397b-cloud", chat_id: "chat_1", pane_id: "pane_1", messages: [{ role: "user", content: "hi" }] })
			});
			await response.text();
			assert.equal(response.status, 200);
		});
		const proxyCall = observed.find((call) => call.url === "http://127.0.0.1:7700/proxy/v1/chat/completions");
		const traceCall = observed.find((call) => call.url === "http://127.0.0.1:7700/api/telemetry/traces");
		assert.ok(proxyCall);
		assert.ok(traceCall);
		assert.equal(proxyCall.options.headers.Authorization, "Bearer managed-watchdog-token");
		assert.equal(proxyCall.options.headers["X-Observe-Project-Id"], "ai-chat");
		assert.equal(proxyCall.options.headers["X-Observe-Session-Id"], "chat_1");
		assert.equal(proxyCall.options.headers["X-Observe-Correlation-Id"], "pane_1");
		const traceBody = JSON.parse(traceCall.options.body);
		assert.equal(traceBody.trace.name, "interactive_chat");
		assert.ok(traceBody.spans.some((span) => span.span_kind === "model"));
	} finally {
		destroy();
		fs.rmSync(credentialDir, { recursive: true, force: true });
	}
});

test("POST /api/chat/stream routes the Ollama TUD profile through the shared proxy upstream", async () => {
	const credentialDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-watchdog-ollama-tud-token-"));
	const tokenFile = path.join(credentialDir, "proxy-token");
	fs.writeFileSync(tokenFile, "tud-watchdog-token\n", { mode: 0o600 });
	const observed = [];
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			WATCHDOG_PROXY_URL: "http://127.0.0.1:7700/proxy/v1",
			WATCHDOG_PROXY_TOKEN_FILE: tokenFile,
			WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE: "ollama-tud-work",
			WATCHDOG_DIRECT_STREAMING: "1",
			ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com"
		},
		fetchFn: async (url, options) => {
			observed.push({ url, options });
			return mockSseResponse([{ choices: [{ delta: { content: "ok" } }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile, state) => {
			profile.provider_id = "watchdog_ollama_tud";
			profile.base_url = "";
			profile.api_key = "";
			profile.models_csv = "qwen3.5:397b";
			state.settings.profiles.push({
				id: "personal-direct-ollama",
				name: "Personal direct Ollama",
				provider_id: "custom",
				base_url: "https://ollama.com",
				models_csv: "qwen3.5:397b",
				api_key: "personal-key"
			});
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, model: "qwen3.5:397b", messages: [{ role: "user", content: "hi" }] })
			});
			await response.text();
			assert.equal(response.status, 200);
		});
		assert.equal(observed.length, 1);
		assert.equal(observed[0].url, "http://127.0.0.1:7700/proxy/v1/chat/completions");
		assert.equal(observed[0].options.headers.Authorization, "Bearer tud-watchdog-token");
		assert.equal(observed[0].options.headers["X-Watchdog-Upstream-Profile"], "ollama-tud-work");
	} finally {
		destroy();
		fs.rmSync(credentialDir, { recursive: true, force: true });
	}
});

test("POST /api/chat/stream authenticates direct Watchdog telemetry and reports rejection", async () => {
	const credentialDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-watchdog-direct-"));
	const tokenFile = path.join(credentialDir, "proxy-token");
	const apiTokenFile = path.join(credentialDir, "api-token");
	fs.writeFileSync(tokenFile, "managed-watchdog-token\n", { mode: 0o600 });
	fs.writeFileSync(apiTokenFile, "managed-watchdog-api-token\n", { mode: 0o600 });
	const calls = [];
	const warnings = [];
	let directProviderCalls = 0;
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			WATCHDOG_PROXY_URL: "http://127.0.0.1:7700/proxy/v1",
			WATCHDOG_PROXY_TOKEN_FILE: tokenFile,
			WATCHDOG_API_TOKEN_FILE: apiTokenFile,
			WATCHDOG_DIRECT_STREAMING: "1",
			ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com"
		},
		warnFn: (message) => warnings.push(message),
		fetchFn: async (url, options) => {
			calls.push({ url, options });
			if (url.includes("/api/telemetry/requests")) {
				return { ok: false, status: 401 };
			}
			if (url === "https://ollama.com/api/web_search") {
				return mockJsonResponse({ results: [{ title: "Source", url: "https://example.com/source", content: "Evidence" }] });
			}
			directProviderCalls += 1;
			if (directProviderCalls === 1) {
				return mockChunkedResponse([`${JSON.stringify({ model: "qwen3.5", message: { tool_calls: [{ function: { name: "web_search", arguments: { query: "trace tools" } } }] }, done: true, done_reason: "stop" })}\n`]);
			}
			return mockChunkedResponse([
				`${JSON.stringify({ model: "qwen3.5", message: { content: "live " }, done: false })}\n`,
				`${JSON.stringify({ message: { content: "stream" }, done: true, done_reason: "stop", prompt_eval_count: 2, eval_count: 2 })}\n`
			]);
		}
	});
	try {
		const state = runtime.helpers.readState();
		const watchdogProfile = state.settings.profiles[0];
		watchdogProfile.provider_id = "watchdog";
		watchdogProfile.base_url = "";
		watchdogProfile.api_key = "";
		watchdogProfile.models_csv = "qwen3.5";
		state.settings.profiles.push({
			id: "direct-ollama-test",
			name: "Direct Ollama",
			provider_id: "custom",
			base_url: "https://ollama.com/v1",
			models_csv: "qwen3.5",
			api_key: "direct-ollama-key"
		});
		runtime.helpers.writeState(state);

		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: watchdogProfile.id,
					model: "qwen3.5",
					chat_id: "chat_direct",
					pane_id: "pane_direct",
					max_tokens: 700,
					messages: [{ role: "user", content: "hello" }],
					tools: [{ type: "function", function: { name: "web_search", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "live stream");
			assert.equal(events.find((entry) => entry.event === "done").data.transport, "direct");
		});

		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(calls[0].url, "https://ollama.com/api/chat");
		assert.equal(calls[0].options.headers.Authorization, "Bearer direct-ollama-key");
		const directBody = JSON.parse(calls[0].options.body);
		assert.equal(directBody.options.num_predict, 700);
		assert.equal(Object.prototype.hasOwnProperty.call(directBody, "max_tokens"), false);
		const telemetryCall = calls.find((call) => call.url === "http://127.0.0.1:7700/api/telemetry/requests");
		assert.ok(telemetryCall);
		assert.equal(telemetryCall.options.headers["X-Watchdog-Token"], "managed-watchdog-api-token");
		const telemetryBody = JSON.parse(telemetryCall.options.body);
		assert.equal(telemetryBody.trace.name, "interactive_chat");
		assert.ok(telemetryBody.spans.some((span) => span.span_kind === "workflow"));
		assert.ok(telemetryBody.spans.some((span) => span.span_kind === "model"));
		assert.ok(telemetryBody.events.some((event) => event.event_name === "first_token"));
		assert.ok(telemetryBody.events.some((event) => event.event_name === "tool_started"));
		assert.ok(telemetryBody.spans.some((span) => span.span_kind === "tool"));
		assert.equal(telemetryBody.tool_calls[0].tool_name, "web_search");
		assert.equal(telemetryBody.tool_calls[0].arguments.query_chars, 11);
		assert.equal(JSON.stringify(telemetryBody.tool_calls).includes("trace tools"), false);
		assert.equal(telemetryBody.prompt_summary.includes("hello"), false);
		assert.equal(telemetryBody.trace.attributes.telemetry_content_mode, "off");
		assert.deepEqual(warnings, [
			"[watchdog] Telemetry intake returned HTTP 401. Check WATCHDOG_API_TOKEN_FILE when Watchdog API auth is enabled."
		]);
	} finally {
		destroy();
		fs.rmSync(credentialDir, { recursive: true, force: true });
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

test("POST /api/chat returns 422 when the bridge requests tool execution", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		spawnSyncFn() {
			return {
				error: null,
				stdout: JSON.stringify({
					ok: true,
					finish_reason: "tool_calls",
					tool_calls: [{ id: "call-1", function: { name: "browser_use", arguments: "{\"action\":\"navigate\"}" } }]
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
					messages: [{ role: "user", content: "open a site" }],
					tools: [{ type: "function", function: { name: "browser_use", parameters: { type: "object" } } }]
				})
			});
			assert.equal(result.response.status, 422);
			assert.equal(result.json.error.code, "tool_execution_unavailable");
			assert.deepEqual(result.json.error.tool_names, ["browser_use"]);
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
			assert.equal(Object.prototype.hasOwnProperty.call(events[0].data, "raw"), false);
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

test("POST /api/chat/stream forwards NDJSON chunks as they arrive", async () => {
	const first = JSON.stringify({ model: "ollama-test", message: { content: "hello " }, done: false });
	const second = JSON.stringify({ message: { content: "world" }, done: true, done_reason: "stop", prompt_eval_count: 2, eval_count: 2 });
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockChunkedResponse([`${first}\n`, `${second}\n`])
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, messages: [{ role: "user", content: "hello" }] })
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "hello world");
			const doneEvent = events.find((entry) => entry.event === "done");
			assert.equal(doneEvent.data.finish_reason, "stop");
			assert.equal(doneEvent.data.usage.total_tokens, 4);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream treats provider error events as terminal", async () => {
	const payload = [
		`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" }, finish_reason: null }] })}`,
		`event: error\ndata: ${JSON.stringify({ error: { message: "upstream disconnected" } })}`,
		"data: [DONE]"
	].join("\n\n") + "\n\n";
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockSseResponseFromPayload(payload)
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, messages: [{ role: "user", content: "hello" }] })
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.some((entry) => entry.event === "token"), true);
			assert.equal(events.some((entry) => entry.event === "error"), true);
			assert.equal(events.some((entry) => entry.event === "done"), false);
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
				usage: {
					prompt_tokens: 1,
					completion_tokens: 1,
					total_tokens: 2,
					prompt_tokens_details: { cached_tokens: 1 }
				}
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
			assert.equal(doneEvent.data.usage.input_tokens, 1);
			assert.equal(doneEvent.data.usage.output_tokens, 1);
			assert.equal(doneEvent.data.usage.cached_input_tokens, 1);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream disables provider thinking for recovery requests", async () => {
	let capturedRequest = null;
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "api.example.com" },
		fetchFn: async (_url, options) => {
			capturedRequest = JSON.parse(options.body);
			return mockSseResponse([
				{
					choices: [{ delta: { content: "final answer" }, finish_reason: "stop" }]
				}
			]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://api.example.com/v1";
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					model: "kimi-k2.7-code:cloud",
					disable_thinking: true,
					messages: [{ role: "user", content: "hello" }]
				})
			});
			await response.text();
			assert.equal(capturedRequest.think, false);
			assert.equal(capturedRequest.reasoning_effort, "none");
			assert.equal(capturedRequest.enable_thinking, false);
			assert.equal(capturedRequest.thinking, false);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream executes web_search and continues to a final answer", async () => {
	const calls = [];
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com" },
		fetchFn: async (url, options) => {
			calls.push({ url, body: JSON.parse(options.body) });
			if (url === "https://ollama.com/api/web_search") {
				return mockJsonResponse({
					results: [{ title: "Deterministic AI", url: "https://example.com/result", content: "Verified source" }]
				});
			}
			if (calls.filter((call) => call.url === "https://ollama.com/api/chat").length === 1) {
				return mockSseResponse([
					{
						choices: [{
							delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "web_search", arguments: "{\"query\":\"deterministic AI\"}" } }] },
							finish_reason: null
						}]
					},
					{ choices: [{ delta: {}, finish_reason: "tool_calls" }] }
				]);
			}
			return mockSseResponse([
				{ choices: [{ delta: { content: "Sourced final answer" }, finish_reason: "stop" }] }
			]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://ollama.com/v1";
			profile.api_key = "ollama-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "search the web" }],
					tools: [{ type: "function", function: { name: "web_search", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.some((entry) => entry.event === "error"), false);
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "Sourced final answer");
			assert.equal(events.find((entry) => entry.event === "done").data.tool_calls_executed, 1);
		});
		assert.equal(calls.length, 3);
		assert.equal(calls[1].url, "https://ollama.com/api/web_search");
		assert.equal(calls[1].body.query, "deterministic AI");
		assert.equal(calls[2].body.messages.at(-1).role, "tool");
		assert.equal(calls[2].body.messages.at(-1).tool_name, "web_search");
		assert.match(calls[2].body.messages.at(-1).content, /Verified source/);
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream keeps the search backend independent of the model provider", async () => {
	const calls = [];
	let providerCalls = 0;
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			ALLOWED_CUSTOM_PROVIDER_HOSTS: "api.example.com",
			SEARXNG_BASE_URL: "http://127.0.0.1:8080"
		},
		fetchFn: async (url, options) => {
			calls.push({ url, options });
			if (url.startsWith("http://127.0.0.1:8080/search?")) {
				return mockJsonResponse({
					results: [{ title: "Local result", url: "https://example.com/local", content: "Local evidence" }]
				});
			}
			providerCalls += 1;
			if (providerCalls === 1) {
				return mockSseResponse([
					{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-openai", function: { name: "web_search", arguments: "{\"query\":\"local search\"}" } }] }, finish_reason: "tool_calls" }] }
				]);
			}
			return mockSseResponse([
				{ choices: [{ delta: { content: "Provider-neutral answer" }, finish_reason: "stop" }] }
			]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://api.example.com/v1";
			profile.api_key = "model-provider-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					messages: [{ role: "user", content: "search locally" }],
					tools: [{ type: "function", function: { name: "web_search", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "Provider-neutral answer");
			assert.equal(events.find((entry) => entry.event === "done").data.tool_calls_executed, 1);
		});
		assert.equal(calls.length, 3);
		assert.equal(calls[0].url, "https://api.example.com/v1/chat/completions");
		assert.match(calls[1].url, /^http:\/\/127\.0\.0\.1:8080\/search\?/);
		const finalBody = JSON.parse(calls[2].options.body);
		assert.equal(finalBody.messages.at(-1).tool_call_id, "call-openai");
		assert.match(finalBody.messages.at(-1).content, /Local evidence/);
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream keeps unsupported tool calls terminal", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockSseResponse([
			{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "browser_use", arguments: "{}" } }] }, finish_reason: "tool_calls" }] }
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
					messages: [{ role: "user", content: "open a site" }],
					tools: [{ type: "function", function: { name: "browser_use", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());
			const errorEvent = events.find((entry) => entry.event === "error");
			assert.equal(errorEvent.data.code, "tool_execution_unavailable");
			assert.deepEqual(errorEvent.data.tool_names, ["browser_use"]);
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream executes multi-round Ollama-native browser tools and returns a final answer", async () => {
	const fixture = http.createServer((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Browser route fixture</title><h1>Ollama browser evidence</h1><a href='/details'>Details</a>");
	});
	fixture.listen(0, "127.0.0.1");
	await once(fixture, "listening");
	const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
	const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-route-"));
	let providerRound = 0;
	const providerBodies = [];
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com", BROWSER_ENABLED: "1" },
		browserRuntimeOptions: { allowPrivateHosts: ["127.0.0.1"], artifactDir },
		fetchFn: async (url, options) => {
			providerBodies.push(JSON.parse(options.body));
			providerRound += 1;
			if (providerRound === 1) {
				return mockJsonResponse({ model: "qwen", message: { tool_calls: [{ function: { name: "browser_open", arguments: { url: fixtureUrl } } }] }, done: true, done_reason: "stop" });
			}
			if (providerRound === 2) {
				const prior = JSON.parse(providerBodies.at(-1).messages.at(-1).content);
				return mockJsonResponse({ model: "qwen", message: { tool_calls: [{ function: { name: "browser_snapshot", arguments: { session_id: prior.session_id } } }] }, done: true, done_reason: "stop" });
			}
			return mockJsonResponse({ model: "qwen", message: { content: "Ollama used local browser evidence." }, done: true, done_reason: "stop" });
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://ollama.com/v1";
			profile.api_key = "ollama-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({
					profile_id: profileId,
					chat_id: "browser-chat-ollama",
					messages: [{ role: "user", content: "Read the fixture" }],
					tools: ["browser_open", "browser_snapshot"].map((name) => ({ type: "function", function: { name, parameters: { type: "object" } } }))
				})
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.some((entry) => entry.event === "error"), false);
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "Ollama used local browser evidence.");
			assert.equal(events.find((entry) => entry.event === "done").data.tool_calls_executed, 2);
		});
		assert.match(providerBodies[2].messages.at(-1).content, /Ollama browser evidence/);
		assert.equal(providerBodies[2].messages.at(-1).tool_name, "browser_snapshot");
	} finally {
		await destroy();
		fixture.close();
		await once(fixture, "close");
		fs.rmSync(artifactDir, { recursive: true, force: true });
	}
});

test("POST /api/chat/stream executes OpenAI-compatible browser tools with provider-neutral result messages", async () => {
	const fixture = http.createServer((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>OpenAI browser fixture</title><p>OpenAI-compatible browser evidence</p>");
	});
	fixture.listen(0, "127.0.0.1");
	await once(fixture, "listening");
	const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
	const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-route-openai-"));
	let providerRound = 0;
	const providerBodies = [];
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "api.example.com", BROWSER_ENABLED: "1" },
		browserRuntimeOptions: { allowPrivateHosts: ["127.0.0.1"], artifactDir },
		fetchFn: async (url, options) => {
			const body = JSON.parse(options.body);
			providerBodies.push(body);
			providerRound += 1;
			if (providerRound === 1) {
				return mockSseResponse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "browser-call", function: { name: "browser_open", arguments: JSON.stringify({ url: fixtureUrl }) } }] }, finish_reason: "tool_calls" }] }]);
			}
			return mockSseResponse([{ choices: [{ delta: { content: "OpenAI-compatible browser answer." }, finish_reason: "stop" }] }]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://api.example.com/v1";
			profile.api_key = "provider-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, chat_id: "browser-chat-openai", messages: [{ role: "user", content: "Open fixture" }], tools: [{ type: "function", function: { name: "browser_open", parameters: { type: "object" } } }] })
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "OpenAI-compatible browser answer.");
			assert.equal(events.find((entry) => entry.event === "done").data.tool_calls_executed, 1);
		});
		assert.equal(providerBodies[1].messages.at(-1).tool_call_id, "browser-call");
		assert.match(providerBodies[1].messages.at(-1).content, /OpenAI browser fixture/);
	} finally {
		await destroy();
		fixture.close();
		await once(fixture, "close");
		fs.rmSync(artifactDir, { recursive: true, force: true });
	}
});

test("POST /api/chat/stream returns browser_use screenshots as authenticated chat artifacts", async () => {
	const fixture = http.createServer((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Screenshot fixture</title><main><h1>Screenshot evidence</h1></main>");
	});
	fixture.listen(0, "127.0.0.1");
	await once(fixture, "listening");
	const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
	const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-screenshot-route-"));
	let providerRound = 0;
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			ALLOWED_CUSTOM_PROVIDER_HOSTS: "api.example.com",
			BROWSER_ENABLED: "1",
			BROWSER_ARTIFACT_DIR: artifactDir
		},
		browserRuntimeOptions: { allowPrivateHosts: ["127.0.0.1"] },
		fetchFn: async () => {
			providerRound += 1;
			if (providerRound === 1) {
				return mockSseResponse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "browser-screenshot", function: { name: "browser_use", arguments: JSON.stringify({ action: "screenshot", url: fixtureUrl }) } }] }, finish_reason: "tool_calls" }] }]);
			}
			return mockSseResponse([{ choices: [{ delta: { content: "I captured the screenshot." }, finish_reason: "stop" }] }]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://api.example.com/v1";
			profile.api_key = "provider-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, chat_id: "browser-screenshot-chat", messages: [{ role: "user", content: "Show me a screenshot" }], tools: [{ type: "function", function: { name: "browser_use", parameters: { type: "object" } } }] })
			});
			const events = parseSseEvents(await response.text());
			const done = events.find((entry) => entry.event === "done").data;
			assert.deepEqual(done.tool_artifacts.map((artifact) => artifact.media_type), ["image/png"]);
			assert.match(done.tool_artifacts[0].artifact_id, /^browser-shot_[A-Za-z0-9_-]+$/);

			const artifactResponse = await fetch(`${baseUrl}/api/browser/artifacts/${done.tool_artifacts[0].artifact_id}`, { headers: withAuthHeaders() });
			assert.equal(artifactResponse.status, 200);
			assert.match(artifactResponse.headers.get("content-type"), /^image\/png/);
			assert.deepEqual([...new Uint8Array(await artifactResponse.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
		});
	} finally {
		await destroy();
		fixture.close();
		await once(fixture, "close");
		fs.rmSync(artifactDir, { recursive: true, force: true });
	}
});

test("POST /api/chat/stream gives side-by-side panes independent browser session allowances", async () => {
	const fixture = http.createServer((req, res) => {
		res.setHeader("content-type", "text/html; charset=utf-8");
		res.end("<!doctype html><title>Pane browser fixture</title><p>Pane evidence</p>");
	});
	fixture.listen(0, "127.0.0.1");
	await once(fixture, "listening");
	const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
	const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-pane-scope-"));
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "api.example.com", BROWSER_ENABLED: "1" },
		browserRuntimeOptions: { allowPrivateHosts: ["127.0.0.1"], artifactDir, maxSessions: 2, maxSessionsPerScope: 1 },
		fetchFn: async (url, options) => {
			const body = JSON.parse(options.body);
			const hasToolResult = body.messages.some((message) => message.role === "tool");
			if (hasToolResult) {
				return mockSseResponse([{ choices: [{ delta: { content: "Pane browser answer." }, finish_reason: "stop" }] }]);
			}
			return mockSseResponse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "pane-browser-call", function: { name: "browser_open", arguments: JSON.stringify({ url: fixtureUrl }) } }] }, finish_reason: "tool_calls" }] }]);
		}
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.provider_id = "custom";
			profile.base_url = "https://api.example.com/v1";
			profile.api_key = "provider-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			for (const paneId of ["pane-left", "pane-right"]) {
				const response = await fetch(`${baseUrl}/api/chat/stream`, {
					method: "POST",
					headers: withAuthHeaders({ "Content-Type": "application/json" }),
					body: JSON.stringify({ profile_id: profileId, chat_id: "shared-chat", pane_id: paneId, messages: [{ role: "user", content: "Open fixture" }], tools: [{ type: "function", function: { name: "browser_open", parameters: { type: "object" } } }] })
				});
				const events = parseSseEvents(await response.text());
				assert.equal(events.some((entry) => entry.event === "error"), false);
				assert.equal(events.find((entry) => entry.event === "done").data.tool_calls_executed, 1);
			}
		});
	} finally {
		await destroy();
		fixture.close();
		await once(fixture, "close");
		fs.rmSync(artifactDir, { recursive: true, force: true });
	}
});

test("POST /api/chat/stream consumes multiline SSE data frames without dropping content", async () => {
	const event = {
		model: "gpt-multiline",
		choices: [{ delta: { content: "complete stream" }, finish_reason: "stop" }]
	};
	const multilineEvent = JSON.stringify(event, null, 2)
		.split("\n")
		.map((line) => `data: ${line}`)
		.join("\n");
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockSseResponseFromPayload(`${multilineEvent}\n\ndata: [DONE]\n\n`)
	});
	try {
		const profileId = applyProfileMutation(runtime, (profile) => {
			profile.api_key = "stream-key";
		});
		await withServer(runtime.app, async (baseUrl) => {
			const response = await fetch(`${baseUrl}/api/chat/stream`, {
				method: "POST",
				headers: withAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ profile_id: profileId, messages: [{ role: "user", content: "hello" }] })
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "complete stream");
			assert.equal(events.find((entry) => entry.event === "done").data.finish_reason, "stop");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream keeps the timeout active while consuming the upstream body", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { STREAM_REQUEST_TIMEOUT_MS: "10" },
		fetchFn: async (url, options) => ({
			ok: true,
			status: 200,
			headers: { get: () => "text/event-stream" },
			body: {
				getReader() {
					return {
						read() {
							return new Promise((resolve, reject) => {
								if (options.signal.aborted) {
									reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
									return;
								}
								options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
							});
						}
					};
				}
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
				body: JSON.stringify({ profile_id: profileId, messages: [{ role: "user", content: "hello" }] })
			});
			const events = parseSseEvents(await response.text());
			assert.equal(events[0].event, "error");
			assert.equal(events[0].data.code, "stream_timeout");
		});
	} finally {
		destroy();
	}
});

test("POST /api/chat/stream preserves Ollama-style message chunks and detects an unmarked close", async () => {
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async () => mockSseResponseFromPayload([
			`data: ${JSON.stringify({ message: { thinking: "**plan** ", content: "hello " }, done: false })}`,
			`data: ${JSON.stringify({ message: { content: "world" }, done: false })}`
		].join("\n\n"))
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
			const events = parseSseEvents(await response.text());
			const doneEvent = events.find((entry) => entry.event === "done");
			assert.equal(events.filter((entry) => entry.event === "token").map((entry) => entry.data.delta).join(""), "hello world");
			assert.equal(events.filter((entry) => entry.event === "thinking").map((entry) => entry.data.delta).join(""), "**plan** ");
			assert.equal(doneEvent.data.finish_reason, "stream_closed");
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
