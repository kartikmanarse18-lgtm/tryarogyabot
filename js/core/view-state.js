/* ============================================================
   VIEW STATE KEEPER
   Problem it fixes: every screen is rebuilt from saved data (innerHTML), and a rebuild happens by itself whenever
   background sync fires (scheduleRemoteRefresh -> softRefreshCurrentView) and also on a page reload. Anything the user
   had chosen or typed but not yet saved lived only in the DOM, so it snapped back — e.g. choosing ECHS in "Your scheme /
   cover" went back to PM-JAY.

   What it does (generic, works for every screen, no per-screen code):
   1. BACKGROUND RE-RENDER  uiStateRunBackgroundRender(fn): snapshot -> re-render -> put back. Only controls the user
      CHANGED are put back (value differs from the freshly rendered default), so untouched fields still show new remote
      data. Also keeps focus + caret, <details> open state. Selects/checkboxes/radios re-run their inline onchange so
      dependent parts of the screen (like the scheme-specific fields) come back too.
   2. PAGE RELOAD          the changed controls of the screen being worked on are kept in sessionStorage (this tab only,
      cleared when the tab closes) and re-applied on the first render after the reload.
   3. WHEN IT LETS GO      drafts are dropped when the user navigates to another section, saves/re-renders the same
      screen themselves, switches family member or signs out, belong to another role/member, or are older than 6 hours.
   Privacy: only the in-memory path (1) ever sees password/OTP/card/Aadhaar-type fields. The reload path (2) never stores
   password, OTP, PIN, card, Aadhaar, ABHA, token or autocomplete=off fields, or anything marked data-no-persist.
   Every function here is called behind a typeof check, so if this file fails to load the app behaves as it did before.
   ============================================================ */
const UI_DRAFT_KEY = 'abot2_ui_draft';
const UI_DRAFT_MAX_AGE = 6 * 60 * 60 * 1000;
const UI_DRAFT_MAX_LEN = 2000;
const UI_SENSITIVE_RE = /(^|[-_])(pass|password|passcode|pwd|otp|pin|cvv|cvc|card|secret|token)([-_]|$)|aadhaar|abha/i;
let uiRestoring = false, uiBgDepth = 0, uiSaveTimer = null;

function uiStateContainer(){ return document.getElementById('active-view-container'); }
function uiStateScope(){
  try{ return (currentRole||'') + '|' + ((currentRole==='patient' && typeof currentPatientId==='function') ? currentPatientId() : ''); }
  catch(e){ return (typeof currentRole!=='undefined' && currentRole) || ''; }
}

/* Controls the user changed on this screen (value differs from what the render produced). forPersist drops sensitive ones. */
function uiStateScan(root, forPersist){
  const out = [], seenRadio = {};
  root.querySelectorAll('input,select,textarea').forEach(el=>{
    const t = (el.type||'').toLowerCase();
    if(['file','hidden','button','submit','reset','image'].indexOf(t) > -1) return;
    if(forPersist){
      const ac = (el.getAttribute('autocomplete')||'').toLowerCase();
      if(t==='password' || ac==='off' || ac==='one-time-code' || ac.indexOf('cc-')===0) return;
      if(UI_SENSITIVE_RE.test(el.id||'') || UI_SENSITIVE_RE.test(el.name||'') || el.hasAttribute('data-no-persist')) return;
    }
    if(t==='radio'){
      const name = el.name; if(!name || seenRadio[name]) return; seenRadio[name] = 1;
      const group = Array.prototype.filter.call(root.querySelectorAll('input[type=radio]'), r=>r.name===name);
      const chk = group.filter(r=>r.checked)[0], def = group.filter(r=>r.defaultChecked)[0];
      if(((chk&&chk.value)||'') !== ((def&&def.value)||'')) out.push({k:'r:'+name, t:'radio', v: chk ? chk.value : ''});
      return;
    }
    const k = el.id; if(!k) return;
    if(t==='checkbox'){ if(el.checked !== el.defaultChecked) out.push({k:k, t:'checkbox', v:el.checked}); return; }
    if(el.tagName==='SELECT'){
      if(el.multiple) return;
      let def = 0; for(let i=0;i<el.options.length;i++){ if(el.options[i].defaultSelected){ def = i; break; } }
      if(el.selectedIndex !== def) out.push({k:k, t:'select', v:el.value});
      return;
    }
    if(el.value !== el.defaultValue){
      let v = el.value; if(forPersist && v.length > UI_DRAFT_MAX_LEN) v = v.slice(0, UI_DRAFT_MAX_LEN);
      out.push({k:k, t:'text', v:v});
    }
  });
  return out;
}

function uiStateFire(el, type){
  if(!el.hasAttribute('on'+type)) return;          // only re-run handlers the screen itself declared inline
  try{ el.dispatchEvent(new Event(type, {bubbles:true})); }catch(e){}
}

