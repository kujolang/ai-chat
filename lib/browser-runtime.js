const crypto = require("crypto");
const dns = require("dns");
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");

const blockedActionPattern = /\b(?:buy|purchase|checkout|pay|delete|remove|submit|send|sign[ -]?in|log[ -]?in|register|subscribe|confirm|approve|transfer|upload|download|grant|allow)\b/i;
const sensitiveFieldPattern = /(?:pass(?:word)?|secret|token|api.?key|credit|card|cvv|ssn|social.?security|otp|one.?time|auth|email|phone|address)/i;

function createBrowserRuntime(options = {}) {
	const enabled = parseBoolean(options.enabled, false);
	const headless = parseBoolean(options.headless, true);
	const actionPolicy = normalizeActionPolicy(options.actionPolicy);
	const sessionTtlMs = clampInteger(options.sessionTtlMs, 1000, 24 * 60 * 60 * 1000, 15 * 60 * 1000);
	const maxSessions = clampInteger(options.maxSessions, 1, 32, 4);
	const maxSessionsPerScope = clampInteger(options.maxSessionsPerScope, 1, 8, 2);
	const maxActionsPerSession = clampInteger(options.maxActionsPerSession, 1, 200, 30);
	const maxActionsPerRequest = clampInteger(options.maxActionsPerRequest, 1, 64, 12);
	const navigationTimeoutMs = clampInteger(options.navigationTimeoutMs, 1000, 120000, 15000);
	const maxTextChars = clampInteger(options.maxTextChars, 1000, 200000, 30000);
	const maxResultBytes = clampInteger(options.maxResultBytes, 4096, 1024 * 1024, 128 * 1024);
	const maxResourceBytes = clampInteger(options.maxResourceBytes, 64 * 1024, 20 * 1024 * 1024, 5 * 1024 * 1024);
	const maxScreenshotBytes = clampInteger(options.maxScreenshotBytes, 64 * 1024, 10 * 1024 * 1024, 2 * 1024 * 1024);
	const artifactDir = path.resolve(String(options.artifactDir || path.join(process.cwd(), "data", "tool-artifacts", "browser")));
	const resolveHost = typeof options.resolveHost === "function" ? options.resolveHost : defaultResolveHost;
	const allowPrivateHosts = new Set((options.allowPrivateHosts || []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
	const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
	const playwrightModule = options.playwrightModule === undefined ? loadPlaywright() : options.playwrightModule;
	const executablePath = playwrightModule && playwrightModule.chromium && typeof playwrightModule.chromium.executablePath === "function"
		? playwrightModule.chromium.executablePath()
		: "";
	const chromiumAvailable = Boolean(enabled && executablePath && isExecutableFile(executablePath));
	const unavailableReason = !enabled
		? "disabled"
		: (!playwrightModule ? "playwright_unavailable" : (!chromiumAvailable ? "chromium_unavailable" : ""));
	const sessions = new Map();
	const closedSessions = new Map();
	let browserPromise = null;
	let shuttingDown = false;

	if (enabled) fs.mkdirSync(artifactDir, { recursive: true, mode: 0o700 });

	const cleanupTimer = setInterval(() => {
		void cleanupExpired();
	}, Math.min(sessionTtlMs, 30000));
	if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

	function status() {
		return {
			enabled,
			available: chromiumAvailable && !shuttingDown,
			backend: chromiumAvailable ? "playwright-chromium" : null,
			headless,
			action_policy: actionPolicy,
			unavailable_reason: unavailableReason || null
		};
	}

	async function execute(name, rawArguments, context = {}) {
		ensureAvailable();
		const args = normalizeObjectArguments(rawArguments);
		const scopeId = normalizeScopeId(context.scopeId);
		const requestState = context.requestState && typeof context.requestState === "object" ? context.requestState : {};
		if (name === "browser_open") return open(args, scopeId, requestState);
		if (name === "browser_snapshot") return snapshot(args, scopeId, requestState);
		if (name === "browser_act") return act(args, scopeId, requestState);
		if (name === "browser_close") return closeTool(args, scopeId);
		if (name === "browser_use") return browserUse(args, scopeId, requestState);
		throw toolError("tool_execution_unavailable", "No browser executor is connected for the requested tool.");
	}

	async function open(args, scopeId, requestState) {
		consumeRequestAction(requestState);
		await cleanupExpired();
		const existingId = String(args.session_id || "").trim();
		if (existingId) {
			const session = requireSession(existingId, scopeId);
			consumeSessionAction(session);
			await navigate(session, args.url);
			return boundedResult(await snapshotSession(session, false));
		}
		if (sessions.size >= maxSessions) throw toolError("browser_session_limit", "The browser session limit has been reached.");
		const ownedCount = [...sessions.values()].filter((entry) => entry.scopeId === scopeId).length;
		if (ownedCount >= maxSessionsPerScope) throw toolError("browser_session_limit", "This browser scope has reached its session limit.");

		const browser = await getBrowser();
		const context = await browser.newContext({
			acceptDownloads: false,
			ignoreHTTPSErrors: false,
			javaScriptEnabled: true,
			serviceWorkers: "block",
			viewport: { width: 1280, height: 720 }
		});
		const page = await context.newPage();
		page.setDefaultNavigationTimeout(navigationTimeoutMs);
		page.setDefaultTimeout(Math.min(navigationTimeoutMs, 10000));
		const session = {
			id: randomId("brs"),
			scopeId,
			context,
			page,
			createdAt: nowMs(),
			lastUsedAt: nowMs(),
			actionCount: 1,
			snapshotVersion: 0,
			targets: new Map(),
			networkError: null,
			closed: false
		};
		sessions.set(session.id, session);
		context.on("page", (candidate) => {
			if (candidate !== page) void candidate.close().catch(() => {});
		});
		await context.route("**/*", async (route) => handleRoute(route, session));
		page.on("download", (download) => void download.cancel());
		try {
			await navigate(session, args.url);
			return boundedResult(await snapshotSession(session, false));
		} catch (error) {
			await closeSession(session);
			throw sanitizeBrowserError(error);
		}
	}

	async function snapshot(args, scopeId, requestState) {
		consumeRequestAction(requestState);
		const session = requireSession(args.session_id, scopeId);
		consumeSessionAction(session);
		return boundedResult(await snapshotSession(session, true));
	}

	async function act(args, scopeId, requestState) {
		consumeRequestAction(requestState);
		const session = requireSession(args.session_id, scopeId);
		consumeSessionAction(session);
		const action = args.action && typeof args.action === "object" && !Array.isArray(args.action) ? args.action : {};
		const type = String(action.type || action.action || "").trim().toLowerCase();
		if (!type) throw toolError("invalid_tool_arguments", "browser_act.action.type is required.");

		if (type === "snapshot" || type === "extract") return boundedResult(await snapshotSession(session, true));
		if (type === "scroll") {
			const direction = String(action.direction || "down").toLowerCase();
			const amount = clampInteger(action.amount, 100, 2000, 600) * (direction === "up" ? -1 : 1);
			await session.page.mouse.wheel(0, amount);
			return boundedResult({ ok: true, session_id: session.id, action: "scroll", direction, amount: Math.abs(amount), url: safePageUrl(session.page.url()) });
		}
		if (type === "back") {
			session.networkError = null;
			await session.page.goBack({ waitUntil: "domcontentloaded", timeout: navigationTimeoutMs }).catch((error) => {
				throw session.networkError || error;
			});
			return boundedResult(await snapshotSession(session, false));
		}
		if (type === "screenshot") return boundedResult(await takeScreenshot(session));
		if (type === "close") return closeTool({ session_id: session.id }, scopeId);
		if (type === "click") return boundedResult(await clickTarget(session, action));
		if (type === "type") return boundedResult(await typeTarget(session, action));
		if (type === "navigate" || type === "open") {
			await navigate(session, action.url);
			return boundedResult(await snapshotSession(session, false));
		}
		throw toolError("invalid_tool_arguments", "Unsupported browser action.");
	}

	async function browserUse(args, scopeId, requestState) {
		const action = String(args.action || "").trim().toLowerCase();
		if (action === "navigate" || action === "open") {
			return open({ url: args.url, session_id: args.session_id }, scopeId, requestState);
		}
		if ((action === "extract" || action === "snapshot" || action === "screenshot") && !args.session_id && args.url) {
			const opened = await open({ url: args.url }, scopeId, requestState);
			if (action === "screenshot") {
				return act({ session_id: opened.session_id, action: { type: "screenshot" } }, scopeId, requestState);
			}
			return snapshot({ session_id: opened.session_id }, scopeId, requestState);
		}
		if (action === "extract" || action === "snapshot") return snapshot({ session_id: args.session_id }, scopeId, requestState);
		if (action === "close") return closeTool({ session_id: args.session_id }, scopeId);
		const target = args.target || args.ref || (/^e\d+$/.test(String(args.selector || "")) ? args.selector : "");
		return act({
			session_id: args.session_id,
			action: {
				type: action,
				url: args.url,
				target,
				text: args.text,
				direction: args.direction,
				amount: args.amount
			}
		}, scopeId, requestState);
	}

	async function navigate(session, rawUrl) {
		const target = await validateUrl(rawUrl);
		session.networkError = null;
		try {
			await session.page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
			if (session.networkError) throw session.networkError;
			session.lastUsedAt = nowMs();
		} catch (error) {
			await new Promise((resolve) => setTimeout(resolve, 10));
			throw sanitizeBrowserError(session.networkError || error);
		}
	}

	async function snapshotSession(session, includeText) {
		session.lastUsedAt = nowMs();
		session.snapshotVersion += 1;
		const page = session.page;
		const visibleText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
		const rawElements = await page.locator("a, button, input, textarea, select, [role='button'], [role='link']").evaluateAll((elements) => elements.slice(0, 100).map((element, index) => {
			const rect = element.getBoundingClientRect();
			const style = window.getComputedStyle(element);
			const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
			const tag = element.tagName.toLowerCase();
			const type = String(element.getAttribute("type") || "").toLowerCase();
			const role = String(element.getAttribute("role") || (tag === "a" ? "link" : (tag === "button" ? "button" : (tag === "input" || tag === "textarea" || tag === "select" ? "input" : "interactive"))));
			const name = String(element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText || element.getAttribute("placeholder") || element.getAttribute("name") || "").trim();
			return { index, visible, tag, type, role, name, href: tag === "a" ? String(element.href || "") : "", disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true") };
		}));
		session.targets.clear();
		const elements = [];
		for (const item of rawElements.filter((entry) => entry.visible).slice(0, 50)) {
			const ref = `e${elements.length + 1}`;
			const record = { ...item, ref, snapshotVersion: session.snapshotVersion };
			session.targets.set(ref, record);
			elements.push({ ref, role: item.role, name: item.name.slice(0, 300), type: item.type || undefined, href: item.href ? safePageUrl(item.href) : undefined, disabled: item.disabled });
		}
		const links = elements.filter((entry) => entry.role === "link").slice(0, 30);
		return {
			ok: true,
			session_id: session.id,
			url: safePageUrl(page.url()),
			title: String(await page.title().catch(() => "")).slice(0, 500),
			snapshot_version: session.snapshotVersion,
			...(includeText ? { text: String(visibleText || "").slice(0, maxTextChars) } : {}),
			links,
			elements
		};
	}

	async function clickTarget(session, action) {
		const target = requireTarget(session, action.target || action.ref);
		if (target.disabled) throw toolError("browser_action_rejected", "The requested element is disabled.");
		if (target.role !== "link" || blockedActionPattern.test(`${target.name} ${target.href}`)) {
			if (actionPolicy !== "development") throw approvalRequired("This click may cause an external side effect.");
			if (blockedActionPattern.test(`${target.name} ${target.href}`)) throw approvalRequired("This consequential click requires explicit approval.");
		}
		if (target.href) await validateUrl(target.href);
		session.networkError = null;
		await session.page.locator("a, button, input, textarea, select, [role='button'], [role='link']").nth(target.index).click({ timeout: 5000 });
		await session.page.waitForLoadState("domcontentloaded", { timeout: navigationTimeoutMs }).catch(() => {});
		if (session.networkError) throw session.networkError;
		return snapshotSession(session, false);
	}

	async function typeTarget(session, action) {
		const target = requireTarget(session, action.target || action.ref);
		if (actionPolicy !== "development") throw approvalRequired("Typing is disabled by the read-only browser action policy.");
		if (target.type === "password" || sensitiveFieldPattern.test(`${target.name} ${target.type}`)) {
			throw approvalRequired("Typing sensitive information requires explicit approval.");
		}
		const text = String(action.text || "");
		if (!text || text.length > 2000) throw toolError("invalid_tool_arguments", "browser_act type text must contain between 1 and 2000 characters.");
		await session.page.locator("a, button, input, textarea, select, [role='button'], [role='link']").nth(target.index).fill(text);
		return { ok: true, session_id: session.id, action: "type", target: target.ref, characters_typed: text.length };
	}

	async function takeScreenshot(session) {
		const artifactId = randomId("browser-shot");
		const filename = `${artifactId}.png`;
		const outputPath = path.join(artifactDir, filename);
		await session.page.screenshot({ path: outputPath, type: "png", fullPage: false, animations: "disabled" });
		const stat = fs.statSync(outputPath);
		if (stat.size > maxScreenshotBytes) {
			fs.unlinkSync(outputPath);
			throw toolError("browser_output_limit", "The screenshot exceeded the configured artifact size limit.");
		}
		return { ok: true, session_id: session.id, action: "screenshot", artifact_id: artifactId, media_type: "image/png", bytes: stat.size };
	}

	async function closeTool(args, scopeId) {
		const id = String(args.session_id || "").trim();
		if (!id) throw toolError("invalid_tool_arguments", "browser_close.session_id is required.");
		const session = sessions.get(id);
		if (!session) {
			const tombstone = closedSessions.get(id);
			if (tombstone && tombstone.scopeId === scopeId) return { ok: true, session_id: id, closed: true, already_closed: true };
			throw toolError("browser_session_not_found", "The browser session was not found.");
		}
		if (session.scopeId !== scopeId) throw toolError("browser_session_not_found", "The browser session was not found.");
		await closeSession(session);
		return { ok: true, session_id: id, closed: true, already_closed: false };
	}

	async function handleRoute(route, session) {
		try {
			const request = route.request();
			const method = String(request.method() || "GET").toUpperCase();
			if (!(method === "GET" || method === "HEAD")) throw approvalRequired("Browser network writes are disabled.");
			const response = await safeRequest(request.url(), { method, headers: request.headers() }, 0);
			await route.fulfill(response);
		} catch (error) {
			if (!session.networkError || session.networkError.code === "browser_execution_failed") {
				session.networkError = sanitizeBrowserError(error);
			}
			await route.abort("blockedbyclient").catch(() => {});
		}
	}

	async function safeRequest(rawUrl, requestOptions, redirectCount) {
		if (redirectCount > 5) throw toolError("browser_navigation_blocked", "Too many redirects.");
		const parsed = await validateUrl(rawUrl);
		const addresses = await resolveAndValidate(parsed.hostname);
		const selected = addresses[0];
		const transport = parsed.protocol === "https:" ? https : http;
		const headers = safeRequestHeaders(requestOptions.headers);
		const result = await new Promise((resolve, reject) => {
			const request = transport.request(parsed, {
				method: requestOptions.method,
				headers,
				lookup(hostname, lookupOptions, callback) {
					if (lookupOptions && lookupOptions.all) callback(null, [selected]);
					else callback(null, selected.address, selected.family);
				}
			}, (response) => {
				const chunks = [];
				let size = 0;
				response.on("data", (chunk) => {
					size += chunk.length;
					if (size > maxResourceBytes) {
						request.destroy(toolError("browser_output_limit", "A browser resource exceeded the configured size limit."));
						return;
					}
					chunks.push(chunk);
				});
				response.on("end", () => resolve({ status: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) }));
			});
			request.setTimeout(navigationTimeoutMs, () => request.destroy(toolError("browser_navigation_timeout", "Browser navigation timed out.")));
			request.on("error", reject);
			request.end();
		});
		if ([301, 302, 303, 307, 308].includes(result.status) && result.headers.location) {
			const redirectUrl = new URL(String(result.headers.location), parsed).toString();
			return safeRequest(redirectUrl, { method: "GET", headers: requestOptions.headers }, redirectCount + 1);
		}
		return {
			status: result.status,
			headers: safeResponseHeaders(result.headers),
			body: result.body
		};
	}

	async function validateUrl(rawUrl) {
		let parsed;
		try {
			parsed = new URL(String(rawUrl || ""));
		} catch (error) {
			throw toolError("browser_url_blocked", "The browser URL is invalid.");
		}
		if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) throw toolError("browser_url_blocked", "Only HTTP and HTTPS browser URLs are allowed.");
		if (parsed.username || parsed.password) throw toolError("browser_url_blocked", "Browser URLs cannot contain credentials.");
		await resolveAndValidate(parsed.hostname);
		return parsed;
	}

	async function resolveAndValidate(hostname) {
		const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
		if (!host) throw toolError("browser_url_blocked", "The browser URL has no host.");
		let addresses;
		if (net.isIP(host)) {
			addresses = [{ address: host, family: net.isIP(host) }];
		} else {
			try {
				addresses = await resolveHost(host);
			} catch (error) {
				throw toolError("browser_dns_failed", "The browser destination could not be resolved.");
			}
		}
		const normalized = (Array.isArray(addresses) ? addresses : [addresses]).map((entry) => typeof entry === "string" ? { address: entry, family: net.isIP(entry) } : entry).filter((entry) => entry && net.isIP(entry.address));
		if (normalized.length === 0) throw toolError("browser_dns_failed", "The browser destination could not be resolved.");
		if (!allowPrivateHosts.has(host) && normalized.some((entry) => isBlockedIp(entry.address))) {
			throw toolError("browser_url_blocked", "The browser destination is not allowed by the network policy.");
		}
		return normalized;
	}

	function requireSession(rawId, scopeId) {
		const id = String(rawId || "").trim();
		if (!id) throw toolError("invalid_tool_arguments", "A browser session_id is required.");
		const session = sessions.get(id);
		if (!session || session.scopeId !== scopeId) throw toolError("browser_session_not_found", "The browser session was not found.");
		if (nowMs() - session.lastUsedAt > sessionTtlMs) {
			void closeSession(session);
			throw toolError("browser_session_expired", "The browser session has expired.");
		}
		return session;
	}

	function requireTarget(session, rawRef) {
		const ref = String(rawRef || "").trim();
		const target = session.targets.get(ref);
		if (!target) throw toolError("browser_target_stale", "Use an element ref from the latest browser snapshot.");
		return target;
	}

	function consumeRequestAction(state) {
		state.browserActions = Number(state.browserActions || 0) + 1;
		if (state.browserActions > maxActionsPerRequest) throw toolError("browser_action_limit", "The browser action limit for this request was reached.");
	}

	function consumeSessionAction(session) {
		session.actionCount += 1;
		session.lastUsedAt = nowMs();
		if (session.actionCount > maxActionsPerSession) throw toolError("browser_action_limit", "The browser action limit for this session was reached.");
	}

	async function getBrowser() {
		ensureAvailable();
		if (!browserPromise) {
			browserPromise = playwrightModule.chromium.launch({
				headless,
				downloadsPath: artifactDir
			}).catch((error) => {
				browserPromise = null;
				throw toolError("browser_not_configured", "Chromium could not be started. Run npx playwright install chromium.");
			});
		}
		return browserPromise;
	}

	function ensureAvailable() {
		if (!enabled) throw toolError("browser_not_configured", "Browser execution is disabled.");
		if (!chromiumAvailable) throw toolError("browser_not_configured", "Chromium is unavailable. Run npx playwright install chromium.");
		if (shuttingDown) throw toolError("browser_unavailable", "The browser runtime is shutting down.");
	}

	async function cleanupExpired() {
		const cutoff = nowMs() - sessionTtlMs;
		for (const session of [...sessions.values()]) {
			if (session.lastUsedAt < cutoff) await closeSession(session);
		}
		for (const [id, entry] of closedSessions) {
			if (entry.closedAt < nowMs() - sessionTtlMs) closedSessions.delete(id);
		}
	}

	async function closeSession(session) {
		if (!session || session.closed) return;
		session.closed = true;
		sessions.delete(session.id);
		closedSessions.set(session.id, { scopeId: session.scopeId, closedAt: nowMs() });
		await session.context.close().catch(() => {});
	}

	async function close() {
		if (shuttingDown) return;
		shuttingDown = true;
		clearInterval(cleanupTimer);
		for (const session of [...sessions.values()]) await closeSession(session);
		if (browserPromise) {
			const browser = await browserPromise.catch(() => null);
			if (browser) await browser.close().catch(() => {});
		}
		browserPromise = null;
	}

	function boundedResult(result) {
		const encoded = JSON.stringify(result);
		if (Buffer.byteLength(encoded) <= maxResultBytes) return result;
		if (typeof result.text === "string") {
			const overhead = Buffer.byteLength(JSON.stringify({ ...result, text: "" }));
			return { ...result, text: result.text.slice(0, Math.max(0, maxResultBytes - overhead - 100)), truncated: true };
		}
		throw toolError("browser_output_limit", "The browser result exceeded the configured size limit.");
	}

	return {
		execute,
		status,
		close,
		cleanupExpired,
		canExecute: () => status().available,
		listSessions: () => [...sessions.values()].map((session) => ({ id: session.id, scopeId: session.scopeId, actionCount: session.actionCount, lastUsedAt: session.lastUsedAt }))
	};
}

function defaultResolveHost(hostname) {
	return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

function safeRequestHeaders(headers = {}) {
	const result = {};
	for (const name of ["accept", "accept-language", "user-agent"]) {
		if (headers[name]) result[name] = String(headers[name]).slice(0, 1000);
	}
	result["accept-encoding"] = "identity";
	return result;
}

function safeResponseHeaders(headers = {}) {
	const blocked = new Set(["set-cookie", "set-cookie2", "authorization", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
	const result = {};
	for (const [name, value] of Object.entries(headers)) {
		if (!blocked.has(name.toLowerCase()) && value !== undefined) result[name] = Array.isArray(value) ? value.join(", ") : String(value);
	}
	return result;
}

function isBlockedIp(address) {
	const value = String(address || "").toLowerCase();
	if (net.isIP(value) === 4) {
		const parts = value.split(".").map(Number);
		const [a, b, c] = parts;
		return a === 0 || a === 10 || a === 127 || a >= 224
			|| (a === 100 && b >= 64 && b <= 127)
			|| (a === 169 && b === 254)
			|| (a === 172 && b >= 16 && b <= 31)
			|| (a === 192 && b === 0 && c === 0)
			|| (a === 192 && b === 168)
			|| (a === 198 && (b === 18 || b === 19));
	}
	if (net.isIP(value) === 6) {
		if (value === "::" || value === "::1") return true;
		if (value.startsWith("::ffff:")) return isBlockedIp(value.slice(7));
		const first = Number.parseInt(value.split(":")[0] || "0", 16);
		return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
	}
	return true;
}

function normalizeObjectArguments(value) {
	if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
	try {
		const parsed = JSON.parse(String(value || "{}"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
	} catch (error) {
		// Return the stable error below.
	}
	throw toolError("invalid_tool_arguments", "The provider returned invalid JSON tool arguments.");
}

function normalizeScopeId(value) {
	const scope = String(value || "").trim();
	if (!scope || scope.length > 300) throw toolError("browser_scope_required", "Browser tools require a chat or request scope.");
	return scope;
}

function normalizeActionPolicy(value) {
	const policy = String(value || "read-only").trim().toLowerCase();
	if (!["read-only", "development"].includes(policy)) throw new Error("BROWSER_ACTION_POLICY must be read-only or development.");
	return policy;
}

function sanitizeBrowserError(error) {
	if (error && error.code && String(error.code).startsWith("browser_") || error && error.code === "tool_approval_required") return error;
	return toolError("browser_execution_failed", "The browser action failed.");
}

function approvalRequired(message) {
	return toolError("tool_approval_required", message);
}

function safePageUrl(value) {
	try {
		const parsed = new URL(String(value || ""));
		parsed.username = "";
		parsed.password = "";
		parsed.hash = "";
		return parsed.toString().slice(0, 2000);
	} catch (error) {
		return "";
	}
}

function loadPlaywright() {
	try {
		return require("playwright");
	} catch (error) {
		return null;
	}
}

function isExecutableFile(filename) {
	try {
		fs.accessSync(filename, fs.constants.X_OK);
		return fs.statSync(filename).isFile();
	} catch (error) {
		return false;
	}
}

function randomId(prefix) {
	return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

function parseBoolean(value, fallback) {
	if (value === undefined || value === null || value === "") return fallback;
	return value === true || value === 1 || String(value).trim() === "1" || String(value).trim().toLowerCase() === "true";
}

function clampInteger(value, min, max, fallback) {
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function toolError(code, message) {
	const error = new Error(message);
	error.code = code;
	return error;
}

module.exports = {
	createBrowserRuntime,
	isBlockedIp,
	normalizeActionPolicy
};
