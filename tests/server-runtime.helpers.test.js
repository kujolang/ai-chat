const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");

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
		SEARXNG_BASE_URL: "",
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
		const hermes = state.settings.profiles.find((profile) => profile.provider_id === "hermes");
		const xaiOAuth = state.settings.profiles.find((profile) => profile.provider_id === "xai_oauth");
		assert.ok(openRouter);
		assert.ok(watchdog);
		assert.ok(watchdogOpenRouter);
		assert.ok(watchdogOllamaTud);
		assert.ok(hermes);
		assert.ok(xaiOAuth);
		assert.match(openRouter.models_csv, /moonshotai\/kimi-k2\.7-code/);
		assert.match(openRouter.models_csv, /openai\/gpt-4\.1-mini/);
		assert.match(watchdog.models_csv, /kimi-k3:cloud/);
		assert.match(watchdog.models_csv, /gemma4:31b/);
		assert.match(watchdog.models_csv, /mistral-large-3:675b/);
		assert.match(watchdogOpenRouter.models_csv, /moonshotai\/kimi-k2\.7-code/);
		assert.match(watchdogOllamaTud.models_csv, /kimi-k3:cloud/);
		assert.match(watchdogOllamaTud.models_csv, /mistral-large-3:675b/);
		assert.match(hermes.models_csv, /stealth\/ox-alpha/);
		assert.match(hermes.models_csv, /poolside\/laguna-s-2\.1:free/);
		assert.equal(hermes.credential_managed, true);
		assert.equal(xaiOAuth.name, "xAI Grok (X OAuth)");
		assert.match(xaiOAuth.models_csv, /grok-4\.20-0309-reasoning/);
		assert.match(xaiOAuth.models_csv, /grok-4\.6/);
		assert.equal(xaiOAuth.credential_managed, true);
	} finally {
		destroy();
	}
});

