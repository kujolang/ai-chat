const fs = require("fs");
const http = require("http");
const path = require("path");

loadLocalEnv(__dirname);

function loadLocalEnv(projectRoot) {
	const envPath = path.join(projectRoot, ".env");
	if (!fs.existsSync(envPath)) {
		return;
	}

	let content = "";
	try {
		content = String(fs.readFileSync(envPath, "utf8") || "");
	} catch (error) {
		return;
	}

	const lines = content.split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) {
			continue;
		}

		const key = match[1];
		if (Object.prototype.hasOwnProperty.call(process.env, key)) {
			continue;
		}

		let value = match[2] || "";
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}

		process.env[key] = value;
	}
}

function createRuntime() {
	return require("./lib/server-runtime").createServerRuntime({ projectRoot: __dirname });
}

function localhostFor(host) {
	return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

function displayUrl(config) {
	const host = localhostFor(config.host);
	return `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${config.port}`;
}

function probeHealth(url, timeoutMs = 1000) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(deadline);
			resolve(value);
		};
		// A wall-clock deadline also bounds a listener trickling partial JSON.
		let request;
		let connected = false;
		const deadline = setTimeout(() => { finish(connected ? false : null); request?.destroy(); }, timeoutMs);
		request = http.get(`${url}/healthz`, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => {
				body += chunk;
				if (Buffer.byteLength(body) > 4096) { finish(false); request.destroy(); }
			});
			response.on("aborted", () => finish(false));
			response.on("error", () => finish(false));
			response.on("end", () => {
				try {
					const json = JSON.parse(body);
					finish(Boolean(json && json.ok === true && json.service === "ai-chat"));
				} catch { finish(false); }
			});
		});
		// A successful TCP connection proves ownership even if the listener never
		// sends headers or completes JSON. Do not initialize a second runtime.
		request.on("socket", (socket) => {
			if (!socket.connecting) connected = true;
			else socket.once("connect", () => { connected = true; });
		});
		request.on("error", () => finish(connected ? false : null));
	});
}

function startServer(runtime) {
	// Preserve Node's fatal-error behavior. Continuing after an uncaught error
	// can serve requests with inconsistent in-memory state; journal recovery
	// reconciles interrupted work on the next start.
	const server = runtime.app.listen(runtime.config.port, runtime.config.host, () => {
		// Retain Node's bounded header/body receive deadlines. Response streaming
		// remains unlimited here and is governed by the runtime's stream policy.
		server.setTimeout(0);
		console.log(`ai-chat running on ${displayUrl(runtime.config)}`);
		console.log(`AI SDK available: ${runtime.config.aiSdkAvailable ? "yes" : "no"}`);
		console.log(`API auth configured: ${runtime.config.apiAuthToken ? "yes" : "no"}`);
		const address = server.address();
		const schedulerHost = localhostFor(runtime.config.host);
		runtime.startScheduler(`http://${schedulerHost}:${address.port}`);
	});
	server.on("error", async (error) => {
		if (!error || error.code !== "EADDRINUSE") {
			console.error("[ai-chat] server error", error);
			process.exitCode = 1;
			await runtime.close();
			process.exit();
			return;
		}

		const url = displayUrl(runtime.config);
		if (await probeHealth(url)) {
			console.log(`ai-chat is already running on ${url}`);
			await runtime.close();
			process.exit(0);
			return;
		}

		console.error(`[ai-chat] port ${runtime.config.port} is already in use on ${runtime.config.host}.`);
		console.error(`Set PORT to a free port or stop the process using ${url}.`);
		process.exitCode = 1;
		await runtime.close();
		process.exit();
	});
	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		// Stop admission and checkpoint detached work before closing the DB.
		server.close();
		void runtime.close().catch((error) => {
			console.error("[ai-chat] shutdown incomplete", error.code || "shutdown_failed");
			process.exitCode = 1;
			server.closeAllConnections();
			process.exit(1);
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

async function main() {
	// Recognize an existing instance before loading integrations or claiming its
	// journal database. This also keeps cold-start port probes inexpensive.
	const host = String(process.env.AI_CHAT_HOST || "127.0.0.1");
	const port = Number(process.env.PORT || 4173);
	if (Number.isInteger(port) && port > 0 && port <= 65535) {
		const url = displayUrl({ host, port });
		const existing = await probeHealth(url);
		if (existing === true) {
			console.log(`ai-chat is already running on ${url}`);
			return;
		}
		if (existing === false) {
			console.error(`[ai-chat] port ${port} is already in use on ${host}.`);
			console.error(`Set PORT to a free port or stop the process using ${url}.`);
			process.exitCode = 1;
			return;
		}
	}
	startServer(createRuntime());
}

if (require.main === module) {
	void main().catch((error) => {
		console.error("[ai-chat] startup failed", error.code || error.message);
		process.exitCode = 1;
	});
} else {
	module.exports = createRuntime();
}
