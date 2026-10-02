/* ============================================================
   PATIENT — MY DOCUMENTS (insurance papers, old history files, etc.)
   ============================================================ */
const DOC_CATEGORIES = {
  insurance: {label:'Insurance', icon:'fa-file-shield'},
  history:   {label:'Medical History', icon:'fa-file-waveform'},
  report:    {label:'Lab Report', icon:'fa-file-medical'},
  other:     {label:'Other', icon:'fa-file'},
};
function viewPatientDocuments(){
  const docs = (db('documents')||[]).filter(d=>d.ownerId===currentPatientId()).slice().sort((a,b)=>b.uploadedAt-a.uploadedAt);
  return `${viewHeader('My Documents','Insurance papers &amp; medical history','Upload insurance cards, discharge summaries, or old medical history so they\'re on hand if you ever need them in an emergency.')}
  ${officialLinksCardHTML(['digilocker','abha'],'Get documents from official sources')}
  <div class="card">
    <h3 style="margin-top:0;">Upload a document</h3>
    <div class="form-group"><label>Document type</label>
      <select class="form-control" id="doc-category">
        ${Object.keys(DOC_CATEGORIES).map(k=>`<option value="${k}">${DOC_CATEGORIES[k].label}</option>`).join('')}
      </select>
    </div>
    <label class="doc-dropzone" for="doc-file-input">
      <i class="fa-solid fa-cloud-arrow-up"></i>
      <strong>Tap to choose a file</strong>
      <div style="color:var(--text-muted);font-size:.8rem;margin-top:4px;">PDF or image · insurance card, discharge summary, old prescriptions, etc.${(typeof docStorageEnabled==='function'&&docStorageEnabled())?' · up to 10 MB':''}</div>
    </label>
    <input type="file" id="doc-file-input" accept=".pdf,image/*" style="display:none;" onchange="handleDocUpload(event)">
    <div id="doc-upload-status"></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Saved documents (${docs.length})</h3>
    ${docs.length ? `<div class="doc-list">${docs.map(d=>`
      <div class="doc-row">
        <div class="doc-row-icon"><i class="fa-solid ${DOC_CATEGORIES[d.category]?.icon||'fa-file'}"></i></div>
        <div>
          <div class="doc-row-name">${docEsc(d.name)}</div>
          <div class="doc-row-meta">${DOC_CATEGORIES[d.category]?.label||'Other'} · ${d.sizeKB} KB · ${fmtTime(d.uploadedAt)}${d.storagePath?' · Cloud':''}</div>
        </div>
        <div class="doc-row-actions">
          ${d.storagePath ? `<button class="btn btn-secondary btn-sm" onclick="docOpenFromStorage('${d.id}')" title="Open"><i class="fa-solid fa-download"></i></button>` : `<a class="btn btn-secondary btn-sm" href="${d.dataUrl}" download="${docEsc(d.name)}"><i class="fa-solid fa-download"></i></a>`}
          <button class="btn btn-secondary btn-sm" onclick="deleteDocument('${d.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join('')}</div>` : `<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>No documents uploaded yet.</p></div>`}
  </div>`;
}
function handleDocUpload(evt){
  // Phase 3: cloud-storage path (only when flag on + SDK + Firebase login); otherwise the original code below runs unchanged.
  if(typeof docStorageEnabled==='function' && docStorageEnabled()) return handleDocUploadToStorage(evt);
  const file = evt.target.files[0];
  const status = document.getElementById('doc-upload-status');
  if(!file) return;
  if(file.size > 4.5*1024*1024){
    status.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">File too large for this demo (max ~4.5MB). Try a smaller scan or photo.</p>`;
    evt.target.value = '';
    return;
  }
  status.innerHTML = `<p style="color:var(--text-muted);font-size:.82rem;margin-top:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Uploading…</p>`;
  const category = document.getElementById('doc-category').value;
  const reader = new FileReader();
  reader.onload = () => {
    const docs = db('documents') || [];
    docs.push({
      id: uid('DOC'),
      ownerId: currentPatientId(),
      name: file.name,
      category,
      sizeKB: Math.round(file.size/1024),
      uploadedAt: now(),
      dataUrl: reader.result,
    });
    dbSet('documents', docs);
    showToast('Document saved', file.name+' was added to your documents.', 'success');
    evt.target.value = '';
    renderCurrentView('p-documents');
  };
  reader.onerror = () => {
    status.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">Couldn't read that file — please try again.</p>`;
  };
  reader.readAsDataURL(file);
}
function deleteDocument(id){
  // Guard ownership too, not just id — a patient should never be able to
  // delete another account's document even if an id were somehow guessed.
  const removed = (db('documents')||[]).find(d=>d.id===id && d.ownerId===currentPatientId());
  const docs = (db('documents')||[]).filter(d=>!(d.id===id && d.ownerId===currentPatientId()));
  dbSet('documents', docs);
  if(removed && removed.storagePath && typeof docRemoveFromStorage==='function') docRemoveFromStorage(removed.storagePath);
  showToast('Document removed', '', 'success');
  renderCurrentView('p-documents');
}