test("seeds a Codex profile from the local Codex model cache", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-codex-cache-"));
	const cachePath = path.join(tempRoot, "models_cache.json");
	fs.writeFileSync(cachePath, JSON.stringify({
		models: [
			{ slug: "gpt-5.6-sol", visibility: "list", priority: 1, supported_in_api: true },
			{ slug: "gpt-5.4", visibility: "list", priority: 2, supported_in_api: true }
		]
	}));
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			CODEX_MODEL_CACHE_PATH: cachePath
		}
	});
	try {
		const codexProfile = runtime.helpers.readState().settings.profiles.find((profile) => profile.provider_id === "codex");
		assert.ok(codexProfile);
		assert.equal(codexProfile.models_csv, "gpt-5.6-sol,gpt-5.4");
	} finally {
		destroy();
		fs.rmSync(tempRoot, { recursive: true, force: true });
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
		assert.deepEqual(runtime.helpers.providerConfig({ provider_id: "hermes" }), {
			base_url: "http://127.0.0.1:8645/v1",
			chat_path: "/chat/completions",
			transcribe_path: null,
			hermes_managed: true
		});
		assert.equal(runtime.helpers.validateProviderBaseUrl("http://127.0.0.1:8645/v1", "hermes"), "http://127.0.0.1:8645/v1");
		assert.throws(() => runtime.helpers.validateProviderBaseUrl("http://127.0.0.1:9999/v1", "hermes"), /HERMES_PROXY_URL/);
		assert.deepEqual(runtime.helpers.providerConfig({ provider_id: "xai_oauth" }), {
			base_url: "http://127.0.0.1:8646/v1",
			chat_path: "/chat/completions",
			transcribe_path: null,
			xai_oauth_managed: true
		});
		assert.equal(runtime.helpers.validateProviderBaseUrl("http://127.0.0.1:8646/v1", "xai_oauth"), "http://127.0.0.1:8646/v1");
		assert.throws(() => runtime.helpers.validateProviderBaseUrl("http://127.0.0.1:8645/v1", "xai_oauth"), /XAI_OAUTH_PROXY_URL/);
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

test("createServerRuntime exposes pane-friendly bounded tool and browser defaults", () => {
	const defaultRuntime = createIsolatedRuntime();
	try {
		assert.equal(defaultRuntime.runtime.config.maxJsonBodyBytes, 8 * 1024 * 1024);
		assert.equal(defaultRuntime.runtime.config.maxMessagesPerRequest, 2000);
		assert.equal(defaultRuntime.runtime.config.maxMessageChars, 1000000);
		assert.equal(defaultRuntime.runtime.config.maxTotalMessageChars, 4000000);
		assert.equal(defaultRuntime.runtime.config.contextCompactionEnabled, true);
		assert.equal(defaultRuntime.runtime.config.contextCompactionStrategy, "structured_excerpt_v1");
		assert.equal(defaultRuntime.runtime.config.contextCompactionTargetChars, 256 * 1024);
		assert.equal(defaultRuntime.runtime.config.contextCompactionSummaryChars, 24 * 1024);
		assert.equal(defaultRuntime.runtime.config.contextCompactionPreserveRecentMessages, 24);
		assert.equal(defaultRuntime.runtime.config.streamRequestTimeoutMs, 180000);
		assert.equal(defaultRuntime.runtime.config.toolContinuationTimeoutMs, 120000);
		assert.equal(defaultRuntime.runtime.config.maxToolRounds, 2048);
		assert.equal(defaultRuntime.runtime.config.maxToolCallsPerRequest, 16384);
		assert.equal(defaultRuntime.runtime.config.browserMaxSessions, 32);
		assert.equal(defaultRuntime.runtime.config.browserMaxSessionsPerChat, 8);
		assert.equal(defaultRuntime.runtime.config.browserMaxActionsPerRequest, 24);
		assert.equal(defaultRuntime.runtime.config.browserMaxActionsPerSession, 60);
	} finally {
		defaultRuntime.destroy();
	}

	const cappedRuntime = createIsolatedRuntime({
		envMerge: {
			STREAM_REQUEST_TIMEOUT_MS: "12345",
			MAX_TOOL_ROUNDS: "99999",
			MAX_TOOL_CALLS_PER_REQUEST: "999999",
			BROWSER_MAX_SESSIONS: "999",
			BROWSER_MAX_SESSIONS_PER_CHAT: "999"
		}
	});
	try {
		assert.equal(cappedRuntime.runtime.config.streamRequestTimeoutMs, 12345);
		assert.equal(cappedRuntime.runtime.config.toolContinuationTimeoutMs, 12345);
		assert.equal(cappedRuntime.runtime.config.maxToolRounds, 8192);
		assert.equal(cappedRuntime.runtime.config.maxToolCallsPerRequest, 65536);
		assert.equal(cappedRuntime.runtime.config.browserMaxSessions, 128);
		assert.equal(cappedRuntime.runtime.config.browserMaxSessionsPerChat, 32);
	} finally {
		cappedRuntime.destroy();
	}

	const continuationRuntime = createIsolatedRuntime({
		envMerge: {
			STREAM_REQUEST_TIMEOUT_MS: "12345",
			TOOL_CONTINUATION_TIMEOUT_MS: "67890"
		}
	});
	try {
		assert.equal(continuationRuntime.runtime.config.streamRequestTimeoutMs, 12345);
		assert.equal(continuationRuntime.runtime.config.toolContinuationTimeoutMs, 67890);
	} finally {
		continuationRuntime.destroy();
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
		assert.equal(payload.max_tokens, 24000);
		assert.equal(payload.offline_fixture, false);
		assert.equal(payload.messages.length, 2);
		assert.match(payload.messages[0].content, /Never run an `rm` command/);
		assert.match(payload.messages[0].content, /Use `system_time`/);
		assert.match(payload.messages[0].content, /Use `web_search`/);
		assert.match(payload.messages[0].content, /use `skill_list`/);
		assert.ok(payload.messages[0].content.length < 4000);
		assert.equal(payload.messages.at(-1).content, "hi");
		assert.deepEqual(payload.tools.map((tool) => tool.function.name), ["system_time"]);
		assert.equal(runtime.helpers.chatRequestPayload({ messages: [{ role: "user", content: "x".repeat(120001) }] }, {}).messages.at(-1).content.length, 120001);
		const personalized = runtime.helpers.chatRequestPayload({ user_name: "  Robert\nDeVore ", messages: [{ role: "user", content: "hi" }] }, {});
		assert.match(personalized.messages[1].content, /preferred name is "Robert DeVore"/);
		assert.throws(
			() => runtime.helpers.chatRequestPayload({ messages: [{ role: "user", content: "x".repeat(1000001) }] }, {}),
			/maximum allowed length/
		);
		const withTool = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "browser-use", description: "Browse", parameters: { type: "object" } } }]
		}, {});
		assert.ok(withTool.tools.some((tool) => tool.function.name === "browser-use"));
		const unavailableBrowser = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "browser_open", parameters: {} } }]
		}, {});
		assert.deepEqual(unavailableBrowser.tools.map((tool) => tool.function.name), ["system_time"]);
		const duplicateTools = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "hi" }],
			tools: [
				{ type: "function", function: { name: "same", parameters: {} } },
				{ type: "function", function: { name: "same", parameters: {} } }
			]
		}, {});
		assert.equal(duplicateTools.tools.filter((tool) => tool.function.name === "same").length, 1);
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

