const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	DEFAULT_BENCHMARK_PANE_PROFILE,
	parseBenchmarkCliArgs,
	resolveBenchmarkSelection
} = require("../lib/benchmark-selection");

function fixtureState() {
	return {
		settings: {
			temperature: 0.2,
			maxTokens: 1000,
			profiles: [
				{ id: "provider-a", name: "Provider A", models_csv: "glm-5.3-flash, shared-model" },
				{ id: "provider-b", name: "Provider B", models_csv: "glm-5.2, shared-model" }
			],
			paneProfiles: [
				{ id: "default-benchmark", name: DEFAULT_BENCHMARK_PANE_PROFILE, panes: [
					{ profile_id: "provider-b", model: "glm-5.2" },
					{ profile_id: "provider-a", model: "glm-5.3-flash" }
				] },
				{ id: "explicit", name: "Exact Saved Profile", panes: [{ profile_id: "provider-a", model: "glm-5.3-flash" }] }
			]
		},
		chats: []
	};
}

test("no selection flags default to Benchmarks 082626 in saved pane order", () => {
	const selection = resolveBenchmarkSelection(parseBenchmarkCliArgs([]), fixtureState());
	assert.equal(selection.mode, "pane_profile");
	assert.equal(selection.paneProfileName, "Benchmarks 082626");
	assert.deepEqual(selection.lanes.map((lane) => [lane.profile_id, lane.model]), [
		["provider-b", "glm-5.2"],
		["provider-a", "glm-5.3-flash"]
	]);
});

test("explicit pane-profile selection remains supported", () => {
	const selection = resolveBenchmarkSelection(parseBenchmarkCliArgs(["--pane-profile", "Exact Saved Profile"]), fixtureState());
	assert.equal(selection.mode, "pane_profile");
	assert.equal(selection.paneProfileName, "Exact Saved Profile");
	assert.deepEqual(selection.lanes.map((lane) => lane.model), ["glm-5.3-flash"]);
});

test("one direct model resolves its unique configured provider", () => {
	const selection = resolveBenchmarkSelection(parseBenchmarkCliArgs(["--model", "glm-5.3-flash"]), fixtureState());
	assert.equal(selection.mode, "custom_models");
	assert.deepEqual(selection.lanes, [{ profile_id: "provider-a", provider_profile_name: "Provider A", model: "glm-5.3-flash" }]);
});

test("multiple direct models preserve supplied order", () => {
	const selection = resolveBenchmarkSelection(parseBenchmarkCliArgs([
		"--model", "glm-5.3-flash", "--model", "glm-5.2"
	]), fixtureState());
	assert.deepEqual(selection.lanes.map((lane) => lane.model), ["glm-5.3-flash", "glm-5.2"]);
});

test("pane-profile and model selection are mutually exclusive", () => {
	assert.throws(
		() => resolveBenchmarkSelection(parseBenchmarkCliArgs(["--pane-profile", "Exact Saved Profile", "--model", "glm-5.3-flash"]), fixtureState()),
		/--pane-profile and --model cannot be combined/
	);
});

test("automatic provider resolution rejects missing and ambiguous exact model matches", () => {
	assert.throws(
		() => resolveBenchmarkSelection(parseBenchmarkCliArgs(["--model", "unknown-model"]), fixtureState()),
		/No provider profile contains exact model ID "unknown-model".*--provider-profile/
	);
	assert.throws(
		() => resolveBenchmarkSelection(parseBenchmarkCliArgs(["--model", "shared-model"]), fixtureState()),
		/Provider A, Provider B.*--provider-profile/
	);
});

test("explicit provider profiles allow uncataloged models by name or ID", () => {
	const byName = resolveBenchmarkSelection(parseBenchmarkCliArgs([
		"--model", "brand-new-model", "--provider-profile", "Provider A"
	]), fixtureState());
	const byId = resolveBenchmarkSelection(parseBenchmarkCliArgs([
		"--model", "another-new-model", "--provider-profile", "provider-b"
	]), fixtureState());
	assert.equal(byName.lanes[0].profile_id, "provider-a");
	assert.equal(byName.lanes[0].model, "brand-new-model");
	assert.equal(byId.lanes[0].profile_id, "provider-b");
	assert.equal(byId.lanes[0].model, "another-new-model");
});

