const { createHash } = require('node:crypto');
const READ_LIMIT = 12;
const WARNING_READS = 6;

// Compare observed complete snapshots, never command text or model intent.
function snapshotKey(receipt) {
 const r = receipt?.result;
 if (receipt?.tool_name !== 'local_file_read' || receipt.status !== 'completed'
  || r?.ok === false || r?.error || r?.complete !== true || r?.truncated !== false
  || typeof r.content !== 'string' || !r.path || !receipt.call_id) return null;
 let input;
 try { input = typeof receipt.input === 'string' ? JSON.parse(receipt.input) : receipt.input; } catch { return null; }
 if (!input?.root_id) return null;
 const view = JSON.stringify([input.root_id, r.path, input.offset ?? 1, input.column ?? 1]);
 return {view, key:createHash('sha256').update(JSON.stringify([view, r.meta?.mtime_ms ?? null, r.content])).digest('hex')};
}

function developmentProgressEnabled(tools, phase) {
 return !['review','final'].includes(phase) && tools.some(t => ['local_file_write','local_shell','local_kujo'].includes(t.function.name));
}

function resumeReadProgress(saved) {
 if (saved?.stopped_at) return { after_call_id: saved.stopped_at };
 return structuredClone(saved || {});
}

function inspectReadProgress(state, receipts) {
 const start = state.after_call_id ? receipts.findIndex(r => r.call_id === state.after_call_id) + 1 : 0;
 const tail = [];
 const counts = new Map(), versions = new Map();
 for (let i = receipts.length - 1; i >= start && tail.length < READ_LIMIT; i--) {
  const receipt = receipts[i], snapshot = snapshotKey(receipt);
  if (!snapshot) break;
  const {key,view} = snapshot;
  if ((versions.has(view) && versions.get(view) !== key) || (!counts.has(key) && counts.size === 2)) break;
  versions.set(view,key);
  counts.set(key, (counts.get(key) || 0) + 1);
  tail.unshift({receipt, key});
 }
 // Each view must actually repeat: a newly changed snapshot or range resets it.
 if (tail.length < WARNING_READS || [...counts.values()].some(n => n < 3)) return {action:'none'};
 if (tail.length === READ_LIMIT) {
  state.stopped_at = tail.at(-1).receipt.call_id;
  return {action:'stop', reads:tail.length};
 }
 const warn = !tail.some(({receipt}) => receipt.call_id === state.warned_at);
 if (warn) state.warned_at = tail.at(-1).receipt.call_id;
 return {action:'recover', warn, tail, reads:tail.length};
}

// Only provider-facing duplicate bodies change. Journal results and assistant
// text/reasoning are untouched; retain the newest full result for each snapshot.
function compactRepeatedReads(messages, tail) {
 const latest = new Map(), keys = new Map();
 for (const {receipt,key} of tail) { latest.set(key,receipt.call_id); keys.set(receipt.call_id,key); }
 const full = new Map();
 for (const message of messages) {
  if (message.role !== 'tool') continue;
  const key = keys.get(message.tool_call_id);
  if (!key || latest.get(key) !== message.tool_call_id) continue;
  try {
   const result = JSON.parse(message.content);
   const observed = tail.find(x => x.receipt.call_id === message.tool_call_id).receipt.result;
   if (result.complete === true && result.truncated === false && result.content === observed.content)
    full.set(key, result.saved_result_ref || message.tool_call_id);
  } catch { /* A missing/compacted latest result cannot replace any evidence. */ }
 }
 let changed = 0;
 for (const message of messages) {
  if (message.role !== 'tool') continue;
  const key = keys.get(message.tool_call_id), ref = full.get(key);
  if (!ref || latest.get(key) === message.tool_call_id) continue;
  let result;
  try { result = JSON.parse(message.content); } catch { continue; }
  const compact = JSON.stringify({compacted:true, duplicate_read:true,
   saved_result_ref:result.saved_result_ref || message.tool_call_id,
   same_content_as:ref, path:result.path,
   message:'Identical complete file contents are retained in the newest read result. Use that evidence; saved_result_ref still retrieves this original result.'});
  if (compact.length < message.content.length) { message.content = compact; changed++; }
 }
 return changed;
}

const recoveryMessage = {role:'system', content:'Read progress recovery: repeated successful reads returned unchanged complete file contents. Duplicate bodies now reference the newest full result; all originals remain available through tool_result_read. Use that evidence to implement or verify the requested work, or report the concrete blocker. Changed files and new ranges remain readable. Twelve consecutive unchanged reads of at most two views stop this execution as incomplete; no actions will be replayed automatically. This does not grant additional permissions.'};
module.exports = {developmentProgressEnabled, READ_LIMIT, WARNING_READS, inspectReadProgress, resumeReadProgress, compactRepeatedReads, recoveryMessage};
