const crypto = require("node:crypto");

const TERMINAL = new Set(["approved", "denied", "expired", "cancelled"]);

function createApprovalStore(db, { now = Date.now, timeoutMs = 10 * 60 * 1000, uid = () => crypto.randomUUID() } = {}) {
	const waiters = new Map();
	const ttl = bounded(timeoutMs, 30_000, 60 * 60 * 1000, 10 * 60 * 1000);
	db.exec(`
		CREATE TABLE IF NOT EXISTS action_approvals (
			id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, chat_id TEXT NOT NULL,
			pane_id TEXT NOT NULL, workspace_id TEXT NOT NULL, tool_name TEXT NOT NULL,
			argument_fingerprint TEXT NOT NULL, summary TEXT NOT NULL, risk TEXT NOT NULL,
			status TEXT NOT NULL, decision_scope TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, resolved_at INTEGER
		);
		CREATE TABLE IF NOT EXISTS action_approval_grants (
			id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
			tool_name TEXT NOT NULL, argument_fingerprint TEXT NOT NULL,
			grant_scope TEXT NOT NULL, created_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS action_approvals_execution ON action_approvals(execution_id, status, created_at);
		CREATE INDEX IF NOT EXISTS action_approval_grants_match ON action_approval_grants(tool_name, argument_fingerprint, chat_id, workspace_id);
		CREATE UNIQUE INDEX IF NOT EXISTS action_approval_grants_exact ON action_approval_grants(
			grant_scope, chat_id, workspace_id, tool_name, argument_fingerprint
		);
	`);
	db.prepare("UPDATE action_approvals SET status = 'expired', resolved_at = ? WHERE status = 'pending'").run(now());

	function fingerprint(toolName, input) {
		return crypto.createHash("sha256").update(stableJson({ tool_name: toolName, input })).digest("hex");
	}

	function findGrant({ chatId, workspaceId, toolName, argumentFingerprint }) {
		return db.prepare(`SELECT * FROM action_approval_grants
			WHERE tool_name = ? AND argument_fingerprint = ?
			AND ((grant_scope = 'chat' AND chat_id = ?) OR (grant_scope = 'workspace' AND workspace_id = ?))
			ORDER BY created_at DESC LIMIT 1`).get(toolName, argumentFingerprint, chatId, workspaceId) || null;
	}

	function request({ executionId, chatId = "", paneId = "", workspaceId = "", toolName, input, summary, risk = "write" }) {
		const argumentFingerprint = fingerprint(toolName, input);
		const grant = findGrant({ chatId, workspaceId, toolName, argumentFingerprint });
		if (grant) return { granted: true, grant_scope: grant.grant_scope, argument_fingerprint: argumentFingerprint };
		const existing = db.prepare(`SELECT * FROM action_approvals WHERE execution_id = ? AND tool_name = ?
			AND argument_fingerprint = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`).get(executionId, toolName, argumentFingerprint);
		if (existing) return { granted: false, approval: publicApproval(existing) };
		const createdAt = now();
		const row = {
			id: `approval_${uid()}`.slice(0, 180), execution_id: String(executionId), chat_id: boundedText(chatId, 180),
			pane_id: boundedText(paneId, 180), workspace_id: boundedText(workspaceId, 180), tool_name: boundedText(toolName, 120),
			argument_fingerprint: argumentFingerprint, summary: boundedText(summary, 500), risk: ["write", "external", "destructive"].includes(risk) ? risk : "write",
			created_at: createdAt, expires_at: createdAt + ttl
		};
		db.prepare(`INSERT INTO action_approvals(id, execution_id, chat_id, pane_id, workspace_id, tool_name,
			argument_fingerprint, summary, risk, status, created_at, expires_at)
			VALUES (@id, @execution_id, @chat_id, @pane_id, @workspace_id, @tool_name,
			@argument_fingerprint, @summary, @risk, 'pending', @created_at, @expires_at)`).run(row);
		return { granted: false, approval: publicApproval({ ...row, status: "pending", decision_scope: "", resolved_at: null }) };
	}

	function wait(id, { signal } = {}) {
		const row = refresh(id);
		if (!row) return Promise.reject(failure("approval_not_found", "Approval request was not found."));
		if (row.status !== "pending") return Promise.resolve(publicApproval(row));
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(failure("approval_expired", "The approval request expired before a decision was made."));
				waiters.delete(id);
				expire(id);
			}, Math.max(1, row.expires_at - now()));
			const abort = () => {
				clearTimeout(timer);
				waiters.delete(id);
				cancel(id);
				reject(signal.reason || failure("approval_cancelled", "Approval waiting was cancelled."));
			};
			if (signal?.aborted) return abort();
			signal?.addEventListener("abort", abort, { once: true });
			waiters.set(id, (next) => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
				waiters.delete(id);
				resolve(publicApproval(next));
			});
		});
	}

	function decide(id, { decision, scope = "once" } = {}) {
		const normalizedDecision = decision === "deny" ? "deny" : "approve";
		const normalizedScope = ["once", "chat", "workspace"].includes(scope) ? scope : "once";
		const row = refresh(id);
		if (!row) throw failure("approval_not_found", "Approval request was not found.");
		if (row.status !== "pending") throw failure("approval_already_resolved", "This approval request is no longer pending.");
		if (row.expires_at <= now()) {
			expire(id);
			throw failure("approval_expired", "This approval request has expired.");
		}
		const status = normalizedDecision === "deny" ? "denied" : "approved";
		db.transaction(() => {
			db.prepare("UPDATE action_approvals SET status = ?, decision_scope = ?, resolved_at = ? WHERE id = ? AND status = 'pending'").run(status, normalizedScope, now(), id);
			if (status === "approved" && normalizedScope !== "once") {
				db.prepare(`INSERT OR IGNORE INTO action_approval_grants(id, chat_id, workspace_id, tool_name,
					argument_fingerprint, grant_scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
					`grant_${uid()}`.slice(0, 180), row.chat_id, row.workspace_id, row.tool_name,
					row.argument_fingerprint, normalizedScope, now()
				);
			}
		})();
		const next = refresh(id);
		waiters.get(id)?.(next);
		return publicApproval(next);
	}

	function list({ executionId = "", chatId = "", status = "" } = {}) {
		expireStale();
		const clauses = [];
		const args = [];
		if (executionId) { clauses.push("execution_id = ?"); args.push(executionId); }
		if (chatId) { clauses.push("chat_id = ?"); args.push(chatId); }
		if (status) { clauses.push("status = ?"); args.push(status); }
		const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
		return db.prepare(`SELECT * FROM action_approvals ${where} ORDER BY created_at DESC LIMIT 200`).all(...args).map(publicApproval);
	}

	function revokeGrant(id) {
		return db.prepare("DELETE FROM action_approval_grants WHERE id = ?").run(id).changes === 1;
	}

	function grants() {
		return db.prepare("SELECT id, chat_id, workspace_id, tool_name, grant_scope, created_at FROM action_approval_grants ORDER BY created_at DESC LIMIT 200").all();
	}

	function refresh(id) { return db.prepare("SELECT * FROM action_approvals WHERE id = ?").get(id); }
	function expire(id) { resolveTerminal(id, "expired"); }
	function cancel(id) { resolveTerminal(id, "cancelled"); }
	function expireStale() {
		const ids = db.prepare("SELECT id FROM action_approvals WHERE status = 'pending' AND expires_at <= ?").all(now());
		for (const row of ids) expire(row.id);
	}
	function resolveTerminal(id, status) {
		if (!TERMINAL.has(status)) return;
		db.prepare("UPDATE action_approvals SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'").run(status, now(), id);
		const row = refresh(id);
		if (row) waiters.get(id)?.(row);
	}

	return { request, wait, decide, list, grants, revokeGrant, fingerprint, expireStale };
}

function publicApproval(row) {
	return {
		id: row.id, execution_id: row.execution_id, chat_id: row.chat_id, pane_id: row.pane_id,
		workspace_id: row.workspace_id, tool_name: row.tool_name, summary: row.summary, risk: row.risk,
		status: row.status, decision_scope: row.decision_scope || "", created_at: row.created_at,
		expires_at: row.expires_at, resolved_at: row.resolved_at || null
	};
}

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function boundedText(value, max) { return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }
function bounded(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }

module.exports = { createApprovalStore };
