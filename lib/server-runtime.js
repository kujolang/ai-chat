const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");

const providerCatalog = [
	{
		id: "openai",
		label: "OpenAI",
		models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini", "gpt-4o-mini-transcribe", "whisper-1"]
	},
	{
		id: "deepseek",
		label: "DeepSeek",
		models: ["deepseek-v3.1-pro", "deepseek-v3.1-flash", "deepseek-chat"]
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		models: ["openai/gpt-4.1-mini", "anthropic/claude-3.7-sonnet", "deepseek/deepseek-chat-v3-0324"]
	},
	{
		id: "custom",
		label: "Custom OpenAI-Compatible",
		models: ["gpt-4.1-mini", "deepseek-chat", "custom-model", "whisper-1"]
	}
];

function createServerRuntime(options = {}) {
	const env = options.env || process.env;
	const projectRoot = options.projectRoot || path.resolve(__dirname, "..");
	const publicDir = path.join(projectRoot, "public");
	const bridgeScript = path.join(projectRoot, "bridge_chat.kujo");
	const host = String(env.AI_CHAT_HOST || "127.0.0.1").trim() || "127.0.0.1";
	const port = Number(env.PORT || 4173);

	const defaultKujoPath = "kujo";
	const kujoBin = env.KUJO_BIN || defaultKujoPath;
	const aiSdkPath = env.AI_SDK_PATH || "";
	const aiSdkCoreFile = aiSdkPath ? path.join(aiSdkPath, "ai_sdk.kujo") : "";
	const aiSdkProvidersFile = aiSdkPath ? path.join(aiSdkPath, "providers.kujo") : "";
	const aiSdkAvailable = Boolean(
		aiSdkPath
		&& fs.existsSync(aiSdkPath)
		&& fs.existsSync(aiSdkCoreFile)
		&& fs.existsSync(aiSdkProvidersFile)
	);

	const dbPath = env.DB_PATH || path.join(projectRoot, "data", "ai_chat.db");
	const backupDir = env.DB_BACKUP_DIR || path.join(projectRoot, "data", "backups");
	const auditLogPath = env.AUDIT_LOG_PATH || path.join(projectRoot, "data", "audit.log");
	const encryptionSecret = env.ENCRYPTION_SECRET || "DEVELOPMENT_ONLY_CHANGE_ME";
	let apiAuthToken = String(env.API_AUTH_TOKEN || "").trim();
	const debugErrors = env.DEBUG_API_ERRORS === "1";
	const allowedOrigin = String(env.ALLOWED_ORIGIN || "").trim();
	const allowedHosts = parseCsv(String(env.ALLOWED_HOSTS || ""));
	const allowedCustomProviderHosts = parseCsv(String(env.ALLOWED_CUSTOM_PROVIDER_HOSTS || ""));
	const trustProxy = parseBoolean(env.TRUST_PROXY, false);
	const defaultMaxTokens = parseInteger(env.DEFAULT_MAX_TOKENS, 12000);
	const requestTimeoutMs = parseInteger(env.REQUEST_TIMEOUT_MS, 45000);
	const streamRequestTimeoutMs = parseTimeoutMs(env.STREAM_REQUEST_TIMEOUT_MS, 900000);
	const dataRetentionDays = parseInteger(env.DATA_RETENTION_DAYS, 90);
	const rateLimitWindowMs = parseInteger(env.RATE_LIMIT_WINDOW_MS, 60000);
	const rateLimitApiMax = parseInteger(env.RATE_LIMIT_API_MAX, 240);
	const rateLimitChatMax = parseInteger(env.RATE_LIMIT_CHAT_MAX, 60);
	const rateLimitStreamMax = parseInteger(env.RATE_LIMIT_STREAM_MAX, 60);
	const rateLimitTranscribeMax = parseInteger(env.RATE_LIMIT_TRANSCRIBE_MAX, 20);
	const rateLimitMaxBuckets = parseInteger(env.RATE_LIMIT_MAX_BUCKETS, 10000);
	const maxJsonBodyBytes = parseInteger(env.MAX_JSON_BODY_BYTES, 2 * 1024 * 1024);
	const maxAudioUploadBytes = parseInteger(env.MAX_AUDIO_UPLOAD_BYTES, 10 * 1024 * 1024);
	const maxMessagesPerRequest = parseInteger(env.MAX_MESSAGES_PER_REQUEST, 200);
	const maxMessageChars = parseInteger(env.MAX_MESSAGE_CHARS, 12000);
	const maxTotalMessageChars = parseInteger(env.MAX_TOTAL_MESSAGE_CHARS, 200000);
	const fetchFn = options.fetchFn || fetch;
	const spawnFn = options.spawnFn || spawn;
	const spawnSyncFn = options.spawnSyncFn;
	const databaseFactory = options.databaseFactory || ((nextDbPath) => new Database(nextDbPath));
	const nowFn = options.nowFn || (() => Date.now());
	const uidSeedFn = options.uidSeedFn || (() => Math.random().toString(36).slice(2, 10));

	if (encryptionSecret === "DEVELOPMENT_ONLY_CHANGE_ME") {
		console.warn("[security] ENCRYPTION_SECRET is using the development fallback. Set a strong secret for production use.");
	}

	if (apiAuthToken === "CHANGE_ME_TO_A_LONG_RANDOM_TOKEN") {
		console.warn("[security] API_AUTH_TOKEN is still set to the template placeholder. Set a real token in .env or your shell environment.");
		apiAuthToken = "";
	}

	if (!apiAuthToken) {
		console.warn("[security] API_AUTH_TOKEN is not configured. API routes will reject requests until it is set.");
	}

	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	fs.mkdirSync(backupDir, { recursive: true });
	fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });

	const db = databaseFactory(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	const encryptionKey = crypto.scryptSync(encryptionSecret, "kujo-ai-chat-salt-v1", 32);

	const audioMimeTypes = new Set([
		"audio/webm",
		"audio/wav",
		"audio/x-wav",
		"audio/wave",
		"audio/mpeg",
		"audio/mp3",
		"audio/mp4",
		"audio/x-m4a",
		"audio/ogg",
		"audio/flac",
		"audio/x-flac",
		"audio/aac"
	]);

	const app = express();
	app.disable("x-powered-by");
	app.set("trust proxy", trustProxy);

	const upload = multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: maxAudioUploadBytes, files: 1 },
		fileFilter: (req, file, callback) => {
			if (!audioMimeTypes.has(String(file.mimetype || "").toLowerCase())) {
				callback(new Error("Unsupported audio MIME type."));
				return;
			}
			callback(null, true);
		}
	});

	const rateBuckets = new Map();

	app.use((req, res, next) => {
		const requestId = uid();
		req.request_id = requestId;
		res.setHeader("X-Request-Id", requestId);
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("X-Frame-Options", "DENY");
		res.setHeader("Referrer-Policy", "no-referrer");
		res.setHeader("Permissions-Policy", "microphone=(self)");
		res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
		res.setHeader(
			"Content-Security-Policy",
			"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		);

		const forwardedProto = trustProxy ? String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() : "";
		if (req.secure || forwardedProto === "https") {
			res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
		}

		next();
	});

	app.use("/api", (req, res, next) => {
		res.setHeader("Cache-Control", "no-store");

		if (!isHostAllowed(req.headers.host || "", allowedHosts)) {
			audit("host_rejected", req, { host: req.headers.host || "" });
			res.status(403).json({ ok: false, error: { code: "forbidden_host", message: "Host is not allowed.", retryable: false } });
			return;
		}

		if (!isOriginAllowed(req, allowedOrigin, trustProxy)) {
			audit("origin_rejected", req, { origin: req.headers.origin || "" });
			res.status(403).json({ ok: false, error: { code: "forbidden_origin", message: "Origin is not allowed.", retryable: false } });
			return;
		}

		if (!apiAuthToken) {
			res.status(500).json({ ok: false, error: { code: "auth_not_configured", message: "API_AUTH_TOKEN is not configured.", retryable: false } });
			return;
		}

		const requestToken = getRequestToken(req);
		if (!secureTokenEquals(requestToken, apiAuthToken)) {
			audit("auth_failed", req, {});
			res.status(401).json({ ok: false, error: { code: "unauthorized", message: "Missing or invalid API token.", retryable: false } });
			return;
		}

		const scope = rateScope(req.path, req.method);
		const limit = rateLimitForScope(scope, rateLimitApiMax, rateLimitChatMax, rateLimitStreamMax, rateLimitTranscribeMax);
		if (!consumeRateLimit(rateBuckets, `${requestIp(req, trustProxy)}:${scope}`, rateLimitWindowMs, limit, rateLimitMaxBuckets)) {
			audit("rate_limited", req, { scope, limit });
			res.status(429).json({ ok: false, error: { code: "rate_limited", message: "Rate limit exceeded.", retryable: true } });
			return;
		}

		next();
	});

	app.use("/api", express.json({ limit: maxJsonBodyBytes }));

	app.use("/api", (error, req, res, next) => {
		if (error && error.type === "entity.too.large") {
			audit("json_payload_too_large", req, {});
			res.status(413).json({ ok: false, error: { code: "payload_too_large", message: "JSON payload exceeds allowed size.", retryable: false } });
			return;
		}

		if (error && (error.type === "entity.parse.failed" || error instanceof SyntaxError)) {
			audit("json_parse_failed", req, {});
			res.status(400).json({ ok: false, error: { code: "invalid_json", message: "Request body must be valid JSON.", retryable: false } });
			return;
		}

		next(error);
	});

	app.use(express.static(publicDir));

	function nowMs() {
		return nowFn();
	}

	function uid() {
		return `${uidSeedFn()}${nowMs().toString(36).slice(-5)}`;
	}

	function audit(event, req, details) {
		const entry = {
			timestamp: new Date(nowMs()).toISOString(),
			event,
			request_id: req && req.request_id ? req.request_id : null,
			method: req ? req.method : null,
			path: req ? req.path : null,
			ip: req ? requestIp(req, trustProxy) : null,
			details: details || {}
		};

		try {
			fs.appendFileSync(auditLogPath, `${JSON.stringify(entry)}\n`, "utf8");
		} catch (error) {
			// ignore logging failures to avoid breaking request paths
		}
	}

	function initSchema() {
		db.exec(`
			CREATE TABLE IF NOT EXISTS profiles (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				provider_id TEXT NOT NULL,
				base_url TEXT NOT NULL DEFAULT '',
				models_csv TEXT NOT NULL DEFAULT '',
				api_key_cipher TEXT NOT NULL DEFAULT '',
				api_key_iv TEXT NOT NULL DEFAULT '',
				api_key_tag TEXT NOT NULL DEFAULT '',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS chats (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				project_path TEXT NOT NULL DEFAULT '',
				pinned INTEGER NOT NULL DEFAULT 0,
				archived INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS panes (
				id TEXT PRIMARY KEY,
				chat_id TEXT NOT NULL,
				profile_id TEXT NOT NULL,
				model TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'idle',
				sort_order INTEGER NOT NULL DEFAULT 0,
				FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
				FOREIGN KEY(profile_id) REFERENCES profiles(id)
			);

			CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				pane_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				provider TEXT,
				model TEXT,
				thinking TEXT,
				usage_json TEXT,
				created_at INTEGER NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				FOREIGN KEY(pane_id) REFERENCES panes(id) ON DELETE CASCADE
			);

			CREATE TABLE IF NOT EXISTS app_settings (
				id INTEGER PRIMARY KEY CHECK(id = 1),
				temperature REAL NOT NULL DEFAULT 0.2,
				max_tokens INTEGER NOT NULL DEFAULT 12000,
				broadcast_to_all_panes INTEGER NOT NULL DEFAULT 1,
				active_chat_id TEXT,
				project_folders_json TEXT NOT NULL DEFAULT '[]',
				tools_json TEXT NOT NULL DEFAULT '[]',
				show_archived INTEGER NOT NULL DEFAULT 0,
				search_query TEXT NOT NULL DEFAULT '',
				updated_at INTEGER NOT NULL
			);
		`);
	}

	function ensureChatsProjectPathColumn() {
		const chatColumns = db.prepare("PRAGMA table_info(chats)").all();
		const hasProjectPathColumn = chatColumns.some((column) => String(column.name || "") === "project_path");
		if (!hasProjectPathColumn) {
			db.prepare("ALTER TABLE chats ADD COLUMN project_path TEXT NOT NULL DEFAULT ''").run();
		}
	}

	function ensureAppSettingsProjectFoldersColumn() {
		const settingsColumns = db.prepare("PRAGMA table_info(app_settings)").all();
		const hasProjectFoldersColumn = settingsColumns.some((column) => String(column.name || "") === "project_folders_json");
		if (!hasProjectFoldersColumn) {
			db.prepare("ALTER TABLE app_settings ADD COLUMN project_folders_json TEXT NOT NULL DEFAULT '[]'").run();
		}
	}

	function ensureAppSettingsStateVersionColumn() {
		const settingsColumns = db.prepare("PRAGMA table_info(app_settings)").all();
		const hasStateVersionColumn = settingsColumns.some((column) => String(column.name || "") === "state_version");
		if (!hasStateVersionColumn) {
			db.prepare("ALTER TABLE app_settings ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0").run();
		}
	}

	function ensureAppSettingsToolsColumn() {
		const settingsColumns = db.prepare("PRAGMA table_info(app_settings)").all();
		const hasToolsColumn = settingsColumns.some((column) => String(column.name || "") === "tools_json");
		if (!hasToolsColumn) {
			db.prepare("ALTER TABLE app_settings ADD COLUMN tools_json TEXT NOT NULL DEFAULT '[]'").run();
		}
	}

	function encryptValue(plainText) {
		if (!plainText) {
			return { cipher: "", iv: "", tag: "" };
		}

		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
		const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();
		return {
			cipher: encrypted.toString("base64"),
			iv: iv.toString("base64"),
			tag: tag.toString("base64")
		};
	}

	function decryptValue(cipherText, ivText, tagText) {
		if (!cipherText || !ivText || !tagText) {
			return "";
		}

		const decipher = crypto.createDecipheriv(
			"aes-256-gcm",
			encryptionKey,
			Buffer.from(ivText, "base64")
		);
		decipher.setAuthTag(Buffer.from(tagText, "base64"));
		const output = Buffer.concat([
			decipher.update(Buffer.from(cipherText, "base64")),
			decipher.final()
		]);
		return output.toString("utf8");
	}

	function storedApiKeyError(error) {
		const message = String(error && error.message || "").toLowerCase();
		return message.includes("unable to authenticate data")
			|| message.includes("unsupported state")
			|| message.includes("bad decrypt");
	}

	function defaultProfiles() {
		const stamp = nowMs();
		return [
			{
				id: uid(),
				name: "OpenAI Main",
				provider_id: "openai",
				base_url: "",
				models_csv: "gpt-4.1,gpt-4.1-mini,o4-mini,gpt-4o-mini-transcribe,whisper-1",
				api_key: "",
				createdAt: stamp,
				updatedAt: stamp
			},
			{
				id: uid(),
				name: "DeepSeek Pro",
				provider_id: "deepseek",
				base_url: "",
				models_csv: "deepseek-v3.1-pro,deepseek-v3.1-flash,deepseek-chat",
				api_key: "",
				createdAt: stamp,
				updatedAt: stamp
			},
			{
				id: uid(),
				name: "OpenRouter",
				provider_id: "openrouter",
				base_url: "",
				models_csv: "openai/gpt-4.1-mini,anthropic/claude-3.7-sonnet,deepseek/deepseek-chat-v3-0324",
				api_key: "",
				createdAt: stamp,
				updatedAt: stamp
			}
		];
	}

	function seedState() {
		const profileCount = db.prepare("SELECT COUNT(*) AS count FROM profiles").get().count;
		if (profileCount === 0) {
			const insertProfile = db.prepare(`
				INSERT INTO profiles (
					id, name, provider_id, base_url, models_csv,
					api_key_cipher, api_key_iv, api_key_tag, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			for (const profile of defaultProfiles()) {
				const encrypted = encryptValue(profile.api_key);
				insertProfile.run(
					profile.id,
					profile.name,
					profile.provider_id,
					profile.base_url,
					profile.models_csv,
					encrypted.cipher,
					encrypted.iv,
					encrypted.tag,
					profile.createdAt,
					profile.updatedAt
				);
			}
		}

		const settings = db.prepare("SELECT id FROM app_settings WHERE id = 1").get();
		if (!settings) {
			db.prepare(`
				INSERT INTO app_settings (
					id, temperature, max_tokens, broadcast_to_all_panes,
					active_chat_id, project_folders_json, tools_json, show_archived, search_query, updated_at
				) VALUES (1, 0.2, ?, 1, NULL, '[]', '[]', 0, '', ?)
			`).run(defaultMaxTokens, nowMs());
		}

		const chatCount = db.prepare("SELECT COUNT(*) AS count FROM chats").get().count;
		if (chatCount === 0) {
			const profile = db.prepare("SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1").get();
			if (profile) {
				const chatId = uid();
				const paneId = uid();
				const stamp = nowMs();
				db.prepare(
					"INSERT INTO chats (id, title, project_path, pinned, archived, created_at, updated_at, sort_order) VALUES (?, ?, '', 0, 0, ?, ?, 0)"
				).run(chatId, "New Chat", stamp, stamp);
				db.prepare(
					"INSERT INTO panes (id, chat_id, profile_id, model, status, sort_order) VALUES (?, ?, ?, '', 'idle', 0)"
				).run(paneId, chatId, profile.id);
				db.prepare("UPDATE app_settings SET active_chat_id = ?, updated_at = ? WHERE id = 1").run(chatId, stamp);
			}
		}
	}

	function parseUsage(usageJson) {
		if (!usageJson) {
			return null;
		}
		try {
			return JSON.parse(usageJson);
		} catch (error) {
			return null;
		}
	}

	function parseProjectFoldersJson(rawJson) {
		try {
			const parsed = JSON.parse(String(rawJson || "[]"));
			if (!Array.isArray(parsed)) {
				return [];
			}

			const deduped = new Set();
			for (const folderPath of parsed) {
				const normalized = String(folderPath || "").trim();
				if (!normalized) {
					continue;
				}
				deduped.add(normalized);
			}

			return Array.from(deduped.values());
		} catch (error) {
			return [];
		}
	}

	function parseToolsJson(rawJson) {
		try {
			const parsed = JSON.parse(String(rawJson || "[]"));
			return Array.isArray(parsed)
				? parsed.filter((tool) => tool && typeof tool === "object").slice(0, 64)
				: [];
		} catch (error) {
			return [];
		}
	}

	function readState() {
		const settings = db.prepare("SELECT * FROM app_settings WHERE id = 1").get();
		const profileRows = db.prepare("SELECT * FROM profiles ORDER BY created_at ASC").all();
		const chatRows = db.prepare("SELECT * FROM chats ORDER BY sort_order ASC, updated_at DESC").all();
		const paneRows = db.prepare("SELECT * FROM panes ORDER BY sort_order ASC").all();
		const messageRows = db.prepare("SELECT * FROM messages ORDER BY sort_order ASC, created_at ASC").all();

		const panesByChat = new Map();
		for (const pane of paneRows) {
			if (!panesByChat.has(pane.chat_id)) {
				panesByChat.set(pane.chat_id, []);
			}
			panesByChat.get(pane.chat_id).push({
				id: pane.id,
				profile_id: pane.profile_id,
				model: pane.model || "",
				status: pane.status || "idle",
				messages: []
			});
		}

		const paneIndex = new Map();
		for (const paneList of panesByChat.values()) {
			for (const pane of paneList) {
				paneIndex.set(pane.id, pane);
			}
		}

		for (const message of messageRows) {
			const pane = paneIndex.get(message.pane_id);
			if (!pane) {
				continue;
			}
			pane.messages.push({
				id: message.id,
				role: message.role,
				content: message.content,
				provider: message.provider || null,
				model: message.model || null,
				thinking: message.thinking || "",
				usage: parseUsage(message.usage_json),
				createdAt: message.created_at
			});
		}

		const chats = chatRows.map((chat) => ({
			id: chat.id,
			title: chat.title,
			projectPath: String(chat.project_path || ""),
			pinned: chat.pinned === 1,
			archived: chat.archived === 1,
			createdAt: chat.created_at,
			updatedAt: chat.updated_at,
			panes: panesByChat.get(chat.id) || []
		}));

		const profiles = profileRows.map((profile) => ({
			id: profile.id,
			name: profile.name,
			provider_id: profile.provider_id,
			base_url: profile.base_url || "",
			models_csv: profile.models_csv || "",
			api_key_present: Boolean(profile.api_key_cipher) && (() => {
				try {
					return Boolean(decryptValue(profile.api_key_cipher, profile.api_key_iv, profile.api_key_tag));
				} catch (error) {
					return false;
				}
			})()
		}));

		return {
			chats,
			stateVersion: settings ? Number(settings.state_version || 0) : 0,
			projectFolders: parseProjectFoldersJson(settings ? settings.project_folders_json : "[]"),
			activeChatId: settings && settings.active_chat_id ? settings.active_chat_id : (chats[0] ? chats[0].id : null),
			showArchived: settings ? settings.show_archived === 1 : false,
			searchQuery: settings ? settings.search_query || "" : "",
			broadcastToAllPanes: settings ? settings.broadcast_to_all_panes === 1 : true,
			settings: {
				temperature: settings ? Number(settings.temperature) : 0.2,
				maxTokens: settings ? Number(settings.max_tokens) : defaultMaxTokens,
				profiles,
				tools: parseToolsJson(settings ? settings.tools_json : "[]")
			}
		};
	}

	function validateStateShape(state) {
		if (!state || typeof state !== "object") {
			throw new Error("State payload must be an object.");
		}

		if (!Array.isArray(state.chats)) {
			throw new Error("State payload is missing chats array.");
		}

		if (!Array.isArray(state.projectFolders)) {
			state.projectFolders = [];
		}

		if (!state.settings || typeof state.settings !== "object") {
			throw new Error("State payload is missing settings object.");
		}

		if (!Array.isArray(state.settings.profiles)) {
			throw new Error("Settings payload is missing profiles array.");
		}

		if (!Array.isArray(state.settings.tools)) {
			state.settings.tools = [];
		}

		if (state.settings.tools.length > 64) {
			throw new Error("Too many tools in state payload.");
		}

		for (const tool of state.settings.tools) {
			if (!tool || typeof tool !== "object") {
				throw new Error("Invalid tool in state payload.");
			}
			if (String(tool.name || "").length > 120 || String(tool.description || "").length > 2000) {
				throw new Error("Tool name or description exceeds max length.");
			}
			if (String(tool.parameters_json || "").length > 50000) {
				throw new Error("Tool parameters schema exceeds max length.");
			}
		}

		if (state.settings.profiles.length > 200) {
			throw new Error("Too many profiles in state payload.");
		}

		if (state.chats.length > 3000) {
			throw new Error("Too many chats in state payload.");
		}

		if (state.projectFolders.length > 2000) {
			throw new Error("Too many project folders in state payload.");
		}

		const profileIds = new Set();
		for (const profile of state.settings.profiles) {
			if (!profile || typeof profile !== "object") {
				throw new Error("Invalid provider profile in state payload.");
			}
			const profileId = String(profile.id || "").trim();
			if (profileId) {
				if (profileIds.has(profileId)) {
					throw new Error("Duplicate provider profile id in state payload.");
				}
				profileIds.add(profileId);
			}
			const providerId = String(profile && profile.provider_id ? profile.provider_id : "");
			if (!["openai", "deepseek", "openrouter", "custom"].includes(providerId)) {
				throw new Error("Invalid provider_id in profile payload.");
			}

			if (String(profile.name || "").length > 120) {
				throw new Error("Profile name exceeds max length.");
			}

			if (String(profile.models_csv || "").length > 8000) {
				throw new Error("Profile model list exceeds max length.");
			}

			if (Object.prototype.hasOwnProperty.call(profile, "api_key") && String(profile.api_key || "").length > 8000) {
				throw new Error("Profile API key exceeds max length.");
			}
		}

		const chatIds = new Set();
		const paneIds = new Set();
		const messageIds = new Set();
		for (const chat of state.chats) {
			if (!chat || typeof chat !== "object") {
				throw new Error("Invalid chat in state payload.");
			}
			const chatId = String(chat.id || "").trim();
			if (chatId) {
				if (chatIds.has(chatId)) {
					throw new Error("Duplicate chat id in state payload.");
				}
				chatIds.add(chatId);
			}
			const projectPathLength = String(chat && (chat.projectPath || chat.project_path || "")).length;
			if (projectPathLength > 2000) {
				throw new Error("Chat project path exceeds max length.");
			}

			if (!Array.isArray(chat.panes)) {
				continue;
			}
			for (const pane of chat.panes) {
				if (!pane || typeof pane !== "object") {
					throw new Error("Invalid pane in state payload.");
				}
				const paneId = String(pane.id || "").trim();
				if (paneId) {
					if (paneIds.has(paneId)) {
						throw new Error("Duplicate pane id in state payload.");
					}
					paneIds.add(paneId);
				}
				if (!Array.isArray(pane.messages)) {
					continue;
				}
				for (const message of pane.messages) {
					if (!message || typeof message !== "object") {
						throw new Error("Invalid message in state payload.");
					}
					const messageId = String(message.id || "").trim();
					if (messageId) {
						if (messageIds.has(messageId)) {
							throw new Error("Duplicate message id in state payload.");
						}
						messageIds.add(messageId);
					}
				}
			}
		}

		for (const folderPath of state.projectFolders) {
			if (String(folderPath || "").length > 2000) {
				throw new Error("Project folder path exceeds max length.");
			}
		}
	}

	const writeState = db.transaction((nextState) => {
		const settingsRow = db.prepare("SELECT state_version FROM app_settings WHERE id = 1").get();
		const currentVersion = settingsRow ? Number(settingsRow.state_version || 0) : 0;
		const clientVersion = Number(nextState.stateVersion);
		if (!Number.isFinite(clientVersion) || clientVersion !== currentVersion) {
			const conflict = new Error("State version mismatch. Reload the latest state before saving.");
			conflict.code = "state_version_conflict";
			conflict.currentVersion = currentVersion;
			throw conflict;
		}
		const nextVersion = currentVersion + 1;
		if (nextState.settings.profiles.length === 0) {
			throw new Error("At least one provider profile is required.");
		}

		const existingProfileSecrets = new Map();
		for (const row of db.prepare("SELECT id, api_key_cipher, api_key_iv, api_key_tag FROM profiles").all()) {
			existingProfileSecrets.set(row.id, row);
		}

		db.prepare("DELETE FROM messages").run();
		db.prepare("DELETE FROM panes").run();
		db.prepare("DELETE FROM chats").run();
		db.prepare("DELETE FROM profiles").run();

		const insertProfile = db.prepare(`
			INSERT INTO profiles (
				id, name, provider_id, base_url, models_csv,
				api_key_cipher, api_key_iv, api_key_tag, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const now = nowMs();
		for (const profile of nextState.settings.profiles) {
			const profileId = String(profile.id || uid());
			const hasApiKeyUpdate = Object.prototype.hasOwnProperty.call(profile, "api_key");
			let encrypted;

			if (hasApiKeyUpdate) {
				encrypted = encryptValue(String(profile.api_key || ""));
			} else {
				const existing = existingProfileSecrets.get(profileId);
				if (existing) {
					encrypted = {
						cipher: existing.api_key_cipher,
						iv: existing.api_key_iv,
						tag: existing.api_key_tag
					};
				} else {
					encrypted = encryptValue("");
				}
			}
			insertProfile.run(
				profileId,
				String(profile.name || "New Profile"),
				String(profile.provider_id || "openai"),
				String(profile.base_url || ""),
				String(profile.models_csv || ""),
				encrypted.cipher,
				encrypted.iv,
				encrypted.tag,
				now,
				now
			);
		}

		const profileIds = new Set(db.prepare("SELECT id FROM profiles").all().map((row) => row.id));
		const fallbackProfile = db.prepare("SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1").get();

		const insertChat = db.prepare(
			"INSERT INTO chats (id, title, project_path, pinned, archived, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
		);
		const insertPane = db.prepare(
			"INSERT INTO panes (id, chat_id, profile_id, model, status, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
		);
		const insertMessage = db.prepare(
			"INSERT INTO messages (id, pane_id, role, content, provider, model, thinking, usage_json, created_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
		);

		let chatOrder = 0;
		for (const chat of nextState.chats) {
			const chatId = String(chat.id || uid());
			const chatProjectPath = String(chat.projectPath || chat.project_path || "");
			insertChat.run(
				chatId,
				String(chat.title || "Untitled Chat"),
				chatProjectPath,
				chat.pinned ? 1 : 0,
				chat.archived ? 1 : 0,
				Number(chat.createdAt || now),
				Number(chat.updatedAt || now),
				chatOrder
			);
			chatOrder += 1;

			const panes = Array.isArray(chat.panes) ? chat.panes : [];
			let paneOrder = 0;
			for (const pane of panes) {
				const paneId = String(pane.id || uid());
				let profileId = String(pane.profile_id || "");
				if (!profileIds.has(profileId) && fallbackProfile) {
					profileId = fallbackProfile.id;
				}
				insertPane.run(
					paneId,
					chatId,
					profileId,
					String(pane.model || ""),
					String(pane.status || "idle"),
					paneOrder
				);
				paneOrder += 1;

				const messages = Array.isArray(pane.messages) ? pane.messages : [];
				let messageOrder = 0;
				for (const message of messages) {
					insertMessage.run(
						String(message.id || uid()),
						paneId,
						String(message.role || "assistant"),
						String(message.content || ""),
						message.provider ? String(message.provider) : null,
						message.model ? String(message.model) : null,
						message.thinking ? String(message.thinking) : "",
						message.usage ? JSON.stringify(message.usage) : null,
						Number(message.createdAt || now),
						messageOrder
					);
					messageOrder += 1;
				}
			}
		}

		const hasChat = db.prepare("SELECT id FROM chats ORDER BY sort_order ASC LIMIT 1").get();
		const activeChatId = hasChat
			? (nextState.activeChatId && db.prepare("SELECT id FROM chats WHERE id = ?").get(nextState.activeChatId)
				? nextState.activeChatId
				: hasChat.id)
			: null;

		db.prepare(`
			INSERT INTO app_settings (
				id, temperature, max_tokens, broadcast_to_all_panes,
				active_chat_id, project_folders_json, tools_json, show_archived, search_query, state_version, updated_at
			) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				temperature = excluded.temperature,
				max_tokens = excluded.max_tokens,
				broadcast_to_all_panes = excluded.broadcast_to_all_panes,
				active_chat_id = excluded.active_chat_id,
				project_folders_json = excluded.project_folders_json,
				tools_json = excluded.tools_json,
				show_archived = excluded.show_archived,
				search_query = excluded.search_query,
				state_version = excluded.state_version,
				updated_at = excluded.updated_at
		`).run(
			Number(nextState.settings.temperature || 0.2),
			Number(nextState.settings.maxTokens || defaultMaxTokens),
			nextState.broadcastToAllPanes ? 1 : 0,
			activeChatId,
			JSON.stringify(Array.isArray(nextState.projectFolders) ? nextState.projectFolders : []),
			JSON.stringify(Array.isArray(nextState.settings.tools) ? nextState.settings.tools : []),
			nextState.showArchived ? 1 : 0,
			String(nextState.searchQuery || ""),
			nextVersion,
			now
		);

		purgeExpiredData();
		return nextVersion;
	});

	function purgeExpiredData() {
		if (!Number.isFinite(dataRetentionDays) || dataRetentionDays <= 0) {
			return;
		}

		const cutoff = nowMs() - (dataRetentionDays * 24 * 60 * 60 * 1000);
		db.prepare("DELETE FROM messages WHERE created_at < ?").run(cutoff);
		db.prepare("DELETE FROM chats WHERE archived = 1 AND updated_at < ?").run(cutoff);
	}

	function parseBridgeStdout(stdoutText) {
		const text = String(stdoutText || "").trim();
		if (!text) {
			throw new Error("Bridge returned empty output.");
		}

		try {
			return JSON.parse(text);
		} catch (error) {
			// Bridge diagnostics may surround a pretty-printed JSON result.
		}

		let lastParsedValue = null;
		let foundParsedValue = false;
		let bestParsedLength = -1;
		for (let start = 0; start < text.length; start += 1) {
			if (text.charAt(start) !== "{" && text.charAt(start) !== "[") {
				continue;
			}

			const end = findJsonValueEnd(text, start);
			if (end < 0) {
				continue;
			}

			try {
				const candidateLength = end - start + 1;
				if (candidateLength >= bestParsedLength) {
					lastParsedValue = JSON.parse(text.slice(start, end + 1));
					bestParsedLength = candidateLength;
				}
				foundParsedValue = true;
			} catch (error) {
				// Keep scanning for the next balanced JSON value.
			}
		}
		if (foundParsedValue) {
			return lastParsedValue;
		}

		throw new Error("Bridge returned invalid JSON output.");
	}

	function findJsonValueEnd(text, start) {
		const stack = [];
		let inString = false;
		let escaped = false;
		for (let index = start; index < text.length; index += 1) {
			const character = text.charAt(index);
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (character === "\\") {
					escaped = true;
				} else if (character === '"') {
					inString = false;
				}
				continue;
			}

			if (character === '"') {
				inString = true;
				continue;
			}
			if (character === "{" || character === "[") {
				stack.push(character);
				continue;
			}
			if (character !== "}" && character !== "]") {
				continue;
			}

			const opening = stack.pop();
			if ((character === "}" && opening !== "{") || (character === "]" && opening !== "[")) {
				return -1;
			}
			if (stack.length === 0) {
				return index;
			}
		}

		return -1;
	}

	function runBridgeWithSpawn(bridgePayload, bridgeEnv) {
		return new Promise((resolve) => {
			const maxBufferBytes = 1024 * 1024 * 8;
			const timeoutMs = 240000;
			let stdout = "";
			let stderr = "";
			let settled = false;
			let timedOut = false;
			let overflowed = false;

			function finalize(result) {
				if (settled) {
					return;
				}
				settled = true;
				resolve(result);
			}

			function appendChunk(current, chunkText) {
				if (overflowed) {
					return current;
				}

				const next = current + String(chunkText || "");
				if (Buffer.byteLength(next, "utf8") > maxBufferBytes) {
					overflowed = true;
					return next.slice(0, maxBufferBytes);
				}

				return next;
			}

			let child;
			try {
				child = spawnFn(
					kujoBin,
					["run", bridgeScript, "--interpreter", "--", "--payload", JSON.stringify(bridgePayload)],
					{
						cwd: aiSdkPath,
						env: bridgeEnv,
						stdio: ["ignore", "pipe", "pipe"]
					}
				);
			} catch (error) {
				finalize({ error, stdout, stderr, status: null });
				return;
			}

			const timeout = setTimeout(() => {
				timedOut = true;
				try {
					child.kill("SIGKILL");
				} catch (error) {
					// ignore kill failures in timeout paths
				}
			}, timeoutMs);

			if (child.stdout) {
				child.stdout.setEncoding("utf8");
				child.stdout.on("data", (chunk) => {
					stdout = appendChunk(stdout, chunk);
					if (overflowed) {
						try {
							child.kill("SIGKILL");
						} catch (error) {
							// ignore kill failures in overflow paths
						}
					}
				});
			}

			if (child.stderr) {
				child.stderr.setEncoding("utf8");
				child.stderr.on("data", (chunk) => {
					stderr = appendChunk(stderr, chunk);
					if (overflowed) {
						try {
							child.kill("SIGKILL");
						} catch (error) {
							// ignore kill failures in overflow paths
						}
					}
				});
			}

			child.on("error", (error) => {
				clearTimeout(timeout);
				try {
					child.kill("SIGKILL");
				} catch (killError) {
					// Ignore cleanup failures after a child process error.
				}
				finalize({ error, stdout, stderr, status: null });
			});

			child.on("close", (status) => {
				clearTimeout(timeout);
				if (timedOut) {
					finalize({ error: new Error("Bridge command timed out."), stdout, stderr, status: Number.isFinite(status) ? status : null });
					return;
				}

				if (overflowed) {
					finalize({ error: new Error("Bridge output exceeded maximum buffer size."), stdout, stderr, status: Number.isFinite(status) ? status : null });
					return;
				}

				finalize({ error: null, stdout, stderr, status: Number.isFinite(status) ? status : null });
			});
		});
	}

	async function runBridge(bridgePayload, bridgeEnv) {
		if (typeof spawnSyncFn === "function") {
			return spawnSyncFn(
				kujoBin,
				["run", bridgeScript, "--interpreter", "--", "--payload", JSON.stringify(bridgePayload)],
				{
					cwd: aiSdkPath,
					encoding: "utf8",
					timeout: 240000,
					maxBuffer: 1024 * 1024 * 8,
					env: bridgeEnv
				}
			);
		}

		return runBridgeWithSpawn(bridgePayload, bridgeEnv);
	}

	function profileById(profileId) {
		const row = db.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId);
		if (!row) {
			throw new Error("Provider profile not found.");
		}

		let apiKey = "";
		try {
			apiKey = decryptValue(row.api_key_cipher, row.api_key_iv, row.api_key_tag);
		} catch (error) {
			if (storedApiKeyError(error)) {
				const authError = new Error("The stored API key cannot be decrypted. Re-enter the key in Settings, or restore the ENCRYPTION_SECRET used when it was saved.");
				authError.code = "auth_error";
				throw authError;
			}
			throw error;
		}
		return {
			id: row.id,
			name: row.name,
			provider_id: row.provider_id,
			base_url: row.base_url || "",
			models_csv: row.models_csv || "",
			api_key: apiKey
		};
	}

	function providerConfig(profile) {
		if (profile.provider_id === "openrouter") {
			return {
				base_url: "https://openrouter.ai/api/v1",
				chat_path: "/chat/completions",
				transcribe_path: "/audio/transcriptions"
			};
		}

		if (profile.provider_id === "deepseek") {
			return {
				base_url: "https://api.deepseek.com/v1",
				chat_path: "/chat/completions",
				transcribe_path: null
			};
		}

		if (profile.provider_id === "custom") {
			const base = profile.base_url || "https://api.openai.com/v1";
			let parsedBase;
			try {
				parsedBase = new URL(base);
			} catch (error) {
				parsedBase = null;
			}
			if (parsedBase && ["ollama.com", "ollama.ai"].includes(parsedBase.hostname.toLowerCase())) {
				return {
					base_url: `${parsedBase.protocol}//${parsedBase.host}`,
					chat_path: "/api/chat",
					transcribe_path: null,
					ollama_native: true
				};
			}
			return {
				base_url: base,
				chat_path: "/chat/completions",
				transcribe_path: "/audio/transcriptions",
				ollama_native: false
			};
		}

		return {
			base_url: "https://api.openai.com/v1",
			chat_path: "/chat/completions",
			transcribe_path: "/audio/transcriptions"
		};
	}

	function getProviderApiKeyEnvName(providerId) {
		if (providerId === "openrouter") {
			return "OPENROUTER_API_KEY";
		}
		if (providerId === "deepseek") {
			return "DEEPSEEK_API_KEY";
		}
		if (providerId === "custom") {
			return "CUSTOM_API_KEY";
		}
		return "OPENAI_API_KEY";
	}

	function validateProviderBaseUrl(baseUrl, providerId) {
		let parsed;
		try {
			parsed = new URL(String(baseUrl || ""));
		} catch (error) {
			throw new Error("Invalid provider base URL.");
		}

		if (parsed.protocol !== "https:") {
			throw new Error("Provider base URL must use HTTPS.");
		}

		if (parsed.username || parsed.password || parsed.search || parsed.hash) {
			throw new Error("Provider base URL contains unsupported components.");
		}

		const host = parsed.hostname.toLowerCase();
		if (isDisallowedHost(host)) {
			throw new Error("Provider base URL host is not allowed.");
		}

		const allowlist = providerId === "custom"
			? allowedCustomProviderHosts
			: providerDefaultHostAllowlist(providerId);

		if (allowlist.length === 0 && providerId === "custom") {
			throw new Error("Custom provider host is not allowlisted.");
		}

		if (!hostMatchesAllowlist(host, allowlist)) {
			throw new Error("Provider base URL host is not in the allowlist.");
		}

		const normalizedPath = parsed.pathname.replace(/\/+$/, "");
		return `${parsed.protocol}//${parsed.host}${normalizedPath || ""}`;
	}

	function providerDefaultHostAllowlist(providerId) {
		if (providerId === "openrouter") {
			return ["openrouter.ai"];
		}
		if (providerId === "deepseek") {
			return ["api.deepseek.com"];
		}
		return ["api.openai.com"];
	}

	function getProviderRequestConfig(profile) {
		const config = providerConfig(profile);
		return {
			base_url: validateProviderBaseUrl(config.base_url, profile.provider_id),
			chat_path: config.chat_path,
			transcribe_path: config.transcribe_path
		};
	}

	async function fetchWithTimeout(url, options, timeoutMs) {
		const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : requestTimeoutMs;
		if (effectiveTimeoutMs <= 0) {
			return fetchFn(url, options);
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
		try {
			return await fetchFn(url, { ...options, signal: controller.signal });
		} finally {
			clearTimeout(timeout);
		}
	}

	function flattenText(value) {
		if (typeof value === "string") {
			return value;
		}

		if (Array.isArray(value)) {
			return value.map((entry) => flattenText(entry)).join("");
		}

		if (value && typeof value === "object") {
			if (typeof value.text === "string") {
				return value.text;
			}
			if (typeof value.output_text === "string") {
				return value.output_text;
			}
			if (typeof value.content === "string") {
				return value.content;
			}
			if (value.content !== undefined) {
				return flattenText(value.content);
			}
			if (value.output !== undefined) {
				return flattenText(value.output);
			}
		}

		return "";
	}

	function firstNumericValue(values) {
		for (const value of values) {
			if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
				continue;
			}
			if (Number.isFinite(Number(value))) {
				return Number(value);
			}
		}
		return null;
	}

	function normalizeUsage(rawUsage, envelope = {}) {
		const usage = rawUsage && typeof rawUsage === "object" ? rawUsage : {};
		const promptDetails = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
			? usage.prompt_tokens_details
			: (usage.input_tokens_details && typeof usage.input_tokens_details === "object" ? usage.input_tokens_details : {});
		const inputTokens = firstNumericValue([
			usage.prompt_tokens,
			usage.input_tokens,
			envelope.prompt_eval_count,
			envelope.input_tokens
		]) || 0;
		const outputTokens = firstNumericValue([
			usage.completion_tokens,
			usage.output_tokens,
			envelope.eval_count,
			envelope.output_tokens
		]) || 0;
		const cachedInputTokens = firstNumericValue([
			usage.cached_tokens,
			usage.cache_read_input_tokens,
			usage.prompt_cache_hit_tokens,
			promptDetails.cached_tokens,
			promptDetails.cache_read_input_tokens,
			envelope.cached_tokens,
			envelope.cache_read_input_tokens,
			envelope.prompt_cache_hit_tokens
		]);
		const cacheWriteInputTokens = firstNumericValue([
			usage.cache_creation_input_tokens,
			usage.cache_write_input_tokens,
			usage.prompt_cache_miss_tokens,
			promptDetails.cache_creation_input_tokens,
			promptDetails.cache_write_input_tokens,
			envelope.cache_creation_input_tokens,
			envelope.cache_write_input_tokens,
			envelope.prompt_cache_miss_tokens
		]);
		return {
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			total_tokens: firstNumericValue([usage.total_tokens, envelope.total_tokens]) || inputTokens + outputTokens,
			cached_input_tokens: cachedInputTokens,
			cache_write_input_tokens: cacheWriteInputTokens,
			cache_details_reported: cachedInputTokens !== null || cacheWriteInputTokens !== null
		};
	}

	function outputDelta(delta) {
		if (!delta || typeof delta !== "object") {
			return "";
		}
		if (typeof delta.response === "string") {
			return delta.response;
		}
		if (typeof delta.output_text === "string") {
			return delta.output_text;
		}
		if (typeof delta.text === "string") {
			return delta.text;
		}
		return flattenText(delta.content);
	}

	function thinkingDelta(delta) {
		if (!delta || typeof delta !== "object") {
			return "";
		}
		if (typeof delta.think === "string") {
			return delta.think;
		}
		if (typeof delta.reasoning_content === "string") {
			return delta.reasoning_content;
		}
		if (typeof delta.reasoning === "string") {
			return delta.reasoning;
		}
		if (typeof delta.thinking === "string") {
			return delta.thinking;
		}
		if (delta.reasoning_content) {
			return flattenText(delta.reasoning_content);
		}
		if (delta.reasoning) {
			return flattenText(delta.reasoning);
		}
		return "";
	}

	function sseEvent(res, eventName, payload) {
		if (res.writableEnded || res.destroyed) {
			return false;
		}
		res.write(`event: ${eventName}\n`);
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
		return true;
	}

	function splitToTokenChunks(text) {
		if (!text) {
			return [];
		}
		const words = String(text).split(" ");
		return words.map((word, index) => (index === words.length - 1 ? word : `${word} `));
	}

	function chatRequestPayload(body, profile) {
		const messages = normalizeMessages(body.messages);
		if (messages.length === 0) {
			throw new Error("At least one message is required.");
		}

		if (messages.length > maxMessagesPerRequest) {
			throw new Error("Too many messages in request.");
		}

		const totalChars = messages.reduce((total, item) => total + String(item.content || "").length, 0);
		if (totalChars > maxTotalMessageChars) {
			throw new Error("Total message content exceeds maximum allowed size.");
		}

		const model = String(body.model || "").trim() || String(body.model_hint || "").trim() || "gpt-4.1-mini";
		if (model.length > 160) {
			throw new Error("Requested model name is too long.");
		}

		const nextTemperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2;
		const nextMaxTokens = Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : defaultMaxTokens;
		const nextMaxRetries = Number.isFinite(Number(body.max_retries)) ? Number(body.max_retries) : 2;
		const nextRetryDelayMs = Number.isFinite(Number(body.retry_delay_ms)) ? Number(body.retry_delay_ms) : 250;

		return {
			profile,
			messages,
			model,
			temperature: clamp(nextTemperature, 0, 2),
			max_tokens: clamp(nextMaxTokens, 1, 64000),
			max_retries: clamp(nextMaxRetries, 0, 8),
			retry_delay_ms: clamp(nextRetryDelayMs, 10, 10000),
			tools: normalizeTools(body.tools),
			offline_fixture: Boolean(body.offline_fixture)
		};
	}

	function normalizeTools(tools) {
		if (!Array.isArray(tools)) {
			return [];
		}

		const names = new Set();
		return tools.map((tool) => {
			if (!tool || typeof tool !== "object" || tool.type !== "function" || !tool.function || typeof tool.function !== "object") {
				return null;
			}

			const name = String(tool.function.name || "")
				.trim()
				.replace(/[^A-Za-z0-9_-]+/g, "_")
				.slice(0, 64);
			if (!name) {
				return null;
			}
			if (names.has(name)) {
				return null;
			}
			names.add(name);

			const parameters = tool.function.parameters && typeof tool.function.parameters === "object" && !Array.isArray(tool.function.parameters)
				? tool.function.parameters
				: { type: "object", properties: {} };
			return {
				type: "function",
				function: {
					name,
					description: String(tool.function.description || "").slice(0, 2000),
					parameters
				}
			};
		}).filter(Boolean).slice(0, 32);
	}

	function normalizeMessages(messages) {
		if (!Array.isArray(messages)) {
			return [];
		}

		const out = [];
		for (const entry of messages) {
			if (!entry || typeof entry !== "object") {
				continue;
			}

			const role = String(entry.role || "").trim();
			if (!(role === "system" || role === "user" || role === "assistant")) {
				continue;
			}

			const content = entry.content === null || entry.content === undefined ? "" : String(entry.content);
			if (content.length > maxMessageChars) {
				throw new Error("A message exceeds the maximum allowed length.");
			}

			out.push({ role, content });
		}

		return out;
	}

	initSchema();
	ensureChatsProjectPathColumn();
	ensureAppSettingsProjectFoldersColumn();
	ensureAppSettingsStateVersionColumn();
	ensureAppSettingsToolsColumn();
	seedState();
	purgeExpiredData();

	app.get("/api/health", (req, res) => {
		res.json({
			ok: true,
			service: "ai-chat",
			ai_sdk_available: aiSdkAvailable,
			auth_configured: Boolean(apiAuthToken),
			encryption_configured: encryptionSecret !== "DEVELOPMENT_ONLY_CHANGE_ME",
			retention_days: dataRetentionDays
		});
	});

	app.get("/api/providers", (req, res) => {
		res.json({
			ok: true,
			providers: providerCatalog
		});
	});

	app.get("/api/state", (req, res) => {
		try {
			audit("state_read", req, {});
			res.json({ ok: true, state: readState() });
		} catch (error) {
			audit("state_read_failed", req, { message: String(error.message || "") });
			res.status(500).json({ ok: false, error: { code: "state_read_failed", message: error.message, retryable: false } });
		}
	});

	app.put("/api/state", (req, res) => {
		try {
			const nextState = req.body || {};
			validateStateShape(nextState);
			const stateVersion = writeState(nextState);
			audit("state_write", req, {
				profiles: Array.isArray(nextState.settings && nextState.settings.profiles) ? nextState.settings.profiles.length : 0,
				chats: Array.isArray(nextState.chats) ? nextState.chats.length : 0,
				state_version: stateVersion
			});
			res.json({ ok: true, stateVersion });
		} catch (error) {
			audit("state_write_failed", req, { message: String(error.message || "") });
			if (error.code === "state_version_conflict") {
				res.status(409).json({
					ok: false,
					error: {
						code: "state_version_conflict",
						message: error.message,
						retryable: true,
						current_version: error.currentVersion
					}
				});
				return;
			}
			res.status(400).json({ ok: false, error: { code: "state_write_failed", message: error.message, retryable: false } });
		}
	});

	app.post("/api/chat", async (req, res) => {
		try {
			const body = req.body || {};
			const profileId = String(body.profile_id || "").trim();
			if (!profileId) {
				res.status(400).json({ ok: false, error: { code: "invalid_request", message: "profile_id is required.", retryable: false } });
				return;
			}

			const profile = profileById(profileId);
			const requestInfo = chatRequestPayload(body, profile);
			if (!profile.api_key && !requestInfo.offline_fixture) {
				res.status(400).json({ ok: false, error: { code: "auth_error", message: "This profile is missing an API key.", retryable: false } });
				return;
			}
			const provider = getProviderRequestConfig(profile);

			if (!aiSdkAvailable) {
				res.status(500).json({
					ok: false,
					error: {
						code: "sdk_not_configured",
						message: "AI SDK not found. Set AI_SDK_PATH to a directory containing ai_sdk.kujo and providers.kujo.",
						retryable: false
					}
				});
				return;
			}

			const payload = {
				provider_id: profile.provider_id,
				model: requestInfo.model,
				base_url: provider.base_url,
				temperature: requestInfo.temperature,
				max_tokens: requestInfo.max_tokens,
				max_retries: requestInfo.max_retries,
				retry_delay_ms: requestInfo.retry_delay_ms,
				messages: requestInfo.messages,
				tools: requestInfo.tools,
				offline_fixture: requestInfo.offline_fixture
			};

			const childEnv = {
				...env,
				[getProviderApiKeyEnvName(profile.provider_id)]: String(profile.api_key || "")
			};

			const child = await runBridge(payload, childEnv);

			if (child.error) {
				audit("chat_bridge_exec_error", req, { provider_id: profile.provider_id });
				res.status(500).json({
					ok: false,
					error: { code: "bridge_exec_error", message: child.error.message, retryable: false },
					...(debugErrors ? { raw: { stderr: child.stderr, stdout: child.stdout } } : {})
				});
				return;
			}

			let result;
			try {
				result = parseBridgeStdout(child.stdout);
			} catch (error) {
				audit("chat_bridge_parse_error", req, { provider_id: profile.provider_id });
				res.status(502).json({
					ok: false,
					error: { code: "bridge_parse_error", message: "Could not parse bridge output as JSON.", retryable: false },
					...(debugErrors ? { raw: { status: child.status, stdout: child.stdout, stderr: child.stderr } } : {})
				});
				return;
			}

			if (!result.ok) {
				const statusCode = Number.isFinite(Number(result.status_code)) && Number(result.status_code) > 0 ? Number(result.status_code) : 400;
				res.status(statusCode).json(result);
				return;
			}

			res.json(result);
		} catch (error) {
			audit("chat_failed", req, { message: String(error.message || "") });
			const code = error && error.code === "auth_error" ? "auth_error" : "chat_failed";
			res.status(code === "auth_error" ? 400 : 500).json({ ok: false, error: { code, message: error.message, retryable: false } });
		}
	});

	app.post("/api/chat/stream", async (req, res) => {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		if (typeof res.flushHeaders === "function") {
			res.flushHeaders();
		}

		let upstreamTimedOut = false;
		let clientDisconnected = false;
		try {
			const body = req.body || {};
			const profileId = String(body.profile_id || "").trim();
			if (!profileId) {
				sseEvent(res, "error", { code: "invalid_request", message: "profile_id is required." });
				res.end();
				return;
			}

			const profile = profileById(profileId);
			const requestInfo = chatRequestPayload(body, profile);
			if (!profile.api_key) {
				sseEvent(res, "error", { code: "auth_error", message: "This profile is missing an API key." });
				res.end();
				return;
			}
			const provider = getProviderRequestConfig(profile);

			const url = `${provider.base_url}${provider.chat_path}`;
			const requestBody = {
				model: requestInfo.model,
				messages: requestInfo.messages,
				temperature: requestInfo.temperature,
				max_tokens: requestInfo.max_tokens,
				stream: true,
				stream_options: { include_usage: true }
			};
			if (provider.ollama_native) {
				delete requestBody.max_tokens;
				delete requestBody.stream_options;
				requestBody.options = {
					temperature: requestInfo.temperature,
					num_predict: requestInfo.max_tokens
				};
			}
			if (body.disable_thinking === true) {
				requestBody.think = false;
				if (!provider.ollama_native) {
					requestBody.reasoning_effort = "none";
				}
				if (profile.provider_id === "custom" && !provider.ollama_native) {
					requestBody.enable_thinking = false;
					requestBody.thinking = false;
				}
			}
			if (requestInfo.tools.length > 0) {
				requestBody.tools = requestInfo.tools;
			}

			const headers = {
				Authorization: `Bearer ${profile.api_key}`,
				"Content-Type": "application/json"
			};

			if (profile.provider_id === "openrouter") {
				headers["HTTP-Referer"] = "https://localhost";
				headers["X-Title"] = "AI Chat";
			}

			const upstreamController = new AbortController();
			const responseCloseHandler = () => {
				if (!res.writableEnded) {
					clientDisconnected = true;
					upstreamController.abort();
				}
			};
			res.once("close", responseCloseHandler);
			let upstreamTimeout = null;
			const armUpstreamTimeout = () => {
				if (upstreamTimeout) {
					clearTimeout(upstreamTimeout);
				}
				if (streamRequestTimeoutMs > 0) {
					upstreamTimeout = setTimeout(() => {
						upstreamTimedOut = true;
						upstreamController.abort();
					}, streamRequestTimeoutMs);
				}
			};
			armUpstreamTimeout();

			try {
				const upstream = await fetchFn(url, {
					method: "POST",
					headers,
					body: JSON.stringify(requestBody),
					signal: upstreamController.signal
				});
				armUpstreamTimeout();

				if (!upstream.ok) {
					const raw = await upstream.text();
					sseEvent(res, "error", {
						code: "provider_http_error",
						message: `Provider returned HTTP ${upstream.status}`,
						status: upstream.status,
						...(debugErrors ? { raw } : {})
					});
					res.end();
					return;
				}

			const contentType = upstream.headers.get("content-type") || "";
			let fullText = "";
			let thinkingText = "";
			let usage = null;
			let finishReason = "";
			let modelName = requestInfo.model;
			let upstreamCompleted = false;

			if (contentType.includes("text/event-stream")) {
				const reader = upstream.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				let eventName = "message";
				let eventDataLines = [];

				const processEvent = () => {
					if (eventDataLines.length === 0) {
						eventName = "message";
						return;
					}

					const dataText = eventDataLines.join("\n");
					const currentEventName = eventName;
					eventName = "message";
					eventDataLines = [];
					if (dataText === "[DONE]") {
						upstreamCompleted = true;
						return;
					}

					let eventObj;
					try {
						eventObj = JSON.parse(dataText);
					} catch (error) {
						return;
					}
					if (!eventObj || typeof eventObj !== "object") {
						return;
					}

					if (currentEventName === "error" || eventObj.error) {
						sseEvent(res, "error", {
							code: "provider_error",
							message: eventObj.error && eventObj.error.message ? eventObj.error.message : "Provider stream error"
						});
						return;
					}

					if (eventObj.model) {
						modelName = eventObj.model;
					}
					if (eventObj.done === true) {
						upstreamCompleted = true;
					}

					const firstChoice = Array.isArray(eventObj.choices) && eventObj.choices.length > 0 ? eventObj.choices[0] : null;
					if (firstChoice && (firstChoice.finish_reason || firstChoice.done_reason)) {
						finishReason = firstChoice.finish_reason || firstChoice.done_reason;
					} else if (eventObj.finish_reason || eventObj.done_reason) {
						finishReason = eventObj.finish_reason || eventObj.done_reason;
					}

					const delta = firstChoice && firstChoice.delta && typeof firstChoice.delta === "object" ? firstChoice.delta : null;
					const message = firstChoice && firstChoice.message && typeof firstChoice.message === "object"
						? firstChoice.message
						: (eventObj.message && typeof eventObj.message === "object" ? eventObj.message : null);
					const token = outputDelta(delta) || outputDelta(message) || outputDelta(eventObj);
					const thinking = thinkingDelta(delta) || thinkingDelta(message) || thinkingDelta(eventObj);

					if (token) {
						fullText += token;
						sseEvent(res, "token", { delta: token });
					}

					if (thinking) {
						thinkingText += thinking;
						sseEvent(res, "thinking", { delta: thinking });
					}

					if (eventObj.usage && typeof eventObj.usage === "object") {
						usage = normalizeUsage(eventObj.usage, eventObj);
					}
				};

				const processBufferedLines = (flushFinalLine = false) => {
					const lines = buffer.split(/\r?\n/);
					if (!flushFinalLine) {
						buffer = lines.pop() || "";
					} else {
						buffer = "";
					}

					for (const line of lines) {
						if (line === "") {
							processEvent();
							continue;
						}

						const field = line.trimStart();
						if (field.startsWith("event:")) {
							eventName = field.slice(6).trim();
						} else if (field.startsWith("data:")) {
							eventDataLines.push(field.slice(5).replace(/^ /, ""));
						}
					}

					if (flushFinalLine) {
						processEvent();
					}
				};

				while (true) {
					const { value, done } = await reader.read();
					if (done) {
						buffer += decoder.decode();
						processBufferedLines(true);
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					processBufferedLines(false);
					armUpstreamTimeout();
				}
			} else {
				const raw = await upstream.text();
				let records = [];
				try {
					const parsed = JSON.parse(raw);
					records = Array.isArray(parsed) ? parsed : [parsed];
				} catch (error) {
					records = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
						try {
							return JSON.parse(line);
						} catch (parseError) {
							return null;
						}
					}).filter(Boolean);
				}

				for (const data of records) {
					if (!data || typeof data !== "object") {
						continue;
					}
					if (data.model) {
						modelName = data.model;
					}
					if (data.done === true) {
						upstreamCompleted = true;
					}

					const firstChoice = Array.isArray(data.choices) && data.choices.length > 0 ? data.choices[0] : null;
					const message = firstChoice && firstChoice.message
						? firstChoice.message
						: (data.message && typeof data.message === "object" ? data.message : data);
					if (firstChoice && firstChoice.finish_reason) {
						finishReason = firstChoice.finish_reason;
					} else if (data.finish_reason || data.done_reason) {
						finishReason = data.finish_reason || data.done_reason;
					}

					const token = outputDelta(message) || outputDelta(data);
					const thinking = thinkingDelta(message) || thinkingDelta(data);
					fullText += token;
					thinkingText += thinking;

					if (data.usage && typeof data.usage === "object") {
						usage = normalizeUsage(data.usage, data);
					}
				}

				for (const chunk of splitToTokenChunks(fullText)) {
					sseEvent(res, "token", { delta: chunk });
				}
				if (thinkingText) {
					sseEvent(res, "thinking", { delta: thinkingText });
				}
			}

				sseEvent(res, "done", {
					ok: true,
					provider: profile.provider_id,
					model: modelName,
					finish_reason: finishReason || (upstreamCompleted ? "stop" : "stream_closed"),
					usage,
					output_text: fullText,
					thinking_text: thinkingText
				});
				res.end();
			} finally {
				if (upstreamTimeout) {
					clearTimeout(upstreamTimeout);
				}
				res.off("close", responseCloseHandler);
			}
		} catch (error) {
			audit("chat_stream_failed", req, { message: String(error.message || "") });
			if (clientDisconnected) {
				return;
			}
			if (upstreamTimedOut || (error && (error.name === "AbortError" || String(error.message || "").toLowerCase().includes("abort")))) {
				sseEvent(res, "error", {
					code: "stream_timeout",
					message: "The upstream stream timed out before completion. Increase STREAM_REQUEST_TIMEOUT_MS or retry."
				});
			} else {
				sseEvent(res, "error", {
					code: error && error.code === "auth_error" ? "auth_error" : "stream_failed",
					message: error.message
				});
			}
			res.end();
		}
	});

	app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
		try {
			const profileId = String(req.body.profile_id || "").trim();
			if (!profileId) {
				res.status(400).json({ ok: false, error: { code: "invalid_request", message: "profile_id is required.", retryable: false } });
				return;
			}

			if (!req.file || !req.file.buffer) {
				res.status(400).json({ ok: false, error: { code: "invalid_request", message: "audio file is required.", retryable: false } });
				return;
			}

			if (!audioMimeTypes.has(String(req.file.mimetype || "").toLowerCase())) {
				res.status(400).json({ ok: false, error: { code: "invalid_audio", message: "Unsupported audio MIME type.", retryable: false } });
				return;
			}

			const profile = profileById(profileId);
			if (!profile.api_key) {
				res.status(400).json({ ok: false, error: { code: "auth_error", message: "This profile is missing an API key.", retryable: false } });
				return;
			}

			const provider = getProviderRequestConfig(profile);
			if (!provider.transcribe_path) {
				res.status(400).json({ ok: false, error: { code: "unsupported_feature", message: "This provider does not expose an audio transcription endpoint.", retryable: false } });
				return;
			}

			const model = String(req.body.model || "whisper-1").trim();
			const language = String(req.body.language || "").trim();
			const prompt = String(req.body.prompt || "").trim();

			if (model.length > 160 || language.length > 32 || prompt.length > 4000) {
				res.status(400).json({ ok: false, error: { code: "invalid_request", message: "Transcription parameters exceed allowed limits.", retryable: false } });
				return;
			}

			const form = new FormData();
			const fileName = req.file.originalname || "audio.webm";
			const mimeType = req.file.mimetype || "audio/webm";
			form.append("file", new Blob([req.file.buffer], { type: mimeType }), fileName);
			form.append("model", model);
			if (language) {
				form.append("language", language);
			}
			if (prompt) {
				form.append("prompt", prompt);
			}

			const headers = {
				Authorization: `Bearer ${profile.api_key}`
			};
			if (profile.provider_id === "openrouter") {
				headers["HTTP-Referer"] = "https://localhost";
				headers["X-Title"] = "AI Chat";
			}

			const endpoint = `${provider.base_url}${provider.transcribe_path}`;
			const upstream = await fetchWithTimeout(endpoint, { method: "POST", headers, body: form });
			const rawText = await upstream.text();

			let data = {};
			try {
				data = JSON.parse(rawText);
			} catch (error) {
				data = {};
			}

			if (!upstream.ok) {
				res.status(upstream.status).json({
					ok: false,
					error: {
						code: "transcription_http_error",
						message: `Transcription provider returned HTTP ${upstream.status}`,
						retryable: false
					},
					...(debugErrors ? { raw: rawText } : {})
				});
				return;
			}

			const transcript = typeof data.text === "string"
				? data.text
				: (typeof data.transcript === "string" ? data.transcript : "");

			res.json({
				ok: true,
				provider: profile.provider_id,
				model,
				text: transcript,
				raw: debugErrors ? data : undefined
			});
		} catch (error) {
			audit("transcribe_failed", req, { message: String(error.message || "") });
			res.status(500).json({ ok: false, error: { code: "transcribe_failed", message: error.message, retryable: false } });
		}
	});

	app.use((error, req, res, next) => {
		if (error && error.code === "LIMIT_FILE_SIZE") {
			res.status(413).json({ ok: false, error: { code: "file_too_large", message: "Uploaded file exceeds allowed size.", retryable: false } });
			return;
		}

		if (error && error.message === "Unsupported audio MIME type.") {
			res.status(400).json({ ok: false, error: { code: "invalid_audio", message: error.message, retryable: false } });
			return;
		}

		if (req.path && req.path.startsWith("/api/")) {
			audit("api_error", req, { message: String(error && error.message ? error.message : "") });
			res.status(500).json({ ok: false, error: { code: "internal_error", message: "Internal server error.", retryable: false } });
			return;
		}

		next(error);
	});

	app.get("*", (req, res) => {
		res.sendFile(path.join(publicDir, "index.html"));
	});

	function close() {
		try {
			db.close();
		} catch (error) {
			// ignore close errors in shutdown paths
		}
	}

	return {
		app,
		db,
		close,
		config: {
			projectRoot,
			publicDir,
			bridgeScript,
			port,
			host,
			kujoBin,
			aiSdkPath,
			aiSdkAvailable,
			trustProxy,
			dbPath,
			backupDir,
			encryptionSecret,
			auditLogPath,
			apiAuthToken
		},
		helpers: {
			nowMs,
			uid,
			initSchema,
			encryptValue,
			decryptValue,
			defaultProfiles,
			seedState,
			parseUsage,
			readState,
			normalizeMessages,
			normalizeTools,
			validateStateShape,
			writeState,
			parseBridgeStdout,
			profileById,
			providerConfig,
			flattenText,
			normalizeUsage,
			outputDelta,
			thinkingDelta,
			sseEvent,
			splitToTokenChunks,
			chatRequestPayload,
			getProviderApiKeyEnvName,
			providerDefaultHostAllowlist,
			validateProviderBaseUrl,
			getProviderRequestConfig,
			purgeExpiredData
		}
	};
}

