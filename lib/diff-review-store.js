function createDiffReviewStore(db, { now = Date.now } = {}) {
	db.exec(`CREATE TABLE IF NOT EXISTS diff_reviews (
		execution_id TEXT NOT NULL, path TEXT NOT NULL, hunk_index INTEGER NOT NULL DEFAULT -1,
		status TEXT NOT NULL DEFAULT 'unreviewed', comment TEXT NOT NULL DEFAULT '',
		base_fingerprint TEXT NOT NULL DEFAULT '', workspace_fingerprint TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
		PRIMARY KEY(execution_id, path, hunk_index)
	)`);
	ensureColumn(db, "diff_reviews", "base_fingerprint", "TEXT NOT NULL DEFAULT ''");
	ensureColumn(db, "diff_reviews", "workspace_fingerprint", "TEXT NOT NULL DEFAULT ''");
	function list(executionId) {
		return db.prepare("SELECT execution_id, path, hunk_index, status, comment, base_fingerprint, workspace_fingerprint, updated_at FROM diff_reviews WHERE execution_id = ? ORDER BY path, hunk_index").all(executionId);
	}
	function update(executionId, input = {}) {
		const filePath = String(input.path || "").replace(/\\/g, "/").slice(0, 1000);
		const hunkIndex = input.hunk_index === null || input.hunk_index === undefined ? -1 : Number(input.hunk_index);
		const status = ["unreviewed", "accepted", "rejected"].includes(input.status) ? input.status : "unreviewed";
		const comment = String(input.comment || "").trim().slice(0, 4000);
		const baseFingerprint = fingerprint(input.base_fingerprint);
		const workspaceFingerprint = fingerprint(input.workspace_fingerprint);
		if (!filePath || filePath.startsWith("../") || !Number.isSafeInteger(hunkIndex) || hunkIndex < -1 || hunkIndex > 10000) throw failure("invalid_diff_review", "A valid diff path and hunk are required.");
		db.prepare(`INSERT INTO diff_reviews(execution_id, path, hunk_index, status, comment, base_fingerprint, workspace_fingerprint, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(execution_id, path, hunk_index)
			DO UPDATE SET status=excluded.status, comment=excluded.comment, base_fingerprint=excluded.base_fingerprint,
			workspace_fingerprint=excluded.workspace_fingerprint, updated_at=excluded.updated_at`).run(executionId, filePath, hunkIndex, status, comment, baseFingerprint, workspaceFingerprint, now());
		return list(executionId);
	}
	return { list, update };
}
function ensureColumn(db, table, column, definition) {
	if (db.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column)) return;
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
function fingerprint(value) { return /^[a-f0-9]{64}$/i.test(String(value || "")) ? String(value).toLowerCase() : ""; }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createDiffReviewStore };