test("chatRequestPayload keeps long saved chats usable with compacted older context", () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			MAX_MESSAGES_PER_REQUEST: "5",
			MAX_MESSAGE_CHARS: "1200",
			MAX_TOTAL_MESSAGE_CHARS: "3600",
			CONTEXT_COMPACTION_TARGET_CHARS: "3500",
			CONTEXT_COMPACTION_SUMMARY_CHARS: "220",
			CONTEXT_COMPACTION_PRESERVE_RECENT_MESSAGES: "2"
		}
	});
	try {
		const payload = runtime.helpers.chatRequestPayload({
			messages: [
				{ role: "system", content: "Keep this instruction." },
				{ role: "user", content: "old user context ".repeat(55) },
				{ role: "assistant", content: "old assistant context ".repeat(45) },
				{ role: "user", content: "recent question" },
				{ role: "assistant", content: "recent answer" },
				{ role: "user", content: "latest question" }
			]
		}, { id: "profile-1" });

		assert.equal(payload.messages[0].role, "system");
		assert.equal(payload.messages.at(-1).content, "latest question");
		assert.ok(payload.messages.length <= 5);
		assert.ok(payload.messages.reduce((total, message) => total + message.content.length, 0) <= 3600);
		assert.ok(payload.messages.some((message) => message.content.includes("[Compacted earlier conversation summary]")));
	} finally {
		destroy();
	}
});

test("compactConversationContext preserves recent turns and inserts a structured summary", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const result = runtime.helpers.compactConversationContext([
			{ role: "system", content: "System instruction" },
			{ role: "user", content: "Older user discovery notes ".repeat(12) },
			{ role: "assistant", content: "Older assistant analysis ".repeat(12) },
			{ role: "tool", content: "{\"results\":" + "\"x\"".repeat(200) + "}" },
			{ role: "user", content: "Recent follow-up" },
			{ role: "assistant", content: "Recent answer" },
			{ role: "user", content: "Latest ask" }
		], {
			requiredPrefixCount: 1,
			maxMessages: 6,
			maxChars: 600,
			targetChars: 420,
			summaryChars: 220,
			preserveRecentMessages: 2,
			strategy: "structured_excerpt_v1"
		});
		assert.equal(result.compacted, true);
		assert.equal(result.messages[0].role, "system");
		assert.equal(result.messages.at(-1).content, "Latest ask");
		assert.ok(result.messages.some((message) => message.content.includes("[Compacted earlier conversation summary]")));
		assert.ok(result.messages.reduce((sum, message) => sum + String(message.content || "").length, 0) <= 600);
	} finally {
		destroy();
	}
});

