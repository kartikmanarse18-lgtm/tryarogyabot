/* View-state keeper: choices/typing that are not saved yet must survive (1) a background re-render and (2) a page reload,
   and must be dropped when the user moves on. Runs the real "Your scheme / cover" screen (the ECHS -> PM-JAY bug). */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');
const root=path.resolve(process.argv[2]);
let fails=0;const ok=(n,c)=>{console.log((c?'  PASS  ':'  FAIL  ')+n);if(!c)fails++;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class L extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''))}}
async function load(){
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};w.confirm=()=>true;
      // jsdom gives file:// pages no sessionStorage; a browser tab always has one, so provide a plain in-memory stand-in
      const m=new Map();Object.defineProperty(w,'sessionStorage',{configurable:true,value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()}});}});
  const w=dom.window;await sleep(1500);
  const ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  return {w,ev,errs};
}
const DRAFT='abot2_ui_draft';
const change=(w,el,type)=>el.dispatchEvent(new w.Event(type,{bubbles:true}));
async function openSchemes(){
  const o=await load();o.w.eval("currentRole='patient'");o.w.eval("currentView=null");o.w.eval("renderCurrentView('p-insurance')");return o;
}
const $=(w,id)=>w.document.getElementById(id);

(async()=>{
  const idx=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const vd=fs.readFileSync(path.join(root,'js/shell/view-dispatch.js'),'utf8'),vc=fs.readFileSync(path.join(root,'js/services/video-call.js'),'utf8');
  ok('wiring: index.html loads view-state.js before view-dispatch.js',idx.indexOf('js/core/view-state.js')>0&&idx.indexOf('js/core/view-state.js')<idx.indexOf('js/shell/view-dispatch.js'));
  ok('wiring: sw.js caches view-state.js and the cache version was bumped',sw.includes('./js/core/view-state.js')&&(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=10);
  ok('wiring: renderCurrentView tells the keeper, background sync refresh is wrapped',/uiStateAfterRender/.test(vd)&&/uiStateRunBackgroundRender/.test(vc));

  /* ---------- the reported bug: choose ECHS, background refresh happens, selection must stay ---------- */
  let {w,ev,errs}=await openSchemes();
  const keys=ev('Object.keys(SCHEME_CONFIG)')||[];
  ok('scheme list has ECHS and PM-JAY',keys.includes('echs')&&keys.includes('pmjay'));
  const sel=()=>$(w,'ins-scheme-select');
  ok('screen starts on the saved default (not ECHS)',sel()&&sel().value!=='echs');
  sel().value='echs';change(w,sel(),'change');
  ok('choosing ECHS shows the ECHS fields',!!$(w,'svc-rank'));
  $(w,'svc-rank').value='Havildar (Retd.)';change(w,$(w,'svc-rank'),'input');
  $(w,'svc-card').value='1234567890';change(w,$(w,'svc-card'),'input');
  ev('softRefreshCurrentView()');                              // exactly what a background sync tick does
  ok('BUG FIX: after a background refresh ECHS is still selected',sel().value==='echs');
  ok('BUG FIX: the ECHS fields are still shown with what was typed',!!$(w,'svc-rank')&&$(w,'svc-rank').value==='Havildar (Retd.)');
  ok('in-memory refresh also keeps a half-typed card number (nothing is lost mid-typing)',$(w,'svc-card')&&$(w,'svc-card').value==='1234567890');
  ev('softRefreshCurrentView()');ev('softRefreshCurrentView()');
  ok('repeated refreshes are stable',sel().value==='echs'&&$(w,'svc-rank').value==='Havildar (Retd.)');

  /* focus + caret survive a refresh while typing */
  $(w,'svc-rank').focus();$(w,'svc-rank').setSelectionRange(3,3);
  ev('softRefreshCurrentView()');
  ok('focus and caret stay in the field being typed in',w.document.activeElement&&w.document.activeElement.id==='svc-rank'&&$(w,'svc-rank').selectionStart===3);

  /* ---------- reload persistence ---------- */
  await sleep(600);
  const raw=w.sessionStorage.getItem(DRAFT),draft=raw?JSON.parse(raw):null;
  ok('draft saved for this screen only',!!draft&&draft.view==='p-insurance'&&draft.items.some(i=>i.k==='ins-scheme-select'&&i.v==='echs')&&draft.items.some(i=>i.k==='svc-rank'));
  ok('draft NEVER contains the card number (autocomplete=off / sensitive)',!!raw&&!raw.includes('1234567890')&&!draft.items.some(i=>i.k==='svc-card'));

  const reload=async(mut)=>{const o=await load();o.w.eval("currentRole='patient'");o.w.eval("currentView=null");
    const d=JSON.parse(raw);if(mut)mut(d);o.w.sessionStorage.setItem(DRAFT,JSON.stringify(d));o.w.eval("renderCurrentView('p-insurance')");return o;};
  let r=await reload();
  ok('RELOAD: ECHS is still selected after a page reload',$(r.w,'ins-scheme-select').value==='echs');
  ok('RELOAD: the ECHS fields are back with the typed rank, card box is empty',$(r.w,'svc-rank')&&$(r.w,'svc-rank').value==='Havildar (Retd.)'&&$(r.w,'svc-card').value==='');
  r=await reload(d=>{d.t=Date.now()-7*3600*1000});
  ok('a draft older than 6 hours is ignored and removed',$(r.w,'ins-scheme-select').value!=='echs'&&!r.w.sessionStorage.getItem(DRAFT));
  r=await reload(d=>{d.scope='patient|SOMEONE-ELSE'});
  ok('a draft from another family member / role is ignored',$(r.w,'ins-scheme-select').value!=='echs'&&!r.w.sessionStorage.getItem(DRAFT));
  r=await reload(d=>{d.view='p-dash'});
  ok('a draft for a different screen is ignored',$(r.w,'ins-scheme-select').value!=='echs');

  /* ---------- letting go ---------- */
  w.eval("renderCurrentView('p-dash')");
  ok('navigating to another section drops the draft',!w.sessionStorage.getItem(DRAFT));
  w.eval("renderCurrentView('p-insurance')");
  ok('coming back shows the saved value, not the abandoned choice',sel().value!=='echs');
  sel().value='echs';change(w,sel(),'change');await sleep(600);
  ok('draft exists again after a new choice',!!w.sessionStorage.getItem(DRAFT));
  w.eval("clearActiveSession()");
  ok('signing out drops the draft',!w.sessionStorage.getItem(DRAFT));

  /* untouched fields must still take new remote data */
  ({w,ev,errs}=await openSchemes());
  const pid=ev('currentPatientId()');
  w.eval(`setInsuranceFields(${JSON.stringify(pid)},{scheme:'cghs'})`);ev('softRefreshCurrentView()');
  ok('a field the user did NOT touch still shows new remote data',$(w,'ins-scheme-select').value==='cghs');

  /* ---------- generic behaviour on a synthetic screen: checkbox, radio, textarea, details, password ---------- */
  ({w,ev,errs}=await openSchemes());
  const tpl=`<input id="t-pass" type="password" value=""><textarea id="t-note"></textarea><input type="checkbox" id="t-chk">
    <input type="radio" name="t-r" value="a" checked><input type="radio" name="t-r" value="b">
    <select id="t-sel" onchange="window.__selFires=(window.__selFires||0)+1"><option value="x" selected>X</option><option value="y">Y</option></select>
    <details id="t-d"><summary>s</summary>c</details>`;
  const box=()=>$(w,'active-view-container');
  box().innerHTML=tpl;
  $(w,'t-pass').value='hunter2';$(w,'t-note').value='felt dizzy since morning';$(w,'t-chk').checked=true;
  w.document.querySelector('input[name=t-r][value=b]').checked=true;$(w,'t-sel').value='y';$(w,'t-d').open=true;
  w.eval("uiStateRunBackgroundRender(()=>{document.getElementById('active-view-container').innerHTML=arguments[0]||''})".replace('arguments[0]||\'\'',JSON.stringify(tpl)));
  ok('generic: checkbox, radio, textarea, select, <details> all survive a re-render',$(w,'t-chk').checked&&w.document.querySelector('input[name=t-r]:checked').value==='b'&&$(w,'t-note').value==='felt dizzy since morning'&&$(w,'t-sel').value==='y'&&$(w,'t-d').open===true);
  ok('generic: password survives in memory during a refresh',$(w,'t-pass').value==='hunter2');
  ok('generic: the select\'s own onchange ran once so dependent UI can rebuild',w.__selFires===1);
  ev("currentView='p-insurance'");w.eval('uiStateSaveDraft()');
  const sd=JSON.parse(w.sessionStorage.getItem(DRAFT)||'null');
  ok('generic: password is never written to the reload draft, the note is',!!sd&&!JSON.stringify(sd).includes('hunter2')&&sd.items.some(i=>i.k==='t-note'));
  box().innerHTML=tpl.replace('id="t-note"','id="t-note" data-no-persist');$(w,'t-note').value='secret text';w.eval('uiStateSaveDraft()');
  ok('generic: data-no-persist keeps a field out of the draft',!(w.sessionStorage.getItem(DRAFT)||'').includes('secret text'));

  /* ---------- the rest of the app still behaves ---------- */
  ok('no script errors',errs.length===0||console.log('   errors:',[...new Set(errs)])||false);
  console.log(fails?'\n  '+fails+' CHECK(S) FAILED':'\n  ALL VIEW-STATE CHECKS PASSED');process.exit(fails?1:0);
})();
