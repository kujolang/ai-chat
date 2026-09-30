// Refresh numeric context limits from the user's authenticated local Hermes proxy.
// No catalog descriptions or credentials are persisted.
const fs = require("node:fs");
const path = require("node:path");
const { readBoundedResponse } = require("../lib/bounded-response");

function contextSnapshot(catalog, now = new Date()) {
	if (!Array.isArray(catalog?.data)) throw Error("Hermes returned an invalid model catalog.");
	const models = catalog.data.flatMap((model) => {
		const window = model.context_length;
		if (typeof model.id !== "string" || !model.id || model.id.length > 160 || !Number.isSafeInteger(window) || window < 1024 || window > 4000000) return [];
		return [{ provider: "hermes", model: model.id, context_window: window }];
	});
	if (!models.length || models.length > 4096) throw Error("Hermes returned no usable context limits or too many models.");
	return { fetched_at: now.toISOString(), models };
}

async function main() {
	const destination = path.resolve(process.argv[2] || "data/hermes-context.json");
	const response = await fetch("http://127.0.0.1:8645/v1/models", {
		headers: { Authorization: "Bearer ai-chat-local" },
		signal: AbortSignal.timeout(15000)
	});
	if (!response.ok) { await response.body?.cancel(); throw Error(`Hermes catalog returned HTTP ${response.status}.`); }
	const snapshot = contextSnapshot(JSON.parse(await readBoundedResponse(response, 8 * 1024 * 1024, "catalog_too_large")));
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	const temporary = `${destination}.tmp-${process.pid}`;
	try {
		fs.writeFileSync(temporary, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o600, flag: "wx" });
		fs.renameSync(temporary, destination);
	} finally { fs.rmSync(temporary, { force: true }); }
	console.log(`Saved context limits for ${snapshot.models.length} Hermes models to ${destination}. Restart AI Chat to load them.`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { contextSnapshot };
