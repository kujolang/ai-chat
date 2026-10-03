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
		assert.throws(() => runtime.writeFile({ path: "note.md", content: "new", mode: "overwrite" }, context), (error) => error.code === "local_file_not_read" && error.execution_started === false);
		assert.equal(fs.readFileSync(file, "utf8"), "one\ntwo\n");
		const first = runtime.readFile({ path: "note.md" }, context);
		assert.equal(first.complete, true);
		const dedup = runtime.readFile({ path: "note.md" }, context);
		assert.equal(dedup.deduplicated, true);
		assert.equal(dedup.content, first.content);
		assert.equal(dedup.meta.cache, "bounded_reread");
		assert.equal(runtime.readFile({ path: "note.md" }, context).deduplicated, undefined);
		const partialContext = { requestState: {}, enforceReadLedger: true };
		assert.equal(runtime.readFile({ path: "note.md", limit: 1 }, partialContext).deduplicated, undefined);
		assert.equal(runtime.readFile({ path: "note.md", limit: 1 }, partialContext).deduplicated, true);
		assert.equal(runtime.readFile({ path: "note.md", limit: 1 }, partialContext).deduplicated, undefined);
		fs.writeFileSync(file, "changed elsewhere\n");
		assert.throws(() => runtime.writeFile({ path: "note.md", content: "new", mode: "overwrite" }, context), (error) => error.code === "local_file_changed_since_read" && error.execution_started === false);
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

for (const scenario of ["dangling", "sensitive-alias"]) {
 test(`local writes reject ${scenario} symlink targets`, { skip: process.platform === "win32" }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-write-link-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace);
  const target = scenario === "dangling" ? path.join(tempRoot, "outside.txt") : path.join(workspace, ".env");
  if (scenario === "sensitive-alias") fs.writeFileSync(target, "fixture-only");
  fs.symlinkSync(target, path.join(workspace, "alias.txt"));
  const runtime = createLocalRuntime({ env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WRITE_ENABLED: "1" }, projectRoot: workspace });
  try {
   assert.throws(() => runtime.writeFile({path:"alias.txt",mode:"append",content:"changed"}), error => ["local_path_blocked", "local_file_write_blocked"].includes(error.code));
   if (scenario === "dangling") assert.equal(fs.existsSync(target), false);
   else assert.equal(fs.readFileSync(target,"utf8"), "fixture-only");
  } finally { fs.rmSync(tempRoot, {recursive:true,force:true}); }
 });
}

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
		assert.ok(Number.isFinite(result.duration_ms) && result.duration_ms >= 0);
		assert.match(result.stdout, /needle/);
		await assert.rejects(() => runtime.runCommand({ command: "node", args: ["-e", "console.log(1)"] }), (error) => error.code === "local_shell_command_blocked" && error.execution_started === false);
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