test("missing and invalid explicit provider profiles fail clearly", () => {
	assert.throws(
		() => resolveBenchmarkSelection(parseBenchmarkCliArgs(["--model", "glm-5.3-flash", "--provider-profile"]), fixtureState()),
		/--provider-profile requires a non-empty value/
	);
	assert.throws(
		() => resolveBenchmarkSelection(parseBenchmarkCliArgs(["--model", "glm-5.3-flash", "--provider-profile", "Missing Provider"]), fixtureState()),
		/Provider profile not found: Missing Provider/
	);
});

test("duplicate model arguments keep only the first occurrence", () => {
	const selection = resolveBenchmarkSelection(parseBenchmarkCliArgs([
		"--model", "glm-5.2", "--model", "glm-5.3-flash", "--model", "glm-5.2"
	]), fixtureState());
	assert.deepEqual(selection.lanes.map((lane) => lane.model), ["glm-5.2", "glm-5.3-flash"]);
});

test("runner validates selection before mutations and preserves exact-lane resumability and artifact metadata", async (t) => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-chat-benchmark-selection-"));
	t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
	const testFile = path.join(tempRoot, "suite.md");
	const outputDirectory = path.join(tempRoot, "runs");
	await fs.writeFile(testFile, "# TEST 1: Fixture\n\n## Prompt\nReturn fixture output.\n");

	const runtime = await startFixtureServer(fixtureState());
	t.after(() => new Promise((resolve) => runtime.server.close(resolve)));
	const common = [
		"--tests", testFile,
		"--output-dir", outputDirectory,
		"--base-url", runtime.baseUrl,
		"--api-token", "fixture-token",
		"--require-instance-role", "benchmark",
		"--stream-timeout-ms", "5000",
		"--title-prefix", "FOCUSED"
	];

	const rejected = await runBenchmark([...common, "--run-id", "invalid", "--pane-profile", "Exact Saved Profile", "--model", "glm-5.3-flash"]);
	assert.equal(rejected.code, 1);
	assert.match(rejected.stderr, /cannot be combined/);
	assert.equal(runtime.mutations.length, 0);
	assert.equal(runtime.streams.length, 0);

	const focusedArgs = [...common, "--run-id", "focused", "--model", "glm-5.3-flash", "--model", "glm-5.2"];
	const first = await runBenchmark(focusedArgs);
	assert.equal(first.code, 0, first.stderr);
	assert.deepEqual(runtime.streams.map((payload) => [payload.profile_id, payload.model]), [
		["provider-a", "glm-5.3-flash"],
		["provider-b", "glm-5.2"]
	]);
	assert.ok(runtime.streams.every((payload) => payload.benchmark.selection_mode === "custom_models"));
	assert.ok(runtime.streams.every((payload) => payload.benchmark.pane_profile === ""));
	const focusedArtifact = JSON.parse(await fs.readFile(path.join(outputDirectory, "focused.json"), "utf8"));
	assert.equal(focusedArtifact.selection_mode, "custom_models");
	assert.equal(focusedArtifact.pane_profile, null);
	assert.equal(focusedArtifact.selected_pane_profile, null);
	assert.deepEqual(focusedArtifact.model_lanes.map((lane) => lane.model), ["glm-5.3-flash", "glm-5.2"]);
	assert.deepEqual(focusedArtifact.tests[0].panes.map((pane) => pane.model), ["glm-5.3-flash", "glm-5.2"]);

	const streamCount = runtime.streams.length;
	const resumed = await runBenchmark(focusedArgs);
	assert.equal(resumed.code, 0, resumed.stderr);
	assert.equal(runtime.streams.length, streamCount);
	const resumedArtifact = JSON.parse(await fs.readFile(path.join(outputDirectory, "focused.json"), "utf8"));
	assert.ok(resumedArtifact.tests[0].panes.every((pane) => pane.reused === true));

	const paneRun = await runBenchmark([...common, "--run-id", "pane", "--title-prefix", "PANE", "--pane-profile", "Exact Saved Profile"]);
	assert.equal(paneRun.code, 0, paneRun.stderr);
	const paneArtifact = JSON.parse(await fs.readFile(path.join(outputDirectory, "pane.json"), "utf8"));
	assert.equal(paneArtifact.selection_mode, "pane_profile");
	assert.equal(paneArtifact.pane_profile, "Exact Saved Profile");
	assert.equal(paneArtifact.selected_pane_profile, "Exact Saved Profile");
	assert.deepEqual(paneArtifact.model_lanes, []);
});

