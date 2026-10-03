/* ============================================================
   PATIENT — SERVICE-LINKED SCHEMES (ECHS / CAPF / Railways), STATE SCHEMES, GOVT FINDERS
   (gap analysis D1 + D2 + cheap wins). Works with insurance-schemes.js; every function here is called
   behind a typeof-check there, so the old Schemes screen still works if this file fails to load.
   Privacy: card numbers are never stored in full — only the last 4 characters are kept.
   ============================================================ */
function svcEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function svcMask(v){ const s = String(v||'').replace(/\s/g,''); if(!s) return ''; return 'X'.repeat(Math.max(s.length-4,0)) + s.slice(-4); }

/* ---------- service-linked scheme fields (ECHS, CAPF, Railways) ---------- */
function serviceSchemeFieldsHTML(ins, scheme){
  const links = (scheme.officialKeys||[]).map(k=>OFFICIAL_LINKS[k]).filter(Boolean)
    .map(l=>`<a class="btn btn-secondary btn-sm" style="margin:4px 8px 4px 0;" href="${l.url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid ${l.icon}"></i> ${svcEsc(l.label)}</a>`).join('');
  const saved = ins.svcCardMasked ? `Saved: ${svcEsc(ins.svcCardMasked)} (type a new number to change it)` : (scheme.cardPlaceholder||'Card number');
  return `<div class="grid-2">
      <div class="form-group"><label>${svcEsc(scheme.cardLabel||'Card number')}</label><input class="form-control" id="svc-card" maxlength="24" autocomplete="off" placeholder="${saved}"></div>
      <div class="form-group"><label>Rank / pension category</label><input class="form-control" id="svc-rank" maxlength="60" value="${svcEsc(ins.svcRank)}" placeholder="e.g. Havildar (Retd.)"></div>
      <div class="form-group"><label>${svcEsc(scheme.centreLabel||'Parent centre')}</label><input class="form-control" id="svc-poly" maxlength="80" value="${svcEsc(ins.svcPolyclinic)}" placeholder="${svcEsc(scheme.centrePlaceholder||'')}"></div>
      <div class="form-group"><label>Ward entitlement (optional)</label><input class="form-control" id="svc-ward" maxlength="40" value="${svcEsc(ins.svcWard)}" placeholder="As printed on your card"></div>
    </div>
    <p style="color:var(--text-muted);font-size:.75rem;margin:-4px 0 10px;">For your safety only the last 4 characters of the card number are kept in this app.</p>
    ${scheme.emergencyNote ? `<div style="background:var(--bg-subtle);border-radius:12px;padding:10px 14px;font-size:.82rem;margin-bottom:10px;"><strong>Emergency:</strong> ${svcEsc(scheme.emergencyNote)}</div>` : ''}
    ${scheme.checklist ? `<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:8px;"><strong>Keep ready:</strong> ${scheme.checklist.map(svcEsc).join(', ')}.</div>` : ''}
    <div>${links}</div>
    ${scheme.referralTracker ? referralTrackerHTML(ins) : ''}`;
}
function serviceSchemePatch(){
  const v = id => ((document.getElementById(id)||{}).value||'').trim();
  const patch = {svcRank:v('svc-rank'), svcPolyclinic:v('svc-poly'), svcWard:v('svc-ward')};
  const card = v('svc-card');
  if(card) patch.svcCardMasked = svcMask(card);   // empty box = keep what is already saved
  return patch;
}

/* ---------- referral tracker (ECHS-style polyclinic -> hospital referrals) ---------- */
function referralDaysLeft(validTill){
  if(!validTill) return null;
  const end = new Date(validTill+'T23:59:59').getTime();
  if(isNaN(end)) return null;
  return Math.ceil((end - Date.now())/86400000);
}
function referralTrackerHTML(ins){
  const refs = ins.referrals || [];
  const rows = refs.map(r=>{
    const d = referralDaysLeft(r.validTill);
    const st = d===null ? '' : d<0 ? '<span style="color:var(--brand-danger);">Expired</span>' : d===0 ? 'Expires today' : `Valid · ${d} day${d===1?'':'s'} left`;
    return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:.83rem;">
      <span><strong>${svcEsc(r.no||'No number')}</strong> · ${svcEsc(r.hospital||'Hospital not set')}<br><span style="color:var(--text-muted);">${r.validTill?('Valid till '+svcEsc(r.validTill)+' · '):''}${st}</span></span>
      <button class="btn btn-secondary btn-sm" onclick="patientRemoveReferral('${svcEsc(r.id)}')" title="Remove"><i class="fa-solid fa-trash"></i></button></div>`; }).join('');
  return `<div style="margin-top:14px;"><strong style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Referral tracker</strong>
    ${rows || '<p style="color:var(--text-muted);font-size:.82rem;margin:6px 0;">No referrals saved yet. Add the number from your polyclinic slip so you remember when it expires.</p>'}
    <div class="grid-2" style="margin-top:8px;">
      <div class="form-group"><label>Referral number</label><input class="form-control" id="ref-no" maxlength="40"></div>
      <div class="form-group"><label>Hospital</label><input class="form-control" id="ref-hosp" maxlength="80"></div>
      <div class="form-group"><label>Valid till</label><input type="date" class="form-control" id="ref-valid"></div>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="patientAddReferral()"><i class="fa-solid fa-plus"></i> Add referral</button></div>`;
}
function patientAddReferral(){
  const pid = currentPatientId(), v = id => ((document.getElementById(id)||{}).value||'').trim();
  const no = v('ref-no'), hospital = v('ref-hosp'), validTill = v('ref-valid');
  if(!no && !hospital){ showToast('Add details','Enter the referral number or the hospital name.','danger'); return; }
  const ins = getInsuranceRecord(pid);
  const refs = (ins.referrals||[]).slice(-19);
  refs.push({id: uid('REF'), no, hospital, validTill});
  setInsuranceFields(pid, Object.assign(serviceSchemePatch(), {referrals: refs}));   // also keeps any scheme fields typed above
  renderCurrentView('p-insurance');
}
function patientRemoveReferral(id){
  const pid = currentPatientId(), ins = getInsuranceRecord(pid);
  setInsuranceFields(pid, {referrals:(ins.referrals||[]).filter(r=>r.id!==id)});
  renderCurrentView('p-insurance');
}