test("chatRequestPayload augments stale requests with enabled runtime presets from settings", () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
			AI_CHAT_LOCAL_WORKSPACE_ROOTS: path.resolve(__dirname, ".."),
			AI_CHAT_LOCAL_WRITE_ENABLED: "1",
			AI_CHAT_LOCAL_SHELL_ENABLED: "1",
			AI_CHAT_LOCAL_SHELL_ALLOWLIST: "git,rg,ls,pwd,npm"
		}
	});
	try {
		const state = runtime.helpers.readState();
		state.settings.tools = [
			{ id: "skill-read", name: "skill_read", description: "Read skills", parameters_json: "{}", enabled: true, kind: "preset" },
			{ id: "local-shell", name: "local_shell", description: "Run shell", parameters_json: "{}", enabled: true, kind: "preset" },
			{ id: "local-write", name: "local_file_write", description: "Write file", parameters_json: "{}", enabled: true, kind: "preset" }
		];
		runtime.helpers.writeState(state);

		const payload = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "Can you save memory?" }],
			tools: [{ type: "function", function: { name: "skill_read", parameters: { type: "object", properties: {} } } }]
		}, {});
		const names = payload.tools.map((tool) => tool.function.name);
		assert.ok(names.includes("system_time"));
		assert.ok(names.includes("skill_read"));
		assert.ok(names.includes("local_shell"));
		assert.ok(names.includes("local_file_write"));
		assert.equal(payload.tools.find((tool) => tool.function.name === "local_shell").function.parameters.properties.command.type, "string");
	} finally {
		destroy();
	}
});

test("interactive chat requests always advertise the read-only system time tool", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const payload = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "What time is it?" }],
			tools: []
		}, {});

		assert.deepEqual(payload.tools.map((tool) => tool.function.name), ["system_time"]);
	} finally {
		destroy();
	}
});

