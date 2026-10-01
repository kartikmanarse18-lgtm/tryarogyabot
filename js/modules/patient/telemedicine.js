/* ============================================================
   PATIENT — TELEMEDICINE
   ============================================================ */
// Which specialty/doctor the patient is currently browsing — persists across
// re-renders (booking, cancelling) within the session, reset only via the
// explicit "back" links so the flow feels like a normal multi-step picker.
let teleSelectedSpecialty = null;
let teleSelectedDoctorId = null;
function openTeleSpecialty(spec){ teleSelectedSpecialty = spec; teleSelectedDoctorId = null; renderCurrentView('p-tele'); }
function openTeleDoctor(id){ teleSelectedDoctorId = id; renderCurrentView('p-tele'); }
function backToTeleSpecialties(){ teleSelectedSpecialty = null; teleSelectedDoctorId = null; renderCurrentView('p-tele'); }
function backToTeleDoctorList(){ teleSelectedDoctorId = null; renderCurrentView('p-tele'); }

function teleUpcomingHtml(){
  const myAppts = db('appointments').filter(a=>a.ownerId===currentPatientId() && a.status==='Confirmed');
  return `<div class="card"><h3 style="margin-top:0;">Upcoming consultations</h3>
  ${myAppts.length ? myAppts.map(a=>`<div class="reminder-row"><div><strong>${a.doctor}</strong><br><span style="color:var(--text-muted);font-size:.82rem;">${a.slot}</span></div><div style="display:flex;gap:6px;"><button class="btn btn-sm" onclick="joinCall('${a.id}')"><i class="fa-solid fa-video"></i> Join</button><button class="btn btn-sm btn-secondary" onclick="patientCancelAppt('${a.id}')">Cancel</button></div></div>`).join('') : `<p style="color:var(--text-muted);margin:0;">No bookings yet — pick a specialty above.</p>`}</div>`;
}
function viewPatientTele(){
  const inCall = db('activeCall');
  if(inCall && inCall.ownerId===currentPatientId()){
    return `${viewHeader('Telemedicine','Live consultation','')}
    <div class="card">
      ${videoCallHtml(inCall.doctor, 'endCall')}
    </div>`;
  }
  const allDocs = db('doctors').filter(d=>d.available);
  const allAppts = db('appointments');

  // STEP 1 — no specialty chosen yet: show specialty cards with a live count
  // of available doctors in each, so patients never scroll a flat wall of names.
  if(!teleSelectedSpecialty){
    const bySpec = {};
    allDocs.forEach(d=>{ bySpec[d.specialty] = (bySpec[d.specialty]||0)+1; });
    const specs = DOCTOR_SPECIALTIES.filter(s=>bySpec[s]);
    return `${viewHeader('Telemedicine','Choose a specialty','Pick what you need help with, then choose a doctor by degree, experience and fee.')}
    <p style="margin:-6px 0 12px;"><a href="#" onclick="refreshPublicDirectories();return false;" style="color:var(--text-muted);font-size:.82rem;"><i class="fa-solid fa-rotate"></i> Refresh doctor list &amp; slots</a></p>
    <div class="grid-3">
      ${specs.length ? specs.map(s=>`<div class="card" style="cursor:pointer;" onclick="openTeleSpecialty('${s.replace(/'/g,"\\'")}')">
        <div class="dash-stat-icon" style="margin-bottom:10px;"><i class="fa-solid fa-stethoscope"></i></div>
        <strong>${s}</strong><br><span style="color:var(--text-muted);font-size:.82rem;">${bySpec[s]} doctor${bySpec[s]===1?'':'s'} available</span>
      </div>`).join('') : `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-user-doctor"></i><p>No doctors are available for telemedicine right now — check back soon.</p></div>`}
    </div>
    ${teleUpcomingHtml()}`;
  }

  // STEP 2 — specialty chosen: list matching doctors with degree/experience/fee
  // and their own real slots (manually entered by that doctor), not a shared
  // hardcoded list.
  if(!teleSelectedDoctorId){
    const docs = allDocs.filter(d=>d.specialty===teleSelectedSpecialty);
    return `${viewHeader('Telemedicine', teleSelectedSpecialty, '')}
    <p><a href="#" onclick="backToTeleSpecialties();return false;" style="color:var(--text-muted);font-size:.85rem;">&larr; All specialties</a></p>
    <div class="grid-2">
      ${docs.length ? docs.map(d=>{
        const h = (db('hospitals')||[]).find(h=>h.id===d.hospital) || {};
        return `<div class="card" style="cursor:pointer;" onclick="openTeleDoctor('${d.id}')">
        <strong>${d.name}</strong><br><span style="color:var(--text-muted);font-size:.85rem;">${d.specialty} · ${h.name||'—'}</span>
        <p style="margin:10px 0 0;font-size:.82rem;color:var(--text-muted);">${d.degree||'Degree not listed'} · ${d.experience?d.experience+' yrs experience':'Experience not listed'}</p>
        <p style="margin:6px 0 0;font-weight:700;">Consultation fee: &#8377;${d.fee||'—'}</p>
      </div>`;
      }).join('') : `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-user-doctor"></i><p>No available doctors in this specialty right now.</p></div>`}
    </div>
    ${teleUpcomingHtml()}`;
  }

  // STEP 3 — a specific doctor chosen: show full profile + their open slots.
  const d = allDocs.find(x=>x.id===teleSelectedDoctorId);
  if(!d){ teleSelectedDoctorId = null; return viewPatientTele(); }
  const h = (db('hospitals')||[]).find(h=>h.id===d.hospital) || {};
  const bookedSlots = new Set(allAppts.filter(a=>a.doctor===d.name && a.status==='Confirmed').map(a=>a.slot));
  const openSlots = (d.slots||[]).filter(s=>!bookedSlots.has(s));
  return `${viewHeader('Telemedicine', d.name, '')}
  <p><a href="#" onclick="backToTeleDoctorList();return false;" style="color:var(--text-muted);font-size:.85rem;">&larr; ${teleSelectedSpecialty} doctors</a></p>
  <div class="card">
    <strong>${d.name}</strong><br><span style="color:var(--text-muted);font-size:.85rem;">${d.specialty} · ${h.name||'—'}</span>
    <p style="margin:10px 0 0;font-size:.85rem;color:var(--text-muted);">${d.degree||'Degree not listed'} · ${d.experience?d.experience+' yrs experience':'Experience not listed'}</p>
    <p style="margin:6px 0 0;font-weight:700;">Consultation fee: &#8377;${d.fee||'—'}</p>
    ${d.bio ? `<p style="margin:10px 0 0;font-size:.85rem;">${d.bio}</p>` : ''}
    <h3 style="margin:18px 0 6px;">Available slots <a href="#" onclick="refreshPublicDirectories();return false;" style="color:var(--text-muted);font-size:.78rem;font-weight:400;"><i class="fa-solid fa-rotate"></i> Refresh</a></h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${openSlots.length ? openSlots.map(t=>`<button class="btn btn-sm btn-secondary" onclick="openBookingPayment('${d.name.replace(/'/g,"\\'")}','${d.hospital}','${t.replace(/'/g,"\\'")}',${+d.fee||0})">${t}</button>`).join('') : `<p style="color:var(--text-muted);font-size:.85rem;margin:0;">No open slots right now — check back later.</p>`}
    </div>
  </div>
  ${teleUpcomingHtml()}`;
}
// Consultation fee is collected up front — booking only actually happens
// once the (simulated) payment succeeds, via confirmPayment() calling
// bookAppt() back as the onConfirm callback.
function openBookingPayment(doctor, hospital, slot, fee){
  if(!fee){ bookAppt(doctor, hospital, slot, 0); return; } // free/unspecified fee — skip checkout
  openPaymentModal(fee, `Consultation with ${doctor} · ${slot}`, 'bookAppt', [doctor, hospital, slot, fee]);
}
async function bookAppt(doctor, hospital, slot, feePaid){
  // PHASE 1B: a patient's local 'appointments' cache now only ever holds HER
  // OWN bookings (it's fed from her own /users/{uid}/appointmentRefs
  // partition, not a shared array), so it can no longer tell us whether some
  // OTHER patient just took this slot. The real double-booking guard has to
  // read straight from the doctor's own partition — that's the actual
  // source of truth now — rather than trusting a possibly-incomplete local
  // cache the way the old shared-array version could.
  if(fbEnabled && typeof firebase!=='undefined'){
    try{
      const conflictSnap = await firebase.firestore()
        .collection('doctors').doc(doctorPartitionKey(hospital, doctor))
        .collection('appointments')
        .where('slot','==', slot).where('status','==','Confirmed').limit(1).get();
      if(!conflictSnap.empty){
        showToast('Slot just got taken', 'Someone else booked that slot — pick another.', 'danger');
        renderCurrentView('p-tele');
        return;
      }
    }catch(e){
      console.warn('Live slot-conflict check failed, falling back to local cache', e);
      if((db('appointments')||[]).some(a=>a.doctor===doctor && a.slot===slot && a.status==='Confirmed')){
        showToast('Slot just got taken', 'Someone else booked that slot — pick another.', 'danger');
        renderCurrentView('p-tele');
        return;
      }
    }
  } else if((db('appointments')||[]).some(a=>a.doctor===doctor && a.slot===slot && a.status==='Confirmed')){
    showToast('Slot just got taken', 'Someone else booked that slot — pick another.', 'danger');
    renderCurrentView('p-tele');
    return;
  }
  feePaid = +feePaid || 0;
  const appts = db('appointments') || [];
  appts.push({id:uid('APT'), ownerId: currentPatientId(), ownerAuthUid: currentAuthUid(), patient: db('profile').name, doctor, hospital, slot, status:'Confirmed', paymentStatus: feePaid>0 ? 'paid' : 'n/a', amountPaid: feePaid});
  dbSet('appointments', appts);
  pushNotification('hospital:'+hospital, 'New telemedicine booking', `${db('profile').name} booked ${doctor} at ${slot}.${feePaid>0 ? ' Payment received: ₹'+feePaid.toFixed(2)+'.' : ''}`, 'info', null);
  const d = (db('doctors')||[]).find(x=>x.name===doctor && x.hospital===hospital);
  if(d) pushNotification('doctor:'+d.id, 'New telemedicine booking', `${db('profile').name} booked you at ${slot}.${feePaid>0 ? ' Payment received: ₹'+feePaid.toFixed(2)+'.' : ''}`, 'info', null);
  showToast('Booked', `Confirmed with ${doctor} at ${slot}.`, 'success');
  renderCurrentView('p-tele');
}
function patientCancelAppt(id){
  const appts = db('appointments');
  const a = appts.find(x=>x.id===id && x.ownerId===currentPatientId());
  if(!a) return;
  if(!confirm('Cancel your '+a.slot+' consultation with '+a.doctor+'?')) return;
  a.status = 'Cancelled';
  dbSet('appointments', appts);
  if(a.hospital) pushNotification('hospital:'+a.hospital, 'Booking cancelled', `${db('profile').name} cancelled their ${a.slot} slot with ${a.doctor}. Now free.`, 'info', null);
  showToast('Cancelled', 'That slot is free for someone else now.', 'success');
  renderCurrentView('p-tele');
}
function joinCall(apptId){
  const a = db('appointments').find(x=>x.id===apptId);
  if(!a) return;
  dbSet('activeCall', {doctor:a.doctor, ownerId:a.ownerId, apptId:a.id, hospital:a.hospital, patientName:a.patient});
  renderCurrentView('p-tele');
}
function endCall(){
  // Just closes the patient's side of the call — the doctor is the one who
  // marks the consultation Completed and issues the e-prescription from
  // their own console (My Appointments -> Write prescription), so there's
  // a single source of truth for what was actually prescribed.
  rtcHangUp();
  const inCall = db('activeCall');
  if(inCall && inCall.ownerId===currentPatientId()) dbSet('activeCall', null);
  showToast('Call ended','Your doctor will send an e-prescription once the consultation is wrapped up on their end.','info');
  renderCurrentView('p-tele');
}
