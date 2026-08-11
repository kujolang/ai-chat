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
		const skill = resolveSkill(args.id);
		const bounded = readBoundedText(skill.skill_file, maxReadChars);
		return {
			skill: publicSkillSummary(skill),
			file: SKILL_FILE_NAME,
			content: bounded.content,
			truncated: bounded.truncated,
			related_files: listSkillFiles(skill).slice(0, 80)
		};
	}

	function readFile(rawArguments = {}) {
		const args = normalizeFileReadArguments(rawArguments);
		const skill = resolveSkill(args.id);
		const target = safeResolveUnder(skill.dir, args.path);
		if (!isReadableSkillFile(target)) {
			throw skillError("skill_file_not_readable", "Only bounded text files inside the selected skill folder can be read.");
		}
		const bounded = readBoundedText(target, Math.min(args.max_chars, maxReadChars));
		return {
			skill: publicSkillSummary(skill),
			file: path.relative(skill.dir, target).split(path.sep).join("/"),
			content: bounded.content,
			truncated: bounded.truncated
		};
	}

	function readFileForTool(rawArguments = {}) {
		const args = normalizeFileReadArguments(rawArguments);
		let skill;
		try {
			skill = resolveSkill(args.id);
		} catch (error) {
			if (error && error.code === "skill_not_found") {
				return skillGuidanceResult({
					code: "skill_not_found",
					message: error.message,
					retryHint: "Call skill_list again and use a returned skill id, exact skill name, or relative_path before reading a skill file."
				});
			}
			if (error && error.code === "skill_ambiguous") {
				return skillGuidanceResult({
					code: "skill_ambiguous",
					message: error.message,
					candidates: error.candidates,
					retryHint: "Call skill_read or skill_file_read with one exact id from candidates."
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

	function resolveSkill(identifier) {
		const normalizedId = String(identifier || "").trim();
		const skill = index.byId.get(normalizedId);
		if (!skill) {
			const matches = index.skills.filter((entry) => matchesSkillIdentifier(entry, normalizedId));
			if (matches.length === 1) return matches[0];
			if (matches.length > 1) {
				const error = skillError("skill_ambiguous", "The requested skill name matches more than one configured skill. Use an exact skill id from candidates.");
				error.candidates = matches.slice(0, 10).map(publicSkillSummary);
				throw error;
			}
			throw skillError("skill_not_found", "The requested skill id or exact skill name is not available in the configured skill roots.");
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
		for (const found of findSkillFiles(root.path, maxDepth)) {
			if (skills.length >= maxSkills) break;
			const dir = path.dirname(found.file);
			const relativePath = found.relative_path;
			const metadata = readSkillMetadata(found.file);
			const id = skillId(root.index, relativePath);
			skills.push({
				id,
				name: metadata.name || path.basename(dir),
				description: metadata.description,
				source: root.label,
				root_index: root.index,
				relative_path: relativePath,
				dir,
				skill_file: found.file
			});
		}
	}
	skills.sort((a, b) => `${a.source}/${a.relative_path}`.localeCompare(`${b.source}/${b.relative_path}`));
	return { skills, byId: new Map(skills.map((skill) => [skill.id, skill])) };
}

function findSkillFiles(root, maxDepth) {
	const out = [];
	const seenDirs = new Set();
	const visit = (dir, relativeDir, depth) => {
		if (depth > maxDepth) return;
		const realDir = safeRealpath(dir);
		if (!realDir || seenDirs.has(realDir)) return;
		seenDirs.add(realDir);
		let entries = [];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch (error) {
			return;
		}
		const skillEntry = entries.find((entry) => entry.name === SKILL_FILE_NAME && (entry.isFile() || entry.isSymbolicLink()));
		if (skillEntry) {
			const skillFile = safeRealpath(path.join(dir, SKILL_FILE_NAME));
			if (skillFile && isReadableSkillFile(skillFile)) {
				out.push({
					file: skillFile,
					relative_path: relativeDir || "."
				});
			}
			return;
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
			const child = safeRealpath(path.join(dir, entry.name));
			const childStat = child ? safeStat(child) : null;
			if (!childStat || !childStat.isDirectory()) continue;
			const childRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
			visit(child, childRelative, depth + 1);
		}
	};
	visit(root, "", 0);
	return out;
}

function readSkillMetadata(file) {
	const text = readBoundedText(file, 5000).content;
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
	if (!readableExtensions.has(path.extname(file).toLowerCase())) return false;
	try {
		const raw = fs.readFileSync(file);
		if (raw.includes(0)) return false;
		new TextDecoder("utf-8", { fatal: true }).decode(raw);
		return true;
	} catch (error) {
		return false;
	}
}

function safeRealpath(file) {
	try {
		return fs.realpathSync(file);
	} catch (error) {
		return "";
	}
}

function safeStat(file) {
	try {
		return fs.statSync(file);
	} catch (error) {
		return null;
	}
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
	const text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(file));
	const characters = Array.from(text);
	return {
		content: characters.slice(0, maxChars).join(""),
		truncated: characters.length > maxChars
	};
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

function skillGuidanceResult({ code, message, skill = null, file = "", relatedFiles = [], candidates = [], retryHint }) {
	return {
		ok: false,
		code,
		message,
		...(skill ? { skill: publicSkillSummary(skill) } : {}),
		...(file ? { file: boundedText(file, 500) } : {}),
		...(relatedFiles.length > 0 ? { related_files: relatedFiles } : {}),
		...(candidates.length > 0 ? { candidates } : {}),
		retry_hint: retryHint
	};
}

function matchesSkillIdentifier(skill, identifier) {
	const normalized = identifier.toLowerCase();
	if (!normalized) return false;
	return [skill.name, skill.relative_path, `${skill.source}/${skill.relative_path}`]
		.some((value) => String(value || "").toLowerCase() === normalized);
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
