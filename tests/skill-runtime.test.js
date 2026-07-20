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
