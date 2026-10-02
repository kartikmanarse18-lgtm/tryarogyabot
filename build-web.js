// Copies the static web app into ./www so Capacitor can bundle it.
// (Capacitor's webDir can't be the project root — it would swallow node_modules and android/.)
// sw.js is deliberately NOT copied: inside the native app there is no service worker.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const ITEMS = ['index.html', 'manifest.json', 'css', 'js', 'icons'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ITEMS) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) { console.error('Missing: ' + item); process.exit(1); }
  fs.cpSync(src, path.join(out, item), { recursive: true });
}
console.log('www/ built:', ITEMS.join(', '));
