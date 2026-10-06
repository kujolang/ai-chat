const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const Database = require("better-sqlite3");
const { createWorktreeStore } = require("../lib/worktree-store");
const { createAttachmentStore } = require("../lib/attachment-store");
const { createExecutionJournal } = require("../lib/execution-journal");
const { createAgentControlStore } = require("../lib/agent-control-store");
const { createExecutionArtifacts } = require("../lib/execution-artifacts");

test("managed chat worktrees isolate changes and refuse dirty cleanup", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-worktrees-test-"));
	const repository = path.join(root, "repo");
	const managed = path.join(root, "managed");
	fs.mkdirSync(repository);
	git(repository, ["init", "-b", "main"]); git(repository, ["config", "user.email", "test@example.com"]); git(repository, ["config", "user.name", "Test"]);
	fs.writeFileSync(path.join(repository, "file.txt"), "base\n"); git(repository, ["add", "file.txt"]); git(repository, ["commit", "-m", "base"]);
	const db = new Database(":memory:");
	const store = createWorktreeStore(db, { managedRoot: managed });
	const first = store.configure("chat-a", { mode: "worktree", projectPath: repository });
	const second = store.configure("chat-b", { mode: "worktree", projectPath: repository });
	assert.notEqual(store.executionContext("chat-a").cwd, store.executionContext("chat-b").cwd);
	fs.writeFileSync(path.join(store.executionContext("chat-a").cwd, "file.txt"), "chat a\n");
	assert.equal(fs.readFileSync(path.join(store.executionContext("chat-b").cwd, "file.txt"), "utf8"), "base\n");
	assert.throws(() => store.cleanup("chat-a"), (error) => error.code === "workspace_dirty");
	store.commit("chat-a", "chat a change");
	assert.throws(() => store.cleanup("chat-a"), (error) => error.code === "worktree_unmerged");
	git(repository, ["merge", "--ff-only", first.branch]);
	assert.deepEqual(store.cleanup("chat-a"), { cleaned: true });
	assert.deepEqual(store.cleanup("chat-b"), { cleaned: true });
	assert.equal(first.managed && second.managed, true);
	db.close(); fs.rmSync(root, { recursive: true, force: true });
});

test("worktree setup detects dirty source and non-git current workspaces remain honest", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-workspace-test-"));
	const repository = path.join(root, "repo"); fs.mkdirSync(repository);
	git(repository, ["init", "-b", "main"]); git(repository, ["config", "user.email", "test@example.com"]); git(repository, ["config", "user.name", "Test"]);
	fs.writeFileSync(path.join(repository, "file.txt"), "base\n"); git(repository, ["add", "file.txt"]); git(repository, ["commit", "-m", "base"]);
	fs.writeFileSync(path.join(repository, "dirty.txt"), "dirty\n");
	const db = new Database(":memory:"); const store = createWorktreeStore(db, { managedRoot: path.join(root, "managed") });
	assert.throws(() => store.configure("chat", { mode: "worktree", projectPath: repository }), (error) => error.code === "workspace_dirty");
	const plain = path.join(root, "plain"); fs.mkdirSync(plain);
	assert.equal(store.configure("plain", { mode: "current", projectPath: plain }).branch, "");
	db.close(); fs.rmSync(root, { recursive: true, force: true });
});

test("attachments are encrypted, bounded, typed, and expire closed", () => {
	const db = new Database(":memory:"); let now = 1000;
	let store = createAttachmentStore(db, { masterKey: crypto.randomBytes(32), now: () => now, retentionDays: 1 });
	const saved = store.create("chat", { originalname: "notes.md", mimetype: "text/markdown", buffer: Buffer.from("private context") });
	assert.equal(saved.type, "artifact_ref");
	assert.equal(JSON.stringify(db.prepare("SELECT * FROM chat_attachments").get()).includes("private context"), false);
	assert.equal(store.context("chat", [saved.id])[0].text_excerpt, "private context");
	assert.throws(() => store.create("chat", { originalname: "bad.exe", mimetype: "application/octet-stream", buffer: Buffer.from("x") }), (error) => error.code === "unsupported_attachment");
	assert.throws(() => store.create("chat", { originalname: "fake.png", mimetype: "image/png", buffer: Buffer.from("not a png") }), (error) => error.code === "invalid_attachment_content");
	now += 2 * 86400000;
	assert.deepEqual(store.context("chat", [saved.id]), []);
	db.close();
});

test("execution artifact rail remains scoped by chat and redacts preview secrets", () => {
	const db = new Database(":memory:");
	const journal = createExecutionJournal(db, { masterKey: crypto.randomBytes(32) });
	const controls = createAgentControlStore(db);
	controls.start("run-a", { chatId: "chat-a", paneId: "pane-a" }); controls.start("run-b", { chatId: "chat-b", paneId: "pane-b" });
	journal.begin("run-a", "turn-a", { assistant_message_id: "message-a" });
	journal.startCall("run-a", "call-a", "local_shell", { command: "test" });
	journal.completeCall("run-a", "call-a", { stdout: "api_key=abcdefghijklmnopqrst" });
	journal.finish("run-a", { ok: true });
	const artifacts = createExecutionArtifacts(db, journal);
	const result = artifacts.list("chat-a");
	assert.equal(result.length, 1); assert.equal(result[0].pane_id, "pane-a");
	assert.match(result[0].artifacts[0].preview, /\[redacted\]/); assert.equal(JSON.stringify(result).includes("run-b"), false);
	assert.equal(artifacts.read("chat-b", "run-a", "call-a"), null);
	db.close();
});

test("browser exposes worktree, attachment, typed context, and artifact rail controls", () => {
	const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
	const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
	for (const marker of ["chat-workspace-mode", "New worktree", "composer-attachment-input", "artifact-rail", "data-artifact-filter"]) assert.match(html, new RegExp(marker));
	for (const marker of ["message_parts", "attachment_ids", "uploadComposerAttachments", "openArtifactRail", "configureActiveChatWorkspace"]) assert.match(app, new RegExp(marker));
});

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }); }
