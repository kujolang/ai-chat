const crypto = require("node:crypto");
const dns = require("node:dns");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const { isBlockedIp } = require("./browser-runtime");

const MAX_TOOLS = 256;
const MAX_RESULT_BYTES = 256 * 1024;

function createMcpManager(db, { masterKey, fetchFn = fetch, spawnFn = spawn, transportFn, now = Date.now, uid = () => crypto.randomUUID() } = {}) {
	const key = crypto.createHmac("sha256", masterKey).update("ai-chat-mcp-connections-v1").digest();
	db.exec(`
		CREATE TABLE IF NOT EXISTS mcp_servers (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, publisher TEXT NOT NULL DEFAULT '',
			source TEXT NOT NULL DEFAULT '', transport TEXT NOT NULL, command TEXT NOT NULL DEFAULT '',
			args_json TEXT NOT NULL DEFAULT '[]', url TEXT NOT NULL DEFAULT '', auth_blob TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 0, scopes_json TEXT NOT NULL DEFAULT '[]', tools_json TEXT NOT NULL DEFAULT '[]', resources_json TEXT NOT NULL DEFAULT '[]',
			last_error TEXT NOT NULL DEFAULT '', last_checked_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS mcp_chat_scopes (
			chat_id TEXT NOT NULL, server_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
			tool_names_json TEXT NOT NULL DEFAULT '[]', resource_uris_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL,
			PRIMARY KEY(chat_id, server_id), FOREIGN KEY(server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
		);
	`);
	ensureColumn(db, "mcp_servers", "resources_json", "TEXT NOT NULL DEFAULT '[]'");
	ensureColumn(db, "mcp_chat_scopes", "resource_uris_json", "TEXT NOT NULL DEFAULT '[]'");

	function list() { return db.prepare("SELECT * FROM mcp_servers ORDER BY name COLLATE NOCASE, id").all().map(publicServer); }
	function get(id) { const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id); return row ? publicServer(row) : null; }
	function save(input = {}) {
		const id = cleanId(input.id) || `mcp_${uid()}`.slice(0, 180);
		const existing = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id);
		const transport = input.transport === "stdio" ? "stdio" : "http";
		const kind = input.kind === "plugin" ? "plugin" : "mcp";
		const name = cleanText(input.name, 120);
		if (!name) throw failure("mcp_name_required", "A server name is required.");
		const sameTransport = existing?.transport === transport;
		const commandInput = input.command === undefined && sameTransport ? existing.command : input.command;
		const argsInput = input.args === undefined && sameTransport ? parseArray(existing.args_json) : input.args;
		const urlInput = input.url === undefined && sameTransport ? existing.url : input.url;
		const command = transport === "stdio" ? validateCommand(commandInput) : "";
		const args = transport === "stdio" ? validateArgs(argsInput) : [];
		const url = transport === "http" ? validateUrl(urlInput) : "";
		const authBlob = input.auth_token === undefined ? (existing?.auth_blob || "") : (input.auth_token ? seal(String(input.auth_token).slice(0, 8192)) : "");
		const enabled = input.enabled === undefined ? Boolean(existing?.enabled) : input.enabled === true;
		const createdAt = existing?.created_at || now();
		db.prepare(`INSERT INTO mcp_servers(id,name,kind,publisher,source,transport,command,args_json,url,auth_blob,enabled,scopes_json,tools_json,last_error,last_checked_at,created_at,updated_at)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,
			publisher=excluded.publisher,source=excluded.source,transport=excluded.transport,command=excluded.command,args_json=excluded.args_json,
			url=excluded.url,auth_blob=excluded.auth_blob,enabled=excluded.enabled,scopes_json=excluded.scopes_json,updated_at=excluded.updated_at`).run(
			id, name, kind, cleanText(input.publisher ?? existing?.publisher, 160), cleanText(input.source ?? existing?.source, 240), transport, command, JSON.stringify(args), url,
			authBlob, enabled ? 1 : 0, JSON.stringify(cleanStringArray(input.scopes ?? parseArray(existing?.scopes_json), 32, 80)), existing?.tools_json || "[]",
			existing?.last_error || "", existing?.last_checked_at || null, createdAt, now()
		);
		return get(id);
	}
	function remove(id) { return db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id).changes === 1; }
	function setEnabled(id, enabled) {
		if (!db.prepare("SELECT 1 FROM mcp_servers WHERE id = ?").get(id)) throw failure("mcp_server_not_found", "MCP server was not found.");
		db.prepare("UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, now(), id);
		return get(id);
	}
	function setChatScope(chatId, serverId, { enabled = false, tool_names = [], resource_uris = [] } = {}) {
		const server = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(serverId);
		if (!server) throw failure("mcp_server_not_found", "MCP server was not found.");
		const discovered = new Set(parseArray(server.tools_json).map((tool) => tool.name));
		const discoveredResources = new Set(parseArray(server.resources_json).map((resource) => resource.uri));
		const selected = cleanStringArray(tool_names, MAX_TOOLS, 120).filter((name) => discovered.has(name));
		const selectedResources = cleanStringArray(resource_uris, MAX_TOOLS, 2000).filter((uri) => discoveredResources.has(uri));
		db.prepare(`INSERT INTO mcp_chat_scopes(chat_id,server_id,enabled,tool_names_json,resource_uris_json,updated_at) VALUES(?,?,?,?,?,?)
			ON CONFLICT(chat_id,server_id) DO UPDATE SET enabled=excluded.enabled,tool_names_json=excluded.tool_names_json,resource_uris_json=excluded.resource_uris_json,updated_at=excluded.updated_at`).run(chatId, serverId, enabled ? 1 : 0, JSON.stringify(selected), JSON.stringify(selectedResources), now());
		return chatScope(chatId, serverId);
	}
	function chatScope(chatId, serverId) {
		const row = db.prepare("SELECT * FROM mcp_chat_scopes WHERE chat_id = ? AND server_id = ?").get(chatId, serverId);
		return row ? { chat_id: row.chat_id, server_id: row.server_id, enabled: Boolean(row.enabled), tool_names: parseArray(row.tool_names_json), resource_uris: parseArray(row.resource_uris_json), updated_at: row.updated_at } : { chat_id: chatId, server_id: serverId, enabled: false, tool_names: [], resource_uris: [], updated_at: null };
	}
	function listForChat(chatId) {
		return db.prepare(`SELECT s.*, c.enabled AS chat_enabled, c.tool_names_json, c.resource_uris_json FROM mcp_servers s
			LEFT JOIN mcp_chat_scopes c ON c.server_id=s.id AND c.chat_id=? ORDER BY s.name COLLATE NOCASE`).all(chatId).map((row) => ({
			...publicServer(row), chat_enabled: Boolean(row.chat_enabled), authorized_tools: parseArray(row.tool_names_json || "[]"), authorized_resources: parseArray(row.resource_uris_json || "[]")
		}));
	}
	async function discover(id, { signal } = {}) {
		const row = requiredEnabledOrDisabled(id);
		try {
			const result = await protocol(row, "tools/list", {}, signal);
			const tools = normalizeTools(result?.tools);
			let resources = [];
			try { resources = normalizeResources((await protocol(row, "resources/list", {}, signal))?.resources); }
			catch (error) { if (error?.code !== "mcp_remote_error") throw error; }
			db.prepare("UPDATE mcp_servers SET tools_json = ?, resources_json = ?, last_error = '', last_checked_at = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(tools), JSON.stringify(resources), now(), now(), id);
			return { server: get(id), tools, resources };
		} catch (error) {
			db.prepare("UPDATE mcp_servers SET last_error = ?, last_checked_at = ?, updated_at = ? WHERE id = ?").run(safeError(error), now(), now(), id);
			throw normalizeFailure(error, "mcp_discovery_failed");
		}
	}
	function available(chatId) {
		return listForChat(chatId).filter((server) => server.enabled && server.chat_enabled).map((server) => ({
			id: server.id, name: server.name, kind: server.kind, publisher: server.publisher, transport: server.transport,
			tools: server.tools.filter((tool) => server.authorized_tools.includes(tool.name)), resources: server.resources.filter((resource) => server.authorized_resources.includes(resource.uri))
		}));
	}
	async function call(chatId, input = {}, { signal } = {}) {
		const serverId = cleanId(input.server_id); const toolName = cleanToolName(input.tool_name);
		const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ? AND enabled = 1").get(serverId);
		const scope = chatScope(chatId, serverId);
		if (!row || !scope.enabled || !scope.tool_names.includes(toolName)) throw failure("mcp_tool_not_authorized", "This MCP tool is not enabled for the active chat.");
		const tool = normalizeTools(parseArray(row.tools_json)).find((entry) => entry.name === toolName);
		if (!tool) throw failure("mcp_tool_unavailable", "The MCP tool is no longer advertised. Refresh the server before retrying.");
		try {
			const result = await protocol(row, "tools/call", { name: toolName, arguments: plainObject(input.arguments) }, signal);
			if (Buffer.byteLength(JSON.stringify(result ?? null)) > MAX_RESULT_BYTES) throw failure("mcp_result_too_large", "The MCP result exceeded the 256 KiB limit.");
			return { server_id: serverId, tool_name: toolName, result };
		} catch (error) { throw normalizeFailure(error, "mcp_tool_failed"); }
	}
	async function readResource(chatId, input = {}, { signal } = {}) {
		const serverId = cleanId(input.server_id); const uri = cleanResourceUri(input.uri);
		const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ? AND enabled = 1").get(serverId);
		const scope = chatScope(chatId, serverId);
		if (!row || !scope.enabled || !scope.resource_uris.includes(uri)) throw failure("mcp_resource_not_authorized", "This MCP resource is not enabled for the active chat.");
		if (!normalizeResources(parseArray(row.resources_json)).some((entry) => entry.uri === uri)) throw failure("mcp_resource_unavailable", "The MCP resource is no longer advertised. Refresh the server before retrying.");
		const result = await protocol(row, "resources/read", { uri }, signal);
		if (Buffer.byteLength(JSON.stringify(result ?? null)) > MAX_RESULT_BYTES) throw failure("mcp_result_too_large", "The MCP resource exceeded the 256 KiB limit.");
		return { server_id: serverId, uri, result };
	}
	async function protocol(row, method, params, signal) {
		const token = row.auth_blob ? open(row.auth_blob) : "";
		const calls = [
			{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "kujo-ai-chat", version: "1.2.0" } } },
			{ jsonrpc: "2.0", method: "notifications/initialized", params: {} },
			{ jsonrpc: "2.0", id: 2, method, params }
		];
		const responses = transportFn ? await transportFn(privateServer(row), calls, { signal, token }) : await defaultTransport(privateServer(row), calls, { signal, token, fetchFn, spawnFn });
		const terminal = (Array.isArray(responses) ? responses : [responses]).find((entry) => entry?.id === 2);
		if (!terminal) throw failure("mcp_invalid_response", "The MCP server did not return the requested response.");
		if (terminal.error) throw failure("mcp_remote_error", cleanText(terminal.error.message, 500) || "The MCP server rejected the request.");
		return terminal.result;
	}
	function requiredEnabledOrDisabled(id) { const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id); if (!row) throw failure("mcp_server_not_found", "MCP server was not found."); return row; }
	function seal(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64"); }
	function open(value) { const data = Buffer.from(value, "base64"); const decipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12)); decipher.setAuthTag(data.subarray(-16)); return Buffer.concat([decipher.update(data.subarray(12, -16)), decipher.final()]).toString("utf8"); }
	return { list, get, save, remove, setEnabled, discover, setChatScope, listForChat, available, call, readResource };
}

