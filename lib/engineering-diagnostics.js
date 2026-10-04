// Bounded guidance only. Never retries, changes backends, or executes a probe.
function diagnosticMessage(state, receipts) {
 if (!state.contract || !['work', 'repair'].includes(state.phase)) return null;
 const groups = new Map();
 for (const receipt of receipts.slice(-32)) {
  if (!['local_shell', 'local_kujo'].includes(receipt.tool_name) || !['completed', 'failed'].includes(receipt.status)) continue;
  const r = receipt.result || {};
  const failed = r.ok === false || Boolean(r.error) || Number.isInteger(r.exit_code) && r.exit_code !== 0;
  if (!failed) continue;
  // Controlled categories, never promote arbitrary tool output into instructions.
  const code = String(r.error?.code || 'nonzero_exit');
  const category = /timeout|budget/.test(code) ? 'timeout' : /invalid.*argument|schema/.test(code) ? 'arguments' : 'execution';
  const key = `${receipt.tool_name}:${category}`;
  groups.set(key, (groups.get(key) || 0) + 1);
 }
 state.diagnostic_notices ||= [];
 if (state.diagnostic_notices.length >= 3) return null;
 for (const [key, count] of groups) {
  if (count < 2 || state.diagnostic_notices.includes(key)) continue;
  state.diagnostic_notices.push(key);
  return { role: 'system', content: `Repeated engineering ${key.split(':')[1]} failures were recorded. Stop blind retries. Recover the relevant saved receipts, isolate a minimal pure reproduction, and check the actual runtime and documented API. For suspicious language behavior compare the same pure reproduction on an explicitly available backend; keep original evidence and report differences. Never automatically replay consequential work, switch the project runtime, or increase timeouts without evidence. For uncertain termination, reconcile the prior process/output first. Preserve time to deliver verified artifacts and disclose unresolved limits.` };
 }
 return null;
}
module.exports = { diagnosticMessage };
