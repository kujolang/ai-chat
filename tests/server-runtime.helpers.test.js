const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createServerRuntime } = require("../lib/server-runtime");

function createIsolatedRuntime(overrides = {}) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-test-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const env = {
		...process.env,
		ENCRYPTION_SECRET: "unit-test-secret",
		API_AUTH_TOKEN: "unit-test-token",
		AI_SDK_PATH: sdkPath,
		DB_PATH: path.join(tempRoot, "data", "test.db"),
		DB_BACKUP_DIR: path.join(tempRoot, "backups"),
		PORT: "0",
		KUJO_BIN: "/usr/bin/false",
		WEB_SEARCH_BACKEND: "auto",
		SEARXNG_BASE_URL: ""
	};

	const runtime = createServerRuntime({
		env,
		projectRoot: path.resolve(__dirname, ".."),
		...overrides
	});

	return {
		runtime,
		destroy() {
			runtime.close();
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	};
}

test("encryptValue and decryptValue roundtrip plain text", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const encrypted = runtime.helpers.encryptValue("abc123");
		assert.notEqual(encrypted.cipher, "");
		assert.notEqual(encrypted.iv, "");
		assert.notEqual(encrypted.tag, "");
		assert.equal(runtime.helpers.decryptValue(encrypted.cipher, encrypted.iv, encrypted.tag), "abc123");
	} finally {
		destroy();
	}
});

test("decryptValue returns empty for incomplete encrypted values", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.equal(runtime.helpers.decryptValue("", "", ""), "");
		assert.equal(runtime.helpers.decryptValue("x", "", ""), "");
	} finally {
		destroy();
	}
});

test("seeds and upgrades OpenRouter and Watchdog model suggestions from the static catalog", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		const openRouter = state.settings.profiles.find((profile) => profile.provider_id === "openrouter");
		const watchdog = state.settings.profiles.find((profile) => profile.provider_id === "watchdog");
		const watchdogOpenRouter = state.settings.profiles.find((profile) => profile.provider_id === "watchdog_openrouter");
		const watchdogOllamaTud = state.settings.profiles.find((profile) => profile.provider_id === "watchdog_ollama_tud");
		assert.ok(openRouter);
		assert.ok(watchdog);
		assert.ok(watchdogOpenRouter);
		assert.ok(watchdogOllamaTud);
		assert.match(openRouter.models_csv, /moonshotai\/kimi-k2\.7-code/);
		assert.match(openRouter.models_csv, /openai\/gpt-4\.1-mini/);
		assert.match(watchdog.models_csv, /gemma4:31b/);
		assert.match(watchdog.models_csv, /mistral-large-3:675b/);
		assert.match(watchdogOpenRouter.models_csv, /moonshotai\/kimi-k2\.7-code/);
		assert.match(watchdogOllamaTud.models_csv, /mistral-large-3:675b/);
	} finally {
		destroy();
	}
});

