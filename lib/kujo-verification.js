const { isDeepStrictEqual } = require('node:util');

const MAX_CASES = 32;
const caseSchema = {
 type: 'object', additionalProperties: false, required: ['id', 'args', 'exit_code'],
 properties: {
  id: { type: 'string', minLength: 1, maxLength: 64 },
  args: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 1000 } },
  exit_code: { type: 'integer', minimum: 0, maximum: 255 },
  stdout: { type: 'string', maxLength: 32000 },
  stdout_json: { type: 'string', maxLength: 32000, description: 'Expected JSON document; compares decoded values, not whitespace or object-key order.' },
  stderr: { type: 'string', maxLength: 4000 },
  stderr_error: { type: 'boolean', description: 'Require stderr to contain exactly one JSON object with only a nonempty error string.' },
  max_duration_ms: { type: 'integer', minimum: 1, maximum: 600000, description: 'Optional task-appropriate process-wall-time assertion, including startup. Not a portable performance score.' }
 }
};
function validateCases(cases) {
 const reject = message => { throw Object.assign(Error(message), { code: 'invalid_tool_arguments', execution_started: false }); };
 if (!Array.isArray(cases) || !cases.length || cases.length > MAX_CASES) reject('verify requires 1–32 explicit CLI cases. Each case launches the entry point once; use owned fixtures.');
 const ids = new Set(); let bytes = 0;
 for (const row of cases) {
  if (!row || Array.isArray(row) || typeof row !== 'object' || Object.keys(row).some(k => !Object.hasOwn(caseSchema.properties, k))) reject('Unknown verification case field.');
  if (typeof row.id !== 'string' || !row.id.trim() || row.id.length > 64 || ids.has(row.id)) reject('Case IDs must be unique nonempty strings up to 64 characters.');
  ids.add(row.id);
  if (!Array.isArray(row.args) || row.args.length > 20 || row.args.some(a => typeof a !== 'string' || a.includes('\0') || a.length > 1000)) reject('Use up to 20 literal script arguments, each at most 1000 UTF-16 code units. Omit the CLI separator.');
  if (!Number.isInteger(row.exit_code) || row.exit_code < 0 || row.exit_code > 255) reject('Every case needs the expected exit code (0–255).');
  for (const [key, limit] of [['stdout', 32000], ['stdout_json', 32000], ['stderr', 4000]]) {
   if (row[key] !== undefined && (typeof row[key] !== 'string' || Buffer.byteLength(row[key]) > limit)) reject(`Invalid ${key} expectation.`);
  }
  if (row.stdout !== undefined && row.stdout_json !== undefined) reject('Select exact stdout OR decoded stdout_json, not both.');
  if (row.stderr_error !== undefined && typeof row.stderr_error !== 'boolean') reject('stderr_error must be boolean.');
  if (row.stderr !== undefined && row.stderr_error) reject('Select exact stderr OR stderr_error, not both.');
  if (row.max_duration_ms !== undefined && (!Number.isInteger(row.max_duration_ms) || row.max_duration_ms < 1 || row.max_duration_ms > 600000)) reject('Invalid case duration assertion.');
  if (row.stdout_json !== undefined) { try { JSON.parse(row.stdout_json); } catch { reject('stdout_json must be valid JSON.'); } }
  // Never accept exit status alone as a behavior assertion. Unspecified streams
  // are required to be empty; examples state newline expectations explicitly.
  if (row.stdout === undefined && row.stdout_json === undefined && row.stderr === undefined && !row.stderr_error) reject('Declare an output assertion for every case (empty string is allowed).');
  bytes += Buffer.byteLength(JSON.stringify(row));
 }
 if (bytes > 192 * 1024) reject('Verification inputs exceed 192 KiB; split into smaller batches.');
 return cases;
}
function assessCase(expected, result) {
 const failures = [];
 if (result.error || result.signal || !Number.isInteger(result.exit_code)) failures.push('execution_incomplete');
 if (result.truncated) failures.push('output_truncated');
 if (result.exit_code !== expected.exit_code) failures.push('exit_code');
 if (expected.stdout_json !== undefined) {
  try { if (!isDeepStrictEqual(JSON.parse(result.stdout || ''), JSON.parse(expected.stdout_json))) failures.push('stdout_json'); }
  catch { failures.push('stdout_json'); }
 } else if ((result.stdout || '') !== (expected.stdout ?? '')) failures.push('stdout');
 if (expected.stderr_error) {
  try {
   const value = JSON.parse(result.stderr || '');
   if (!value || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.error !== 'string' || !value.error.trim()) failures.push('stderr_error');
  } catch { failures.push('stderr_error'); }
 } else if ((result.stderr || '') !== (expected.stderr ?? '')) failures.push('stderr');
 if (expected.max_duration_ms !== undefined && (!Number.isFinite(result.duration_ms) || result.duration_ms > expected.max_duration_ms)) failures.push('duration');
 return { id: expected.id, passed: failures.length === 0, expected_exit_code: expected.exit_code, exit_code: result.exit_code ?? null, duration_ms: result.duration_ms ?? null, failures };
}
async function verifyCases(cases, { execute, unchanged, saveCase, signal }) {
 const results = []; const evidence = [];
 let stopped = null;
 for (const [index, expected] of cases.entries()) {
  signal?.throwIfAborted();
  if (!unchanged()) { stopped = 'source_changed_or_unavailable'; break; }
  const result = await execute(expected.args);
  const assessment = assessCase(expected, result);
  const detail = { assessment, execution: result, assertion_origin: 'caller-authored', expected };
  const ref = saveCase ? await saveCase(index, detail) : null;
  if (ref) assessment.result_ref = ref;
  else evidence.push(detail); // Direct library callers retain evidence themselves.
  results.push(assessment);
  if (result.error || result.signal || !Number.isInteger(result.exit_code) || result.truncated) { stopped = 'execution_incomplete'; break; }
 }
 const passed = results.filter(r => r.passed).length;
 const ok = !stopped && results.length === cases.length && passed === cases.length;
 return { ok, exit_code: ok ? 0 : 1, verification: { kind: 'cli_cases', assertion_origin: 'caller-authored', total: cases.length, executed: results.length, passed, failed: results.length - passed, stopped, cases: results }, ...(evidence.length ? { case_evidence: evidence } : {}) };
}
module.exports = { caseSchema, validateCases, assessCase, verifyCases, MAX_CASES };
