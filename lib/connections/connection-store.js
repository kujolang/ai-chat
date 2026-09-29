const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function connectionError(code, message) {
	return Object.assign(new Error(message), { code, retryable: false });
}

// This database is outside exported application state. Only encrypted records
// live here; a transactionally claimed process owner prevents refresh-token races
// between two AI Chat instances using the same credential directory.
function createConnectionStore({ directory, secret, now = Date.now }) {
	if (typeof secret !== "string" || secret.length < 24 || secret === "DEVELOPMENT_ONLY_CHANGE_ME") {
		throw connectionError("chatgpt_storage_unconfigured", "Set ENCRYPTION_SECRET to a strong secret of at least 24 characters before connecting ChatGPT.");
	}
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const stat = fs.lstatSync(directory);
	if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== path.resolve(directory)) {
		throw connectionError("chatgpt_storage_unsafe", "The ChatGPT credential directory must be a real directory without symlinks.");
	}
	fs.chmodSync(directory, 0o700);
	const filename = path.join(directory, "connections.db");
	if (fs.existsSync(filename) && (!fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink())) {
		throw connectionError("chatgpt_storage_unsafe", "The ChatGPT credential database must be a regular file.");
	}
	// Create with restrictive permissions before SQLite opens it.
	const fd = fs.openSync(filename, fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW, 0o600);
	fs.closeSync(fd);
	fs.chmodSync(filename, 0o600);
	const db = new Database(filename);
	db.pragma("journal_mode = DELETE");
	db.exec("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, token TEXT NOT NULL)");
	const owner = crypto.randomUUID();
	const key = crypto.scryptSync(secret, "ai-chat-connections-v1", 32);
	let closed = false;
	try {
		db.transaction(() => {
			const prior = db.prepare("SELECT * FROM owner WHERE id=1").get();
			if (prior) {
				let alive = true;
				try { process.kill(prior.pid, 0); } catch (error) { alive = error.code !== "ESRCH"; }
				if (alive) throw connectionError("chatgpt_storage_in_use", "Another AI Chat process owns the ChatGPT connections.");
			}
			db.prepare("INSERT OR REPLACE INTO owner VALUES (1, ?, ?)").run(process.pid, owner);
		}).immediate();
	} catch (error) { db.close(); throw error; }
	function assertOpen() { if (closed) throw connectionError("chatgpt_storage_closed", "ChatGPT connections are closed."); }
	function write(id, value) {
		assertOpen();
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
		cipher.setAAD(Buffer.from(id));
		const encrypted = Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
		db.prepare("INSERT OR REPLACE INTO records VALUES (?, ?)").run(id, encrypted.toString("base64"));
	}
	function read(id) {
		assertOpen();
		const row = db.prepare("SELECT value FROM records WHERE id=?").get(id);
		if (!row) return null;
		try {
			const bytes = Buffer.from(row.value, "base64");
			const decipher = crypto.createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
			decipher.setAAD(Buffer.from(id));
			decipher.setAuthTag(bytes.subarray(-16));
			return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString());
		} catch { throw connectionError("chatgpt_storage_locked", "ChatGPT credentials could not be decrypted. Restore the original ENCRYPTION_SECRET."); }
	}
	let host;
	try {
		host = read("host");
		if (!host) { host = { id: `urn:uuid:${crypto.randomUUID()}` }; write("host", host); }
	} catch (error) { db.prepare("DELETE FROM owner WHERE token=?").run(owner); db.close(); throw error; }
	function list() {
		assertOpen();
		return db.prepare("SELECT id FROM records WHERE id LIKE 'connection-%' ORDER BY id").all().map(({ id }) => read(id));
	}
	function save(record, expectedGeneration) {
		return db.transaction(() => {
			const prior = read(record.id);
			if (expectedGeneration !== undefined && prior?.generation !== expectedGeneration) {
				throw connectionError("chatgpt_connection_changed", "The ChatGPT connection changed. Start the request again.");
			}
			const next = { ...record, updated_at: now(), generation: (prior?.generation || 0) + 1 };
			write(next.id, next);
			return next;
		}).immediate();
	}
	return {
		hostId: host.id, read, list, save,
		close() {
			if (closed) return;
			db.prepare("DELETE FROM owner WHERE token=?").run(owner);
			db.close(); closed = true; key.fill(0);
		}
	};
}

function publicConnection(record) {
	return {
		id: record.id, kind: "chatgpt_plan_oauth", label: record.label,
		email: record.email || null, name: record.name || null,
		status: record.status, plan_usage_enabled: record.status === "connected" && record.scopes?.includes("chatgpt.tokens.use.direct") === true,
		plan_notice_required: record.status === "connected" && record.scopes?.includes("chatgpt.tokens.use.direct") === true && record.plan_notice_acknowledged !== true,
		connected_at: record.connected_at, updated_at: record.updated_at,
		// No plan name is part of the documented SIWC token contract.
		manage_usage_url: "https://chatgpt.com/settings/usage"
	};
}

module.exports = { createConnectionStore, publicConnection, connectionError };
