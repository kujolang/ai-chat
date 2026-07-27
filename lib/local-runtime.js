const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_MAX_READ_CHARS = 64000;
const DEFAULT_MAX_OUTPUT_CHARS = 64000;
const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_SHELL_ALLOWLIST = ["git", "rg", "ls", "pwd"];

const readableExtensions = new Set([
	".md", ".markdown", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml",
	".js", ".ts", ".tsx", ".jsx", ".py", ".sh", ".kujo", ".css", ".html", ".csv", ".tsv"
]);
const readableExtensionList = Object.freeze([...readableExtensions].sort());

const sensitiveNamePatterns = [
	/^\.env(?:\.|$)/i,
	/^\.npmrc$/i,
	/^\.pypirc$/i,
	/^\.netrc$/i,
	/^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
	/secret/i,
	/token/i,
	/password/i,
	/credential/i,
	/private[_-]?key/i
];

function createLocalRuntime(options = {}) {
	const env = options.env || process.env;
	const projectRoot = path.resolve(options.projectRoot || process.cwd());
	const homeDir = options.homeDir || os.homedir();
	const spawnFn = options.spawnFn || spawn;
	const enabled = parseBoolean(env.AI_CHAT_LOCAL_TOOLS_ENABLED, false);
	const writeEnabled = enabled && parseBoolean(env.AI_CHAT_LOCAL_WRITE_ENABLED, false);
	const shellEnabled = enabled && parseBoolean(env.AI_CHAT_LOCAL_SHELL_ENABLED, false);
	const shellAllowlist = parseCsv(env.AI_CHAT_LOCAL_SHELL_ALLOWLIST || DEFAULT_SHELL_ALLOWLIST.join(","));
	const maxReadChars = clampInteger(env.AI_CHAT_LOCAL_MAX_READ_CHARS, 1000, 200000, DEFAULT_MAX_READ_CHARS);
	const maxOutputChars = clampInteger(env.AI_CHAT_LOCAL_MAX_OUTPUT_CHARS, 1000, 200000, DEFAULT_MAX_OUTPUT_CHARS);
	const maxEntries = clampInteger(env.AI_CHAT_LOCAL_MAX_ENTRIES, 1, 1000, DEFAULT_MAX_ENTRIES);
	const commandTimeoutMs = clampInteger(env.AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS, 1000, 120000, DEFAULT_TIMEOUT_MS);
	const roots = enabled ? normalizeWorkspaceRoots({
		projectRoot,
		homeDir,
		configuredRoots: env.AI_CHAT_LOCAL_WORKSPACE_ROOTS
	}) : [];
	const byId = new Map(roots.map((root) => [root.id, root]));

	function listWorkspaces() {
		return {
			workspaces: roots.map(publicRoot),
			meta: status()
		};
	}

	function listFiles(rawArguments = {}) {
		const args = normalizeListFilesArguments(rawArguments, maxEntries);
		const root = workspaceById(args.root_id);
		const dir = resolvePathForRead(root, args.path, { allowDirectory: true });
		const entries = fs.readdirSync(dir, { withFileTypes: true })
			.filter((entry) => !shouldHideEntry(entry.name))
			.map((entry) => {
				const target = path.join(dir, entry.name);
				const stat = safeStat(target);
				return {
					name: entry.name,
					path: path.relative(root.path, target).split(path.sep).join("/"),
					type: entry.isDirectory() ? "directory" : (entry.isFile() ? "file" : "other"),
					size: stat && stat.isFile() ? stat.size : 0
				};
			})
			.sort((a, b) => `${a.type === "directory" ? "0" : "1"}:${a.name}`.localeCompare(`${b.type === "directory" ? "0" : "1"}:${b.name}`))
			.slice(0, args.max_entries);
		return {
			workspace: publicRoot(root),
			path: path.relative(root.path, dir).split(path.sep).join("/") || ".",
			entries,
			truncated: entries.length >= args.max_entries
		};
	}

	function readFile(rawArguments = {}) {
		const args = normalizeReadFileArguments(rawArguments, maxReadChars);
		const root = workspaceById(args.root_id);
		const file = resolvePathForRead(root, args.path, { allowDirectory: false });
		if (!isReadableLocalFile(file)) {
			throw localError("local_file_not_readable", "Only bounded non-sensitive text files inside a configured workspace can be read.");
		}
		const content = readBoundedText(file, Math.min(args.max_chars, maxReadChars));
		return {
			workspace: publicRoot(root),
			path: path.relative(root.path, file).split(path.sep).join("/"),
			content,
			truncated: content.length >= Math.min(args.max_chars, maxReadChars)
		};
	}

	function writeFile(rawArguments = {}) {
		if (!writeEnabled) {
			throw localError("local_write_disabled", "Local file writes require AI_CHAT_LOCAL_WRITE_ENABLED=1.");
		}
		const args = normalizeWriteFileArguments(rawArguments);
		const root = workspaceById(args.root_id);
		const file = resolvePathForWrite(root, args.path);
		if (isSensitivePath(file) || !readableExtensions.has(path.extname(file).toLowerCase())) {
			throw localError("local_file_write_blocked", `Local writes are limited to non-sensitive text files with known extensions. Allowed: ${readableExtensionList.join(", ")}.`);
		}
		const exists = fs.existsSync(file);
		if (args.mode === "create" && exists) {
			throw localError("local_file_exists", "The target file already exists.");
		}
		if (args.mode !== "create" && !exists && !args.create_dirs) {
			throw localError("local_file_missing", "The target file does not exist.");
		}
		if (args.create_dirs) {
			try {
				fs.mkdirSync(path.dirname(file), { recursive: true });
			} catch (error) {
				throw mapFsError(error, "local_file_write_failed", "Could not create the target directory for the write.");
			}
		}
		const content = String(args.content || "");
		if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
			throw localError("local_file_too_large", "Local write content exceeds the per-file limit.");
		}
		try {
			if (args.mode === "append") {
				fs.appendFileSync(file, content, "utf8");
			} else {
				fs.writeFileSync(file, content, "utf8");
			}
		} catch (error) {
			throw mapFsError(error, "local_file_write_failed", "The file could not be written.");
		}
		const stat = fs.statSync(file);
		return {
			ok: true,
			workspace: publicRoot(root),
			path: path.relative(root.path, file).split(path.sep).join("/"),
			mode: args.mode,
			size: stat.size
		};
	}

	async function runCommand(rawArguments = {}, context = {}) {
		if (!shellEnabled) {
			throw localError("local_shell_disabled", "Local command execution requires AI_CHAT_LOCAL_SHELL_ENABLED=1.");
		}
		const args = normalizeCommandArguments(rawArguments);
		const root = workspaceById(args.root_id);
		const cwd = resolvePathForRead(root, args.cwd || ".", { allowDirectory: true });
		if (!shellAllowlist.includes(args.command)) {
			throw localError("local_shell_command_blocked", `The requested command is not in the allowlist. Allowed commands: ${shellAllowlist.join(", ")}.`);
		}
		return executeCommand({
			spawnFn,
			command: args.command,
			args: args.args,
			cwd,
			timeoutMs: Math.min(args.timeout_ms, commandTimeoutMs),
			maxOutputChars,
			signal: context.signal,
			root
		});
	}

	function workspaceById(id) {
		const root = byId.get(String(id || "").trim());
		if (!root) {
			throw localError("local_workspace_not_found", "The requested workspace is not configured.");
		}
		return root;
	}

	function status() {
		return {
			enabled,
			available: enabled && roots.length > 0,
			write_enabled: writeEnabled,
			shell_enabled: shellEnabled,
			workspace_count: roots.length,
			workspaces: roots.map(publicRoot),
			shell_allowlist: shellAllowlist,
			limits: {
				max_read_chars: maxReadChars,
				max_output_chars: maxOutputChars,
				max_entries: maxEntries,
				command_timeout_ms: commandTimeoutMs
			}
		};
	}

	return {
		canExecute: () => enabled && roots.length > 0,
		status,
		listWorkspaces,
		listFiles,
		readFile,
		writeFile,
		runCommand
	};
}