async function defaultTransport(server, calls, { signal, token, fetchFn, spawnFn }) {
	return server.transport === "stdio" ? stdioTransport(server, calls, { signal, spawnFn }) : httpTransport(server, calls, { signal, token, fetchFn });
}
async function httpTransport(server, calls, { signal, token }) {
	const responses = [];
	let session = "";
	for (const call of calls) {
		const response = await pinnedJsonPost(server.url, call, { signal, token, session });
		session ||= response.session;
		if (!Object.hasOwn(call, "id")) continue;
		const parsed = parseMcpHttpBody(response.body, response.contentType);
		responses.push(...(Array.isArray(parsed) ? parsed : [parsed]));
	}
	return responses;
}

async function pinnedJsonPost(rawUrl, payload, { signal, token, session }) {
	const parsed = new URL(rawUrl);
	const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	const loopback = ["localhost", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1"].includes(host);
	let addresses;
	try { addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.promises.lookup(host, { all: true, verbatim: true }); }
	catch { throw failure("mcp_dns_failed", "The MCP server could not be resolved."); }
	if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address) && !(loopback && isLoopbackIp(entry.address)))) throw failure("mcp_url_blocked", "The MCP server destination is blocked by the network policy.");
	const selected = addresses[0]; const body = Buffer.from(JSON.stringify(payload)); const transport = parsed.protocol === "https:" ? https : http;
	return new Promise((resolve, reject) => {
		let settled = false; const finish = (error, value) => { if (settled) return; settled = true; signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(value); };
		const request = transport.request(parsed, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Content-Length": body.length, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(session ? { "Mcp-Session-Id": session } : {}) }, lookup(_hostname, options, callback) { if (options?.all) callback(null, [selected]); else callback(null, selected.address, selected.family); } }, (response) => {
			const chunks = []; let size = 0;
			response.on("data", (chunk) => { size += chunk.length; if (size > MAX_RESULT_BYTES) request.destroy(failure("mcp_result_too_large", "MCP response exceeded 256 KiB.")); else chunks.push(chunk); });
			response.on("aborted", () => finish(failure("mcp_http_error", "The MCP server closed the response early.")));
			response.on("error", (error) => finish(normalizeFailure(error, "mcp_http_error")));
			response.on("end", () => { if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) return finish(failure("mcp_http_error", `MCP server returned HTTP ${response.statusCode || 502}.`)); finish(null, { body: Buffer.concat(chunks).toString("utf8"), contentType: String(response.headers["content-type"] || ""), session: String(response.headers["mcp-session-id"] || "") }); });
		});
		const abort = () => request.destroy(failure("mcp_cancelled", "MCP request was cancelled."));
		request.setTimeout(15000, () => request.destroy(failure("mcp_timeout", "MCP server did not respond within 15 seconds.")));
		request.on("error", (error) => finish(normalizeFailure(error, "mcp_http_error")));
		if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
		request.end(body);
	});
}