test("catalog migration keeps existing model suggestions while appending new candidates", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-catalog-migration-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const env = {
		...process.env,
		ENCRYPTION_SECRET: "unit-test-secret",
		API_AUTH_TOKEN: "unit-test-token",
		AI_SDK_PATH: sdkPath,
		DB_PATH: path.join(tempRoot, "data", "test.db"),
		DB_BACKUP_DIR: path.join(tempRoot, "backups"),
		PORT: "0",
		KUJO_BIN: "/usr/bin/false"
	};

	const firstRuntime = createServerRuntime({ env, projectRoot: path.resolve(__dirname, "..") });
	try {
		const state = firstRuntime.helpers.readState();
		const openRouter = state.settings.profiles.find((profile) => profile.provider_id === "openrouter");
		const watchdog = state.settings.profiles.find((profile) => profile.provider_id === "watchdog");
		openRouter.models_csv = "custom/openrouter-model";
		watchdog.models_csv = "qwen3.5:397b-cloud,gemma4:e2b,gemini-3-flash-preview";
		firstRuntime.helpers.writeState(state);
	} finally {
		firstRuntime.close();
	}

	const upgradedRuntime = createServerRuntime({ env, projectRoot: path.resolve(__dirname, "..") });
	try {
		const state = upgradedRuntime.helpers.readState();
		const openRouter = state.settings.profiles.find((profile) => profile.provider_id === "openrouter");
		const watchdog = state.settings.profiles.find((profile) => profile.provider_id === "watchdog");
		assert.match(openRouter.models_csv, /custom\/openrouter-model/);
		assert.match(openRouter.models_csv, /moonshotai\/kimi-k2\.7-code/);
		assert.match(watchdog.models_csv, /qwen3\.5:397b-cloud/);
		assert.match(watchdog.models_csv, /gemma4:31b/);
		assert.doesNotMatch(watchdog.models_csv, /gemma4:e2b/);
		assert.doesNotMatch(watchdog.models_csv, /gemini-3-flash-preview/);
		assert.ok(state.settings.profiles.some((profile) => profile.provider_id === "watchdog_ollama_tud"));
	} finally {
		upgradedRuntime.close();
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("catalog migration preserves the curated Watchdog OpenRouter TUD model list", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-tud-catalog-migration-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const env = {
		...process.env,
		ENCRYPTION_SECRET: "unit-test-secret",
		API_AUTH_TOKEN: "unit-test-token",
		AI_SDK_PATH: sdkPath,
		DB_PATH: path.join(tempRoot, "data", "test.db"),
		DB_BACKUP_DIR: path.join(tempRoot, "backups"),
		PORT: "0",
		KUJO_BIN: "/usr/bin/false"
	};

	const firstRuntime = createServerRuntime({ env, projectRoot: path.resolve(__dirname, "..") });
	try {
		const state = firstRuntime.helpers.readState();
		const profile = state.settings.profiles.find((entry) => entry.provider_id === "watchdog_openrouter");
		profile.name = "Watchdog / OpenRouter (TUD)";
		profile.models_csv = "openai/gpt-5.4,anthropic/claude-sonnet-5";
		firstRuntime.helpers.writeState(state);
	} finally {
		firstRuntime.close();
	}

	const upgradedRuntime = createServerRuntime({ env, projectRoot: path.resolve(__dirname, "..") });
	try {
		const state = upgradedRuntime.helpers.readState();
		const profile = state.settings.profiles.find((entry) => entry.provider_id === "watchdog_openrouter");
		assert.equal(profile.models_csv, "openai/gpt-5.4,anthropic/claude-sonnet-5");
	} finally {
		upgradedRuntime.close();
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("normalizeMessages keeps only supported roles and trims role", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const normalized = runtime.helpers.normalizeMessages([
			{ role: " user ", content: 100 },
			{ role: "user", content: 0 },
			{ role: "assistant", content: "ok" },
			{ role: "tool", content: "skip" },
			null,
			"bad"
		]);
		assert.deepEqual(normalized, [
			{ role: "user", content: "100" },
			{ role: "user", content: "0" },
			{ role: "assistant", content: "ok" }
		]);
	} finally {
		destroy();
	}
});

test("validateStateShape throws on malformed state payload", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.throws(() => runtime.helpers.validateStateShape(null), /State payload must be an object/);
		assert.throws(() => runtime.helpers.validateStateShape({}), /missing chats array/);
		assert.throws(() => runtime.helpers.validateStateShape({ chats: [] }), /missing settings object/);
		assert.throws(() => runtime.helpers.validateStateShape({ chats: [], settings: {} }), /missing profiles array/);
		const emptyProfileState = runtime.helpers.readState();
		emptyProfileState.settings.profiles = [];
		assert.throws(() => runtime.helpers.writeState(emptyProfileState), /At least one provider profile/);
		const validState = runtime.helpers.readState();
		validState.chats.push({ ...validState.chats[0], id: validState.chats[0].id });
		assert.throws(() => runtime.helpers.validateStateShape(validState), /Duplicate chat id/);
	} finally {
		destroy();
	}
});

test("parseBridgeStdout parses trailing JSON object from mixed logs", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const parsed = runtime.helpers.parseBridgeStdout("log line\n{\"ok\":true,\"x\":1}\n");
		assert.equal(parsed.ok, true);
		assert.equal(parsed.x, 1);
	} finally {
		destroy();
	}
});

test("parseBridgeStdout throws on empty output", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.throws(() => runtime.helpers.parseBridgeStdout("  \n\t"), /empty output/);
	} finally {
		destroy();
	}
});

test("providerConfig returns expected endpoint mappings", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.equal(runtime.helpers.providerConfig({ provider_id: "openrouter" }).base_url, "https://openrouter.ai/api/v1");
		assert.equal(runtime.helpers.providerConfig({ provider_id: "deepseek" }).transcribe_path, null);
		assert.equal(runtime.helpers.providerConfig({ provider_id: "custom", base_url: "https://example.com/v1" }).base_url, "https://example.com/v1");
		assert.deepEqual(runtime.helpers.providerConfig({ provider_id: "custom", base_url: "https://ollama.com/v1" }), {
			base_url: "https://ollama.com",
			chat_path: "/api/chat",
			transcribe_path: null,
			ollama_native: true
		});
		assert.equal(runtime.helpers.providerConfig({ provider_id: "openai" }).base_url, "https://api.openai.com/v1");
	} finally {
		destroy();
	}
});

