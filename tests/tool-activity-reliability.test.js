"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { once } = require("node:events");

const { createServerRuntime } = require("../lib/server-runtime");

const API_TOKEN = "test-token-for-activity";

function withAuthHeaders(headers = {}) {
	return {
		"x-api-token": API_TOKEN,
		...headers
	};
}

function createIsolatedRuntime(overrides = {}) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-activity-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const auditLogPath = path.join(tempRoot, "audit.log");
	const baseEnv = {
		...process.env,
		ENCRYPTION_SECRET: "activity-test-secret",
		API_AUTH_TOKEN: API_TOKEN,
		AI_SDK_PATH: sdkPath,
		DB_PATH: path.join(tempRoot, "data", "test.db"),
		DB_BACKUP_DIR: path.join(tempRoot, "backups"),
		AUDIT_LOG_PATH: auditLogPath,
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
	if (!runtimeOverrides.skillRuntimeOptions) {
		runtimeOverrides.skillRuntimeOptions = { homeDir: tempRoot };
	}

	const runtime = createServerRuntime({
		env,
		projectRoot: path.resolve(__dirname, ".."),
		...runtimeOverrides
	});

	return {
		runtime,
		auditLogPath,
		tempRoot,
		destroy() {
			runtime.close();
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	};
}

function applyProfileMutation(runtime, callback) {
	const state = runtime.helpers.readState();
	callback(state.settings.profiles[0], state);
	runtime.helpers.writeState(state);
	return state.settings.profiles[0].id;
}

function mockSseResponse(events) {
	const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
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
					read() {
						if (index < chunks.length) {
							return Promise.resolve({ done: false, value: chunks[index++] });
						}
						return Promise.resolve({ done: true, value: undefined });
					}
				};
			}
		}
	};
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
			try {
				events.push({ event: eventName, data: JSON.parse(data) });
			} catch (error) {
				events.push({ event: eventName, data: {} });
			}
		}
	}
	return events;
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

const mockLocalRuntime = (readFileImpl) => ({
	canExecute: () => true,
	status: () => ({ enabled: true, available: true, workspace_count: 1 }),
	listWorkspaces: () => ({ workspaces: [{ id: "workspace_0", label: "demo" }] }),
	listFiles: () => ({ entries: [] }),
	readFile: readFileImpl,
	writeFile: () => ({ ok: true, path: "test.md" }),
	runCommand: async () => ({ command: "pwd", args: [], exit_code: 0, stdout: "", stderr: "" })
});

// ── Unit tests for toolErrorReason helper ─────────────────────────────────────

test("toolErrorReason maps known error codes to human-readable reasons", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const reason = runtime.helpers.toolErrorReason;
		assert.equal(reason("local_path_not_found"), "file not found in selected workspace");
		assert.equal(reason("local_workspace_not_found"), "workspace not configured");
		assert.equal(reason("local_shell_command_blocked"), "command not in allowlist");
		assert.equal(reason("browser_session_not_found"), "browser session expired");
		assert.equal(reason("tool_execution_unavailable"), "tool not available");
		assert.equal(reason("tool_execution_failed"), "execution failed");
		assert.equal(reason("invalid_tool_arguments"), "invalid arguments");
		assert.equal(reason("web_search_timeout"), "search timed out");
	} finally {
		destroy();
	}
});

test("toolErrorReason returns empty string for unknown error codes", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const reason = runtime.helpers.toolErrorReason;
		assert.equal(reason("nonexistent_error_code"), "");
		assert.equal(reason(""), "");
		assert.equal(reason(null), "");
		assert.equal(reason(undefined), "");
	} finally {
		destroy();
	}
});

// ── Integration: SSE failed event includes error_reason and audit log ─────────

test("SSE tool failed event includes error_reason and writes audit log entry", async () => {
	let providerRound = 0;
	const { runtime, destroy, auditLogPath } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com" },
		fetchFn: async (url) => {
			if (String(url).includes("/api/chat")) {
				providerRound += 1;
				if (providerRound === 1) {
					return mockSseResponse([
						{
							choices: [{
								delta: {
									tool_calls: [{
										index: 0,
										id: "call-1",
										function: {
											name: "local_file_read",
											arguments: JSON.stringify({ path: "missing.md", root_id: "workspace_0" })
										}
									}]
								},
								finish_reason: null
							}]
						},
						{ choices: [{ delta: {}, finish_reason: "tool_calls" }] }
					]);
				}
				return mockSseResponse([
					{ choices: [{ delta: { content: "Handled the failure." }, finish_reason: "stop" }] }
				]);
			}
			return mockSseResponse([{ choices: [{ delta: { content: "fallback" }, finish_reason: "stop" }] }]);
		},
		localRuntime: mockLocalRuntime(() => {
			const err = new Error("File not found in workspace.");
			err.code = "local_path_not_found";
			throw err;
		})
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
					messages: [{ role: "user", content: "read missing.md" }],
					tools: [{ type: "function", function: { name: "local_file_read", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());

			const startedEvent = events.find((e) => e.event === "tool" && e.data.phase === "started");
			assert.ok(startedEvent, "tool started event should be present");
			assert.equal(startedEvent.data.tool_name, "local_file_read");

			const failedEvent = events.find((e) => e.event === "tool" && e.data.phase === "failed");
			assert.ok(failedEvent, "tool failed event should be present");
			assert.equal(failedEvent.data.tool_name, "local_file_read");
			assert.equal(failedEvent.data.error_code, "local_path_not_found");
			assert.equal(failedEvent.data.error_reason, "file not found in selected workspace");

			const doneEvent = events.find((e) => e.event === "done");
			assert.ok(doneEvent, "done event should be present");
		});

		const auditContent = fs.existsSync(auditLogPath) ? fs.readFileSync(auditLogPath, "utf8") : "";
		const auditLines = auditContent.trim().split("\n").filter(Boolean);
		const toolFailedEntries = auditLines
			.map((line) => JSON.parse(line))
			.filter((entry) => entry.event === "tool_failed");
		assert.equal(toolFailedEntries.length, 1, "exactly one tool_failed audit entry should exist");
		assert.equal(toolFailedEntries[0].details.tool_name, "local_file_read");
		assert.equal(toolFailedEntries[0].details.error_code, "local_path_not_found");
	} finally {
		destroy();
	}
});

