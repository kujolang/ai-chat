const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createAttachmentStore } = require("../lib/attachment-store");

test("listing and binary context select public attachment metadata without reading encrypted blobs", () => {
	const db = new Database(":memory:");
	const prepare = db.prepare.bind(db);
	const reads = [];
	db.prepare = (sql) => {
		if (/^SELECT\b/.test(sql)) reads.push(sql);
		return prepare(sql);
	};
	try {
		const store = createAttachmentStore(db, { masterKey: "local-fixture" });
		const metadata = store.create("chat", {
			originalname: "fixture.png", mimetype: "image/png",
			buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
		});
		assert.deepEqual(store.list("chat"), [metadata]);
		const [reference] = store.context("chat", [metadata.id]);
		assert.equal(reference.artifact_id, metadata.id);
		assert.equal(reference.text_excerpt, "");
		assert.equal(reference.provider_compatibility, "reference_only");
		assert.equal(reads.length, 3);
		for (const query of reads) assert.doesNotMatch(query, /\*|data_blob/);
		assert.equal(store.get("chat", metadata.id).buffer.length, 8);
		assert.deepEqual(store.context("other-chat", [metadata.id]), []);
	} finally {
		db.close();
	}
});
