/* ============================================================
   RESPONDER
   ============================================================ */
// A case only ever credits the responder once it reaches a genuine end state
// (patient closes after arrival, or hospital confirms admission) — never on
// cancellation. inc.responderCredited guards against double-counting if both
// sides somehow race to close the same incident.
function creditResponderCase(inc){
  if(!inc || !inc.assignedResponderId || (inc.flags&&inc.flags.responderCredited)) return;
  inc.flags = {...(inc.flags||{}), responderCredited: true};
  sosApi(`/api/sos/${inc.id}/update`, { patchFlags: {responderCredited:true} }).catch(()=>{});
  const responders = db('responders');
  const r = responders.find(x=>x.id===inc.assignedResponderId);
  if(r){ r.casesHelped = (r.casesHelped||0) + 1; dbSet('responders', responders); }
}
function responderBadgeTier(count){
  if(count>=50) return {label:'Platinum Responder', icon:'fa-solid fa-award', a:'#a78bfa', b:'#6366f1'};
  if(count>=20) return {label:'Gold Responder', icon:'fa-solid fa-medal', a:'#fbbf24', b:'#f59e0b'};
  if(count>=5)  return {label:'Silver Responder', icon:'fa-solid fa-shield-heart', a:'#94a3b8', b:'#64748b'};
  return {label:'Bronze Responder', icon:'fa-solid fa-heart-pulse', a:'#f59e0b', b:'#ef4444'};
}
function viewResponderDash(){
  const mine = db('incidents').filter(i=>i.assignedResponderId===CURRENT_RESPONDER_ID && i.status!=='closed');
  const pending = db('incidents').filter(i=>i.status==='broadcasting' && i.notifiedResponders.includes(CURRENT_RESPONDER_ID));
  const myResp = (db('responders').find(r=>r.id===CURRENT_RESPONDER_ID)||{});
  const myStatus = myResp.status || 'available';
  const casesHelped = myResp.casesHelped || 0;
  const tier = responderBadgeTier(casesHelped);
  return `
  ${viewHeader('Responder Console','Unit '+CURRENT_RESPONDER_ID,'Command Center broadcasts every SOS to the nearest available units — accept fast, others get auto-cleared.')}
  <div class="responder-badge-card" style="--badge-tier-a:${tier.a};--badge-tier-b:${tier.b};">
    <div class="responder-badge-icon"><i class="${tier.icon}"></i></div>
    <div>
      <div class="responder-badge-num">${casesHelped}</div>
      <div class="responder-badge-label">Case${casesHelped===1?'':'s'} Helped</div>
      <span class="responder-badge-tier">${tier.label}</span>
    </div>
  </div>
  <div class="grid-3">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-bell"></i></div><div><div class="dash-stat-num">${pending.length}</div><div class="dash-stat-label">Pending Requests</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-route"></i></div><div><div class="dash-stat-num">${mine.length}</div><div class="dash-stat-label">Active Case</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-truck-medical"></i></div><div><div class="dash-stat-num">${myStatus==='busy'?'Busy':myStatus==='off_duty'?'Off duty':'Ready'}</div><div class="dash-stat-label">Vehicle Status</div></div></div>
  </div>
  ${pending.length ? `<div class="card"><h3 style="margin-top:0;">You have ${pending.length} pending request(s)</h3><button class="btn btn-danger" onclick="renderCurrentView('r-queue')">Open dispatch queue</button></div>` : ''}
  ${mine.length ? `<div class="card"><h3 style="margin-top:0;">Active case in progress</h3><button class="btn" onclick="renderCurrentView('r-active')">Open live case</button></div>` : ''}`;
}
function viewResponderQueue(){
  const pending = db('incidents').filter(i=>i.status==='broadcasting' && i.notifiedResponders.includes(CURRENT_RESPONDER_ID));
  const hospitals = db('hospitals');
  return `
  ${viewHeader('Dispatch Queue','Incoming emergency requests','First responder to accept gets the case — everyone else notified instantly it\'s taken.')}
  ${pending.length ? pending.map(inc=>{
    const dKm = haversineKm(SEED_RESPONDER(CURRENT_RESPONDER_ID).lat, SEED_RESPONDER(CURRENT_RESPONDER_ID).lng, inc.lat, inc.lng);
    return `<div class="incident-card">
      <div class="incident-card-top"><span class="incident-id">${inc.id}</span><span class="status-tag ${inc.severity==='critical'?'status-danger':'status-warn'}">${inc.severity}</span></div>
      <div class="incident-meta">
        <span><i class="fa-solid fa-location-dot"></i> ${dKm.toFixed(1)} km away</span>
        <span><i class="fa-solid fa-clock"></i> ETA ${etaMinutes(dKm)} min</span>
        <span><i class="fa-solid fa-hospital"></i> ${inc.notifiedHospitals.length} hospitals alerted</span>
      </div>
      ${inc.landmark ? `<div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;"><i class="fa-solid fa-signs-post"></i> ${inc.landmark}</div>` : ''}
      ${inc.reportedFor==='other' ? `<div style="font-size:.8rem;color:var(--brand-accent);margin-top:4px;"><i class="fa-solid fa-triangle-exclamation"></i> Reported by a bystander — patient not yet identified</div>` : ''}
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-danger btn-sm" onclick="acceptIncident('${inc.id}','${CURRENT_RESPONDER_ID}')"><i class="fa-solid fa-check"></i> Accept case</button>
        <button class="btn btn-secondary btn-sm" onclick="declineIncident('${inc.id}','${CURRENT_RESPONDER_ID}')">Decline</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No pending requests right now.</p></div>`}`;
}
function SEED_RESPONDER(id){ return db('responders').find(r=>r.id===id) || {lat:BASE.lat,lng:BASE.lng}; }
async function declineIncident(incId, respId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc) return;
  try{
    const {incident} = await sosApi(`/api/sos/${incId}/update`, {
      patch: { notifiedResponders: (inc.notifiedResponders||[]).filter(r=>r!==respId) }
    });
    handleIncidentEvent('incident_decline', incident);
  }catch(e){ console.error('decline failed', e); showToast('Decline failed', 'Please try again.', 'danger'); return; }
  audit('responder:'+respId, 'decline', incId);
  showToast('Declined', 'Case passed to next nearest unit.', 'info');
  renderCurrentView('r-queue');
}

