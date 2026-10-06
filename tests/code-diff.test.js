const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createCodeDiffTracker, createNativeFileChangeObserver } = require("../lib/code-diff");
const { createLocalRuntime } = require("../lib/local-runtime");

test("code diff tracker accumulates a file against its first observed contents", () => {
	const tracker = createCodeDiffTracker();
	tracker.record({ path: "src/app.js", before: "const value = 1;\n", after: "const value = 2;\n", source: "local_file_write" });
	const result = tracker.record({ path: "src/app.js", before: "const value = 2;\n", after: "const value = 3;\n", source: "local_file_write" });

	assert.equal(result.files.length, 1);
	assert.equal(result.files[0].status, "modified");
	assert.equal(result.files[0].additions, 1);
	assert.equal(result.files[0].deletions, 1);
	assert.deepEqual(result.files[0].hunks[0].lines.filter((line) => line.type !== "context"), [
		{ type: "delete", content: "const value = 1;" },
		{ type: "add", content: "const value = 3;" }
	]);
});

test("code diff tracker handles added and deleted files without retaining unchanged entries", () => {
	const tracker = createCodeDiffTracker();
	tracker.record({ path: "new.txt", before: null, after: "hello\n" });
	tracker.record({ path: "old.txt", before: "goodbye\n", after: null });
	tracker.record({ path: "same.txt", before: "same\n", after: "same\n" });
	const result = tracker.snapshot();

	assert.deepEqual(result.files.map((file) => file.status), ["added", "deleted"]);
	assert.equal(result.totals.additions, 1);
	assert.equal(result.totals.deletions, 1);
});

test("code diff tracker bounds oversized and binary previews", () => {
	const tracker = createCodeDiffTracker({ maxFileBytes: 1024, maxTotalBytes: 1024 });
	tracker.record({ path: "large.txt", before: "", after: "x".repeat(2048) });
	tracker.record({ path: "binary.dat", before: "a\u0000b", after: "c\u0000d" });
	const result = tracker.snapshot();

	assert.equal(result.files.length, 2);
	assert.equal(result.files[0].truncated, true);
	assert.equal(result.files[1].binary, true);
	assert.equal(result.truncated, true);
});

test("code diff tracker applies one rendered-line budget across files", () => {
	const tracker = createCodeDiffTracker({ maxRenderedLines: 100 });
	tracker.record({ path: "first.txt", before: null, after: `${Array.from({ length: 75 }, (_, index) => `first ${index}`).join("\n")}\n` });
	const result = tracker.record({ path: "second.txt", before: null, after: `${Array.from({ length: 75 }, (_, index) => `second ${index}`).join("\n")}\n` });
	const renderedLines = result.files.flatMap((file) => file.hunks).flatMap((hunk) => hunk.lines);

	assert.equal(renderedLines.length, 100);
	assert.equal(result.files[1].truncated, true);
	assert.equal(result.truncated, true);
});

test("local file writes report code changes through the request callback", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-code-diff-"));
	try {
		fs.writeFileSync(path.join(root, "example.js"), "const before = true;\n");
		const runtime = createLocalRuntime({
			projectRoot: root,
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WRITE_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: root
			}
		});
		const changes = [];
		const requestState = {};
		runtime.readFile({ root_id: "workspace_0", path: "example.js" }, { requestState });
		runtime.writeFile(
			{ root_id: "workspace_0", path: "example.js", mode: "overwrite", content: "const after = true;\n" },
			{ requestState, onCodeChange: (change) => changes.push(change) }
		);

		assert.equal(changes.length, 1);
		assert.equal(changes[0].path, "example.js");
		assert.equal(changes[0].before, "const before = true;\n");
		assert.equal(changes[0].after, "const after = true;\n");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("native Codex file-change events capture bounded workspace edits and skip sensitive paths", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-native-diff-"));
	try {
		const source = path.join(root, "main.js");
		const sensitive = path.join(root, ".env");
		fs.writeFileSync(source, "export const value = 1;\n");
		fs.writeFileSync(sensitive, "SECRET=before\n");
		const changes = [];
		const observe = createNativeFileChangeObserver(root, (change) => changes.push(change));
		const started = { type: "item.started", item: { id: "change-1", type: "file_change", changes: [{ path: source }, { path: sensitive }] } };
		observe(started);
		fs.writeFileSync(source, "export const value = 2;\n");
		fs.writeFileSync(sensitive, "SECRET=after\n");
		observe({ ...started, type: "item.completed" });

		assert.deepEqual(changes, [{
			path: "main.js",
			before: "export const value = 1;\n",
			after: "export const value = 2;\n",
			source: "codex_file_change"
		}]);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("browser client includes live, persisted, split, unified, and copy diff affordances", () => {
	const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
	const css = fs.readFileSync(path.join(__dirname, "..", "public", "app.css"), "utf8");
	assert.match(app, /eventName === "diff"/);
	assert.match(app, /usage\.code_diffs = assistantMessage\.code_diffs/);
	assert.match(app, /function renderUnifiedDiffHunk/);
	assert.match(app, /function renderSplitDiffHunk/);
	assert.match(app, /function formatCodeDiffPatch/);
	assert.match(css, /\.code-diff-row\.add/);
	assert.match(css, /\.pane-grid\.cols-2 \.code-diff-mode/);
});
