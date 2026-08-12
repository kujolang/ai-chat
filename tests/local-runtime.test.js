const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { PassThrough } = require("stream");

const { createLocalRuntime } = require("../lib/local-runtime");

function fakeChild(run) {
	const child = new EventEmitter();
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.kills = [];
	child.kill = (signal) => {
		child.kills.push(signal);
		queueMicrotask(() => child.emit("close", null, signal));
		return true;
	};
	queueMicrotask(() => run(child));
	return child;
}

test("local runtime lists and reads bounded non-sensitive workspace files", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "README.md"), "# Hello\n");
		fs.writeFileSync(path.join(tempRoot, ".env"), "SECRET=value\n");
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});

		const workspaces = runtime.listWorkspaces();
		assert.equal(workspaces.workspaces.length, 1);
		assert.equal(workspaces.workspaces[0].id, "workspace_0");
		assert.equal(JSON.stringify(workspaces).includes(tempRoot), false);

		const listed = runtime.listFiles({ root_id: "workspace_0", path: "." });
		assert.deepEqual(listed.entries.map((entry) => entry.name), ["README.md"]);

		const read = runtime.readFile({ root_id: "workspace_0", path: "README.md" });
		assert.equal(read.content, "1\t# Hello");
		assert.equal(read.complete, true);
		assert.equal(read.truncated, false);
		assert.throws(() => runtime.readFile({ root_id: "workspace_0", path: ".env" }), (error) => error.code === "local_path_sensitive");
		assert.throws(() => runtime.readFile({ root_id: "workspace_0", path: "../README.md" }), (error) => error.code === "local_path_blocked" || error.code === "local_path_not_found");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local file listing reports truncation only when eligible entries remain", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "one.md"), "one");
		fs.writeFileSync(path.join(tempRoot, "two.md"), "two");
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot, AI_CHAT_LOCAL_MAX_ENTRIES: "2" },
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		assert.equal(runtime.listFiles({ max_entries: 2 }).truncated, false);
		fs.writeFileSync(path.join(tempRoot, "three.md"), "three");
		assert.equal(runtime.listFiles({ max_entries: 2 }).truncated, true);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local reads expose deterministic line pagination and recovery notes", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "lines.txt"), "one\ntwo\nthree\nfour");
		fs.writeFileSync(path.join(tempRoot, "empty.txt"), "");
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		const first = runtime.readFile({ path: "lines.txt", limit: 2 });
		assert.equal(first.content, "1\tone\n2\ttwo");
		assert.equal(first.truncated, true);
		assert.equal(first.meta.truncation_reason, "line_limit");
		assert.equal(first.next_offset, 3);
		assert.equal(first.next_column, 1);
		const second = runtime.readFile({ path: "lines.txt", offset: first.next_offset, column: first.next_column, limit: 2 });
		assert.equal(second.content, "3\tthree\n4\tfour");
		assert.equal(second.truncated, false);
		assert.equal(second.complete, false);
		const empty = runtime.readFile({ path: "empty.txt" });
		assert.equal(empty.content, "");
		assert.match(empty.note, /empty/i);
		const eof = runtime.readFile({ path: "lines.txt", offset: 99 });
		assert.equal(eof.content, "");
		assert.match(eof.note, /beyond the end/i);
		assert.equal(eof.meta.past_eof, true);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local reads are Unicode safe, exact at boundaries, and strict about numeric inputs", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "exact.txt"), "x".repeat(1000));
		fs.writeFileSync(path.join(tempRoot, "unicode.txt"), `${"a".repeat(999)}😀tail`);
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		const exact = runtime.readFile({ path: "exact.txt", max_chars: 1000, max_line_chars: 2000 });
		assert.equal(exact.truncated, false);
		assert.equal(exact.complete, true);
		const unicode = runtime.readFile({ path: "unicode.txt", max_chars: 1000, max_line_chars: 2000 });
		assert.equal(unicode.truncated, true);
		assert.equal(unicode.next_column, 1000);
		assert.doesNotMatch(unicode.content, /[\uD800-\uDBFF]$/);
		assert.throws(() => runtime.readFile({ path: "exact.txt", max_chars: "2abc" }), (error) => error.code === "invalid_tool_arguments");
		assert.throws(() => runtime.readFile({ path: "exact.txt", offset: 1.5 }), (error) => error.code === "invalid_tool_arguments");
		assert.equal(runtime.readFile({ path: "exact.txt", max_chars: "1000" }).complete, true);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local reads clamp huge lines, stream oversized files, and resume by column", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "bundle.js"), "z".repeat(600 * 1024));
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		const first = runtime.readFile({ path: "bundle.js", max_line_chars: 100, max_chars: 4000 });
		assert.equal(first.complete, false);
		assert.equal(first.truncated, true);
		assert.equal(first.meta.truncation_reason, "line_character_limit");
		assert.equal(first.next_offset, 1);
		assert.equal(first.next_column, 101);
		assert.ok(first.content.length < 300);
		assert.equal(first.meta.source_bytes, 600 * 1024);
		assert.equal(first.meta.clamped_lines[0].next_column, 101);
		const resumed = runtime.readFile({ path: "bundle.js", column: 101, max_line_chars: 100, max_chars: 4000 });
		assert.match(resumed.content, /^1\tz{100}/);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local reads repair invisible Unicode filenames and suggest nearby names", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "Screenshot 3.04\u202fPM.txt"), "image note");
		fs.writeFileSync(path.join(tempRoot, "AGENTS.md"), "rules");
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		assert.match(runtime.readFile({ path: "Screenshot 3.04 PM.txt" }).content, /image note/);
		assert.throws(() => runtime.readFile({ path: "AGENT.md" }), (error) => error.code === "local_path_not_found" && /AGENTS\.md/.test(error.retry_hint));
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local file paths preserve repeated spaces exactly", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "two  spaces.txt"), "exact path");
		const runtime = createLocalRuntime({
			projectRoot: tempRoot,
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WRITE_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot
			}
		});

		assert.match(runtime.readFile({ path: "two  spaces.txt" }).content, /exact path/);
		runtime.writeFile({ path: "new  note.md", content: "created", mode: "create" });
		assert.equal(fs.readFileSync(path.join(tempRoot, "new  note.md"), "utf8"), "created");
		assert.equal(fs.existsSync(path.join(tempRoot, "new note.md")), false);

		const firstDir = "a".repeat(200);
		const secondDir = "b".repeat(200);
		const targetName = `${"c".repeat(95)}.md`;
		const targetPath = `${firstDir}/${secondDir}/${targetName}`;
		fs.mkdirSync(path.join(tempRoot, firstDir, secondDir), { recursive: true });
		fs.writeFileSync(path.join(tempRoot, targetPath), "unchanged");
		assert.equal(targetPath.length, 500);
		assert.throws(
			() => runtime.writeFile({ path: `${targetPath}-different`, content: "wrong target", mode: "overwrite" }),
			(error) => error.code === "invalid_tool_arguments"
		);
		assert.equal(fs.readFileSync(path.join(tempRoot, targetPath), "utf8"), "unchanged");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local read dedup consumes hits and overwrite ledger prevents unseen or stale writes", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const file = path.join(tempRoot, "note.md");
		fs.writeFileSync(file, "one\ntwo\n");
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WRITE_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		const context = { requestState: {}, enforceReadLedger: true };
		assert.throws(() => runtime.writeFile({ path: "note.md", content: "new", mode: "overwrite" }, context), (error) => error.code === "local_file_not_read");
		const first = runtime.readFile({ path: "note.md" }, context);
		assert.equal(first.complete, true);
		const dedup = runtime.readFile({ path: "note.md" }, context);
		assert.equal(dedup.deduplicated, true);
		assert.equal(runtime.readFile({ path: "note.md" }, context).deduplicated, undefined);
		const partialContext = { requestState: {}, enforceReadLedger: true };
		assert.equal(runtime.readFile({ path: "note.md", limit: 1 }, partialContext).deduplicated, undefined);
		assert.equal(runtime.readFile({ path: "note.md", limit: 1 }, partialContext).deduplicated, true);
		assert.equal(runtime.readFile({ path: "note.md", limit: 1 }, partialContext).deduplicated, undefined);
		fs.writeFileSync(file, "changed elsewhere\n");
		assert.throws(() => runtime.writeFile({ path: "note.md", content: "new", mode: "overwrite" }, context), (error) => error.code === "local_file_changed_since_read");
		const freshContext = { requestState: {}, enforceReadLedger: true };
		runtime.readFile({ path: "note.md" }, freshContext);
		assert.equal(runtime.writeFile({ path: "note.md", content: "new\n", mode: "overwrite" }, freshContext).ok, true);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local reads normalize BOM and CRLF and distinguish partial overwrite state", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "windows.txt"), "\uFEFFalpha\r\nbeta\r\ngamma\r\n");
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WRITE_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		const context = { requestState: {}, enforceReadLedger: true };
		const partial = runtime.readFile({ path: "windows.txt", limit: 1 }, context);
		assert.equal(partial.content, "1\talpha");
		assert.equal(partial.meta.truncation_reason, "line_limit");
		assert.throws(() => runtime.writeFile({ path: "windows.txt", content: "replacement", mode: "overwrite" }, context), (error) => error.code === "local_file_partially_read" && /next_offset/.test(error.retry_hint));
		const middle = runtime.readFile({ path: "windows.txt", offset: partial.next_offset, column: partial.next_column, limit: 1 }, context);
		const final = runtime.readFile({ path: "windows.txt", offset: middle.next_offset, column: middle.next_column, limit: 1 }, context);
		assert.equal(final.complete, true);
		assert.equal(runtime.writeFile({ path: "windows.txt", content: "replacement\n", mode: "overwrite" }, context).ok, true);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local reads apply byte ceilings without splitting UTF-8 and reject binary files", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "wide.txt"), "😀".repeat(600));
		fs.writeFileSync(path.join(tempRoot, "binary.txt"), Buffer.from([65, 0, 66]));
		const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot }, homeDir: tempRoot, projectRoot: tempRoot });
		const read = runtime.readFile({ path: "wide.txt", max_bytes: 1024, max_chars: 4000, max_line_chars: 2000 });
		assert.equal(read.meta.truncation_reason, "byte_limit");
		assert.equal(read.meta.returned_bytes, 1024);
		assert.equal(read.next_column, 257);
		assert.doesNotMatch(read.content, /[\uD800-\uDBFF]$/);
		assert.throws(() => runtime.readFile({ path: "binary.txt" }), (error) => error.code === "local_file_not_readable");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local runtime writes only when enabled and blocks sensitive paths", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const disabled = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		assert.throws(() => disabled.writeFile({ path: "note.md", content: "x" }), (error) => error.code === "local_write_disabled");

		const enabled = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot,
				AI_CHAT_LOCAL_WRITE_ENABLED: "1"
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		const result = enabled.writeFile({ path: "notes/one.md", content: "hello\n", create_dirs: true });
		assert.equal(result.ok, true);
		assert.equal(fs.readFileSync(path.join(tempRoot, "notes", "one.md"), "utf8"), "hello\n");
		assert.throws(() => enabled.writeFile({ path: ".env", content: "SECRET=x" }), (error) => error.code === "local_file_write_blocked");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local writes block symlink escapes from existing targets and parent directories", { skip: process.platform === "win32" }, () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-outside-"));
	try {
		fs.writeFileSync(path.join(outside, "target.md"), "outside");
		fs.symlinkSync(path.join(outside, "target.md"), path.join(tempRoot, "linked.md"));
		fs.symlinkSync(outside, path.join(tempRoot, "linked-dir"));
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WRITE_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot },
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		assert.throws(() => runtime.writeFile({ path: "linked.md", content: "changed", mode: "overwrite" }), (error) => error.code === "local_path_blocked");
		assert.throws(() => runtime.writeFile({ path: "linked-dir/new.md", content: "changed", create_dirs: true }), (error) => error.code === "local_path_blocked");
		assert.equal(fs.readFileSync(path.join(outside, "target.md"), "utf8"), "outside");
		assert.equal(fs.existsSync(path.join(outside, "new.md")), false);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
		fs.rmSync(outside, { recursive: true, force: true });
	}
});

