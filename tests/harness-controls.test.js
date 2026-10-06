const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const Database = require("better-sqlite3");
const { createApprovalStore } = require("../lib/approval-store");
const { createCheckpointStore } = require("../lib/checkpoint-store");
const { createDiffReviewStore } = require("../lib/diff-review-store");
const { createAgentControlStore } = require("../lib/agent-control-store");

test("interactive approvals bind decisions and grants to exact arguments and scope", async () => {
	const db = new Database(":memory:");
	let clock = 1000;
	let sequence = 0;
	const store = createApprovalStore(db, { now: () => clock, timeoutMs: 30_000, uid: () => `id${++sequence}` });
	const input = { root_id: "workspace-a", command: "npm", args: ["test"] };
	const requested = store.request({ executionId: "run-a", chatId: "chat-a", paneId: "pane-a", workspaceId: "workspace-a", toolName: "local_shell", input, summary: "Run npm", risk: "write" });
	assert.equal(requested.granted, false);
	const waiting = store.wait(requested.approval.id);
	const decision = store.decide(requested.approval.id, { decision: "approve", scope: "chat" });
	assert.equal(decision.status, "approved");
	assert.equal((await waiting).decision_scope, "chat");
	assert.equal(store.request({ executionId: "run-b", chatId: "chat-a", paneId: "pane-b", workspaceId: "workspace-a", toolName: "local_shell", input, summary: "Run npm" }).granted, true);
	assert.equal(store.request({ executionId: "run-c", chatId: "chat-b", paneId: "pane-c", workspaceId: "workspace-a", toolName: "local_shell", input, summary: "Run npm" }).granted, false);
	assert.equal(store.request({ executionId: "run-d", chatId: "chat-a", paneId: "pane-d", workspaceId: "workspace-a", toolName: "local_shell", input: { ...input, args: ["run", "build"] }, summary: "Run npm" }).granted, false);
	db.close();
});

test("approval expiry fails closed and never stores raw arguments", async () => {
	const db = new Database(":memory:");
	let clock = 1000;
	const store = createApprovalStore(db, { now: () => clock, timeoutMs: 30_000, uid: () => "expiry" });
	const requested = store.request({ executionId: "run", chatId: "chat", workspaceId: "workspace", toolName: "local_file_write", input: { content: "private payload" }, summary: "Write file" });
	const columns = db.prepare("SELECT * FROM action_approvals WHERE id = ?").get(requested.approval.id);
	assert.equal(JSON.stringify(columns).includes("private payload"), false);
	clock = 40_000;
	assert.throws(() => store.decide(requested.approval.id, { decision: "approve" }), (error) => error.code === "approval_expired");
	assert.equal(store.list({ executionId: "run" })[0].status, "expired");
	db.close();
});

test("checkpoints restore exact files and refuse concurrent manual edits", () => {
	const db = new Database(":memory:");
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-checkpoint-"));
	const target = path.join(root, "sample.js");
	fs.writeFileSync(target, "const value = 1;\n", "utf8");
	const store = createCheckpointStore(db, { masterKey: crypto.randomBytes(32), now: () => 1000 });
	const checkpoint = store.ensure({ executionId: "run", chatId: "chat", paneId: "pane", turnId: "turn" });
	fs.writeFileSync(target, "const value = 2;\n", "utf8");
	store.capture("run", { path: "sample.js", absolute_path: target, workspace_id: "root", before: "const value = 1;\n", after: "const value = 2;\n" });
	const restored = store.restore(checkpoint.id, { filePath: "sample.js" });
	assert.deepEqual(restored.restored, ["sample.js"]);
	assert.equal(fs.readFileSync(target, "utf8"), "const value = 1;\n");
	fs.writeFileSync(target, "manual edit\n", "utf8");
	assert.throws(() => store.restore(checkpoint.id, { filePath: "sample.js" }), (error) => error.code === "checkpoint_conflict");
	fs.rmSync(root, { recursive: true, force: true });
	db.close();
});

test("checkpoints revert one selected hunk without reverting another", () => {
	const db = new Database(":memory:");
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-hunk-"));
	const target = path.join(root, "sample.txt");
	const before = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\n";
	const after = "ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nNINE\n";
	fs.writeFileSync(target, after, "utf8");
	const store = createCheckpointStore(db, { masterKey: crypto.randomBytes(32) });
	const checkpoint = store.ensure({ executionId: "run", chatId: "chat", paneId: "pane", turnId: "turn" });
	store.capture("run", { path: "sample.txt", absolute_path: target, before, after });
	store.restore(checkpoint.id, { filePath: "sample.txt", hunkIndex: 0 });
	const current = fs.readFileSync(target, "utf8");
	assert.match(current, /^one\n/);
	assert.match(current, /NINE\n$/);
	fs.rmSync(root, { recursive: true, force: true });
	db.close();
});

test("diff review state and comments persist independently per hunk", () => {
	const db = new Database(":memory:");
	const store = createDiffReviewStore(db, { now: () => 1234 });
	store.update("run", { path: "src/app.js", hunk_index: 0, status: "accepted", comment: "Looks good" });
	store.update("run", { path: "src/app.js", hunk_index: 1, status: "unreviewed", comment: "Needs a test" });
	const records = store.list("run");
	assert.equal(records.length, 2);
	assert.equal(records[0].status, "accepted");
	assert.equal(records[1].comment, "Needs a test");
	db.close();
});

test("checkpoint retention removes payloads while preserving checkpoint identity", () => {
	const db = new Database(":memory:");
	let clock = 1000;
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-retention-"));
	const target = path.join(root, "sample.txt");
	fs.writeFileSync(target, "after\n", "utf8");
	let store = createCheckpointStore(db, { masterKey: Buffer.alloc(32, 1), now: () => clock, retentionDays: 1 });
	store.ensure({ executionId: "run", chatId: "chat" });
	store.capture("run", { path: "sample.txt", absolute_path: target, before: "before\n", after: "after\n" });
	clock += 2 * 24 * 60 * 60 * 1000;
	store = createCheckpointStore(db, { masterKey: Buffer.alloc(32, 1), now: () => clock, retentionDays: 1 });
	assert.ok(store.getByExecution("run"));
	assert.deepEqual(store.getByExecution("run").files, []);
	fs.rmSync(root, { recursive: true, force: true });
	db.close();
});

test("plans and steering are durable, ordered, and consumed once", () => {
	const db = new Database(":memory:");
	let sequence = 0;
	const store = createAgentControlStore(db, { now: () => 1000 + sequence, uid: () => `id${++sequence}` });
	const plan = store.start("run", { chatId: "chat", paneId: "pane" });
	assert.equal(plan.steps[0].state, "active");
	assert.equal(store.completeThrough("run", "verify").steps[2].state, "active");
	store.steer("run", { mode: "immediate", prompt: "Use the smaller fixture" });
	store.steer("run", { mode: "queued", prompt: "Now write release notes" });
	assert.equal(store.consume("run", "immediate")[0].prompt, "Use the smaller fixture");
	assert.deepEqual(store.consume("run", "immediate"), []);
	assert.equal(store.consume("run", "queued")[0].prompt, "Now write release notes");
	assert.ok(store.finish("run").steps.every((step) => step.state === "completed"));
	db.close();
});

test("browser client exposes approval, plan, review, checkpoint and steering controls", () => {
	const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
	const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
	for (const marker of ["Allow once", "Allow for chat", "Always this exact action", "Rewind &amp; fork", "Revert hunk", "execution-plan", "interactive_approvals"]) assert.match(app, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(html, /composer-steering-mode/);
	assert.match(html, /cancel_after_action/);
});
