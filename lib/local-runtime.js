const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");

const DEFAULT_MAX_READ_CHARS = 64000;
const DEFAULT_MAX_READ_LINES = 2000;
const DEFAULT_MAX_READ_BYTES = 128 * 1024;
const DEFAULT_MAX_LINE_CHARS = 2000;
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
		const matchingEntries = fs.readdirSync(dir, { withFileTypes: true })
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
			.sort((a, b) => `${a.type === "directory" ? "0" : "1"}:${a.name}`.localeCompare(`${b.type === "directory" ? "0" : "1"}:${b.name}`));
		const entries = matchingEntries.slice(0, args.max_entries);
		return {
			workspace: publicRoot(root),
			path: path.relative(root.path, dir).split(path.sep).join("/") || ".",
			entries,
			truncated: matchingEntries.length > args.max_entries
		};
	}

	function readFile(rawArguments = {}, context = {}) {
		const args = normalizeReadFileArguments(rawArguments, maxReadChars);
		const root = workspaceById(args.root_id);
		const file = resolvePathForRead(root, args.path, { allowDirectory: false, suggest: true });
		if (!isReadableLocalFile(file)) {
			throw localError("local_file_not_readable", "Only bounded non-sensitive text files inside a configured workspace can be read.");
		}
		const stat = fs.statSync(file);
		const requestState = localRequestState(context);
		const cacheKey = readCacheKey(file, stat, args);
		const cached = requestState && requestState.readCache.get(cacheKey);
		if (cached) {
			requestState.readCache.delete(cacheKey);
			return {
				workspace: publicRoot(root),
				path: path.relative(root.path, file).split(path.sep).join("/"),
				content: "",
				note: "This exact unchanged file window was already returned earlier in this request. The deduplication record was consumed; retry once to receive the content again if the earlier result is no longer in context.",
				unchanged: true,
				deduplicated: true,
				truncated: cached.truncated,
				complete: cached.complete,
				next_offset: cached.next_offset,
				next_column: cached.next_column,
				meta: { ...cached.meta, deduplicated: true, cache: "consume_on_hit" }
			};
		}
		const window = readTextWindow(file, {
			offset: args.offset,
			column: args.column,
			limit: args.limit,
			maxChars: Math.min(args.max_chars, maxReadChars),
			maxBytes: args.max_bytes,
			maxLineChars: args.max_line_chars
		});
		const result = {
			workspace: publicRoot(root),
			path: path.relative(root.path, file).split(path.sep).join("/"),
			...window
		};
		if (requestState) {
			const existing = requestState.ledger.get(file);
			const unchanged = existing && existing.mtime_ms === stat.mtimeMs && existing.size === stat.size;
			const beginsCoverage = args.offset === 1 && args.column === 1;
			const continuesCoverage = unchanged && !existing.complete
				&& existing.next_offset === args.offset && existing.next_column === args.column;
			const reachesEof = !result.truncated && !result.meta.past_eof;
			const coverageComplete = Boolean((beginsCoverage || continuesCoverage) && reachesEof);
			if (coverageComplete) result.complete = true;
			requestState.readCache.set(cacheKey, {
				truncated: result.truncated,
				complete: result.complete,
				next_offset: result.next_offset,
				next_column: result.next_column,
				meta: result.meta
			});
			if (beginsCoverage || continuesCoverage || !unchanged) {
				requestState.ledger.set(file, {
					complete: coverageComplete,
					mtime_ms: stat.mtimeMs,
					size: stat.size,
					hash: coverageComplete ? hashFileSync(file) : "",
					next_offset: result.next_offset,
					next_column: result.next_column
				});
			}
		}
		return result;
	}

	function writeFile(rawArguments = {}, context = {}) {
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
		const requestState = localRequestState(context);
		if (exists && args.mode === "overwrite" && context.enforceReadLedger) {
			const record = requestState && requestState.ledger.get(file);
			if (!record) {
				throw localError("local_file_not_read", "This file must be read completely before it can be overwritten.", {
					retry_hint: "Read the file from offset 1 and column 1 until complete=true, then retry the overwrite."
				});
			}
			if (!record.complete) {
				throw localError("local_file_partially_read", "Only part of this file has been read, so overwriting it could destroy unseen content.", {
					retry_hint: "Continue from next_offset/next_column until the complete file has been inspected, then retry the overwrite."
				});
			}
			if (record.hash !== hashFileSync(file)) {
				throw localError("local_file_changed_since_read", "The file changed after it was read, so the overwrite was refused.", {
					retry_hint: "Read the current file again before retrying the overwrite."
				});
			}
		}
		if (args.mode === "create" && exists) {
			throw localError("local_file_exists", "The target file already exists.");
		}
		if (args.mode === "overwrite" && !exists) {
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
		const contentBytes = Buffer.byteLength(content, "utf8");
		const resultingBytes = args.mode === "append" && exists ? fs.statSync(file).size + contentBytes : contentBytes;
		if (resultingBytes > MAX_FILE_BYTES) {
			throw localError("local_file_too_large", "The resulting local file would exceed the per-file limit.");
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
		if (requestState) {
			requestState.ledger.delete(file);
			for (const key of requestState.readCache.keys()) {
				if (key.startsWith(`${file}\u0000`)) requestState.readCache.delete(key);
			}
		}
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
				default_read_lines: DEFAULT_MAX_READ_LINES,
				default_read_bytes: DEFAULT_MAX_READ_BYTES,
				default_line_chars: DEFAULT_MAX_LINE_CHARS,
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
		let aborted = false;
		let outputChars = 0;
		let outputTruncated = false;
		let forceKillTimer = null;
		const child = spawnFn(command, args, {
			cwd,
			shell: false,
			windowsHide: true,
			env: commandEnvironment()
		});
		if (child.stdout && typeof child.stdout.setEncoding === "function") child.stdout.setEncoding("utf8");
		if (child.stderr && typeof child.stderr.setEncoding === "function") child.stderr.setEncoding("utf8");
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
		}, timeoutMs);
		let cleanupAbort = () => {};
		child.stdout.on("data", (chunk) => {
			const appended = appendWithinBudget(stdout, chunk, maxOutputChars - outputChars);
			stdout = appended.value;
			outputChars += appended.added;
			outputTruncated = outputTruncated || appended.truncated;
		});
		child.stderr.on("data", (chunk) => {
			const appended = appendWithinBudget(stderr, chunk, maxOutputChars - outputChars);
			stderr = appended.value;
			outputChars += appended.added;
			outputTruncated = outputTruncated || appended.truncated;
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			cleanupAbort();
			reject(localError("local_shell_failed", error.message || "Local command failed to start."));
		});
		child.on("close", (code, signalName) => {
			clearTimeout(timer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			cleanupAbort();
			if (timedOut) {
				reject(localError("local_shell_timeout", "Local command timed out."));
				return;
			}
			if (aborted) {
				reject(localError("local_shell_aborted", "Local command execution was cancelled."));
				return;
			}
			resolve({
				command,
				args,
				cwd: path.relative(root.path, cwd).split(path.sep).join("/") || ".",
				exit_code: code === null || code === undefined ? null : Number(code),
				signal: signalName || null,
				stdout,
				stderr,
				truncated: outputTruncated
			});
		});
		cleanupAbort = pipeAbort(signal, child, () => { aborted = true; });
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
	const text = String(requestedPath || ".").trim() || ".";
	const lexicalTarget = path.resolve(root.path, text);
	if (!isPathInside(root.path, lexicalTarget)) {
		throw localError("local_path_blocked", `The requested path escapes the configured workspace (${root.label}).`);
	}
	if (isBlockedDevicePath(lexicalTarget)) {
		throw localError("local_path_blocked", "Device, process-descriptor, and unbounded pseudo-files cannot be opened by local tools.");
	}
	let target = safeResolveUnder(root.path, text);
	if (!target && options.suggest) {
		for (const candidate of unicodePathCandidates(text)) {
			target = safeResolveUnder(root.path, candidate);
			if (target) break;
		}
	}
	if (!target) {
		const suggestion = options.suggest ? suggestNearbyPath(root.path, text) : "";
		throw localError("local_path_not_found", "The requested path does not exist.", suggestion ? {
			retry_hint: `Did you mean ${suggestion}? Retry with that relative path.`
		} : {});
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
	const existingAnchor = nearestExistingPath(fs.existsSync(target) ? target : path.dirname(target));
	let realAnchor = "";
	try {
		realAnchor = fs.realpathSync(existingAnchor);
	} catch (error) {
		throw localError("local_path_blocked", "The target path could not be safely resolved inside the configured workspace.");
	}
	if (!isPathInside(fs.realpathSync(root.path), realAnchor)) {
		throw localError("local_path_blocked", "The requested path escapes the configured workspace through a symbolic link.");
	}
	return target;
}

function nearestExistingPath(value) {
	let current = path.resolve(value);
	while (!fs.existsSync(current)) {
		const parent = path.dirname(current);
		if (parent === current) return current;
		current = parent;
	}
	return current;
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

function isPathInside(root, target) {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isBlockedDevicePath(file) {
	const normalized = path.resolve(file).split(path.sep).join("/");
	if (["/dev/zero", "/dev/urandom", "/dev/random", "/dev/stdin", "/dev/fd/0"].includes(normalized)) return true;
	if (/^\/proc\/\d+\/fd\/\d+(?:\/|$)/.test(normalized)) return true;
	return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(path.basename(file));
}

function unicodePathCandidates(value) {
	const original = String(value || "");
	const variants = [
		original.normalize("NFC"),
		original.normalize("NFD"),
		original.replaceAll("\u202f", " "),
		original.replace(/ (?=(?:AM|PM)(?:\.|$))/gi, "\u202f"),
		original.replace(/[‘’]/g, "'"),
		original.replaceAll("'", "’"),
		original.normalize("NFD").replace(/[‘’]/g, "'")
	];
	return [...new Set(variants)].filter((entry) => entry !== original).slice(0, 7);
}

function suggestNearbyPath(root, requestedPath) {
	const requested = path.resolve(root, String(requestedPath || ""));
	const parent = path.dirname(requested);
	if (!isPathInside(root, parent)) return "";
	let names = [];
	try {
		names = fs.readdirSync(parent).filter((name) => !shouldHideEntry(name)).slice(0, 500);
	} catch (error) {
		return "";
	}
	const wanted = path.basename(requested);
	const wantedLower = wanted.toLowerCase();
	const ranked = names.map((name) => ({
		name,
		distance: boundedLevenshtein(wantedLower, name.toLowerCase(), 2),
		substring: name.toLowerCase().includes(wantedLower) || wantedLower.includes(name.toLowerCase())
	})).filter((entry) => entry.substring || entry.distance <= 2)
		.sort((a, b) => Number(b.substring) - Number(a.substring) || a.distance - b.distance || a.name.localeCompare(b.name));
	if (!ranked.length) return "";
	return path.relative(root, path.join(parent, ranked[0].name)).split(path.sep).join("/");
}

function boundedLevenshtein(left, right, maxDistance) {
	if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let row = 1; row <= left.length; row += 1) {
		const current = [row];
		let rowMin = row;
		for (let column = 1; column <= right.length; column += 1) {
			const cost = left[row - 1] === right[column - 1] ? 0 : 1;
			current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + cost);
			rowMin = Math.min(rowMin, current[column]);
		}
		if (rowMin > maxDistance) return maxDistance + 1;
		previous = current;
	}
	return previous[right.length];
}

function isReadableLocalFile(file) {
	const stat = safeStat(file);
	if (!stat || !stat.isFile() || isSensitivePath(file) || isBlockedDevicePath(file)) return false;
	if (!readableExtensions.has(path.extname(file).toLowerCase())) return false;
	return !hasBinaryNulPrefix(file);
}

function isSensitivePath(file) {
	return file.split(path.sep).some((part) => sensitiveNamePatterns.some((pattern) => pattern.test(part)));
}

function shouldHideEntry(name) {
	return name === "node_modules" || name === ".git" || name === "data" || sensitiveNamePatterns.some((pattern) => pattern.test(name));
}

function hasBinaryNulPrefix(file) {
	const fd = fs.openSync(file, "r");
	try {
		const buffer = Buffer.alloc(8192);
		const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
		return buffer.subarray(0, bytesRead).includes(0);
	} finally {
		fs.closeSync(fd);
	}
}

function readTextWindow(file, options) {
	const stat = fs.statSync(file);
	if (stat.size === 0) {
		return {
			content: "",
			note: "This file is empty.",
			truncated: false,
			complete: options.offset === 1 && options.column === 1,
			next_offset: null,
			next_column: null,
			meta: readMeta(stat, { empty: true, linesReturned: 0, linesScanned: 0, returnedBytes: 0, truncationReason: null, clampedLines: [] })
		};
	}
	const fd = fs.openSync(file, "r");
	const decoder = new StringDecoder("utf8");
	const buffer = Buffer.alloc(64 * 1024);
	const output = [];
	const clampedLines = [];
	let lineNumber = 1;
	let columnNumber = 0;
	let lineText = "";
	let lineShownChars = 0;
	let lineOmittedChars = 0;
	let linesReturned = 0;
	let linesScanned = 0;
	let returnedBytes = 0;
	let returnedChars = 0;
	let truncationReason = null;
	let nextOffset = null;
	let nextColumn = null;
	let pendingCr = false;
	let pendingLineLimit = false;
	let stopped = false;
	let firstCodePoint = true;

	const inWindow = () => lineNumber > options.offset || (lineNumber === options.offset && columnNumber >= options.column);
	const finishLine = (terminated) => {
		const finishedLine = lineNumber;
		const startColumn = lineNumber === options.offset ? options.column : 1;
		const shownChars = lineShownChars;
		const wasClamped = lineOmittedChars > 0;
		linesScanned = Math.max(linesScanned, lineNumber);
		if (lineNumber >= options.offset && linesReturned < options.limit) {
			let rendered = lineText;
			if (wasClamped) {
				rendered += `… [${lineOmittedChars} chars omitted; resume at column ${startColumn + lineShownChars}]`;
				clampedLines.push({ line: lineNumber, shown_chars: lineShownChars, omitted_chars: lineOmittedChars, next_column: startColumn + lineShownChars });
			}
			output.push(`${lineNumber}\t${rendered}`);
			linesReturned += 1;
		}
		lineText = "";
		lineShownChars = 0;
		lineOmittedChars = 0;
		columnNumber = 0;
		if (terminated) lineNumber += 1;
		if (wasClamped && !truncationReason) {
			truncationReason = "line_character_limit";
			nextOffset = finishedLine;
			nextColumn = startColumn + shownChars;
			stopped = true;
			return;
		}
		if (linesReturned >= options.limit) pendingLineLimit = true;
	};
	const acceptCodePoint = (character) => {
		if (firstCodePoint) {
			firstCodePoint = false;
			if (character === "\uFEFF") return;
		}
		if (pendingLineLimit) {
			truncationReason = "line_limit";
			nextOffset = lineNumber;
			nextColumn = 1;
			stopped = true;
			return;
		}
		if (character === "\n") {
			finishLine(true);
			return;
		}
		columnNumber += 1;
		if (!inWindow() || linesReturned >= options.limit) return;
		const charBytes = Buffer.byteLength(character, "utf8");
		if (returnedBytes + charBytes > options.maxBytes || returnedChars + character.length > options.maxChars) {
			truncationReason = returnedBytes + charBytes > options.maxBytes ? "byte_limit" : "character_limit";
			nextOffset = lineNumber;
			nextColumn = columnNumber;
			stopped = true;
			return;
		}
		if (lineShownChars < options.maxLineChars) {
			lineText += character;
			lineShownChars += 1;
			returnedBytes += charBytes;
			returnedChars += character.length;
		} else {
			lineOmittedChars += 1;
		}
	};
	const processText = (text) => {
		for (const character of text) {
			if (stopped) break;
			if (pendingCr) {
				pendingCr = false;
				acceptCodePoint("\n");
				if (stopped) break;
				if (character === "\n") continue;
			}
			if (character === "\r") {
				pendingCr = true;
				continue;
			}
			acceptCodePoint(character);
		}
	};
	try {
		while (!stopped) {
			const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;
			processText(decoder.write(buffer.subarray(0, bytesRead)));
		}
		if (!stopped) processText(decoder.end());
		if (!stopped && pendingCr) acceptCodePoint("\n");
		if (!stopped && (columnNumber > 0 || lineNumber === options.offset)) finishLine(false);
		if (stopped && lineNumber >= options.offset && linesReturned < options.limit && (lineText || lineShownChars || lineOmittedChars)) finishLine(false);
	} finally {
		fs.closeSync(fd);
	}
	const pastEof = linesReturned === 0 && options.offset > linesScanned;
	const complete = !stopped && options.offset === 1 && options.column === 1;
	return {
		content: output.join("\n"),
		...(pastEof ? { note: `Offset ${options.offset} is beyond the end of the file (${linesScanned} lines scanned). Retry with a smaller offset.` } : {}),
		truncated: Boolean(truncationReason),
		complete,
		next_offset: nextOffset,
		next_column: nextColumn,
		meta: readMeta(stat, { empty: false, linesReturned, linesScanned, returnedBytes, truncationReason, clampedLines, pastEof })
	};
}

function readMeta(stat, { empty, linesReturned, linesScanned, returnedBytes, truncationReason, clampedLines, pastEof = false }) {
	return {
		source_bytes: stat.size,
		returned_bytes: returnedBytes,
		lines_returned: linesReturned,
		lines_scanned: linesScanned,
		empty,
		past_eof: pastEof,
		truncation_reason: truncationReason,
		clamped_lines: clampedLines,
		mtime_ms: stat.mtimeMs
	};
}

function hashFileSync(file) {
	const hash = crypto.createHash("sha256");
	const fd = fs.openSync(file, "r");
	const buffer = Buffer.alloc(64 * 1024);
	try {
		while (true) {
			const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
			if (!bytesRead) break;
			hash.update(buffer.subarray(0, bytesRead));
		}
		return hash.digest("hex");
	} finally {
		fs.closeSync(fd);
	}
}

function localRequestState(context) {
	if (!context || !context.requestState || typeof context.requestState !== "object") return null;
	if (!context.requestState.localTools) {
		context.requestState.localTools = { readCache: new Map(), ledger: new Map() };
	}
	return context.requestState.localTools;
}

function readCacheKey(file, stat, args) {
	return [file, stat.mtimeMs, stat.size, args.offset, args.column, args.limit, args.max_chars, args.max_bytes, args.max_line_chars].join("\u0000");
}

function normalizeListFilesArguments(value, fallbackMaxEntries) {
	const args = normalizeObjectArguments(value);
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		path: boundedPath(args.path || ".", 500),
		max_entries: clampInteger(args.max_entries, 1, fallbackMaxEntries, Math.min(100, fallbackMaxEntries))
	};
}

function normalizeReadFileArguments(value, fallbackMaxChars) {
	const args = normalizeObjectArguments(value);
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		path: boundedPath(args.path, 500),
		offset: strictIntegerArgument(args.offset, "local_file_read.offset", 1, 100000000, 1),
		column: strictIntegerArgument(args.column, "local_file_read.column", 1, 100000000, 1),
		limit: strictIntegerArgument(args.limit, "local_file_read.limit", 1, 10000, DEFAULT_MAX_READ_LINES),
		max_chars: strictIntegerArgument(args.max_chars, "local_file_read.max_chars", 1000, fallbackMaxChars, fallbackMaxChars),
		max_bytes: strictIntegerArgument(args.max_bytes, "local_file_read.max_bytes", 1024, 512 * 1024, DEFAULT_MAX_READ_BYTES),
		max_line_chars: strictIntegerArgument(args.max_line_chars, "local_file_read.max_line_chars", 100, 20000, DEFAULT_MAX_LINE_CHARS)
	};
}