async function acceptIncident(incId, respId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc || inc.status!=='broadcasting') return;
  const responders = db('responders');
  const resp = responders.find(r=>r.id===respId);

  try{
    const {incident} = await sosApi(`/api/sos/${incId}/ack`, {
      event: 'accept',
      patch: { status: 'accepted', assignedResponderId: respId },
      timelineText: `${resp.name} (${resp.vehicle}) accepted the case · heading to patient. Hospital will be chosen after pickup.`
    });
    resp.status = 'busy';
    dbSet('responders', responders);
    handleIncidentEvent('incident_accept', incident);
  }catch(e){ console.error('accept failed', e); showToast('Accept failed', 'Please try again.', 'danger'); return; }
  audit('responder:'+respId, 'accept', incId);

  if(currentRole==='responder') renderCurrentView('r-active');
  else if(currentRole==='patient' && currentView==='p-sos') renderCurrentView('p-sos');
  else refreshBell();

  startLiveIncidentTracking();
}

async function markPickedUp(incId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc || inc.status!=='accepted' || inc.assignedResponderId!==CURRENT_RESPONDER_ID) return;
  try{
    const {incident} = await sosApi(`/api/sos/${incId}/ack`, {
      event: 'picked_up',
      patch: { status: 'picked_up' },
      timelineText: 'Patient picked up — ambulance crew selecting nearest hospital'
    });
    handleIncidentEvent('incident_picked_up', incident);
  }catch(e){ console.error('pickup failed', e); showToast('Update failed', 'Please try again.', 'danger'); return; }
  audit('responder:'+CURRENT_RESPONDER_ID, 'picked_up', incId);
  if(currentRole==='responder') renderCurrentView('r-active');
}

async function markArrivedAtHospital(incId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc || inc.status!=='enroute_hospital' || inc.assignedResponderId!==CURRENT_RESPONDER_ID) return;
  const hosp = inc.assignedHospitalId ? db('hospitals').find(h=>h.id===inc.assignedHospitalId) : null;

  try{
    const {incident} = await sosApi(`/api/sos/${incId}/ack`, {
      event: 'arrived',
      patch: { status: 'arrived' },
      timelineText: 'Arrived at '+(hosp?hosp.name:'the hospital')+' — awaiting hospital admission confirmation'
    });
    // NOTE: the responder is deliberately NOT freed up here. Arriving at the hospital
    // isn't the end of the case — the crew is still responsible for the patient until
    // the hospital actually confirms admission (see closeIncidentHospitalSide), so the
    // unit stays 'busy' and this stays the responder's active case until then.
    handleIncidentEvent('incident_arrived', incident);
  }catch(e){ console.error('arrived failed', e); showToast('Update failed', 'Please try again.', 'danger'); return; }
  audit('responder:'+CURRENT_RESPONDER_ID, 'arrived', incId);
  if(currentRole==='responder') renderCurrentView('r-active');
}

