const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createExecutionJournal } = require("../lib/execution-journal");

test("durable receipt survives database reopen and suppresses repeated call execution", () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-journal-"));
	const file = path.join(temp, "test.db");
	let db = new Database(file);
	try {
		let journal = createExecutionJournal(db, { secret: "fixture-secret" });
		journal.begin("run", "turn", { model: "fixture" });
		journal.startCall("run", "call", "local_file_write", { content: "sensitive fixture content" });
		journal.completeCall("run", "call", { ok: true, path: "done.md" });
		journal.checkpoint("run", { messages: [{ role: "user", content: "continue" }] });
		journal.appendEvent("run", "token", { delta: "partial" });
		db.close();
		assert.ok(!fs.readFileSync(file).includes(Buffer.from("sensitive fixture content")));
		db = new Database(file);
		journal = createExecutionJournal(db, { secret: "fixture-secret" });
		assert.deepEqual(journal.recover(), ["run"]);
		assert.throws(() => journal.begin("run", "turn", { model: "fixture" }), { code: "execution_resume_required" });
		assert.equal(journal.begin("run", "turn", { model: "fixture" }, { resume: true }).resumed, true);
		assert.deepEqual(journal.startCall("run", "call", "local_file_write", { content: "sensitive fixture content" }).result, { ok: true, path: "done.md" });
		assert.equal(journal.events("run")[0].data.delta, "partial");
		journal.finish("run", { output_text: "Finished" });
		assert.equal(journal.begin("run", "turn", { model: "fixture" }).replay, true);
		assert.throws(() => journal.begin("run", "turn", { model: "different" }), { code: "execution_conflict" });
	} finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});

test("an interrupted in-flight action requires reconciliation and cannot auto-replay", () => {
	const db = new Database(":memory:");
	try {
		const journal = createExecutionJournal(db, { secret: "fixture-secret" });
		journal.begin("run", "turn", {});
		journal.startCall("run", "call", "action_adapter_call", { id: "publish" });
		journal.recover();
		assert.equal(journal.receipts("run")[0].status, "uncertain");
		assert.throws(() => journal.begin("run", "turn", {}, { resume: true }), { code: "execution_reconciliation_required" });
	} finally { db.close(); }
});

test("operator reconciliation resolves an uncertain outcome without discarding evidence", () => {
	const db = new Database(":memory:");
	try {
		const journal = createExecutionJournal(db, { secret: "fixture-secret" });
		journal.begin("run", "turn", {});
		journal.startCall("run", "call", "action_adapter_call", { id: "publish" });
		journal.recover();
		journal.reconcile("run", "call", { disposition: "completed", result: { ok: true, document_id: "verified" }, evidence: "Operator checked the service and confirmed document ID verified." });
		journal.begin("run", "turn", {}, { resume: true });
		assert.equal(journal.startCall("run", "call", "action_adapter_call", { id: "publish" }).replay, true);
		assert.equal(journal.events("run")[0].event, "reconciliation");
	} finally { db.close(); }
});

test("live database ownership prevents a second runtime from recovering active work", () => {
	const db = new Database(":memory:");
	try {
		const first = createExecutionJournal(db, { secret: "fixture-secret", claimOwnership: true });
		first.begin("live", "turn", {});
		assert.throws(() => createExecutionJournal(db, { secret: "fixture-secret", claimOwnership: true }), { code: "execution_database_in_use" });
		assert.equal(first.get("live").status, "running");
		first.release();
		const second = createExecutionJournal(db, { secret: "fixture-secret", claimOwnership: true });
		assert.deepEqual(second.recover(), ["live"]);
		second.release();
	} finally { db.close(); }
});
