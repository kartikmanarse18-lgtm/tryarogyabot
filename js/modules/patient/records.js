/* ============================================================
   PATIENT — RECORDS (profile + mock OCR)
   ============================================================ */
function viewPatientRecords(){
  const p = db('profile');
  return `${viewHeader('Medical Records','Your emergency profile','Shared with responders and hospitals only during an active emergency, per your consent.')}
  <div class="card">
    <div class="grid-2">
      <div class="form-group"><label>Full name</label><input class="form-control" id="rec-name" value="${p.name}"></div>
      <div class="form-group"><label>Gender</label>
        <select class="form-control" id="rec-gender">
          <option value="Female" ${p.gender==='Female'?'selected':''}>Female</option>
          <option value="Male" ${p.gender==='Male'?'selected':''}>Male</option>
          <option value="Other" ${(!p.gender||p.gender==='Other')?'selected':''}>Other / Prefer not to say</option>
        </select>
      </div>
      <div class="form-group"><label>Blood group</label><input class="form-control" id="rec-blood" value="${p.bloodGroup}"></div>
      <div class="form-group"><label>Known allergies</label><input class="form-control" id="rec-allergies" value="${p.allergies}"></div>
      <div class="form-group"><label>Chronic conditions</label><input class="form-control" id="rec-chronic" value="${p.chronic}"></div>
      <div class="form-group" style="grid-column:1/-1;"><label>Emergency contact</label><input class="form-control" id="rec-contact" value="${p.emergencyContact}"></div>
    </div>
    <button class="btn" onclick="saveProfile()"><i class="fa-solid fa-floppy-disk"></i> Save profile</button>
  </div>
  ${viewAadhaarLinkCard()}
  <div class="card">
    <h3 style="margin-top:0;">Upload a lab report or prescription</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">Extracted live by Google Gemini's document vision, via your Cloudflare Worker backend — never processed on-device or with a key stored in this file. AI-extracted, unverified — always confirm with your doctor.</p>
    <label class="doc-dropzone" for="ocr-file-input">
      <i class="fa-solid fa-cloud-arrow-up"></i>
      <strong>Tap to choose a file</strong>
      <div style="color:var(--text-muted);font-size:.8rem;margin-top:4px;">PDF or photo of a lab report / prescription (max ~8MB)</div>
    </label>
    <input type="file" id="ocr-file-input" accept=".pdf,image/*" style="display:none;" onchange="handleOcrUpload(event)">
    <div id="ocr-result"></div>
  </div>`;
}
function saveProfile(){
  const p = db('profile');
  p.name=document.getElementById('rec-name').value; p.gender=document.getElementById('rec-gender').value; p.bloodGroup=document.getElementById('rec-blood').value;
  p.allergies=document.getElementById('rec-allergies').value; p.chronic=document.getElementById('rec-chronic').value;
  p.emergencyContact=document.getElementById('rec-contact').value;
  dbSet('profile',p);
  persistActiveProfileBackToMember(); // writes into this account's own member record, not a shared room doc
  buildSideNav('patient'); // Women's Health visibility depends on gender
  showToast('Saved','Your emergency profile is up to date.','success');
}
// Aadhaar identity card shown on the patient's own Medical Records page —
// separate card from the profile form above because linking/sharing an
// Aadhaar number is a deliberate, explicit action, not bundled into a
// routine profile edit.
function viewAadhaarLinkCard(){
  const p = db('profile')||{};
  const aadhaar = normalizeAadhaar(p.aadhaarNumber);
  const valid = aadhaar.length===12 && isValidAadhaar(aadhaar);
  const dirEntry = aadhaar ? aadhaarDirectory()[aadhaar] : null;
  const sharing = !!(dirEntry && dirEntry.sharingEnabled);
  return `<div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-id-card" style="color:var(--brand-primary);"></i> Aadhaar linking &amp; hospital lookup</h3>
    <p style="color:var(--text-muted);font-size:.85rem;margin-top:0;">Link your Aadhaar so a hospital desk can pull up your records instantly during check-in — but only after you approve an OTP sent for that specific visit. Nothing is shared until you enable sharing below.</p>
    <div class="form-group"><label>Aadhaar number</label><input class="form-control" id="rec-aadhaar" maxlength="14" value="${formatAadhaar(aadhaar)}" placeholder="XXXX XXXX XXXX" oninput="this.value=formatAadhaar(this.value);"></div>
    ${aadhaar.length===12 && !valid ? `<p class="field-err" style="margin:-4px 0 10px;color:var(--brand-danger);">That number doesn't pass the Aadhaar checksum — please re-check the digits.</p>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <button class="btn btn-sm" onclick="saveAadhaarNumber()"><i class="fa-solid fa-floppy-disk"></i> Save number</button>
      ${valid ? (sharing
        ? `<span class="status-tag status-ok"><i class="fa-solid fa-share-nodes"></i> Shared for hospital lookup</span><button class="btn btn-secondary btn-sm" onclick="syncMyAadhaarSharing()"><i class="fa-solid fa-rotate"></i> Refresh shared copy</button><button class="btn btn-secondary btn-sm" onclick="stopMyAadhaarSharing()"><i class="fa-solid fa-ban"></i> Stop sharing</button>`
        : `<button class="btn btn-sm" onclick="syncMyAadhaarSharing()"><i class="fa-solid fa-share-nodes"></i> Enable hospital lookup</button>`) : ''}
    </div>
    ${sharing ? `<p style="color:var(--text-muted);font-size:.78rem;margin:10px 0 0;">Last synced ${fmtTime(dirEntry.lastSyncedAt)} · ${dirEntry.documents.length} document(s) included. Any hospital lookup still requires you to hand over a fresh OTP at the desk — see Audit-style notifications in your inbox for every access.</p>` : ''}
  </div>`;
}
function saveAadhaarNumber(){
  const p = db('profile')||{};
  const raw = document.getElementById('rec-aadhaar').value;
  const n = normalizeAadhaar(raw);
  if(n.length!==12 || !isValidAadhaar(n)){ showToast('Invalid Aadhaar', 'Enter a valid 12-digit Aadhaar number.', 'danger'); return; }
  p.aadhaarNumber = n;
  dbSet('profile', p);
  persistActiveProfileBackToMember();
  showToast('Saved', 'Aadhaar number linked to this profile.', 'success');
  renderCurrentView('p-records');
}
function ocrStatusMeta(status){
  return { low:{label:'Low', cls:'status-warn'}, high:{label:'High', cls:'status-danger'}, normal:{label:'Normal', cls:'status-ok'} }[status] || {label:'Unclear', cls:'status-muted'};
}
async function handleOcrUpload(evt){
  const file = evt.target.files[0];
  const slot = document.getElementById('ocr-result');
  if(!file) return;
  if(file.size > 8*1024*1024){
    slot.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">File too large (max ~8MB). Try a smaller scan or photo.</p>`;
    evt.target.value = ''; return;
  }
  if(!aiBackendConfigured()){
    slot.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">AI backend not configured yet — deploy arogyabot-worker and set AI_BACKEND_URL (see AI Settings on the Symptom Checker page) to enable real document extraction.</p>`;
    evt.target.value = ''; return;
  }
  slot.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Reading and extracting text…</p></div>`;
  try{
    const dataUrl = await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read that file'));
      reader.readAsDataURL(file);
    });
    const base64Data = dataUrl.split(',')[1];
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const resp = await withAICallTimeout(signal => fetch(getAIBackendUrl().replace(/\/$/,'') + '/api/ocr-extract', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({base64Data, mimeType}), signal
    }));
    const result = await resp.json().catch(()=>null);
    if(!resp.ok || !result) throw new Error((result && result.error) || `Extraction failed (${resp.status})`);

    const rows = (result.tests||[]).map(t=>{
      const sm = ocrStatusMeta(t.status);
      return `<tr><td>${t.name}</td><td>${t.value}${t.unit?' '+t.unit:''}${t.referenceRange?` <span style="color:var(--text-muted);font-size:.75rem;">(ref: ${t.referenceRange})</span>`:''}</td><td class="status-tag ${sm.cls}">${sm.label}</td></tr>`;
    }).join('');
    const medsList = (result.medications||[]).length ? `<ul style="margin:10px 0 0;padding-left:18px;">${result.medications.map(m=>`<li>${m}</li>`).join('')}</ul>` : '';

    slot.innerHTML = `<div class="card" style="background:var(--bg-subtle);margin-top:14px;margin-bottom:0;">
      <strong>AI-extracted (unverified) — ${result.reportType || 'Medical Document'}</strong>
      ${rows ? `<table class="data-table" style="margin-top:10px;">${rows}</table>` : ''}
      ${medsList}
      ${result.summary ? `<p style="font-size:.82rem;margin-top:10px;">${result.summary}</p>` : ''}
      <p style="font-size:.78rem;color:var(--text-muted);margin-top:10px;">⚠️ AI-extracted, non-diagnostic. Confirm with your doctor.</p>
    </div>`;
  }catch(err){
    slot.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;margin-top:10px;">⚠️ Extraction failed: ${(err && err.message) || 'unknown error'}. Try a clearer photo or a different file.</p>`;
  }finally{
    evt.target.value = '';
  }
}
