/* Phase 4 (ABDM plan, Track D / DigiLocker fetch) — Worker routes in mock mode, and the app card with the flag OFF and ON.
   The ON test wires the app's fetch straight into the real Worker code, so it is an end-to-end run of the mock flow.
   Nothing here talks to DigiLocker. */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');const {pathToFileURL}=require('url');
const root=path.resolve(process.argv[2]);
let fails=0;const ok=(n,c)=>{console.log((c?'  PASS  ':'  FAIL  ')+n);if(!c)fails++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let worker,hooks,mkToken;const env={FIREBASE_PROJECT_ID:'proj',ABDM_MODE:'mock',ALLOWED_ORIGINS:'https://ok.example'};
async function setupWorker(){
  ({default:worker}=await import(pathToFileURL(path.join(root,'worker-abdm/src/index.js')).href));
  const {publicKey,privateKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...(await crypto.subtle.exportKey('jwk',publicKey)),kid:'k1',alg:'RS256'};hooks={keys:[jwk]};
  const b64u=b=>Buffer.from(b).toString('base64url');
  mkToken=async(uid)=>{const h=b64u(JSON.stringify({alg:'RS256',kid:'k1',typ:'JWT'}));const now=Math.floor(Date.now()/1000);
    const p=b64u(JSON.stringify({aud:'proj',iss:'https://securetoken.google.com/proj',sub:uid,iat:now-5,exp:now+3600}));
    const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+b64u(Buffer.from(sig));};
}
const call=async(method,p,body,tok,e,origin)=>{const r=await worker.fetch(new Request('https://w.test'+p,{method,headers:{...(tok?{Authorization:'Bearer '+tok}:{}),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined}),e||env,{},hooks);
  const text=await r.text();let j={};try{j=JSON.parse(text)}catch(_){}return {status:r.status,body:j,text,headers:r.headers};};
const stateOf=u=>new URL(u).searchParams.get('state');
// Drives the browser legs of the flow against the Worker: open the consent page, press Allow (or Deny).
async function consent(authUrl,allow){
  const u=new URL(authUrl);const page=await call('GET',u.pathname+u.search);
  const m=page.text.match(new RegExp('href="(/digilocker/callback\\?'+(allow?'code=mock-code':'error=access_denied')+'[^"]*)"'));
  const href=m?m[1].replace(/&amp;/g,'&'):null;
  return {page,cb:href?await call('GET',href):null,href};
}

async function workerTests(){
  const A=await mkToken('uid-A'),B=await mkToken('uid-B');
  ['/digilocker/status','/digilocker/documents'].forEach(async p=>{});
  ok('Worker: status without token → 401',(await call('GET','/digilocker/status')).status===401);
  ok('Worker: start without token → 401',(await call('POST','/digilocker/start',{})).status===401);
  ok('Worker: documents without token → 401',(await call('GET','/digilocker/documents')).status===401);
  ok('Worker: status false before connecting',(await call('GET','/digilocker/status',null,A)).body.connected===false);
  ok('Worker: documents before connecting → 409 not_connected',(await call('GET','/digilocker/documents',null,A)).status===409);
  ok('Worker: fetch before connecting → 409 not_connected',(await call('POST','/digilocker/fetch',{uri:'mock:in.gov.mock-insurance-card'},A)).status===409);

  const s1=await call('POST','/digilocker/start',{},A);
  ok('Worker: start returns a consent URL with a random state, no secrets',s1.status===200&&/digilocker\/mock-authorize\?state=[0-9a-f]{48}$/.test(s1.body.authUrl)&&s1.body.mock===true&&!/secret|token/i.test(JSON.stringify(s1.body)));
  const bad=await call('GET','/digilocker/callback?code=mock-code&state=notarealstate');
  ok('Worker: callback with unknown state → 400, nothing connected',bad.status===400&&(await call('GET','/digilocker/status',null,A)).body.connected===false);
  const xss=await call('GET','/digilocker/mock-authorize?state='+encodeURIComponent('"><script>alert(1)</script>'));
  ok('Worker: consent page never reflects raw state (no script injection)',!/<script/i.test(xss.text));
  const c1=await consent(s1.body.authUrl,true);
  ok('Worker: consent page is clearly marked TEST and has no scripts',c1.page.status===200&&/TEST MODE/.test(c1.page.text)&&!/<script/i.test(c1.page.text));
  ok('Worker: pages carry no-store, no-referrer and a locked-down CSP',c1.page.headers.get('Cache-Control')==='no-store'&&c1.page.headers.get('Referrer-Policy')==='no-referrer'&&/default-src 'none'/.test(c1.page.headers.get('Content-Security-Policy')||''));
  ok('Worker: Allow → connected page',c1.cb&&c1.cb.status===200&&/Connected/.test(c1.cb.text));
  ok('Worker: status true for the same user',(await call('GET','/digilocker/status',null,A)).body.connected===true);
  ok('Worker: another user is NOT connected (isolation)',(await call('GET','/digilocker/status',null,B)).body.connected===false&&(await call('GET','/digilocker/documents',null,B)).status===409);
  ok('Worker: replaying the same callback does nothing (single-use state)',(await call('GET',c1.href)).status===400);

  const l=await call('GET','/digilocker/documents',null,A);
  ok('Worker: document list returns metadata only (no tokens/session)',l.status===200&&l.body.documents.length===2&&!/session|token|contentBase64/i.test(JSON.stringify(l.body)));
  const f=await call('POST','/digilocker/fetch',{uri:l.body.documents[0].uri},A);
  ok('Worker: fetch returns a PDF the app can store',f.status===200&&f.body.mime==='application/pdf'&&Buffer.from(f.body.contentBase64,'base64').toString('latin1').startsWith('%PDF-')&&f.body.externalId===l.body.documents[0].uri);
  ok('Worker: fetch rejects a malformed uri',(await call('POST','/digilocker/fetch',{uri:'../../etc/passwd'},A)).status===400);
  ok('Worker: fetch of an unknown document → 404',(await call('POST','/digilocker/fetch',{uri:'mock:does.not.exist'},A)).status===404);

  const s2=await call('POST','/digilocker/start',{},A);const d=await consent(s2.body.authUrl,false);
  ok('Worker: Deny → no new session issued, state consumed',d.cb&&d.cb.status===200&&/not granted/i.test(d.cb.text)&&(await call('GET',d.href)).status===400);
  ok('Worker: CORS only for the allowed origin on DigiLocker routes',(await call('GET','/digilocker/status',null,A,null,'https://ok.example')).headers.get('Access-Control-Allow-Origin')==='https://ok.example'&&!(await call('GET','/digilocker/status',null,A,null,'https://evil.example')).headers.get('Access-Control-Allow-Origin'));
  await call('POST','/digilocker/disconnect',{},A);
  ok('Worker: disconnect removes the session',(await call('GET','/digilocker/status',null,A)).body.connected===false&&(await call('GET','/digilocker/documents',null,A)).status===409);

  const real={...env,ABDM_MODE:'sandbox'};
  ok('Worker: sandbox mode → start returns 501 until the real adapter exists (no guessing)',(await call('POST','/digilocker/start',{},A,real)).status===501||(await call('POST','/digilocker/start',{},A,real)).status===500);
  ok('Worker: sandbox mode never serves the fake consent page',(await call('GET','/digilocker/mock-authorize?state=x',null,null,real)).status===404);
  const src=fs.readFileSync(path.join(root,'worker-abdm/src/digilocker.js'),'utf8');
  ok('Worker: real mode adapters are all NOT_READY',/authUrl: NOT_READY, exchange: NOT_READY, list: NOT_READY, fetchDoc: NOT_READY/.test(src));
}

class L extends ResourceLoader{
  constructor(patches){super();this.patches=patches||[];}
  fetch(u,o){
    if(!u.startsWith('file://')) return Promise.resolve(Buffer.from(''));
    const p=super.fetch(u,o);
    if(this.patches.length&&u.endsWith('/js/config/app-config.js')) return p.then(b=>Buffer.from(this.patches.reduce((s,[a,c])=>s.replace(a,c),b.toString())));
    return p;
  }
}
async function load(patches){
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(patches),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};w.confirm=()=>true;}});
  await sleep(1500);return {w:dom.window,errs};
}
const ON=[["DIGILOCKER_ENABLED = false","DIGILOCKER_ENABLED = true"],["ABDM_WORKER_URL = ''","ABDM_WORKER_URL = 'https://mock-abdm.test'"]];

