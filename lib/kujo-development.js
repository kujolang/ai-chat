const reference = {
 tested_versions: ['1.5.0', '1.7.0'],
 topic_versions: { validation: ['1.7.0'], cli_errors: ['1.7.0'], types: ['1.7.0'], nested_collections: ['1.7.0'] },
 topics: {
  core: 'func square(n) { return n * n }\nmut n := 0\nwhile n < 3 { print(square(n)); n += 1 }',
  arguments: 'let argv := args()\nif len(argv) != 1 { print("expected one integer"); exit(1) }\nlet n := parse_int(argv[0])\nprint(n + 1)',
  collections: 'mut samples := [1, 2]\nsamples = push(samples, 3)\nprint(len(samples))\nprint(samples[2])',
  timing: 'let start := time_ns()\nmut n := 0\nwhile n < 100 { n += 1 }\nprint(n)\nprint(time_ns() - start)',
  json: "let obj := parse_json(\"{\\\"ready\\\":false,\\\"items\\\":[0]}\")\nif !is_dict(obj) { exit(1) }\nlet copy := parse_json(to_json(obj))\nprint(copy[\"ready\"])\nprint(copy[\"items\"][0])",
  nested_collections: '// Nested index assignment is unsupported in the tested runtime. Replace the whole row.\nmut rows := [[1, 2]]\nlet row := rows[0]\nrows[0] = [row[0], 9]\nprint(to_json(rows))',
  types: 'print(is_array(parse_json("[]")))\nprint(is_dict(parse_json("{}")))\nprint(is_int(parse_json("1")))\nprint(is_int(parse_json("true")))\nprint(is_string("1"))',
  validation: `// Validate structure before conversion or mutation. has_key returns numeric 0/1.
func read_count(text) {
 let value := parse_json(text)
 if !is_dict(value) { return -1 }
 if has_key(value, "count") != 1 { return -1 }
 let count := value["count"]
 if !is_int(count) { return -1 }
 if count < 0 || count > 100 { return -1 }
 return count
}
print(read_count("{\\\"count\\\":0}"))
print(read_count("{\\\"count\\\":false}"))
print(read_count("{}"))
print(read_count("{\\\"count\\\":101}"))`,
  cli_errors: 'func fail(message) { eprint(to_json({"error": message})); exit(1) }\ntry { parse_json("broken") } except e { fail("invalid JSON") }',
  errors: 'mut caught := false\ntry { parse_json("broken") } except e { caught = true }\nif !caught { exit(1) }\nprint("rejected malformed JSON")',
  persistence: `// Pass a fresh owned directory as the only argument. Never use live state.
let argv := args()
if len(argv) != 1 { exit(1) }
let file := argv[0] + "/settings.json"
mut visible := "old"
write_file_atomic(file, to_json({"label": visible}), true)
mut failed := false
try {
 write_file_atomic(argv[0] + "/missing/settings.json", to_json({"label": "new"}), true)
 visible = "new"
} except e { failed = true }
if !failed { exit(1) }
let disk := parse_json(read_file(file))
if disk["label"] != visible { exit(1) }
print(visible)
write_file_atomic(file, to_json({"label": "new"}), true)
visible = "new"
print(parse_json(read_file(file))["label"])`

 }
};
const schema = { type: 'function', function: { name: 'local_kujo',
 description: 'Scoped Kujo development: guide reports actual runtime version and tested examples; check validates without running; run/test execute one file; benchmark explicitly repeats a pure script within a bounded budget. Uses existing shell permissions, not a sandbox. Use verification_paths to hash declared imports/tests before and after execution. Reports source hashes, exit codes and output. Check before run; tests must assert the requested behavior. Never benchmark consequential scripts.',
 parameters: { type: 'object', additionalProperties: false, required: ['root_id', 'operation'], properties: {
  root_id: { type: 'string' }, cwd: { type: 'string' }, path: { type: 'string' },
  operation: { type: 'string', enum: ['guide', 'check', 'run', 'test', 'benchmark'] },
  verification_paths: { type: 'array', maxItems: 16, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 2048 } },
  topic: { type: 'string', enum: Object.keys(reference.topics) },
  args: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 1000 } },
  timeout_ms: { type: 'integer', minimum: 1000, maximum: 600000 },
  budget_ms: { type: 'integer', minimum: 1000, maximum: 600000 },
  trials: { type: 'integer', minimum: 1, maximum: 7 }, pure: { type: 'boolean' }
 } } } };
