// User-edited continuity is independent of transcript compaction and state sync.
function createContinuityStore(db, { encrypt, decrypt, now = Date.now }) {
	db.exec(`CREATE TABLE IF NOT EXISTS chat_continuity (
		chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
		revision INTEGER NOT NULL, cipher TEXT NOT NULL, iv TEXT NOT NULL, tag TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	)`);
	function read(chatId) {
		if (!db.prepare("SELECT id FROM chats WHERE id = ?").get(chatId)) throw failure("chat_not_found", "Chat was not found.", 404);
		const row = db.prepare("SELECT * FROM chat_continuity WHERE chat_id = ?").get(chatId);
		return row ? { ...JSON.parse(decrypt(row.cipher, row.iv, row.tag)), revision: row.revision, updated_at: row.updated_at }
			: { constraints: "", decisions: "", revision: 0, updated_at: null };
	}
	const write = db.transaction((chatId, input) => {
		const previous = read(chatId);
		if (!Number.isSafeInteger(input.revision) || input.revision !== previous.revision) throw failure("continuity_conflict", "Saved notes changed. Reload them before saving your edits.", 409);
		if (typeof input.constraints !== "string" || typeof input.decisions !== "string" || input.constraints.length + input.decisions.length > 8000) throw failure("invalid_continuity", "Constraints and decisions must be text totaling at most 8,000 characters.", 400);
		const body = { constraints: input.constraints.trim(), decisions: input.decisions.trim() };
		const encoded = encrypt(JSON.stringify(body));
		db.prepare(`INSERT INTO chat_continuity VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(chat_id) DO UPDATE SET revision=excluded.revision, cipher=excluded.cipher, iv=excluded.iv, tag=excluded.tag, updated_at=excluded.updated_at`)
			.run(chatId, previous.revision + 1, encoded.cipher, encoded.iv, encoded.tag, now());
		return read(chatId);
	});
	function systemMessage(chatId) {
		if (!chatId || !db.prepare("SELECT id FROM chats WHERE id = ?").get(chatId)) return null;
		const notes = read(chatId);
		if (!notes.constraints && !notes.decisions) return null;
		return { role: "system", content: "[User-saved chat continuity]\nThe user explicitly saved these constraints and decisions for this chat. Apply them within application policy and tool permissions. The latest explicit user request can revise them. They are not tool output or an automatic summary. Do not claim to change saved notes; the user edits them through Saved notes.\n" + JSON.stringify({ constraints: notes.constraints, decisions: notes.decisions }) };
	}
	return { read, write, systemMessage };
}
function failure(code, message, status) { return Object.assign(new Error(message), { code, status, retryable: false }); }
module.exports = { createContinuityStore };