/* ---------- "Schemes in your state" ---------- */
function stateSchemesCardHTML(ins){
  const sel = ins.stateCode || '';
  const opts = SCHEME_STATES.map(s=>`<option value="${s.code}" ${sel===s.code?'selected':''}>${svcEsc(s.name)}${s.kind==='ut'?' (UT)':''}</option>`).join('');
  return `<div class="card"><h3 style="margin-top:0;">Schemes in your state</h3>
    <div class="form-group"><label>State / Union Territory</label>
      <select class="form-control" id="ins-state-select" onchange="patientOnStateChange()"><option value="">Select…</option>${opts}</select></div>
    <div id="state-schemes-box">${stateSchemesBodyHTML(sel)}</div></div>`;
}
function stateSchemesBodyHTML(code){
  const st = schemeStateByCode(code);
  if(!st) return `<p style="color:var(--text-muted);font-size:.85rem;margin:0;">Pick your state to see which government schemes may apply to you, from the national base to your state's own scheme.</p>`;
  const layer = (n, title, inner) => `<div style="padding:10px 0;border-bottom:1px solid var(--border-color);"><div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">${n}. ${title}</div>${inner}</div>`;
  const state = st.schemes.map(s=>`<div style="font-size:.88rem;margin-top:4px;"><strong>${svcEsc(s.name)}</strong>
      ${s.ok ? (s.cover ? `<div>Cover: ${svcEsc(s.cover)}</div>` : '') : '<div style="color:var(--text-muted);">Cover amount and eligibility: please check the official site. We have not confirmed them yet.</div>'}
      ${s.note ? `<div style="color:var(--text-muted);font-size:.8rem;">${svcEsc(s.note)}</div>` : ''}</div>`).join('');
  return layer(1,'National base — PM-JAY', `<div style="font-size:.88rem;margin-top:4px;">Up to ₹5 lakh per family per year for eligible families. Every State and UT is now part of PM-JAY. Citizens aged 70+ can get cover through Ayushman Vay Vandana regardless of income.</div>`)
    + layer(2,`${svcEsc(st.name)} state scheme`, state)
    + layer(3,'State government employees', `<div style="font-size:.85rem;color:var(--text-muted);margin-top:4px;">Many states run a separate cashless scheme for their own employees. It is not listed here yet; ask your department.</div>`)
    + layer(4,'Private or employer cover', `<div style="font-size:.85rem;color:var(--text-muted);margin-top:4px;">Add it in "Your scheme / cover" above.</div>`)
    + `<p style="color:var(--text-muted);font-size:.75rem;margin:10px 0 0;">Information last reviewed ${SCHEMES_REGISTRY_REVIEWED}. Amounts change, so confirm on the <a href="${st.url||SCHEMES_FALLBACK_URL}" target="_blank" rel="noopener noreferrer">official site</a> before you rely on them.</p>`;
}
function patientOnStateChange(){
  const code = (document.getElementById('ins-state-select')||{}).value || '';
  setInsuranceFields(currentPatientId(), {stateCode: code});
  const box = document.getElementById('state-schemes-box');
  if(box) box.innerHTML = stateSchemesBodyHTML(code);
}

/* ---------- helplines + government finders ---------- */
function govServicesCardHTML(){
  return `<div class="card"><h3 style="margin-top:0;">Free government health helplines</h3>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:.88rem;"><strong>Tele-MANAS · 14416</strong><br><span style="color:var(--text-muted);">Toll-free mental health support in 20 languages</span></span>
        <a class="btn btn-sm" href="tel:14416"><i class="fa-solid fa-phone"></i> Call 14416</a>
      </div></div>`
    + officialLinksCardHTML(['aam','janaushadhi','eraktkosh','uwin','esanjeevani','myscheme'], 'Find government health services');
}
// Compact chips used inside the Nearby Help card (dashboard).
function nearbyGovLinksHTML(){
  const chips = ['janaushadhi','aam','eraktkosh','echs'].map(k=>{ const l = OFFICIAL_LINKS[k]; if(!l) return '';
    return `<a class="btn btn-secondary btn-sm" style="margin:4px 6px 0 0;" href="${l.url}" target="_blank" rel="noopener noreferrer" title="${svcEsc(l.hint)}"><i class="fa-solid ${l.icon}"></i> ${svcEsc(l.label)}</a>`; }).join('');
  return `<div style="margin-top:14px;"><strong style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Also find (official sites)</strong><div>${chips}</div></div>`;
}