test("local appends enforce the resulting file-size ceiling", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const file = path.join(tempRoot, "large.txt");
		fs.writeFileSync(file, "a".repeat(512 * 1024));
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WRITE_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot },
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		assert.throws(() => runtime.writeFile({ path: "large.txt", content: "b", mode: "append" }), (error) => error.code === "local_file_too_large");
		assert.equal(fs.statSync(file).size, 512 * 1024);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("overwrite mode never creates a missing file through create_dirs", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WRITE_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot },
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		assert.throws(
			() => runtime.writeFile({ path: "nested/missing.md", content: "new", mode: "overwrite", create_dirs: true }),
			(error) => error.code === "local_file_missing"
		);
		assert.equal(fs.existsSync(path.join(tempRoot, "nested", "missing.md")), false);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local shell uses allowlisted commands without shell interpolation", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "README.md"), "needle\n");
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot,
				AI_CHAT_LOCAL_SHELL_ENABLED: "1",
				AI_CHAT_LOCAL_SHELL_ALLOWLIST: "pwd,rg"
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		const result = await runtime.runCommand({ command: "rg", args: ["needle", "README.md"] });
		assert.equal(result.exit_code, 0);
		assert.match(result.stdout, /needle/);
		await assert.rejects(() => runtime.runCommand({ command: "node", args: ["-e", "console.log(1)"] }), (error) => error.code === "local_shell_command_blocked");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local shell preserves argument whitespace exactly", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	let observedArgs = null;
	try {
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ALLOWLIST: "rg", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot },
			homeDir: tempRoot,
			projectRoot: tempRoot,
			spawnFn: (_command, args) => {
				observedArgs = args;
				return fakeChild((child) => child.emit("close", 0, null));
			}
		});
		await runtime.runCommand({ command: "rg", args: ["a  b", " leading "] });
		assert.deepEqual(observedArgs, ["a  b", " leading "]);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local shell cancellation rejects instead of reporting a successful signaled exit", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		let child;
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ALLOWLIST: "pwd", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot },
			homeDir: tempRoot,
			projectRoot: tempRoot,
			spawnFn: () => { child = fakeChild(() => {}); return child; }
		});
		const controller = new AbortController();
		const pending = runtime.runCommand({ command: "pwd", args: [] }, { signal: controller.signal });
		controller.abort();
		await assert.rejects(pending, (error) => error.code === "local_shell_aborted");
		assert.deepEqual(child.kills, ["SIGTERM"]);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local shell preserves null exit codes for externally signaled processes", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const runtime = createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ALLOWLIST: "pwd", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot },
			homeDir: tempRoot,
			projectRoot: tempRoot,
			spawnFn: () => fakeChild((child) => child.emit("close", null, "SIGTERM"))
		});
		const result = await runtime.runCommand({ command: "pwd", args: [] });
		assert.equal(result.exit_code, null);
		assert.equal(result.signal, "SIGTERM");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("local shell marks output truncated only after content exceeds the shared ceiling", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const makeRuntime = (output) => createLocalRuntime({
			env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ENABLED: "1", AI_CHAT_LOCAL_SHELL_ALLOWLIST: "pwd", AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot, AI_CHAT_LOCAL_MAX_OUTPUT_CHARS: "1000" },
			homeDir: tempRoot,
			projectRoot: tempRoot,
			spawnFn: () => fakeChild((child) => { child.stdout.write(output); child.stdout.end(); child.emit("close", 0, null); })
		});
		const exact = await makeRuntime("x".repeat(1000)).runCommand({ command: "pwd", args: [] });
		assert.equal(exact.stdout.length, 1000);
		assert.equal(exact.truncated, false);
		const overflow = await makeRuntime("x".repeat(1001)).runCommand({ command: "pwd", args: [] });
		assert.equal(overflow.stdout.length, 1000);
		assert.equal(overflow.truncated, true);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
