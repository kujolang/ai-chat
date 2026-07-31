const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawn } = require("node:child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { once } = require("events");

function createTestEnv() {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-startup-"));
	const sdkPath = path.join(tempRoot, "ai-sdk");
	fs.mkdirSync(sdkPath, { recursive: true });
	fs.writeFileSync(path.join(sdkPath, "ai_sdk.kujo"), "# test sdk placeholder\n");
	fs.writeFileSync(path.join(sdkPath, "providers.kujo"), "# test providers placeholder\n");
	return {
		tempRoot,
		env: {
			...process.env,
			ENCRYPTION_SECRET: "startup-test-secret",
			API_AUTH_TOKEN: "startup-test-token",
			AI_SDK_PATH: sdkPath,
			DB_PATH: path.join(tempRoot, "data", "test.db"),
			DB_BACKUP_DIR: path.join(tempRoot, "backups"),
			KUJO_BIN: "/usr/bin/false",
			WEB_SEARCH_BACKEND: "auto",
			SEARXNG_BASE_URL: ""
		}
	};
}

async function withListener(handler, callback) {
	const server = http.createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		return await callback(server.address().port);
	} finally {
		await new Promise((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
}

function runServer(env) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["server.js"], {
			cwd: path.resolve(__dirname, ".."),
			env
		});
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error("server.js did not exit after port conflict"));
		}, 5000);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("exit", (code) => {
			clearTimeout(timeout);
			resolve({ code, stdout, stderr });
		});
	});
}

test("server startup exits cleanly when AI Chat is already running on the configured port", async () => {
	const { tempRoot, env } = createTestEnv();
	try {
		await withListener((req, res) => {
			if (req.url === "/healthz") {
				res.setHeader("content-type", "application/json");
				res.end(JSON.stringify({ ok: true, service: "ai-chat", status: "healthy" }));
				return;
			}
			res.statusCode = 404;
			res.end();
		}, async (port) => {
			const result = await runServer({ ...env, AI_CHAT_HOST: "127.0.0.1", PORT: String(port) });
			assert.equal(result.code, 0);
			assert.match(result.stdout, new RegExp(`ai-chat is already running on http://127\\.0\\.0\\.1:${port}`));
			assert.equal(result.stderr, "");
		});
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("server startup reports a friendly error when another process owns the port", async () => {
	const { tempRoot, env } = createTestEnv();
	try {
		await withListener((req, res) => {
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ ok: true, service: "not-ai-chat" }));
		}, async (port) => {
			const result = await runServer({ ...env, AI_CHAT_HOST: "127.0.0.1", PORT: String(port) });
			assert.equal(result.code, 1);
			assert.match(result.stderr, new RegExp(`port ${port} is already in use`));
			assert.doesNotMatch(result.stderr, /uncaughtException/);
		});
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
