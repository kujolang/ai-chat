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
