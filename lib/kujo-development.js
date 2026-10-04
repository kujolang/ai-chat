const reference = {
 tested_versions: ['1.5.0', '1.7.0'],
 topics: {
  core: 'func square(n) { return n * n }\nmut n := 0\nwhile n < 3 { print(square(n)); n += 1 }',
  arguments: 'let argv := args()\nif len(argv) != 1 { print("expected one integer"); exit(1) }\nlet n := parse_int(argv[0])\nprint(n + 1)',
  collections: 'mut samples := [1, 2]\nsamples = push(samples, 3)\nprint(len(samples))\nprint(samples[2])',
  timing: 'let start := time_ns()\nmut n := 0\nwhile n < 100 { n += 1 }\nprint(n)\nprint(time_ns() - start)'
 }
};
const schema = { type: 'function', function: { name: 'local_kujo',
 description: 'Scoped Kujo development: guide reports actual runtime version and tested examples; check validates without running; run/test execute one file; benchmark explicitly repeats a pure script within a bounded budget. Uses existing shell permissions, not a sandbox. Reports source hashes, exit codes and output. Check before run; tests must assert the requested behavior. Never benchmark consequential scripts.',
 parameters: { type: 'object', additionalProperties: false, required: ['root_id', 'operation'], properties: {
  root_id: { type: 'string' }, cwd: { type: 'string' }, path: { type: 'string' },
  operation: { type: 'string', enum: ['guide', 'check', 'run', 'test', 'benchmark'] },
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
 let before;
 try { before = a.operation === 'guide' ? null : snapshot(a); } catch (error) { error.execution_started = false; throw error; }
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
 const runtime = { command: 'kujo', version: (version.stdout || '').trim(), reference_verified: reference.tested_versions.includes(matched) };
 if (a.operation === 'guide') return { ok: true, runtime, tested_versions: reference.tested_versions, topic: a.topic || 'core', example: runtime.reference_verified ? reference.topics[a.topic || 'core'] : null,
  guidance: 'Use docs matching this executable/version; examples are only verified for listed versions. Check and run a minimal example first. Use while loops for large workloads; calibrate before repeating. For file/error/test APIs consult the installed runtime documentation; do not invent functions. JIT behavior is not validated by this tool.' };
 const args = [a.operation === 'check' ? 'check' : a.operation === 'test' ? 'test-run' : 'run', before.absolute_path];
 if (a.operation === 'run' || a.operation === 'benchmark') args.push('--', ...(a.args || []));
 const clean = s => ({ path: s.path, sha256: s.sha256 });
 const finish = result => {
  let after;
  try { after = snapshot(a); } catch { return { ...result, ok: false, runtime, operation: a.operation, source: clean(before), source_after: null, source_unchanged: false, message: 'Source unavailable after execution; verification is incomplete.' }; }
  const unchanged = before.sha256 === after.sha256;
  return { ...result, runtime, operation: a.operation, source: clean(before), source_after: clean(after), source_unchanged: unchanged, ok: result.ok && unchanged,
   verification_scope: 'This file only; imported dependencies and behavior coverage are not certified.' };
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
  if (snapshot(a).sha256 !== before.sha256) return finish({ ok: false, calibration, trials: results, message: 'Source changed; stopped before another trial.' });
  const result = await command(args, Math.floor(remaining() * 0.8 / (trials - i)));
  results.push(result);
  if (result.exit_code !== 0 || result.truncated) return finish({ ok: false, calibration, trials: results, message: 'Trial failed; no automatic retry.' });
 }
 const times = results.map(r => r.duration_ms).sort((a,b) => a-b); const mid = Math.floor(times.length / 2);
 return finish({ ok: true, calibration, trials: results, median_wall_ms: times.length % 2 ? times[mid] : (times[mid-1]+times[mid])/2,
  timing_scope: 'Process wall time includes startup; compare outputs for equivalence before interpreting performance.' });
}
module.exports = { schema, executeKujo, reference };
