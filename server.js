const fs = require("fs");
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

if (require.main === module) {
	process.on("unhandledRejection", (error) => {
		console.error("[ai-chat] unhandledRejection", error);
	});
	process.on("uncaughtException", (error) => {
		console.error("[ai-chat] uncaughtException", error);
	});

	const server = runtime.app.listen(runtime.config.port, runtime.config.host, () => {
		console.log(`ai-chat running on http://${runtime.config.host}:${runtime.config.port}`);
		console.log(`AI SDK available: ${runtime.config.aiSdkAvailable ? "yes" : "no"}`);
		console.log(`API auth configured: ${runtime.config.apiAuthToken ? "yes" : "no"}`);
		const address = server.address();
		const schedulerHost = runtime.config.host === "0.0.0.0" || runtime.config.host === "::" ? "127.0.0.1" : runtime.config.host;
		runtime.startScheduler(`http://${schedulerHost}:${address.port}`);
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
