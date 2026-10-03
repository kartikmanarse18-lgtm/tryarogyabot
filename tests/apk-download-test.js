/* APK download — the "Get the Android app" icon/card/modal, the release lookup, and the workflow that publishes the file. */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');
const root=path.resolve(process.argv[2]);
class L extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''))}}
async function load(opts={}){
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};
      if(opts.native) w.Capacitor={isNativePlatform:()=>true};
      if(opts.ua) Object.defineProperty(w.navigator,'userAgent',{get:()=>opts.ua,configurable:true});}});
  await new Promise(r=>setTimeout(r,1200));return {w:dom.window,errs};
}
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const DESKTOP='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const SHA='a'.repeat(32)+'b'.repeat(32);
const REL={name:'x',published_at:'2026-10-03T10:00:00Z',body:'Version: 0.1.42\nBuild: 42\nSHA-256: '+SHA+'\n',assets:[{name:'ArogyaBot.apk',size:7340032,updated_at:'2026-10-03T10:05:00Z',browser_download_url:'https://github.com/o/r/releases/download/android-latest/ArogyaBot.apk'}]};
const resp=(status,json)=>Promise.resolve({status,ok:status>=200&&status<300,json:()=>Promise.resolve(json)});

(async()=>{
  let fails=0;const ok=(name,cond)=>{console.log((cond?'  PASS  ':'  FAIL  ')+name);if(!cond)fails++;};
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const wf=fs.readFileSync(path.join(root,'.github/workflows/android-apk.yml'),'utf8');

  // ---------- wiring (static)
  ok('index.html loads apk-download.js before main.js',html.indexOf('js/services/apk-download.js')>-1&&html.indexOf('js/services/apk-download.js')<html.indexOf('js/main.js'));
  ok('topbar has the Android icon, hidden by default',/id="apk-btn-topbar"[^>]*onclick="openApkDownloadModal\(\)"/.test(html)&&/class="bell-btn hidden" id="apk-btn-topbar"/.test(html));
  ok('landing has the Get the Android app button, hidden by default',/class="btn-secondary btn-sm hidden" id="apk-btn-landing"/.test(html));
  ok('old PWA install buttons are still there',html.includes('id="pwa-install-btn"')&&html.includes('id="pwa-install-btn-landing"'));
  ok('sw.js caches apk-download.js',sw.includes("./js/services/apk-download.js"));
  ok('sw.js CACHE_VERSION is v8 or newer',(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=8);
  ok('sw.js never intercepts api.github.com',/NEVER_INTERCEPT_HOSTS[\s\S]*?'api\.github\.com'/.test(sw));
  const codeOnly=fs.readFileSync(path.join(root,'js/services/apk-download.js'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  ok('module code has no secrets, keys or eval',!/(secret|apikey|api_key|password|bearer|authorization|eval\()/i.test(codeOnly));
  ok('module only talks to api.github.com (read-only GET) and uses no localStorage',/api\.github\.com\/repos\//.test(codeOnly)&&!/localStorage/.test(codeOnly)&&!/method:\s*['"](POST|PUT|DELETE)/i.test(codeOnly));

  // ---------- workflow publishes a PUBLIC file
  ok('workflow: rolling release step exists',wf.includes('Publish rolling public release "android-latest"'));
  ok('workflow: only on main branch AND signed builds',/if: github\.ref_type == 'branch' && github\.ref_name == 'main' && env\.SIGNED == '1'/.test(wf));
  ok('workflow: marked prerelease so it never replaces the versioned "Latest"',/gh release create android-latest ArogyaBot\.apk --prerelease/.test(wf));
  ok('workflow: writes version + SHA-256 into the notes',/Version: %s/.test(wf)&&/SHA-256: %s/.test(wf)&&wf.includes('sha256sum ArogyaBot.apk'));
  ok('workflow: old tag-release step still present',wf.includes('Attach to GitHub Release (tags only)'));
  ok('workflow: asset name matches the app config',wf.includes('ArogyaBot.apk'));

  // ---------- Android phone, release exists
  const A=await load({ua:ANDROID});const w=A.w;const ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  ok('config: flag on, tag android-latest, file ArogyaBot.apk',ev('APK_DOWNLOAD_ENABLED')===true&&ev('APK_RELEASE_TAG')==='android-latest'&&ev('APK_FILE_NAME')==='ArogyaBot.apk');
  ok('direct URL is the GitHub release download URL',ev('apkDirectUrl()')==='https://github.com/'+ev('APK_RELEASE_REPO')+'/releases/download/android-latest/ArogyaBot.apk');
  const parsed=ev(`apkParseRelease(${JSON.stringify(REL)})`)||{};
  ok('parses version, size, SHA-256 and url from the release',parsed.version==='0.1.42'&&parsed.size===7340032&&parsed.sha===SHA&&/ArogyaBot\.apk$/.test(parsed.url));
  ok('a release without the APK file counts as "none"',ev(`apkParseRelease({assets:[{name:'other.zip'}],body:''})`)===null);
  const topHidden=()=>w.document.getElementById('apk-btn-topbar').classList.contains('hidden');

  w.fetch=()=>resp(404,{});await w.eval('apkLoadInfo(true).then(apkMountAll)');
  ok('no release yet (404): status none and icons stay hidden',ev('apkState.status')==='none'&&topHidden()&&w.document.getElementById('apk-btn-landing').classList.contains('hidden'));
  ok('no release yet: About card is empty (nothing to promise)',ev('apkCardHTML()')==='');

  w.fetch=()=>resp(200,REL);await w.eval('apkLoadInfo(true).then(apkMountAll)');
  ok('release found: status ready',ev('apkState.status')==='ready');
  ok('release found: topbar icon and landing button appear on Android',!topHidden()&&!w.document.getElementById('apk-btn-landing').classList.contains('hidden'));
  const slot=w.document.createElement('div');slot.setAttribute('data-apk-slot','');w.document.body.appendChild(slot);ev('apkMountAll()');
  ok('About slot gets the card with version and size',slot.innerHTML.includes('Get the Android app')&&slot.innerHTML.includes('0.1.42')&&slot.innerHTML.includes('7.0 MB'));
  ev('openApkDownloadModal()');const modal=w.document.getElementById('modal-box').innerHTML;
  ok('modal links to the real release file',modal.includes('href="https://github.com/o/r/releases/download/android-latest/ArogyaBot.apk"')&&/rel="noopener noreferrer"/.test(modal)&&/ download/.test(modal));
  ok('modal shows the SHA-256 so people can verify',modal.includes(SHA));
  ok('modal explains install steps, unknown apps and Play Protect honestly',/install unknown apps/i.test(modal)&&/Play Protect/.test(modal)&&/not from Google Play/.test(modal));
  ok('modal says only download from this page',/Only do this for a file you downloaded from this page/.test(modal));
  ev('closeModal()');

  w.fetch=()=>resp(200,{...REL,body:'Version: <script>alert(1)</script>\nSHA-256: '+SHA});await w.eval('apkLoadInfo(true).then(apkMountAll)');ev('openApkDownloadModal()');
  const evil=w.document.getElementById('modal-box').innerHTML;
  ok('release text is HTML-escaped (no injected script)',!/<script>alert/.test(evil)&&/&lt;script&gt;/.test(evil));ev('closeModal()');

  w.fetch=()=>resp(403,{message:'rate limit'});await w.eval('apkLoadInfo(true).then(apkMountAll)');
  ok('GitHub rate-limited (403): status unknown, still offers the direct link',ev('apkState.status')==='unknown'&&!topHidden()&&ev('apkUrl()')===ev('apkDirectUrl()'));
  w.fetch=()=>Promise.reject(new Error('offline'));await w.eval('apkLoadInfo(true).then(apkMountAll)');
  ok('offline check fails safe (unknown, no crash)',ev('apkState.status')==='unknown');

  // ---------- About page includes the slot
  ok('About page contains the Android download slot',(ev('aboutContentHTML()')||'').includes('data-apk-slot'));
  ok('old install flow still exists',typeof ev('triggerPwaInstall')==='function'&&typeof ev('viewAbout')==='function');
  ok('no script errors on an Android phone',A.errs.length===0||console.log('   errors:',[...new Set(A.errs)])||false);

  // ---------- desktop
  const D=await load({ua:DESKTOP});const dw=D.w;const dev=s=>{try{return dw.eval(s)}catch(e){return undefined}};
  dw.fetch=()=>resp(200,REL);await dw.eval('apkLoadInfo(true).then(apkMountAll)');
  ok('desktop: icons stay hidden (an APK is no use there)',dw.document.getElementById('apk-btn-topbar').classList.contains('hidden')&&dw.document.getElementById('apk-btn-landing').classList.contains('hidden'));
  ok('desktop: About card tells them to open the page on an Android phone',/Open this page on your <strong>Android phone/.test(dev('apkCardHTML()')||''));

  // ---------- inside the Android app itself
  const N=await load({ua:ANDROID,native:true});const nw=N.w;const nev=s=>{try{return nw.eval(s)}catch(e){return undefined}};
  nw.fetch=()=>resp(200,REL);await nw.eval('apkInit()');nev('apkMountAll()');
  ok('inside the app: IS_NATIVE_APP is true',nev('IS_NATIVE_APP')===true);
  ok('inside the app: never offered (already installed)',nev('apkShouldOffer()')===false&&nev('apkCardHTML()')===''&&nw.document.getElementById('apk-btn-topbar').classList.contains('hidden'));

  console.log(fails?`\n  ${fails} CHECK(S) FAILED`:'\n  ALL APK-DOWNLOAD CHECKS PASSED');process.exit(fails?1:0);
})();
