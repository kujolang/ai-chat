// Receipt ordering is evidence of freshness, not proof of test coverage.
function verificationInventory(receipts) {
 const writes = new Map(); const checks = [];
 receipts.forEach((r, index) => {
  let input = r.input;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return; } }
  if (!input || r.status !== 'completed' || r.result?.ok === false || r.result?.error) return;
  if (r.tool_name === 'local_file_write' && /\.(?:kujo|go|js|ts|jsx|tsx|py|rs|c|cpp|h)$/.test(input.path || '')) {
   writes.set(`${input.root_id}:${input.path}`, { path: String(input.path).slice(0, 2048), root_id: input.root_id, result_ref: r.call_id, index });
  }
  const args = Array.isArray(input.args) ? input.args : [];
  const command = String(input.command || '').split('/').at(-1);
  const verification = r.tool_name === 'local_kujo' && ['check', 'test'].includes(input.operation)
   || r.tool_name === 'local_shell' && (command === 'go' && ['test', 'vet', 'build'].includes(args[0])
    || command === 'node' && args.includes('--test') || ['npm', 'pnpm', 'yarn'].includes(command) && args[0] === 'test'
    || command === 'kujo' && ['check', 'test', 'test-run'].includes(args[0]));
  if (verification) checks.push({ result_ref: r.call_id, index, exit_code: r.result?.exit_code ?? null, source: r.result?.source || null });
 });
 const latestCheck = Math.max(-1, ...checks.filter(c => c.exit_code === 0).map(c => c.index));
 return { files: [...writes.values()].slice(-32), checks: checks.slice(-16),
  writes_after_last_successful_check: [...writes.values()].filter(w => w.index > latestCheck).map(w => w.path).slice(-32),
  limitation: 'Temporal evidence only. Shell writes, dependencies and test coverage require source inspection. Missing checks are not passing checks.' };
}
module.exports = { verificationInventory };