function executeCommand({ spawnFn, command, args, cwd, timeoutMs, maxOutputChars, signal, root }) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const child = spawnFn(command, args, {
			cwd,
			shell: false,
			windowsHide: true,
			env: commandEnvironment()
		});
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeoutMs);
		const cleanupAbort = pipeAbort(signal, child);
		child.stdout.on("data", (chunk) => {
			stdout = appendBounded(stdout, chunk, maxOutputChars);
		});
		child.stderr.on("data", (chunk) => {
			stderr = appendBounded(stderr, chunk, maxOutputChars);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			cleanupAbort();
			reject(localError("local_shell_failed", error.message || "Local command failed to start."));
		});
		child.on("close", (code, signalName) => {
			clearTimeout(timer);
			cleanupAbort();
			if (timedOut) {
				reject(localError("local_shell_timeout", "Local command timed out."));
				return;
			}
			resolve({
				command,
				args,
				cwd: path.relative(root.path, cwd).split(path.sep).join("/") || ".",
				exit_code: Number(code || 0),
				signal: signalName || null,
				stdout,
				stderr,
				truncated: stdout.length >= maxOutputChars || stderr.length >= maxOutputChars
			});
		});
	});
}

function normalizeWorkspaceRoots({ projectRoot, homeDir, configuredRoots }) {
	const candidates = parsePathList(configuredRoots);
	const roots = candidates.length > 0 ? candidates : [projectRoot];
	const seen = new Set();
	const out = [];
	for (const candidate of roots) {
		const resolved = path.resolve(expandHome(candidate, homeDir));
		let real = "";
		try {
			const stat = fs.statSync(resolved);
			if (!stat.isDirectory()) continue;
			real = fs.realpathSync(resolved);
		} catch (error) {
			continue;
		}
		const key = real.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			id: `workspace_${out.length}`,
			path: real,
			label: labelForRoot(real, homeDir)
		});
	}
	return out;
}