function parseMcpHttpBody(body, contentType) {
	if (/text\/event-stream/i.test(contentType)) {
		const messages = String(body).split(/\r?\n\r?\n/).flatMap((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())).filter(Boolean).map((data) => JSON.parse(data));
		if (!messages.length) throw failure("mcp_invalid_response", "The MCP server returned an empty event stream.");
		return messages;
	}
	try { return JSON.parse(body); } catch { throw failure("mcp_invalid_response", "The MCP server returned malformed JSON."); }
}

function isLoopbackIp(address) { const value = String(address || "").toLowerCase(); return value === "127.0.0.1" || value.startsWith("127.") || value === "::1" || value === "0:0:0:0:0:0:0:1"; }
function stdioTransport(server, calls, { signal, spawnFn }) {
	return new Promise((resolve, reject) => {
		const child = spawnFn(server.command, server.args, { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "", LANG: "C.UTF-8" }, windowsHide: true });
		const pending = new Map(); const responses = []; let stderr = ""; let settled = false;
		const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); child.kill("SIGTERM"); error ? reject(error) : resolve(responses); };
		const abort = () => finish(signal.reason || failure("mcp_cancelled", "MCP request was cancelled."));
		const timer = setTimeout(() => finish(failure("mcp_timeout", "MCP server did not respond within 15 seconds.")), 15000);
		signal?.addEventListener("abort", abort, { once: true });
		child.on("error", (error) => finish(failure("mcp_spawn_failed", safeError(error))));
		child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
		const lines = readline.createInterface({ input: child.stdout });
		lines.on("line", (line) => {
			try { const message = JSON.parse(line); if (message.id && pending.has(message.id)) { responses.push(message); pending.delete(message.id); sendNext(); } }
			catch { finish(failure("mcp_invalid_response", "MCP stdio returned malformed JSON.")); }
		});
		let index = 0;
		function sendNext() {
			if (index >= calls.length) return finish();
			const call = calls[index++]; if (call.id) pending.set(call.id, true);
			child.stdin.write(`${JSON.stringify(call)}\n`);
			if (!call.id) sendNext();
		}
		child.on("exit", (code) => { if (!settled) finish(failure("mcp_server_exited", cleanText(stderr, 500) || `MCP server exited with code ${code}.`)); });
		sendNext();
	});
}

