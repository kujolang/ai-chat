const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = "4173";
const READY_TEXT = "ai-chat running on http://127.0.0.1:";
const SERVER_START_TIMEOUT_MS = 30000;

async function main() {
	const kujoBin = resolveKujoBin();
	const aiSdkPath = resolveAiSdkPath();
	const apiToken = process.env.API_AUTH_TOKEN || "loop-smoke-token";
	const encryptionSecret = process.env.ENCRYPTION_SECRET || "loop-smoke-secret";
	const port = process.env.PORT || DEFAULT_PORT;

	const serverEnv = {
		...process.env,
		KUJO_BIN: kujoBin,
		AI_SDK_PATH: aiSdkPath,
		API_AUTH_TOKEN: apiToken,
		ENCRYPTION_SECRET: encryptionSecret,
		PORT: port,
		BROWSER_ENABLED: "1"
	};

	const server = spawn(process.execPath, ["server.js"], {
		cwd: PROJECT_ROOT,
		env: serverEnv,
		stdio: ["ignore", "pipe", "pipe"]
	});

	let combinedOutput = "";
	const onOutput = (chunk) => {
		const text = String(chunk);
		combinedOutput += text;
		process.stdout.write(text);
	};
	server.stdout.on("data", onOutput);
	server.stderr.on("data", onOutput);

	try {
		await waitForServerReady(server, () => combinedOutput.includes(READY_TEXT));
		await runSmoke("npm", ["run", "smoke:browser"], {
			...process.env,
			API_AUTH_TOKEN: apiToken,
			PORT: port
		});
	} finally {
		await stopServer(server);
	}
}

function resolveKujoBin() {
	if (process.env.KUJO_BIN && fs.existsSync(process.env.KUJO_BIN)) return process.env.KUJO_BIN;
	for (const candidate of [
		path.resolve(PROJECT_ROOT, "..", "kujo", "target", "debug", "kujo"),
		path.resolve(PROJECT_ROOT, "..", "kujo", "target", "release", "kujo")
	]) {
		if (isExecutable(candidate)) return candidate;
	}
	throw new Error("Could not resolve KUJO_BIN for browser smoke gate.");
}

function resolveAiSdkPath() {
	if (process.env.AI_SDK_PATH && fs.existsSync(path.join(process.env.AI_SDK_PATH, "ai_sdk.kujo"))) return process.env.AI_SDK_PATH;
	const candidate = path.resolve(PROJECT_ROOT, "..", "ai-sdk", "src");
	if (fs.existsSync(path.join(candidate, "ai_sdk.kujo")) && fs.existsSync(path.join(candidate, "providers.kujo"))) {
		return candidate;
	}
	throw new Error("Could not resolve AI_SDK_PATH for browser smoke gate.");
}

function isExecutable(filename) {
	try {
		fs.accessSync(filename, fs.constants.X_OK);
		return true;
	} catch (error) {
		return false;
	}
}

function waitForServerReady(server, isReady) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for AI Chat server startup during browser smoke gate."));
		}, SERVER_START_TIMEOUT_MS);
		const onExit = (code) => {
			cleanup();
			reject(new Error(`AI Chat server exited before browser smoke gate was ready (code ${code}).`));
		};
		const poll = setInterval(() => {
			if (!isReady()) return;
			cleanup();
			resolve();
		}, 100);

		function cleanup() {
			clearTimeout(timer);
			clearInterval(poll);
			server.off("exit", onExit);
		}

		server.on("exit", onExit);
	});
}

function runSmoke(command, args, env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: PROJECT_ROOT,
			env,
			stdio: "inherit"
		});
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Browser smoke gate command failed with exit code ${code}.`));
		});
		child.on("error", reject);
	});
}

function stopServer(server) {
	return new Promise((resolve) => {
		if (server.exitCode !== null || server.killed) {
			resolve();
			return;
		}
		server.once("exit", () => resolve());
		server.kill("SIGINT");
		setTimeout(() => {
			if (server.exitCode === null) server.kill("SIGKILL");
		}, 5000).unref?.();
	});
}

main().catch((error) => {
	console.error(error && error.message ? error.message : error);
	process.exit(1);
});
