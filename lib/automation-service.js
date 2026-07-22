const VALID_REPEATS = new Set(["daily", "weekdays", "weekly"]);

function createAutomationService(options) {
	const db = options.db;
	const now = options.nowFn;
	const uid = options.uidFn;
	const routeId = options.routeIdFn;
	const executeChat = options.executeChat;
	const running = new Set();
	let timer = null;

	function initSchema() {
		db.exec(`
			CREATE TABLE IF NOT EXISTS automations (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				prompt TEXT NOT NULL,
				profile_id TEXT NOT NULL,
				model TEXT NOT NULL DEFAULT '',
				project_path TEXT NOT NULL DEFAULT '',
				repeat_kind TEXT NOT NULL DEFAULT 'daily',
				time_local TEXT NOT NULL DEFAULT '09:00',
				weekday INTEGER NOT NULL DEFAULT 1,
				timezone TEXT NOT NULL DEFAULT 'UTC',
				enabled INTEGER NOT NULL DEFAULT 1,
				next_run_at INTEGER,
				last_run_at INTEGER,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS automation_runs (
				id TEXT PRIMARY KEY,
				automation_id TEXT NOT NULL,
				chat_id TEXT,
				status TEXT NOT NULL,
				error TEXT NOT NULL DEFAULT '',
				started_at INTEGER NOT NULL,
				completed_at INTEGER,
				FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE,
				FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE SET NULL
			);

			CREATE INDEX IF NOT EXISTS idx_automations_due ON automations(enabled, next_run_at);
			CREATE INDEX IF NOT EXISTS idx_automation_runs_history ON automation_runs(automation_id, started_at DESC);
		`);
		db.prepare("UPDATE automation_runs SET status = 'failed', error = 'The server stopped before this run completed.', completed_at = ? WHERE status = 'running'").run(now());
	}

	function rowToAutomation(row) {
		if (!row) return null;
		return {
			id: row.id,
			title: row.title,
			prompt: row.prompt,
			profile_id: row.profile_id,
			model: row.model || "",
			project_path: row.project_path || "",
			repeat: row.repeat_kind,
			time: row.time_local,
			weekday: Number(row.weekday),
			timezone: row.timezone,
			enabled: row.enabled === 1,
			next_run_at: row.next_run_at == null ? null : Number(row.next_run_at),
			last_run_at: row.last_run_at == null ? null : Number(row.last_run_at),
			created_at: Number(row.created_at),
			updated_at: Number(row.updated_at)
		};
	}

	function list() {
		return db.prepare("SELECT * FROM automations ORDER BY enabled DESC, next_run_at ASC, created_at DESC").all().map(rowToAutomation);
	}

	function get(id) {
		return rowToAutomation(db.prepare("SELECT * FROM automations WHERE id = ?").get(String(id || "")));
	}

	function runs(id, limit = 20) {
		return db.prepare(`
			SELECT automation_runs.*, chats.route_id AS chat_route_id, chats.title AS chat_title
			FROM automation_runs
			LEFT JOIN chats ON chats.id = automation_runs.chat_id
			WHERE automation_runs.automation_id = ?
			ORDER BY automation_runs.started_at DESC
			LIMIT ?
		`).all(String(id || ""), Math.min(Math.max(Number(limit) || 20, 1), 100)).map((row) => ({
			id: row.id,
			automation_id: row.automation_id,
			chat_id: row.chat_id || null,
			chat_route_id: row.chat_route_id || null,
			chat_title: row.chat_title || null,
			status: row.status,
			error: row.error || "",
			started_at: Number(row.started_at),
			completed_at: row.completed_at == null ? null : Number(row.completed_at)
		}));
	}

	function validate(input) {
		const title = String(input && input.title || "").trim().slice(0, 160);
		const prompt = String(input && input.prompt || "").trim().slice(0, 200000);
		const profileId = String(input && input.profile_id || "").trim();
		const model = String(input && input.model || "").trim().slice(0, 500);
		const projectPath = String(input && input.project_path || "").trim().slice(0, 2000);
		const repeat = VALID_REPEATS.has(String(input && input.repeat || "").toLowerCase())
			? String(input.repeat).toLowerCase()
			: "daily";
		const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input && input.time || "")) ? String(input.time) : "09:00";
		const weekday = Math.min(Math.max(Number.parseInt(input && input.weekday, 10) || 1, 0), 6);
		const timezone = validTimeZone(input && input.timezone) ? String(input.timezone) : "UTC";
		if (!title) throw inputError("Automation title is required.");
		if (!prompt) throw inputError("Automation prompt is required.");
		if (!profileId || !db.prepare("SELECT id FROM profiles WHERE id = ?").get(profileId)) {
			throw inputError("Choose an available provider profile.");
		}
		return { title, prompt, profileId, model, projectPath, repeat, time, weekday, timezone, enabled: input.enabled !== false };
	}

	function create(input) {
		const value = validate(input);
		const stamp = now();
		const id = `automation-${uid()}`;
		const nextRunAt = value.enabled ? nextScheduledAt(value, stamp) : null;
		db.prepare(`
			INSERT INTO automations (
				id, title, prompt, profile_id, model, project_path, repeat_kind,
				time_local, weekday, timezone, enabled, next_run_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(id, value.title, value.prompt, value.profileId, value.model, value.projectPath, value.repeat,
			value.time, value.weekday, value.timezone, value.enabled ? 1 : 0, nextRunAt, stamp, stamp);
		return get(id);
	}

	function update(id, input) {
		if (!get(id)) return null;
		const value = validate(input);
		const stamp = now();
		const nextRunAt = value.enabled ? nextScheduledAt(value, stamp) : null;
		db.prepare(`
			UPDATE automations SET title = ?, prompt = ?, profile_id = ?, model = ?, project_path = ?,
				repeat_kind = ?, time_local = ?, weekday = ?, timezone = ?, enabled = ?, next_run_at = ?, updated_at = ?
			WHERE id = ?
		`).run(value.title, value.prompt, value.profileId, value.model, value.projectPath, value.repeat,
			value.time, value.weekday, value.timezone, value.enabled ? 1 : 0, nextRunAt, stamp, String(id));
		return get(id);
	}

	function remove(id) {
		return db.prepare("DELETE FROM automations WHERE id = ?").run(String(id || "")).changes > 0;
	}

	const prepareRun = db.transaction((automation) => {
		const stamp = now();
		const runId = `automation-run-${uid()}`;
		const chatId = `automation-chat-${uid()}`;
		const paneId = `automation-pane-${uid()}`;
		const userMessageId = `automation-message-${uid()}`;
		const profile = db.prepare("SELECT * FROM profiles WHERE id = ?").get(automation.profile_id);
		if (!profile) throw inputError("The automation provider profile no longer exists.");
		const model = automation.model || String(profile.models_csv || "").split(",").map((entry) => entry.trim()).find(Boolean) || "";
		const nextRunAt = automation.enabled ? nextScheduledAt(automation, stamp) : null;
		db.prepare("UPDATE automations SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?")
			.run(stamp, nextRunAt, stamp, automation.id);
		db.prepare("INSERT INTO chats (id, route_id, title, project_path, pinned, archived, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0)")
			.run(chatId, routeId(), automation.title, automation.project_path || "", stamp, stamp);
		db.prepare("INSERT INTO panes (id, chat_id, profile_id, model, status, sort_order) VALUES (?, ?, ?, ?, 'waiting', 0)")
			.run(paneId, chatId, automation.profile_id, model);
		db.prepare("INSERT INTO messages (id, pane_id, role, content, provider, model, thinking, usage_json, created_at, sort_order) VALUES (?, ?, 'user', ?, NULL, NULL, '', NULL, ?, 0)")
			.run(userMessageId, paneId, automation.prompt, stamp);
		db.prepare("INSERT INTO automation_runs (id, automation_id, chat_id, status, error, started_at) VALUES (?, ?, ?, 'running', '', ?)")
			.run(runId, automation.id, chatId, stamp);
		return { runId, chatId, paneId, model, startedAt: stamp };
	});

	function queue(id, baseUrl) {
		const automation = get(id);
		if (!automation) return null;
		if (running.has(automation.id)) {
			const error = new Error("This automation is already running.");
			error.code = "automation_running";
			throw error;
		}
		const context = prepareRun(automation);
		running.add(automation.id);
		const promise = Promise.resolve()
			.then(() => executeChat({ automation, ...context, baseUrl }))
			.then((result) => finishRun(context, result))
			.catch((error) => failRun(context, error))
			.finally(() => running.delete(automation.id));
		return { run: runs(automation.id, 1)[0], promise };
	}

	const finishRun = db.transaction((context, result) => {
		const stamp = now();
		const usage = result.usage && typeof result.usage === "object" ? { ...result.usage } : {};
		if (Number(result.thinking_duration_ms) > 0) usage.thinking_duration_ms = Number(result.thinking_duration_ms);
		if (Number(result.response_time_ms) > 0) usage.response_time_ms = Number(result.response_time_ms);
		if (Array.isArray(result.tool_activity)) usage.tool_activity = result.tool_activity.slice(0, 32);
		db.prepare("INSERT INTO messages (id, pane_id, role, content, provider, model, thinking, usage_json, created_at, sort_order) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, 1)")
			.run(`automation-message-${uid()}`, context.paneId, String(result.content || ""), result.provider || null,
				result.model || context.model || null, String(result.thinking || ""), JSON.stringify(usage), stamp);
		db.prepare("UPDATE panes SET status = 'idle' WHERE id = ?").run(context.paneId);
		db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(stamp, context.chatId);
		db.prepare("UPDATE automation_runs SET status = 'completed', completed_at = ? WHERE id = ?").run(stamp, context.runId);
	});

	const failRun = db.transaction((context, error) => {
		const stamp = now();
		const message = String(error && error.message || "Automation run failed.").slice(0, 2000);
		db.prepare("INSERT INTO messages (id, pane_id, role, content, provider, model, thinking, usage_json, created_at, sort_order) VALUES (?, ?, 'assistant', ?, NULL, ?, '', ?, ?, 1)")
			.run(`automation-message-${uid()}`, context.paneId, `Response failed: ${message}`, context.model || null,
				JSON.stringify({ automation_error: true }), stamp);
		db.prepare("UPDATE panes SET status = 'error' WHERE id = ?").run(context.paneId);
		db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(stamp, context.chatId);
		db.prepare("UPDATE automation_runs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?").run(message, stamp, context.runId);
	});

	function tick(baseUrl) {
		const due = db.prepare("SELECT id FROM automations WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 10").all(now());
		for (const row of due) {
			try {
				queue(row.id, baseUrl);
			} catch (error) {
				if (error.code !== "automation_running") {
					db.prepare("UPDATE automations SET enabled = 0, next_run_at = NULL, updated_at = ? WHERE id = ?").run(now(), row.id);
				}
			}
		}
	}

	function start(baseUrl) {
		if (timer) return;
		tick(baseUrl);
		timer = setInterval(() => tick(baseUrl), 30_000);
		if (typeof timer.unref === "function") timer.unref();
	}

	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
	}

	return { initSchema, list, get, runs, create, update, remove, queue, tick, start, stop };
}

function nextScheduledAt(schedule, fromMs) {
	const [targetHour, targetMinute] = String(schedule.time || schedule.time_local || "09:00").split(":").map(Number);
	const repeat = String(schedule.repeat || schedule.repeat_kind || "daily");
	const weekday = Number(schedule.weekday);
	const timezone = validTimeZone(schedule.timezone) ? schedule.timezone : "UTC";
	const startMinute = Math.floor(Number(fromMs) / 60000) * 60000 + 60000;
	const maxMinutes = 8 * 24 * 60;
	const formatter = datePartsFormatter(timezone);
	for (let offset = 0; offset <= maxMinutes; offset += 1) {
		const candidate = startMinute + (offset * 60000);
		const parts = partsFor(formatter, candidate);
		if (parts.hour !== targetHour || parts.minute !== targetMinute) continue;
		if (repeat === "weekdays" && (parts.weekday === 0 || parts.weekday === 6)) continue;
		if (repeat === "weekly" && parts.weekday !== weekday) continue;
		return candidate;
	}
	return null;
}

function validTimeZone(value) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: String(value || "") }).format(new Date());
		return Boolean(String(value || ""));
	} catch (error) {
		return false;
	}
}

function datePartsFormatter(timeZone) {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}

function partsFor(formatter, timestamp) {
	const values = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
	return {
		hour: Number(values.hour) % 24,
		minute: Number(values.minute),
		weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday)
	};
}

function inputError(message) {
	const error = new Error(message);
	error.code = "invalid_automation";
	return error;
}

module.exports = { createAutomationService, nextScheduledAt, validTimeZone };
