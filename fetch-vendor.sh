#!/bin/bash
# Downloads the browser-side vendor libs that build-inline.js inlines into the
# standalone HTML page. Run once after cloning:  ./fetch-vendor.sh
set -e
mkdir -p vendor
cd vendor
curl -sSL --max-time 60 -o xterm.js  "https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"
curl -sSL --max-time 60 -o xterm.css "https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css"
curl -sSL --max-time 60 -o fit.js    "https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"
curl -sSL --max-time 60 -o paho.js   "https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.1.0/paho-mqtt.min.js"
ls -la
