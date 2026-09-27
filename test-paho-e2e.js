// E2E test: drive the vendored paho-mqtt 1.1.0 browser bundle exactly the way
// terminal.html does (Paho.Client URI form, connect opts, subscribe, 4-arg send).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const WS = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
class PWS extends WS {
  constructor(url, protocols) {
    super(url, protocols, { agent: new HttpsProxyAgent(proxy) });
  }
}

const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Error,
  Uint8Array, ArrayBuffer, DataView, TextEncoder: undefined,
  setTimeout, clearTimeout, setInterval, clearInterval,
  WebSocket: PWS,
};
sandbox.self = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, 'vendor', 'paho.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'paho.js' });

const Paho = sandbox.Paho;
if (!Paho || !Paho.Client) { console.log('FAIL: Paho.Client missing'); process.exit(1); }
console.log('Paho.Client present');

const TOPIC = 'ht/e2e-' + Math.random().toString(16).slice(2) + '/t';
const client = new Paho.Client('wss://broker.emqx.io:8084/mqtt', 'node-e2e-' + Date.now());

let gotMsg = null;
client.onConnectionLost = (e) => { console.log('connection lost', e && e.errorMessage); process.exit(1); };
client.onMessageArrived = (m) => { gotMsg = m.payloadString; };

client.connect({
  useSSL: true, timeout: 20,
  onSuccess: () => {
    console.log('connected');
    client.subscribe(TOPIC, { qos: 0 });
    // same 4-arg send form the page uses
    client.send(TOPIC, 'hello-e2e', 0, false);
  },
  onFailure: (e) => { console.log('FAIL: connect failed', e && e.errorMessage); process.exit(1); },
});

const t0 = Date.now();
const iv = setInterval(() => {
  if (gotMsg === 'hello-e2e') {
    console.log('E2E OK: published and received via Paho.Client (' + (Date.now() - t0) + 'ms)');
    try { client.disconnect(); } catch (e) {}
    clearInterval(iv);
    process.exit(0);
  }
  if (Date.now() - t0 > 30000) {
    console.log('FAIL: timed out waiting for message, isConnected=' + client.isConnected());
    clearInterval(iv);
    process.exit(1);
  }
}, 500);
