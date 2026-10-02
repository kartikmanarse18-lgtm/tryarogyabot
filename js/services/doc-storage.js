/* ============================================================
   DOCUMENT STORAGE (plan Phase 3) — new uploads go to Firebase Storage instead of being embedded as a
   base64 dataUrl inside the Firestore 'documents' array (which hits Firestore's ~1 MiB document limit).
   - Dormant unless DOCS_STORAGE_ENABLED is true AND the Storage SDK loaded AND the user has a Firebase Auth session.
     Otherwise the old dataUrl path in my-documents.js runs exactly as before.
   - Files live at users/{authUid}/documents/{docId}/{safeName}; Firestore keeps only metadata + storagePath.
   - Download links are fetched on demand and never saved (they carry an access token).
   - Existing dataUrl documents are untouched (migration/removal is Phase 7, owner approval — plan Appendix D).
   ============================================================ */
const DOC_STORAGE_MAX_BYTES = 10*1024*1024;
const DOC_EXT_TYPES = {pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', heic:'image/heic', heif:'image/heif'};

function docEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Real adapter around the Firebase Storage SDK (null if the SDK isn't available). Tests replace this function.
function docStorageApi(){
  try{
    if(typeof ensureFirebaseApp!=='function' || !ensureFirebaseApp()) return null;
    if(typeof firebase==='undefined' || typeof firebase.storage!=='function') return null; // storage-compat script not loaded
    const st = firebase.storage();
    return {
      put(path, file, meta, onProgress){
        return new Promise((resolve, reject)=>{
          const task = st.ref(path).put(file, meta);
          task.on('state_changed', s=>{ if(onProgress) onProgress(s.totalBytes ? s.bytesTransferred/s.totalBytes : 0); }, reject, ()=>resolve());
        });
      },
      url(path){ return st.ref(path).getDownloadURL(); },
      remove(path){ return st.ref(path).delete(); }
    };
  }catch(e){ console.warn('Storage SDK unavailable', e); return null; }
}
function docStorageEnabled(){
  return typeof DOCS_STORAGE_ENABLED!=='undefined' && DOCS_STORAGE_ENABLED===true
    && typeof currentAuthUid==='function' && !!currentAuthUid() && !!docStorageApi();
}
function docContentType(file){
  const ext = (String(file.name||'').split('.').pop()||'').toLowerCase();
  if(file.type && (file.type==='application/pdf' || /^image\//.test(file.type))) return file.type;
  if(!file.type && DOC_EXT_TYPES[ext]) return DOC_EXT_TYPES[ext];
  return '';
}
// Returns '' when OK, otherwise a short message for the user.
function docValidateFile(file){
  if(!file) return 'Choose a file first.';
  if(file.size > DOC_STORAGE_MAX_BYTES) return 'File is too large (max 10 MB). Try a smaller scan or photo.';
  if(file.size <= 0) return 'That file is empty.';
  if(!docContentType(file)) return 'Only PDF or image files can be uploaded.';
  return '';
}
function docSafeName(name){
  const n = String(name||'file').replace(/[^A-Za-z0-9._-]/g,'_').replace(/^\.+/,'');
  return (n.length>100 ? n.slice(-100) : n) || 'file';
}
function docStoragePath(authUid, docId, name){ return `users/${authUid}/documents/${docId}/${docSafeName(name)}`; }

async function handleDocUploadToStorage(evt){
  const file = evt.target.files[0];
  const status = document.getElementById('doc-upload-status');
  if(!file) return;
  const bad = docValidateFile(file);
  if(bad){
    status.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">${docEsc(bad)}</p>`;
    evt.target.value = ''; return;
  }
  const api = docStorageApi(), authUid = currentAuthUid();
  const category = document.getElementById('doc-category').value;
  const owner = currentPatientId();
  const docId = uid('DOC');
  const path = docStoragePath(authUid, docId, file.name);
  const setPct = p=>{ status.innerHTML = `<p style="color:var(--text-muted);font-size:.82rem;margin-top:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Uploading… ${Math.round(p*100)}%</p>`; };
  setPct(0);
  try{
    await api.put(path, file, {contentType: docContentType(file)}, setPct);
  }catch(e){
    try{ await api.remove(path); }catch(_){}   // clean up a half-written object
    status.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">Upload failed. Check your connection and try again.</p>`;
    evt.target.value = ''; return;
  }
  const docs = db('documents') || [];   // re-read after the await so we don't overwrite another change
  docs.push({
    id: docId, ownerId: owner, name: file.name, category, sizeKB: Math.round(file.size/1024), uploadedAt: now(),
    storagePath: path, contentType: docContentType(file), storage: 'firebase', source: 'upload'
  });
  dbSet('documents', docs);
  showToast('Document saved', file.name+' was added to your documents.', 'success');
  evt.target.value = '';
  renderCurrentView('p-documents');
}

// Opens a Storage-backed document. The link is requested now and never stored.
async function docOpenFromStorage(id){
  const d = (db('documents')||[]).find(x=>x.id===id && x.ownerId===currentPatientId());
  if(!d || !d.storagePath) return;
  const authUid = (typeof currentAuthUid==='function') ? currentAuthUid() : null;
  if(!authUid || d.storagePath.indexOf(`users/${authUid}/`)!==0){ showToast('Cannot open','This file belongs to a different login.','danger'); return; }
  const api = docStorageApi();
  if(!api){ showToast('Cannot open','Cloud storage is not available right now.','danger'); return; }
  try{
    const url = await api.url(d.storagePath);
    window.open(url, '_blank', 'noopener');
  }catch(e){ showToast('Cannot open','Could not fetch the file. Please try again.','danger'); }
}
async function docRemoveFromStorage(path){
  try{ const api = docStorageApi(); if(api && path) await api.remove(path); }
  catch(e){ console.warn('Storage delete failed (metadata already removed)', e); }
}