function invalid(message) { return Object.assign(new Error(message), { code: 'invalid_tool_arguments', execution_started: false }); }
async function executeKujo(input, context, { runCommand, snapshot, now = Date.now }) {
 const a = typeof input === 'string' ? JSON.parse(input) : input;
 if (!a || !schema.function.parameters.properties.operation.enum.includes(a.operation)) throw invalid('Select a Kujo operation.');
 if (a.topic && !Object.hasOwn(reference.topics, a.topic)) throw invalid('Unknown Kujo reference topic.');
 if (a.args !== undefined && (!Array.isArray(a.args) || a.args.length > 20 || a.args.some(v => typeof v !== 'string' || v.length > 1000 || v.includes('\0')))) throw invalid('Use at most 20 literal script arguments.');
 if (a.operation === 'benchmark' && (a.pure !== true || !Number.isInteger(a.budget_ms) || a.budget_ms < 1000 || a.budget_ms > 600000)) throw invalid('Benchmark requires pure=true and budget_ms from 1000 to 600000.');
 const trials = a.trials ?? 5;
 if (!Number.isInteger(trials) || trials < 1 || trials > 7) throw invalid('Trials must be 1–7.');
 if (a.verification_paths !== undefined && (!Array.isArray(a.verification_paths) || a.verification_paths.length > 16 || new Set(a.verification_paths).size !== a.verification_paths.length || a.verification_paths.some(p => typeof p !== 'string' || !p || p.length > 2048 || p.includes('\0')))) throw invalid('verification_paths must contain up to 16 unique workspace paths.');
 const capture = () => [snapshot({ ...a, verification_dependency: false }), ...(a.verification_paths || []).filter(p => p !== a.path).map(path => snapshot({ ...a, path, verification_dependency: true }))];
 let manifest;
 let before;
 try { manifest = a.operation === 'guide' ? [] : capture(); before = manifest[0]; } catch (error) { error.execution_started = false; throw error; }
 const deadline = Math.min(context.task_deadline_ms || Infinity, a.operation === 'benchmark' ? now() + a.budget_ms : Infinity);
 const remaining = () => deadline - now();
 let completedCommands = 0;
 const command = async (args, timeout) => {
  if (remaining() < 1000) {
   if (!completedCommands) throw invalid('Task budget exhausted before the next Kujo command.');
   return { ok: false, exit_code: null, error: { code: 'task_budget_exhausted', message: 'No further Kujo command executed.' } };
  }
  try {
   const result = await runCommand({ root_id: a.root_id, cwd: a.cwd, command: 'kujo', args, timeout_ms: Math.min(timeout || a.timeout_ms || 120000, 600000, remaining()) }, context);
   completedCommands++; return result;
  } catch (error) {
   // After the version probe, report known stopped/never-started failures in
   // this composite receipt. Uncertain termination still requires reconciliation.
   if (completedCommands && (error.execution_started === false || error.execution_completed === true)) return { ...error.execution_result, ok: false, exit_code: null, error: { code: error.code, message: error.message } };
   throw error;
  }
 };
 const version = await command(['--version'], 10000);
 if (version.exit_code !== 0) return { ok: false, operation: a.operation, version, message: 'Runtime version probe failed; no script executed.' };
 const matched = /\bkujo\s+(\d+\.\d+\.\d+)\b/i.exec(version.stdout || '')?.[1];
 const runtime = { command: 'kujo', backend: 'default', ...version.kujo_runtime, version: (version.stdout || '').trim(), reference_verified: (reference.topic_versions[a.topic || 'core'] || reference.tested_versions).includes(matched) };
 runtime.backend_scope = 'Backend applies to run/benchmark. Check uses the compiler; test-run uses its own interpreter. Raw shell arguments are unchanged.';
 runtime.warnings = matched === '1.5.0' && runtime.backend === 'default'
  ? ['Kujo 1.5.0 default VM fails the repository nested-arithmetic qualification probe. Ask the operator to qualify/pin a runtime before attributing similar failures to source code. Never automatically replay scripts on another backend.'] : [];
 if (matched === '1.7.0') runtime.warnings.push('The repository-tested Kujo 1.7.0 accepts nested index assignment at check time but run fails: default VM Stack underflow; interpreter Complex index assignment not yet supported. Use the nested_collections guide for verified whole-row replacement. Requalify your exact binary; do not switch backends or replay consequential scripts automatically.');
 if (a.operation === 'guide') return { ok: true, runtime, tested_versions: reference.topic_versions[a.topic || 'core'] || reference.tested_versions, topic: a.topic || 'core', example: runtime.reference_verified ? reference.topics[a.topic || 'core'] : null,
  expected_output: referenceExpected[a.topic || 'core'] ?? '100 followed by elapsed nanoseconds',
  expected_stderr: referenceStatus[a.topic]?.stderr || '', expected_exit_code: referenceStatus[a.topic]?.exit_code || 0,
  guidance: 'Use docs matching this executable/version; examples are only verified for listed versions. Check and run a minimal example first. Use while loops for large workloads; calibrate before repeating. JSON, errors and persistence topics demonstrate actual APIs. Persistence requires a fresh owned directory; never use live state as a fixture. Consult matching documentation for other APIs; do not invent functions. JIT behavior is not validated by this tool.' };
 const args = [a.operation === 'check' ? 'check' : a.operation === 'test' ? 'test-run' : 'run', before.absolute_path];
 if (runtime.backend === 'interpreter' && ['run', 'benchmark'].includes(a.operation)) args.push('--interpreter');
 if (a.operation === 'run' || a.operation === 'benchmark') args.push('--', ...(a.args || []));
 const clean = s => ({ path: s.path, sha256: s.sha256 });
 const finish = result => {
  let after;
  try { after = capture(); } catch { return { ...result, ok: false, runtime, operation: a.operation, source: clean(before), source_after: null, source_unchanged: false, message: 'Source unavailable after execution; verification is incomplete.' }; }
  const unchanged = manifest.length === after.length && manifest.every((s, i) => s.path === after[i].path && s.sha256 === after[i].sha256);
  return { ...result, runtime, operation: a.operation, source: clean(before), source_after: clean(after[0]), verification_manifest: manifest.map(clean), verification_manifest_after: after.map(clean), source_unchanged: unchanged, ok: result.ok && unchanged,
   verification_scope: 'Entry file and explicitly declared verification_paths only. Undeclared imports, transient edits and behavior coverage are not certified.' };
 };
 if (a.operation !== 'benchmark') {
  const result = await command(args); return finish({ ...result, ok: result.exit_code === 0 && !result.truncated });
 }
 // A calibration is deliberately the only invocation before deciding whether
 // the complete experiment fits. Never scale or retry a workload automatically.
 const calibrationBudget = Math.min(a.timeout_ms || 120000, Math.floor(remaining() / (trials + 2)));
 if (calibrationBudget < 1000) return finish({ ok: false, trials: [], message: 'Insufficient calibration budget; no script executed.' });
 const calibration = await command(args, calibrationBudget);
 if (calibration.exit_code !== 0 || calibration.truncated) return finish({ ok: false, calibration, trials: [], message: 'Calibration failed or output was truncated; no repeated trials.' });
 const estimate = Math.ceil(Math.max(1, calibration.duration_ms) * trials * 1.3);
 if (estimate > remaining() * 0.8) return finish({ ok: false, calibration, trials: [], estimated_trials_ms: estimate, message: 'Insufficient budget after calibration. Reduce the pure workload explicitly; no repeated trials ran.' });
 const results = [];
 for (let i = 0; i < trials; i++) {
  if (remaining() * 0.8 / (trials - i) < 1000) return finish({ ok: false, calibration, trials: results, message: 'Remaining trial budget exhausted; no automatic retry.' });
  try {
   if (capture().some((s, i) => s.sha256 !== manifest[i].sha256)) return finish({ ok: false, calibration, trials: results, message: 'Source changed; stopped before another trial.' });
  } catch { return finish({ ok: false, calibration, trials: results, message: 'Source unavailable; stopped before another trial.' }); }
  const result = await command(args, Math.floor(remaining() * 0.8 / (trials - i)));
  results.push(result);
  if (result.exit_code !== 0 || result.truncated) return finish({ ok: false, calibration, trials: results, message: 'Trial failed; no automatic retry.' });
 }
 const times = results.map(r => r.duration_ms).sort((a,b) => a-b); const mid = Math.floor(times.length / 2);
 return finish({ ok: true, exit_code: 0, calibration, trials: results, median_wall_ms: times.length % 2 ? times[mid] : (times[mid-1]+times[mid])/2,
  timing_scope: 'Process wall time includes startup; compare outputs for equivalence before interpreting performance.' });
}
const referenceExpected = {nested_collections:'[[1,9]]',types:'true\ntrue\ntrue\nfalse\ntrue',cli_errors:'',validation:'0\n-1\n-1\n-1',core:'0\n1\n4',arguments:'42',collections:'3\n3',json:'false\n0',errors:'rejected malformed JSON',persistence:'old\nnew'};
const referenceStatus = { cli_errors: { exit_code: 1, stderr: '{"error":"invalid JSON"}' } };
module.exports = { schema, executeKujo, reference, referenceExpected, referenceStatus };