/* Put changed controls back. Selects/radios/checkboxes first (they can rebuild dependent fields), then text. */
function uiStateApply(items){
  const c = uiStateContainer();
  if(!c || !items || !items.length) return 0;
  let n = 0; uiRestoring = true;
  try{
    const order = items.filter(i=>i.t!=='text').concat(items.filter(i=>i.t==='text'));
    order.forEach(it=>{
      try{
        if(it.t==='radio'){
          const r = Array.prototype.filter.call(c.querySelectorAll('input[type=radio]'), x=>x.name===it.k.slice(2) && x.value===it.v)[0];
          if(r && !r.checked){ r.checked = true; uiStateFire(r, 'change'); n++; }
          return;
        }
        const el = document.getElementById(it.k); if(!el || !c.contains(el)) return;
        if(it.t==='checkbox'){ if(el.checked !== it.v){ el.checked = it.v; uiStateFire(el, 'change'); n++; } return; }
        if(it.t==='select'){
          const has = Array.prototype.some.call(el.options, o=>o.value===it.v);
          if(has && el.value !== it.v){ el.value = it.v; uiStateFire(el, 'change'); n++; }
          return;
        }
        if(el.value !== it.v){ el.value = it.v; uiStateFire(el, 'input'); n++; }
      }catch(e){}
    });
  } finally { uiRestoring = false; }
  return n;
}

function uiStateCapture(){
  const c = uiStateContainer(); if(!c) return null;
  let focus = null;
  const a = document.activeElement;
  if(a && c.contains(a) && a.id && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){
    focus = {id:a.id, s:null, e:null};
    try{ focus.s = a.selectionStart; focus.e = a.selectionEnd; }catch(e){}
  }
  return {items: uiStateScan(c, false), focus: focus, details: Array.prototype.map.call(c.querySelectorAll('details'), d=>d.open)};
}
function uiStateRestoreSnap(snap){
  const c = uiStateContainer(); if(!c || !snap) return;
  uiStateApply(snap.items);
  const ds = c.querySelectorAll('details');
  if(ds.length === snap.details.length) Array.prototype.forEach.call(ds, (d,i)=>{ d.open = snap.details[i]; });
  if(snap.focus){
    const el = document.getElementById(snap.focus.id);
    if(el && c.contains(el)){
      try{ el.focus({preventScroll:true}); }catch(e){}
      try{ if(snap.focus.s!=null) el.setSelectionRange(snap.focus.s, snap.focus.e); }catch(e){}
    }
  }
}
/* Wrap a re-render that was NOT started by the user (sync tick, directory refresh...). */
function uiStateRunBackgroundRender(fn){
  const snap = uiStateCapture();
  uiBgDepth++;
  try{ fn(); } finally { uiBgDepth--; }
  uiStateRestoreSnap(snap);
}

/* ---- page-reload persistence (sessionStorage, this tab only) ---- */
function uiStateClearDraft(){ try{ sessionStorage.removeItem(UI_DRAFT_KEY); }catch(e){} }
function uiStateSaveDraft(){
  try{
    const c = uiStateContainer();
    if(!c || typeof currentRole==='undefined' || !currentRole || !currentView) return;
    const items = uiStateScan(c, true);
    if(!items.length){ uiStateClearDraft(); return; }
    sessionStorage.setItem(UI_DRAFT_KEY, JSON.stringify({scope:uiStateScope(), view:currentView, t:Date.now(), items:items}));
  }catch(e){}
}
function uiStateRestoreDraft(navId){
  let d = null;
  try{ d = JSON.parse(sessionStorage.getItem(UI_DRAFT_KEY) || 'null'); }catch(e){}
  if(!d) return;
  if(d.view !== navId || d.scope !== uiStateScope() || !(Date.now() - d.t < UI_DRAFT_MAX_AGE)){ uiStateClearDraft(); return; }
  uiStateApply(d.items);
}
/* Called at the end of renderCurrentView. First render after a page load re-applies the draft; any other render the
   user caused (switching section, saving, switching member) means the old draft no longer applies. */
function uiStateAfterRender(navId, firstRender){
  if(uiRestoring || uiBgDepth > 0) return;
  if(firstRender){ uiStateRestoreDraft(navId); return; }
  uiStateClearDraft();
}
function uiStateClear(){ uiStateClearDraft(); }

['input','change'].forEach(evName=>{
  document.addEventListener(evName, function(e){
    if(uiRestoring) return;
    const c = uiStateContainer(); if(!c || !c.contains(e.target)) return;
    if(uiSaveTimer) clearTimeout(uiSaveTimer);
    uiSaveTimer = setTimeout(uiStateSaveDraft, 400);
  }, true);
});
