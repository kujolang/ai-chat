const assert = require("node:assert/strict");
const { test } = require("node:test");

const { nextScheduledAt } = require("../lib/automation-service");

test("daily automation does not run twice during a repeated DST wall-clock hour", () => {
	const schedule = {
		repeat: "daily",
		time: "01:30",
		timezone: "America/New_York",
		weekday: 0
	};
	const firstOccurrence = Date.parse("2026-11-01T05:30:00.000Z");
	const next = nextScheduledAt(schedule, firstOccurrence);

	assert.equal(new Date(next).toISOString(), "2026-11-02T06:30:00.000Z");
});

const Database = require("better-sqlite3");
const { createAutomationService } = require("../lib/automation-service");
function serviceFixture(t, executeChat = async () => ({ content: "done" })) {
 const db = new Database(":memory:");
 db.pragma("foreign_keys = ON");
 db.exec(`CREATE TABLE profiles (id TEXT PRIMARY KEY, models_csv TEXT);
 CREATE TABLE chats (id TEXT PRIMARY KEY, route_id TEXT, title TEXT, project_path TEXT, pinned INTEGER, archived INTEGER, created_at INTEGER, updated_at INTEGER, sort_order INTEGER);
 CREATE TABLE panes (id TEXT PRIMARY KEY, chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE, profile_id TEXT, model TEXT, status TEXT, sort_order INTEGER);
 CREATE TABLE messages (id TEXT PRIMARY KEY, pane_id TEXT REFERENCES panes(id) ON DELETE CASCADE, role TEXT, content TEXT, provider TEXT, model TEXT, thinking TEXT, usage_json TEXT, created_at INTEGER, sort_order INTEGER);
 INSERT INTO profiles VALUES ('fixture', 'test-model');`);
 let id = 0;
 const service = createAutomationService({ db, nowFn: () => Date.parse("2026-09-26T12:00:00Z"), uidFn: () => String(++id), routeIdFn: () => String(++id), executeChat });
 service.initSchema();
 t.after(async () => { await service.close(); db.close(); });
 const create = (extra = {}) => service.create({ title: "Test", prompt: "Hello", profile_id: "fixture", repeat: "weekly", weekday: 0, time: "09:00", timezone: "UTC", ...extra });
 return { db, service, create };
}

test("Sunday schedules survive create/update and select Sunday rather than Monday", t => {
 const { service, create } = serviceFixture(t);
 const created = create();
 assert.equal(created.weekday, 0);
 assert.equal(new Date(created.next_run_at).toISOString(), "2026-09-27T09:00:00.000Z");
 const updated = service.update(created.id, { ...created, weekday: "0" });
 assert.equal(updated.weekday, 0);
 assert.equal(updated.next_run_at, created.next_run_at);
});

test("automation close cancels transport, saves failure, drains and rejects new admission", async t => {
 let entered;
 const started = new Promise(resolve => { entered = resolve; });
 const { db, service, create } = serviceFixture(t, ({ signal }) => new Promise((resolve, reject) => {
  entered();
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
 }));
 const automation = create();
 const queued = service.queue(automation.id, "http://fixture.invalid");
 await started;
 assert.equal(service.activeCount(), 1);
 await service.close();
 await queued.promise;
 assert.equal(service.activeCount(), 0);
 assert.equal(service.runs(automation.id)[0].status, "failed");
 assert.match(db.prepare("SELECT content FROM messages WHERE role='assistant'").get().content, /server stopped/);
 assert.throws(() => service.queue(automation.id, ""), { code: "server_shutting_down" });
});

test("deleting a chat during an automation neither resurrects it nor rejects persistence", async t => {
 let finish;
 const { db, service, create } = serviceFixture(t, () => new Promise(resolve => { finish = resolve; }));
 const automation = create();
 const queued = service.queue(automation.id, "");
 await Promise.resolve();
 db.prepare("DELETE FROM chats WHERE id=?").run(queued.run.chat_id);
 finish({ content: "completed after deletion" });
 await queued.promise;
 assert.equal(db.prepare("SELECT count(*) AS n FROM chats").get().n, 0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM messages").get().n, 0);
 assert.equal(service.activeCount(), 0);
 assert.equal(service.runs(automation.id)[0].status, "completed");
});
