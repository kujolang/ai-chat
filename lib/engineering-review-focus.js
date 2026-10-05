const { assessContract } = require('./engineering-contract');
const { verificationInventory } = require('./engineering-evidence');
const inputOf = r => { try { return typeof r.input === 'string' ? JSON.parse(r.input) : r.input || {}; } catch { return {}; } };

// Deterministic evidence gaps go directly to the worker. Passing caller-authored
// tests never substitutes for semantic review: one focused review still follows.
function deterministicGaps(receipts, taskContract) {
 const inventory = verificationInventory(receipts, taskContract?.evidence?.map(e => e.result_ref));
 const assessment = taskContract ? assessContract(taskContract, receipts) : null;
 const gaps = [...(assessment?.gaps || [])];
 if (!inventory.checks.some(c => c.exit_code === 0 && !c.output_truncated)) gaps.push('No successful final verification receipt was recorded.');
 if (inventory.writes_after_last_successful_check.length) gaps.push('Rerun checks after the last source write: ' + inventory.writes_after_last_successful_check.join(', '));
 return [...new Set(gaps)];
}
function focusedPacket(request, receipts, candidate, taskContract, priorFindings = []) {
 const inventory = verificationInventory(receipts, taskContract?.evidence?.map(e => e.result_ref));
 const latest = new Map();
 for (const r of receipts) {
  const input = inputOf(r);
  if (r.tool_name === 'local_file_write' && r.status === 'completed' && r.result?.ok !== false && !r.result?.error)
   latest.set(`${input.root_id}:${input.path}`, { r, input });
 }
 const changes = [...latest.values()].map(({r,input}) => {
  const previous = receipts.slice(0, receipts.indexOf(r)).findLast(x => x.tool_name === 'local_file_read' && x.result?.ok !== false && !x.result?.error && inputOf(x).root_id === input.root_id && inputOf(x).path === input.path);
  const before = previous?.result?.content;
  const after = input.content;
  // Bounded changed-line excerpt, never claimed to be a complete diff.
  let diff = null;
  if (input.mode !== 'append' && previous?.result?.truncated === false
   && (inputOf(previous).offset ?? 1) === 1 && (inputOf(previous).column ?? 1) === 1
   && typeof before === 'string' && typeof after === 'string') {
   const a = before.split('\n'), b = after.split('\n'); let start=0, end=0;
   while(start < Math.min(a.length,b.length) && a[start] === b[start]) start++;
   while(end < Math.min(a.length,b.length)-start && a[a.length-1-end] === b[b.length-1-end]) end++;
   const removed=a.slice(start,a.length-end).join('\n'), added=b.slice(start,b.length-end).join('\n');
   diff={line:start+1, removed:removed.slice(0,500), added:added.slice(0,500), truncated:removed.length>500 || added.length>500};
  }
  return {root_id:input.root_id,path:input.path,result_ref:r.call_id,write_mode:input.mode || 'create',diff, requires_final_read:true};
 });
 const selected = new Set((taskContract?.evidence || []).map(e => e.result_ref));
 for (const c of inventory.checks.slice(-4)) selected.add(c.result_ref);
 const checks = inventory.checks.filter(c => selected.has(c.result_ref));
 return JSON.stringify({
  request:request.slice(-32000),request_truncated:request.length>32000,
  candidate:candidate.slice(-2000),candidate_truncated:candidate.length>2000,
  task_contract:taskContract ? {...taskContract,assessment:assessContract(taskContract,receipts)} : null,
  final_changes:changes.slice(-16), omitted_changes:Math.max(0,changes.length-16),
  decisive_checks:checks, prior_findings:priorFindings,
  selection:'Latest writes and linked/recent checks. Historical discovery, failed intermediate drafts and duplicate reads intentionally omitted. Recover referenced receipts as needed. Inspect final entry point and relevant imports, not only helpers. Diffs compare the last complete read to the last full write, not the whole task; missing diff is not proof of no change.',
  evidence_limit:inventory.limitation
 });
}
module.exports = { deterministicGaps, focusedPacket };
