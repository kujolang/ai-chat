// A plan and evidence index, not a test executor or a correctness certificate.
const NAME = 'engineering_contract';
const schema = { type: 'function', function: { name: NAME,
 description: 'Record a compact engineering plan before implementation, then link real executable check receipts to its invariants before completion. Submit alone. This grants no tools or permissions. Evidence records execution, not proof that tests cover the claim.',
 parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
  action: { type: 'string', enum: ['plan', 'evidence'] },
  invariants: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'invariant', 'check'], properties: {
   id: { type: 'string', maxLength: 40, pattern: '^[A-Za-z0-9_-]{1,40}$' }, invariant: { type: 'string', maxLength: 400 }, check: { type: 'string', maxLength: 400 }
  } } },
  evidence: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false, required: ['id', 'result_ref'], properties: { id: { type: 'string', maxLength: 40, pattern: '^[A-Za-z0-9_-]{1,40}$' }, result_ref: { type: 'string', maxLength: 256 } } } }
 } } } };
const inputOf = r => { try { return typeof r.input === 'string' ? JSON.parse(r.input) : r.input || {}; } catch { return {}; } };
const isWrite = r => r.tool_name === 'local_file_write' && r.status === 'completed' && r.result?.ok !== false && !r.result?.error;
function executableCheck(r) {
 return r?.status === 'completed' && ['local_shell', 'local_kujo'].includes(r.tool_name)
  && r.result?.exit_code === 0 && r.result?.ok !== false && !r.result?.error && !r.result?.truncated
  && (r.tool_name !== 'local_kujo' || ['run', 'test', 'benchmark', 'verify'].includes(inputOf(r).operation));
}
function applyContract(state, input, receipts) {
 const reject = message => ({ ok: false, error: { code: 'engineering_contract_invalid', message } });
 if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('Submit a plan or evidence object.');
 if (Object.keys(input).some(k => !['action', 'invariants', 'evidence'].includes(k))) return reject('Unexpected contract field.');
 if (input.action === 'plan') {
  if (state.plan) return reject('The original plan is immutable. Address it or disclose the unmet requirement; do not remove failing invariants.');
  const rows = input.invariants;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 8) return reject('Use 1–8 task-specific invariants.');
  const ids = new Set();
  for (const row of rows) {
   if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(row.id) || ids.has(row.id)
    || Object.keys(row).some(k => !['id', 'invariant', 'check'].includes(k))
    || !['invariant', 'check'].every(k => typeof row[k] === 'string' && row[k].trim() && row[k].length <= 400)) return reject('Each invariant needs a unique short ID, a statement and an executable verification plan (max 400 characters each).');
   ids.add(row.id);
  }
  state.plan = rows.map(({ id, invariant, check }) => ({ id, invariant, check }));
  state.late = receipts.some(isWrite);
  state.evidence = [];
  return { ok: true, late_plan: state.late, message: 'Plan recorded. Execute task-relevant failure/boundary checks on final source and link their real result_ref values. Test design and coverage still require review.' };
 }
 if (input.action !== 'evidence' || !state.plan) return reject('Record the plan first.');
 if (!Array.isArray(input.evidence) || input.evidence.length > 16) return reject('Evidence must contain at most 16 invariant/receipt links.');
 const ids = new Set(state.plan.map(r => r.id));
 for (const row of input.evidence) {
  if (!row || Object.keys(row).some(k => !['id', 'result_ref'].includes(k)) || !ids.has(row.id) || typeof row.result_ref !== 'string' || row.result_ref.length > 256 || !executableCheck(receipts.find(r => r.call_id === row.result_ref))) return reject('Each link must name a planned invariant and a real completed executable receipt with exit 0 and untruncated output. Syntax checks alone are insufficient.');
 }
 state.evidence = input.evidence.map(({ id, result_ref }) => ({ id, result_ref }));
 return { ok: true, ...assessContract(state, receipts) };
}
function observedSourceStillMatches(receipts, index) {
 const receipt = receipts[index];
 const manifest = receipt.result?.verification_manifest || (receipt.result?.source ? [receipt.result.source] : []);
 if (!manifest.length) return true; // Legacy/shell receipts retain their explicitly limited temporal evidence.
 const hashes = new Map(manifest.map(row => [row.path, row.sha256]));
 const root = inputOf(receipt).root_id;
 for (const later of receipts.slice(index + 1)) {
  if (later.tool_name !== 'local_kujo' || inputOf(later).root_id !== root) continue;
  const result = later.result || {};
  const observed = result.verification_manifest_after || result.verification_manifest || (result.source_after ? [result.source_after] : result.source ? [result.source] : []);
  if (observed.some(row => hashes.has(row.path) && (hashes.get(row.path) !== row.sha256 || result.source_unchanged === false))) return false;
 }
 return true;
}
function assessContract(state, receipts) {
 if (!state.plan) return { complete: false, gaps: ['No task-specific invariant plan was recorded.'] };
 const lastWrite = receipts.reduce((last, r, i) => isWrite(r) ? i : last, -1);
 const gaps = [];
 for (const invariant of state.plan) {
  const links = (state.evidence || []).filter(e => e.id === invariant.id);
  if (!links.some(e => { const i = receipts.findIndex(r => r.call_id === e.result_ref); return i > lastWrite && executableCheck(receipts[i]) && observedSourceStillMatches(receipts, i); })) gaps.push(`Missing final-source executable evidence for ${invariant.id}.`);
 }
 return { complete: gaps.length === 0, late_plan: Boolean(state.late), gaps,
  limitation: 'Receipt ordering and later observed declared-file hashes only. Unobserved shell edits, undeclared dependencies and semantic test coverage require inspection. Linked tests may be model-authored; they are not independent oracles.' };
}
module.exports = { NAME, schema, applyContract, assessContract };