// Lets the patient fix a wrong/missing landmark or add condition notes after
// the SOS has already gone out, instead of the only option being a full
// Cancel. Whoever's already assigned gets pinged so they see the update.
function openEditSosDetails(incId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc) return;
  const slot = document.getElementById('sos-edit-slot');
  if(!slot) return;
  slot.innerHTML = `
  <div class="card">
    <h3 style="margin-top:0;">Update emergency details</h3>
    <div class="form-group"><label>Landmark / direction</label>
      <input class="form-control" id="edit-sos-landmark" value="${(inc.landmark||'').replace(/"/g,'&quot;')}" placeholder="e.g. NH-8 service lane, opp. Sector 18 metro gate 2"></div>
    <div class="form-group"><label>Additional notes for the crew</label>
      <textarea class="form-control" id="edit-sos-note" rows="2" placeholder="e.g. Now conscious and talking">${inc.victimNote||''}</textarea></div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-danger" onclick="saveSosDetails('${incId}')"><i class="fa-solid fa-check"></i> Save</button>
      <button class="btn btn-secondary" onclick="document.getElementById('sos-edit-slot').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}
async function saveSosDetails(incId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc) return;
  const landmark = document.getElementById('edit-sos-landmark').value.trim();
  const note = document.getElementById('edit-sos-note').value.trim();
  const changed = landmark!==(inc.landmark||'') || note!==(inc.victimNote||'');
  try{
    const {incident} = await sosApi(`/api/sos/${incId}/update`, {
      patch: { landmark, victimNote: note },
      timelineText: changed ? 'Patient updated emergency details'+(landmark?': '+landmark:'') : undefined
    });
    handleIncidentEvent('incident_update', incident);
  }catch(e){ console.error('save details failed', e); showToast('Update failed', 'Please try again.', 'danger'); return; }
  audit(inc.reportedFor==='other'?'bystander':'patient', 'incident_update', incId);
  showToast('Updated', 'The crew will see your update.', 'success');
  renderCurrentView('p-sos');
}
// Runs only after openCancelConfirm()'s "Yes, cancel emergency" is tapped —
// consent was already gathered by the inline card, so no browser confirm() here.
async function confirmCancelIncident(incId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc) return;
  const reportedByBystander = inc.reportedFor==='other';
  try{
    const {incident} = await sosApi(`/api/sos/${incId}/close`, { timelineText: reportedByBystander ? 'Cancelled by bystander' : 'Cancelled by patient' });
    if(inc.assignedResponderId){
      const responders = db('responders');
      const r = responders.find(x=>x.id===inc.assignedResponderId);
      if(r){ r.status='available'; dbSet('responders', responders); }
    }
    handleIncidentEvent('incident_cancel', incident);
  }catch(e){
    if(e.status===404){ dropUnknownLocalIncident(incId); showToast('Already gone', 'That case no longer exists.', 'info'); renderCurrentView('p-dash'); return; }
    console.error('cancel failed', e); showToast('Cancel failed', 'Please try again.', 'danger'); return;
  }
  audit(reportedByBystander ? 'bystander' : 'patient', 'incident_cancel', incId);
  showToast('Cancelled', 'Emergency cancelled and everyone notified.', 'success');
  if(liveTrackingTimer){ clearInterval(liveTrackingTimer); liveTrackingTimer=null; }
  renderCurrentView('p-dash');
}

async function chooseHospitalForIncident(incId, hospId){
  const inc = db('incidents').find(i=>i.id===incId);
  if(!inc || inc.status!=='picked_up') return;
  const hosp = db('hospitals').find(h=>h.id===hospId);
  if(!hosp) return;

  try{
    const {incident} = await sosApi(`/api/sos/${incId}/ack`, {
      event: 'choose_hospital',
      patch: { status: 'enroute_hospital', assignedHospitalId: hospId },
      timelineText: `Ambulance crew selected ${hosp.name} as the receiving hospital`
    });
    handleIncidentEvent('incident_choose_hospital', incident);
  }catch(e){ console.error('choose hospital failed', e); showToast('Update failed', 'Please try again.', 'danger'); return; }
  audit('responder:'+inc.assignedResponderId, 'select_hospital', incId+' -> '+hospId);

  if(currentRole==='responder') renderCurrentView('r-active');
  else refreshBell();
}

/* Live tracking refresher — NOT a simulation. It never moves anyone or changes any
   incident's status itself; it just re-reads real data (the driver's actual GPS-tracked
   position, synced live from their device via applyLiveLocation) every few seconds and
   repaints whichever live view is open, so the map/ETA/timeline stay current. Status only
   ever changes from a real action: the driver tapping Accept / Picked up / Arrived, the
   patient choosing a hospital, or Cancel/Close. Stops itself once nothing is left to track. */
function startLiveIncidentTracking(){
  if(liveTrackingTimer) clearInterval(liveTrackingTimer);
  liveTrackingTimer = setInterval(()=>{
    // Escalation timing now lives server-side (sosHub.js alarm()); widening is
    // reactive off the 'incident_escalated' WS event — see widenEscalatedIncident().
    let stillActive = false;
    if(currentView==='p-sos'){
      const inc = currentIncident();
      if(inc && inc.status!=='closed'){
        stillActive = true;
        if(!document.getElementById('sos-stepper')){ renderCurrentView('p-sos'); }
        else { patchActiveSosTracking(inc); initSosMapIfNeeded(true); }
      }
    } else if(currentView==='r-active'){
      const inc = db('incidents').find(i=>i.assignedResponderId===CURRENT_RESPONDER_ID && i.status!=='closed');
      if(inc){
        stillActive = true;
        if(!document.getElementById('resp-dynamic-card')){ renderCurrentView('r-active'); }
        else { patchResponderActive(inc); initResponderMap(true); }
      }
    } else if(currentView==='r-queue'){
      // Keeps the Dispatch Queue itself live — previously a responder sitting on this
      // screen wouldn't see a brand-new SOS (or an escalated 10km case) until they
      // manually navigated away and back, since nothing here was polling before.
      stillActive = true;
      const pendingIds = db('incidents').filter(i=>i.status==='broadcasting' && i.notifiedResponders.includes(CURRENT_RESPONDER_ID)).map(i=>i.id).sort().join(',');
      if(pendingIds !== lastRQueueSnapshot){ lastRQueueSnapshot = pendingIds; renderCurrentView('r-queue'); }
    } else if(currentView==='po-feed'){
      const incidentsNow = myStationIncidents();
      if(incidentsNow.length){
        stillActive = true;
        const hasMapEl = !!document.getElementById('leaflet-map-box');
        if(!document.getElementById('police-feed-list') || (incidentsNow.length>0) !== hasMapEl){ renderCurrentView('po-feed'); }
        else { patchPoliceFeed(); }
        initPoliceMap(true);
      }
    }
    refreshBell();
    if(!stillActive){ clearInterval(liveTrackingTimer); liveTrackingTimer=null; }
  }, 4000);
}

function viewResponderActive(){
  const inc = db('incidents').find(i=>i.assignedResponderId===CURRENT_RESPONDER_ID && i.status!=='closed');
  if(!inc) return `${viewHeader('Active Case','No case in progress','Accept a request from the dispatch queue to begin.')}<div class="empty-state"><i class="fa-solid fa-route"></i><p>Nothing active right now.</p></div>`;
  return `
  ${viewHeader('Active Case', inc.id, 'Status: '+incidentStatusLabel(inc.status))}
  <div class="grid-2">
    <div class="card card-flush"><div class="map-container" id="leaflet-map-box"></div><div id="resp-live-eta" style="padding:10px 14px;font-size:.85rem;color:var(--text-muted);border-top:1px solid var(--border-color);"><i class="fa-solid fa-route"></i> Calculating route…</div></div>
    <div class="card" id="resp-dynamic-card">${renderResponderDynamicCard(inc)}</div>
  </div>`;
}
function renderResponderDynamicCard(inc){
  const hospitals = db('hospitals');
  const hosp = inc.assignedHospitalId ? hospitals.find(h=>h.id===inc.assignedHospitalId) : null;
  const med = inc.medical || {bloodGroup:'Unknown', allergies:'Unknown', chronic:'Unknown'};
  const needsHospitalPick = inc.status==='picked_up' && !inc.assignedHospitalId;
  const needsICU = inc.severity==='critical';
  let nearbyHospitals = [];
  if(needsHospitalPick){
    // Real, live capacity as entered by each hospital's own console — not a static list.
    const withCapacity = hospitals.filter(h=>h.beds>0).map(h=>({...h, distKm: haversineKm(inc.lat,inc.lng,h.lat,h.lng)})).sort((a,b)=>a.distKm-b.distKm);
    // Critical cases should be routed toward hospitals that actually have an ICU bed free right now.
    const icuMatches = withCapacity.filter(h=>h.icu>0);
    nearbyHospitals = (needsICU && icuMatches.length ? icuMatches : withCapacity).slice(0,4);
  }
  return `
      <p style="color:var(--text-muted);font-size:.85rem;margin-top:0;"><i class="fa-solid fa-location-dot"></i> ${inc.landmark ? inc.landmark : 'No landmark given'}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:-4px 0 10px;">
        <a href="${mapsLink(inc.lat,inc.lng)}" target="_blank" class="btn btn-sm ${!hosp?'btn-danger':'btn-secondary'}"><i class="fa-solid fa-diamond-turn-right"></i> Directions to patient</a>
        ${hosp ? `<a href="${mapsLink(hosp.lat,hosp.lng)}" target="_blank" class="btn btn-sm btn-danger"><i class="fa-solid fa-hospital"></i> Directions to ${hosp.name}</a>` : ''}
      </div>
      ${inc.reportedFor==='other' ? `<div class="card" style="background:var(--bg-subtle);padding:12px;margin-bottom:12px;"><strong>Reported by a bystander</strong> — patient not yet identified.${inc.victimNote?'<br>Reported condition: '+inc.victimNote:''}<br>Reporter contact: <a href="tel:${inc.reporterPhone}" style="color:var(--brand-primary);font-weight:700;">${inc.reporterPhone}</a></div>` : ''}
      <h3 style="margin-top:0;">Patient medical summary</h3>
      <div class="med-tag">Blood: ${med.bloodGroup}</div>
      <div class="med-tag">Allergies: ${med.allergies}</div>
      <div class="med-tag">Chronic: ${med.chronic}</div>
      <p style="color:var(--text-muted);font-size:.85rem;margin-top:10px;">Destination: ${hosp ? hosp.name : (needsHospitalPick ? 'Choose a hospital below' : 'Selecting hospital…')}</p>
      ${inc.status==='accepted' ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
          <button class="btn btn-danger btn-block" onclick="markPickedUp('${inc.id}')"><i class="fa-solid fa-user-check"></i> Mark patient picked up</button>
        </div>` : ''}
      ${needsHospitalPick ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
          <strong>Patient is on board — choose the receiving hospital:</strong>
          ${needsICU ? `<p style="color:var(--brand-secondary);font-size:.8rem;margin:6px 0 0;"><i class="fa-solid fa-triangle-exclamation"></i> Critical case — prioritizing hospitals with a free ICU bed.</p>` : ''}
          ${nearbyHospitals.length ? nearbyHospitals.map(h=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;">
            <span style="font-size:.85rem;">${h.name}<br><span style="color:var(--text-muted);">${h.distKm.toFixed(1)} km · ${h.beds} beds free · ${h.icu} ICU free</span></span>
            <button class="btn btn-danger btn-sm" onclick="chooseHospitalForIncident('${inc.id}','${h.id}')">Send here</button>
          </div>`).join('') : `<p style="color:var(--text-muted);font-size:.85rem;">No hospital with free beds nearby right now — check again shortly.</p>`}
        </div>` : ''}
      ${inc.status==='enroute_hospital' ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
          <button class="btn btn-danger btn-block" onclick="markArrivedAtHospital('${inc.id}')"><i class="fa-solid fa-flag-checkered"></i> Mark arrived at hospital</button>
        </div>` : ''}
      ${inc.status==='arrived' ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
          <div class="conflict-box" style="margin:0;"><strong><i class="fa-solid fa-hourglass-half"></i> Waiting on hospital</strong><br>Patient handed off${hosp?' at '+hosp.name:''}. This case stays yours — and your unit stays busy — until the hospital confirms admission.</div>
        </div>` : ''}
      <ul class="activity-feed" style="margin-top:14px;">
        ${inc.timeline.slice().reverse().map(t=>`<li><span class="dot done"></span>${t.text}<span class="timeline-time">${fmtTime(t.ts)}</span></li>`).join('')}
      </ul>`;
}
// Tick-time update: patch the dynamic card in place, leave #leaflet-map-box untouched
// so the live map (and its markers/route) don't get torn down and re-created every tick.
function patchResponderActive(inc){
  const card = document.getElementById('resp-dynamic-card');
  if(!card) return;
  const html = renderResponderDynamicCard(inc);
  if(card.innerHTML!==html) card.innerHTML = html;
}
