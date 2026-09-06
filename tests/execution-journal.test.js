const { test } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createExecutionJournal } = require("../lib/execution-journal");

test("durable receipt survives database reopen and suppresses repeated call execution", () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-journal-"));
	const file = path.join(temp, "test.db");
	let db = new Database(file);
	try {
		let journal = createExecutionJournal(db, { secret: "fixture-secret" });
		journal.begin("run", "turn", { model: "fixture" });
		journal.startCall("run", "call", "local_file_write", { content: "sensitive fixture content" });
		journal.completeCall("run", "call", { ok: true, path: "done.md" });
		journal.checkpoint("run", { messages: [{ role: "user", content: "continue" }] });
		journal.appendEvent("run", "token", { delta: "partial" });
		db.close();
		assert.ok(!fs.readFileSync(file).includes(Buffer.from("sensitive fixture content")));
		db = new Database(file);
		journal = createExecutionJournal(db, { secret: "fixture-secret" });
		assert.deepEqual(journal.recover(), ["run"]);
		assert.throws(() => journal.begin("run", "turn", { model: "fixture" }), { code: "execution_resume_required" });
		assert.equal(journal.begin("run", "turn", { model: "fixture" }, { resume: true }).resumed, true);
		assert.deepEqual(journal.startCall("run", "call", "local_file_write", { content: "sensitive fixture content" }).result, { ok: true, path: "done.md" });
		assert.equal(journal.events("run")[0].data.delta, "partial");
		journal.finish("run", { output_text: "Finished" });
		assert.equal(journal.begin("run", "turn", { model: "fixture" }).replay, true);
		assert.throws(() => journal.begin("run", "turn", { model: "different" }), { code: "execution_conflict" });
	} finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});

test("an interrupted in-flight action requires reconciliation and cannot auto-replay", () => {
	const db = new Database(":memory:");
	try {
		const journal = createExecutionJournal(db, { secret: "fixture-secret" });
		journal.begin("run", "turn", {});
		journal.startCall("run", "call", "action_adapter_call", { id: "publish" });
		journal.recover();
		assert.equal(journal.receipts("run")[0].status, "uncertain");
		assert.throws(() => journal.begin("run", "turn", {}, { resume: true }), { code: "execution_reconciliation_required" });
	} finally { db.close(); }
});

test("operator reconciliation resolves an uncertain outcome without discarding evidence", () => {
	const db = new Database(":memory:");
	try {
		const journal = createExecutionJournal(db, { secret: "fixture-secret" });
		journal.begin("run", "turn", {});
		journal.startCall("run", "call", "action_adapter_call", { id: "publish" });
		journal.recover();
		journal.reconcile("run", "call", { disposition: "completed", result: { ok: true, document_id: "verified" }, evidence: "Operator checked the service and confirmed document ID verified." });
		journal.begin("run", "turn", {}, { resume: true });
		assert.equal(journal.startCall("run", "call", "action_adapter_call", { id: "publish" }).replay, true);
		assert.equal(journal.events("run")[0].event, "reconciliation");
	} finally { db.close(); }
});

test("live database ownership prevents a second runtime from recovering active work", () => {
	const db = new Database(":memory:");
	try {
		const first = createExecutionJournal(db, { secret: "fixture-secret", claimOwnership: true });
		first.begin("live", "turn", {});
		assert.throws(() => createExecutionJournal(db, { secret: "fixture-secret", claimOwnership: true }), { code: "execution_database_in_use" });
		assert.equal(first.get("live").status, "running");
		first.release();
		const second = createExecutionJournal(db, { secret: "fixture-secret", claimOwnership: true });
		assert.deepEqual(second.recover(), ["live"]);
		second.release();
	} finally { db.close(); }
});

test('retention removes terminal payloads but preserves identity and uncertain/recoverable work',()=>{
 const db=new Database(':memory:');let now=0;
 try {
  let journal=createExecutionJournal(db,{secret:'fixture-secret',retentionDays:1,now:()=>now});
  for(const id of ['done','cancelled','uncertain','interrupted','active']) {
   journal.begin(id,id,{task:id});journal.startCall(id,'call','write',{content:'private payload'});
   if(id!=='uncertain')journal.completeCall(id,'call',{ok:true});
   journal.checkpoint(id,{messages:['private payload']});journal.appendEvent(id,'token',{delta:'private payload'});
   if(id==='done')journal.finish(id,{output_text:'private payload'});
   if(id==='cancelled'||id==='uncertain')journal.finish(id,{error:'stopped'},'cancelled');
   if(id==='interrupted')journal.finish(id,{error:'restart'},'interrupted');
  }
  now=2*86400000;
  assert.equal(journal.prune(),2);
  for(const id of ['done','cancelled']) {
   assert.equal(journal.get(id).status,'expired');assert.equal(journal.get(id).checkpoint,null);assert.equal(journal.get(id).result,null);
   assert.deepEqual(journal.receipts(id),[]);assert.deepEqual(journal.events(id),[]);
   assert.throws(()=>journal.begin(id,id,{task:id},{resume:true}),{code:'execution_expired'});
   assert.throws(()=>journal.begin(id,id,{task:'different'}),{code:'execution_conflict'});
  }
  for(const id of ['uncertain','interrupted','active'])assert.equal(journal.receipts(id).length,1);
  assert.equal(journal.get('active').status,'running');
  journal=createExecutionJournal(db,{secret:'fixture-secret',retentionDays:1,now:()=>now});
  assert.throws(()=>journal.begin('done','done',{task:'done'}),{code:'execution_expired'});
 }finally{db.close();}
});

test('retention zero disables cleanup and cleanup batches stay bounded',()=>{
 const db=new Database(':memory:');let now=0;
 try {
  const journal=createExecutionJournal(db,{secret:'fixture-secret',retentionDays:0,now:()=>now});
  for(let i=0;i<105;i++){journal.begin('r'+i,'t'+i,{});journal.finish('r'+i,{output_text:'done'});}
  now=2*86400000;assert.equal(journal.prune(),0);
  const bounded=createExecutionJournal(db,{secret:'fixture-secret',retentionDays:1,now:()=>now});
  assert.equal(bounded.prune(),100);assert.equal(bounded.prune(),5);assert.equal(bounded.prune(),0);
 }finally{db.close();}
});