function resolvePathForRead(root, requestedPath, options = {}) {
	const target = safeResolveUnder(root.path, requestedPath || ".");
	if (!target) {
		throw localError("local_path_blocked", `The requested path escapes the configured workspace (${root.label}).`);
	}
	if (isSensitivePath(target)) {
		throw localError("local_path_sensitive", "Sensitive local paths are not exposed to chat tools.");
	}
	const stat = safeStat(target);
	if (!stat) {
		throw localError("local_path_not_found", "The requested path does not exist.");
	}
	if (stat.isDirectory() && options.allowDirectory) return target;
	if (stat.isFile() && !options.allowDirectory) return target;
	const requiredType = options.allowDirectory ? "directory" : "file";
	const actualType = stat.isDirectory() ? "directory" : "file";
	throw localError("local_path_type_mismatch", `The path is a ${actualType} but this operation requires a ${requiredType}.`);
}

function resolvePathForWrite(root, requestedPath) {
	const text = String(requestedPath || "").trim();
	if (!text || path.isAbsolute(text)) {
		throw localError("local_path_blocked", "Local writes require a relative path inside a configured workspace.");
	}
	const normalized = path.normalize(text);
	if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
		throw localError("local_path_blocked", "The requested path escapes the configured workspace.");
	}
	const target = path.resolve(root.path, normalized);
	const relative = path.relative(root.path, target);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw localError("local_path_blocked", "The requested path escapes the configured workspace.");
	}
	return target;
}

function safeResolveUnder(root, requestedPath) {
	const rootReal = fs.realpathSync(root);
	let targetReal = "";
	try {
		targetReal = fs.realpathSync(path.resolve(rootReal, String(requestedPath || ".")));
	} catch (error) {
		return null;
	}
	const relative = path.relative(rootReal, targetReal);
	if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return targetReal;
	return null;
}

function isReadableLocalFile(file) {
	const stat = safeStat(file);
	if (!stat || !stat.isFile() || stat.size > MAX_FILE_BYTES || isSensitivePath(file)) return false;
	return readableExtensions.has(path.extname(file).toLowerCase());
}

function isSensitivePath(file) {
	return file.split(path.sep).some((part) => sensitiveNamePatterns.some((pattern) => pattern.test(part)));
}

function shouldHideEntry(name) {
	return name === "node_modules" || name === ".git" || name === "data" || sensitiveNamePatterns.some((pattern) => pattern.test(name));
}

function readBoundedText(file, maxChars) {
	const fd = fs.openSync(file, "r");
	try {
		const buffer = Buffer.alloc(Math.min(MAX_FILE_BYTES, Math.max(1024, maxChars * 4)));
		const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
		return buffer.subarray(0, bytesRead).toString("utf8").replace(/\u0000/g, "").slice(0, maxChars);
	} finally {
		fs.closeSync(fd);
	}
}

function normalizeListFilesArguments(value, fallbackMaxEntries) {
	const args = normalizeObjectArguments(value);
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		path: boundedText(args.path || ".", 500),
		max_entries: clampInteger(args.max_entries, 1, fallbackMaxEntries, Math.min(100, fallbackMaxEntries))
	};
}

function normalizeReadFileArguments(value, fallbackMaxChars) {
	const args = normalizeObjectArguments(value);
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		path: boundedText(args.path, 500),
		max_chars: clampInteger(args.max_chars, 1000, fallbackMaxChars, fallbackMaxChars)
	};
}

function normalizeWriteFileArguments(value) {
	const args = normalizeObjectArguments(value);
	const mode = String(args.mode || "create").trim().toLowerCase();
	if (!["create", "overwrite", "append"].includes(mode)) {
		throw localError("invalid_tool_arguments", "local_file_write.mode must be create, overwrite, or append.");
	}
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		path: boundedText(args.path, 500),
		content: String(args.content || ""),
		mode,
		create_dirs: Boolean(args.create_dirs)
	};
}

