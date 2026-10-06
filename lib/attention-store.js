const crypto = require("node:crypto");

const KINDS = new Set(["approval_needed", "question_asked", "task_failed", "task_completed", "conflict_required"]);
function createAttentionStore(db, { now = Date.now, uid = () => crypto.randomUUID() } = {}) {
	db.exec(`CREATE TABLE IF NOT EXISTS attention_events (
		id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, chat_id TEXT NOT NULL,
		pane_id TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
		status TEXT NOT NULL, read_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, resolved_at INTEGER
	); CREATE INDEX IF NOT EXISTS attention_status ON attention_events(status, updated_at DESC);`);
	function upsert({ kind, chatId, paneId = "", sourceId = "", title = "" }) {
		if (!KINDS.has(kind)) throw failure("invalid_attention_kind", "Unsupported attention event.");
		const key = `${kind}:${String(sourceId || `${chatId}:${paneId}`)}`.slice(0, 400);
		const existing = db.prepare("SELECT * FROM attention_events WHERE dedupe_key = ?").get(key);
		if (existing) {
			db.prepare("UPDATE attention_events SET status='open', title=?, updated_at=?, resolved_at=NULL WHERE id=?").run(safeTitle(title, kind), now(), existing.id);
			return get(existing.id);
		}
		const id = `attention_${uid()}`.slice(0, 180); const timestamp = now();
		db.prepare("INSERT INTO attention_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id, key, kind, String(chatId).slice(0,180), String(paneId).slice(0,180), String(sourceId).slice(0,240), safeTitle(title, kind), "open", null, timestamp, timestamp, null);
		return get(id);
	}
	function list({ status = "open", kind = "", limit = 200 } = {}) {
		const args = []; const clauses = [];
		if (status) { clauses.push("status = ?"); args.push(status); } if (kind && KINDS.has(kind)) { clauses.push("kind = ?"); args.push(kind); }
		return db.prepare(`SELECT * FROM attention_events ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`).all(...args, Math.max(1, Math.min(500, Number(limit) || 200))).map(publicEvent);
	}
	function get(id) { const row = db.prepare("SELECT * FROM attention_events WHERE id = ?").get(id); return row ? publicEvent(row) : null; }
	function markRead(id, read = true) { db.prepare("UPDATE attention_events SET read_at=?, updated_at=? WHERE id=?").run(read ? now() : null, now(), id); return get(id); }
	function resolve(id) { db.prepare("UPDATE attention_events SET status='resolved', resolved_at=?, updated_at=? WHERE id=?").run(now(), now(), id); return get(id); }
	function resolveSource(kind, sourceId) { return db.prepare("UPDATE attention_events SET status='resolved', resolved_at=?, updated_at=? WHERE kind=? AND source_id=? AND status='open'").run(now(), now(), kind, sourceId).changes; }
	function resolveChat(chatId, kinds = []) { const selected = kinds.filter((kind) => KINDS.has(kind)); if (!selected.length) return 0; return db.prepare(`UPDATE attention_events SET status='resolved', resolved_at=?, updated_at=? WHERE chat_id=? AND status='open' AND kind IN (${selected.map(()=>"?").join(",")})`).run(now(), now(), chatId, ...selected).changes; }
	function countUnread() { return db.prepare("SELECT COUNT(*) AS count FROM attention_events WHERE status='open' AND read_at IS NULL").get().count; }
	return { upsert, list, get, markRead, resolve, resolveSource, resolveChat, countUnread };
}
function publicEvent(row) { return { id: row.id, kind: row.kind, chat_id: row.chat_id, pane_id: row.pane_id, source_id: row.source_id, title: row.title, status: row.status, unread: !row.read_at, created_at: row.created_at, updated_at: row.updated_at, resolved_at: row.resolved_at || null }; }
function safeTitle(value, kind) { return String(value || ({ approval_needed: "Approval needed", question_asked: "Question asked", task_failed: "Task failed", task_completed: "Task completed", conflict_required: "Reconciliation required" })[kind]).replace(/[\r\n\t]+/g, " ").trim().slice(0, 180); }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createAttentionStore, ATTENTION_KINDS: KINDS };
