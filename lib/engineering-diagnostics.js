const { createHash } = require('node:crypto');
// Bounded guidance only. Never retries, changes backends, or executes a probe.
function diagnosticMessage(state, receipts) {
 if (!state.contract || !['work', 'repair'].includes(state.phase)) return null;
 state.diagnostic_notices ||= [];
 if (state.diagnostic_notices.length >= 6) return null;
 const reads = receipts.slice(-6);
 const signatures = new Map();
 for (const receipt of reads) {
  const r = receipt.result;
  if (receipt.tool_name !== 'local_file_read' || receipt.status !== 'completed'
   || r?.ok === false || r?.error || r?.complete !== true || r?.truncated !== false
   || typeof r.content !== 'string' || !r.content) break;
  let input; try { input = typeof receipt.input === 'string' ? JSON.parse(receipt.input) : receipt.input; } catch { break; }
  if (!input?.root_id || !r.path) break;
  const signature = createHash('sha256').update(JSON.stringify([input.root_id, r.path, input.offset ?? 1, input.column ?? 1, r.content])).digest('hex');
  signatures.set(signature, (signatures.get(signature) || 0) + 1);
 }
 if (reads.length === 6 && [...signatures.values()].reduce((a,b)=>a+b,0) === 6
  && signatures.size <= 2 && [...signatures.values()].every(n=>n>=3)
  && !state.diagnostic_notices.includes('unchanged_reads')) {
  state.diagnostic_notices.push('unchanged_reads');
  return { role: 'system', content: 'Progress check: the last six successful file reads returned the same complete contents for at most two files. Those results are already available. Use the retained evidence to take the next requested action or identify a concrete blocker; do not repeat unchanged discovery. If context is missing, recover the saved receipt with tool_result_read. A new read is appropriate when the file changed or a different range is needed. This notice does not authorize writes, skip validation, change permissions, or repeat consequential work.' };
 }

 const groups = new Map();
 for (const receipt of receipts.slice(-32)) {
  if (!['local_shell', 'local_kujo'].includes(receipt.tool_name) || !['completed', 'failed'].includes(receipt.status)) continue;
  const r = receipt.result || {};
  const failed = r.ok === false || Boolean(r.error) || Number.isInteger(r.exit_code) && r.exit_code !== 0;
  if (!failed) {
   for (const key of groups.keys()) if (key.startsWith(receipt.tool_name + ':')) groups.delete(key);
   continue;
  }
  // Controlled categories, never promote arbitrary tool output into instructions.
  const code = String(r.error?.code || 'nonzero_exit');
  const category = /timeout|budget/.test(code) ? 'timeout' : /invalid.*argument|schema/.test(code) ? 'arguments' : 'execution';
  const key = `${receipt.tool_name}:${category}`;
  groups.set(key, (groups.get(key) || 0) + 1);
 }
 for (const [key, count] of groups) {
  const stage = count >= 5 ? `${key}:persistent` : key;
  if (count < 2 || state.diagnostic_notices.includes(stage)) continue;
  state.diagnostic_notices.push(stage);
  if (count >= 5) return { role: 'system', content: 'Persistent engineering failures remain after initial diagnosis. Before more implementation, recover the smallest decisive receipt and report a compact working state: exact failing command/API, expected versus observed behavior, verified files, and one evidence-based next check. Reduce to a minimal pure reproduction and consult matching documentation. Do not expand scope or repeat unchanged failures. If no supported next check fits the remaining budget, finish with the blocker and verified partial artifacts. This advisory grants no permission and does not authorize replay.' };
  return { role: 'system', content: `Repeated engineering ${key.split(':')[1]} failures were recorded. Stop blind retries. Recover the relevant saved receipts, isolate a minimal pure reproduction, and check the actual runtime and documented API. For suspicious language behavior compare the same pure reproduction on an explicitly available backend; keep original evidence and report differences. Never automatically replay consequential work, switch the project runtime, or increase timeouts without evidence. For uncertain termination, reconcile the prior process/output first. Preserve time to deliver verified artifacts and disclose unresolved limits.` };
 }
 return null;
}
module.exports = { diagnosticMessage };
