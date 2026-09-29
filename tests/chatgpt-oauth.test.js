const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createConnectionStore, publicConnection } = require("../lib/connections/connection-store");
const { createChatGPTAuth, ISSUER, SCOPES } = require("../lib/auth/chatgpt-oauth");
const secret = "test-chatgpt-secret-32-characters-minimum";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function fixture(t, options = {}) {
	const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-oauth-")));
	const store = createConnectionStore({ directory, secret });
	const jose = await import("jose");
	const keys = await jose.generateKeyPair("RS256");
	const jwk = await jose.exportJWK(keys.publicKey); jwk.kid = "test-key";
	let authorization;
	let refreshCount = 0;
	let revokeCount = 0;
	let clock = Date.now();
	let refreshError;
	const clientId = "oaiapp_test";
	const fetchFn = async (url, init = {}) => {
		if (url.endsWith("openid-configuration")) return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/accounts/authorize`, token_endpoint: `${ISSUER}/api/accounts/oauth/token`, jwks_uri: `${ISSUER}/.well-known/jwks.json`, revocation_endpoint: `${ISSUER}/api/accounts/oauth/revoke` });
		if (url.endsWith("jwks.json")) return json({ keys: [jwk] });
		if (url.endsWith("/revoke")) { revokeCount++; assert.equal(init.body.get("token"), "refresh-2"); return new Response(null, { status: 200 }); }
		assert.equal(url, `${ISSUER}/api/accounts/oauth/token`);
		assert.equal(init.body.get("client_id"), clientId);
		assert.equal(init.body.get("resource"), "https://api.openai.com/v1");
		if (init.body.get("grant_type") === "refresh_token") {
			refreshCount++; await new Promise(resolve => setTimeout(resolve, 5));
			if (refreshError) return json({ error: refreshError }, 400);
			assert.equal(init.body.get("refresh_token"), "refresh-1");
			return json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600, token_type: "Bearer" });
		}
		assert.equal(crypto.createHash("sha256").update(init.body.get("code_verifier")).digest("base64url"), authorization.searchParams.get("code_challenge"));
		assert.equal(init.body.get("redirect_uri"), authorization.searchParams.get("redirect_uri"));
		let idToken = await new jose.SignJWT({ sub: options.subject || "user-1", email: "test@example.invalid", nonce: options.badNonce ? "wrong" : authorization.searchParams.get("nonce") })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(options.badIssuer ? "https://attacker.invalid" : ISSUER).setAudience(options.badAudience ? "wrong" : clientId).setIssuedAt().setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 100 : "1h").sign(keys.privateKey);
		if (options.badSignature) { const parts = idToken.split("."); parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1); idToken = parts.join("."); }
		return json({ id_token: idToken, access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, token_type: "Bearer", scope: options.identityOnly ? "openid profile email" : SCOPES });
	};
	const auth = createChatGPTAuth({ getStore: () => store, fetchFn, now: () => clock });
	t.after(async () => { await auth.close(); store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
	async function start(params) { const result = await auth.start(params); authorization = new URL(result.authorization_url); return result; }
	async function callback(attempt, extra = {}) {
		const url = new URL(authorization.searchParams.get("redirect_uri"));
		url.search = new URLSearchParams({ state: authorization.searchParams.get("state"), code: "test-code", client_id: clientId, ...extra }).toString();
		return fetch(url);
	}
	return { store, auth, directory, start, callback, get authorization() { return authorization; }, advance() { clock += 3600000; }, get refreshCount() { return refreshCount; }, get revokeCount() { return revokeCount; }, failRefresh(code) { refreshError = code; } };
}

test("ChatGPT dynamic registration verifies identity, keeps secrets off public projections and rotates once across concurrent panes", async t => {
	const f = await fixture(t);
	const attempt = await f.start();
	assert.equal(f.authorization.searchParams.get("client_id"), "dynamic_agent_client");
	assert.equal(f.authorization.searchParams.get("agent_name_hint"), "AI Chat");
	assert.equal(f.authorization.searchParams.get("ext_agent_host_id"), f.store.hostId);
	assert.equal((await f.callback(attempt)).status, 200);
	const state = f.auth.status(attempt.attempt_id);
	assert.equal(state.status, "completed"); assert.equal(state.connection.plan_usage_enabled, true);
	assert.doesNotMatch(JSON.stringify(state), /access-1|refresh-1|id_token|subject|client_id/);
	const id = state.connection.id;
	assert.equal((await f.auth.lease(id)).accessToken, "access-1");
	f.advance();
	const leases = await Promise.all([f.auth.lease(id), f.auth.lease(id), f.auth.lease(id)]);
	assert.equal(f.refreshCount, 1); assert.ok(leases.every(l => l.accessToken === "access-2"));
	assert.equal(leases[0].bindingEpoch, 1);
	assert.deepEqual(await f.auth.disconnect(id), { disconnected: true, remote_revocation_confirmed: true });
	assert.equal(f.revokeCount, 1);
	await assert.rejects(f.auth.lease(id), { code: "chatgpt_disconnected" });
	assert.equal(f.store.read(id).client_id, "oaiapp_test");
	assert.equal(f.store.read(id).refresh_token, "");
	assert.doesNotMatch(fs.readFileSync(path.join(f.directory, "connections.db")).toString(), /access-1|refresh-2|test@example/);
});

for (const option of ["badNonce", "badIssuer", "badAudience", "badSignature", "expired"]) test(`ChatGPT rejects ${option} before saving a connection`, async t => {
	const f = await fixture(t, { [option]: true }); const a = await f.start();
	assert.equal((await f.callback(a)).status, 400); assert.equal(f.store.list().length, 0);
	assert.equal(f.auth.status(a.attempt_id).status, "failed");
});

test("ChatGPT rejects mismatched state without consuming the valid attempt and disallows parallel login", async t => {
	const f = await fixture(t); const a = await f.start();
	await assert.rejects(f.start(), { code: "chatgpt_login_pending" });
	assert.equal((await f.callback(a, { state: "wrong" })).status, 400);
	assert.equal(f.auth.status(a.attempt_id).status, "pending");
	assert.equal((await f.callback(a)).status, 200);
});

test("ChatGPT identity-only grant remains connected but cannot lease inference credentials", async t => {
	const f = await fixture(t, { identityOnly: true }); const a = await f.start(); await f.callback(a);
	const connection = f.auth.status(a.attempt_id).connection;
	assert.equal(connection.plan_usage_enabled, false);
	await assert.rejects(f.auth.lease(connection.id), { code: "chatgpt_permission_required" });
});

test("ChatGPT returning registration reuses host/client but rejects client substitution", async t => {
	const f = await fixture(t); const a = await f.start(); await f.callback(a);
	const id = f.auth.status(a.attempt_id).connection.id;
	const b = await f.start({ connectionId: id });
	assert.equal(f.authorization.searchParams.get("client_id"), "oaiapp_test");
	assert.equal(f.authorization.searchParams.has("agent_name_hint"), false);
	assert.equal(f.authorization.searchParams.has("id_token_hint"), false);
	assert.equal((await f.callback(b, { client_id: "oaiapp_attacker" })).status, 400);
	assert.equal((await f.auth.lease(id)).accessToken, "access-1");
});

test("terminal refresh failure clears tokens; temporary failure preserves them", async t => {
	const f = await fixture(t); const a = await f.start(); await f.callback(a);
	const id = f.auth.status(a.attempt_id).connection.id; f.advance();
	f.failRefresh("temporarily_unavailable"); await assert.rejects(f.auth.lease(id));
	assert.equal(f.store.read(id).refresh_token, "refresh-1");
	f.failRefresh("refresh_token_reused"); await assert.rejects(f.auth.lease(id));
	assert.equal(f.store.read(id).refresh_token, ""); assert.equal(f.store.read(id).status, "reconnect_required");
});

test("encrypted connection store persists stable host, rejects second owner, wrong key and stale writes", () => {
	const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-store-")));
	let store;
	try {
		assert.throws(() => createConnectionStore({ directory, secret: "short" }), { code: "chatgpt_storage_unconfigured" });
		store = createConnectionStore({ directory, secret }); const host = store.hostId;
		assert.throws(() => createConnectionStore({ directory, secret }), { code: "chatgpt_storage_in_use" });
		const r = store.save({ id: "connection-test", access_token: "private-value", status: "connected", scopes: [] });
		assert.throws(() => store.save(r, 0), { code: "chatgpt_connection_changed" });
		assert.equal(publicConnection(r).plan_usage_enabled, false);
		store.close();
		assert.throws(() => createConnectionStore({ directory, secret: secret + "wrong" }), { code: "chatgpt_storage_locked" });
		store = createConnectionStore({ directory, secret }); assert.equal(store.hostId, host);
		assert.equal(store.read(r.id).access_token, "private-value");
		assert.equal(fs.statSync(path.join(directory, "connections.db")).mode & 0o777, 0o600);
	} finally { store?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('concurrent sign-in starts allocate only one pending callback listener', async t => {
 const f = await fixture(t);
 const starts = await Promise.allSettled([f.auth.start(), f.auth.start(), f.auth.start()]);
 assert.equal(starts.filter(s => s.status === 'fulfilled').length, 1);
 assert.ok(starts.filter(s => s.status === 'rejected').every(s => s.reason.code === 'chatgpt_login_pending'));
 const a = starts.find(s => s.status === 'fulfilled').value;
 f.auth.cancel(a.attempt_id); assert.equal(f.auth.status(a.attempt_id).status, 'cancelled');
});
test('missing issued client and OAuth denial never exchange or save credentials', async t => {
 for (const extra of [{ client_id: '' }, { error: 'access_denied' }]) {
  const f = await fixture(t); const a = await f.start();
  assert.equal((await f.callback(a, extra)).status, 400); assert.equal(f.store.list().length, 0);
 }
});
