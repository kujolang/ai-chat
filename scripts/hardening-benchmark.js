// Offline, deterministic payload measurements; no provider requests or credentials.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { builtinToolSchemas } = require("../lib/tool-runtime");
const { createToolDiscovery, capabilityInstructions } = require("../lib/tool-discovery");
const { createServerRuntime } = require("../lib/server-runtime");
const root = path.resolve(__dirname, "..");
const baseline = "f38043c3115ffaba8daf7e447c8b633b09e59350";
const baselineSource = execFileSync("git", ["show", `${baseline}:lib/server-runtime.js`], { cwd: root, encoding: "utf8" });
const priorInstructions = [...baselineSource.matchAll(/content: ("(?:Browser tool rules:|Local skill rules:|Local action rules:|Action adapter rules:)[^\n]+")/g)].map((match) => JSON.parse(match[1])).join("\n");
const schemas = builtinToolSchemas();
const discovery = createToolDiscovery(schemas, true);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-payload-benchmark-"));
const runtime = createServerRuntime({ projectRoot: root, env: { ENCRYPTION_SECRET: "offline-benchmark", API_AUTH_TOKEN: "offline-benchmark", DB_PATH: path.join(temp, "db.sqlite"), WATCHDOG_ENABLED: "0" }, skillRuntimeOptions: { homeDir: temp } });
try {
	const history = [{ role: "system", content: "Fixed application policy" }, { role: "user", content: "Use SQLite and never deploy without approval." }];
	for (let i = 0; i < 120; i++) history.push({ role: i % 2 ? "assistant" : "user", content: `Turn ${i}: ${"Research detail. ".repeat(80)}` });
	history.push({ role: "user", content: "Continue the work." });
	const opts = { requiredPrefixCount: 1, maxMessages: 32, maxChars: 12000, targetChars: 10000, summaryChars: 4000, preserveRecentMessages: 4, strategy: "structured_excerpt_v1" };
	const times = [];
	let compacted;
	for (let i = 0; i < 101; i++) { const start = performance.now(); compacted = runtime.helpers.compactConversationContext(history, opts); if (i) times.push(performance.now() - start); }
	times.sort((a,b) => a-b);
	const chars = (messages) => messages.reduce((sum, m) => sum + m.content.length, 0);
	const toolResults = Array.from({ length: 12 }, (_, i) => ({ role: "tool", tool_call_id: `call-${i}`, content: JSON.stringify({ ok: true, path: `artifact-${i}.md`, content: "x".repeat(10000) }) }));
	const resultBefore = chars(toolResults);
	runtime.helpers.compactProviderToolContext(toolResults, 24000);
	console.log(JSON.stringify({
		baseline_revision: baseline,
		node: process.version,
		method: "Same built-in schema catalog, baseline conditional instruction strings, 123-message synthetic history, 12 synthetic successful tool results. UTF-16 characters and UTF-8 JSON bytes, not provider tokens or billing. Latency is local compaction only, 100 warmed samples.",
		schemas: { before_count: schemas.length, after_initial_count: discovery.schemas().length, before_bytes: Buffer.byteLength(JSON.stringify(schemas)), after_initial_bytes: Buffer.byteLength(JSON.stringify(discovery.schemas())) },
		conditional_instructions: { before_chars: priorInstructions.length, after_chars: (capabilityInstructions(schemas) + "\n" + discovery.index).length },
		long_context: { raw_chars: chars(history), compacted_chars: chars(compacted.messages), compacted_messages: compacted.messages.length, initial_constraint_retained: compacted.messages.some((m) => m.content.includes("Use SQLite")), median_ms: Number(times[50].toFixed(3)), p95_ms: Number(times[95].toFixed(3)) },
		tool_results: { before_chars: resultBefore, after_chars: chars(toolResults), success_receipts: toolResults.filter((m) => JSON.parse(m.content).compacted && JSON.parse(m.content).ok === true).length },
		limitations: ["No live model tokens, cost, model TTFT, or provider latency measured.", "Existing history and tool compaction already reduced volume at baseline; new behavior retains initial constraints and successful outcomes.", "Deferred-tool tasks can add a discovery round; search stays immediately callable."]
	}, null, 2));
} finally { runtime.close(); fs.rmSync(temp, { recursive: true, force: true }); }
