/* ============================================================
   PATIENT — INSURANCE / GOVT SCHEMES
   ============================================================ */
const SCHEME_CONFIG = {
  pmjay:   {label:'PM-JAY (Ayushman Bharat)', desc:'Cashless hospitalisation cover up to ₹5,00,000/year per household at empaneled public and private hospitals, for families identified via the SECC database or state extension schemes. Since October 2024, every citizen aged 70 or above can also get cover through the Ayushman Vay Vandana card, regardless of income.', needsPolicyFields:false},
  cghs:    {label:'CGHS (Central Govt. Health Scheme)', desc:'For serving/retired central government employees and pensioners. Cashless OPD and IPD treatment at CGHS wellness centres and empaneled hospitals, against your CGHS card. If you are 70 or above, you generally have to choose between CGHS and the Ayushman Vay Vandana card — check with your CGHS wellness centre before switching.', needsPolicyFields:false, extraField:{key:'cghsCategory', label:'CGHS card / beneficiary ID', placeholder:'e.g. CGHS-DL-0123456'}},
  esic:    {label:'ESIC (Employees\' State Insurance)', desc:'For organised-sector employees earning within the ESI wage ceiling and their dependents. Covers medical care, cash benefits during sickness, and maternity benefit.', needsPolicyFields:false, extraField:{key:'esicIpNumber', label:'Insured Person (IP) number', placeholder:'e.g. 1234567890'}},
  state:   {label:'State Government Scheme', desc:'Many states run their own top-up or standalone cashless schemes (e.g. Mahatma Jyotiba Phule Jan Arogya Yojana in Maharashtra) layered on top of or alongside PM-JAY — check with your local health department for your state\'s scheme name and card.', needsPolicyFields:false},
  private: {label:'Private Health Insurance', desc:'A privately purchased or employer-provided policy, settled either cashless (pre-authorised at a network hospital) or by reimbursement after discharge.', needsPolicyFields:true},
  none:    {label:'Not enrolled in any scheme', desc:'You can still register for PM-JAY (if eligible) at any empaneled hospital\'s Aadhaar/Ayushman desk, or purchase a private policy at any time.', needsPolicyFields:false}
};
function schemeLabel(key){ return (SCHEME_CONFIG[key]||{}).label || 'Not verified'; }
const CLAIM_DOC_REQUIREMENTS = {
  cashless: ['Government ID / Aadhaar', 'Scheme card or policy card', 'Hospital pre-authorisation form'],
  reimbursement: ['Original hospital bill', 'Discharge summary', 'Payment receipts', 'Scheme card or policy card']
};
function viewPatientInsurance(){
  const pid = currentPatientId();
  const ins = getInsuranceRecord(pid);
  const scheme = SCHEME_CONFIG[ins.scheme] || null;
  return `${viewHeader('Government Schemes &amp; Insurance','Ayushman Bharat / PM-JAY, CGHS, ESIC &amp; private cover','')}
  ${officialLinksCardHTML(['pmjay','mjpjay','abha','digilocker'],'Official government sites')}
  <div class="card">
    <h3 style="margin-top:0;">Aadhaar-based scheme verification</h3>
    <div class="form-group"><label>Aadhaar Number</label><input class="form-control" id="aadhaar-input-field" maxlength="14" value="${formatAadhaar(db('profile').aadhaarNumber)}" placeholder="XXXX XXXX XXXX" oninput="this.value=formatAadhaar(this.value);"></div>
    ${ins.aadhaar_verified ? `<span class="status-tag status-ok"><i class="fa-solid fa-circle-check"></i> Aadhaar Verified — ${schemeLabel(ins.scheme)}</span> <button class="btn btn-secondary btn-sm" style="margin-left:10px;" onclick="patientResetInsurance()">Reset</button>` : `<button class="btn" onclick="patientVerifyAadhaar()"><i class="fa-solid fa-id-card"></i> Verify via OTP</button>`}
    <p style="color:var(--text-muted);font-size:.78rem;margin:10px 0 0;">This unlocks scheme eligibility info in this app only. To let a hospital desk pull your shared records by Aadhaar during a visit, use Medical Records → Aadhaar linking, and approve their OTP request each time.</p>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Your scheme / cover</h3>
    <div class="form-group"><label>Type</label>
      <select class="form-control" id="ins-scheme-select" onchange="patientOnSchemeChange()">
        <option value="">Select…</option>
        ${Object.keys(SCHEME_CONFIG).map(k=>`<option value="${k}" ${ins.scheme===k?'selected':''}>${SCHEME_CONFIG[k].label}</option>`).join('')}
      </select>
    </div>
    <div id="ins-scheme-extra">${schemeExtraFieldsHTML(ins)}</div>
    <button class="btn btn-secondary btn-sm" onclick="patientSaveSchemeDetails()"><i class="fa-solid fa-floppy-disk"></i> Save scheme details</button>
    ${scheme ? `<div style="background:var(--bg-subtle);border-radius:12px;padding:12px 14px;margin-top:14px;font-size:.84rem;color:var(--text-muted);">${scheme.desc}<div style="font-size:.72rem;margin-top:8px;opacity:.85;">Information last reviewed ${OFFICIAL_LINKS_REVIEWED}. Scheme rules change — always confirm on the official site before relying on this.</div></div>` : ''}
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Submit a claim</h3>
    <div class="grid-2">
      <div class="form-group"><label>Hospital</label><select class="form-control" id="claim-hosp">${db('hospitals').map(h=>`<option value="${h.id}">${h.name}</option>`).join('')}</select></div>
      <div class="form-group"><label>Claim type</label><select class="form-control" id="claim-type"><option value="cashless">Cashless pre-authorisation</option><option value="reimbursement">Reimbursement (post-discharge)</option></select></div>
      <div class="form-group" style="grid-column:1/-1;"><label>Amount (₹)</label><input class="form-control" id="claim-amt" placeholder="25000"></div>
    </div>
    <div style="background:var(--bg-subtle);border-radius:12px;padding:12px 14px;font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">
      <strong>Documents usually needed:</strong> ${CLAIM_DOC_REQUIREMENTS.cashless.join(', ')} (cashless) or ${CLAIM_DOC_REQUIREMENTS.reimbursement.join(', ')} (reimbursement). Upload scans under <em>My Documents</em> so they're ready to attach.
    </div>
    <button class="btn" onclick="submitClaim()"><i class="fa-solid fa-file-invoice"></i> Submit claim</button>
  </div>
  <div class="card"><h3 style="margin-top:0;">Claim status</h3>${renderClaimsTable(pid)}</div>`;
}
function schemeExtraFieldsHTML(ins){
  const scheme = SCHEME_CONFIG[ins.scheme];
  if(!scheme) return '';
  if(scheme.extraField){
    const f = scheme.extraField;
    return `<div class="form-group"><label>${f.label}</label><input class="form-control" id="ins-extra-field" value="${ins[f.key]||''}" placeholder="${f.placeholder}"></div>`;
  }
  if(scheme.needsPolicyFields){
    return `<div class="grid-2">
      <div class="form-group"><label>Insurer name</label><input class="form-control" id="ins-insurer" value="${ins.insurer||''}" placeholder="e.g. Star Health"></div>
      <div class="form-group"><label>Policy number</label><input class="form-control" id="ins-policy" value="${ins.policyNumber||''}" placeholder="e.g. P/123456/01/2026"></div>
      <div class="form-group"><label>TPA (Third Party Administrator)</label><input class="form-control" id="ins-tpa" value="${ins.tpa||''}" placeholder="e.g. MediAssist"></div>
      <div class="form-group"><label>Sum insured (₹)</label><input class="form-control" id="ins-sum" value="${ins.sumInsured||''}" placeholder="500000"></div>
      <div class="form-group" style="grid-column:1/-1;"><label>Policy valid till</label><input type="date" class="form-control" id="ins-valid" value="${ins.validTill||''}"></div>
    </div>`;
  }
  return '';
}
function patientOnSchemeChange(){
  const box = document.getElementById('ins-scheme-extra');
  const key = document.getElementById('ins-scheme-select').value;
  box.innerHTML = schemeExtraFieldsHTML(Object.assign({}, getInsuranceRecord(currentPatientId()), {scheme:key}));
}
function patientSaveSchemeDetails(){
  const pid = currentPatientId();
  const scheme = document.getElementById('ins-scheme-select').value;
  const patch = {scheme};
  const cfg = SCHEME_CONFIG[scheme];
  if(cfg && cfg.extraField){ patch[cfg.extraField.key] = (document.getElementById('ins-extra-field')||{}).value||''; }
  if(cfg && cfg.needsPolicyFields){
    patch.insurer = (document.getElementById('ins-insurer')||{}).value||'';
    patch.policyNumber = (document.getElementById('ins-policy')||{}).value||'';
    patch.tpa = (document.getElementById('ins-tpa')||{}).value||'';
    patch.sumInsured = (document.getElementById('ins-sum')||{}).value||'';
    patch.validTill = (document.getElementById('ins-valid')||{}).value||'';
  }
  setInsuranceFields(pid, patch);
  showToast('Saved', 'Scheme/insurance details updated.', 'success');
  renderCurrentView('p-insurance');
}
function patientVerifyAadhaar(){
  const raw = document.getElementById('aadhaar-input-field').value;
  const n = normalizeAadhaar(raw);
  if(!isValidAadhaar(n)){ showToast('Invalid Aadhaar', 'Enter a valid 12-digit Aadhaar number.', 'danger'); return; }
  const p = db('profile')||{}; p.aadhaarNumber = n; dbSet('profile', p);
  setInsuranceVerified(currentPatientId(), true);
  audit((currentUserRecord()||{}).email||'patient', 'aadhaar_verify', 'OTP confirmed for scheme lookup');
  renderCurrentView('p-insurance');
  showToast('Verified','Government scheme data unlocked.','success');
}
function patientResetInsurance(){ setInsuranceVerified(currentPatientId(), false); renderCurrentView('p-insurance'); }
// ownerId omitted (undefined) => show every patient's claims, used by the
// hospital front-desk screen which isn't tied to one patient's record.
function renderClaimsTable(ownerId){
  const claims = (db('claims')||[]).filter(c=>ownerId===undefined || c.ownerId===ownerId);
  if(!claims.length) return `<p style="color:var(--text-muted);margin:0;">No claims submitted yet.</p>`;
  return `<table class="data-table"><thead><tr><th>Claim ID</th><th>Hospital</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>
  ${claims.map(c=>`<tr><td>${c.id}</td><td>${db('hospitals').find(h=>h.id===c.hosp)?.name||c.hosp}</td><td>${c.type==='reimbursement'?'Reimbursement':'Cashless'}</td><td>₹${(+c.amt).toLocaleString('en-IN')}</td><td><span class="status-tag ${c.status==='Approved'?'status-ok':c.status==='Rejected'?'status-danger':c.status.indexOf('Review')>-1||c.status.indexOf('Pre-auth')>-1?'status-warn':'status-info'}">${c.status}</span></td></tr>`).join('')}
  </tbody></table>`;
}
function submitClaim(){
  const hosp = document.getElementById('claim-hosp').value;
  const type = document.getElementById('claim-type').value;
  const amt = document.getElementById('claim-amt').value || '0';
  const claims = db('claims');
  const c = {id: uid('CLM'), ownerId: currentPatientId(), hosp, type, amt, status:'Submitted'};
  claims.push(c); dbSet('claims', claims);
  showToast('Claim submitted', c.id+' is now under review.', 'success');
  renderCurrentView('p-insurance');
  // Realistic multi-stage TAT: documents verified -> pre-authorisation (cashless
  // only) -> approved/settled, rather than one flat "Under Review" jump.
  const stage2 = type==='cashless' ? 'Pre-authorisation Pending' : 'Documents Under Review';
  setTimeout(()=>{ c.status=stage2; dbSet('claims', claims); if(currentView==='p-insurance') renderCurrentView('p-insurance'); }, 4000);
  setTimeout(()=>{ c.status='Approved'; dbSet('claims', claims); if(currentView==='p-insurance') renderCurrentView('p-insurance'); pushNotification('patient:'+c.ownerId,'Claim approved', c.id+' approved for ₹'+(+amt).toLocaleString('en-IN')+(type==='cashless'?' — cashless settlement with the hospital.':' — reimbursement will be credited to your registered bank account.'), 'success'); }, 9000);
}
