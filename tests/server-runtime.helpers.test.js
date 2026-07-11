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
		KUJO_BIN: "/usr/bin/false"
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

test("normalizeMessages keeps only supported roles and trims role", () => {
	const { runtime, destroy } = createIsolatedRuntime();
	try {
		const normalized = runtime.helpers.normalizeMessages([
			{ role: " user ", content: 100 },
			{ role: "assistant", content: "ok" },
			{ role: "tool", content: "skip" },
			null,
			"bad"
		]);
		assert.deepEqual(normalized, [
			{ role: "user", content: "100" },
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
			prompt_tokens: 10,
			completion_tokens: 5,
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
		assert.throws(
			() => runtime.helpers.chatRequestPayload({ messages: [{ role: "tool", content: "x" }] }, {}),
			/At least one message is required/
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
		state.searchQuery = "abc";
		runtime.helpers.writeState(state);
		const after = runtime.helpers.readState();
		assert.equal(after.chats[0].title, "Renamed Chat");
		assert.equal(after.settings.temperature, 0.8);
		assert.equal(after.settings.maxTokens, 1200);
		assert.equal(after.searchQuery, "abc");
		state.settings.tools = [{ id: "tool-1", name: "browser_use", enabled: true, parameters_json: "{}" }];
		state.stateVersion = after.stateVersion;
		runtime.helpers.writeState(state);
		assert.equal(runtime.helpers.readState().settings.tools[0].name, "browser_use");
	} finally {
		destroy();
	}
});