function parseInteger(value, fallbackValue) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallbackValue;
	}
	return parsed;
}

function parseTimeoutMs(value, fallbackValue) {
	if (value === undefined || value === null || String(value).trim() === "") {
		return fallbackValue;
	}

	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed)) {
		return fallbackValue;
	}

	if (parsed < 0) {
		return fallbackValue;
	}

	return parsed;
}

function parseBoolean(value, fallbackValue) {
	if (value === undefined || value === null || String(value).trim() === "") {
		return fallbackValue;
	}

	const normalized = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}

	return fallbackValue;
}

function parseCsv(value) {
	if (!value) {
		return [];
	}

	const seen = new Set();
	const out = [];
	for (const item of String(value).split(",")) {
		const trimmed = item.trim().toLowerCase();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		out.push(trimmed);
	}

	return out;
}

function clamp(value, minValue, maxValue) {
	if (!Number.isFinite(value)) {
		return minValue;
	}
	if (value < minValue) {
		return minValue;
	}
	if (value > maxValue) {
		return maxValue;
	}
	return value;
}

function requestIp(req, trustProxy = false) {
	const forwarded = trustProxy ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
	if (forwarded) {
		return forwarded;
	}
	return String(req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown");
}

function getRequestToken(req) {
	const headerToken = String(req.headers["x-api-token"] || "").trim();
	if (headerToken) {
		return headerToken;
	}

	const authHeader = String(req.headers.authorization || "").trim();
	if (authHeader.toLowerCase().startsWith("bearer ")) {
		return authHeader.slice(7).trim();
	}

	return "";
}

function secureTokenEquals(candidate, expected) {
	if (!candidate || !expected) {
		return false;
	}

	const left = Buffer.from(String(candidate), "utf8");
	const right = Buffer.from(String(expected), "utf8");
	if (left.length !== right.length) {
		return false;
	}

	return crypto.timingSafeEqual(left, right);
}

function stripPort(hostValue) {
	const host = String(hostValue || "").trim().toLowerCase();
	if (!host) {
		return "";
	}

	if (host.startsWith("[") && host.includes("]")) {
		return host.slice(1, host.indexOf("]"));
	}

	const parts = host.split(":");
	if (parts.length > 1) {
		return parts[0];
	}

	return host;
}

function hostMatchesRule(host, rule) {
	if (!host || !rule) {
		return false;
	}

	if (rule.startsWith("*.")) {
		const suffix = rule.slice(1);
		return host.endsWith(suffix);
	}

	return host === rule;
}

function hostMatchesAllowlist(host, allowlist) {
	if (!allowlist || allowlist.length === 0) {
		return true;
	}

	for (const rule of allowlist) {
		if (hostMatchesRule(host, rule)) {
			return true;
		}
	}

	return false;
}

function isHostAllowed(hostHeader, allowlist) {
	if (!allowlist || allowlist.length === 0) {
		return true;
	}

	const host = stripPort(hostHeader);
	return hostMatchesAllowlist(host, allowlist);
}

function isOriginAllowed(req, explicitAllowedOrigin, trustProxy = false) {
	const origin = String(req.headers.origin || "").trim();
	if (!origin) {
		return true;
	}

	if (explicitAllowedOrigin) {
		return origin === explicitAllowedOrigin;
	}

	const forwardedProto = trustProxy ? String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase() : "";
	const protocol = forwardedProto || req.protocol || "http";
	const expected = `${protocol}://${req.headers.host}`;
	return origin === expected;
}

function isPrivateIpv4(host) {
	const octets = host.split(".").map((item) => Number.parseInt(item, 10));
	if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
		return false;
	}

	const first = octets[0];
	const second = octets[1];

	if (first === 10 || first === 127 || first === 0) {
		return true;
	}
	if (first === 169 && second === 254) {
		return true;
	}
	if (first === 172 && second >= 16 && second <= 31) {
		return true;
	}
	if (first === 192 && second === 168) {
		return true;
	}
	if (first === 100 && second >= 64 && second <= 127) {
		return true;
	}

	return false;
}

