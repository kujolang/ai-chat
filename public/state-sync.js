(function attachStateSync(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	if (root) {
		root.AIChatStateSync = api;
	}
})(typeof globalThis !== "undefined" ? globalThis : this, function createStateSync() {
	function persistenceSnapshot(sourceState) {
		const source = sourceState && typeof sourceState === "object" ? sourceState : {};
		const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
		const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
		const chats = Array.isArray(source.chats) ? source.chats : [];
		const snapshot = {
			appSettings: {
				temperature: finiteNumber(settings.temperature, 0.2),
				maxTokens: finiteNumber(settings.maxTokens, 12000),
				broadcastToAllPanes: true,
				activeChatId: source.activeChatId ? String(source.activeChatId) : null,
				projectFolders: arrayClone(source.projectFolders),
				tools: arrayClone(settings.tools),
				showArchived: Boolean(source.showArchived),
				searchQuery: String(source.searchQuery || "")
			},
			profiles: [],
			chats: [],
			panes: [],
			messages: []
		};

		for (let index = 0; index < profiles.length; index += 1) {
			const profile = profiles[index] || {};
			const normalized = {
				id: String(profile.id || ""),
				name: String(profile.name || "New Profile"),
				provider_id: String(profile.provider_id || "openai"),
				base_url: String(profile.base_url || ""),
				models_csv: String(profile.models_csv || ""),
				sort_order: index
			};
			if (profile.api_key_dirty) {
				normalized.api_key = String(profile.api_key || "");
			}
			snapshot.profiles.push(normalized);
		}

		for (let chatIndex = 0; chatIndex < chats.length; chatIndex += 1) {
			const chat = chats[chatIndex] || {};
			const chatId = String(chat.id || "");
			snapshot.chats.push({
				id: chatId,
				title: String(chat.title || "Untitled Chat"),
				project_path: String(chat.projectPath || chat.project_path || ""),
				pinned: Boolean(chat.pinned),
				archived: Boolean(chat.archived),
				created_at: finiteNumber(chat.createdAt, Date.now()),
				updated_at: finiteNumber(chat.updatedAt, Date.now()),
				sort_order: chatIndex
			});

			const panes = Array.isArray(chat.panes) ? chat.panes : [];
			for (let paneIndex = 0; paneIndex < panes.length; paneIndex += 1) {
				const pane = panes[paneIndex] || {};
				const paneId = String(pane.id || "");
				snapshot.panes.push({
					id: paneId,
					chat_id: chatId,
					profile_id: String(pane.profile_id || ""),
					model: String(pane.model || ""),
					status: String(pane.status || "idle"),
					sort_order: paneIndex
				});

				const messages = Array.isArray(pane.messages) ? pane.messages : [];
				for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
					const message = messages[messageIndex] || {};
					snapshot.messages.push({
						id: String(message.id || ""),
						pane_id: paneId,
						role: String(message.role || "assistant"),
						content: String(message.content || ""),
						provider: message.provider ? String(message.provider) : null,
						model: message.model ? String(message.model) : null,
						thinking: String(message.thinking || ""),
						usage: message.usage && typeof message.usage === "object" ? cloneJson(message.usage) : null,
						created_at: finiteNumber(message.createdAt, Date.now()),
						sort_order: messageIndex
					});
				}
			}
		}

		return snapshot;
	}

	function buildChanges(previousSnapshot, nextSnapshot) {
		const previous = previousSnapshot || emptySnapshot();
		const next = nextSnapshot || emptySnapshot();
		const changes = [];

		appendUpserts(changes, "profile_upsert", previous.profiles, next.profiles, "profile");
		appendUpserts(changes, "chat_upsert", previous.chats, next.chats, "chat");
		appendUpserts(changes, "pane_upsert", previous.panes, next.panes, "pane");
		appendUpserts(changes, "message_upsert", previous.messages, next.messages, "message");

		appendDeletes(changes, "message_delete", previous.messages, next.messages, "message_id");
		appendDeletes(changes, "pane_delete", previous.panes, next.panes, "pane_id");
		appendDeletes(changes, "chat_delete", previous.chats, next.chats, "chat_id");
		appendDeletes(changes, "profile_delete", previous.profiles, next.profiles, "profile_id");

		if (!sameValue(previous.appSettings, next.appSettings)) {
			changes.push({ type: "app_settings_upsert", settings: cloneJson(next.appSettings) });
		}

		return changes;
	}

	function batchChanges(changes, maxBatchBytes, maxBatchChanges) {
		const source = Array.isArray(changes) ? changes : [];
		const limit = Math.max(16384, Number(maxBatchBytes) || 512 * 1024);
		const countLimit = Math.max(1, Number(maxBatchChanges) || 250);
		const batches = [];
		let current = [];

		for (const change of source) {
			const candidate = current.concat([change]);
			if (current.length > 0 && (candidate.length > countLimit || jsonByteLength({ changes: candidate }) > limit)) {
				batches.push(current);
				current = [change];
			} else {
				current = candidate;
			}
		}

		if (current.length > 0) {
			batches.push(current);
		}
		return batches;
	}

	function appendUpserts(target, type, previousList, nextList, field) {
		const previousById = mapById(previousList);
		for (const item of Array.isArray(nextList) ? nextList : []) {
			if (!item || !item.id) {
				continue;
			}
			const before = previousById.get(String(item.id));
			if (!before || !sameValue(before, item)) {
				target.push({ type, [field]: cloneJson(item) });
			}
		}
	}

	function appendDeletes(target, type, previousList, nextList, idField) {
		const nextById = mapById(nextList);
		for (const item of Array.isArray(previousList) ? previousList : []) {
			const id = item && item.id ? String(item.id) : "";
			if (id && !nextById.has(id)) {
				target.push({ type, [idField]: id });
			}
		}
	}

	function emptySnapshot() {
		return { appSettings: {}, profiles: [], chats: [], panes: [], messages: [] };
	}

	function mapById(list) {
		const result = new Map();
		for (const item of Array.isArray(list) ? list : []) {
			if (item && item.id) {
				result.set(String(item.id), item);
			}
		}
		return result;
	}

	function sameValue(left, right) {
		return JSON.stringify(left) === JSON.stringify(right);
	}

	function arrayClone(value) {
		return Array.isArray(value) ? cloneJson(value) : [];
	}

	function cloneJson(value) {
		return JSON.parse(JSON.stringify(value));
	}

	function finiteNumber(value, fallback) {
		const normalized = Number(value);
		return Number.isFinite(normalized) ? normalized : fallback;
	}

	function jsonByteLength(value) {
		const json = JSON.stringify(value);
		if (typeof TextEncoder === "function") {
			return new TextEncoder().encode(json).byteLength;
		}
		if (typeof Buffer === "function") {
			return Buffer.byteLength(json, "utf8");
		}
		return unescape(encodeURIComponent(json)).length;
	}

	return {
		persistenceSnapshot,
		buildChanges,
		batchChanges,
		jsonByteLength
	};
});
