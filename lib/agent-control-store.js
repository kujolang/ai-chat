const crypto = require("node:crypto");

const STEP_STATES = new Set(["pending", "active", "completed", "skipped", "blocked", "failed"]);

function createAgentControlStore(db, { now = Date.now, uid = () => crypto.randomUUID() } = {}) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS execution_plans (
			execution_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, pane_id TEXT NOT NULL,
			steps_json TEXT NOT NULL, updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS execution_steering (
			id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, mode TEXT NOT NULL,
			prompt TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, created_at INTEGER NOT NULL, consumed_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS execution_steering_pending ON execution_steering(execution_id, mode, status, created_at);
	`);

	function start(executionId, { chatId = "", paneId = "" } = {}) {
		const existing = getPlan(executionId);
		if (existing) return existing;
		const plan = normalizePlan([
			{ id: "understand", label: "Understand the request and context", state: "active" },
			{ id: "execute", label: "Execute the required work", state: "pending" },
			{ id: "verify", label: "Verify results and failure paths", state: "pending" },
			{ id: "report", label: "Report the outcome", state: "pending" }
		]);
		db.prepare("INSERT INTO execution_plans(execution_id, chat_id, pane_id, steps_json, updated_at) VALUES (?, ?, ?, ?, ?)").run(executionId, chatId, paneId, JSON.stringify(plan), now());
		return getPlan(executionId);
	}

	function transition(executionId, stepId, state) {
		if (!STEP_STATES.has(state)) throw failure("invalid_plan_state", "Invalid plan step state.");
		const current = getPlan(executionId);
		if (!current) throw failure("plan_not_found", "Execution plan was not found.");
		const steps = current.steps.map((step) => step.id === stepId ? { ...step, state } : step);
		db.prepare("UPDATE execution_plans SET steps_json = ?, updated_at = ? WHERE execution_id = ?").run(JSON.stringify(steps), now(), executionId);
		return getPlan(executionId);
	}

	function completeThrough(executionId, activeId) {
		const current = getPlan(executionId);
		if (!current) return null;
		let reached = false;
		const steps = current.steps.map((step) => {
			if (step.id === activeId) { reached = true; return { ...step, state: "active" }; }
			return reached ? { ...step, state: step.state === "active" ? "pending" : step.state } : { ...step, state: "completed" };
		});
		db.prepare("UPDATE execution_plans SET steps_json = ?, updated_at = ? WHERE execution_id = ?").run(JSON.stringify(steps), now(), executionId);
		return getPlan(executionId);
	}

	function finish(executionId, state = "completed") {
		const current = getPlan(executionId);
		if (!current) return null;
		const terminal = state === "failed" ? "failed" : state === "blocked" ? "blocked" : "completed";
		const steps = current.steps.map((step) => step.state === "skipped" ? step : { ...step, state: terminal === "completed" ? "completed" : step.state === "completed" ? "completed" : terminal });
		db.prepare("UPDATE execution_plans SET steps_json = ?, updated_at = ? WHERE execution_id = ?").run(JSON.stringify(steps), now(), executionId);
		return getPlan(executionId);
	}

	function getPlan(executionId) {
		const row = db.prepare("SELECT * FROM execution_plans WHERE execution_id = ?").get(executionId);
		return row ? { execution_id: row.execution_id, chat_id: row.chat_id, pane_id: row.pane_id, steps: normalizePlan(JSON.parse(row.steps_json)), updated_at: row.updated_at } : null;
	}

	function steer(executionId, { mode, prompt = "" } = {}) {
		if (!["immediate", "queued", "cancel_after_action"].includes(mode)) throw failure("invalid_steering_mode", "Choose immediate, queued, or cancel_after_action.");
		const text = String(prompt || "").trim().slice(0, 4000);
		if (mode !== "cancel_after_action" && !text) throw failure("invalid_steering_prompt", "A steering prompt is required.");
		const id = `steer_${uid()}`.slice(0, 180);
		db.prepare("INSERT INTO execution_steering(id, execution_id, mode, prompt, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(id, executionId, mode, text, now());
		return { id, execution_id: executionId, mode, prompt: text, status: "pending", created_at: now() };
	}

	function consume(executionId, mode) {
		return db.transaction(() => {
			const rows = db.prepare("SELECT * FROM execution_steering WHERE execution_id = ? AND mode = ? AND status = 'pending' ORDER BY created_at, id LIMIT 20").all(executionId, mode);
			for (const row of rows) db.prepare("UPDATE execution_steering SET status = 'consumed', consumed_at = ? WHERE id = ? AND status = 'pending'").run(now(), row.id);
			return rows.map(publicSteering);
		})();
	}

	function list(executionId) { return db.prepare("SELECT * FROM execution_steering WHERE execution_id = ? ORDER BY created_at, id").all(executionId).map(publicSteering); }
	return { start, transition, completeThrough, finish, getPlan, steer, consume, list };
}

function normalizePlan(steps) {
	return (Array.isArray(steps) ? steps : []).slice(0, 64).map((step, index) => ({
		id: String(step.id || `step-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-").slice(0, 80),
		label: String(step.label || "Plan step").trim().slice(0, 240),
		state: STEP_STATES.has(step.state) ? step.state : "pending"
	}));
}
function publicSteering(row) { return { id: row.id, execution_id: row.execution_id, mode: row.mode, prompt: row.prompt, status: row.status, created_at: row.created_at, consumed_at: row.consumed_at || null }; }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createAgentControlStore };