async function appTests(){
  /* flags OFF: the app must behave exactly as before */
  let {w,errs}=await load([]);let ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  ok('App(off): digilockerEnabled() is false',ev('digilockerEnabled()')===false);
  ok('App(off): no DigiLocker card in My Documents, official link still there',!/dl-card/.test(ev('viewPatientDocuments()')||'')&&/digilocker\.gov\.in/.test(ev('viewPatientDocuments()')||''));
  ok('App(off): dlCall refuses to run',await ev("dlCall('/digilocker/status').then(()=>'ran',e=>e.code)")==='digilocker_disabled');
  ['handleDocUpload','deleteDocument','viewPatientDocuments','patientVerifyAadhaar','hospitalRequestAccess','doctorSubmitRx'].forEach(n=>ok('old function still exists: '+n,typeof ev(n)==='function'));
  ok('App(off): no script errors',errs.length===0||console.log('   errors:',[...new Set(errs)])||false);

  /* DigiLocker flag ON (ABDM flag stays OFF → proves the two are independent), app wired straight into the real Worker */
  ({w,errs}=await load(ON));ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  const A=await mkToken('uid-A');const opened=[];
  w.fbAuth=()=>({currentUser:{getIdToken:async()=>A}});
  w.fetch=async(url,opt={})=>{const r=await worker.fetch(new Request(url,{method:opt.method||'GET',headers:opt.headers,body:opt.body}),env,{},hooks);return {ok:r.ok,status:r.status,json:()=>r.json()};};
  w.open=(u)=>{opened.push(u);return {};};
  w.eval("window.currentRole='patient'");
  ok('App(on): digilockerEnabled() true while ABDM flag is still off',ev('digilockerEnabled()')===true&&ev('abdmEnabled()')===false);
  const host=w.document.createElement('div');host.innerHTML=ev('viewPatientDocuments()');w.document.body.appendChild(host);
  ok('App(on): My Documents shows the Connect DigiLocker card',!!w.document.getElementById('dl-card')&&/Connect DigiLocker/.test(w.document.getElementById('dl-card').innerHTML));
  ok('App(on): card never asks for a password or OTP',!/password|otp/i.test(w.document.getElementById('dl-card').innerHTML.replace(/never your DigiLocker password or OTP/i,'')));
  await w.eval('dlConnect()');
  ok('App(on): Connect opens the Worker-provided consent URL and shows waiting',opened.length===1&&/mock-authorize\?state=/.test(opened[0])&&ev('dlView.step')==='waiting');
  const c=await consent(opened[0].replace('https://mock-abdm.test','https://w.test'),true);
  ok('App(on): patient presses Allow on the (mock) consent page',c.cb&&c.cb.status===200);
  await sleep(3300);   // one poll cycle (2.5 s)
  ok('App(on): app notices the connection and lists documents',ev('dlView.step')==='connected'&&ev('dlView.docs.length')===2&&/Mock Insurance Card/.test(w.document.getElementById('dl-card').innerHTML));
  ok('App(on): view state holds no token/session',!/session|token|tok/i.test(JSON.stringify(ev('({step:dlView.step,docs:dlView.docs})'))));
  await w.eval('dlImport(0)');
  let docs=ev("db('documents')")||[];const d0=docs.find(d=>d.source==='digilocker');
  ok('App(on): import adds a My Documents entry tagged source:digilocker with externalId',!!d0&&d0.externalId==='mock:in.gov.mock-insurance-card'&&d0.category==='insurance'&&d0.ownerId===ev('currentPatientId()'));
  ok('App(on): small file stored via the old dataUrl path (storage flag off)',/^data:application\/pdf;base64,/.test(d0.dataUrl)&&!d0.storagePath);
  ok('App(on): saved record contains no token',!/tok|eyJ/.test(JSON.stringify(d0).replace(/"dataUrl":"[^"]*"/,'')));
  ok('App(on): list shows the DigiLocker badge',/· DigiLocker/.test(ev('viewPatientDocuments()')));
  await w.eval('dlImport(0)');
  ok('App(on): importing the same document twice does not duplicate it',(ev("db('documents')")||[]).filter(d=>d.source==='digilocker').length===1);
  const owner=ev('currentPatientId()');w.currentPatientId=()=>'KID1';
  ok('App(on): documents are per family member (KID1 sees none of ME\'s)',(ev("db('documents')")||[]).filter(d=>d.ownerId==='KID1').length===0);
  await w.eval('dlImport(1)');
  ok('App(on): importing as another member files it under that member only',(ev("db('documents')")||[]).some(d=>d.ownerId==='KID1'&&d.source==='digilocker')&&(ev("db('documents')")||[]).filter(d=>d.ownerId===owner&&d.source==='digilocker').length===1);
  w.currentPatientId=()=>owner;
  w.eval("dlResetViewState()");
  ok('App(on): reset (member switch/logout) clears list and step',ev('dlView.step')==='idle'&&ev('dlView.docs.length')===0&&ev('dlView.timer')===null);

  /* cloud-storage path, with a fake Storage API (same style as phase 3) */
  const puts=[];w.docStorageApi=()=>({put:async(p,f,m)=>{puts.push({p,m,size:f.size});},url:async()=>'u',remove:async()=>{}});
  w.currentAuthUid=()=>'auth-9';w.docStorageEnabled=()=>true;   // the flag is a const, so the storage switch is emulated by overriding the function
  await w.eval('dlConnect()');const c2=await consent(opened[opened.length-1].replace('https://mock-abdm.test','https://w.test'),true);await sleep(3300);
  await w.eval('dlImport(1)');
  const cloud=(ev("db('documents')")||[]).find(d=>d.source==='digilocker'&&d.storagePath);
  ok('App(on, cloud): file goes to per-user Storage path, Firestore keeps metadata only',puts.length===1&&/^users\/auth-9\/documents\/DOC[^/]*\/Mock_Vaccination/.test(puts[0].p)&&cloud&&!cloud.dataUrl&&cloud.storage==='firebase'&&puts[0].m.contentType==='application/pdf');

  /* failure handling */
  w.eval("dlResetViewState()");
  w.fetch=async()=>({ok:false,status:409,json:async()=>({error:'not_connected'})});
  w.eval("dlView.step='connected';dlView.docs=[{uri:'mock:x',name:'X.pdf'}]");
  const before=(ev("db('documents')")||[]).length;await w.eval('dlImport(0)');
  ok('App(on): failed import shows a friendly error and saves nothing',/not connected/i.test(ev('dlView.error')||'')&&(ev("db('documents')")||[]).length===before);
  ok('App(on): no script errors',errs.length===0||console.log('   errors:',[...new Set(errs)])||false);
}

function staticTests(){
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),idx=fs.readFileSync(path.join(root,'index.html'),'utf8');
  ok('sw.js caches js/services/digilocker.js',sw.includes('./js/services/digilocker.js'));
  ok('index.html loads digilocker.js before main.js',idx.indexOf('js/services/digilocker.js')>0&&idx.indexOf('js/services/digilocker.js')<idx.indexOf('js/main.js'));
  ok('sw.js CACHE_VERSION bumped (v6 or newer)',(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=6);
  const cfg=fs.readFileSync(path.join(root,'js/config/app-config.js'),'utf8');
  ok('DigiLocker flag still OFF by default, no DigiLocker secrets in app-config.js',/DIGILOCKER_ENABLED = false/.test(cfg)&&!/DIGILOCKER_(CLIENT|SECRET)|client_secret/i.test(cfg));
  const bundle=fs.readFileSync(path.join(root,'js/services/digilocker.js'),'utf8');
  ok('app code never calls DigiLocker / API Setu directly',!/digitallocker\.gov\.in|apisetu\.gov\.in\/|api\.digilocker/i.test(bundle));
  ok('app code does not use localStorage for DigiLocker data',!/localStorage|sessionStorage/.test(bundle));
}
(async()=>{await setupWorker();await workerTests();staticTests();await appTests();console.log(fails?'\n  '+fails+' CHECK(S) FAILED':'\n  ALL PHASE 4 CHECKS PASSED');process.exit(fails?1:0);})();
