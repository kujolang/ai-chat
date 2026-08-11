const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createSkillRuntime } = require("../lib/skill-runtime");

function makeSkill(root, relativeDir, body, extraFiles = {}) {
	const dir = path.join(root, relativeDir);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "SKILL.md"), body);
	for (const [name, content] of Object.entries(extraFiles)) {
		const file = path.join(dir, name);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
	}
}

test("skill runtime discovers configured roots and reads bounded skill files", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "writer", [
			"---",
			"name: writer",
			"description: Draft focused local documents.",
			"---",
			"# Writer",
			"Use references/checklist.md."
		].join("\n"), {
			"references/checklist.md": "Check sources.\nKeep it concise.\n"
		});

		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot },
			homeDir: tempRoot
		});

		const listed = runtime.list({ query: "draft" });
		assert.equal(listed.skills.length, 1);
		assert.equal(listed.skills[0].name, "writer");
		assert.equal(listed.meta.available, true);
		assert.equal(listed.meta.skill_count, 1);

		const read = runtime.read({ id: listed.skills[0].id });
		assert.match(read.content, /Use references\/checklist\.md/);
		assert.deepEqual(read.related_files, ["SKILL.md", "references/checklist.md"]);

		const reference = runtime.readFile({ id: listed.skills[0].id, path: "references/checklist.md" });
		assert.equal(reference.content, "Check sources.\nKeep it concise.\n");
		assert.equal(JSON.stringify(read).includes(tempRoot), false);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("skill reads distinguish exact limits from truncation and preserve Unicode code points", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "exact", "x".repeat(1000), {
			"references/unicode.md": "😀".repeat(1001)
		});
		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot, AI_CHAT_SKILLS_MAX_READ_CHARS: "1000" },
			homeDir: tempRoot
		});
		const id = runtime.list().skills[0].id;
		const exact = runtime.read({ id });
		assert.equal(exact.content.length, 1000);
		assert.equal(exact.truncated, false);
		const unicode = runtime.readFile({ id, path: "references/unicode.md", max_chars: 1000 });
		assert.equal(Array.from(unicode.content).length, 1000);
		assert.equal(unicode.truncated, true);
		assert.doesNotMatch(unicode.content, /[\uD800-\uDBFF]$/);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("skill reads reject binary content disguised with a text extension", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "binary", "# Binary\n", { "references/payload.md": Buffer.from([65, 0, 66]) });
		const runtime = createSkillRuntime({ env: { AI_CHAT_SKILL_ROOTS: tempRoot }, homeDir: tempRoot });
		const id = runtime.list().skills[0].id;
		assert.throws(() => runtime.readFile({ id, path: "references/payload.md" }), (error) => error.code === "skill_file_not_readable");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("skill runtime follows symlinked skill directories", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-external-skills-"));
	try {
		makeSkill(externalRoot, "linked-writer", [
			"---",
			"name: linked-writer",
			"description: Draft from a symlinked skill directory.",
			"---",
			"# Linked Writer",
			"Use references/notes.md."
		].join("\n"), {
			"references/notes.md": "Symlinked reference.\n"
		});
		fs.symlinkSync(path.join(externalRoot, "linked-writer"), path.join(tempRoot, "linked-writer"));

		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot },
			homeDir: tempRoot
		});

		const listed = runtime.list({ query: "symlinked" });
		assert.equal(listed.skills.length, 1);
		assert.equal(listed.skills[0].name, "linked-writer");
		assert.equal(listed.skills[0].relative_path, "linked-writer");
		assert.equal(listed.meta.skill_count, 1);

		const read = runtime.read({ id: listed.skills[0].id });
		assert.match(read.content, /Linked Writer/);
		assert.deepEqual(read.related_files, ["SKILL.md", "references/notes.md"]);
		assert.equal(JSON.stringify(read).includes(externalRoot), false);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
		fs.rmSync(externalRoot, { recursive: true, force: true });
	}
});

test("skill runtime reads by exact skill name or relative path", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "memory/strata-memory", [
			"---",
			"name: strata-memory",
			"description: Save durable memories.",
			"---",
			"# Strata Memory"
		].join("\n"));
		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot },
			homeDir: tempRoot
		});

		const byName = runtime.read({ id: "strata-memory" });
		assert.equal(byName.skill.name, "strata-memory");
		assert.match(byName.content, /Strata Memory/);

		const byRelativePath = runtime.read({ id: "memory/strata-memory" });
		assert.equal(byRelativePath.skill.name, "strata-memory");
		assert.match(byRelativePath.content, /Strata Memory/);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("skill runtime reports ambiguous skill names with candidates", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "one/duplicate", "---\nname: duplicate\n---\n# One\n");
		makeSkill(tempRoot, "two/duplicate", "---\nname: duplicate\n---\n# Two\n");
		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot },
			homeDir: tempRoot
		});

		assert.throws(() => runtime.read({ id: "duplicate" }), (error) => error.code === "skill_ambiguous" && error.candidates.length === 2);
		const result = runtime.readFileForTool({ id: "duplicate", path: "SKILL.md" });
		assert.equal(result.ok, false);
		assert.equal(result.code, "skill_ambiguous");
		assert.equal(result.candidates.length, 2);
		assert.match(result.retry_hint, /exact id/);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("skill runtime rejects path traversal and non-text files", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "safe", "# Safe\n");
		fs.writeFileSync(path.join(tempRoot, "secret.bin"), Buffer.from([0, 1, 2, 3]));
		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot },
			homeDir: tempRoot
		});
		const id = runtime.list().skills[0].id;

		assert.throws(() => runtime.readFile({ id, path: "../secret.bin" }), (error) => error.code === "skill_file_not_readable");
		assert.throws(() => runtime.readFile({ id: "missing", path: "SKILL.md" }), (error) => error.code === "skill_not_found");
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("skill runtime tool file reads return guidance for unreadable relative files", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-skills-"));
	try {
		makeSkill(tempRoot, "video", "# Video\nUse references/render.md.\n", {
			"references/render.md": "Render steps.\n"
		});
		const runtime = createSkillRuntime({
			env: { AI_CHAT_SKILL_ROOTS: tempRoot },
			homeDir: tempRoot
		});
		const id = runtime.list().skills[0].id;

		const result = runtime.readFileForTool({ id, path: "README.md" });
		assert.equal(result.ok, false);
		assert.equal(result.code, "skill_file_not_readable");
		assert.equal(result.file, "README.md");
		assert.deepEqual(result.related_files, ["SKILL.md", "references/render.md"]);
		assert.match(result.retry_hint, /local_file_read/);
		assert.equal(JSON.stringify(result).includes(tempRoot), false);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