function publicServer(row) {
	const tools = normalizeTools(parseArray(row.tools_json));
	const resources = normalizeResources(parseArray(row.resources_json));
	return { id: row.id, name: row.name, kind: row.kind, publisher: row.publisher, source: row.source, transport: row.transport,
		endpoint_label: row.transport === "stdio" ? path.basename(row.command) : safeUrlLabel(row.url), enabled: Boolean(row.enabled), scopes: parseArray(row.scopes_json),
		tools, tool_count: tools.length, resources, resource_count: resources.length, credential_configured: Boolean(row.auth_blob), last_error: row.last_error, last_checked_at: row.last_checked_at, created_at: row.created_at, updated_at: row.updated_at };
}
function privateServer(row) { return { ...publicServer(row), command: row.command, args: parseArray(row.args_json), url: row.url }; }
function normalizeTools(value) { return (Array.isArray(value) ? value : []).slice(0, MAX_TOOLS).map((tool) => ({ name: cleanToolName(tool?.name), description: cleanText(tool?.description, 1000), input_schema: validSchema(tool?.inputSchema || tool?.input_schema) })).filter((tool) => tool.name); }
function normalizeResources(value) { return (Array.isArray(value) ? value : []).slice(0, MAX_TOOLS).map((resource) => ({ uri: cleanResourceUri(resource?.uri), name: cleanText(resource?.name, 240), description: cleanText(resource?.description, 1000), mime_type: cleanText(resource?.mimeType || resource?.mime_type, 160) })).filter((resource) => resource.uri); }
function validSchema(value) { return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : { type: "object", properties: {} }; }
function validateCommand(value) { const command = path.resolve(String(value || "")); if (!path.isAbsolute(String(value || "")) || !fs.existsSync(command) || !fs.statSync(command).isFile()) throw failure("mcp_command_invalid", "Stdio commands must be existing absolute executable files."); try { fs.accessSync(command, fs.constants.X_OK); } catch { throw failure("mcp_command_invalid", "Stdio commands must be executable by this server."); } return command; }
function validateArgs(value) { return cleanStringArray(value, 32, 1000).map((arg) => { if (arg.includes("\0")) throw failure("mcp_args_invalid", "Stdio arguments cannot contain NUL bytes."); return arg; }); }
function validateUrl(value) { const url = new URL(String(value || "")); const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname); if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw failure("mcp_url_invalid", "HTTP MCP endpoints must use HTTPS or loopback HTTP."); url.username = ""; url.password = ""; return url.toString(); }
function safeUrlLabel(value) { try { const url = new URL(value); return `${url.protocol}//${url.host}`; } catch { return "HTTP endpoint"; } }
function cleanId(value) { return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 180); }
function cleanToolName(value) { return String(value || "").trim().replace(/[^A-Za-z0-9_.:/-]/g, "_").slice(0, 120); }
function cleanResourceUri(value) { const uri = String(value || "").trim().slice(0, 2000); if (!uri || /[\u0000-\u001f]/.test(uri)) throw failure("mcp_resource_uri_invalid", "MCP resource URI is invalid."); return uri; }
function cleanText(value, max) { return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }
function cleanStringArray(value, count, max) { return [...new Set((Array.isArray(value) ? value : []).map((item) => cleanText(item, max)).filter(Boolean))].slice(0, count); }
function parseArray(value) { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeError(error) { return cleanText(error?.message || error, 500) || "MCP operation failed."; }
function normalizeFailure(error, fallback) { if (error?.code) return error; return failure(fallback, safeError(error)); }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
function ensureColumn(db, table, column, definition) { if (!db.prepare(`PRAGMA table_info(${table})`).all().some((entry) => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }

module.exports = { createMcpManager };
