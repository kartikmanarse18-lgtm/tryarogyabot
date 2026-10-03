/* ============================================================
   APK DOWNLOAD — "Get the Android app" for people browsing on an Android phone.
   ------------------------------------------------------------
   * The GitHub Actions build publishes a signed ArogyaBot.apk to a public GitHub Release
     (tag APK_RELEASE_TAG). This file finds that release and offers the download.
   * Nothing is guessed: it asks the GitHub API whether the release really exists. If there is
     no release yet, every button stays hidden, so people never meet a broken link.
   * Never shown inside the Android app itself (IS_NATIVE_APP) or when APK_DOWNLOAD_ENABLED is false.
   * Needs no secrets. Uses only a public, read-only GitHub URL.
   ============================================================ */
const APK_CACHE_KEY = 'arogyabot_apk_release_v1';
const APK_CACHE_MS = 30 * 60 * 1000;
let apkState = { status: 'idle', info: null };   // idle | loading | ready | unknown | none

function apkEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function apkDirectUrl(){ return 'https://github.com/' + APK_RELEASE_REPO + '/releases/download/' + APK_RELEASE_TAG + '/' + encodeURIComponent(APK_FILE_NAME); }
function apkIsAndroidBrowser(){ try{ return /Android/i.test(navigator.userAgent || ''); }catch(e){ return false; } }
function apkShouldOffer(){
  return typeof APK_DOWNLOAD_ENABLED !== 'undefined' && APK_DOWNLOAD_ENABLED === true &&
         !(typeof IS_NATIVE_APP !== 'undefined' && IS_NATIVE_APP);
}
function apkFormatSize(bytes){ if(!bytes) return ''; const mb = bytes / 1048576; return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB'; }
function apkFormatDate(iso){ try{ return iso ? new Date(iso).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}) : ''; }catch(e){ return ''; } }

// Read what we need out of a GitHub "release" JSON. Returns null if the APK file is not attached.
function apkParseRelease(rel){
  const assets = (rel && rel.assets) || [];
  const a = assets.find(x => x && x.name === APK_FILE_NAME);
  if(!a) return null;
  const body = String((rel && rel.body) || '');
  const sha = (body.match(/SHA-256[^0-9a-f]{0,6}([0-9a-f]{64})/i) || [])[1] || '';
  const ver = (body.match(/Version:\s*([^\r\n]+)/i) || [])[1] || '';
  return { url: a.browser_download_url || apkDirectUrl(), size: a.size || 0, updated: a.updated_at || (rel && rel.published_at) || '', version: ver.trim(), sha: sha.toLowerCase() };
}

async function apkLoadInfo(force){
  if(!force && (apkState.status === 'ready' || apkState.status === 'none')) return apkState;
  apkState = { status: 'loading', info: null };
  if(!force){
    try{
      const c = JSON.parse(sessionStorage.getItem(APK_CACHE_KEY) || 'null');
      if(c && (Date.now() - c.t) < APK_CACHE_MS && (c.status === 'ready' || c.status === 'none')){ apkState = { status: c.status, info: c.info }; return apkState; }
    }catch(e){}
  }
  let next = { status: 'unknown', info: null };   // unknown = could not check (offline / rate limit): still offer the direct link
  try{
    if(typeof fetch === 'function'){
      const res = await fetch('https://api.github.com/repos/' + APK_RELEASE_REPO + '/releases/tags/' + encodeURIComponent(APK_RELEASE_TAG), { headers: { 'Accept': 'application/vnd.github+json' } });
      if(res.status === 404) next = { status: 'none', info: null };
      else if(res.ok){ const info = apkParseRelease(await res.json()); next = info ? { status: 'ready', info } : { status: 'none', info: null }; }
    }
  }catch(e){}
  apkState = next;
  if(next.status === 'ready' || next.status === 'none'){
    try{ sessionStorage.setItem(APK_CACHE_KEY, JSON.stringify({ t: Date.now(), status: next.status, info: next.info })); }catch(e){}
  }
  return apkState;
}

function apkUrl(){ return (apkState.info && apkState.info.url) || apkDirectUrl(); }
function apkButtonsVisible(){ return apkShouldOffer() && apkIsAndroidBrowser() && (apkState.status === 'ready' || apkState.status === 'unknown'); }

