const crypto = require("node:crypto");
const http = require("node:http");
const { once } = require("node:events");
const { readBoundedResponse } = require("../bounded-response");
const { connectionError, publicConnection } = require("../connections/connection-store");

const ISSUER = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const terminalRefreshErrors = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);
const random = () => crypto.randomBytes(32).toString("base64url");
const safeEqual = (a, b) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function createChatGPTAuth({ getStore, fetchFn = fetch, now = Date.now, onDisconnect = () => {}, transactionTtlMs = 600000 }) {
	const attempts = new Map();
	const refreshes = new Map();
	const disconnecting = new Set();
	let discoveryPromise;
	let jwks;
	let closed = false;
	let starting = false;
	async function jsonRequest(url, init = {}) {
		const response = await fetchFn(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
		const raw = await readBoundedResponse(response, 256 * 1024, "chatgpt_response_too_large");
		let data;
		try { data = JSON.parse(raw); } catch { throw connectionError("chatgpt_auth_unavailable", "OpenAI authentication returned an invalid response."); }
		if (!response.ok) {
			const code = typeof data.error === "string" ? data.error : data.error?.code;
			const error = connectionError(terminalRefreshErrors.has(code) ? code : "chatgpt_auth_unavailable", "OpenAI authentication could not complete. Try again or reconnect your account.");
			error.status = response.status;
			throw error;
		}
		return data;
	}
	async function discovery() {
		if (!discoveryPromise) discoveryPromise = jsonRequest(`${ISSUER}/.well-known/openid-configuration`).then(data => {
			if (data.issuer !== ISSUER) throw connectionError("chatgpt_invalid_issuer", "Unexpected OpenAI authentication issuer.");
			for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"]) {
				const url = new URL(data[field]);
				if (url.origin !== ISSUER || url.username || url.password || url.hash) throw connectionError("chatgpt_invalid_issuer", "Unexpected OpenAI authentication endpoint.");
			}
			return data;
		}).catch(error => { discoveryPromise = null; throw error; });
		return discoveryPromise;
	}
	async function verifyIdentity(token, clientId, nonce) {
		const config = await discovery();
		const jose = await import("jose");
		// The custom fetch remains fixed to discovered OpenAI JWKS and is bounded.
		if (!jwks) jwks = jose.createRemoteJWKSet(new URL(config.jwks_uri), {
			[jose.customFetch]: async (url, init) => {
				const data = await jsonRequest(String(url), init);
				return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
			}
		});
		const { payload } = await jose.jwtVerify(token, jwks, {
			issuer: ISSUER, audience: clientId, algorithms: ["RS256"], requiredClaims: ["sub", "exp", "iat"],
			clockTolerance: 5, currentDate: new Date(now())
		});
		if (!safeEqual(payload.nonce, nonce) || typeof payload.sub !== "string" || !payload.sub) throw connectionError("chatgpt_invalid_identity", "ChatGPT identity could not be verified.");
		return payload;
	}
	function tokenFields(tokens, prior = {}) {
		const scopes = typeof tokens.scope === "string" ? tokens.scope.split(/\s+/).filter(Boolean) : prior.scopes || [];
		if (tokens.token_type && tokens.token_type.toLowerCase() !== "bearer") throw connectionError("chatgpt_invalid_tokens", "Unsupported ChatGPT token type.");
		if (scopes.includes("chatgpt.tokens.use.direct") && (typeof tokens.access_token !== "string" || !tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0)) {
			throw connectionError("chatgpt_invalid_tokens", "ChatGPT did not return usable plan credentials.");
		}
		return {
			access_token: typeof tokens.access_token === "string" ? tokens.access_token : "",
			refresh_token: typeof tokens.refresh_token === "string" ? tokens.refresh_token : "",
			id_token: typeof tokens.id_token === "string" ? tokens.id_token : prior.id_token || "",
			scopes, expires_at: now() + (Number(tokens.expires_in) || 0) * 1000,
			earliest_refresh_at: tokens.earliest_refresh_at ?? null
		};
	}
	function finish(attempt, status, error = null) {
		attempt.status = status; attempt.error = error;
		clearTimeout(attempt.timer);
		attempt.server.close();
		attempt.verifier = ""; attempt.nonce = ""; attempt.state = "";
		const cleanup = setTimeout(() => attempts.delete(attempt.id), 60000); cleanup.unref();
	}
	async function start(options = {}) {
		if (starting) throw connectionError("chatgpt_login_pending", "Finish or cancel the existing ChatGPT sign-in first.");
		starting = true;
		try { return await startAttempt(options); } finally { starting = false; }
	}
	async function startAttempt({ connectionId, reconsent = false } = {}) {
		if (closed) throw connectionError("chatgpt_auth_closed", "ChatGPT connections are shutting down.");
		if ([...attempts.values()].some(a => ["pending", "exchanging"].includes(a.status))) throw connectionError("chatgpt_login_pending", "Finish or cancel the existing ChatGPT sign-in first.");
		const store = getStore();
		if (connectionId && !/^connection-[a-f0-9-]{36}$/.test(connectionId)) throw connectionError("chatgpt_connection_not_found", "ChatGPT connection not found.");
		const prior = connectionId ? store.read(connectionId) : null;
		if (connectionId && !prior) throw connectionError("chatgpt_connection_not_found", "ChatGPT connection not found.");
		const config = await discovery();
		if (closed) throw connectionError("chatgpt_auth_closed", "ChatGPT connections are shutting down.");
		const attempt = { id: random(), state: random(), nonce: random(), verifier: random(), status: "pending", expiresAt: now() + transactionTtlMs, prior };
		attempt.server = http.createServer(async (req, res) => {
			res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
			res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			const reply = (status, message) => { res.writeHead(status); res.end(message); };
			if (req.method !== "GET" || req.headers.host !== `127.0.0.1:${attempt.port}` || String(req.url).length > 16384) return reply(400, "Invalid callback.");
			const callback = new URL(req.url, attempt.redirectUri);
			if (callback.pathname !== "/auth/callback") return reply(404, "Not found.");
			if (attempt.status !== "pending" || now() >= attempt.expiresAt || !safeEqual(callback.searchParams.get("state"), attempt.state)) return reply(400, "Sign-in could not be verified.");
			attempt.status = "exchanging";
			try {
				if (["state", "code", "client_id", "error"].some(key => callback.searchParams.getAll(key).length > 1)) throw new Error("duplicate");
				if (callback.searchParams.has("error")) throw new Error("denied");
				const clientId = callback.searchParams.get("client_id") || prior?.client_id;
				if (!/^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(clientId || "") || prior && clientId !== prior.client_id) throw new Error("client");
				const code = callback.searchParams.get("code");
				if (!code) throw new Error("code");
				const tokens = await jsonRequest(config.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: RESOURCE }) });
				const identity = await verifyIdentity(tokens.id_token, clientId, attempt.nonce);
				if (prior && (prior.subject !== identity.sub || prior.issuer !== identity.iss)) throw new Error("identity");
				if (attempt.status !== "exchanging" || closed) throw new Error("cancelled");
				const existing = prior || store.list().find(r => r.client_id === clientId && r.subject === identity.sub && r.issuer === identity.iss);
				const id = existing?.id || `connection-${crypto.randomUUID()}`;
				const fields = tokenFields(tokens);
				if (existing) onDisconnect(existing.id);
				const record = store.save({
					id, issuer: identity.iss, subject: identity.sub, client_id: clientId,
					label: `${identity.email || identity.name || "ChatGPT account"} · ${id.slice(-6)}`,
					email: typeof identity.email === "string" ? identity.email : null,
					name: typeof identity.name === "string" ? identity.name : null,
					...fields, status: "connected", connected_at: now(), binding_epoch: (existing?.binding_epoch || 0) + 1
				}, existing?.generation);
				attempt.connection = publicConnection(record);
				finish(attempt, "completed"); reply(200, "ChatGPT connected. Return to AI Chat.");
			} catch {
				if (attempt.status === "exchanging") finish(attempt, "failed", "ChatGPT sign-in could not be completed. Start a new sign-in.");
				reply(400, "ChatGPT sign-in could not be completed. Return to AI Chat.");
			}
		});
		attempt.server.listen(0, "127.0.0.1");
		await once(attempt.server, "listening");
		if (closed) { attempt.server.close(); throw connectionError("chatgpt_auth_closed", "ChatGPT connections are shutting down."); }
		attempt.port = attempt.server.address().port;
		attempt.redirectUri = `http://127.0.0.1:${attempt.port}/auth/callback`;
		attempt.timer = setTimeout(() => finish(attempt, "expired", "ChatGPT sign-in expired."), transactionTtlMs); attempt.timer.unref();
		attempts.set(attempt.id, attempt);
		const url = new URL(config.authorization_endpoint);
		url.search = new URLSearchParams({ client_id: prior?.client_id || "dynamic_agent_client", ext_agent_host_id: store.hostId,
			...(!prior ? { agent_name_hint: "AI Chat" } : {}), response_type: "code", redirect_uri: attempt.redirectUri, scope: SCOPES, resource: RESOURCE,
			state: attempt.state, nonce: attempt.nonce, code_challenge_method: "S256", code_challenge: crypto.createHash("sha256").update(attempt.verifier).digest("base64url"),
			...(reconsent ? { prompt: "consent" } : {}) }).toString();
		// Deliberately omit optional token/login hints: no retained ID token is
		// returned to browser JavaScript or embedded in frontend diagnostics.
		return { attempt_id: attempt.id, authorization_url: url.toString(), expires_at: attempt.expiresAt };
	}
	function status(id) {
		const a = attempts.get(id);
		if (!a) throw connectionError("chatgpt_attempt_not_found", "ChatGPT sign-in attempt not found.");
		return { status: a.status, ...(a.connection ? { connection: a.connection } : {}), ...(a.error ? { error: a.error } : {}) };
	}
	function cancel(id) { const a = attempts.get(id); if (a && ["pending", "exchanging"].includes(a.status)) finish(a, "cancelled"); }
	async function lease(id) {
		if (closed || disconnecting.has(id)) throw connectionError("chatgpt_disconnected", "Reconnect ChatGPT before sending a request.");
		const store = getStore();
		let record = store.read(id);
		if (!record || record.status !== "connected") throw connectionError("chatgpt_disconnected", "Reconnect ChatGPT before sending a request.");
		if (!record.scopes.includes("chatgpt.tokens.use.direct")) throw connectionError("chatgpt_permission_required", "Enable ChatGPT plan usage for this connection before sending requests.");
		if (record.expires_at <= now() + 30000) {
			if (!refreshes.has(id)) {
				const promise = (async () => {
					try {
						if (!record.refresh_token) throw connectionError("invalid_refresh_token", "Reconnect ChatGPT to renew access.");
						const config = await discovery();
						const tokens = await jsonRequest(config.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: record.client_id, refresh_token: record.refresh_token, resource: RESOURCE }) });
						if (!tokens.refresh_token) throw connectionError("chatgpt_invalid_tokens", "OpenAI did not return a replacement refresh token.");
						if (closed) throw connectionError("chatgpt_auth_closed", "ChatGPT connections are shutting down.");
						return store.save({ ...record, ...tokenFields(tokens, record) }, record.generation);
					} catch (error) {
						if (!closed && terminalRefreshErrors.has(error.code)) store.save({ ...record, status: "reconnect_required", access_token: "", refresh_token: "", id_token: "" }, record.generation);
						throw error;
					}
				})().finally(() => refreshes.delete(id));
				refreshes.set(id, promise);
			}
			record = await refreshes.get(id);
		}
		if (disconnecting.has(id) || closed || !record.scopes.includes("chatgpt.tokens.use.direct")) throw connectionError("chatgpt_permission_required", "ChatGPT plan permission is unavailable.");
		return { accessToken: record.access_token, connectionId: id, bindingEpoch: record.binding_epoch, expiresAt: record.expires_at };
	}
	async function disconnect(id) {
		if (!/^connection-[a-f0-9-]{36}$/.test(id)) throw connectionError("chatgpt_connection_not_found", "ChatGPT connection not found.");
		disconnecting.add(id); onDisconnect(id);
		for (const a of attempts.values()) if (a.prior?.id === id) cancel(a.id);
		try {
			await refreshes.get(id)?.catch(() => {});
			const store = getStore(); const record = store.read(id);
			if (!record) throw connectionError("chatgpt_connection_not_found", "ChatGPT connection not found.");
			let revoked = !record.refresh_token;
			try {
				if (record.refresh_token) {
					const config = await discovery();
					const response = await fetchFn(config.revocation_endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: record.refresh_token, token_type_hint: "refresh_token", client_id: record.client_id }) });
					revoked = response.status === 200; await response.body?.cancel?.();
				}
			} catch { revoked = false; }
			store.save({ ...record, status: "disconnected", access_token: "", refresh_token: "", id_token: "", binding_epoch: record.binding_epoch + 1 }, record.generation);
			return { disconnected: true, remote_revocation_confirmed: revoked };
		} finally { disconnecting.delete(id); }
	}
	return { start, status, cancel, lease, disconnect,
		async close() { closed = true; for (const id of attempts.keys()) cancel(id); await Promise.allSettled([...refreshes.values()]); }
	};
}
module.exports = { createChatGPTAuth, ISSUER, RESOURCE, SCOPES };
