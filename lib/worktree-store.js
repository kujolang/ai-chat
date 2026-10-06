const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function createWorktreeStore(db, { managedRoot, now = Date.now } = {}) {
	const root = path.resolve(managedRoot);
	fs.mkdirSync(root, { recursive: true, mode: 0o700 });
	db.exec(`CREATE TABLE IF NOT EXISTS chat_workspaces (
		chat_id TEXT PRIMARY KEY, mode TEXT NOT NULL, source_path TEXT NOT NULL,
		worktree_path TEXT NOT NULL DEFAULT '', repository_root TEXT NOT NULL DEFAULT '',
		branch TEXT NOT NULL DEFAULT '', base_revision TEXT NOT NULL DEFAULT '',
		port INTEGER NOT NULL DEFAULT 0, data_path TEXT NOT NULL DEFAULT '', managed INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
	)`);

	function configure(chatId, { mode = "current", projectPath = "" } = {}) {
		if (!["current", "worktree", "read_only"].includes(mode)) throw failure("invalid_workspace_mode", "Choose current, worktree, or read_only.");
		const prior = db.prepare("SELECT * FROM chat_workspaces WHERE chat_id = ?").get(chatId);
		if (prior?.managed && mode === "worktree" && fs.existsSync(prior.worktree_path)) return status(chatId);
		if (prior?.managed && mode !== "worktree") throw failure("worktree_cleanup_required", "Clean up the managed worktree before changing workspace mode.");
		const source = path.resolve(String(projectPath || ""));
		if (!projectPath || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw failure("workspace_not_found", "Choose an existing project folder.");
		const repositoryRoot = git(source, ["rev-parse", "--show-toplevel"], { optional: true });
		if (mode === "worktree" && !repositoryRoot) throw failure("git_required", "A new worktree requires a Git repository.");
		let worktreePath = source;
		let branch = repositoryRoot ? git(repositoryRoot, ["branch", "--show-current"], { optional: true }) : "";
		let baseRevision = repositoryRoot ? git(repositoryRoot, ["rev-parse", "HEAD"]) : "";
		let managed = 0;
		if (mode === "worktree") {
			if (git(repositoryRoot, ["status", "--porcelain"])) throw failure("workspace_dirty", "Commit or stash existing changes before creating an isolated worktree.");
			const suffix = crypto.createHash("sha256").update(String(chatId)).digest("hex").slice(0, 10);
			branch = `codex/chat-${suffix}`;
			worktreePath = path.join(root, suffix);
			if (fs.existsSync(worktreePath)) throw failure("worktree_exists", "This chat already has a managed worktree directory.");
			git(repositoryRoot, ["worktree", "add", "-b", branch, worktreePath, baseRevision]);
			managed = 1;
		}
		const port = 4300 + Number.parseInt(crypto.createHash("sha256").update(String(chatId)).digest("hex").slice(0, 4), 16) % 1000;
		const dataPath = managed ? path.join(worktreePath, ".ai-chat-runtime") : "";
		db.prepare(`INSERT INTO chat_workspaces(chat_id,mode,source_path,worktree_path,repository_root,branch,base_revision,port,data_path,managed,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET mode=excluded.mode,source_path=excluded.source_path,
			worktree_path=excluded.worktree_path,repository_root=excluded.repository_root,branch=excluded.branch,base_revision=excluded.base_revision,
			port=excluded.port,data_path=excluded.data_path,managed=excluded.managed,updated_at=excluded.updated_at`).run(
			chatId, mode, source, worktreePath, repositoryRoot || "", branch || "", baseRevision || "", port, dataPath, managed, now(), now()
		);
		return status(chatId);
	}

	function status(chatId) {
		const row = db.prepare("SELECT * FROM chat_workspaces WHERE chat_id = ?").get(chatId);
		if (!row) return null;
		const gitRoot = row.repository_root;
		let dirty = false, conflicts = false, ahead = 0, behind = 0, head = row.base_revision;
		if (gitRoot && fs.existsSync(row.worktree_path)) {
			const porcelain = git(row.worktree_path, ["status", "--porcelain"], { optional: true });
			dirty = Boolean(porcelain); conflicts = porcelain.split("\n").some((line) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(line));
			head = git(row.worktree_path, ["rev-parse", "HEAD"], { optional: true }) || row.base_revision;
			const counts = git(row.worktree_path, ["rev-list", "--left-right", "--count", `${row.base_revision}...HEAD`], { optional: true }).split(/\s+/).map(Number);
			behind = counts[0] || 0; ahead = counts[1] || 0;
		}
		return {
			chat_id: row.chat_id, mode: row.mode, repository: gitRoot ? path.basename(gitRoot) : path.basename(row.source_path),
			worktree_label: row.managed ? path.basename(row.worktree_path) : "Current workspace", branch: row.branch,
			base_revision: row.base_revision, head_revision: head, dirty, conflicts, ahead, behind,
			read_only: row.mode === "read_only", managed: Boolean(row.managed), port: row.port,
			data_label: row.data_path ? ".ai-chat-runtime" : ""
		};
	}

	function commit(chatId, message) {
		const row = required(chatId);
		if (row.mode === "read_only") throw failure("workspace_read_only", "This chat workspace is read-only.");
		if (!String(message || "").trim()) throw failure("commit_message_required", "A commit message is required.");
		git(row.worktree_path, ["add", "-A"]);
		git(row.worktree_path, ["commit", "-m", String(message).trim().slice(0, 200)]);
		return status(chatId);
	}

	function prepare(chatId) {
		const row = required(chatId); const current = status(chatId);
		if (!row.managed) throw failure("managed_worktree_required", "Merge preparation is available for managed worktrees.");
		if (current.dirty || current.conflicts) throw failure("workspace_dirty", "Resolve and commit worktree changes before merge preparation.");
		return { ...current, ready: true, target_branch: git(row.repository_root, ["branch", "--show-current"], { optional: true }), commits: git(row.worktree_path, ["log", "--oneline", `${row.base_revision}..HEAD`], { optional: true }).split("\n").filter(Boolean).slice(0, 100) };
	}

	function cleanup(chatId) {
		const row = required(chatId); const current = status(chatId);
		if (!row.managed || !isInside(root, row.worktree_path)) throw failure("cleanup_not_managed", "Only AI Chat-managed worktrees can be cleaned up.");
		if (current.dirty || current.conflicts) throw failure("workspace_dirty", "Cleanup refused because the worktree has uncommitted or conflicted changes.");
		const merged = git(row.repository_root, ["merge-base", "--is-ancestor", row.branch, git(row.repository_root, ["branch", "--show-current"])], { optional: true, acceptOne: true });
		if (merged === null) throw failure("worktree_unmerged", "Cleanup refused because the worktree branch is not merged into the current branch.");
		git(row.repository_root, ["worktree", "remove", row.worktree_path]);
		db.prepare("DELETE FROM chat_workspaces WHERE chat_id = ?").run(chatId);
		return { cleaned: true };
	}
	function executionContext(chatId) {
		const row = db.prepare("SELECT * FROM chat_workspaces WHERE chat_id = ?").get(chatId);
		return row && fs.existsSync(row.worktree_path) ? { cwd: row.worktree_path, mode: row.mode, read_only: row.mode === "read_only", managed: Boolean(row.managed) } : null;
	}
	function required(chatId) { const row = db.prepare("SELECT * FROM chat_workspaces WHERE chat_id = ?").get(chatId); if (!row) throw failure("workspace_not_configured", "This chat has no configured workspace."); return row; }
	return { configure, status, executionContext, commit, prepare, cleanup };
}

function git(cwd, args, { optional = false, acceptOne = false } = {}) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, windowsHide: true, env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "" } });
	if (acceptOne && result.status === 0) return "";
	if (acceptOne && result.status === 1) return null;
	if (result.status !== 0) { if (optional) return ""; throw failure("git_operation_failed", String(result.stderr || "Git operation failed.").trim().slice(0, 1000)); }
	return String(result.stdout || "").trim();
}
function isInside(root, target) { const relative = path.relative(root, target); return relative && !relative.startsWith("..") && !path.isAbsolute(relative); }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createWorktreeStore };
