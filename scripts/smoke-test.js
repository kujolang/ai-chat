const API_TOKEN = String(process.env.SMOKE_API_TOKEN || process.env.API_AUTH_TOKEN || "").trim();
const BASE_URL = resolveBaseUrl();

function resolveBaseUrl() {
	const explicitBaseUrl = String(process.env.SMOKE_BASE_URL || "").trim();
	if (explicitBaseUrl) {
		return explicitBaseUrl.replace(/\/$/, "");
	}

	const protocol = String(process.env.SMOKE_PROTOCOL || "http").trim() || "http";
	const host = String(process.env.SMOKE_HOST || "127.0.0.1").trim() || "127.0.0.1";
	const port = Number.parseInt(String(process.env.SMOKE_PORT || process.env.PORT || "4173"), 10);
	const normalizedPort = Number.isFinite(port) && port > 0 ? port : 4173;
	return `${protocol}://${host}:${normalizedPort}`;
}

function getAuthHeaders(headers = {}) {
	if (!API_TOKEN) {
		throw new Error("Missing API token. Set SMOKE_API_TOKEN or API_AUTH_TOKEN before running smoke checks.");
	}

	return {
		"X-API-Token": API_TOKEN,
		...headers
	};
}

async function request(path, method = "GET", body = null) {
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: getAuthHeaders(body ? { "Content-Type": "application/json" } : {}),
		body: body ? JSON.stringify(body) : undefined
	});

	const text = await response.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch (error) {
		json = null;
	}

	return { status: response.status, body: text, json };
}

function assertOkResponse(step, result) {
	if (result.status !== 200) {
		throw new Error(`${step} failed with HTTP ${result.status}: ${result.body}`);
	}
	if (!result.json || result.json.ok !== true) {
		throw new Error(`${step} failed with non-ok payload: ${result.body}`);
	}
}

function report(step, ...values) {
	console.log(step, ...values);
}

(async () => {
	try {
		const health = await request("/api/health");
		assertOkResponse("health", health);
		if (!health.json.auth_configured) {
			throw new Error("Health check returned auth_configured=false.");
		}
		report("health", health.status);

		const providers = await request("/api/providers");
		assertOkResponse("providers", providers);
		if (!Array.isArray(providers.json.providers) || providers.json.providers.length === 0) {
			throw new Error("Provider catalog was empty.");
		}
		report("providers", providers.status, providers.json.providers.length);

		const state = await request("/api/state");
		assertOkResponse("state", state);
		const firstProfile = state.json
			&& state.json.state
			&& state.json.state.settings
			&& Array.isArray(state.json.state.settings.profiles)
			? state.json.state.settings.profiles[0]
			: null;

		if (!firstProfile || !firstProfile.id) {
			throw new Error("No provider profile found in state response.");
		}
		report("state", state.status);

		const chat = await request("/api/chat", "POST", {
			profile_id: firstProfile.id,
			model: "gpt-4.1-mini",
			offline_fixture: true,
			messages: [
				{ role: "user", content: "Why normalize AI provider responses?" }
			]
		});
		assertOkResponse("chat", chat);
		if (typeof chat.json.output_text !== "string" || !chat.json.output_text.trim()) {
			throw new Error("Chat response did not include output_text.");
		}
		report("chat", chat.status);
		report("smoke checks passed against", BASE_URL);
	} catch (error) {
		console.error("smoke checks failed:", error.message || error);
		process.exit(1);
	}
})();
