const path = require('node:path');
const os = require('node:os');
const { createConnectionStore, publicConnection, connectionError } = require('./connection-store');
const { createChatGPTAuth } = require('../auth/chatgpt-oauth');
const responses = require('../providers/chatgpt-responses');

function createChatGPTConnections({ env, host, trustProxy, fetchFn, now, cancelRequest }) {
 const enabled = env.CHATGPT_SIGN_IN_ENABLED === '1' && ['127.0.0.1', '::1', 'localhost'].includes(host) && !trustProxy;
 const directory = path.resolve(env.CHATGPT_CREDENTIAL_DIR || path.join(os.homedir(), '.config', 'ai-chat'), 'credentials');
 let store; const active = new Map();
 function getStore() {
  if (!enabled) throw connectionError('chatgpt_disabled', 'ChatGPT sign-in requires CHATGPT_SIGN_IN_ENABLED=1, a loopback server host, and no proxy trust.');
  return store ||= createConnectionStore({ directory, secret: env.ENCRYPTION_SECRET, now });
 }
 const auth = createChatGPTAuth({ getStore, fetchFn, now, onDisconnect(id) { for (const [requestId, connectionId] of active) if (connectionId === id) cancelRequest(requestId); } });
 function binding(profile) {
  const record = getStore().read(profile.connection_id || '');
  if (!record || record.status !== 'connected') throw connectionError('chatgpt_disconnected', 'Connect this profile to ChatGPT in Settings.');
  return { connection_id: record.id, binding_epoch: record.binding_epoch, billing_source: 'chatgpt_plan', harness: 'ai_chat' };
 }
 async function lease(profile, expected) {
  const current = binding(profile);
  if (expected && (current.connection_id !== expected.connection_id || current.binding_epoch !== expected.binding_epoch)) throw connectionError('execution_connection_changed', 'This execution belongs to a different ChatGPT connection or sign-in. Start a new request.');
  return auth.lease(current.connection_id);
 }
 function routes(app) {
  app.use('/api/connections/chatgpt', (req, res, next) => {
   if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).json({ ok: false, error: { code: 'chatgpt_local_only', message: 'ChatGPT connections are available on this computer only.' } });
   next();
  });
  function route(method, url, callback) {
   app[method](`/api/connections/chatgpt${url}`, async (req, res) => {
    try { res.json({ ok: true, ...await callback(req) }); }
    catch (error) { res.status(400).json({ ok: false, error: { code: error.code || 'chatgpt_connection_error', message: error.code ? error.message : 'ChatGPT connection could not complete.', retryable: false } }); }
   });
  }
  route('get', '', () => ({ enabled, connections: enabled ? getStore().list().map(record => publicConnection({ ...record, plan_notice_acknowledged: getStore().read(`notice-${record.id}`)?.acknowledged === true })) : [] }));
  route('post', '/login', req => auth.start({ connectionId: req.body?.connection_id, reconsent: req.body?.reconsent === true }));
  route('get', '/attempts/:id', req => auth.status(req.params.id));
  route('post', '/attempts/:id/cancel', req => { auth.cancel(req.params.id); return { cancelled: true }; });
  route('post', '/:id/acknowledge-plan', req => {
   const record = getStore().read(binding({ connection_id: req.params.id }).connection_id);
   getStore().save({ id: `notice-${record.id}`, acknowledged: true });
   return { acknowledged: true };
  });
  route('post', '/:id/disconnect', req => auth.disconnect(req.params.id));
  route('get', '/:id/models', async req => ({ models: await responses.listModels({ lease: await lease({ connection_id: req.params.id }), fetchFn }) }));
 }
 return { enabled, directory, routes, binding, lease,
  track(requestId, profile) { active.set(requestId, profile.connection_id); return () => active.delete(requestId); },
  async close() { await auth.close(); store?.close(); }
 };
}
module.exports = { createChatGPTConnections };
