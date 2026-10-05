// Controller-side acceptance assets. Never pass this manifest or test content to a builder.
const fs = require('node:fs');
const crypto = require('node:crypto');
function acceptanceManifest(paths) {
 if (!Array.isArray(paths) || !paths.length) throw Error('Acceptance files are required');
 return Object.fromEntries(paths.map(file => {
  if (!fs.lstatSync(file).isFile()) throw Error('Acceptance input must be a regular file: ' + file);
  return [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
 }));
}
function assertAcceptanceUnchanged(manifest) {
 if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Object.keys(manifest).length) throw Error('Acceptance manifest is empty or invalid');
 if (Object.values(manifest).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) throw Error('Acceptance hashes must be SHA-256 hex strings');
 const current = acceptanceManifest(Object.keys(manifest));
 for (const file of Object.keys(manifest)) if (manifest[file] !== current[file]) throw Error('Acceptance asset changed; benchmark is invalid: ' + file);
 return true;
}
module.exports = { acceptanceManifest, assertAcceptanceUnchanged };