test("chat requests with saved runtime presets disabled keep an explicit empty tool boundary", () => {
	const { runtime, destroy } = createIsolatedRuntime({
		envMerge: {
			AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
			AI_CHAT_LOCAL_WORKSPACE_ROOTS: path.resolve(__dirname, ".."),
			AI_CHAT_LOCAL_SHELL_ENABLED: "1",
			AI_CHAT_LOCAL_SHELL_ALLOWLIST: "git"
		}
	});
	try {
		const state = runtime.helpers.readState();
		state.settings.tools = [
			{ id: "local-shell", name: "local_shell", description: "Run shell", parameters_json: "{}", enabled: true, kind: "preset" }
		];
		runtime.helpers.writeState(state);
		const payload = runtime.helpers.chatRequestPayload({
			messages: [{ role: "user", content: "Do not use tools." }],
			tools: [],
			include_saved_runtime_presets: false
		}, {});
		assert.deepEqual(payload.tools, []);
		assert.deepEqual([...runtime.helpers.effectiveToolAllowlist(payload.tools)], []);
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

test("local read telemetry is bounded and records recovery metadata without paths", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const argumentsSummary = runtime.helpers.summarizeToolArguments("local_file_read", {
			path: "private/project/README.md", offset: 3, column: 4, limit: 10, max_bytes: 4096, max_line_chars: 200
		});
		assert.equal(argumentsSummary.path, undefined);
		assert.equal(argumentsSummary.path_chars, "private/project/README.md".length);
		assert.equal(argumentsSummary.offset, 3);
		assert.equal(argumentsSummary.column, 4);
		const resultSummary = runtime.helpers.summarizeToolResult("local_file_read", {
			content: "3\tline",
			truncated: true,
			complete: false,
			next_offset: 4,
			next_column: 1,
			meta: { source_bytes: 9000, returned_bytes: 6, lines_returned: 1, lines_scanned: 3, truncation_reason: "line_limit", clamped_lines: [] }
		});
		assert.deepEqual(resultSummary.local_read, {
			content_chars: 6,
			source_bytes: 9000,
			returned_bytes: 6,
			lines_returned: 1,
			lines_scanned: 3,
			truncation_reason: "line_limit",
			clamped_line_count: 0,
			empty: false,
			past_eof: false,
			deduplicated: false,
			complete: false,
			next_offset: 4,
			next_column: 1
		});
	} finally {
		destroy();
	}
});

test("tool context compaction preserves provider protocol while bounding old results", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const messages = [
			{ role: "user", content: "research" },
			{ role: "tool", tool_call_id: "one", content: "a".repeat(1200) },
			{ role: "tool", tool_call_id: "two", content: "b".repeat(1200) },
			{ role: "tool", tool_call_id: "three", content: "c".repeat(1200) }
		];
		const compacted = runtime.helpers.compactProviderToolContext(messages, 1700);
		assert.equal(compacted, 2);
		assert.match(messages[1].content, /"compacted":true/);
		assert.match(messages[2].content, /"compacted":true/);
		assert.equal(messages[3].content.length, 1200);
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
		const browserTool = payload.tools.find((tool) => tool.function.name === "browser_use");
		assert.ok(browserTool);
		const parameters = browserTool.function.parameters;
		assert.ok(parameters.properties.session_id);
		assert.ok(parameters.properties.url);
		assert.equal(parameters.properties.url.pattern, "^https?://");
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

test("mergeToolCallChunks accepts expected name fragments and rejects concatenated tool names", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const fragmented = runtime.helpers.mergeToolCallChunks([
			{ index: 0, id: "call-fragmented", function: { name: "web_", arguments: "{\"query\":" } },
			{ index: 0, function: { name: "search", arguments: "\"Kujo\"}" } }
		], 1, { expectedNames: ["web_search"] });
		assert.equal(fragmented[0].function.name, "web_search");
		assert.equal(fragmented[0].function.invalid_name, false);

		const malformed = runtime.helpers.mergeToolCallChunks([
			{ index: 0, id: "call-malformed", function: { name: "local_file_read", arguments: "{}" } },
			{ index: 0, function: { name: "local_file_list" } }
		], 1, { expectedNames: ["local_file_read"] });
		assert.equal(malformed[0].function.name, "local_file_readlocal_file_list");
		assert.equal(malformed[0].function.invalid_name, true);
		assert.deepEqual(runtime.helpers.authorizeToolCall(malformed[0], new Set(["local_file_read"])), {
			authorized: false,
			reason: "malformed",
			raw_name: "local_file_readlocal_file_list",
			canonical_name: ""
		});
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
		assert.match(state.chats[0].routeId, /^[a-f0-9]{48}$/);
		assert.notEqual(state.chats[0].routeId, state.chats[0].id);
		assert.equal(typeof state.activeChatId, "string");
	} finally {
		destroy();
	}
});

test("startup backfills opaque route ids for existing chats", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-route-migration-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	const dbPath = path.join(tempRoot, "data", "test.db");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	const legacyDb = new Database(dbPath);
	legacyDb.exec(`
		CREATE TABLE chats (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			project_path TEXT NOT NULL DEFAULT '',
			pinned INTEGER NOT NULL DEFAULT 0,
			archived INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			sort_order INTEGER NOT NULL DEFAULT 0
		);
		INSERT INTO chats (id, title, created_at, updated_at) VALUES ('legacy-chat', 'Legacy Chat', 1, 1);
	`);
	legacyDb.close();

	const runtimeOptions = {
		env: {
			...process.env,
			ENCRYPTION_SECRET: "unit-test-secret",
			API_AUTH_TOKEN: "unit-test-token",
			AI_SDK_PATH: sdkPath,
			DB_PATH: dbPath,
			DB_BACKUP_DIR: path.join(tempRoot, "backups"),
			PORT: "0",
			KUJO_BIN: "/usr/bin/false"
		},
		projectRoot: path.resolve(__dirname, "..")
	};
	let runtime = createServerRuntime(runtimeOptions);
	try {
		const chat = runtime.helpers.readState().chats.find((candidate) => candidate.id === "legacy-chat");
		assert.ok(chat);
		assert.match(chat.routeId, /^[a-f0-9]{48}$/);
		assert.notEqual(chat.routeId, chat.id);
		const migratedRouteId = chat.routeId;
		runtime.close();
		runtime = createServerRuntime(runtimeOptions);
		const reopenedChat = runtime.helpers.readState().chats.find((candidate) => candidate.id === "legacy-chat");
		assert.equal(reopenedChat.routeId, migratedRouteId);
	} finally {
		runtime.close();
		fs.rmSync(tempRoot, { recursive: true, force: true });
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

test("writeState persists provider profile order", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		const expectedIds = state.settings.profiles.map((profile) => profile.id).reverse();
		state.settings.profiles.reverse();
		runtime.helpers.writeState(state);
		const after = runtime.helpers.readState();
		assert.deepEqual(after.settings.profiles.map((profile) => profile.id), expectedIds);
	} finally {
		destroy();
	}
});