function strictIntegerArgument(value, label, min, max, fallback) {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
		throw localError("invalid_tool_arguments", `${label} must be an integer from ${min} to ${max}.`);
	}
	return parsed;
}

function normalizeWriteFileArguments(value) {
	const args = normalizeObjectArguments(value);
	const mode = String(args.mode || "create").trim().toLowerCase();
	if (!["create", "overwrite", "append"].includes(mode)) {
		throw localError("invalid_tool_arguments", "local_file_write.mode must be create, overwrite, or append.");
	}
	return {
		root_id: boundedText(args.root_id, 120) || "workspace_0",
		path: boundedPath(args.path, 500),
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
		cwd: boundedPath(args.cwd || ".", 500),
		command,
		args: args.args.map((entry) => String(entry === undefined || entry === null ? "" : entry).slice(0, 1000)),
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

function pipeAbort(signal, child, onAbort = () => {}) {
	if (!signal) return () => {};
	if (signal.aborted) {
		onAbort();
		child.kill("SIGTERM");
		return () => {};
	}
	const abortListener = () => {
		onAbort();
		child.kill("SIGTERM");
	};
	signal.addEventListener("abort", abortListener, { once: true });
	return () => signal.removeEventListener("abort", abortListener);
}

function appendWithinBudget(current, chunk, remainingChars) {
	const text = String(chunk || "");
	const available = Math.max(0, remainingChars);
	const addition = text.slice(0, available);
	return {
		value: current + addition,
		added: addition.length,
		truncated: text.length > available
	};
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

function boundedPath(value, maxLength) {
	const text = String(value || "").trim();
	if (text.length > maxLength) {
		throw localError("invalid_tool_arguments", `Local paths must be at most ${maxLength} characters.`);
	}
	return text;
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
	"local_file_not_read",
	"local_file_partially_read",
	"local_file_changed_since_read",
	"local_write_disabled",
	"invalid_tool_arguments"
]);

// Error codes that represent transient conditions — a retry may succeed
// without changing the request, though a hint may guide a better approach.
const transientLocalErrorCodes = new Set([
	"local_shell_timeout"
]);

function localError(code, message, options = {}) {
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
	if (options.retry_hint) error.retry_hint = String(options.retry_hint);
	return error;
}

module.exports = {
	createLocalRuntime,
	localError
};
