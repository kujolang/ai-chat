const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createLocalRuntime } = require("../lib/local-runtime");

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
		assert.equal(read.content, "# Hello\n");
		assert.throws(() => runtime.readFile({ root_id: "workspace_0", path: ".env" }), (error) => error.code === "local_path_sensitive");
		assert.throws(() => runtime.readFile({ root_id: "workspace_0", path: "../README.md" }), (error) => error.code === "local_path_blocked" || error.code === "local_path_not_found");
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
