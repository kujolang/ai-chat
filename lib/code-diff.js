const Diff = require("diff");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_FILES = 48;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RENDERED_LINES = 4000;

function createCodeDiffTracker(options = {}) {
	const maxFiles = boundedInteger(options.maxFiles, 1, 200, DEFAULT_MAX_FILES);
	const maxFileBytes = boundedInteger(options.maxFileBytes, 1024, 2 * 1024 * 1024, DEFAULT_MAX_FILE_BYTES);
	const maxTotalBytes = boundedInteger(options.maxTotalBytes, maxFileBytes, 8 * 1024 * 1024, DEFAULT_MAX_TOTAL_BYTES);
	const maxRenderedLines = boundedInteger(options.maxRenderedLines, 100, 20000, DEFAULT_MAX_RENDERED_LINES);
	const files = new Map();
	let retainedBytes = 0;
	let truncated = false;

	function record(change = {}) {
		const filePath = normalizeDisplayPath(change.path);
		if (!filePath) return snapshot();
		const prior = files.get(filePath);
		if (!prior && files.size >= maxFiles) {
			truncated = true;
			return snapshot();
		}

		const before = prior ? prior.before : normalizeContent(change.before);
		const after = normalizeContent(change.after);
		const beforeBytes = textBytes(before);
		const afterBytes = textBytes(after);
		const nextBytes = beforeBytes + afterBytes;
		const previousBytes = prior ? prior.retainedBytes : 0;
		const binary = Boolean(change.binary) || hasNullByte(before) || hasNullByte(after);
		const oversized = beforeBytes > maxFileBytes || afterBytes > maxFileBytes || retainedBytes - previousBytes + nextBytes > maxTotalBytes;

		if (oversized || binary) {
			retainedBytes -= previousBytes;
			const entry = {
				path: filePath,
				before: null,
				after: null,
				retainedBytes: 0,
				source: normalizeSource(change.source || prior?.source),
				binary,
				truncated: oversized,
				status: inferStatus(before, after)
			};
			entry.rendered = renderFileDiff(entry, maxRenderedLines);
			files.set(filePath, entry);
			truncated = truncated || oversized;
			return snapshot();
		}

		retainedBytes = retainedBytes - previousBytes + nextBytes;
		const entry = {
			path: filePath,
			before,
			after,
			retainedBytes: nextBytes,
			source: normalizeSource(change.source || prior?.source),
			binary: false,
			truncated: false,
			status: inferStatus(before, after)
		};
		entry.rendered = renderFileDiff(entry, maxRenderedLines);
		files.set(filePath, entry);
		return snapshot();
	}

	function snapshot() {
		const renderedFiles = [];
		let additions = 0;
		let deletions = 0;
		let renderedLines = 0;
		let outputTruncated = truncated;

		for (const entry of files.values()) {
			if (!entry.binary && !entry.truncated && entry.before === entry.after) continue;
			const rendered = clipRenderedFile(entry.rendered, Math.max(0, maxRenderedLines - renderedLines));
			if (!rendered) continue;
			renderedLines += rendered.rendered_lines;
			additions += rendered.additions;
			deletions += rendered.deletions;
			outputTruncated = outputTruncated || rendered.truncated;
			delete rendered.rendered_lines;
			renderedFiles.push(rendered);
		}

		return {
			version: 1,
			files: renderedFiles,
			totals: { files: renderedFiles.length, additions, deletions },
			truncated: outputTruncated
		};
	}

	return { record, snapshot };
}

function clipRenderedFile(source, remainingLines) {
	if (!source || source.rendered_lines <= remainingLines) return source ? structuredClone(source) : null;
	let available = remainingLines;
	let additions = 0;
	let deletions = 0;
	const hunks = [];
	for (const hunk of source.hunks || []) {
		if (available <= 0) break;
		const lines = hunk.lines.slice(0, available);
		available -= lines.length;
		additions += lines.filter((line) => line.type === "add").length;
		deletions += lines.filter((line) => line.type === "delete").length;
		if (lines.length > 0) hunks.push({ ...hunk, lines });
	}
	return {
		...source,
		additions,
		deletions,
		hunks,
		truncated: true,
		rendered_lines: remainingLines - available
	};
}