test("createServerRuntime defaults host to localhost and allows explicit override", () => {
	const defaultRuntime = createIsolatedRuntime();
	try {
		assert.equal(defaultRuntime.runtime.config.host, "127.0.0.1");
	} finally {
		defaultRuntime.destroy();
	}

	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-host-test-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const overrideRuntime = createServerRuntime({
		env: {
			ENCRYPTION_SECRET: "unit-test-secret",
			API_AUTH_TOKEN: "unit-test-token",
			AI_SDK_PATH: sdkPath,
			DB_PATH: path.join(tempRoot, "data", "test.db"),
			DB_BACKUP_DIR: path.join(tempRoot, "backups"),
			AI_CHAT_HOST: "127.0.0.2",
			PORT: "0",
			KUJO_BIN: "/usr/bin/false"
		},
		projectRoot: path.resolve(__dirname, "..")
	});
	try {
		assert.equal(overrideRuntime.config.host, "127.0.0.2");
	} finally {
		overrideRuntime.close();
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("flattenText supports string, array fragments, and object values", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.equal(runtime.helpers.flattenText("a"), "a");
		assert.equal(runtime.helpers.flattenText(["a", { text: "b" }, { content: "c" }, null]), "abc");
		assert.equal(runtime.helpers.flattenText([{ content: [{ text: "nested " }, { content: "text" }] }]), "nested text");
		assert.equal(runtime.helpers.flattenText({ output: [{ text: "response" }] }), "response");
		assert.equal(runtime.helpers.flattenText({ text: "d" }), "d");
		assert.equal(runtime.helpers.flattenText({ content: "e" }), "e");
		assert.equal(runtime.helpers.flattenText(10), "");
	} finally {
		destroy();
	}
});

test("outputDelta selects output_text then text then flattened content", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.equal(runtime.helpers.outputDelta({ output_text: "a", text: "b" }), "a");
		assert.equal(runtime.helpers.outputDelta({ text: "b" }), "b");
		assert.equal(runtime.helpers.outputDelta({ content: [{ text: "c" }] }), "c");
		assert.equal(runtime.helpers.outputDelta({ response: "d" }), "d");
		assert.equal(runtime.helpers.outputDelta(null), "");
	} finally {
		destroy();
	}
});

test("thinkingDelta resolves direct and nested reasoning fields", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.equal(runtime.helpers.thinkingDelta({ reasoning_content: "a" }), "a");
		assert.equal(runtime.helpers.thinkingDelta({ reasoning: "b" }), "b");
		assert.equal(runtime.helpers.thinkingDelta({ thinking: "c" }), "c");
		assert.equal(runtime.helpers.thinkingDelta({ reasoning: [{ text: "d" }] }), "d");
		assert.equal(runtime.helpers.thinkingDelta({ think: "e" }), "e");
		assert.equal(runtime.helpers.thinkingDelta({}), "");
	} finally {
		destroy();
	}
});

test("normalizeUsage preserves input, output, and cache accounting when reported", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.deepEqual(runtime.helpers.normalizeUsage({
			prompt_tokens: null,
			input_tokens: 10,
			completion_tokens: "",
			output_tokens: 5,
			total_tokens: 15,
			prompt_tokens_details: { cached_tokens: 4 }
		}), {
			input_tokens: 10,
			output_tokens: 5,
			total_tokens: 15,
			cached_input_tokens: 4,
			cache_write_input_tokens: null,
			cache_details_reported: true
		});
	} finally {
		destroy();
	}
});

test("splitToTokenChunks keeps spaces between words", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		assert.deepEqual(runtime.helpers.splitToTokenChunks("hello world"), ["hello ", "world"]);
		assert.deepEqual(runtime.helpers.splitToTokenChunks("single"), ["single"]);
		assert.deepEqual(runtime.helpers.splitToTokenChunks(""), []);
	} finally {
		destroy();
	}
});

