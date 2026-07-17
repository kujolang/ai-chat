const assert = require("node:assert/strict");
const { test } = require("node:test");

const stateSync = require("../public/state-sync");

function baseState() {
	return {
		activeChatId: "chat-1",
		projectFolders: [],
		showArchived: false,
		searchQuery: "",
		settings: {
			temperature: 0.2,
			maxTokens: 12000,
			agentInstructions: "Be concise.",
			agentInstructionProfiles: [],
			paneProfiles: [],
			tools: [],
			profiles: [{
				id: "profile-1",
				name: "Primary",
				provider_id: "openai",
				base_url: "",
				models_csv: "gpt-4.1",
				api_key_dirty: false
			}]
		},
		chats: [{
			id: "chat-1",
			title: "Chat",
			createdAt: 100,
			updatedAt: 100,
			panes: [{
				id: "pane-1",
				profile_id: "profile-1",
				model: "gpt-4.1",
				status: "idle",
				messages: [{ id: "message-1", role: "user", content: "hello", createdAt: 101 }]
			}]
		}]
	};
}

test("state sync emits only the changed normalized entity", () => {
	const state = baseState();
	const before = stateSync.persistenceSnapshot(state);
	state.chats[0].panes[0].messages[0].content = "updated";
	const after = stateSync.persistenceSnapshot(state);
	const changes = stateSync.buildChanges(before, after);

	assert.deepEqual(changes.map((change) => change.type), ["message_upsert"]);
	assert.equal(changes[0].message.content, "updated");
});

test("state sync preserves explicit key updates and dependency-safe delete order", () => {
	const state = baseState();
	const before = stateSync.persistenceSnapshot(state);
	state.settings.profiles[0].api_key = "replacement";
	state.settings.profiles[0].api_key_dirty = true;
	state.chats = [];
	state.activeChatId = null;
	const after = stateSync.persistenceSnapshot(state);
	const changes = stateSync.buildChanges(before, after);

	assert.equal(changes[0].type, "profile_upsert");
	assert.equal(changes[0].profile.api_key, "replacement");
	assert.deepEqual(changes.slice(1).map((change) => change.type), [
		"message_delete",
		"pane_delete",
		"chat_delete",
		"app_settings_upsert"
	]);
});

test("state sync batches a large history independently of total history size", () => {
	const state = baseState();
	state.chats[0].panes[0].messages = Array.from({ length: 80 }, (_, index) => ({
		id: `message-${index}`,
		role: "assistant",
		content: "x".repeat(8192),
		createdAt: 1000 + index
	}));
	const snapshot = stateSync.persistenceSnapshot(state);
	const changes = stateSync.buildChanges(null, snapshot);
	const batches = stateSync.batchChanges(changes, 64 * 1024);

	assert.equal(stateSync.jsonByteLength({ changes }) > 512 * 1024, true);
	assert.equal(batches.length > 8, true);
	assert.equal(batches.flat().length, changes.length);
	assert.equal(batches.every((batch) => batch.length === 1 || stateSync.jsonByteLength({ changes: batch }) <= 64 * 1024), true);
});

test("state sync persists pane profiles as app settings", () => {
	const state = baseState();
	const before = stateSync.persistenceSnapshot(state);
	state.settings.paneProfiles.push({
		id: "benchmark",
		name: "Benchmark",
		panes: [{ profile_id: "profile-1", model: "gpt-4.1" }]
	});
	const after = stateSync.persistenceSnapshot(state);
	const changes = stateSync.buildChanges(before, after);

	assert.deepEqual(changes.map((change) => change.type), ["app_settings_upsert"]);
	assert.deepEqual(changes[0].settings.paneProfiles, state.settings.paneProfiles);
});

test("state sync persists agent instructions as app settings", () => {
	const state = baseState();
	const before = stateSync.persistenceSnapshot(state);
	state.settings.agentInstructions = "End completed tasks with a Strata note.";
	const changes = stateSync.buildChanges(before, stateSync.persistenceSnapshot(state));

	assert.deepEqual(changes.map((change) => change.type), ["app_settings_upsert"]);
	assert.equal(changes[0].settings.agentInstructions, state.settings.agentInstructions);
});

test("state sync persists model-specific agent instructions", () => {
	const state = baseState();
	const before = stateSync.persistenceSnapshot(state);
	state.settings.agentInstructionProfiles.push({
		id: "coding-models",
		models_csv: "gpt-4.1, claude-sonnet-4.6",
		instructions: "Prioritize concise implementation notes."
	});
	const changes = stateSync.buildChanges(before, stateSync.persistenceSnapshot(state));

	assert.deepEqual(changes.map((change) => change.type), ["app_settings_upsert"]);
	assert.deepEqual(changes[0].settings.agentInstructionProfiles, state.settings.agentInstructionProfiles);
});
