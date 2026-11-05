// Explicit, reviewable refresh of the bundled public Nous free-model snapshot.
const fs = require('node:fs');
const path = require('node:path');
const { readBoundedResponse } = require('../lib/bounded-response');
const destination = path.join(__dirname, '../lib/hermes-free-models.json');
const source = 'https://inference-api.nousresearch.com/v1/models';
function isZero(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
    && Number.isFinite(Number(value)) && Number(value) === 0;
}
function snapshot(catalog, previous, now = new Date()) {
  if (!Array.isArray(catalog?.data) || !catalog.data.length || catalog.data.length > 4096) throw Error('Invalid Nous catalog');
  const models = catalog.data.filter(m => typeof m.id === 'string' && /^[a-zA-Z0-9._:/-]{1,160}$/.test(m.id)
    && isZero(m.pricing?.prompt) && isZero(m.pricing?.completion))
    .map(m => ({id: m.id, ...(Number.isSafeInteger(m.context_length) && m.context_length >= 1024 && m.context_length <= 4000000 ? {context_length: m.context_length} : {}), pricing: {prompt: '0', completion: '0'}}));
  const active = new Set(models.map(m => m.id));
  if (!models.length || active.size !== models.length) throw Error('Empty or duplicate free-model catalog; snapshot unchanged');
  // Keep the existing order for surviving suggestions; append newly available models.
  const order = new Map(previous.models.map((m, i) => [m.id, i]));
  models.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.id.localeCompare(b.id));
  return {verified_at: now.toISOString(), source,
    verification: 'Public catalog presence and zero prompt/completion pricing; authenticated inference not verified.', models,
    retired_model_ids: [...new Set([...previous.retired_model_ids, ...previous.models.map(m => m.id)])].filter(id => !active.has(id)).sort()};
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--write') || args.length > 1) throw Error('Usage: node scripts/refresh-hermes-models.js [--write]');
  const response = await fetch(source, {redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok) { await response.body?.cancel(); throw Error(`Nous catalog HTTP ${response.status}`); }
  const next = snapshot(JSON.parse(await readBoundedResponse(response, 8 * 1024 * 1024, 'catalog_too_large')), JSON.parse(fs.readFileSync(destination, 'utf8')));
  if (args.includes('--write')) {
    const temporary = `${destination}.tmp-${process.pid}`;
    try { fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', {flag: 'wx'}); fs.renameSync(temporary, destination); }
    finally { fs.rmSync(temporary, {force: true}); }
  }
  console.log(JSON.stringify(next, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {snapshot};