function runBenchmark(args) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(__dirname, "..", "scripts", "run-benchmark-suite.js"), ...args], {
			cwd: path.join(__dirname, ".."),
			env: { ...process.env }
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

async function startFixtureServer(initialState) {
	const state = structuredClone(initialState);
	const mutations = [];
	const streams = [];
	const server = http.createServer(async (request, response) => {
		if (request.url === "/api/health") {
			return sendJson(response, { ok: true, instance: { role: "benchmark" }, benchmark: { default_max_response_tokens: 1000, recommended_concurrency: 1, max_concurrency: 4 }, tool_runtime: { schemas: [] } });
		}
		if (request.url === "/api/state" && request.method === "GET") {
			return sendJson(response, { ok: true, state });
		}
		if (request.url === "/api/state/changes" && request.method === "POST") {
			const body = await readJson(request);
			mutations.push(body);
			applyChanges(state, body.changes || []);
			return sendJson(response, { ok: true, applied: (body.changes || []).length });
		}
		if (request.url === "/api/chat/stream" && request.method === "POST") {
			const body = await readJson(request);
			streams.push(body);
			response.writeHead(200, { "Content-Type": "text/event-stream" });
			response.end(`event: done\ndata: ${JSON.stringify({ output_text: `fixture:${body.model}`, model: body.model, provider: body.profile_id, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } })}\n\n`);
			return;
		}
		response.writeHead(404);
		response.end();
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return { server, mutations, streams, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function applyChanges(state, changes) {
	for (const change of changes) {
		if (change.type === "chat_upsert") {
			const index = state.chats.findIndex((chat) => chat.id === change.chat.id);
			const next = { ...(index >= 0 ? state.chats[index] : {}), ...change.chat, panes: index >= 0 ? state.chats[index].panes : [] };
			if (index >= 0) state.chats[index] = next;
			else state.chats.push(next);
		}
		if (change.type === "pane_upsert") {
			const chat = state.chats.find((entry) => entry.id === change.pane.chat_id);
			const index = chat.panes.findIndex((pane) => pane.id === change.pane.id);
			const next = { ...(index >= 0 ? chat.panes[index] : {}), ...change.pane, messages: index >= 0 ? chat.panes[index].messages : [] };
			if (index >= 0) chat.panes[index] = next;
			else chat.panes.push(next);
			chat.panes.sort((left, right) => left.sort_order - right.sort_order);
		}
		if (change.type === "message_upsert") {
			const pane = state.chats.flatMap((chat) => chat.panes).find((entry) => entry.id === change.message.pane_id);
			const index = pane.messages.findIndex((message) => message.id === change.message.id);
			if (index >= 0) pane.messages[index] = change.message;
			else pane.messages.push(change.message);
			pane.messages.sort((left, right) => left.sort_order - right.sort_order);
		}
	}
}

function readJson(request) {
	return new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => { body += chunk; });
		request.on("end", () => {
			try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
		});
		request.on("error", reject);
	});
}

function sendJson(response, payload) {
	response.writeHead(200, { "Content-Type": "application/json" });
	response.end(JSON.stringify(payload));
}