// The About-page card. Empty when there is nothing to offer, so the About page stays honest.
function apkCardHTML(){
  if(!apkShouldOffer() || !(apkState.status === 'ready' || apkState.status === 'unknown')) return '';
  const info = apkState.info;
  const meta = info ? [info.version, apkFormatSize(info.size), apkFormatDate(info.updated)].filter(Boolean).map(apkEsc).join(' · ') : '';
  const action = apkIsAndroidBrowser()
    ? `<button class="btn" onclick="openApkDownloadModal()"><i class="fa-brands fa-android"></i> Get the Android app</button>`
    : `<p style="margin:0;">Open this page on your <strong>Android phone</strong> to download the app. On an iPhone, use <em>Share, then Add to Home Screen</em> in Safari.</p>`;
  return `<div class="card about-card"><h3 class="about-h"><i class="fa-brands fa-android"></i>Get the Android app</h3>
    <p>Install ArogyaBot as a real Android app. It opens the same live ArogyaBot you see in the browser, and adds medicine reminders that ring like alarms.${meta ? ' <span style="color:var(--text-muted);">(' + meta + ')</span>' : ''}</p>
    ${action}
    <p style="margin:10px 0 0;font-size:.8rem;color:var(--text-muted);">It is installed straight from our GitHub release, not from Google Play, so Android will ask you to confirm. Only download it from this page.</p></div>`;
}

// Show/hide the install icons and fill any About-page slot. Safe to call as often as you like.
function apkMountAll(){
  const show = apkButtonsVisible();
  ['apk-btn-topbar', 'apk-btn-landing'].forEach(id => { const b = document.getElementById(id); if(b) b.classList.toggle('hidden', !show); });
  document.querySelectorAll('[data-apk-slot]').forEach(el => { el.innerHTML = apkCardHTML(); });
}

function openApkDownloadModal(){
  if(!apkShouldOffer()) return;
  const info = apkState.info;
  const rows = [];
  if(info && info.version) rows.push(['Version', apkEsc(info.version)]);
  if(info && info.size) rows.push(['Size', apkEsc(apkFormatSize(info.size))]);
  if(info && info.updated) rows.push(['Updated', apkEsc(apkFormatDate(info.updated))]);
  if(info && info.sha) rows.push(['SHA-256', '<span style="word-break:break-all;font-family:monospace;font-size:.72rem;">' + apkEsc(info.sha) + '</span>']);
  const table = rows.length ? `<div style="margin:12px 0;border:1px solid var(--border, rgba(128,128,128,.25));border-radius:10px;">${rows.map(r => `<div style="display:flex;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border, rgba(128,128,128,.15));"><div style="min-width:78px;color:var(--text-muted);">${r[0]}</div><div>${r[1]}</div></div>`).join('')}</div>` : '';
  openModal(`<button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3><i class="fa-brands fa-android"></i> Get ArogyaBot for Android</h3>
    <p class="modal-sub">This installs the app straight from our GitHub release, not from Google Play. It opens the same live ArogyaBot, plus alarm-style medicine reminders.</p>
    ${table}
    <a class="btn" style="display:block;text-align:center;text-decoration:none;" href="${apkEsc(apkUrl())}" rel="noopener noreferrer" download><i class="fa-solid fa-download"></i> Download ArogyaBot.apk</a>
    <ol style="margin:16px 0 8px;padding-left:20px;font-size:.84rem;line-height:1.6;">
      <li>Tap <strong>Download</strong>, then open the file when it finishes.</li>
      <li>If Android says installs from this source are blocked, tap <strong>Settings</strong> and allow your browser to <strong>install unknown apps</strong>, then go back.</li>
      <li>If Google Play Protect shows a warning about an app it does not recognise, choose <strong>More details</strong>, then <strong>Install anyway</strong>. Only do this for a file you downloaded from this page.</li>
      <li>Open ArogyaBot and sign in with your usual account.</li>
    </ol>
    <p style="font-size:.76rem;color:var(--text-muted);margin:0;">Updates: the app content refreshes itself whenever you are online. You only need to download again when we announce a new app version, and it installs over the old one.</p>`);
}

function apkInit(){
  if(!apkShouldOffer()) return Promise.resolve();
  return apkLoadInfo().then(apkMountAll).catch(() => {});
}
window.addEventListener('load', () => { apkInit(); });