test("chatRequestPayload applies defaults and validates normalized messages", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const payload = runtime.helpers.chatRequestPayload(
			{ messages: [{ role: "user", content: "hi" }] },
			{ id: "profile-1" }
		);
		assert.equal(payload.model, "gpt-4.1-mini");
		assert.equal(payload.temperature, 0.2);
		assert.equal(payload.max_tokens, 12000);
		assert.equal(payload.offline_fixture, false);
		assert.equal(payload.messages.length, 1);
		assert.deepEqual(payload.tools, []);
		const withTool = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "browser-use", description: "Browse", parameters: { type: "object" } } }]
		}, {});
		assert.equal(withTool.tools[0].function.name, "browser-use");
		const unavailableBrowser = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "browser_open", parameters: {} } }]
		}, {});
		assert.deepEqual(unavailableBrowser.tools, []);
		const duplicateTools = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [
				{ type: "function", function: { name: "same", parameters: {} } },
				{ type: "function", function: { name: "same", parameters: {} } }
			]
		}, {});
		assert.equal(duplicateTools.tools.length, 1);
		assert.throws(
			() => runtime.helpers.chatRequestPayload({ messages: [{ role: "tool", content: "x" }] }, {}),
			/At least one message is required/
		);
		assert.deepEqual(
			runtime.helpers.parseBridgeStdout("bridge log\n{\n  \"ok\": true,\n  \"output_text\": \"complete\"\n}\n"),
			{ ok: true, output_text: "complete" }
		);
	} finally {
		destroy();
	}
});

test("tool execution errors name requested functions without exposing arguments", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const payload = runtime.helpers.toolExecutionUnavailablePayload([
			{ id: "call-1", function: { name: "web_search", arguments: "{\"query\":\"secret\"}" } },
			{ id: "call-2", function: { name: "web_search" } },
			{ name: "browser_use" }
		]);
		assert.equal(payload.code, "tool_execution_unavailable");
		assert.equal(payload.retryable, false);
		assert.deepEqual(payload.tool_names, ["web_search", "browser_use"]);
		assert.equal(payload.message.includes("secret"), false);
	} finally {
		destroy();
	}
});

test("browser_use always advertises the compatibility session contract", () => {
	const { runtime, destroy } = createIsolatedRuntime({
		browserRuntime: {
			canExecute: () => true,
			status: () => ({ enabled: true, available: true, backend: "playwright-chromium", headless: true, action_policy: "read-only", unavailable_reason: null }),
			execute: async () => ({}),
			close: async () => {}
		}
	});
	try {
		const payload = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "browser_use", parameters: { type: "object", properties: { action: { type: "string" } } } } }]
		}, {});
		const parameters = payload.tools[0].function.parameters;
		assert.ok(parameters.properties.session_id);
		assert.ok(parameters.properties.url);
		assert.ok(parameters.properties.action.enum.includes("screenshot"));
	} finally {
		destroy();
	}
});

test("mergeToolCallChunks joins streamed JSON arguments and formats Ollama tool messages", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const calls = runtime.helpers.mergeToolCallChunks([
			{ index: 0, id: "call-1", function: { name: "web_search", arguments: "{\"query\":" } },
			{ index: 0, function: { arguments: "\"Kujo\"}" } }
		], 2);
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0].function.arguments, { query: "Kujo" });
		assert.deepEqual(runtime.helpers.providerToolCallMessage(calls, "", "plan", true), {
			role: "assistant",
			content: "",
			thinking: "plan",
			tool_calls: [{
				type: "function",
				function: { index: 0, name: "web_search", arguments: { query: "Kujo" } }
			}]
		});
		assert.equal(runtime.helpers.providerToolResultMessage(calls[0], { results: [] }, true).tool_name, "web_search");
	} finally {
		destroy();
	}
});

test("executeWebSearchTool validates arguments and bounds Ollama results", async () => {
	let observed = null;
	const { runtime, destroy } = createIsolatedRuntime({
		fetchFn: async (url, options) => {
			observed = { url, options };
			return {
				ok: true,
				status: 200,
				async text() {
					return JSON.stringify({ results: [{ title: "Result", url: "https://example.com", content: "Evidence" }] });
				}
			};
		}
	});
	try {
		const result = await runtime.helpers.executeWebSearchTool({ query: "Kujo", max_results: 3 }, "key", new AbortController().signal);
		assert.equal(observed.url, "https://ollama.com/api/web_search");
		assert.equal(JSON.parse(observed.options.body).max_results, 3);
		assert.equal(result.results[0].content, "Evidence");
		await assert.rejects(
			() => runtime.helpers.executeWebSearchTool({}, "key", new AbortController().signal),
			/query must contain/
		);
	} finally {
		destroy();
	}
});

