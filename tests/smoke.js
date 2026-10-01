// Smoke test: load an index.html in jsdom (no network), collect every uncaught error + console.error,
// then probe that key globals exist and inline-handler functions resolve.
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]);
const errors = [], warns = [];
class Loader extends ResourceLoader {
  fetch(url, opts) {
    if (url.startsWith('file://')) return super.fetch(url, opts);   // local files: load for real
    return Promise.resolve(Buffer.from(''));                         // CDN/network: blank (offline)
  }
}
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push((e.detail && e.detail.message) || e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ').slice(0,200)));
vc.on('warn', (...a) => warns.push(a.join(' ').slice(0,120)));
(async () => {
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    runScripts: 'dangerously', resources: new Loader(), virtualConsole: vc, pretendToBeVisual: true,
    url: 'file://' + path.join(root, 'index.html'),
    beforeParse(w){ w.matchMedia = w.matchMedia || (()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
      w.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
      w.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.scrollTo = () => {}; } });
  await new Promise(r => setTimeout(r, 2500));
  const w = dom.window, d = w.document;
  // every function referenced by an inline on*= handler must exist globally
  const missing = new Set();
  d.querySelectorAll('*').forEach(el => [...el.attributes].filter(a => /^on/.test(a.name)).forEach(a => {
    (a.value.match(/\b([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach(m => {
      const fn = m.replace(/\s*\($/, '');
      if (!['if','function','return','event','closeModal'].includes(fn) && typeof w[fn] !== 'function' && !(fn in w.Object.prototype) && !/^(document|window|this|stopPropagation|preventDefault|querySelector|getElementById|remove|add|toggle|click|focus|blur|select)$/.test(fn)) missing.add(fn);
    }); }));
  const visible = ['screen-splash','screen-auth','screen-landing','app-shell'].map(id => id + ':' + (d.getElementById(id) && !d.getElementById(id).classList.contains('hidden')));
  console.log(JSON.stringify({ errors: [...new Set(errors)], missingHandlers: [...missing], screens: visible, landingBadges: d.querySelectorAll('#badge-grid > *').length }, null, 1));
  process.exit(0);
})();
