function createExecutionArtifacts(db, executionJournal) {
	function list(chatId) {
		const runs = db.prepare("SELECT execution_id, pane_id, updated_at FROM execution_plans WHERE chat_id = ? ORDER BY updated_at DESC LIMIT 100").all(chatId);
		return runs.map((entry) => {
			const run = executionJournal.get(entry.execution_id);
			if (!run) return null;
			const receipts = executionJournal.receipts(run.id).slice(0, 100).map((receipt) => artifact(run, entry.pane_id, receipt));
			return { execution_id: run.id, pane_id: entry.pane_id, message_id: run.request?.assistant_message_id || run.turn_id, status: normalizeStatus(run.status), updated_at: run.updated_at, artifacts: receipts };
		}).filter(Boolean);
	}
	function read(chatId, executionId, callId) {
		const owner = db.prepare("SELECT 1 FROM execution_plans WHERE chat_id = ? AND execution_id = ?").get(chatId, executionId);
		if (!owner) return null;
		const receipt = executionJournal.readResult(executionId, callId);
		return receipt ? { execution_id: executionId, call_id: callId, tool_name: receipt.tool_name, status: normalizeStatus(receipt.status), result: sanitize(receipt.result, 64_000) } : null;
	}
	return { list, read };
}
function artifact(run, paneId, receipt) {
	const category = receipt.status === "failed" ? "errors" : /shell|kujo/.test(receipt.tool_name) ? "commands" : /browser/.test(receipt.tool_name) ? "browser" : /file_write/.test(receipt.tool_name) ? "files" : /search|fetch|documentation/.test(receipt.tool_name) ? "sources" : "tests";
	return { id: `${run.id}:${receipt.call_id}`, call_id: receipt.call_id, tool_name: receipt.tool_name, category, status: normalizeStatus(receipt.status), pane_id: paneId, preview: sanitize(receipt.result, 1200), truncated: JSON.stringify(receipt.result || null).length > 1200 };
}
function normalizeStatus(status) { return ({ completed: "passed", failed: "failed", cancelled: "cancelled", uncertain: "uncertain", started: "uncertain", not_started: "unavailable" })[status] || status; }
function sanitize(value, max) {
	let text = typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
	text = text.replace(/(?:sk-|Bearer\s+|api[_-]?key["'=:\s]+)[A-Za-z0-9._-]{12,}/gi, "[redacted]");
	return text.slice(0, max);
}
module.exports = { createExecutionArtifacts };