function isDisallowedHost(host) {
	const lower = String(host || "").trim().toLowerCase();
	if (!lower) {
		return true;
	}

	if (lower === "localhost" || lower.endsWith(".local")) {
		return true;
	}

	const ipVersion = net.isIP(lower);
	if (ipVersion === 4) {
		return isPrivateIpv4(lower);
	}

	if (ipVersion === 6) {
		return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
	}

	return false;
}

function rateScope(pathname, method) {
	if (method === "POST" && pathname === "/chat") {
		return "chat";
	}
	if (method === "POST" && pathname === "/chat/stream") {
		return "stream";
	}
	if (method === "POST" && pathname === "/transcribe") {
		return "transcribe";
	}
	return "api";
}

function rateLimitForScope(scope, apiLimit, chatLimit, streamLimit, transcribeLimit) {
	if (scope === "chat") {
		return chatLimit;
	}
	if (scope === "stream") {
		return streamLimit;
	}
	if (scope === "transcribe") {
		return transcribeLimit;
	}
	return apiLimit;
}

function consumeRateLimit(bucketMap, key, windowMs, limit, maxBuckets = 10000) {
	const now = Date.now();
	const currentWindow = Math.floor(now / windowMs);
	const current = bucketMap.get(key);

	if (!current || current.window !== currentWindow) {
		pruneRateBuckets(bucketMap, currentWindow, maxBuckets);
		bucketMap.set(key, { window: currentWindow, count: 1 });
		return true;
	}

	if (current.count >= limit) {
		return false;
	}

	current.count += 1;
	bucketMap.set(key, current);
	return true;
}

function pruneRateBuckets(bucketMap, currentWindow, maxBuckets) {
	for (const [key, bucket] of bucketMap.entries()) {
		if (!bucket || bucket.window < currentWindow) {
			bucketMap.delete(key);
		}
	}

	if (!Number.isFinite(maxBuckets) || maxBuckets <= 0) {
		return;
	}

	while (bucketMap.size >= maxBuckets) {
		const oldestKey = bucketMap.keys().next().value;
		if (oldestKey === undefined) {
			return;
		}
		bucketMap.delete(oldestKey);
	}
}

module.exports = {
	providerCatalog,
	createServerRuntime
};
