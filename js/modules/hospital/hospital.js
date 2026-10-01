/* ============================================================
   HOSPITAL
   ============================================================ */
function viewHospitalDash(){
  const h = db('hospitals').find(x=>x.id===CURRENT_HOSPITAL_ID);
  const incoming = db('incidents').filter(i=>i.assignedHospitalId===CURRENT_HOSPITAL_ID && i.status!=='closed');
  return `
  ${viewHeader('Hospital Console', h.name, 'Confirmed-incoming alerts fire the instant a responder accepts a case for your facility.')}
  <div class="grid-4">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-bed-pulse"></i></div><div><div class="dash-stat-num">${h.beds}</div><div class="dash-stat-label">Beds Available</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-heart-pulse"></i></div><div><div class="dash-stat-num">${h.icu}</div><div class="dash-stat-label">ICU Available</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-truck-medical"></i></div><div><div class="dash-stat-num">${incoming.length}</div><div class="dash-stat-label">Incoming Patients</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-user-doctor"></i></div><div><div class="dash-stat-num">${db('doctors').filter(d=>d.hospital===CURRENT_HOSPITAL_ID && d.available).length}</div><div class="dash-stat-label">Doctors On Duty</div></div></div>
  </div>
  ${incoming.length ? `<div class="card"><h3 style="margin-top:0;">Prep required</h3><button class="btn btn-danger" onclick="renderCurrentView('h-incoming')">View incoming patients</button></div>` : `<div class="card"><p style="color:var(--text-muted);margin:0;">No incoming emergency cases right now.</p></div>`}
  <div class="card">
    <h3 style="margin-top:0;">Update capacity</h3>
    <p style="color:var(--text-muted);font-size:.85rem;margin:0 0 14px;">This is the live number ambulances and patients see when picking a receiving hospital. Keep it current as beds fill up or free up.</p>
    <div class="grid-2">
      <div class="form-group"><label>Beds available</label><input class="form-control" type="number" min="0" id="hosp-beds-input" value="${h.beds}"></div>
      <div class="form-group"><label>ICU beds available</label><input class="form-control" type="number" min="0" id="hosp-icu-input" value="${h.icu}"></div>
    </div>
    <button class="btn" onclick="updateHospitalCapacity()"><i class="fa-solid fa-rotate"></i> Update capacity</button>
  </div>`;
}
function updateHospitalCapacity(){
  const bedsEl = document.getElementById('hosp-beds-input');
  const icuEl = document.getElementById('hosp-icu-input');
  const beds = Math.max(0, parseInt(bedsEl.value, 10) || 0);
  const icu = Math.max(0, parseInt(icuEl.value, 10) || 0);
  const list = db('hospitals');
  const h = list.find(x=>x.id===CURRENT_HOSPITAL_ID);
  if(!h) return;
  h.beds = beds;
  h.icu = icu;
  dbSet('hospitals', list);
  audit('hospital:'+CURRENT_HOSPITAL_ID, 'update_capacity', 'beds='+beds+' icu='+icu);
  showToast('Capacity updated', 'Beds: '+beds+' · ICU: '+icu+' — now live for dispatch matching.', 'success');
  renderCurrentView('h-dash');
}
function viewHospitalIncoming(){
  const incoming = db('incidents').filter(i=>i.assignedHospitalId===CURRENT_HOSPITAL_ID && i.status!=='closed');
  const responders = db('responders');
  return `
  ${viewHeader('Incoming Patients','Confirmed cases assigned to your facility','')}
  ${incoming.length ? incoming.map(inc=>{
    const resp = responders.find(r=>r.id===inc.assignedResponderId);
    const distKm = resp ? haversineKm(resp.lat,resp.lng, db('hospitals').find(h=>h.id===CURRENT_HOSPITAL_ID).lat, db('hospitals').find(h=>h.id===CURRENT_HOSPITAL_ID).lng) : 0;
    const med = inc.medical || {bloodGroup:'Unknown', allergies:'Unknown', chronic:'Unknown'};
    return `<div class="incident-card">
      <div class="incident-card-top"><span class="incident-id">${inc.id}</span><span class="status-tag ${inc.status==='arrived'?'status-ok':'status-warn'}">${incidentStatusLabel(inc.status)}</span></div>
      <div class="incident-meta">
        <span><i class="fa-solid fa-truck-medical"></i> ${resp? resp.name+' · '+resp.vehicle : '—'}</span>
        <span><i class="fa-solid fa-clock"></i> ${inc.status==='enroute_hospital' ? 'ETA '+etaMinutes(distKm)+' min' : incidentStatusLabel(inc.status)}</span>
      </div>
      ${inc.reportedFor==='other' ? `<div style="font-size:.8rem;color:var(--brand-accent);margin:4px 0;"><i class="fa-solid fa-triangle-exclamation"></i> Patient not yet identified — reported by bystander (${inc.reporterPhone})</div>` : ''}
      <div class="med-tag">Blood: ${med.bloodGroup}</div><div class="med-tag">Allergies: ${med.allergies}</div><div class="med-tag">Chronic: ${med.chronic}</div>
      ${inc.status!=='arrived' ? `<div style="margin-top:10px;"><button class="btn btn-sm" onclick="confirmBedReady('${inc.id}')"><i class="fa-solid fa-bed"></i> Confirm bed ready</button></div>` : `<div style="margin-top:10px;"><button class="btn btn-sm btn-secondary" onclick="closeIncidentHospitalSide('${inc.id}')">Mark admitted &amp; close case</button></div>`}
    </div>`;
  }).join('') : `<div class="empty-state"><i class="fa-solid fa-bed-pulse"></i><p>No incoming patients right now.</p></div>`}`;
}
function confirmBedReady(id){
  // Notification-only (no status change) — kept local like before, plus a
  // best-effort timeline entry so it's visible on the patient's live tracking
  // feed on other devices too.
  const inc = db('incidents').find(i=>i.id===id);
  pushNotification('patient:'+(inc&&(inc.reporterId||inc.patientId)), 'Bed ready','Your hospital has confirmed a bed is prepared for you.','success',id);
  const resp = inc && inc.assignedResponderId;
  if(resp) pushNotification('responder:'+resp,'Bed confirmed','Destination hospital confirmed bed readiness.','info',id);
  sosApi(`/api/sos/${id}/update`, { timelineText: 'Hospital confirmed a bed is ready' })
    .then(({incident})=>mirrorIncident(incident)).catch(()=>{});
  showToast('Confirmed','Patient and responder notified.','success');
  audit('hospital:'+CURRENT_HOSPITAL_ID,'bed_ready',id);
}
async function closeIncidentHospitalSide(id){
  const inc = db('incidents').find(i=>i.id===id);
  if(!inc) return;
  try{
    const {incident} = await sosApi(`/api/sos/${id}/close`, { timelineText: 'Admitted and case closed by hospital' });
    creditResponderCase(incident);
    // This is the real end of the case — only now is the ambulance crew freed up.
    if(incident.assignedResponderId){
      const responders = db('responders');
      const resp = responders.find(r=>r.id===incident.assignedResponderId);
      if(resp){
        resp.status = 'available';
        dbSet('responders', responders);
        pushNotification('responder:'+resp.id, 'Case closed — you\'re available', 'Hospital confirmed admission for '+id+'. You\'re free for new dispatches.', 'success', id);
      }
    }
    handleIncidentEvent('incident_close', incident);
  }catch(e){
    if(e.status===404){ dropUnknownLocalIncident(id); showToast('Already gone', 'That case no longer exists.', 'info'); renderCurrentView('h-incoming'); return; }
    console.error('hospital close failed', e); showToast('Close failed', 'Please try again.', 'danger'); return;
  }
  audit('hospital:'+CURRENT_HOSPITAL_ID,'close',id);
  showToast('Case closed', 'Patient admitted. Ambulance crew has been released for new dispatches.', 'success');
  renderCurrentView('h-incoming');
}
function viewHospitalRoster(){
  const docs = db('doctors').filter(d=>d.hospital===CURRENT_HOSPITAL_ID);
  return `${viewHeader('Doctor Roster','On-duty specialists','Add your real doctors below — each gets their own login to join calls, manage their own slots and write prescriptions. Toggling availability is reflected instantly on the patient telemedicine booking screen.')}
  <div class="card">
    <h3 style="margin-top:0;">Add doctor</h3>
    <div class="grid-2">
      <div class="form-group"><label>Doctor name</label><input class="form-control" id="doc-name" placeholder="e.g. Dr. Anil Kapoor"></div>
      <div class="form-group"><label>Specialty</label><select class="form-control" id="doc-specialty">${DOCTOR_SPECIALTIES.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
      <div class="form-group"><label>Degree / qualification</label><input class="form-control" id="doc-degree" placeholder="e.g. MBBS, MD (Cardiology)"></div>
      <div class="form-group"><label>Years of experience</label><input class="form-control" type="number" min="0" id="doc-experience" placeholder="e.g. 8"></div>
      <div class="form-group"><label>Consultation fee (&#8377;)</label><input class="form-control" type="number" min="0" id="doc-fee" placeholder="e.g. 500"></div>
      <div class="form-group"><label>Login email</label><input class="form-control" id="doc-login-email-new" placeholder="doctor@example.com"></div>
      <div class="form-group"><label>Login password</label><div style="display:flex;gap:8px;"><input class="form-control" id="doc-login-password-new" placeholder="Set a password"><button type="button" class="btn btn-secondary btn-sm" onclick="generateDoctorPassword()" title="Generate a random password"><i class="fa-solid fa-shuffle"></i></button></div></div>
    </div>
    <button class="btn" onclick="addDoctorToRoster()"><i class="fa-solid fa-user-doctor"></i> Add to roster &amp; create login</button>
  </div>
  <div class="card">
  ${docs.length ? `<table class="data-table"><thead><tr><th>Doctor</th><th>Specialty</th><th>Degree</th><th>Exp.</th><th>Fee</th><th>Login email</th><th>Status</th><th></th></tr></thead><tbody>
  ${docs.map(d=>`<tr><td>${d.name}</td><td>${d.specialty}</td><td>${d.degree||'—'}</td><td>${d.experience?d.experience+' yrs':'—'}</td><td>${d.fee?'&#8377;'+d.fee:'—'}</td><td style="font-family:var(--ff-mono);font-size:.78rem;">${d.loginEmail||'—'}</td><td><span class="status-tag ${d.available?'status-ok':'status-muted'}">${d.available?'Available':'Off duty'}</span></td><td style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-sm btn-secondary" onclick="toggleDoc('${d.id}')">Toggle</button><button class="btn btn-sm btn-secondary" onclick="resetDoctorPassword('${d.id}')" title="Reset login password"><i class="fa-solid fa-key"></i></button><button class="btn btn-sm btn-danger" onclick="removeDoctor('${d.id}')" title="Remove from roster"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}
  </tbody></table>` : `<p style="color:var(--text-muted);margin:0;">No doctors added yet — add your first one above.</p>`}
  </div>`;
}
function generateDoctorPassword(){
  const pw = Math.random().toString(36).slice(-4) + Math.floor(1000+Math.random()*9000);
  document.getElementById('doc-login-password-new').value = pw;
}
async function addDoctorToRoster(){
  const name = document.getElementById('doc-name').value.trim();
  const specialty = document.getElementById('doc-specialty').value;
  const degree = document.getElementById('doc-degree').value.trim();
  const experience = parseInt(document.getElementById('doc-experience').value, 10) || 0;
  const fee = parseInt(document.getElementById('doc-fee').value, 10) || 0;
  const loginEmail = (document.getElementById('doc-login-email-new').value||'').trim().toLowerCase();
  const loginPassword = document.getElementById('doc-login-password-new').value||'';
  if(!name || !specialty){ showToast('Missing info','Enter the doctor\'s name and specialty.','danger'); return; }
  if(!loginEmail || !loginPassword){ showToast('Missing login info','A login email and password are required so this doctor can sign in.','danger'); return; }
  if(loginPassword.length<4){ showToast('Weak password','Use at least 4 characters for the doctor\'s password.','danger'); return; }
  // PHASE 1C: live check — two hospital admin devices adding a doctor with the
  // same email at once is exactly the kind of race the local array can't catch.
  if(await liveAccountExists('users_doctor', loginEmail)){ showToast('Email already used','Another doctor already has a login with that email.','danger'); return; }
  // PHASE 1D: create/verify the login FIRST — if it fails, nothing else has
  // been written yet, instead of leaving an orphaned roster entry with no login.
  let authUid = null, passwordHash = null;
  try{
    const result = await createOrVerifyAuthAccountAsAdmin(loginEmail, loginPassword);
    if(result) authUid = result.uid; else passwordHash = await hashPassword(loginPassword);
  }catch(e){
    showToast('Could not create login', e.message || String(e), 'danger');
    return;
  }
  const docs = db('doctors');
  const doctorId = uid('DOC');
  docs.push({id:doctorId, name, specialty, hospital:CURRENT_HOSPITAL_ID, available:true, degree, experience, fee, loginEmail, bio:'', slots:[]});
  dbSet('doctors', docs);
  saveDoctorUser({email:loginEmail, ...(authUid?{authUid}:{passwordHash}), doctorId, hospitalId:CURRENT_HOSPITAL_ID, name});
  audit('hospital:'+CURRENT_HOSPITAL_ID, 'doctor_add', name+' ('+specialty+') · login: '+loginEmail);
  showToast('Doctor added', name+' can now log in with '+loginEmail+' — share the password with them securely.', 'success');
  renderCurrentView('h-roster');
}
function removeDoctor(id){
  const docs = db('doctors');
  const d = docs.find(x=>x.id===id);
  if(!d) return;
  if(!confirm('Remove '+d.name+' from the roster? This also disables their login. Any of their upcoming bookings will need to be rescheduled with someone else.')) return;
  dbSet('doctors', docs.filter(x=>x.id!==id));
  if(d.loginEmail) dbSet('users_doctor', doctorUsersDb().filter(u=>u.doctorId!==id));
  audit('hospital:'+CURRENT_HOSPITAL_ID, 'doctor_remove', d.name);
  showToast('Removed', d.name+' taken off the roster.', 'success');
  renderCurrentView('h-roster');
}
function toggleDoc(id){ const docs=db('doctors'); const d=docs.find(x=>x.id===id); d.available=!d.available; dbSet('doctors',docs); renderCurrentView('h-roster'); }
async function resetDoctorPassword(id){
  const d = (db('doctors')||[]).find(x=>x.id===id);
  if(!d || !d.loginEmail){ showToast('No login found','This doctor has no login account to reset.','danger'); return; }
  const u = await liveAccountExists('users_doctor', d.loginEmail);
  if(!u){ showToast('Not found','No login record for that email.','danger'); return; }
  if(u.authUid){
    // PHASE 1D: real Firebase Auth account — the admin can't set a password on
    // someone else's account directly without a backend (Admin SDK), but can
    // trigger Firebase's own reset-link email, same flow patientAuthForgotStart/
    // roleAuthForgotStart already use for self-service resets.
    const fa = fbAuth();
    if(!fa){ showToast('Not available offline', 'Connect to the internet to send a password reset email.', 'danger'); return; }
    try{
      await fa.sendPasswordResetEmail(d.loginEmail);
      audit('hospital:'+CURRENT_HOSPITAL_ID, 'doctor_password_reset', d.name+' (reset email sent)');
      showToast('Reset email sent', d.name+' will get an email at '+d.loginEmail+' with a link to set a new password.', 'success');
    }catch(e){
      showToast('Could not send reset email', friendlyAuthError(e), 'danger');
    }
    return;
  }
  const newPw = prompt('Enter a new password for '+d.name+' ('+d.loginEmail+'):');
  if(!newPw) return;
  if(newPw.length<4){ showToast('Weak password','Use at least 4 characters.','danger'); return; }
  u.passwordHash = await hashPassword(newPw);
  saveDoctorUser(u);
  audit('hospital:'+CURRENT_HOSPITAL_ID, 'doctor_password_reset', d.name);
  showToast('Password reset', 'New password set for '+d.name+'. Share it with them securely.', 'success');
}
