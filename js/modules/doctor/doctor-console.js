/* ============================================================
   DOCTOR CONSOLE — scoped to CURRENT_DOCTOR_ID + CURRENT_HOSPITAL_ID.
   A doctor manages their own availability slots, joins their own
   video calls, and writes prescriptions for their own patients —
   never sees another doctor's roster or another hospital's data.
   ============================================================ */
function currentDoctorRecord(){ return (db('doctors')||[]).find(x=>x.id===CURRENT_DOCTOR_ID); }
function viewDoctorDash(){
  const d = currentDoctorRecord() || {};
  const h = (db('hospitals')||[]).find(x=>x.id===CURRENT_HOSPITAL_ID) || {};
  const appts = db('appointments').filter(a=>a.hospital===CURRENT_HOSPITAL_ID && a.doctor===d.name);
  const upcoming = appts.filter(a=>a.status==='Confirmed');
  const completed = appts.filter(a=>a.status==='Completed');
  const totalReceived = appts.filter(a=>a.paymentStatus==='paid').reduce((s,a)=>s+(+a.amountPaid||0),0);
  return `${viewHeader('Doctor Console', 'Welcome, '+(d.name||'Doctor'), h.name?('At '+h.name):'')}
  <div class="grid-3">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-calendar-check"></i></div><div><div class="dash-stat-num">${upcoming.length}</div><div class="dash-stat-label">Upcoming Consultations</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-clock"></i></div><div><div class="dash-stat-num">${(d.slots||[]).length}</div><div class="dash-stat-label">Open Slots</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-prescription-bottle-medical"></i></div><div><div class="dash-stat-num">${completed.length}</div><div class="dash-stat-label">Consultations Completed</div></div></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-indian-rupee-sign"></i> Payments received</h3>
    <p style="font-family:var(--ff-display);font-size:1.8rem;font-weight:800;margin:0;">&#8377;${totalReceived.toFixed(2)}</p>
    <p style="color:var(--text-muted);font-size:.82rem;margin:6px 0 0;">Across ${appts.filter(a=>a.paymentStatus==='paid').length} paid consultation${appts.filter(a=>a.paymentStatus==='paid').length===1?'':'s'}. See each booking's status in My Appointments.</p>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Your profile summary</h3>
    <p style="color:var(--text-muted);margin:0;">${d.specialty||'—'} · ${d.degree||'No degree on file'} · ${d.experience?d.experience+' yrs experience':'Experience not set'} · Fee &#8377;${d.fee||'—'}</p>
    <p style="margin-top:10px;">${d.available ? '<span class="status-tag status-ok">Available for booking</span>' : '<span class="status-tag status-muted">Currently off duty — ask your hospital admin to toggle you available</span>'}</p>
  </div>`;
}
let doctorRxDraftApptId = null;
function viewDoctorAppts(){
  const d = currentDoctorRecord() || {};
  const appts = db('appointments').filter(a=>a.hospital===CURRENT_HOSPITAL_ID && a.doctor===d.name).sort((a,b)=>(a.status==='Confirmed'?-1:1));
  const inCall = db('activeCall');
  return `${viewHeader('My Appointments','Consultations booked with you','Join the call, then write the e-prescription when you\'re done — it lands straight in the patient\'s records and can be sent on to any pharmacy.')}
  ${inCall && inCall.doctor===d.name ? `<div class="card">
    ${videoCallHtml(inCall.patientName||'Patient', 'doctorEndCall')}
  </div>` : ''}
  ${appts.length ? appts.map(a=>`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><strong>${a.patient}</strong><br><span style="color:var(--text-muted);font-size:.85rem;">${a.slot}</span></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="status-tag ${a.status==='Completed'?'status-muted':a.status==='Cancelled'?'status-danger':'status-ok'}">${a.status}</span>
          ${a.paymentStatus==='paid' ? `<span class="status-tag status-ok"><i class="fa-solid fa-circle-check"></i> Payment received · &#8377;${(+a.amountPaid||0).toFixed(2)}</span>` : a.status==='Confirmed' ? `<span class="status-tag status-warn">Payment pending</span>` : ''}
        </div>
      </div>
      ${a.status==='Confirmed' ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="doctorJoinCall('${a.id}')"><i class="fa-solid fa-video"></i> Join call</button>
        <button class="btn btn-sm btn-secondary" onclick="doctorOpenRxForm('${a.id}')"><i class="fa-solid fa-file-prescription"></i> Write prescription</button>
      </div>` : ''}
      ${doctorRxDraftApptId===a.id ? doctorRxFormHtml(a) : ''}
    </div>`).join('') : `<div class="empty-state"><i class="fa-solid fa-calendar"></i><p>No bookings yet — patients will find you here once you add availability slots.</p></div>`}`;
}
function doctorOpenRxForm(apptId){ doctorRxDraftApptId = apptId; renderCurrentView('d-appts'); }
function doctorCancelRxForm(){ doctorRxDraftApptId = null; renderCurrentView('d-appts'); }
function doctorRxFormHtml(a){
  return `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
    <div class="form-group"><label>Medicines &amp; instructions</label><textarea class="form-control" id="doc-rx-text-${a.id}" placeholder="e.g. Paracetamol 500mg — 1 tab twice daily x3 days"></textarea></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-sm" onclick="doctorSubmitRx('${a.id}')"><i class="fa-solid fa-check"></i> Save &amp; complete consultation</button>
      <button class="btn btn-sm btn-secondary" onclick="doctorCancelRxForm()">Cancel</button>
    </div>
  </div>`;
}
function doctorJoinCall(apptId){
  const a = db('appointments').find(x=>x.id===apptId);
  if(!a) return;
  dbSet('activeCall', {doctor:a.doctor, ownerId:a.ownerId, apptId:a.id, hospital:a.hospital, patientName:a.patient});
  audit('doctor:'+CURRENT_DOCTOR_ID, 'call_join', a.doctor+' with '+a.patient);
  renderCurrentView('d-appts');
}
function doctorEndCall(){
  rtcHangUp();
  dbSet('activeCall', null);
  renderCurrentView('d-appts');
}
function doctorSubmitRx(apptId){
  const el = document.getElementById('doc-rx-text-'+apptId);
  const text = (el ? el.value : '').trim();
  if(!text){ showToast('Nothing entered','Add the medicines/instructions before saving.','danger'); return; }
  const appts = db('appointments');
  const a = appts.find(x=>x.id===apptId);
  if(!a) return;
  a.status = 'Completed';
  dbSet('appointments', appts);
  const rx = db('prescriptions');
  rx.push({id:uid('RX'), ownerId:a.ownerId, ownerAuthUid:a.ownerAuthUid, doctor:a.doctor, medicines:text, date:new Date().toLocaleDateString(), hospital:a.hospital});
  dbSet('prescriptions', rx);
  const inCall = db('activeCall');
  if(inCall && inCall.apptId===apptId){ rtcHangUp(); dbSet('activeCall', null); }
  audit('doctor:'+CURRENT_DOCTOR_ID, 'prescription_write', a.doctor+' -> '+a.patient);
  pushNotification('patient:'+a.ownerId, 'e-Prescription ready', `${a.doctor} sent you a prescription after your ${a.slot} consultation.`, 'success', null);
  doctorRxDraftApptId = null;
  showToast('Saved', 'Prescription sent to the patient and the consultation is marked complete.', 'success');
  renderCurrentView('d-appts');
}
function viewDoctorSlots(){
  const d = currentDoctorRecord() || {};
  const slots = d.slots || [];
  const appts = db('appointments');
  return `${viewHeader('My Availability','Add the times you can take video consultations','Patients only see slots you add here — remove one and it disappears from booking immediately, unless it\'s already booked.')}
  <div class="card">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <input class="form-control" id="doc-new-slot" placeholder="e.g. Mon 10:30 AM or 12 Sept, 4:30 PM" style="flex:1;min-width:220px;" onkeydown="if(event.key==='Enter')doctorAddSlot();">
      <button class="btn" onclick="doctorAddSlot()"><i class="fa-solid fa-plus"></i> Add slot</button>
    </div>
  </div>
  <div class="card">
  ${slots.length ? slots.map(s=>{
    const booked = appts.some(a=>a.doctor===d.name && a.slot===s && a.status==='Confirmed');
    return `<div class="reminder-row"><div><strong>${s}</strong></div><div style="display:flex;gap:8px;align-items:center;">${booked?'<span class="status-tag status-warn">Booked</span>':'<span class="status-tag status-ok">Open</span>'}<button class="btn btn-sm btn-danger" ${booked?'disabled title="Cancel the booking first"':''} onclick="doctorRemoveSlot('${s.replace(/'/g,"\\'")}')"><i class="fa-solid fa-trash"></i></button></div></div>`;
  }).join('') : `<p style="color:var(--text-muted);margin:0;">No slots added yet — add your first available time above.</p>`}
  </div>`;
}
function doctorAddSlot(){
  const el = document.getElementById('doc-new-slot');
  const val = (el.value||'').trim();
  if(!val){ showToast('Nothing entered','Type a day/time first.','danger'); return; }
  const docs = db('doctors');
  const d = docs.find(x=>x.id===CURRENT_DOCTOR_ID);
  if(!d) return;
  d.slots = d.slots || [];
  if(d.slots.includes(val)){ showToast('Already added','That slot is already on your list.','danger'); return; }
  d.slots.push(val);
  dbSet('doctors', docs);
  audit('doctor:'+CURRENT_DOCTOR_ID, 'slot_add', val);
  el.value='';
  showToast('Slot added', val+' is now bookable by patients.', 'success');
  renderCurrentView('d-slots');
}
function doctorRemoveSlot(slot){
  const docs = db('doctors');
  const d = docs.find(x=>x.id===CURRENT_DOCTOR_ID);
  if(!d) return;
  const appts = db('appointments');
  if(appts.some(a=>a.doctor===d.name && a.slot===slot && a.status==='Confirmed')){ showToast('Slot is booked','Cancel that booking first from My Appointments.','danger'); return; }
  d.slots = (d.slots||[]).filter(s=>s!==slot);
  dbSet('doctors', docs);
  audit('doctor:'+CURRENT_DOCTOR_ID, 'slot_remove', slot);
  showToast('Removed', slot+' taken off your availability.', 'success');
  renderCurrentView('d-slots');
}
function viewDoctorProfile(){
  const d = currentDoctorRecord() || {};
  return `${viewHeader('My Profile','What patients see when choosing you','')}
  <div class="card">
    <div class="grid-2">
      <div class="form-group"><label>Specialty</label><select class="form-control" id="dp-specialty">${DOCTOR_SPECIALTIES.map(s=>`<option value="${s}" ${d.specialty===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label>Degree / qualification</label><input class="form-control" id="dp-degree" value="${d.degree||''}"></div>
      <div class="form-group"><label>Years of experience</label><input class="form-control" type="number" min="0" id="dp-experience" value="${d.experience||0}"></div>
      <div class="form-group"><label>Consultation fee (&#8377;)</label><input class="form-control" type="number" min="0" id="dp-fee" value="${d.fee||0}"></div>
    </div>
    <div class="form-group"><label>Short bio (optional)</label><textarea class="form-control" id="dp-bio" placeholder="A line or two patients will see">${d.bio||''}</textarea></div>
    <button class="btn" onclick="doctorSaveProfile()"><i class="fa-solid fa-floppy-disk"></i> Save profile</button>
  </div>`;
}
function doctorSaveProfile(){
  const docs = db('doctors');
  const d = docs.find(x=>x.id===CURRENT_DOCTOR_ID);
  if(!d) return;
  d.specialty = document.getElementById('dp-specialty').value;
  d.degree = document.getElementById('dp-degree').value.trim();
  d.experience = parseInt(document.getElementById('dp-experience').value,10)||0;
  d.fee = parseInt(document.getElementById('dp-fee').value,10)||0;
  d.bio = document.getElementById('dp-bio').value.trim();
  dbSet('doctors', docs);
  audit('doctor:'+CURRENT_DOCTOR_ID, 'profile_update', 'Profile updated');
  showToast('Saved','Your profile is up to date.','success');
  renderCurrentView('d-profile');
}
function viewHospitalTele(){
  const appts = db('appointments').filter(a=>a.hospital===CURRENT_HOSPITAL_ID);
  return `${viewHeader('Telemedicine Schedule','Booked consultations','')}
  <div class="card">${appts.length ? `<table class="data-table"><thead><tr><th>Patient</th><th>Doctor</th><th>Slot</th><th>Status</th><th></th></tr></thead><tbody>
  ${appts.map(a=>`<tr><td>${a.patient}</td><td>${a.doctor}</td><td>${a.slot}</td><td><span class="status-tag ${a.status==='Completed'?'status-muted':a.status==='Cancelled'?'status-danger':'status-ok'}">${a.status}</span></td><td>${a.status==='Confirmed' ? `<button class="btn btn-sm btn-secondary" onclick="hospitalCancelAppt('${a.id}')">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table>` : `<div class="empty-state"><i class="fa-solid fa-calendar"></i><p>No bookings yet.</p></div>`}</div>`;
}
function hospitalCancelAppt(id){
  const appts = db('appointments');
  const a = appts.find(x=>x.id===id);
  if(!a) return;
  a.status = 'Cancelled';
  dbSet('appointments', appts);
  audit('hospital:'+CURRENT_HOSPITAL_ID, 'appointment_cancel', a.doctor+' @ '+a.slot);
  pushNotification('patient:'+a.ownerId, 'Appointment cancelled', `Your ${a.slot} consultation with ${a.doctor} was cancelled by the hospital.`, 'danger', null);
  showToast('Cancelled', 'Patient notified. That slot is free again.', 'success');
  renderCurrentView('h-tele');
}
function viewHospitalVerify(){
  return `${viewHeader('Aadhaar Patient Lookup &amp; Scheme Verification','Government ID + insurance pre-authorization','No real UIDAI/ABDM API is wired up in this build — this simulates the same consent-based OTP flow real deployments use, so no record ever unlocks without the patient approving an OTP for this visit.')}
  <div class="card">
    <div class="form-group"><label>Patient's Aadhaar number</label><input class="form-control" id="aadhaar-input-field" maxlength="14" placeholder="XXXX XXXX XXXX" oninput="this.value=formatAadhaar(this.value);"></div>
    <button class="btn" onclick="hospitalRequestAccess()"><i class="fa-solid fa-id-card"></i> Look up &amp; request access</button>
    <p style="color:var(--text-muted);font-size:.78rem;margin:10px 0 0;">The patient must have linked and shared this Aadhaar number from their own account first, and must approve the OTP this generates. Every lookup and every unlock is written to your Audit Trail.</p>
  </div>
  ${viewHospitalActiveGrants()}
  <div class="card"><h3 style="margin-top:0;">Insurance claims (all patients)</h3>${renderClaimsTable()}</div>`;
}
// Every grant this hospital currently holds (active or recently expired),
// each rendered as its own unlocked-record panel with its own countdown —
// a front desk can be mid-lookup on more than one patient at once.
function viewHospitalActiveGrants(){
  const mine = accessGrants().filter(g=>g.hospitalId===CURRENT_HOSPITAL_ID && g.status==='active' && g.expiresAt>now());
  if(!mine.length) return '';
  return mine.map(g=>hospitalUnlockedRecordCard(g)).join('');
}
function hospitalUnlockedRecordCard(g){
  const entry = (aadhaarDirectory()[g.aadhaar])||{};
  const minsLeft = Math.max(0, Math.round((g.expiresAt-now())/60000));
  const ins = entry.insurance || {};
  return `<div class="card" style="border:1px solid var(--brand-primary);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
      <div>
        <h3 style="margin:0 0 4px;"><i class="fa-solid fa-user-shield" style="color:var(--brand-primary);"></i> ${entry.name||'Patient'}</h3>
        <div style="color:var(--text-muted);font-size:.8rem;">Aadhaar ${maskAadhaar(g.aadhaar)} · ${entry.gender||'—'} · Blood group ${entry.bloodGroup||'—'}</div>
      </div>
      <div style="text-align:right;">
        <span class="status-tag status-ok"><i class="fa-solid fa-lock-open"></i> Unlocked ${minsLeft} min</span><br>
        <button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="hospitalRevokeAccess('${g.id}')"><i class="fa-solid fa-lock"></i> Close session</button>
      </div>
    </div>
    <div class="grid-2" style="margin-top:14px;">
      <div><strong>Known allergies</strong><div style="color:var(--text-muted);font-size:.85rem;">${entry.allergies||'None recorded'}</div></div>
      <div><strong>Chronic conditions</strong><div style="color:var(--text-muted);font-size:.85rem;">${entry.chronic||'None recorded'}</div></div>
      <div><strong>Phone</strong><div style="color:var(--text-muted);font-size:.85rem;">${entry.phone||'—'}</div></div>
      <div><strong>Emergency contact</strong><div style="color:var(--text-muted);font-size:.85rem;">${entry.emergencyContact||'—'}</div></div>
    </div>
    <h4 style="margin:16px 0 6px;">Scheme &amp; insurance</h4>
    ${ins.aadhaar_verified ? `<span class="status-tag status-ok"><i class="fa-solid fa-circle-check"></i> ${schemeLabel(ins.scheme)} verified</span>` : `<span class="status-tag status-warn">Not yet verified with a scheme</span>`}
    ${ins.scheme==='pmjay' ? `<p style="color:var(--text-muted);font-size:.82rem;">PM-JAY: cashless cover up to ₹5,00,000/year for the household at empaneled hospitals.</p>` : ''}
    ${ins.scheme==='private' && ins.insurer ? `<p style="color:var(--text-muted);font-size:.82rem;">${ins.insurer}${ins.tpa?' via '+ins.tpa:''}${ins.sumInsured?' · Sum insured ₹'+(+ins.sumInsured).toLocaleString('en-IN'):''}${ins.validTill?' · Valid till '+ins.validTill:''}</p>` : ''}
    <h4 style="margin:16px 0 6px;">Shared documents (${(entry.documents||[]).length})</h4>
    ${(entry.documents||[]).length ? `<div class="doc-list">${entry.documents.map(d=>`
      <div class="doc-row">
        <div class="doc-row-icon"><i class="fa-solid ${DOC_CATEGORIES[d.category]?.icon||'fa-file'}"></i></div>
        <div><div class="doc-row-name">${d.name}</div><div class="doc-row-meta">${DOC_CATEGORIES[d.category]?.label||'Other'} · ${d.sizeKB} KB · ${fmtTime(d.uploadedAt)}</div></div>
        <div class="doc-row-actions">${d.dataUrl ? `<a class="btn btn-secondary btn-sm" href="${d.dataUrl}" download="${d.name}"><i class="fa-solid fa-download"></i></a>` : `<span class="status-tag status-muted" title="File too large to inline in this demo's shared snapshot">Ask patient to share file</span>`}</div>
      </div>`).join('')}</div>` : `<p style="color:var(--text-muted);margin:0;">No documents shared.</p>`}
    <h4 style="margin:16px 0 6px;">Recent prescriptions (${(entry.prescriptions||[]).length})</h4>
    ${(entry.prescriptions||[]).length ? `<table class="data-table"><thead><tr><th>Date</th><th>Doctor</th><th>Hospital</th><th>Medicines</th></tr></thead><tbody>
      ${entry.prescriptions.map(r=>`<tr><td>${r.date}</td><td>${r.doctor}</td><td>${r.hospital||'—'}</td><td>${r.medicines}</td></tr>`).join('')}
    </tbody></table>` : `<p style="color:var(--text-muted);margin:0;">No prescriptions shared.</p>`}
  </div>`;
}
function viewHospitalAudit(){
  // Scoped to this hospital's own actions only — this used to render the
  // entire global `audit` array unfiltered, meaning any hospital could see
  // every other hospital's, pharmacy's, and patient's logged activity.
  const mine = 'hospital:'+CURRENT_HOSPITAL_ID;
  const logs = (db('audit')||[]).filter(l=>l.actor===mine);
  return `${viewHeader('Audit Trail','Immutable access &amp; dispatch log','Every record access, verification lookup, and dispatch event logged by your facility, for compliance.')}
  <div class="card card-flush"><table class="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>
  ${logs.slice(0,60).map(l=>`<tr class="audit-row"><td>${new Date(l.ts).toLocaleString()}</td><td>${l.actor}</td><td>${l.action}</td><td>${l.detail||''}</td></tr>`).join('')}
  </tbody></table></div>`;
}