function normalizeCommandArguments(value) {
	const args = normalizeObjectArguments(value);
	const command = boundedText(args.command, 120).replace(/[\/\\]/g, "");
	if (!command) {
		throw localError("invalid_tool_arguments", "local_shell.command is required.");
	}
	if (!Array.isArray(args.args) || args.args.length > 40) {
		throw localError("invalid_tool_arguments", "local_shell.args must be an array of at most 40 strings.");
	}
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		cwd: boundedText(args.cwd || ".", 500),
		command,
		args: args.args.map((entry) => boundedText(entry, 1000)),
		timeout_ms: clampInteger(args.timeout_ms, 1000, 120000, DEFAULT_TIMEOUT_MS)
	};
}

function normalizeObjectArguments(value) {
	if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
	const text = String(value || "").trim();
	if (!text) return {};
	try {
		const parsed = JSON.parse(text);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
	} catch (error) {
		// Use the stable invalid-arguments error below.
	}
	throw localError("invalid_tool_arguments", "The provider returned invalid JSON tool arguments.");
}

function commandEnvironment() {
	const allowed = {};
	for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TERM"]) {
		if (process.env[key]) allowed[key] = process.env[key];
	}
	allowed.CI = "1";
	return allowed;
}

function pipeAbort(signal, child) {
	if (!signal) return () => {};
	if (signal.aborted) {
		child.kill("SIGTERM");
		return () => {};
	}
	const onAbort = () => child.kill("SIGTERM");
	signal.addEventListener("abort", onAbort, { once: true });
	return () => signal.removeEventListener("abort", onAbort);
}

function appendBounded(current, chunk, maxChars) {
	const next = current + String(chunk || "");
	return next.length > maxChars ? next.slice(0, maxChars) : next;
}

function publicRoot(root) {
	return { id: root.id, label: root.label };
}

function safeStat(file) {
	try {
		return fs.statSync(file);
	} catch (error) {
		return null;
	}
}

function parsePathList(value) {
	return String(value || "")
		.split(new RegExp(`[${escapeRegExp(path.delimiter)},]`))
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseCsv(value) {
	return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function expandHome(value, homeDir) {
	const text = String(value || "").trim();
	if (text === "~") return homeDir;
	if (text.startsWith("~/")) return path.join(homeDir, text.slice(2));
	return text;
}

function labelForRoot(root, homeDir) {
	const relative = path.relative(homeDir, root);
	return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
		? `~/${relative.split(path.sep).join("/")}`
		: path.basename(root);
}

function boundedText(value, maxLength) {
	return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampInteger(value, min, max, fallback) {
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function parseBoolean(value, fallbackValue) {
	if (value === undefined || value === null || value === "") return fallbackValue;
	const text = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(text)) return true;
	if (["0", "false", "no", "off"].includes(text)) return false;
	return fallbackValue;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapFsError(error, fallbackCode, fallbackMessage) {
	if (!error || !error.code) return localError(fallbackCode, fallbackMessage);
	const fsCode = String(error.code).toUpperCase();
	if (fsCode === "ENOENT") return localError("local_file_missing", "The target file or directory does not exist.");
	if (fsCode === "EACCES" || fsCode === "EPERM") return localError("local_file_write_blocked", "Permission denied for the target file or directory.");
	if (fsCode === "ENOSPC") return localError("local_file_too_large", "The filesystem is full.");
	if (fsCode === "EISDIR") return localError("local_path_type_mismatch", "The target path is a directory, but this operation requires a file.");
	return localError(fallbackCode, `${fallbackMessage} (${fsCode})`);
}

// Error codes that represent permanent conditions — the same call will not
// succeed without changing arguments, workspace, or environmental state.
const permanentLocalErrorCodes = new Set([
	"local_path_not_found",
	"local_workspace_not_found",
	"local_shell_command_blocked",
	"local_shell_disabled",
	"local_file_not_readable",
	"local_path_blocked",
	"local_path_sensitive",
	"local_path_type_mismatch",
	"local_file_write_blocked",
	"local_file_exists",
	"local_file_missing",
	"local_file_too_large",
	"local_write_disabled",
	"invalid_tool_arguments"
]);

// Error codes that represent transient conditions — a retry may succeed
// without changing the request, though a hint may guide a better approach.
const transientLocalErrorCodes = new Set([
	"local_shell_timeout"
]);

function localError(code, message) {
	const error = new Error(message);
	error.code = code;
	if (permanentLocalErrorCodes.has(code)) {
		error.retryable = false;
	} else if (transientLocalErrorCodes.has(code)) {
		error.retryable = true;
		if (code === "local_shell_timeout") {
			error.retry_hint = "The command timed out. Try a shorter command, simplify arguments, or increase the timeout.";
		}
	}
	return error;
}

module.exports = {
	createLocalRuntime,
	localError
};
