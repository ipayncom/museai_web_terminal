// Build terminal-standalone.html with all vendor libs inlined (zero external CDN deps).
const fs = require('fs');
const path = require('path');
const DIR = '/home/hatch/workspace/wsterm';
const V = path.join(DIR, 'vendor');

function readJs(name) {
  let s = fs.readFileSync(path.join(V, name), 'utf8');
  // avoid prematurely closing our <script> tag
  s = s.replace(/<\/script/gi, '<\\/script');
  return s;
}

let html = fs.readFileSync(path.join(DIR, 'terminal.html'), 'utf8');

const css = fs.readFileSync(path.join(V, 'xterm.css'), 'utf8');
html = html.replace(
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.5.0/css/xterm.css" />',
  '<style>\n' + css + '\n</style>'
);
const libs = [
  ['<script src="https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.js"></script>', 'xterm.js'],
  ['<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>', 'fit.js'],
  ['<script src="https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.1.0/mqttws31.min.js"></script>', 'paho.js'],
];
for (const [tag, file] of libs) {
  if (!html.includes(tag)) throw new Error('tag not found: ' + tag);
  html = html.replace(tag, '<script>\n' + readJs(file) + '\n</script>');
}
// sanity: no external refs left
const leftover = html.match(/https:\/\/cdn\.jsdelivr\.net|https:\/\/cdnjs\.cloudflare\.com/g);
if (leftover) throw new Error('external refs remain: ' + leftover.join(','));

const doc = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>容器终端</title></head>' +
  '<body style="margin:0;padding:16px;background:#f0f0f0;">\n' + html + '\n</body></html>';
fs.writeFileSync(path.join(DIR, 'terminal-standalone.html'), doc);
console.log('built, bytes:', Buffer.byteLength(doc));
