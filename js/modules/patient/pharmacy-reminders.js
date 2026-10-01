/* ============================================================
   PATIENT — PHARMACY & REMINDERS
   ============================================================ */
function viewPatientPharmacy(){
  const pharmacies = db('pharmacies');
  return `${viewHeader('Pharmacy &amp; Medicine Reminders','Never miss a dose','')}
  ${remindersCardHTML()}
  <div class="card"><h3 style="margin-top:0;">Nearby pharmacies</h3>
  ${pharmacies.length ? pharmacies.map(p=>`<div class="reminder-row" style="cursor:pointer;" onclick="openPharmacyDetail('${p.id}')"><div><strong>${p.name}</strong><br><span style="color:var(--text-muted);font-size:.82rem;">${haversineKm(db('profile').lat,db('profile').lng,p.lat,p.lng).toFixed(1)} km away</span></div><span class="status-tag ${p.stock==='high'?'status-ok':p.stock==='medium'?'status-warn':'status-danger'}">${p.stock} stock</span></div>`).join('') : `<p style="color:var(--text-muted);margin:0;">No pharmacy has registered in your area yet — pharmacies show up here once they sign up through the Pharmacy role.</p>`}
  </div>`;
}
// Tapping a pharmacy card now actually does something: shows its live stock
// status, a one-tap call link, and lets the patient route their most recent
// unsent prescription straight there.
function openPharmacyDetail(id){
  const p = db('pharmacies').find(x=>x.id===id);
  if(!p) return;
  const unsent = db('prescriptions').filter(r=>r.ownerId===currentPatientId() && !r.targetPharmacyId);
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3 style="margin-top:0;">${p.name}</h3>
    <p class="modal-sub">Stock status: <span class="status-tag ${p.stock==='high'?'status-ok':p.stock==='medium'?'status-warn':'status-danger'}">${p.stock}</span></p>
    ${p.phone ? `<a href="tel:${p.phone}" class="btn btn-block" style="margin-bottom:10px;text-decoration:none;text-align:center;"><i class="fa-solid fa-phone"></i> Call ${p.phone}</a>` : ''}
    ${unsent.length ? `<button class="btn-secondary btn-block" onclick="sendSpecificPrescriptionToPharmacy('${unsent[0].id}','${p.id}')"><i class="fa-solid fa-pills"></i> Send my latest prescription here</button>` : `<p style="color:var(--text-muted);font-size:.82rem;margin:0;">No unsent prescriptions to route here right now.</p>`}
  `);
}
function sendSpecificPrescriptionToPharmacy(rxId, pharmacyId){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===rxId);
  const p = db('pharmacies').find(x=>x.id===pharmacyId);
  if(!rx || !p) return;
  rx.targetPharmacyId = p.id;
  rx.pharmacyStatus = 'sent';
  dbSet('prescriptions', list);
  pushNotification('pharmacy:'+p.id, 'New prescription received', `${rx.medicines} — sent by a patient nearby for fulfillment.`, 'info', null);
  closeModal();
  showToast('Sent to pharmacy', p.name+' has been notified for fulfillment.', 'success');
  if(currentView==='p-rx') renderCurrentView('p-rx');
}
// Shared reminders widget — used on both the Pharmacy page and the Medication & Dosage page,
// since they read/write the same 'reminders' record keyed by ownerId. Beyond the original
// on/off toggle, each reminder now tracks a daily taken/missed log (adherence %, streak) and
// an optional days-of-supply countdown so refills don't get missed.
function todayKey(){ return new Date().toISOString().slice(0,10); }
function adherenceStats(r){
  const log = r.log || {};
  const days = Object.keys(log);
  const taken = days.filter(d=>log[d]==='taken').length;
  const pct = days.length ? Math.round((taken/days.length)*100) : null;
  // Current streak of consecutive 'taken' days ending today/yesterday.
  let streak = 0;
  for(let i=0;i<60;i++){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    if(log[d]==='taken') streak++;
    else if(log[d]==='missed') break;
    else if(i>0) break; // no entry for a past day breaks the streak; today with no entry yet doesn't
  }
  return {taken, total:days.length, pct, streak};
}
function refillStatus(r){
  if(!r.daysSupply) return null;
  const takenCount = Object.values(r.log||{}).filter(v=>v==='taken').length;
  const remaining = Math.max(0, r.daysSupply - takenCount);
  return {remaining, low: remaining<=3};
}
function remindersCardHTML(){
  const reminders = (db('reminders')||[]).filter(r=>r.ownerId===currentPatientId());
  const today = todayKey();
  return `
  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-bell" style="color:var(--brand-primary);"></i> Medicine reminder / scheduler</h3>
    ${medReminderNotifBannerHTML()}
    <div class="grid-2">
      <div class="form-group"><label>Medicine</label><input class="form-control" id="rem-med" placeholder="e.g. Metformin 500mg"></div>
      <div class="form-group"><label>Time</label><input type="time" class="form-control" id="rem-time"></div>
      <div class="form-group" style="grid-column:1/-1;"><label>Days of supply on hand (optional)</label><input type="number" min="1" class="form-control" id="rem-days" placeholder="e.g. 30 — so we can warn you before you run out"></div>
    </div>
    <button class="btn" onclick="addReminder()"><i class="fa-solid fa-plus"></i> Add reminder</button>
    <button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="openSoundSettingsModal()"><i class="fa-solid fa-music"></i> Alarm sound &amp; ring duration</button>
    <p style="font-size:.74rem;color:var(--text-muted);margin:6px 0 0;">Upload a custom alarm sound and set how long it rings — shared with every role's alerts, via the bell icon.</p>
  </div>
  ${medsSafetyCheckHTML(reminders)}
  <div class="card">
    ${reminders.length ? reminders.map(r=>{
      const adh = adherenceStats(r);
      const refill = refillStatus(r);
      const todayStatus = (r.log||{})[today];
      return `<div class="reminder-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div><strong>${r.med}</strong><br><span style="color:var(--text-muted);font-size:.82rem;">${r.time} daily${adh.total ? ' · '+adh.pct+'% adherence (last '+adh.total+' logged day'+(adh.total===1?'':'s')+')' : ''}${adh.streak>1?' · 🔥 '+adh.streak+'-day streak':''}</span></div>
          <div class="toggle-sw ${r.on?'on':''}" onclick="toggleReminder('${r.id}')"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-sm ${todayStatus==='taken'?'':'btn-secondary'}" onclick="logDose('${r.id}','taken')"><i class="fa-solid fa-check"></i> Taken today</button>
          <button class="btn btn-sm ${todayStatus==='missed'?'btn-danger':'btn-secondary'}" onclick="logDose('${r.id}','missed')"><i class="fa-solid fa-xmark"></i> Missed today</button>
          <button class="btn btn-sm btn-secondary" onclick="deleteReminder('${r.id}')"><i class="fa-solid fa-trash"></i></button>
          ${refill ? `<span class="status-tag ${refill.low?'status-danger':'status-ok'}" style="margin-left:auto;">${refill.remaining>0 ? refill.remaining+' day(s) left'+(refill.low?' — refill soon':'') : 'Out of supply — refill needed'}</span>` : ''}
        </div>
      </div>`;
    }).join('') : `<p style="color:var(--text-muted);margin:0;">No reminders yet.</p>`}
  </div>`;
}
function addReminder(){
  const med = document.getElementById('rem-med').value.trim();
  const time = document.getElementById('rem-time').value;
  const daysSupply = parseInt(document.getElementById('rem-days').value, 10) || null;
  if(!med || !time){ showToast('Missing info','Enter both medicine and time.','danger'); return; }
  const r = db('reminders'); r.push({id:uid('REM'), ownerId: currentPatientId(), med, time, on:true, daysSupply, log:{}, createdAt: now()}); dbSet('reminders', r);
  renderCurrentView(currentView);
}
function toggleReminder(id){ const r=db('reminders'); const item=r.find(x=>x.id===id && x.ownerId===currentPatientId()); if(!item) return; item.on=!item.on; dbSet('reminders',r); renderCurrentView(currentView); }
function deleteReminder(id){ const r=db('reminders').filter(x=>!(x.id===id && x.ownerId===currentPatientId())); dbSet('reminders', r); renderCurrentView(currentView); }
function logDose(id, status){
  const r = db('reminders'); const item = r.find(x=>x.id===id && x.ownerId===currentPatientId()); if(!item) return;
  if(!item.log) item.log = {};
  const key = todayKey();
  item.log[key] = (item.log[key]===status) ? undefined : status; // tap again to undo
  if(item.log[key]===undefined) delete item.log[key];
  dbSet('reminders', r);
  const refill = refillStatus(item);
  if(refill && refill.remaining===0) showToast('Out of supply', item.med+' — you\'ve logged more doses than the supply you noted. Time to refill.', 'danger');
  else if(refill && refill.low) showToast('Refill soon', item.med+' has about '+refill.remaining+' day(s) of supply left.', 'warning');
  renderCurrentView(currentView);
}
// ---- Basic safety cross-checks across a patient's own active reminders:
// same-ingredient duplication (common OTC brand overlap) + a short list of
// well-known OTC interaction pairs + a match against the patient's own
// recorded allergies. Pattern-matching on free-text medicine names only —
// not a clinical decision tool, and deliberately says so.
const DUPLICATE_INGREDIENT_GROUPS = [
  {label:'Paracetamol / Acetaminophen', keywords:['paracetamol','acetaminophen','crocin','dolo','calpol']},
  {label:'Ibuprofen', keywords:['ibuprofen','brufen','combiflam']},
  {label:'Cetirizine (antihistamine)', keywords:['cetirizine','zyrtec']},
  {label:'Diclofenac', keywords:['diclofenac','voveran']},
];
const OTC_INTERACTION_PAIRS = [
  {a:['ibuprofen','diclofenac','brufen','naproxen'], b:['aspirin'], msg:'Combining an NSAID (ibuprofen/diclofenac) with aspirin raises the risk of stomach bleeding.'},
  {a:['ibuprofen','diclofenac','naproxen'], b:['warfarin','acitrom'], msg:'NSAIDs can increase bleeding risk when combined with blood thinners — confirm with your doctor.'},
  {a:['paracetamol','acetaminophen'], b:['warfarin','acitrom'], msg:'Regular paracetamol use can affect warfarin/blood-thinner levels — mention this to your doctor.'},
  {a:['cetirizine','levocetirizine'], b:['alcohol'], msg:'Antihistamines can add to drowsiness from alcohol.'},
];
function medsSafetyCheckHTML(reminders){
  const active = reminders.filter(r=>r.on);
  const names = active.map(r=>({id:r.id, med:r.med, low:r.med.toLowerCase()}));
  const warnings = [];
  DUPLICATE_INGREDIENT_GROUPS.forEach(g=>{
    const hits = names.filter(n=>g.keywords.some(k=>n.low.includes(k)));
    if(hits.length>1) warnings.push({level:'danger', text:`${hits.length} active reminders (${hits.map(h=>h.med).join(', ')}) all look like they contain <strong>${g.label}</strong> — check you're not double-dosing the same ingredient.`});
  });
  OTC_INTERACTION_PAIRS.forEach(p=>{
    const hitA = names.find(n=>p.a.some(k=>n.low.includes(k)));
    const hitB = names.find(n=>p.b.some(k=>n.low.includes(k)));
    if(hitA && hitB) warnings.push({level:'warn', text:`<strong>${hitA.med}</strong> + <strong>${hitB.med}</strong>: ${p.msg}`});
  });
  const allergiesRaw = ((db('profile')||{}).allergies||'').toLowerCase();
  const allergyList = allergiesRaw.split(/[,;]/).map(s=>s.trim()).filter(Boolean);
  names.forEach(n=>{
    const hitAllergy = allergyList.find(a=>a.length>2 && n.low.includes(a));
    if(hitAllergy) warnings.push({level:'danger', text:`<strong>${n.med}</strong> may match your recorded allergy to <strong>${hitAllergy}</strong> — confirm with a pharmacist before taking it.`});
  });
  if(!warnings.length) return '';
  return `<div class="card safety-banner" style="border-color:var(--brand-danger);">
    <strong><i class="fa-solid fa-triangle-exclamation"></i> Safety check on your active reminders</strong>
    <ul>${warnings.map(w=>`<li style="${w.level==='danger'?'color:var(--brand-danger);font-weight:600;':''}">${w.text}</li>`).join('')}</ul>
    <p style="color:var(--text-muted);font-size:.76rem;margin:8px 0 0;">Automated keyword matching on what you typed in — not a clinical review. Always confirm with a pharmacist or doctor.</p>
  </div>`;
}