test("writeState persists chat title and settings values", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const state = runtime.helpers.readState();
		const routeId = state.chats[0].routeId;
		state.chats[0].title = "Renamed Chat";
		state.settings.temperature = 0.8;
		state.settings.maxTokens = 1200;
		state.settings.defaultProfileId = state.settings.profiles[0].id;
		state.settings.defaultModel = "gpt-4.1-mini";
		state.settings.userName = "Robert DeVore";
		state.settings.agentInstructions = "Use concise responses and finish with a durable note.";
		state.settings.agentInstructionProfiles = [{ id: "coding-models", models_csv: "gpt-4.1", instructions: "Use code-focused instructions.", enabled: false }];
		state.searchQuery = "abc";
		runtime.helpers.writeState(state);
		const after = runtime.helpers.readState();
		assert.equal(after.chats[0].title, "Renamed Chat");
		assert.equal(after.chats[0].routeId, routeId);
		assert.equal(after.settings.temperature, 0.8);
		assert.equal(after.settings.maxTokens, 1200);
		assert.equal(after.settings.defaultProfileId, state.settings.defaultProfileId);
		assert.equal(after.settings.defaultModel, "gpt-4.1-mini");
		assert.equal(after.settings.userName, "Robert DeVore");
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
		delete legacyState.settings.userName;
		runtime.helpers.writeState(legacyState);
		const afterLegacyWrite = runtime.helpers.readState();
		assert.equal(afterLegacyWrite.settings.defaultProfileId, state.settings.defaultProfileId);
		assert.equal(afterLegacyWrite.settings.defaultModel, "gpt-4.1-mini");
		assert.equal(afterLegacyWrite.settings.userName, "Robert DeVore");
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
					usage: { total_tokens: 4, thinking_duration_ms: 746000, response_time_ms: 760000, tool_activity: ["Searched docs · done"] },
					created_at: Date.now(),
					sort_order: 0
				}
			}]
		});
		const after = runtime.helpers.readState();
		assert.equal(version, before.stateVersion + 1);
		assert.equal(after.chats.length, before.chats.length);
		assert.equal(after.chats[0].panes[0].messages[0].content, "durable response");
		assert.equal(after.chats[0].panes[0].messages[0].thinking_duration_ms, 746000);
		assert.equal(after.chats[0].panes[0].messages[0].response_time_ms, 760000);
		assert.deepEqual(after.chats[0].panes[0].messages[0].tool_activity, ["Searched docs · done"]);
	} finally {
		destroy();
	}
});

test("readState can omit message bodies while preserving counts for lazy chat loading", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const seeded = runtime.helpers.readState();
		const paneId = seeded.chats[0].panes[0].id;
		runtime.helpers.applyStateChanges({
			changes: [{
				type: "message_upsert",
				message: {
					id: "lazy-message",
					pane_id: paneId,
					role: "user",
					content: "hydrate me later",
					thinking: "",
					usage: null,
					created_at: Date.now(),
					sort_order: 0
				}
			}]
		});

		const summary = runtime.helpers.readState({ includeMessages: false });
		assert.equal(summary.chats[0].panes[0].messages.length, 0);
		assert.equal(summary.chats[0].panes[0].messageCount, 1);

		const chat = runtime.helpers.readChat(summary.chats[0].id);
		assert.equal(chat.panes[0].messages.length, 1);
		assert.equal(chat.panes[0].messages[0].content, "hydrate me later");
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
