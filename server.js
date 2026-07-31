const fs = require("fs");
const http = require("http");
const path = require("path");
const { createServerRuntime } = require("./lib/server-runtime");

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

const runtime = createServerRuntime({
	projectRoot: __dirname
});

function localhostFor(host) {
	return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

function displayUrl(config) {
	return `http://${localhostFor(config.host)}:${config.port}`;
}

function probeHealth(url, timeoutMs = 1000) {
	return new Promise((resolve) => {
		const request = http.get(`${url}/healthz`, { timeout: timeoutMs }, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => {
				body += chunk;
				if (body.length > 4096) {
					request.destroy();
				}
			});
			response.on("end", () => {
				try {
					const json = JSON.parse(body);
					resolve(Boolean(json && json.ok === true && json.service === "ai-chat"));
				} catch (error) {
					resolve(false);
				}
			});
		});
		request.on("timeout", () => {
			request.destroy();
			resolve(false);
		});
		request.on("error", () => resolve(false));
	});
}

if (require.main === module) {
	process.on("unhandledRejection", (error) => {
		console.error("[ai-chat] unhandledRejection", error);
	});
	process.on("uncaughtException", (error) => {
		console.error("[ai-chat] uncaughtException", error);
	});

	const server = runtime.app.listen(runtime.config.port, runtime.config.host, () => {
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
		server.close(async () => {
			await runtime.close();
		});
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

module.exports = runtime;
