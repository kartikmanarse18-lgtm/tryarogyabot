/* ============================================================
   DIGILOCKER FETCH (plan Phase 4 / Track D) — pull government documents into My Documents with the patient's consent.
   - Dormant unless DIGILOCKER_ENABLED is true AND ABDM_WORKER_URL is set. With the flag off nothing here renders
     and the app behaves exactly as before.
   - The app never talks to DigiLocker. The arogyabot-abdm Worker does the OAuth hand-off and keeps the tokens;
     the app only receives a consent URL, a document list and the file the patient picked.
   - Imported files become ordinary My Documents entries tagged source:'digilocker'. They go to Firebase Storage when
     DOCS_STORAGE_ENABLED is on, otherwise (small files only) into the old dataUrl path.
   - This file does not depend on doc-storage.js being loaded first (it checks with typeof at call time).
   ============================================================ */
const DL_POLL_MS = 2500, DL_POLL_MAX_MS = 180000;      // wait up to 3 minutes for the patient to finish the consent step
const DL_DATAURL_MAX_BYTES = 500*1024;                  // old Firestore-embedded path: keep it small (whole documents list is one doc)

function digilockerEnabled(){ return typeof DIGILOCKER_ENABLED!=='undefined' && DIGILOCKER_ENABLED===true && typeof ABDM_WORKER_URL!=='undefined' && !!ABDM_WORKER_URL; }
function dlEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function dlCall(path, method, body){
  if(!digilockerEnabled()){ const e=new Error('digilocker_disabled'); e.code='digilocker_disabled'; throw e; }
  const a = (typeof fbAuth==='function') ? fbAuth() : null;
  if(!a || !a.currentUser){ const e=new Error('not_signed_in'); e.code='not_signed_in'; throw e; }
  const token = await a.currentUser.getIdToken();
  const res = await fetch(ABDM_WORKER_URL.replace(/\/$/,'') + path, {
    method: method||'GET',
    headers: {'Authorization':'Bearer '+token, 'Content-Type':'application/json'},
    body: method==='POST' ? JSON.stringify(body||{}) : undefined
  });
  let data = {}; try{ data = await res.json(); }catch(e){}
  if(!res.ok){ const e=new Error(data.error||('http_'+res.status)); e.code=data.error||('http_'+res.status); e.status=res.status; throw e; }
  return data;
}

/* ---- in-memory view state only (never persisted). Cleared on member switch and logout. ---- */
let dlView = {step:'idle', docs:[], busy:false, error:'', note:'', mock:false, timer:null};
function dlResetViewState(){
  if(dlView && dlView.timer) clearTimeout(dlView.timer);
  dlView = {step:'idle', docs:[], busy:false, error:'', note:'', mock:false, timer:null};
}

const DL_ERRORS = {
  not_signed_in:'Please sign in again, then retry.', unauthorized:'Please sign in again, then retry.',
  not_connected:'DigiLocker is not connected yet. Please connect first.',
  too_large:'That document is too large to import.', unsupported_type:'Only PDF or image documents can be imported.',
  document_not_found:'That document was not found in DigiLocker.', kv_required:'DigiLocker is not set up on the server yet.',
  digilocker_gateway_not_implemented:'DigiLocker is not switched on for real use yet (test mode only).',
  digilocker_disabled:'DigiLocker is not enabled in this build.'
};
function dlErrorText(code){ return DL_ERRORS[code] || 'Something went wrong. Please try again in a moment.'; }

function dlRerender(){
  const el = document.getElementById('dl-card');
  if(!el) return false;           // the patient left the screen
  el.innerHTML = dlCardInnerHTML();
  return true;
}

/* ---- card shown at the top of My Documents (empty string when the flag is off) ---- */
function digilockerCardHTML(){
  if(!digilockerEnabled()) return '';
  return `<div class="card" id="dl-card">${dlCardInnerHTML()}</div>`;
}
function dlCardInnerHTML(){
  const v = dlView;
  const test = v.mock ? ' <span style="font-size:.7rem;color:var(--text-muted);">(test data)</span>' : '';
  const head = `<h3 style="margin-top:0;"><i class="fa-solid fa-cloud-arrow-down"></i> Fetch from DigiLocker${test}</h3>`;
  const err = v.error ? `<p style="color:var(--brand-danger);font-size:.82rem;margin:8px 0 0;">${dlEsc(v.error)}</p>` : '';
  const note = v.note ? `<p style="color:var(--text-muted);font-size:.82rem;margin:8px 0 0;">${dlEsc(v.note)}</p>` : '';
  const foot = `<p style="color:var(--text-muted);font-size:.72rem;margin:10px 0 0;">You approve access on the official DigiLocker screen. ArogyaBot only receives the documents you choose, and never your DigiLocker password or OTP.</p>`;
  if(v.step==='waiting') return `${head}<p style="margin:0;"><i class="fa-solid fa-spinner fa-spin"></i> Waiting for you to finish in the DigiLocker tab…</p>${note}${err}
    <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="dlCancel()">Cancel</button>${foot}`;
  if(v.step==='connected'){
    const rows = v.docs.length ? v.docs.map((d,i)=>`
      <div class="doc-row">
        <div class="doc-row-icon"><i class="fa-solid fa-file-shield"></i></div>
        <div><div class="doc-row-name">${dlEsc(d.name)}</div><div class="doc-row-meta">${dlEsc(d.type||'Document')} · ${dlEsc(d.issuer||'')}${d.date?' · '+dlEsc(d.date):''}</div></div>
        <div class="doc-row-actions"><button class="btn btn-secondary btn-sm" ${v.busy?'disabled':''} onclick="dlImport(${i})"><i class="fa-solid fa-download"></i> Import</button></div>
      </div>`).join('') : `<p style="margin:0;color:var(--text-muted);">No documents available to import.</p>`;
    return `${head}<div class="doc-list">${rows}</div>${note}${err}
      <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="dlDisconnect()"><i class="fa-solid fa-link-slash"></i> Disconnect</button>${foot}`;
  }
  return `${head}<p style="margin:0;">Bring insurance cards, vaccination certificates and other government-issued documents straight into My Documents.</p>${err}
    <button class="btn btn-sm" style="margin-top:10px;" ${v.busy?'disabled':''} onclick="dlConnect()"><i class="fa-solid fa-link"></i> Connect DigiLocker</button>${foot}`;
}

