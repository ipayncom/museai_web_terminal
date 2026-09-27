# museai_web_terminal

A browser-based web terminal for a container/VM that has **no inbound network**
(no public IP, no open ports). It works where SSH tunnels and Cloudflare
Tunnels can't: all it needs is outbound HTTPS.

## How it works

```
 browser page (xterm.js)                container
┌──────────────────────┐      ┌──────────────────────────────┐
│ keystrokes           │      │ bridge.js                    │
│   --AES-256-GCM-->  │      │   decrypt -> node-pty bash   │
│                      │ MQTT │   bash output -> encrypt     │
│ encrypted output     │ <--> │                              │
│   <--AES-256-GCM--   │broker│                              │
└──────────────────────┘      └──────────────────────────────┘
        terminal-standalone.html
        (xterm.js + paho-mqtt inlined, zero CDN deps)
```

Both sides dial **out** to a public MQTT broker (`wss://broker.emqx.io:8084/mqtt`)
and rendezvous on two topics derived from a random token:

- `ht/<token>/i` — page → bridge (keystrokes, resize, control)
- `ht/<token>/o` — bridge → page (terminal output)

Every payload is encrypted with **AES-256-GCM**; the broker only ever sees
ciphertext plus metadata (IPs, topic names, sizes). The 256-bit key lives in
`session.json` (container) and inside the built HTML page — nowhere else.

## Quick start

```bash
npm install          # node-pty, mqtt, https-proxy-agent, ws
node gen-session.js  # creates session.json (token + key), mode 600
./fetch-vendor.sh    # downloads xterm.js / paho-mqtt into vendor/
```

Then copy the `token` and `key` from `session.json` into `terminal.html`:

```js
var TOKEN  = "PASTE_TOKEN_FROM_SESSION_JSON";
var KEYB64 = "PASTE_KEY_FROM_SESSION_JSON";
```

Build the self-contained page and start the bridge:

```bash
node build-inline.js   # -> terminal-standalone.html (all libs inlined)
node bridge.js         # prints READY when the PTY is up
```

Open `terminal-standalone.html` in a browser (double-click works, `file://`
is fine). It connects automatically and reconnects on drops.

If the container only reaches the internet through an HTTP(S) proxy, export
`https_proxy` (or `HTTPS_PROXY`) — `bridge.js` picks it up and tunnels the
WebSocket through it via `CONNECT`.

## Keep-alive

- `ensure.sh` — idempotent supervisor: starts `bridge.js` if it isn't running
  (single-instance via `bridge.pid` + `flock`). Run it from a loop or cron:
  ```bash
  while true; do ./ensure.sh; sleep 15; done
  ```
- Because `session.json` is stable, a restarted bridge reuses the same topics —
  an already-open page reconnects by itself.

## Files

| file | what |
|---|---|
| `bridge.js` | PTY ↔ MQTT bridge (the core) |
| `terminal.html` | xterm.js page template (fill in `TOKEN`/`KEYB64`) |
| `build-inline.js` | inlines vendor libs → `terminal-standalone.html` |
| `ensure.sh` | keep-alive supervisor |
| `gen-session.js` | generates `session.json` |
| `fetch-vendor.sh` | downloads vendor libs |
| `test-paho-e2e.js` | end-to-end check of the paho-mqtt bundle |

## Security notes

- **Never commit `session.json`** or a built `terminal-standalone.html` containing
  real credentials — anyone with them can drive your container's shell.
  Both are in `.gitignore`.
- The public broker is a third party: it sees ciphertext + metadata only, but
  don't type passwords or secrets into this terminal anyway.
- The page's "End session" button asks the bridge to exit; the supervisor will
  start a fresh shell shortly after.