// ── Integration: successful tool does not write audit log entry ───────────────

test("Successful tool execution does not write a tool_failed audit entry", async () => {
	let providerRound = 0;
	const { runtime, destroy, auditLogPath } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com" },
		fetchFn: async (url) => {
			if (String(url).includes("/api/chat")) {
				providerRound += 1;
				if (providerRound === 1) {
					return mockSseResponse([
						{
							choices: [{
								delta: {
									tool_calls: [{
										index: 0,
										id: "call-1",
										function: {
											name: "local_file_read",
											arguments: JSON.stringify({ path: "README.md", root_id: "workspace_0" })
										}
									}]
								},
								finish_reason: null
							}]
						},
						{ choices: [{ delta: {}, finish_reason: "tool_calls" }] }
					]);
				}
				return mockSseResponse([
					{ choices: [{ delta: { content: "Got the file." }, finish_reason: "stop" }] }
				]);
			}
			return mockSseResponse([{ choices: [{ delta: { content: "fallback" }, finish_reason: "stop" }] }]);
		},
		localRuntime: mockLocalRuntime(() => ({ path: "README.md", content: "# Hello\n" }))
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
					messages: [{ role: "user", content: "read README.md" }],
					tools: [{ type: "function", function: { name: "local_file_read", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());

			const completedEvent = events.find((e) => e.event === "tool" && e.data.phase === "completed");
			assert.ok(completedEvent, "tool completed event should be present");

			const failedEvent = events.find((e) => e.event === "tool" && e.data.phase === "failed");
			assert.equal(failedEvent, undefined, "no tool failed event should be present");
		});

		let auditContent = "";
		if (fs.existsSync(auditLogPath)) {
			auditContent = fs.readFileSync(auditLogPath, "utf8");
		}
		const auditLines = auditContent.trim().split("\n").filter(Boolean);
		const toolFailedEntries = auditLines
			.map((line) => JSON.parse(line))
			.filter((entry) => entry.event === "tool_failed");
		assert.equal(toolFailedEntries.length, 0, "no tool_failed audit entries should exist");
	} finally {
		destroy();
	}
});

// ── Integration: unknown error code produces empty error_reason ───────────────

test("SSE tool failed event with unknown error code produces empty error_reason", async () => {
	let providerRound = 0;
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: { ALLOWED_CUSTOM_PROVIDER_HOSTS: "ollama.com" },
		fetchFn: async (url) => {
			if (String(url).includes("/api/chat")) {
				providerRound += 1;
				if (providerRound === 1) {
					return mockSseResponse([
						{
							choices: [{
								delta: {
									tool_calls: [{
										index: 0,
										id: "call-1",
										function: {
											name: "local_file_read",
											arguments: JSON.stringify({ path: "weird.md", root_id: "workspace_0" })
										}
									}]
								},
								finish_reason: null
							}]
						},
						{ choices: [{ delta: {}, finish_reason: "tool_calls" }] }
					]);
				}
				return mockSseResponse([
					{ choices: [{ delta: { content: "Done." }, finish_reason: "stop" }] }
				]);
			}
			return mockSseResponse([{ choices: [{ delta: { content: "fallback" }, finish_reason: "stop" }] }]);
		},
		localRuntime: mockLocalRuntime(() => {
			const err = new Error("Something unusual happened.");
			err.code = "custom_unknown_error";
			throw err;
		})
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
					messages: [{ role: "user", content: "read weird.md" }],
					tools: [{ type: "function", function: { name: "local_file_read", parameters: { type: "object" } } }]
				})
			});
			const events = parseSseEvents(await response.text());

			const failedEvent = events.find((e) => e.event === "tool" && e.data.phase === "failed");
			assert.ok(failedEvent, "tool failed event should be present");
			assert.equal(failedEvent.data.error_code, "custom_unknown_error");
			assert.equal(failedEvent.data.error_reason, "");
		});
	} finally {
		destroy();
	}
});
