const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_MAX_SKILLS = 500;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_READ_CHARS = 48000;
const MAX_FILE_BYTES = 256 * 1024;
const SKILL_FILE_NAME = "SKILL.md";

const readableExtensions = new Set([
	".md", ".markdown", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml",
	".js", ".ts", ".tsx", ".jsx", ".py", ".sh", ".kujo", ".css", ".html"
]);

function createSkillRuntime(options = {}) {
	const env = options.env || process.env;
	const homeDir = options.homeDir || os.homedir();
	const enabled = parseBoolean(env.AI_CHAT_SKILLS_ENABLED, true);
	const maxSkills = clampInteger(env.AI_CHAT_SKILLS_MAX_COUNT, 1, 2000, DEFAULT_MAX_SKILLS);
	const maxDepth = clampInteger(env.AI_CHAT_SKILLS_MAX_DEPTH, 1, 12, DEFAULT_MAX_DEPTH);
	const maxReadChars = clampInteger(env.AI_CHAT_SKILLS_MAX_READ_CHARS, 1000, 200000, DEFAULT_MAX_READ_CHARS);
	const roots = enabled ? normalizeSkillRoots({
		homeDir,
		explicitRoots: env.AI_CHAT_SKILL_ROOTS,
		extraRoots: env.AI_CHAT_EXTRA_SKILL_ROOTS,
		codexHome: env.CODEX_HOME,
		claudeConfigDir: env.CLAUDE_CONFIG_DIR
	}) : [];
	const index = buildSkillIndex({ roots, maxSkills, maxDepth });

	function list(rawArguments = {}) {
		const args = normalizeListArguments(rawArguments);
		const query = args.query.toLowerCase();
		const source = args.source.toLowerCase();
		let matches = index.skills;
		if (source) {
			matches = matches.filter((skill) => skill.source.toLowerCase().includes(source));
		}
		if (query) {
			matches = matches.filter((skill) => {
				const haystack = `${skill.name}\n${skill.description}\n${skill.relative_path}\n${skill.source}`.toLowerCase();
				return haystack.includes(query);
			});
		}
		return {
			skills: matches.slice(0, args.max_results).map(publicSkillSummary),
			meta: status()
		};
	}

	function read(rawArguments = {}) {
		const args = normalizeReadArguments(rawArguments);
		const skill = skillById(args.id);
		const content = readBoundedText(skill.skill_file, maxReadChars);
		return {
			skill: publicSkillSummary(skill),
			file: SKILL_FILE_NAME,
			content,
			truncated: content.length >= maxReadChars,
			related_files: listSkillFiles(skill).slice(0, 80)
		};
	}

	function readFile(rawArguments = {}) {
		const args = normalizeFileReadArguments(rawArguments);
		const skill = skillById(args.id);
		const target = safeResolveUnder(skill.dir, args.path);
		if (!isReadableSkillFile(target)) {
			throw skillError("skill_file_not_readable", "Only bounded text files inside the selected skill folder can be read.");
		}
		const content = readBoundedText(target, Math.min(args.max_chars, maxReadChars));
		return {
			skill: publicSkillSummary(skill),
			file: path.relative(skill.dir, target).split(path.sep).join("/"),
			content,
			truncated: content.length >= Math.min(args.max_chars, maxReadChars)
		};
	}

	function readFileForTool(rawArguments = {}) {
		const args = normalizeFileReadArguments(rawArguments);
		let skill;
		try {
			skill = skillById(args.id);
		} catch (error) {
			if (error && error.code === "skill_not_found") {
				return skillGuidanceResult({
					code: "skill_not_found",
					message: error.message,
					retryHint: "Call skill_list again and use one of the returned skill ids before reading a skill file."
				});
			}
			throw error;
		}
		const target = safeResolveUnder(skill.dir, args.path);
		if (!isReadableSkillFile(target)) {
			return skillGuidanceResult({
				code: "skill_file_not_readable",
				message: "Only bounded text files inside the selected skill folder can be read.",
				skill,
				file: args.path,
				relatedFiles: listSkillFiles(skill).slice(0, 80),
				retryHint: "Use skill_file_read only for relative files listed in related_files or referenced by SKILL.md. To inspect repository files such as README.md, use local_workspace_list and local_file_read instead."
			});
		}
		return readFile(args);
	}

	function skillById(id) {
		const normalizedId = String(id || "").trim();
		const skill = index.byId.get(normalizedId);
		if (!skill) {
			throw skillError("skill_not_found", "The requested skill id is not available in the configured skill roots.");
		}
		return skill;
	}

	function status() {
		return {
			enabled,
			available: enabled && index.skills.length > 0,
			skill_count: index.skills.length,
			root_count: roots.length,
			roots: roots.map((root) => ({
				label: root.label,
				available: root.available,
				skill_count: index.skills.filter((skill) => skill.root_index === root.index).length
			})),
			limits: {
				max_skills: maxSkills,
				max_depth: maxDepth,
				max_read_chars: maxReadChars
			}
		};
	}

	return {
		canExecute: () => enabled,
		status,
		list,
		read,
		readFile,
		readFileForTool
	};
}

function normalizeSkillRoots({ homeDir, explicitRoots, extraRoots, codexHome, claudeConfigDir }) {
	const defaults = [
		path.join(codexHome || path.join(homeDir, ".codex"), "skills"),
		path.join(homeDir, ".agents", "skills"),
		path.join(claudeConfigDir || path.join(homeDir, ".claude"), "skills")
	];
	const configured = parsePathList(explicitRoots);
	const candidates = configured.length > 0 ? configured : defaults.concat(parsePathList(extraRoots));
	const seen = new Set();
	const roots = [];
	for (const candidate of candidates) {
		const resolved = path.resolve(expandHome(candidate, homeDir));
		let real = "";
		let available = false;
		try {
			const stat = fs.statSync(resolved);
			if (!stat.isDirectory()) continue;
			real = fs.realpathSync(resolved);
			available = true;
		} catch (error) {
			real = resolved;
		}
		const key = real.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		roots.push({
			index: roots.length,
			path: real,
			label: labelForRoot(real, homeDir),
			available
		});
	}
	return roots;
}