test("readState contains seeded defaults on new database", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		assert.equal(Array.isArray(state.settings.profiles), true);
		assert.equal(state.settings.profiles.length > 0, true);
		assert.equal(Array.isArray(state.chats), true);
		assert.equal(state.chats.length > 0, true);
		assert.equal(typeof state.activeChatId, "string");
	} finally {
		destroy();
	}
});

test("writeState falls back pane profile_id to an existing profile", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		const fallbackProfileId = state.settings.profiles[0].id;
		state.chats[0].panes[0].profile_id = "missing-profile";
		runtime.helpers.writeState(state);

		const after = runtime.helpers.readState();
		assert.equal(after.chats[0].panes[0].profile_id, fallbackProfileId);
	} finally {
		destroy();
	}
});

test("writeState persists chat title and settings values", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		state.chats[0].title = "Renamed Chat";
		state.settings.temperature = 0.8;
		state.settings.maxTokens = 1200;
		state.settings.defaultProfileId = state.settings.profiles[0].id;
		state.settings.defaultModel = "gpt-4.1-mini";
		state.settings.agentInstructions = "Use concise responses and finish with a durable note.";
		state.settings.agentInstructionProfiles = [{ id: "coding-models", models_csv: "gpt-4.1", instructions: "Use code-focused instructions." }];
		state.searchQuery = "abc";
		runtime.helpers.writeState(state);
		const after = runtime.helpers.readState();
		assert.equal(after.chats[0].title, "Renamed Chat");
		assert.equal(after.settings.temperature, 0.8);
		assert.equal(after.settings.maxTokens, 1200);
		assert.equal(after.settings.defaultProfileId, state.settings.defaultProfileId);
		assert.equal(after.settings.defaultModel, "gpt-4.1-mini");
		assert.equal(after.settings.agentInstructions, "Use concise responses and finish with a durable note.");
		assert.deepEqual(after.settings.agentInstructionProfiles, state.settings.agentInstructionProfiles);
		assert.equal(after.searchQuery, "abc");
		state.settings.tools = [{ id: "tool-1", name: "browser_use", enabled: true, parameters_json: "{}" }];
		state.stateVersion = after.stateVersion;
		runtime.helpers.writeState(state);
		assert.equal(runtime.helpers.readState().settings.tools[0].name, "browser_use");
		const legacyState = runtime.helpers.readState();
		delete legacyState.settings.defaultProfileId;
		delete legacyState.settings.defaultModel;
		runtime.helpers.writeState(legacyState);
		const afterLegacyWrite = runtime.helpers.readState();
		assert.equal(afterLegacyWrite.settings.defaultProfileId, state.settings.defaultProfileId);
		assert.equal(afterLegacyWrite.settings.defaultModel, "gpt-4.1-mini");
	} finally {
		destroy();
	}
});

test("applyStateChanges upserts messages without replacing unrelated state", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const before = runtime.helpers.readState();
		const chat = before.chats[0];
		const pane = chat.panes[0];
		const version = runtime.helpers.applyStateChanges({
			changes: [{
				type: "message_upsert",
				message: {
					id: "incremental-message",
					pane_id: pane.id,
					role: "assistant",
					content: "durable response",
					provider: "openai",
					model: "gpt-4.1",
					thinking: "",
					usage: { total_tokens: 4 },
					created_at: Date.now(),
					sort_order: 0
				}
			}]
		});
		const after = runtime.helpers.readState();
		assert.equal(version, before.stateVersion + 1);
		assert.equal(after.chats.length, before.chats.length);
		assert.equal(after.chats[0].panes[0].messages[0].content, "durable response");
	} finally {
		destroy();
	}
});

test("applyStateChanges preserves an encrypted profile key when metadata changes", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		const profile = state.settings.profiles[0];
		profile.api_key = "stored-secret";
		runtime.helpers.writeState(state);

		runtime.helpers.applyStateChanges({
			changes: [{
				type: "profile_upsert",
				profile: {
					id: profile.id,
					name: "Renamed",
					provider_id: profile.provider_id,
					base_url: profile.base_url,
					models_csv: profile.models_csv,
					sort_order: 0
				}
			}]
		});

		const row = runtime.db.prepare("SELECT * FROM profiles WHERE id = ?").get(profile.id);
		assert.equal(runtime.helpers.decryptValue(row.api_key_cipher, row.api_key_iv, row.api_key_tag), "stored-secret");
		assert.equal(row.name, "Renamed");
	} finally {
		destroy();
	}
});
