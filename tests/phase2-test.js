/* Phase 2 (ABDM plan, ABHA / M1) — Worker auth + mock gateway, and the app screen with the flag OFF and ON.
   Uses a MOCK Worker; nothing here talks to ABDM. */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');const {pathToFileURL}=require('url');
const root=path.resolve(process.argv[2]);
let fails=0;const ok=(n,c)=>{console.log((c?'  PASS  ':'  FAIL  ')+n);if(!c)fails++;};

/* ---------- Part 1: the Worker (real RS256 JWT verification with a generated key) ---------- */
async function workerTests(){
  const {default:worker}=await import(pathToFileURL(path.join(root,'worker-abdm/src/index.js')).href);
  const {publicKey,privateKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...(await crypto.subtle.exportKey('jwk',publicKey)),kid:'k1',alg:'RS256'};
  const b64u=b=>Buffer.from(b).toString('base64url');
  const mk=async(over={})=>{const h=b64u(JSON.stringify({alg:'RS256',kid:'k1',typ:'JWT'}));const now=Math.floor(Date.now()/1000);
    const p=b64u(JSON.stringify({aud:'proj',iss:'https://securetoken.google.com/proj',sub:'uid-A',iat:now-5,exp:now+3600,email:'a@x.com',...over}));
    const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+b64u(Buffer.from(sig));};
  const env={FIREBASE_PROJECT_ID:'proj',ABDM_MODE:'mock',ALLOWED_ORIGINS:'https://ok.example'};
  const hooks={keys:[jwk]};
  const call=async(method,p,body,tok,origin)=>{const r=await worker.fetch(new Request('https://w.test'+p,{method,headers:{...(tok?{Authorization:'Bearer '+tok}:{}),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined}),env,{},hooks);return {status:r.status,body:await r.json().catch(()=>({})),headers:r.headers};};
  const good=await mk();
  ok('Worker: /health works without a token',(await call('GET','/health')).status===200);
  ok('Worker: no token → 401',(await call('GET','/abha/profile')).status===401);
  ok('Worker: garbage token → 401',(await call('GET','/abha/profile',null,'a.b.c')).status===401);
  ok('Worker: expired token → 401',(await call('GET','/abha/profile',null,await mk({exp:Math.floor(Date.now()/1000)-10}))).status===401);
  ok('Worker: wrong project (aud) → 401',(await call('GET','/abha/profile',null,await mk({aud:'other'}))).status===401);
  const tampered=good.slice(0,-4)+(good.slice(-4)==='AAAA'?'BBBB':'AAAA');
  ok('Worker: tampered signature → 401',(await call('GET','/abha/profile',null,tampered)).status===401);
  ok('Worker: valid token → profile 200, masked number only',await (async()=>{const r=await call('GET','/abha/profile',null,good);return r.status===200&&/^XX-XXXX-XXXX-\d{4}$/.test(r.body.abhaNumberMasked)&&!('abhaNumber' in r.body);})());
  ok('Worker: bad Aadhaar format rejected',(await call('POST','/abha/aadhaar/otp',{aadhaar:'123'},good)).status===400);
  const o=await call('POST','/abha/aadhaar/otp',{aadhaar:'123412341234'},good);
  ok('Worker: Aadhaar OTP step returns txnId and never echoes the Aadhaar',o.status===200&&!!o.body.txnId&&!JSON.stringify(o.body).includes('123412341234'));
  ok('Worker: wrong OTP → 400 invalid_otp',(await call('POST','/abha/aadhaar/verify',{otp:'000000',txnId:o.body.txnId},good)).body.error==='invalid_otp');
  const v=await call('POST','/abha/aadhaar/verify',{otp:'123456',txnId:o.body.txnId},good);
  ok('Worker: correct (mock) OTP links ABHA, returns no token',v.status===200&&!!v.body.abhaAddress&&!/token/i.test(JSON.stringify(v.body)));
  const m=await call('POST','/abha/mobile/otp',{mobile:'9876543210'},good);
  ok('Worker: mobile OTP flow works',m.status===200&&(await call('POST','/abha/mobile/verify',{otp:'123456',txnId:m.body.txnId},good)).status===200);
  ok('Worker: webhook endpoint acknowledges (202)',(await call('POST','/webhooks/abdm/test',{x:1})).status===202);
  const real=await worker.fetch(new Request('https://w.test/abha/aadhaar/otp',{method:'POST',headers:{Authorization:'Bearer '+good},body:JSON.stringify({aadhaar:'123412341234'})}),{...env,ABDM_MODE:'sandbox'},{},hooks);
  ok('Worker: sandbox mode returns 501 until gateway is implemented (no guessing)',real.status===501);
  ok('Worker: CORS only for allowed origin',(await call('GET','/health',null,null,'https://ok.example')).headers.get('Access-Control-Allow-Origin')==='https://ok.example'&&!(await call('GET','/health',null,null,'https://evil.example')).headers.get('Access-Control-Allow-Origin'));
}

/* ---------- Part 2: the app ---------- */
const NORM_OFF=s=>s.replace(/ABDM_ENABLED\s*=\s*\w+/,'ABDM_ENABLED = false').replace(/DIGILOCKER_ENABLED\s*=\s*\w+/,'DIGILOCKER_ENABLED = false').replace(/ABDM_WORKER_URL\s*=\s*'[^']*'/,"ABDM_WORKER_URL = ''"); /* tests start from factory-default flags so they pass whatever the live config is */
class L extends ResourceLoader{
  constructor(patch){super();this.patch=patch;}
  fetch(u,o){
    if(!u.startsWith('file://')) return Promise.resolve(Buffer.from(''));
    const p=super.fetch(u,o);
    if(u.endsWith('/js/config/app-config.js')) return p.then(b=>{let t=NORM_OFF(b.toString());if(this.patch)t=t.replace("ABDM_ENABLED = false","ABDM_ENABLED = true").replace("ABDM_WORKER_URL = ''","ABDM_WORKER_URL = 'https://mock-abdm.test'");return Buffer.from(t);});
    return p;
  }
}
async function load(patch){
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(patch),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};w.confirm=()=>true;}});
  await new Promise(r=>setTimeout(r,1500));return {w:dom.window,errs};
}
async function appTests(){
  /* flag OFF: app must behave exactly as before */
  let {w,errs}=await load(false);const ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  ok('App(off): abdmEnabled() is false',ev('abdmEnabled()')===false);
  ok('App(off): no p-abha item in patient nav',ev("SIDENAV.patient.some(i=>i.id==='p-abha')")===false);
  ok('App(off): p-abha view says not switched on, still shows official ABHA link',/not switched on/.test(ev('viewPatientAbha()')||'')&&/abha\.abdm\.gov\.in/.test(ev('viewPatientAbha()')||''));
  ok("App: 'abdm' is a private account key",ev("PRIVATE_ACCOUNT_KEYS.includes('abdm')")===true);
  ok('App(off): abdmCall refuses to run',await ev("abdmCall('/abha/profile').then(()=>'ran',e=>e.code)")==='abdm_disabled');
  ['patientVerifyAadhaar','hospitalRequestAccess','doctorSubmitRx','handleDocUpload'].forEach(n=>ok('old function still exists: '+n,typeof ev(n)==='function'));
  ok('App(off): no script errors',errs.length===0||console.log('   errors:',[...new Set(errs)])||false);

  /* flag ON with a mock Worker */
  ({w,errs}=await load(true));const ev2=s=>{try{return w.eval(s)}catch(e){return undefined}};
  const calls=[];
  w.fbAuth=()=>({currentUser:{getIdToken:async()=>'tok-123'}});
  w.fetch=async(url,opt)=>{calls.push({url,opt});const p=url.replace('https://mock-abdm.test','');
    const j=(o,s)=>({ok:!s||s<400,status:s||200,json:async()=>o});
    if(p==='/abha/aadhaar/otp') return /^\d{12}$/.test(JSON.parse(opt.body).aadhaar)?j({txnId:'T1'}):j({error:'invalid_aadhaar_format'},400);
    if(p==='/abha/aadhaar/verify') return JSON.parse(opt.body).otp==='123456'?j({abhaNumberMasked:'XX-XXXX-XXXX-4321',abhaAddress:'me@sbx',name:'Test',mock:true}):j({error:'invalid_otp'},400);
    return j({error:'not_found'},404);};
  ok('App(on): abdmEnabled() is true',ev2('abdmEnabled()')===true);
  ok('App(on): p-abha appears in patient nav',ev2("SIDENAV.patient.some(i=>i.id==='p-abha')")===true);
  ok('App(on): dispatcher can render p-abha',(w.eval("renderCurrentView.toString()")||'').includes("'p-abha'"));
  w.eval("window.currentRole='patient'");
  ok('App(on): unlinked screen offers Aadhaar and mobile OTP',/Use Aadhaar OTP/.test(ev2('viewPatientAbha()'))&&/Use mobile OTP/.test(ev2('viewPatientAbha()')));
  const wrap=w.document.createElement('div');wrap.id='abha-flow';w.document.body.appendChild(wrap);
  w.eval("abhaChoose('aadhaar')");
  w.document.getElementById('abha-number')||(wrap.innerHTML=w.eval('abhaFlowHTML()'));
  w.document.getElementById('abha-number').value='12 3412 341234'.replace(/ /g,'');
  await w.eval('abhaSendOtp()');
  ok('App(on): Worker call carries the Firebase token',calls[0]&&calls[0].opt.headers.Authorization==='Bearer tok-123');
  ok('App(on): moved to OTP step with the transaction id',ev2("abdmView.step")==='otp'&&ev2("abdmView.txnId")==='T1');
  ok('App(on): Aadhaar number is not kept anywhere in app state',!JSON.stringify(ev2('abdmView')).includes('123412341234')&&!JSON.stringify(ev2("db('abdm')")||{}).includes('123412341234'));
  w.document.getElementById('abha-otp').value='000000'; await w.eval('abhaVerifyOtp()');
  ok('App(on): wrong OTP shows a friendly error and does not link',/not correct/.test(ev2('abdmView.error'))&&ev2('abdmGetMember()')===null);
  w.document.getElementById('abha-otp')||(wrap.innerHTML=w.eval('abhaFlowHTML()'));
  w.document.getElementById('abha-otp').value='123456'; await w.eval('abhaVerifyOtp()');
  const rec=ev2('abdmGetMember()');
  ok('App(on): correct OTP links ABHA (masked number + address only)',rec&&rec.abhaNumberMasked==='XX-XXXX-XXXX-4321'&&rec.abhaAddress==='me@sbx');
  ok('App(on): stored record has no token / full number',!/tok-123|91-\d{4}/.test(JSON.stringify(ev2("db('abdm')"))));
  ok('App(on): linked card is shown for this member',/ABHA linked/.test(ev2('viewPatientAbha()')));
  w.eval("abdmSetMember('KID1',{abhaNumberMasked:'XX-XXXX-XXXX-9999',abhaAddress:'kid@sbx',linkedAt:1})");
  ok('App(on): ABHA state is per family member (kid differs from ME)',ev2("abdmGetMember('KID1').abhaAddress")==='kid@sbx'&&ev2("abdmGetMember('ME')")!==null&&ev2("abdmGetMember('ME').abhaAddress")!=='kid@sbx');
  w.eval("abdmView={step:'otp',method:'aadhaar',txnId:'LEFTOVER',busy:false,error:''}");
  w.eval("abdmResetViewState()");
  ok('App(on): member switch/logout reset clears OTP step and txn',ev2('abdmView.step')==='choose'&&ev2('abdmView.txnId')===null);
  ok('App(on): old Aadhaar flow still present',typeof ev2('patientVerifyAadhaar')==='function');
  ok('App(on): no script errors',errs.length===0||console.log('   errors:',[...new Set(errs)])||false);
}
/* service worker + index wiring */
function staticTests(){
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),idx=fs.readFileSync(path.join(root,'index.html'),'utf8');
  ['js/services/abdm-client.js','js/modules/patient/abha-health-id.js'].forEach(f=>{ok('sw.js caches '+f,sw.includes('./'+f));ok('index.html loads '+f+' before main.js',idx.indexOf(f)>0&&idx.indexOf(f)<idx.indexOf('js/main.js'));});
  ok('sw.js CACHE_VERSION bumped (v4 or newer)',(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=4);
  const cfg=fs.readFileSync(path.join(root,'js/config/app-config.js'),'utf8');
  ok('no ABDM secrets in app-config.js',!/ABDM_CLIENT_(ID|SECRET)/.test(cfg)&&/ABDM_ENABLED = (true|false)/.test(cfg));
  const bundle=['js/services/abdm-client.js','js/modules/patient/abha-health-id.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('');
  ok('app code never calls the ABDM gateway directly',!/abdm\.gov\.in\/api|sandbox\.abdm|gateway\.abdm/.test(bundle));
}
(async()=>{await workerTests();staticTests();await appTests();console.log(fails?'\n  '+fails+' CHECK(S) FAILED':'\n  ALL PHASE 2 CHECKS PASSED');process.exit(fails?1:0);})();
