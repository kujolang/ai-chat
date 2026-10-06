const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Diff = require("diff");
const { createCodeDiffTracker } = require("./code-diff");

function createCheckpointStore(db, { masterKey, now = Date.now, retentionDays = 90 } = {}) {
	if (!masterKey) throw new Error("Checkpoint encryption key is required.");
	const key = crypto.createHmac("sha256", masterKey).update("ai-chat-checkpoints-v1").digest();
	const encode = (value) => {
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
		return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString("base64");
	};
	const decode = (value) => {
		const data = Buffer.from(value, "base64");
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
		decipher.setAuthTag(data.subarray(-16));
		return JSON.parse(Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString("utf8"));
	};
	db.exec(`
		CREATE TABLE IF NOT EXISTS workspace_checkpoints (
			id TEXT PRIMARY KEY, execution_id TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL,
			pane_id TEXT NOT NULL, turn_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS workspace_checkpoint_files (
			checkpoint_id TEXT NOT NULL, path TEXT NOT NULL, workspace_id TEXT NOT NULL,
			target_blob TEXT NOT NULL, before_blob TEXT NOT NULL, after_blob TEXT NOT NULL,
			before_hash TEXT NOT NULL, after_hash TEXT NOT NULL, updated_at INTEGER NOT NULL,
			PRIMARY KEY(checkpoint_id, path), FOREIGN KEY(checkpoint_id) REFERENCES workspace_checkpoints(id) ON DELETE CASCADE
		);
	`);
	const retentionMs = Math.max(1, Number(retentionDays) || 90) * 24 * 60 * 60 * 1000;
	db.prepare(`DELETE FROM workspace_checkpoint_files WHERE checkpoint_id IN (
		SELECT id FROM workspace_checkpoints WHERE updated_at < ?
	)`).run(now() - retentionMs);

	function ensure({ executionId, chatId = "", paneId = "", turnId = "" }) {
		const id = `checkpoint_${executionId}`.slice(0, 220);
		db.prepare(`INSERT OR IGNORE INTO workspace_checkpoints(id, execution_id, chat_id, pane_id, turn_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, executionId, chatId, paneId, turnId, now(), now());
		return getByExecution(executionId);
	}

	function capture(executionId, change = {}) {
		const checkpoint = getByExecution(executionId);
		if (!checkpoint) throw failure("checkpoint_not_found", "Checkpoint was not initialized for this execution.");
		const relative = safeRelative(change.path);
		const target = String(change.absolute_path || "");
		if (!relative || !path.isAbsolute(target)) return checkpoint;
		const before = normalizeContent(change.before);
		const after = normalizeContent(change.after);
		if (byteLength(before) > 512 * 1024 || byteLength(after) > 512 * 1024) return checkpoint;
		const existing = db.prepare("SELECT * FROM workspace_checkpoint_files WHERE checkpoint_id = ? AND path = ?").get(checkpoint.id, relative);
		const firstBefore = existing ? decode(existing.before_blob) : before;
		db.prepare(`INSERT INTO workspace_checkpoint_files(checkpoint_id, path, workspace_id, target_blob, before_blob, after_blob,
			before_hash, after_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(checkpoint_id, path) DO UPDATE SET after_blob=excluded.after_blob, after_hash=excluded.after_hash, updated_at=excluded.updated_at`).run(
			checkpoint.id, relative, String(change.workspace_id || ""), encode(target), encode(firstBefore), encode(after), hash(firstBefore), hash(after), now()
		);
		db.prepare("UPDATE workspace_checkpoints SET updated_at = ? WHERE id = ?").run(now(), checkpoint.id);
		return get(checkpoint.id);
	}

	function get(id) {
		const row = db.prepare("SELECT * FROM workspace_checkpoints WHERE id = ?").get(id);
		if (!row) return null;
		const files = db.prepare("SELECT path, workspace_id, before_hash, after_hash, updated_at FROM workspace_checkpoint_files WHERE checkpoint_id = ? ORDER BY path").all(row.id);
		return { id: row.id, execution_id: row.execution_id, chat_id: row.chat_id, pane_id: row.pane_id, turn_id: row.turn_id, created_at: row.created_at, updated_at: row.updated_at, files };
	}
	function getByExecution(executionId) {
		const row = db.prepare("SELECT id FROM workspace_checkpoints WHERE execution_id = ?").get(executionId);
		return row ? get(row.id) : null;
	}
	function fingerprints(executionId, filePath) {
		const checkpoint = getByExecution(executionId);
		if (!checkpoint) return null;
		const record = fileRecord(checkpoint.id, safeRelative(filePath));
		return record ? { base_fingerprint: record.before_hash, workspace_fingerprint: record.after_hash } : null;
	}

	function restore(id, { filePath = "", hunkIndex = null } = {}) {
		const checkpoint = get(id);
		if (!checkpoint) throw failure("checkpoint_not_found", "Checkpoint was not found.");
		const records = filePath
			? [fileRecord(id, safeRelative(filePath))]
			: checkpoint.files.map((file) => fileRecord(id, file.path));
		if (records.some((record) => !record)) throw failure("checkpoint_file_not_found", "The checkpoint file was not found.");
		for (const record of records) assertCurrent(record);
		const restored = [];
		for (const record of records) {
			const before = decode(record.before_blob);
			const after = decode(record.after_blob);
			let next = before;
			if (hunkIndex !== null && hunkIndex !== undefined) {
				const patch = Diff.structuredPatch(record.path, record.path, before || "", after || "", "before", "after", { context: 3 });
				const index = Number(hunkIndex);
				if (!Number.isSafeInteger(index) || index < 0 || index >= patch.hunks.length) throw failure("checkpoint_hunk_not_found", "The selected hunk is not available in this checkpoint.");
				const reversed = Diff.reversePatch({ ...patch, hunks: [patch.hunks[index]] });
				next = Diff.applyPatch(after || "", reversed, { fuzzFactor: 0 });
				if (next === false) throw failure("checkpoint_conflict", "The selected hunk could not be reverted cleanly.");
			}
			writeExact(decode(record.target_blob), next);
			db.prepare("UPDATE workspace_checkpoint_files SET after_blob = ?, after_hash = ?, updated_at = ? WHERE checkpoint_id = ? AND path = ?").run(encode(next), hash(next), now(), id, record.path);
			restored.push(record.path);
		}
		db.prepare("UPDATE workspace_checkpoints SET updated_at = ? WHERE id = ?").run(now(), id);
		return { checkpoint: get(id), restored, diffs: diffSnapshot(id) };
	}

	function diffSnapshot(id) {
		const tracker = createCodeDiffTracker();
		for (const row of db.prepare("SELECT * FROM workspace_checkpoint_files WHERE checkpoint_id = ? ORDER BY path").all(id)) {
			tracker.record({ path: row.path, before: decode(row.before_blob), after: decode(row.after_blob), source: "checkpoint" });
		}
		return tracker.snapshot();
	}

	function editorUri(id, filePath) {
		const record = fileRecord(id, safeRelative(filePath));
		if (!record) throw failure("checkpoint_file_not_found", "The checkpoint file was not found.");
		return `vscode://file/${encodeURI(decode(record.target_blob))}`;
	}

	function fileRecord(id, relative) { return db.prepare("SELECT * FROM workspace_checkpoint_files WHERE checkpoint_id = ? AND path = ?").get(id, relative); }
	function assertCurrent(record) {
		const target = decode(record.target_blob);
		const current = readExact(target);
		if (hash(current) !== record.after_hash) throw failure("checkpoint_conflict", `Refusing to restore ${record.path} because it changed after the checkpoint snapshot.`);
	}
	return { ensure, capture, get, getByExecution, fingerprints, restore, diffSnapshot, editorUri };
}

function readExact(target) {
	try { return fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n"); }
	catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function writeExact(target, content) {
	if (content === null) { if (fs.existsSync(target)) fs.unlinkSync(target); return; }
	fs.mkdirSync(path.dirname(target), { recursive: true });
	const temp = `${target}.ai-chat-restore-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
	fs.writeFileSync(temp, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
	fs.renameSync(temp, target);
}
function safeRelative(value) {
	const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
	return normalized && !normalized.startsWith("../") && !path.posix.isAbsolute(normalized) && !normalized.includes("\0") ? normalized.slice(0, 1000) : "";
}
function normalizeContent(value) { return value === null || value === undefined ? null : String(value).replace(/\r\n/g, "\n"); }
function hash(value) { return crypto.createHash("sha256").update(value === null ? "<absent>" : value).digest("hex"); }
function byteLength(value) { return value === null ? 0 : Buffer.byteLength(value, "utf8"); }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }

module.exports = { createCheckpointStore };