/* ---- connect: Worker returns a consent URL; we open it and poll until the Worker reports "connected" ---- */
async function dlConnect(){
  if(dlView.busy) return;
  dlResetViewState(); dlView.busy = true; dlRerender();
  try{
    const r = await dlCall('/digilocker/start','POST',{});
    dlView.mock = !!r.mock; dlView.busy = false; dlView.step = 'waiting';
    dlView.note = 'If nothing opened, allow pop-ups for this site and tap Connect again.';
    dlRerender();
    const w = window.open(r.authUrl, '_blank', 'noopener');
    if(!w) dlView.note = 'Your browser blocked the DigiLocker tab. Allow pop-ups for this site, then tap Connect again.';
    dlRerender();
    dlPoll(Date.now());
  }catch(e){ dlView.busy = false; dlView.step = 'idle'; dlView.error = dlErrorText(e.code); dlRerender(); }
}
function dlPoll(startedAt){
  if(dlView.timer) clearTimeout(dlView.timer);
  dlView.timer = setTimeout(async ()=>{
    if(dlView.step!=='waiting' || !document.getElementById('dl-card')) return;   // cancelled, or user left the screen
    if(Date.now()-startedAt > DL_POLL_MAX_MS){ dlView.step='idle'; dlView.error='That took too long. Please tap Connect and try again.'; dlRerender(); return; }
    try{
      const s = await dlCall('/digilocker/status','GET');
      if(s.connected){ dlView.mock = !!s.mock; await dlLoadDocs(); return; }
    }catch(e){ /* transient: keep polling until the timeout */ }
    dlPoll(startedAt);
  }, DL_POLL_MS);
}
async function dlLoadDocs(){
  try{
    const r = await dlCall('/digilocker/documents','GET');
    dlView.docs = r.documents||[]; dlView.mock = !!r.mock; dlView.step = 'connected'; dlView.error = ''; dlView.note = '';
  }catch(e){ dlView.step='idle'; dlView.error = dlErrorText(e.code); }
  dlRerender();
}
function dlCancel(){ dlResetViewState(); dlRerender(); }
async function dlDisconnect(){
  try{ await dlCall('/digilocker/disconnect','POST',{}); }catch(e){}
  dlResetViewState(); dlRerender();
}

/* ---- import one document into My Documents ---- */
function dlBase64ToBlob(b64, mime){
  const bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
  for(let i=0;i<n;i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {type:mime});
}
async function dlImport(i){
  const item = dlView.docs[i]; if(!item || dlView.busy) return;
  const owner = currentPatientId();
  if((db('documents')||[]).some(d=>d.ownerId===owner && d.source==='digilocker' && d.externalId===item.uri)){
    dlView.note = 'That document is already in My Documents.'; dlView.error=''; dlRerender(); return;
  }
  dlView.busy = true; dlView.error = ''; dlView.note = 'Importing…'; dlRerender();
  try{
    const r = await dlCall('/digilocker/fetch','POST',{uri:item.uri});
    const blob = dlBase64ToBlob(r.contentBase64, r.mime);
    const category = ['insurance','history','report','other'].includes(r.category) ? r.category : 'other';
    const docId = uid('DOC');
    const base = {id:docId, ownerId:owner, name:r.name, category, sizeKB:Math.max(1,Math.round(blob.size/1024)), uploadedAt:now(),
                  source:'digilocker', externalId:r.externalId, fetchedAt:now(), contentType:r.mime};
    if(typeof docStorageEnabled==='function' && docStorageEnabled()){
      const path = docStoragePath(currentAuthUid(), docId, r.name);
      const api = docStorageApi();
      try{ await api.put(path, blob, {contentType:r.mime}); }
      catch(e){ try{ await api.remove(path); }catch(_){} throw Object.assign(new Error('upload_failed'),{code:'upload_failed'}); }
      Object.assign(base, {storagePath:path, storage:'firebase'});
    }else{
      if(blob.size > DL_DATAURL_MAX_BYTES){ dlView.busy=false; dlView.note=''; dlView.error='This document is too large to store without cloud storage. Ask the app owner to turn on cloud storage.'; dlRerender(); return; }
      base.dataUrl = 'data:'+r.mime+';base64,'+r.contentBase64;
    }
    const docs = db('documents') || [];       // re-read after the awaits so we don't overwrite another change
    docs.push(base); dbSet('documents', docs);
    dlView.busy = false; dlView.note = '';
    showToast('Document imported', r.name+' was added to My Documents.', 'success');
    renderCurrentView('p-documents');
  }catch(e){
    dlView.busy = false; dlView.note = '';
    dlView.error = e.code==='upload_failed' ? 'Could not save the document. Check your connection and try again.' : dlErrorText(e.code);
    dlRerender();
  }
}