function buildSkillIndex({ roots, maxSkills, maxDepth }) {
	const skills = [];
	for (const root of roots) {
		if (!root.available || skills.length >= maxSkills) continue;
		for (const file of findSkillFiles(root.path, maxDepth)) {
			if (skills.length >= maxSkills) break;
			const dir = path.dirname(file);
			const relativePath = path.relative(root.path, dir).split(path.sep).join("/") || ".";
			const metadata = readSkillMetadata(file);
			const id = skillId(root.index, relativePath);
			skills.push({
				id,
				name: metadata.name || path.basename(dir),
				description: metadata.description,
				source: root.label,
				root_index: root.index,
				relative_path: relativePath,
				dir,
				skill_file: file
			});
		}
	}
	skills.sort((a, b) => `${a.source}/${a.relative_path}`.localeCompare(`${b.source}/${b.relative_path}`));
	return { skills, byId: new Map(skills.map((skill) => [skill.id, skill])) };
}

function findSkillFiles(root, maxDepth) {
	const out = [];
	const visit = (dir, depth) => {
		if (depth > maxDepth) return;
		let entries = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch (error) {
			return;
		}
		if (entries.some((entry) => entry.isFile() && entry.name === SKILL_FILE_NAME)) {
			const skillFile = safeResolveUnder(root, path.join(dir, SKILL_FILE_NAME));
			if (skillFile) out.push(skillFile);
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
			const child = safeResolveUnder(root, path.join(dir, entry.name));
			if (child) visit(child, depth + 1);
		}
	};
	visit(root, 0);
	return out;
}

function readSkillMetadata(file) {
	const text = readBoundedText(file, 5000);
	const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
	if (frontmatter) {
		const data = {};
		for (const line of frontmatter[1].split(/\r?\n/)) {
			const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
			if (match) data[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
		}
		return {
			name: boundedText(data.name, 120),
			description: boundedText(data.description, 800)
		};
	}
	const heading = text.match(/^#\s+(.+)$/m);
	return {
		name: heading ? boundedText(heading[1], 120) : "",
		description: boundedText(text.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#")), 800)
	};
}

function listSkillFiles(skill) {
	const files = [];
	const visit = (dir, depth) => {
		if (depth > 4) return;
		let entries = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch (error) {
			return;
		}
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const target = safeResolveUnder(skill.dir, path.join(dir, entry.name));
			if (!target) continue;
			if (entry.isDirectory()) {
				visit(target, depth + 1);
			} else if (entry.isFile() && isReadableSkillFile(target)) {
				files.push(path.relative(skill.dir, target).split(path.sep).join("/"));
			}
		}
	};
	visit(skill.dir, 0);
	return files.sort();
}

function isReadableSkillFile(file) {
	let stat;
	try {
		stat = fs.statSync(file);
	} catch (error) {
		return false;
	}
	if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return false;
	return readableExtensions.has(path.extname(file).toLowerCase());
}

function safeResolveUnder(root, target) {
	const rootReal = fs.realpathSync(root);
	let targetReal = "";
	try {
		targetReal = fs.realpathSync(path.resolve(root, target));
	} catch (error) {
		return null;
	}
	const relative = path.relative(rootReal, targetReal);
	if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return targetReal;
	return null;
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

function normalizeListArguments(value) {
	const args = normalizeObjectArguments(value);
	return {
		query: boundedText(args.query, 200),
		source: boundedText(args.source, 120),
		max_results: clampInteger(args.max_results, 1, 100, 50)
	};
}

function normalizeReadArguments(value) {
	const args = normalizeObjectArguments(value);
	return { id: boundedText(args.id, 200) };
}

function normalizeFileReadArguments(value) {
	const args = normalizeObjectArguments(value);
	return {
		id: boundedText(args.id, 200),
		path: boundedText(args.path, 500),
		max_chars: clampInteger(args.max_chars, 1000, 200000, DEFAULT_MAX_READ_CHARS)
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
	throw skillError("invalid_tool_arguments", "The provider returned invalid JSON tool arguments.");
}

function publicSkillSummary(skill) {
	return {
		id: skill.id,
		name: skill.name,
		description: skill.description,
		source: skill.source,
		relative_path: skill.relative_path
	};
}

function skillGuidanceResult({ code, message, skill = null, file = "", relatedFiles = [], retryHint }) {
	return {
		ok: false,
		code,
		message,
		...(skill ? { skill: publicSkillSummary(skill) } : {}),
		...(file ? { file: boundedText(file, 500) } : {}),
		...(relatedFiles.length > 0 ? { related_files: relatedFiles } : {}),
		retry_hint: retryHint
	};
}

function parsePathList(value) {
	return String(value || "")
		.split(new RegExp(`[${escapeRegExp(path.delimiter)},]`))
		.map((entry) => entry.trim())
		.filter(Boolean);
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

function skillId(rootIndex, relativePath) {
	return `skill_${rootIndex}_${Buffer.from(relativePath).toString("base64url").slice(0, 80)}`;
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

function skillError(code, message) {
	const error = new Error(message);
	error.code = code;
	return error;
}

module.exports = {
	createSkillRuntime,
	normalizeSkillRoots,
	skillError
};
