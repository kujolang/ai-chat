const crypto = require("node:crypto");

// A receipt records what is known, not an exactly-once promise. A process may
// die after an external side effect but before recording its result: that call
// becomes uncertain and requires reconciliation rather than automatic replay.
function createExecutionJournal(db, { secret, masterKey, claimOwnership = false, now = Date.now, retentionDays = 90 } = {}) {
	if (!secret && !masterKey) throw new Error("Execution journal encryption secret is required.");
	if (!Number.isSafeInteger(retentionDays) || retentionDays < 0 || retentionDays > 36500) throw new Error("Execution retention must be 0–36500 days.");
	const key = masterKey
		? crypto.createHmac("sha256", masterKey).update("ai-chat-execution-journal-v1").digest()
		: crypto.scryptSync(secret, "ai-chat-execution-journal-v1", 32);
	const encode = (value) => {
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
		return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString("base64");
	};
	const decode = (value) => {
		if (!value) return null;
		const data = Buffer.from(value, "base64");
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
		decipher.setAuthTag(data.subarray(-16));
		return JSON.parse(Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString("utf8"));
	};
	db.exec(`
		CREATE TABLE IF NOT EXISTS execution_runs (
			id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
			status TEXT NOT NULL, request_blob TEXT NOT NULL, checkpoint_blob TEXT,
			result_blob TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS execution_calls (
			run_id TEXT NOT NULL, call_id TEXT NOT NULL, tool_name TEXT NOT NULL,
			fingerprint TEXT NOT NULL, status TEXT NOT NULL, input_blob TEXT NOT NULL,
			result_blob TEXT, started_at INTEGER NOT NULL, ended_at INTEGER,
			PRIMARY KEY (run_id, call_id), FOREIGN KEY(run_id) REFERENCES execution_runs(id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS execution_events (
			run_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_name TEXT NOT NULL,
			payload_blob TEXT NOT NULL, PRIMARY KEY(run_id, sequence),
			FOREIGN KEY(run_id) REFERENCES execution_runs(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS execution_runs_turn ON execution_runs(turn_id, created_at);
		CREATE INDEX IF NOT EXISTS execution_runs_retention ON execution_runs(status, updated_at);
	`);
	const ownerToken = crypto.randomUUID();
	if (claimOwnership) {
		db.exec("CREATE TABLE IF NOT EXISTS execution_owner (id INTEGER PRIMARY KEY CHECK(id = 1), pid INTEGER NOT NULL, token TEXT NOT NULL)");
		db.transaction(() => {
			const prior = db.prepare("SELECT * FROM execution_owner WHERE id = 1").get();
			if (prior) {
				let alive = true;
				try { process.kill(prior.pid, 0); } catch (error) { alive = error.code !== "ESRCH"; }
				if (alive) throw failure("execution_database_in_use", "Another live process owns this execution database. Stop it before starting a second instance.");
			}
			db.prepare("INSERT OR REPLACE INTO execution_owner(id, pid, token) VALUES (1, ?, ?)").run(process.pid, ownerToken);
		})();
	}
	const release = () => { if (claimOwnership) db.prepare("DELETE FROM execution_owner WHERE id = 1 AND token = ?").run(ownerToken); };
	const fingerprint = (value) => crypto.createHash("sha256").update(stableJson(value)).digest("hex");
	const get = (id) => {
		const row = db.prepare("SELECT * FROM execution_runs WHERE id = ?").get(id);
		return row ? { id: row.id, turn_id: row.turn_id, status: row.status, fingerprint: row.fingerprint, request: decode(row.request_blob), checkpoint: decode(row.checkpoint_blob), result: decode(row.result_blob), updated_at: row.updated_at } : null;
	};
	const begin = db.transaction((id, turnId, request, { resume = false } = {}) => {
		prune();
		const digest = fingerprint(request);
		const prior = get(id);
		if (prior) {
			if (prior.fingerprint !== digest || prior.turn_id !== turnId) throw failure("execution_conflict", "This execution ID belongs to a different request.");
			if (prior.status === "expired") throw failure("execution_expired", "This execution's payloads have expired. Its identity is retained to prevent repeating past work.");
			if (prior.status === "completed") return { ...prior, replay: true };
			if (prior.status === "running") throw failure("execution_running", "This execution is already running.");
			if (!resume) throw failure("execution_resume_required", "Inspect the saved execution and resume it explicitly.");
			const uncertain = db.prepare("SELECT call_id FROM execution_calls WHERE run_id = ? AND status IN ('started', 'uncertain')").all(id);
			if (uncertain.length) throw failure("execution_reconciliation_required", "A tool may have completed before interruption. Reconcile its saved call receipt before resuming.");
			db.prepare("UPDATE execution_runs SET status = 'running', updated_at = ? WHERE id = ?").run(now(), id);
			return { ...prior, status: "running", resumed: true };
		}
		if (resume) throw failure("execution_not_found", "Only an existing execution can be resumed.");
		db.prepare("INSERT INTO execution_runs(id, turn_id, fingerprint, status, request_blob, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?, ?)").run(id, turnId, digest, encode(request), now(), now());
		return get(id);
	});
	const startCall = db.transaction((runId, callId, name, input) => {
		if (get(runId)?.status !== "running") throw failure("execution_not_running", "Tool calls require a running execution.");
		const prior = db.prepare("SELECT * FROM execution_calls WHERE run_id = ? AND call_id = ?").get(runId, callId);
		const digest = fingerprint({ name, input });
		if (prior) {
			if (prior.fingerprint !== digest) throw failure("execution_call_conflict", "A tool call ID was reused with different arguments.");
			if (["completed", "failed"].includes(prior.status)) return { replay: true, result: decode(prior.result_blob), status: prior.status };
			if (prior.status === "not_started") {
				db.prepare("UPDATE execution_calls SET status = 'started', started_at = ?, ended_at = NULL WHERE run_id = ? AND call_id = ?").run(now(), runId, callId);
				return { replay: false };
			}
			throw failure("execution_reconciliation_required", "The previous attempt has no confirmed outcome; do not repeat it automatically.");
		}
		db.prepare("INSERT INTO execution_calls(run_id, call_id, tool_name, fingerprint, status, input_blob, started_at) VALUES (?, ?, ?, ?, 'started', ?, ?)").run(runId, callId, name, digest, encode(input), now());
		return { replay: false };
	});
	const completeCall = (runId, callId, result, status = "completed") => {
		if (!["completed", "failed"].includes(status)) throw new Error("Invalid receipt status.");
		const changed = db.prepare("UPDATE execution_calls SET status = ?, result_blob = ?, ended_at = ? WHERE run_id = ? AND call_id = ? AND status = 'started'").run(status, encode(result), now(), runId, callId);
		if (changed.changes !== 1) throw failure("execution_call_conflict", "The receipt is not an active call.");
	};
	const checkpoint = (id, state) => db.prepare("UPDATE execution_runs SET checkpoint_blob = ?, updated_at = ? WHERE id = ? AND status = 'running'").run(encode(state), now(), id);
	const finish = (id, result, status = "completed") => {
		if (!["completed", "interrupted", "cancelled", "failed"].includes(status)) throw new Error("Invalid execution status.");
		db.prepare("UPDATE execution_runs SET status = ?, result_blob = ?, updated_at = ? WHERE id = ? AND status = 'running'").run(status, encode(result), now(), id);
	};
	const appendEvent = db.transaction((id, name, payload) => {
		const seq = db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM execution_events WHERE run_id = ?").get(id).next;
		db.prepare("INSERT INTO execution_events VALUES (?, ?, ?, ?)").run(id, seq, name, encode(payload));
		return seq;
	});
	const events = (id, after = 0, limit = 256) => db.prepare("SELECT * FROM execution_events WHERE run_id = ? AND sequence > ? ORDER BY sequence LIMIT ?").all(id, after, Math.min(256, Math.max(1, limit))).map((row) => ({ sequence: row.sequence, event: row.event_name, data: decode(row.payload_blob) }));
	const lastSequence = (id) => db.prepare("SELECT COALESCE(MAX(sequence), 0) AS last FROM execution_events WHERE run_id = ?").get(id).last;
	const terminalSequence = (id) => db.prepare("SELECT COALESCE(MAX(sequence), 0) AS last FROM execution_events WHERE run_id = ? AND event_name IN ('done', 'error')").get(id).last;
	const recover = db.transaction(() => {
		const interrupted = db.prepare("SELECT id FROM execution_runs WHERE status = 'running'").all().map((row) => row.id);
		db.prepare("UPDATE execution_calls SET status = 'uncertain' WHERE status = 'started' AND run_id IN (SELECT id FROM execution_runs WHERE status = 'running')").run();
		db.prepare("UPDATE execution_runs SET status = 'interrupted', updated_at = ? WHERE status = 'running'").run(now());
		return interrupted;
	});
	const receipts = (id) => db.prepare("SELECT * FROM execution_calls WHERE run_id = ? ORDER BY started_at, call_id").all(id).map((row) => ({ call_id: row.call_id, tool_name: row.tool_name, status: row.status, input: decode(row.input_blob), result: decode(row.result_blob) }));
	const reconcile = db.transaction((runId, callId, { disposition, result, evidence } = {}) => {
		if (get(runId)?.status === "running") throw failure("execution_running", "Wait for the execution to stop before reconciling a receipt.");
		if (typeof evidence !== "string" || !evidence.trim() || evidence.length > 4000) throw failure("execution_invalid_resolution", "Provide bounded evidence of the observed tool outcome.");
		if (!["completed", "not_started"].includes(disposition)) throw failure("execution_invalid_resolution", "Choose completed or not_started after checking the external outcome.");
		if (disposition === "completed" && (!result || typeof result !== "object")) throw failure("execution_invalid_resolution", "A completed resolution requires the observed result.");
		const changed = db.prepare("UPDATE execution_calls SET status = ?, result_blob = ?, ended_at = ? WHERE run_id = ? AND call_id = ? AND status IN ('started', 'uncertain')").run(disposition, disposition === "completed" ? encode(result) : null, now(), runId, callId);
		if (changed.changes !== 1) throw failure("execution_call_conflict", "Only an unresolved receipt can be reconciled.");
		appendEvent(runId, "reconciliation", { call_id: callId, disposition, evidence, recorded_at: now() });
	});
	const prune = db.transaction(() => {
		if (retentionDays === 0) return 0;
		// Keep active/recoverable executions and unresolved external outcomes. Small
		// identity tombstones remain indefinitely; expiry must never enable replay.
		const candidates = db.prepare("SELECT id FROM execution_runs WHERE status IN ('completed', 'failed', 'cancelled') AND updated_at < ? AND NOT EXISTS (SELECT 1 FROM execution_calls WHERE run_id = execution_runs.id AND status IN ('started', 'uncertain')) ORDER BY updated_at LIMIT 100").all(now() - retentionDays * 86400000);
		for (const { id } of candidates) {
			db.prepare("DELETE FROM execution_events WHERE run_id = ?").run(id);
			db.prepare("DELETE FROM execution_calls WHERE run_id = ?").run(id);
			db.prepare("UPDATE execution_runs SET status = 'expired', request_blob = ?, checkpoint_blob = NULL, result_blob = NULL WHERE id = ?").run(encode({ expired: true }), id);
		}
		return candidates.length;
	});
	return { begin, get, startCall, completeCall, checkpoint, finish, appendEvent, events, lastSequence, terminalSequence, recover, receipts, reconcile, release, prune };
}
function stableJson(value) {
	if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
	if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
	return JSON.stringify(value);
}
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createExecutionJournal };
