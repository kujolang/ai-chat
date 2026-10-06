const crypto = require("node:crypto");
const path = require("node:path");

const MIME = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "image/png", "image/jpeg", "image/webp"]);
function createAttachmentStore(db, { masterKey, now = Date.now, retentionDays = 90 } = {}) {
	const key = crypto.createHmac("sha256", masterKey).update("ai-chat-attachments-v1").digest();
	db.exec(`CREATE TABLE IF NOT EXISTS chat_attachments (
		id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL,
		size INTEGER NOT NULL, data_blob TEXT NOT NULL, text_excerpt TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attached INTEGER NOT NULL DEFAULT 0
	)`);
	db.prepare("DELETE FROM chat_attachments WHERE expires_at < ?").run(now());
	function create(chatId, file) {
		const mime = normalizeAttachmentMime(file);
		if (!MIME.has(mime)) throw failure("unsupported_attachment", "Unsupported attachment type.");
		if (!file.buffer || file.buffer.length > 5 * 1024 * 1024) throw failure("attachment_too_large", "Attachments must be 5 MiB or smaller.");
		if (mime.startsWith("image/") && !validImageSignature(mime, file.buffer)) throw failure("invalid_attachment_content", "Image content does not match its declared type.");
		const id = `attachment_${crypto.randomUUID()}`;
		let text = "";
		if (mime.startsWith("text/") || mime === "application/json") {
			try { text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer); }
			catch { throw failure("invalid_attachment_encoding", "Text attachments must be valid UTF-8."); }
		}
		const textMarker = text ? (text.length > 40_000 ? "text_truncated" : "text") : "";
		db.prepare("INSERT INTO chat_attachments VALUES(?,?,?,?,?,?,?,?,?,0)").run(id, chatId, safeName(file.originalname), mime, file.buffer.length, seal(file.buffer), textMarker, now(), now() + Math.max(1, retentionDays) * 86400000);
		return publicRow(db.prepare("SELECT * FROM chat_attachments WHERE id = ?").get(id));
	}
	function list(chatId) { return db.prepare("SELECT * FROM chat_attachments WHERE chat_id = ? AND expires_at >= ? ORDER BY created_at").all(chatId, now()).map(publicRow); }
	function get(chatId, id) {
		const row = db.prepare("SELECT * FROM chat_attachments WHERE chat_id = ? AND id = ? AND expires_at >= ?").get(chatId, id, now());
		if (!row) return null;
		const buffer = open(row.data_blob);
		const textExcerpt = isTextMime(row.mime_type) ? new TextDecoder("utf-8", { fatal: true }).decode(buffer).slice(0, 40_000) : "";
		return { ...publicRow(row), text_excerpt: textExcerpt, buffer };
	}
	function remove(chatId, id) { return db.prepare("DELETE FROM chat_attachments WHERE chat_id = ? AND id = ?").run(chatId, id).changes === 1; }
	function context(chatId, ids) {
		const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 8);
		return unique.map((id) => get(chatId, id)).filter(Boolean).map((item) => ({ type: "artifact_ref", artifact_id: item.id, name: item.name, mime_type: item.mime_type, size: item.size, text_excerpt: item.text_excerpt, extraction: item.extraction, provider_compatibility: item.provider_compatibility, leaves_machine: true }));
	}
	function seal(buffer) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); return Buffer.concat([iv, cipher.update(buffer), cipher.final(), cipher.getAuthTag()]).toString("base64"); }
	function open(value) { const data = Buffer.from(value, "base64"); const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0,12)); decipher.setAuthTag(data.subarray(-16)); return Buffer.concat([decipher.update(data.subarray(12,-16)), decipher.final()]); }
	return { create, list, get, remove, context };
}
function publicRow(row) { return { id: row.id, type: "artifact_ref", name: row.name, mime_type: row.mime_type, size: row.size, extraction: row.text_excerpt ? (row.text_excerpt === "text_truncated" ? "truncated_text" : "full_text") : "binary_reference", provider_compatibility: row.text_excerpt ? "all_text_models" : "reference_only", leaves_machine: true, created_at: row.created_at, expires_at: row.expires_at }; }
function isTextMime(mime) { return String(mime).startsWith("text/") || mime === "application/json"; }
function safeName(value) { return String(value || "attachment").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 240); }
function normalizeAttachmentMime(file) {
	const supplied = String(file?.mimetype || "").toLowerCase();
	if (MIME.has(supplied)) return supplied;
	return ({ ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown", ".csv": "text/csv", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" })[path.extname(String(file?.originalname || "")).toLowerCase()] || supplied;
}
function validImageSignature(mime, buffer) {
	if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
	if (mime === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
	if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
	return false;
}
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createAttachmentStore, ATTACHMENT_MIME_TYPES: MIME, normalizeAttachmentMime };
