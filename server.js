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
	runtime.app.listen(runtime.config.port, runtime.config.host, () => {
		console.log(`ai-chat running on http://${runtime.config.host}:${runtime.config.port}`);
		console.log(`AI SDK available: ${runtime.config.aiSdkAvailable ? "yes" : "no"}`);
		console.log(`API auth configured: ${runtime.config.apiAuthToken ? "yes" : "no"}`);
	});
}

module.exports = runtime;
