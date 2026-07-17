const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { test } = require("node:test");
const { promisify } = require("node:util");
const { once } = require("node:events");

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const API_TOKEN = "smoke-test-token";

async function readJsonBody(request) {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(chunk);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	return text ? JSON.parse(text) : null;
}

function jsonResponse(response, payload) {
	response.writeHead(200, { "Content-Type": "application/json" });
	response.end(JSON.stringify(payload));
}

async function withSmokeServer(callback, health = { ok: true, auth_configured: true }) {
	const server = http.createServer(async (request, response) => {
		assert.equal(request.headers["x-api-token"], API_TOKEN);

		if (request.url === "/api/health") {
			jsonResponse(response, health);
			return;
		}

		if (request.url === "/api/providers") {
			jsonResponse(response, { ok: true, providers: [{ id: "openai" }, { id: "deepseek" }] });
			return;
		}

		if (request.url === "/api/state") {
			jsonResponse(response, {
				ok: true,
				state: {
					settings: {
						profiles: [{ id: "profile-openai" }]
					}
				}
			});
			return;
		}

		if (request.url === "/api/chat") {
			const body = await readJsonBody(request);
			assert.equal(body.profile_id, "profile-openai");
			assert.equal(body.offline_fixture, true);
			jsonResponse(response, { ok: true, output_text: "fixture response" });
			return;
		}

		response.writeHead(404, { "Content-Type": "application/json" });
		response.end(JSON.stringify({ ok: false }));
	});

	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;

	try {
		return await callback(baseUrl);
	} finally {
		server.close();
		await once(server, "close");
	}
}

test("smoke script emits stable compact status output", async () => {
	await withSmokeServer(async (baseUrl) => {
		const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "smoke-test.js")], {
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				SMOKE_BASE_URL: baseUrl,
				SMOKE_API_TOKEN: API_TOKEN
			}
		});

		assert.equal(stderr, "");
		assert.equal(stdout, [
			"health 200",
			"providers 200 2",
			"state 200",
			"chat 200",
			`smoke checks passed against ${baseUrl}`,
			""
		].join("\n"));
	});
});

test("browser smoke mode requires an available Playwright Chromium runtime", async () => {
	await withSmokeServer(async (baseUrl) => {
		await assert.rejects(
			execFileAsync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "smoke-test.js")], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					BROWSER_EXPECTED: "1",
					SMOKE_BASE_URL: baseUrl,
					SMOKE_API_TOKEN: API_TOKEN
				}
			}),
			(error) => /available Playwright Chromium browser runtime/.test(String(error.stderr))
		);
	});
});

test("browser smoke mode accepts an advertised Playwright Chromium runtime", async () => {
	const health = {
		ok: true,
		auth_configured: true,
		tool_runtime: {
			tools: ["web_search", "browser_open"],
			browser: { available: true, backend: "playwright-chromium" }
		}
	};
	await withSmokeServer(async (baseUrl) => {
		const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "smoke-test.js")], {
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				BROWSER_EXPECTED: "1",
				SMOKE_BASE_URL: baseUrl,
				SMOKE_API_TOKEN: API_TOKEN
			}
		});
		assert.equal(stderr, "");
		assert.match(stdout, /smoke checks passed against/);
	}, health);
});
