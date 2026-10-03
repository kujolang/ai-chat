const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readBoundedResponse } = require('./bounded-response');
const DAY = 86400000;
const validLimit = value => Number.isSafeInteger(value) && value >= 1024 && value <= 4000000;
const validOutput = value => Number.isSafeInteger(value) && value > 0 && value <= 4000000;

// Only numeric capacity enters the budget. Never retain catalog descriptions,
// prompts, credentials, or entitlements. Output limits are separate from context.
function modelLimits(model) {
 const context = model?.context_window ?? model?.context_length;
 if (!validLimit(context)) return null;
 const percent = model.effective_context_window_percent ?? 100;
 if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
 const window = Math.floor(Math.min(context, validLimit(model.top_provider?.context_length) ? model.top_provider.context_length : context) * percent / 100);
 if (!validLimit(window)) return null;
 const output = model.max_output_tokens ?? model.top_provider?.max_completion_tokens;
 return { window_tokens: window, ...(validOutput(output) ? { max_output_tokens: output } : {}) };
}
function ollamaLimits(data) {
 const info = data?.model_info;
 const architecture = info?.['general.architecture'];
 if (typeof architecture !== 'string') return null;
 return modelLimits({ context_window: info[`${architecture}.context_length`] });
}
function sourceUrl(value) {
 const url = new URL(value);
 if (url.username || url.password || url.search || url.hash ||
  !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw Error('Context source must be HTTPS or loopback HTTP without credentials/query/fragment.');
 return url.toString().replace(/\/+$/, '');
}
function createModelContextCatalog({ file, sources = {}, fetchFn = fetch, now = Date.now, loadSpecial, warn = () => {} }) {
 const records = new Map(), pending = new Map(), attempts = new Map(), catalogs = new Map();
 const shutdown = new AbortController();
 let closed = false;
 for (const source of Object.values(sources)) {
  if (!source || !['ollama','models'].includes(source.type)) throw Error('Invalid model context source type.');
  source.url = sourceUrl(source.url);
 }
 try {
  if (file && fs.existsSync(file)) {
   if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error('oversized');
   const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
   if (!Array.isArray(rows) || rows.length > 4096) throw Error('invalid');
   for (const row of rows) if (typeof row.key === 'string' && /^[a-f0-9]{64}$/.test(row.key) && validLimit(row.window_tokens) &&
    Number.isFinite(row.fetched_at) && row.fetched_at <= now() + 300000 && now() - row.fetched_at <= 30 * DAY &&
    typeof row.source === 'string' && row.source.length <= 300) records.set(row.key, {
     key: row.key, window_tokens: row.window_tokens, fetched_at: row.fetched_at, source: row.source,
     ...(validOutput(row.max_output_tokens) ? { max_output_tokens: row.max_output_tokens } : {})
    });
  }
 } catch { warn('[context] Discovery cache unavailable or invalid; limits will be rediscovered.'); }
 function source(profile) { return Object.hasOwn(sources, profile.id) ? sources[profile.id] : Object.hasOwn(sources, profile.provider_id) ? sources[profile.provider_id] : null; }
 function key(profile, model) { return crypto.createHash('sha256').update(JSON.stringify([profile.id, profile.provider_id, profile.base_url || '', profile.connection_id || '', source(profile), model])).digest('hex'); }
 function get(profile, model) {
  const row = records.get(key(profile, model));
  return row && now() - row.fetched_at <= 30 * DAY ? row : null;
 }
 async function json(url, options = {}) {
  const response = await fetchFn(url, { ...options, redirect: 'error', signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(10000)]) });
  if (!response.ok) { await response.body?.cancel(); throw Error(`catalog HTTP ${response.status}`); }
  return JSON.parse(await readBoundedResponse(response, 8 * 1024 * 1024, 'context_catalog_too_large'));
 }
 async function catalog(profile, spec) {
  const id = spec ? JSON.stringify(spec) : JSON.stringify([profile.id,profile.provider_id,profile.base_url,profile.connection_id]);
  const cached = catalogs.get(id);
  if (cached && now() < cached.expires) return cached.value;
  const inflightKey = `catalog:${id}`;
  if (pending.has(inflightKey)) return pending.get(inflightKey);
  const promise = (async () => {
   const data = spec ? await json(`${spec.url}/models`) : await loadSpecial?.(profile, shutdown.signal);
   const list = data?.data || data?.models;
   if (!Array.isArray(list) || list.length > 4096) throw Error('catalog missing model list');
   const value = new Map();
   for (const item of list) {
    const name = item?.id ?? item?.slug;
    const limits = modelLimits(item);
    if (typeof name === 'string' && name.length <= 200 && limits) value.set(name, limits);
   }
   if (catalogs.size >= 128) catalogs.delete(catalogs.keys().next().value);
   catalogs.set(id, {expires: now() + DAY, value});
   return value;
  })().catch(error => {
   if (catalogs.size >= 128) catalogs.delete(catalogs.keys().next().value);
   catalogs.set(id,{expires:now()+5*60000,value:new Map()});
   throw error;
  }).finally(() => pending.delete(inflightKey));
  pending.set(inflightKey,promise); return promise;
 }
 async function show(spec, model) {
  const id = `show:${spec.url}:${model}`;
  const cached = catalogs.get(id);
  if (cached && now() < cached.expires) return cached.value;
  if (pending.has(id)) return pending.get(id);
  const work = json(`${spec.url}/api/show`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model})})
   .then(ollamaLimits).then(value=>{
    if (catalogs.size >= 128) catalogs.delete(catalogs.keys().next().value);
    catalogs.set(id,{expires:now()+(value?DAY:5*60000),value});return value;
   }).finally(()=>pending.delete(id));
  pending.set(id,work);return work;
 }
 function persist() {
  if (closed || !file) return;
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
   fs.mkdirSync(path.dirname(file), {recursive:true});
   fs.writeFileSync(temporary, JSON.stringify([...records.values()])+'\n', {mode:0o600,flag:'wx'});
   fs.renameSync(temporary,file);
  } finally { fs.rmSync(temporary,{force:true}); }
 }
 async function ensure(profile, model) {
  if (closed) return get(profile, model);
  const id = key(profile,model), old = get(profile,model), time = now();
  if (old && time - old.fetched_at < DAY) return old;
  if (pending.has(id)) return pending.get(id);
  if (time - (attempts.get(id) ?? -Infinity) < 5 * 60000) return old;
  if (attempts.size >= 4096) attempts.delete(attempts.keys().next().value);
  attempts.set(id,time);
  const work = (async () => {
   const spec = source(profile);
   try {
    const limits = spec?.type === 'ollama'
     ? await show(spec,model)
     : (await catalog(profile,spec)).get(model);
    if (!limits) return old;
    const row = {key:id,...limits,fetched_at:now(),source:`discovered:${spec?.type || profile.provider_id}:${new Date(now()).toISOString()}`};
    if (records.size >= 4096 && !records.has(id)) records.delete(records.keys().next().value);
    records.set(id,row);
    try { persist(); } catch { warn('[context] Discovered limits are active but could not be persisted.'); }
    return row;
   } catch { return old; }
  })().finally(() => pending.delete(id));
  pending.set(id,work); return work;
 }
 return {ensure,get,async close() { closed = true; shutdown.abort(); await Promise.allSettled([...pending.values()]); }};
}
module.exports = {createModelContextCatalog,modelLimits,ollamaLimits,sourceUrl};
