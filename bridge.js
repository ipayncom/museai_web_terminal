// VM-side terminal bridge (PERSISTENT MODE): PTY <-> public MQTT broker (WSS through proxy), AES-256-GCM.
// Credentials are stable, read from session.json (chmod 600), so the same page link keeps working
// across bridge restarts. A supervisor (ensure.sh via cron) restarts this process if it dies.
// Usage: node bridge.js   (prints READY when the PTY is up)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pty = require('node-pty');
const mqtt = require('mqtt');
const { HttpsProxyAgent } = require('https-proxy-agent');

const DIR = __dirname;
const PIDFILE = path.join(DIR, 'bridge.pid');

// single-instance guard (ignore our own pid, written by the supervisor just before exec)
try {
  const old = fs.readFileSync(PIDFILE, 'utf8').trim();
  const oldPid = parseInt(old, 10);
  if (old && oldPid !== process.pid && (() => { try { process.kill(oldPid, 0); return true; } catch (e) { return false; } })()) {
    console.error('another bridge instance is alive (pid ' + old + '), exiting');
    process.exit(0);
  }
} catch (e) { /* no pidfile */ }
fs.writeFileSync(PIDFILE, String(process.pid));

const sess = JSON.parse(fs.readFileSync(path.join(DIR, 'session.json'), 'utf8'));
const TOKEN = sess.token;
const KEY = Buffer.from(sess.key, 'base64');
const TOPIC_I = `ht/${TOKEN}/i`;   // page -> bridge
const TOPIC_O = `ht/${TOKEN}/o`;   // bridge -> page
const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;

function enc(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const ct = Buffer.concat([c.update(pt), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}
function dec(b64) {
  const b = Buffer.from(b64, 'base64');
  const iv = b.subarray(0, 12), tag = b.subarray(12, 28), ct = b.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

const client = mqtt.connect(BROKER, {
  clientId: 'hatch-term-' + TOKEN.slice(0, 8),
  wsOptions: { agent: new HttpsProxyAgent(proxy), protocol: 'mqtt' },
  connectTimeout: 20000, reconnectPeriod: 5000, keepalive: 30,
});

let term = null;

function shutdown(msg) {
  try { publish({ t: 'e', d: msg }); } catch (e) {}
  try { fs.unlinkSync(PIDFILE); } catch (e) {}
  setTimeout(() => process.exit(0), 800);
}

function publish(obj) {
  const payload = enc(obj);
  // split large output into chunks the broker accepts
  const CH = 12000;
  for (let i = 0; i < payload.length; i += CH) {
    client.publish(TOPIC_O, payload.slice(i, i + CH) + (i + CH < payload.length ? '~+' : '~.'), { qos: 0 });
  }
}

client.on('connect', () => {
  client.subscribe(TOPIC_I, { qos: 0 }, (err) => {
    if (err) { console.error('subscribe failed', err.message); process.exit(1); }
    term = pty.spawn('bash', [], {
      name: 'xterm-256color', cols: 100, rows: 30,
      cwd: process.env.HOME || '/home/hatch',
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    term.onData((data) => publish({ t: 'd', d: data }));
    term.onExit(({ exitCode }) => shutdown('shell exited (' + exitCode + ')'));
    console.log('READY');
    publish({ t: 'ready' });
  });
});
client.on('message', (topic, msg) => {
  if (topic !== TOPIC_I) return;
  const parts = msg.toString().split('~');
  // reassemble chunked payloads
  handleChunk(parts[0], parts[1] === '+');
});
let pending = '';
function handleChunk(chunk, more) {
  pending += chunk;
  if (more) return;
  const raw = pending; pending = '';
  let m;
  try { m = dec(raw); } catch (e) { return; }
  if (!term) return;
  if (m.t === 'd' && typeof m.d === 'string') term.write(m.d);
  else if (m.t === 'r') term.resize(Math.min(m.c || 100, 240), Math.min(m.r || 30, 80));
  else if (m.t === 'x') shutdown('closed by user');
  else if (m.t === 'hello') publish({ t: 'ready' });
}
client.on('error', (e) => console.error('mqtt error:', e.message));
process.on('SIGTERM', () => shutdown('bridge stopped'));
process.on('exit', () => { try { fs.unlinkSync(PIDFILE); } catch (e) {} });