test("bounded directory listings preserve sorting and stat only the selected window", () => {
 const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-list-window-")));
 try {
  fs.mkdirSync(path.join(root, "z-directory"));
  for (let i = 0; i < 50; i++) fs.writeFileSync(path.join(root, `file-${String(i).padStart(2, "0")}.txt`), "data");
  const runtime = createLocalRuntime({ projectRoot: root, env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: root } });
  const original = fs.statSync;
  let stats = 0;
  fs.statSync = function(file, ...args) { if (String(file).startsWith(root + path.sep)) stats++; return original.call(this, file, ...args); };
  let result;
  try { result = runtime.listFiles({ root_id: "workspace_0", max_entries: 3 }); }
  finally { fs.statSync = original; }
  assert.deepEqual(result.entries.map(entry => entry.name), ["z-directory", "file-00.txt", "file-01.txt"]);
  assert.equal(result.entries[1].size, 4);
  assert.equal(result.truncated, true);
  assert.equal(stats, 3);
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Go source supports the same scoped read/write tools as Kujo", () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-go-'));
 try {
  const runtime=createLocalRuntime({projectRoot:dir,homeDir:dir,env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_WRITE_ENABLED:'1'}});
  runtime.writeFile({root_id:'workspace_0',path:'bench.go',content:'package main\nfunc main() {}\n'});
  assert.match(runtime.readFile({root_id:'workspace_0',path:'bench.go'}).content,/package main/);
  assert.ok(runtime.listFiles({root_id:'workspace_0'}).entries.some(e=>e.name==='bench.go'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('unrestricted commands and destructive opt-in are independent at every dispatch', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-chat-permissions-'));
 let policy={skip_allowlist:false,allow_destructive:false};
 const calls=[];
 try {
  const runtime=createLocalRuntime({projectRoot:dir,homeDir:dir,
   env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ALLOWLIST:'pwd'},
   getCommandPermissions:()=>policy,
   spawnFn:(command,args,options)=>{calls.push({command,args,options});return fakeChild(child=>child.emit('close',0,null));}
  });
  const run=(command,args=[])=>runtime.runCommand({command,args});
  await assert.rejects(run('/tmp/custom-benchmark'),{code:'local_shell_command_blocked'});
  policy={skip_allowlist:true,allow_destructive:false};
  await run('/tmp/custom-benchmark');
  assert.equal(calls[0].command,'/tmp/custom-benchmark');assert.equal(calls[0].options.shell,false);
  await assert.rejects(run('/bin/rm',['-rf','/']),e=>e.code==='local_shell_destructive_blocked' && e.execution_started===false);
  assert.equal(calls.length,1);
  policy={skip_allowlist:true,allow_destructive:true};
  await run('/bin/rm',['-rf','/']); // Fake spawn only: never runs a command.
  assert.equal(calls.length,2);
  policy={skip_allowlist:false,allow_destructive:false};
  await assert.rejects(run('/tmp/custom-benchmark'),{code:'local_shell_command_blocked'});
  assert.equal(runtime.status().command_permissions.skip_allowlist,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('shell timeout preserves partial evidence after termination without claiming rollback', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-timeout-'));
 try {
  const runtime = createLocalRuntime({projectRoot:root,env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ALLOWLIST:'node',AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS:'1000'},spawnFn:()=>fakeChild(child=>child.stdout.write('partial result'))});
  await assert.rejects(runtime.runCommand({command:'node',args:[],timeout_ms:10000}),error=>{
   assert.equal(error.code,'local_shell_timeout');
   assert.equal(error.execution_completed,true);
   assert.equal(error.execution_result.stdout,'partial result');
   assert.equal(error.execution_result.timeout_ms,1000);
   assert.ok(Number.isFinite(error.execution_result.duration_ms) && error.execution_result.duration_ms >= 0);
   assert.equal(error.execution_result.cwd,'.');
   assert.equal(error.execution_result.partial_effects,'unknown');
   assert.equal(error.retryable,false);
   return true;
  });
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('missing executable is a known preflight failure', async () => {
 const runtime = createLocalRuntime({env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ALLOWLIST:'ai-chat-nonexistent-command'}});
 await assert.rejects(runtime.runCommand({command:'ai-chat-nonexistent-command',args:[]}),e=>e.code==='local_shell_failed' && e.execution_started===false);
});

test('POSIX timeout kills a SIGTERM-ignoring process tree and keeps output', {skip:process.platform==='win32'}, async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shell-tree-'));
 try {
  const runtime=createLocalRuntime({projectRoot:root,env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ALLOWLIST:'node',AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS:'1000'},spawnFn:(_command,args,options)=>require('child_process').spawn(process.execPath,args,options)});
  const script=`process.on('SIGTERM',()=>{}); const c=require('child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'}); console.log('child='+c.pid); setInterval(()=>{},1000);`;
  await assert.rejects(runtime.runCommand({command:'node',args:['-e',script]}),error=>{
   assert.equal(error.execution_completed,true);
   assert.equal(error.execution_result.signal,'SIGKILL');
   assert.match(error.execution_result.stdout,/child=\d+/);
   return true;
  });
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('already cancelled shell request never spawns', async () => {
 let spawned=false;
 const runtime=createLocalRuntime({env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1'},spawnFn:()=>{spawned=true;}});
 const controller=new AbortController();controller.abort();
 await assert.rejects(runtime.runCommand({command:'pwd',args:[]},{signal:controller.signal}),e=>e.execution_started===false);
 assert.equal(spawned,false);
});

for (const scenario of [
 {name:'default command',env:{},args:{},expected:120000},
 {name:'explicit long command',env:{},args:{timeout_ms:600000},expected:600000},
 {name:'legacy hard ceiling',env:{AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS:'15000'},args:{timeout_ms:600000},expected:15000},
 {name:'configured default',env:{AI_CHAT_LOCAL_COMMAND_DEFAULT_TIMEOUT_MS:'240000'},args:{},expected:240000},
 {name:'default capped by ceiling',env:{AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS:'10000'},args:{},expected:10000}
]) {
 test(`shell deadline policy: ${scenario.name}`, async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let child;
  const runtime=createLocalRuntime({env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1',...scenario.env},spawnFn:()=>{child=fakeChild(()=>{});return child;}});
  const pending=runtime.runCommand({command:'pwd',args:[],...scenario.args});
  const rejected=assert.rejects(pending,e=>e.code==='local_shell_timeout' && e.execution_result.timeout_ms===scenario.expected);
  t.mock.timers.tick(scenario.expected-1);
  assert.deepEqual(child.kills,[]);
  t.mock.timers.tick(1);
  await rejected;
  assert.deepEqual(child.kills,['SIGTERM']);
  if (!Object.keys(scenario.env).length) {
   assert.equal(runtime.status().limits.command_default_timeout_ms,120000);
   assert.equal(runtime.status().limits.command_timeout_ms,600000);
  }
 });
}

test('failed file open before mutation is recoverable; mkdir-assisted retry succeeds', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'open-preflight-'));
 try {
  const runtime=createLocalRuntime({projectRoot:root,env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_WRITE_ENABLED:'1'}});
  assert.throws(()=>runtime.writeFile({path:'new/main.go',content:'package main'}),e=>e.code==='local_file_missing' && e.execution_started===false);
  assert.equal(fs.existsSync(path.join(root,'new')),false);
  runtime.writeFile({path:'new/go.mod',content:'module fixture',create_dirs:true});
  runtime.writeFile({path:'new/main.go',content:'package main'});
  assert.equal(fs.readFileSync(path.join(root,'new/main.go'),'utf8'),'package main');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('shell argument bounds reject before execution rather than corrupting commands', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shell-argument-bounds-'));
 const calls=[];
 const runtime=createLocalRuntime({projectRoot:root,homeDir:root,
  env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1'},
  getCommandPermissions:()=>({skip_allowlist:true,allow_destructive:false}),
  spawnFn:(command,args)=>{calls.push({command,args});return fakeChild(child=>child.emit('close',0,null));}});
 try {
  for(const args of [['x'.repeat(1001)],['x\0y'],[42],[null]]) {
   await assert.rejects(runtime.runCommand({command:'node',args}),e=>e.code==='invalid_tool_arguments' && e.execution_started===false && /authorized file/.test(e.retry_hint));
  }
  for(const command of ['x'.repeat(501),'node\0']) {
   await assert.rejects(runtime.runCommand({command,args:[]}),e=>e.code==='invalid_tool_arguments' && e.execution_started===false);
  }
  assert.equal(calls.length,0);
  const args=['','  preserved  ','x'.repeat(1000),'😀'.repeat(500)];
  await runtime.runCommand({command:'./program  with spaces',args});
  assert.deepEqual(calls,[{command:'./program  with spaces',args}]);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

for (const deniedSignal of ['SIGTERM', 'SIGKILL']) {
 test(`process-group ${deniedSignal} failure rejects safely with uncertain termination`, {skip:process.platform==='win32'}, async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let child;
  const sent=[];
  t.mock.method(process,'kill',(_pid,signal)=>{
   sent.push(signal);
   if(signal===deniedSignal) throw Object.assign(new Error('denied'),{code:'EPERM'});
  });
  const runtime=createLocalRuntime({env:{AI_CHAT_LOCAL_TOOLS_ENABLED:'1',AI_CHAT_LOCAL_SHELL_ENABLED:'1'},
   spawnFn:()=>{child=fakeChild(()=>{});child.pid=123456;return child;}});
  const pending=runtime.runCommand({command:'pwd',args:[]});
  const rejected=assert.rejects(pending,e=>e.code==='local_shell_termination_failed' && e.execution_completed===false && e.retryable===false);
  child.stdout.write('partial evidence');
  t.mock.timers.tick(120000);
  if(deniedSignal==='SIGKILL') t.mock.timers.tick(1000);
  await rejected;
  child.emit('close',null,'SIGKILL');
  t.mock.timers.tick(1000);
  assert.deepEqual(sent,deniedSignal==='SIGTERM'?['SIGTERM']:['SIGTERM','SIGKILL']);
 });
}
