/* ============================================================
   PATIENT — ABHA HEALTH ID (view 'p-abha', plan Phase 2 / Track B)
   Create or link an ABHA from inside ArogyaBot. Aadhaar / mobile numbers are typed into a field,
   sent to the Worker, and cleared — never saved, logged or put in app state.
   Consents (Approve/Deny/Revoke) arrive with Phase 5; this screen only shows a placeholder for them.
   ============================================================ */
function viewPatientAbha(){
  const header = viewHeader('Health ID','ABHA Health ID','Your Ayushman Bharat Health Account number, linked securely to this profile.');
  if(!abdmEnabled()){
    return `${header}<div class="card"><p style="margin:0;">ABHA linking is not switched on in this build yet.</p></div>${officialLinksCardHTML(['abha','abdm'],'Create your ABHA on the official site')}`;
  }
  const rec = abdmGetMember();
  if(rec) return `${header}${abhaLinkedCardHTML(rec)}${abhaConsentPlaceholderHTML()}`;
  return `${header}<div class="card" id="abha-flow">${abhaFlowHTML()}</div>${abhaConsentPlaceholderHTML()}`;
}
function abhaLinkedCardHTML(rec){
  const p = db('profile')||{};
  return `<div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-circle-check" style="color:var(--success,#16a34a)"></i> ABHA linked${rec.mock?' <span style="font-size:.7rem;color:var(--text-muted);">(test data)</span>':''}</h3>
    <div class="profile-menu-row"><span>Name</span><strong>${(p.name||rec.name||'').replace(/</g,'&lt;')}</strong></div>
    <div class="profile-menu-row"><span>ABHA number</span><strong>${rec.abhaNumberMasked}</strong></div>
    <div class="profile-menu-row"><span>ABHA address</span><strong>${rec.abhaAddress}</strong></div>
    <p style="color:var(--text-muted);font-size:.75rem;margin:10px 0;">Linked ${fmtTime(rec.linkedAt)}. Only the masked number and address are kept on this device.</p>
    <button class="btn btn-secondary btn-sm" onclick="abhaUnlink()"><i class="fa-solid fa-link-slash"></i> Unlink from this profile</button>
    <p style="color:var(--text-muted);font-size:.72rem;margin:8px 0 0;">Unlinking only removes it from ArogyaBot. Your ABHA itself is not deleted.</p>
  </div>`;
}
function abhaConsentPlaceholderHTML(){
  return `<div class="card"><h3 style="margin-top:0;">Consents</h3><p style="color:var(--text-muted);margin:0;">Hospital record requests that you can approve, limit or revoke will appear here in a later update.</p></div>`;
}
function abhaFlowHTML(){
  const s = abdmView, err = s.error ? `<div style="color:var(--danger,#dc2626);font-size:.85rem;margin:8px 0;">${s.error}</div>` : '';
  const dis = s.busy ? 'disabled' : '';
  if(s.step==='choose') return `<h3 style="margin-top:0;">Create or link your ABHA</h3>
    <p style="color:var(--text-muted);">Choose how to verify. ArogyaBot never stores your Aadhaar number.</p>
    <button class="btn btn-block" style="margin-bottom:8px;" onclick="abhaChoose('aadhaar')"><i class="fa-solid fa-id-card"></i> Use Aadhaar OTP</button>
    <button class="btn btn-secondary btn-block" onclick="abhaChoose('mobile')"><i class="fa-solid fa-mobile-screen"></i> Use mobile OTP</button>${err}`;
  if(s.step==='number'){
    const isA = s.method==='aadhaar';
    return `<h3 style="margin-top:0;">${isA?'Aadhaar':'Mobile'} verification</h3>
      <div class="form-group"><label>${isA?'12-digit Aadhaar number':'10-digit mobile number'}</label>
        <input class="form-control" id="abha-number" inputmode="numeric" autocomplete="off" maxlength="${isA?12:10}" placeholder="${isA?'XXXX XXXX XXXX':'98XXXXXXXX'}"></div>${err}
      <button class="btn" ${dis} onclick="abhaSendOtp()">Send OTP</button>
      <button class="btn btn-secondary" onclick="abhaReset()">Back</button>`;
  }
  return `<h3 style="margin-top:0;">Enter the OTP</h3>
    <div class="form-group"><label>6-digit OTP</label><input class="form-control" id="abha-otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>${err}
    <button class="btn" ${dis} onclick="abhaVerifyOtp()">Verify &amp; link</button>
    <button class="btn btn-secondary" onclick="abhaReset()">Cancel</button>`;
}
function abhaRerender(){ const el=document.getElementById('abha-flow'); if(el) el.innerHTML = abhaFlowHTML(); else if(currentView==='p-abha') renderCurrentView('p-abha'); }
function abhaChoose(method){ abdmView = {step:'number', method, txnId:null, busy:false, error:''}; abhaRerender(); }
function abhaReset(){ abdmResetViewState(); abhaRerender(); }
async function abhaSendOtp(){
  const input = document.getElementById('abha-number'); const val = (input&&input.value||'').replace(/\s/g,'');
  abdmView.busy = true; abdmView.error=''; abhaRerender();
  try{
    const r = await abdmCall(abdmView.method==='aadhaar'?'/abha/aadhaar/otp':'/abha/mobile/otp','POST', abdmView.method==='aadhaar'?{aadhaar:val}:{mobile:val});
    abdmView.txnId = r.txnId; abdmView.step='otp';
  }catch(e){ abdmView.error = abdmErrorText(e.code); }
  abdmView.busy=false; abhaRerender();   // the typed number is gone with the old DOM; nothing was kept
}
async function abhaVerifyOtp(){
  const otp = ((document.getElementById('abha-otp')||{}).value||'').trim();
  const memberAtStart = currentPatientId();   // guard: user may switch family member mid-request
  abdmView.busy=true; abdmView.error=''; abhaRerender();
  try{
    const r = await abdmCall(abdmView.method==='aadhaar'?'/abha/aadhaar/verify':'/abha/mobile/verify','POST',{otp, txnId:abdmView.txnId});
    abdmSetMember(memberAtStart, {abhaNumberMasked:r.abhaNumberMasked, abhaAddress:r.abhaAddress, name:r.name, mock:!!r.mock, linkedAt:Date.now()});
    try{ audit('patient','abha','ABHA linked'); }catch(e){}
    abdmResetViewState();
    if(currentPatientId()===memberAtStart) renderCurrentView('p-abha');
    showToast('ABHA linked','Your ABHA is now linked to this profile.','success');
  }catch(e){ abdmView.error = abdmErrorText(e.code); abdmView.busy=false; abhaRerender(); }
}
function abhaUnlink(){
  if(!confirm('Unlink this ABHA from this profile? Your ABHA itself is not deleted.')) return;
  abdmSetMember(currentPatientId(), null);
  try{ audit('patient','abha','ABHA unlinked'); }catch(e){}
  renderCurrentView('p-abha');
}
