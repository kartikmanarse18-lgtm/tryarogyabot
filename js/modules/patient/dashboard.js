/* ============================================================
   PATIENT — DASHBOARD
   ============================================================ */
function viewPatientDash(){
  const profile = db('profile');
  const active = currentIncident(); // matches self-reports and bystander reports alike
  return `
  ${viewHeader('Patient Console','Welcome back, '+profile.name.split(' ')[0],'Your emergency profile is verified and ready. One tap broadcasts to every nearby hospital, ambulance and police station at once.')}
  ${quickDrawer('p-dash')}
  ${active ? `<div class="card" style="border-color:#ef4444;background:rgba(239,68,68,.06);">
    <strong style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Active emergency in progress — ${active.id}</strong>
    <p style="margin:8px 0 12px;color:var(--text-muted);">Status: ${incidentStatusLabel(active.status)}</p>
    <button class="btn btn-danger" onclick="renderCurrentView('p-sos')">Open live tracking</button>
  </div>` : ''}
  <div class="grid-4" style="margin-bottom:8px;">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-droplet"></i></div><div><div class="dash-stat-num">${profile.bloodGroup}</div><div class="dash-stat-label">Blood Group</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-file-medical"></i></div><div><div class="dash-stat-num">${(db('appointments')||[]).filter(a=>a.ownerId===currentPatientId()).length}</div><div class="dash-stat-label">Appointments</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-prescription-bottle-medical"></i></div><div><div class="dash-stat-num">${(db('prescriptions')||[]).filter(r=>r.ownerId===currentPatientId()).length}</div><div class="dash-stat-label">Prescriptions</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-shield-heart"></i></div><div><div class="dash-stat-num">${getInsuranceRecord(currentPatientId()).aadhaar_verified?'Linked':'Unlinked'}</div><div class="dash-stat-label">Govt. Scheme ID</div></div></div>
  </div>
  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;">Emergency profile</h3>
      <div class="med-tag">Blood: ${profile.bloodGroup}</div>
      <div class="med-tag">Allergies: ${profile.allergies}</div>
      <div class="med-tag">Chronic: ${profile.chronic}</div>
      <p style="color:var(--text-muted);font-size:.85rem;margin-top:12px;">Emergency contact: ${profile.emergencyContact}</p>
      <button class="btn btn-secondary btn-sm" onclick="renderCurrentView('p-records')">Edit profile</button>
    </div>
    ${nearbyHelpCard()}
  </div>
  <div class="card">
    <h3 style="margin-top:0;">How SOS dispatch works</h3>
    <ul class="activity-feed">
      <li><span class="dot done"></span> Broadcast to the 3 nearest hospitals with live bed capacity</li>
      <li><span class="dot done"></span> Broadcast to the 2 nearest available ambulances</li>
      <li><span class="dot done"></span> Auto-notify the nearest police station</li>
      <li><span class="dot done"></span> Hospital gets a confirmed alert the instant a responder accepts</li>
    </ul>
  </div>`;
}
function incidentStatusLabel(s){
  return {broadcasting:'Broadcasting to nearby units…', accepted:'Ambulance accepted — en route to you', picked_up:'Picked up — crew selecting hospital', enroute_hospital:'Picked up — en route to hospital', arrived:'Arrived at hospital', closed:'Closed'}[s]||s;
}
