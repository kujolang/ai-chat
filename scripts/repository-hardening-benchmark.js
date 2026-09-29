// Offline before/after benchmark. Only synthetic files and state are used.
// Run: node scripts/repository-hardening-benchmark.js --baseline <git-ref>
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--baseline" || args[1].startsWith("-")) {
 console.error("Usage: node scripts/repository-hardening-benchmark.js --baseline <git-ref>");
 process.exit(1);
}
const revision = execFileSync("git", ["rev-parse", "--verify", `${args[1]}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-hardening-benchmark-")));
function samples(run) {
 const times = []; let value;
 for (let i = 0; i < 31; i++) { const start = performance.now(); value = run(); if (i) times.push(performance.now() - start); }
 times.sort((a,b) => a-b);
 return { value, median_ms: times[15], p95_ms: times[28] };
}
try {
 const files = path.join(directory, "files"); fs.mkdirSync(files);
 for (let i = 0; i < 2000; i++) fs.writeFileSync(path.join(files, `file-${String(i).padStart(4, "0")}.txt`), "fixture");
 const modules = {};
 for (const [name, source] of [["local", "lib/local-runtime.js"], ["state", "public/state-sync.js"]]) {
  const prior = path.join(directory, `${name}.cjs`);
  fs.writeFileSync(prior, execFileSync("git", ["show", `${revision}:${source}`], { cwd: root }));
  modules[name] = { before: require(prior), after: require(path.join(root, source)) };
 }
 const listings = {}; const batches = {};
 const changes = Array.from({ length: 250 }, (_, i) => ({ type: "message_upsert", message: { id: String(i), content: "界".repeat(2000) } }));
 for (const side of ["before", "after"]) {
  const runtime = modules.local[side].createLocalRuntime({ projectRoot: files, env: { AI_CHAT_LOCAL_TOOLS_ENABLED: "1", AI_CHAT_LOCAL_WORKSPACE_ROOTS: files } });
  const stat = fs.statSync; let stats = 0;
  fs.statSync = function(file, ...rest) { if (String(file).startsWith(files + path.sep)) stats++; return stat.call(this, file, ...rest); };
  try { listings[side] = { ...samples(() => runtime.listFiles({ root_id: "workspace_0", max_entries: 10 })), stats_per_listing: stats / 31 }; }
  finally { fs.statSync = stat; }
  batches[side] = samples(() => modules.state[side].batchChanges(changes, 512 * 1024, 250));
 }
 assert.deepEqual(listings.after.value, listings.before.value);
 assert.deepEqual(batches.after.value, batches.before.value);
 for (const side of ["before", "after"]) {
  listings[side].returned = listings[side].value.entries.length; delete listings[side].value;
  batches[side].batch_sizes = batches[side].value.map(batch => batch.length);
  batches[side].serialized_bytes = batches[side].value.map(changes => modules.state[side].jsonByteLength({ changes }));
  delete batches[side].value;
 }
 console.log(JSON.stringify({ baseline: revision, node: process.version, platform: process.platform, samples: 30, warmup: 1, equivalence: "assert.deepEqual passed", directory_listing: { files: 2000, requested: 10, ...listings }, state_batching: { changes: 250, ...batches }, limitations: "Synthetic local timings, not provider latency or token usage. CI gates behavior and stat counts, not wall time." }, null, 2));
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