function renderFileDiff(entry, remainingLines) {
	if (entry.binary || entry.truncated) {
		return {
			path: entry.path,
			status: entry.status,
			source: entry.source,
			additions: 0,
			deletions: 0,
			hunks: [],
			binary: entry.binary,
			truncated: entry.truncated || remainingLines <= 0,
			rendered_lines: 0
		};
	}

	const before = entry.before === null ? "" : entry.before;
	const after = entry.after === null ? "" : entry.after;
	const patch = Diff.structuredPatch(entry.path, entry.path, before, after, "before", "after", {
		context: 3,
		maxEditLength: 20000,
		timeout: 750
	});
	if (!patch) {
		return {
			path: entry.path,
			status: entry.status,
			source: entry.source,
			additions: 0,
			deletions: 0,
			hunks: [],
			binary: false,
			truncated: true,
			rendered_lines: 0
		};
	}

	let additions = 0;
	let deletions = 0;
	let renderedLines = 0;
	let outputTruncated = false;
	const hunks = [];
	for (const hunk of patch.hunks || []) {
		const lines = [];
		for (const rawLine of hunk.lines || []) {
			if (rawLine === "\\ No newline at end of file") continue;
			if (renderedLines >= remainingLines) {
				outputTruncated = true;
				break;
			}
			const marker = rawLine.charAt(0);
			const type = marker === "+" ? "add" : marker === "-" ? "delete" : "context";
			if (type === "add") additions += 1;
			if (type === "delete") deletions += 1;
			lines.push({ type, content: rawLine.slice(1) });
			renderedLines += 1;
		}
		if (lines.length > 0) {
			hunks.push({
				old_start: Number(hunk.oldStart || 0),
				old_lines: Number(hunk.oldLines || 0),
				new_start: Number(hunk.newStart || 0),
				new_lines: Number(hunk.newLines || 0),
				lines
			});
		}
		if (outputTruncated) break;
	}

	return {
		path: entry.path,
		status: entry.status,
		source: entry.source,
		additions,
		deletions,
		hunks,
		binary: false,
		truncated: outputTruncated,
		rendered_lines: renderedLines
	};
}

function normalizeContent(value) {
	if (value === null || value === undefined) return null;
	return String(value).replace(/\r\n/g, "\n");
}

function normalizeDisplayPath(value) {
	const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
	if (!normalized || normalized.includes("\u0000")) return "";
	return normalized.slice(0, 1000);
}

function normalizeSource(value) {
	return String(value || "agent").replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "agent";
}

function inferStatus(before, after) {
	if (before === null && after !== null) return "added";
	if (before !== null && after === null) return "deleted";
	return "modified";
}

function hasNullByte(value) {
	return typeof value === "string" && value.includes("\u0000");
}

function textBytes(value) {
	return value === null ? 0 : Buffer.byteLength(value, "utf8");
}

function boundedInteger(value, min, max, fallback) {
	const normalized = Number(value);
	return Number.isFinite(normalized) ? Math.max(min, Math.min(max, Math.floor(normalized))) : fallback;
}

function createNativeFileChangeObserver(workspaceRoot, onChange) {
	const lexicalRoot = path.resolve(workspaceRoot);
	let realRoot = lexicalRoot;
	try {
		realRoot = fs.realpathSync(lexicalRoot);
	} catch {
		// The workspace may disappear while a detached stream is winding down.
	}
	const roots = { lexicalRoot, realRoot };
	const pending = new Map();
	return (event) => {
		const item = event && event.item;
		if (!item || item.type !== "file_change" || !["item.started", "item.completed"].includes(event.type)) return;
		const itemId = String(item.id || "").slice(0, 160);
		if (!itemId) return;
		const changes = Array.isArray(item.changes) ? item.changes.slice(0, 48) : [];
		if (event.type === "item.started") {
			pending.set(itemId, changes.map((change) => nativeFileSnapshot(roots, change && change.path)));
			return;
		}
		const beforeSnapshots = pending.get(itemId) || changes.map((change) => nativeFileSnapshot(roots, change && change.path));
		pending.delete(itemId);
		for (let index = 0; index < changes.length; index += 1) {
			const before = beforeSnapshots[index];
			const after = nativeFileSnapshot(roots, changes[index] && changes[index].path);
			if (!before || !after || before.path !== after.path || before.blocked || after.blocked) continue;
		onChange({ path: after.path, before: before.content, after: after.content, source: "codex_file_change" });
		}
	};
}

function nativeFileSnapshot(roots, requestedPath) {
	const absolute = path.resolve(roots.lexicalRoot, String(requestedPath || ""));
	const relative = path.relative(roots.lexicalRoot, absolute).split(path.sep).join("/");
	if (!relative || relative.startsWith("../") || path.isAbsolute(relative) || sensitiveDiffPath(relative)) {
		return { path: relative, absolutePath: absolute, content: null, blocked: true };
	}
	try {
		const real = fs.realpathSync(absolute);
		const realRelative = path.relative(roots.realRoot, real);
		if (realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return { path: relative, absolutePath: absolute, content: null, blocked: true };
		const stat = fs.statSync(real);
		if (!stat.isFile() || stat.size > DEFAULT_MAX_FILE_BYTES) return { path: relative, absolutePath: absolute, content: null, blocked: true };
		return { path: relative, absolutePath: absolute, content: fs.readFileSync(real, "utf8"), blocked: false };
	} catch (error) {
		if (error && error.code === "ENOENT") return { path: relative, absolutePath: absolute, content: null, blocked: false };
		return { path: relative, absolutePath: absolute, content: null, blocked: true };
	}
}

function sensitiveDiffPath(relativePath) {
	return String(relativePath || "").split("/").some((name) => /^\.env(?:\.|$)/i.test(name)
		|| /(?:secret|token|password|credential|private[_-]?key)/i.test(name)
		|| /^id_(?:rsa|dsa|ecdsa|ed25519)$/i.test(name));
}

module.exports = { createCodeDiffTracker, createNativeFileChangeObserver };
