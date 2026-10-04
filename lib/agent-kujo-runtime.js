const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

// One private PATH alias per local-runtime instance. It contains only `kujo`,
// so selecting a runtime cannot accidentally shadow node/git/other commands.
const ownedDirectories = new Set();
process.once('exit', () => {
 for (const dir of ownedDirectories) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Best effort during process exit. */ } }
});
function createAgentKujoEnvironment(env) {
 let directory, target;
 const close = () => {
  if (!directory) return;
  fs.rmSync(directory, { recursive: true, force: true });
  ownedDirectories.delete(directory); directory = null; target = null;
 };
 return { close, prepare() {
  if (!env.AI_CHAT_AGENT_KUJO_BIN && !env.AI_CHAT_AGENT_KUJO_SHA256) return null;
  const runtime = selectAgentKujo(env);
  if (!directory) {
   directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-agent-kujo-'));
   ownedDirectories.add(directory);
   try { fs.symlinkSync(runtime.command, path.join(directory, 'kujo')); target = runtime.command; }
   catch (error) { close(); throw error; }
  }
  let aliasIntact = false;
  try { aliasIntact = target === runtime.command && fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink() && fs.readlinkSync(path.join(directory, 'kujo')) === target; } catch { /* Missing/replaced alias must not fall through to PATH. */ }
  if (!aliasIntact) {
   throw Object.assign(new Error('Agent Kujo PATH alias changed. Restart the local runtime; no command executed.'), { code: 'local_kujo_runtime_invalid', execution_started: false });
  }
  return { runtime, environment: { PATH: directory + path.delimiter + (process.env.PATH || ''), KUJO_BIN: path.join(directory, 'kujo') } };
 } };
}

function selectAgentKujo(env) {
 const binary = String(env.AI_CHAT_AGENT_KUJO_BIN || '').trim();
 const expected = String(env.AI_CHAT_AGENT_KUJO_SHA256 || '').trim().toLowerCase();
 const backend = String(env.AI_CHAT_AGENT_KUJO_BACKEND || 'default').trim();
 const invalid = message => { throw Object.assign(new Error(message), { code: 'local_kujo_runtime_invalid', execution_started: false }); };
 if (!['default', 'interpreter'].includes(backend)) invalid('AI_CHAT_AGENT_KUJO_BACKEND must be default or interpreter.');
 if (expected && (!binary || !/^[a-f0-9]{64}$/.test(expected))) invalid('A SHA-256 pin requires an absolute AI_CHAT_AGENT_KUJO_BIN and 64 hexadecimal characters.');
 if (!binary) return { command: 'kujo', backend, pinned: false, sha256: null };
 if (!path.isAbsolute(binary)) invalid('AI_CHAT_AGENT_KUJO_BIN must be absolute.');
 let command, sha256;
 try {
  command = fs.realpathSync(binary);
  fs.accessSync(command, fs.constants.X_OK);
  if (!fs.statSync(command).isFile()) invalid('The configured Kujo executable must be a file.');
  sha256 = crypto.createHash('sha256').update(fs.readFileSync(command)).digest('hex');
 } catch { invalid('The configured agent Kujo executable is unavailable. Requalify it; no PATH fallback was used.'); }
 if (expected && sha256 !== expected) invalid('Agent Kujo executable changed since qualification. Requalify it before updating the SHA-256 pin; no command executed.');
 return { command, backend, pinned: Boolean(expected), sha256 };
}
module.exports = { selectAgentKujo, createAgentKujoEnvironment };
