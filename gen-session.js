// Generates session.json with a fresh random topic token + AES-256-GCM key.
// Run once per deployment:  node gen-session.js
// The token scopes the MQTT topics (ht/<token>/i|o); the key encrypts every
// payload end-to-end. NEVER commit session.json to git.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'session.json');
if (fs.existsSync(out)) {
  console.error('session.json already exists, refusing to overwrite. Delete it first for a fresh one.');
  process.exit(1);
}
const s = {
  token: crypto.randomBytes(16).toString('hex'),
  key: crypto.randomBytes(32).toString('base64'),
  created: new Date().toISOString(),
};
fs.writeFileSync(out, JSON.stringify(s, null, 2), { mode: 0o600 });
console.log('wrote', out, '(mode 600)');
