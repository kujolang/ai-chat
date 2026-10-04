// Inspection never resumes generation or replays tools. Missing usage stays unknown.
async function reconcileBenchmarkEvidence(result, requestId, inspect) {
 result.execution_id = requestId;
 try {
  const payload = await inspect(requestId);
  const run = payload?.execution;
  if (!run || run.id !== requestId) throw new Error('Execution identity mismatch.');
  const evidence = run.result || run.checkpoint || {};
  for (const key of ['usage', 'provider_rounds', 'tool_calls_executed', 'tool_input_repairs']) if (evidence[key] != null) result[key] = evidence[key];
  result.usage_complete = run.status !== 'running' && evidence.usage_complete === true;
  result.execution_status = run.status;
  result.usage_source = 'execution_journal';
 } catch {
  result.usage_complete = false;
  result.usage_source = 'stream_partial';
 }
 return result;
}
module.exports = { reconcileBenchmarkEvidence };