// FF-1: writeFile must map raw ENOENT to structured local_file_missing error code
test("FF-1: writeFile maps raw filesystem ENOENT to local_file_missing", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot,
				AI_CHAT_LOCAL_WRITE_ENABLED: "1"
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		// Writing to a path where the parent directory doesn't exist and create_dirs is false
		// should throw local_file_missing, not raw ENOENT
		assert.throws(
			() => runtime.writeFile({ path: "nonexistent_dir/file.md", content: "test", mode: "overwrite" }),
			(error) => error.code === "local_file_missing"
		);
		// Writing with create_dirs=true to a path where mkdirSync succeeds but writeFileSync
		// fails should also produce a structured error code, not raw ENOENT
		// (This test verifies the try/catch wrapper around fs operations)
		const result = runtime.writeFile({ path: "newdir/file.md", content: "test", create_dirs: true });
		assert.equal(result.ok, true);
		assert.equal(fs.readFileSync(path.join(tempRoot, "newdir", "file.md"), "utf8"), "test");
		fs.mkdirSync(path.join(tempRoot, "directory-target.md"));
		assert.throws(
			() => runtime.writeFile({ path: "directory-target.md", content: "test", mode: "overwrite" }),
			(error) => error.code === "local_path_type_mismatch" && /requires a file/.test(error.message)
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

// FF-2: runCommand error message must include the allowlist
test("FF-2: local_shell_command_blocked error includes allowlist", async () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot,
				AI_CHAT_LOCAL_SHELL_ENABLED: "1",
				AI_CHAT_LOCAL_SHELL_ALLOWLIST: "git,rg,ls,pwd"
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		try {
			await runtime.runCommand({ command: "npm", args: ["test"] });
			assert.fail("Should have thrown");
		} catch (error) {
			assert.equal(error.code, "local_shell_command_blocked");
			assert.match(error.message, /git, rg, ls, pwd/);
		}
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

// FF-3: writeFile error message must include allowed extensions
test("FF-3: local_file_write_blocked error includes allowed extensions", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot,
				AI_CHAT_LOCAL_WRITE_ENABLED: "1"
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		try {
			runtime.writeFile({ path: "test.exe", content: "test" });
			assert.fail("Should have thrown");
		} catch (error) {
			assert.equal(error.code, "local_file_write_blocked");
			assert.match(error.message, /\.md/);
			assert.match(error.message, /\.txt/);
			assert.match(error.message, /\.js/);
		}
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

// FF-4: path blocked error must include workspace label
test("FF-4: local_path_blocked error includes workspace label", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "README.md"), "content\n");
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		try {
			runtime.readFile({ root_id: "workspace_0", path: "../../etc/passwd" });
			assert.fail("Should have thrown");
		} catch (error) {
			assert.equal(error.code, "local_path_blocked");
			// The error message should include the workspace label
			assert.match(error.message, /workspace_0|ai-chat-local/);
		}
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

// FF-5: type mismatch error must clarify whether a file or directory is required
test("FF-5: local_path_type_mismatch error clarifies required type", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-local-"));
	try {
		fs.writeFileSync(path.join(tempRoot, "file.md"), "content\n");
		const runtime = createLocalRuntime({
			env: {
				AI_CHAT_LOCAL_TOOLS_ENABLED: "1",
				AI_CHAT_LOCAL_WORKSPACE_ROOTS: tempRoot
			},
			homeDir: tempRoot,
			projectRoot: tempRoot
		});
		// Listing a file path should produce a type mismatch error that mentions "directory"
		try {
			runtime.listFiles({ root_id: "workspace_0", path: "file.md" });
			assert.fail("Should have thrown");
		} catch (error) {
			assert.equal(error.code, "local_path_type_mismatch");
			assert.match(error.message, /directory/);
		}
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
