#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args.baseUrl || process.env.BENCHMARK_BASE_URL || `http://127.0.0.1:${process.env.PORT || "4174"}`).replace(/\/$/, "");
const apiToken = String(args.apiToken || process.env.BENCHMARK_API_TOKEN || process.env.API_AUTH_TOKEN || "").trim();
const testFile = String(args.tests || "").trim();
const paneProfileName = String(args.paneProfile || "OpenRouter (TUD)").trim();
const outputDirectory = path.resolve(args.outputDir || "data/benchmark-runs");
const concurrency = Math.max(1, Math.min(20, Number(args.concurrency || 1) || 1));
const maxAttempts = Math.max(1, Math.min(5, Number(args.maxAttempts || 3) || 3));
const retryFailures = args.retryFailures === true || args.retryFailures === "true";
let currentPaneProfile;

if (!apiToken) fail("Missing API_AUTH_TOKEN (or --api-token).");
if (!testFile) fail("Pass --tests <benchmark markdown file>.");

const runId = String(args.runId || `benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const startedAt = new Date();
const run = {
	run_id: runId,
	started_at: startedAt.toISOString(),
	finished_at: null,
	duration_ms: null,
	base_url: baseUrl,
	pane_profile: paneProfileName,
	tests: [],
	summary: { total: 0, completed: 0, failed: 0 }
};

void main();

async function main() {
try {
	const priorRun = await readPriorRun();
	if (priorRun?.started_at && !priorRun.finished_at) run.started_at = priorRun.started_at;
	const tests = parseBenchmarkTests(await fs.readFile(testFile, "utf8"));
	const state = await requestJson("/api/state");
	const paneProfile = (state.state?.settings?.paneProfiles || []).find((profile) => profile.name === paneProfileName);
	if (!paneProfile) fail(`Pane profile not found: ${paneProfileName}`);
	if (!Array.isArray(paneProfile.panes) || paneProfile.panes.length === 0) fail(`Pane profile has no panes: ${paneProfileName}`);
	currentPaneProfile = paneProfile;

	const maxTokens = Number(state.state?.settings?.maxTokens) || 12000;
	const temperature = Number(state.state?.settings?.temperature);
	run.summary.total = tests.length * paneProfile.panes.length;
	console.log(`Benchmark run ${runId}`);
	console.log(`Started: ${run.started_at}`);
	console.log(`${tests.length} tests × ${paneProfile.panes.length} panes = ${run.summary.total} responses (concurrency ${concurrency}, max attempts ${maxAttempts})`);

	for (const benchmark of tests) {
		const existingChat = (state.state?.chats || []).find((chat) => chat.title === benchmarkTitle(benchmark));
		const chat = existingChat ? hydrateChat(existingChat) : createChat(benchmark);
		if (!existingChat) await persistInitialChat(chat, benchmark.prompt);
		const testResult = { number: benchmark.number, title: benchmark.title, chat_id: chat.id, panes: [] };
		run.tests.push(testResult);
		const pending = [];
		for (const pane of chat.panes) {
			const priorResponse = pane.messages?.find((message) => message.role === "assistant");
			const retryPriorFailure = retryFailures && priorResponse && String(priorResponse.content || "").startsWith("Error:") && !/HTTP 404/.test(String(priorResponse.content));
			if (priorResponse && !retryPriorFailure) {
				const priorError = String(priorResponse.content || "").startsWith("Error:")
					? String(priorResponse.content).slice("Error:".length).trim()
					: null;
				testResult.panes.push({ model: pane.model, profile_id: pane.profile_id, ok: !priorError, reused: true, error: priorError, duration_ms: null, usage: priorResponse.usage || null });
				run.summary[priorError ? "failed" : "completed"] += 1;
			} else {
				pending.push({ ...pane, retry_message_id: priorResponse?.id || null });
			}
		}
		await mapWithConcurrency(pending, concurrency, async (pane) => {
			const paneResult = await runPane({ chat, pane, benchmark, maxTokens, temperature });
			testResult.panes.push(paneResult);
			run.summary[paneResult.ok ? "completed" : "failed"] += 1;
			await writeRun();
			console.log(`[${run.summary.completed + run.summary.failed}/${run.summary.total}] Test ${benchmark.number} · ${pane.model} · ${paneResult.ok ? "ok" : "failed"} · ${paneResult.duration_ms}ms`);
		});
	}
} catch (error) {
	run.fatal_error = error instanceof Error ? error.message : String(error);
	console.error(`Benchmark run stopped: ${run.fatal_error}`);
	process.exitCode = 1;
} finally {
	run.finished_at = new Date().toISOString();
	run.duration_ms = Date.parse(run.finished_at) - Date.parse(run.started_at);
	await writeRun();
	console.log(`Finished: ${run.finished_at}`);
	console.log(`Duration: ${formatDuration(run.duration_ms)}`);
	console.log(`Completed: ${run.summary.completed}; failed: ${run.summary.failed}`);
}
}

function parseArgs(values) {
	const result = {};
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!value.startsWith("--")) continue;
		const [key, inlineValue] = value.slice(2).split("=", 2);
		const nextValue = values[index + 1];
		result[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = inlineValue ?? (nextValue && !nextValue.startsWith("--") ? values[++index] : true);
	}
	return result;
}

function parseBenchmarkTests(markdown) {
	const matches = [...markdown.matchAll(/^#{1,2} TEST (\d+):\s*([^\n]+)\s*$/gm)];
	if (matches.length !== 10) fail(`Expected 10 benchmark tests, found ${matches.length}.`);
	return matches.map((match, index) => {
		const section = markdown.slice(match.index, matches[index + 1]?.index || markdown.length);
		const promptMatch = section.match(/(?:^|\n)## Prompt\s*\n([\s\S]*?)(?:\n\* \* \*\s*$|$)/);
		const prompt = (promptMatch ? promptMatch[1] : section.slice(section.indexOf("\n") + 1)).trim();
		if (!prompt) fail(`Test ${match[1]} has no prompt.`);
		return { number: Number(match[1]), title: match[2].trim(), prompt };
	});
}

function createChat(benchmark) {
	const now = Date.now();
	const id = crypto.randomUUID();
	return {
		id,
		title: benchmarkTitle(benchmark),
		created_at: now,
		updated_at: now,
		panes: currentPaneProfile.panes.map((savedPane, index) => ({
			id: crypto.randomUUID(), chat_id: id, profile_id: String(savedPane.profile_id), model: String(savedPane.model), status: "waiting", sort_order: index
		}))
	};
}

function benchmarkTitle(benchmark) {
	return `Benchmark ${String(benchmark.number).padStart(2, "0")} — ${benchmark.title}`;
}

function hydrateChat(chat) {
	return {
		id: chat.id,
		title: chat.title,
		panes: (chat.panes || []).map((pane, index) => ({
			id: pane.id,
			chat_id: chat.id,
			profile_id: pane.profile_id,
			model: pane.model,
			status: pane.status || "idle",
			sort_order: index,
			messages: pane.messages || []
		}))
	};
}

async function persistInitialChat(chat, prompt) {
	if (!currentPaneProfile) {
		const state = await requestJson("/api/state");
		currentPaneProfile = (state.state?.settings?.paneProfiles || []).find((profile) => profile.name === paneProfileName);
	}
	const changes = [{ type: "chat_upsert", chat: { ...chat, panes: undefined, pinned: false, archived: false, project_path: "", sort_order: 0 } }];
	for (const pane of chat.panes) {
		changes.push({ type: "pane_upsert", pane });
		changes.push({ type: "message_upsert", message: {
			id: crypto.randomUUID(), pane_id: pane.id, role: "user", content: prompt, thinking: "", usage: null, created_at: Date.now(), sort_order: 0
		} });
	}
	await requestJson("/api/state/changes", { method: "POST", body: { changes } });
}

async function runPane({ chat, pane, benchmark, maxTokens, temperature }) {
	const started = Date.now();
	let result = null;
	let attempts = 0;
	while (attempts < maxAttempts) {
		attempts += 1;
		try {
			const streamed = await streamChat({
				profile_id: pane.profile_id,
				trace_id: crypto.randomUUID(),
				request_id: crypto.randomUUID(),
				chat_id: chat.id,
				pane_id: pane.id,
				session_id: chat.id,
				correlation_id: pane.id,
				model: pane.model,
				temperature: Number.isFinite(temperature) ? temperature : 0.2,
				max_tokens: maxTokens,
				messages: [{ role: "user", content: benchmark.prompt }],
				tools: []
			});
			if (!String(streamed.content || "").trim()) throw new Error("Provider returned an empty response.");
			result = streamed;
			break;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result = { ok: false, error: message, content: "", thinking: "", usage: null };
			if (attempts >= maxAttempts || !isRetryableBenchmarkError(message)) break;
			await delay(1000 * 2 ** (attempts - 1));
		}
	}
	const duration = Date.now() - started;
	const content = result.ok ? result.content : `Error: ${result.error}`;
	await requestJson("/api/state/changes", { method: "POST", body: { changes: [
		{ type: "message_upsert", message: {
			id: pane.retry_message_id || crypto.randomUUID(), pane_id: pane.id, role: "assistant", content, thinking: result.thinking || "", usage: result.usage || null,
			provider: result.provider || null, model: result.model || pane.model, created_at: Date.now(), sort_order: 1
		} },
		{ type: "pane_upsert", pane: { ...pane, status: "idle" } }
	] } });
	return { model: pane.model, profile_id: pane.profile_id, ok: result.ok, error: result.error || null, attempts, duration_ms: duration, usage: result.usage || null };
}

function isRetryableBenchmarkError(message) {
	return !/(HTTP 4(00|01|03|04|22|29)|missing an API key|invalid_request|auth_error)/i.test(String(message || ""));
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function streamChat(payload) {
	const response = await fetch(`${baseUrl}/api/chat/stream`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-Token": apiToken },
		body: JSON.stringify(payload)
	});
	if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let event = "message";
	let lines = [];
	const result = { ok: true, content: "", thinking: "", usage: null, provider: null, model: null, error: null };
	const consume = (flush = false) => {
		const parts = buffer.split(/\r?\n/);
		buffer = flush ? "" : (parts.pop() || "");
		for (const line of parts) {
			if (!line) {
				if (lines.length) applyEvent(event, lines.join("\n"), result);
				event = "message"; lines = [];
			} else if (line.startsWith("event:")) event = line.slice(6).trim();
			else if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
		}
		if (flush && lines.length) applyEvent(event, lines.join("\n"), result);
	};
	while (true) {
		const { value, done } = await reader.read();
		if (done) { buffer += decoder.decode(); consume(true); break; }
		buffer += decoder.decode(value, { stream: true }); consume();
	}
	if (!result.ok) throw new Error(result.error || "Provider stream failed.");
	return result;
}

function applyEvent(event, raw, result) {
	let payload;
	try { payload = JSON.parse(raw); } catch { return; }
	if (event === "token") result.content += payload.delta || "";
	if (event === "thinking") result.thinking += payload.delta || "";
	if (event === "error") { result.ok = false; result.error = payload.message || payload.error || "Provider stream failed."; }
	if (event === "done") {
		result.content = payload.output_text || result.content;
		result.thinking = payload.thinking_text || result.thinking;
		result.usage = payload.usage || null;
		result.provider = payload.provider || null;
		result.model = payload.model || null;
	}
}

async function requestJson(endpoint, options = {}) {
	const response = await fetch(`${baseUrl}${endpoint}`, {
		method: options.method || "GET",
		headers: { "X-API-Token": apiToken, ...(options.body ? { "Content-Type": "application/json" } : {}) },
		body: options.body ? JSON.stringify(options.body) : undefined
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok || !payload?.ok) throw new Error(`${endpoint} failed: HTTP ${response.status} ${payload?.error?.message || ""}`.trim());
	return payload;
}

async function writeRun() {
	await fs.mkdir(outputDirectory, { recursive: true });
	await fs.writeFile(path.join(outputDirectory, `${runId}.json`), `${JSON.stringify(run, null, 2)}\n`);
}

async function readPriorRun() {
	try {
		return JSON.parse(await fs.readFile(path.join(outputDirectory, `${runId}.json`), "utf8"));
	} catch {
		return null;
	}
}

async function mapWithConcurrency(items, limit, iteratee) {
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const item = items[next++];
			await iteratee(item);
		}
	}));
}

function formatDuration(milliseconds) {
	const seconds = Math.round(milliseconds / 1000);
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
}

function fail(message) { throw new Error(message); }
