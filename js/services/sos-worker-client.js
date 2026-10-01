/* ============================================================
   SOS WORKER CLIENT — real backend (Cloudflare Durable Object) instead of
   the local db()/dbSet() simulation. See sosHub.js for the server side.

   - sosApi()/dispatchIncidentToWorker() write through to the Worker.
   - openSosSocket() opens one live WebSocket per role and keeps a local
     mirror of `incidents` in sync so every existing render function that
     reads db('incidents') keeps working unmodified.
   - handleIncidentEvent() is the single place that reacts to a change,
     whichever device it came from (this one or a remote one), and decides
     whether *this* device should show a notification for it.
   ============================================================ */
/* SOS_WORKER_URL → moved to js/config/app-config.js */

// Deletes the underlying Firebase Auth credential — the one thing a
// browser-only client can't do on its own. See arogyabot-admin-worker/README.md
// for setup. If this Worker is unreachable/misconfigured, account deletion
// still fully works via the revokedEmails blocklist (see adminDeleteUser()) —
// this is purely the extra step of removing the login itself, not a
// dependency for the lockout to be effective.
/* ADMIN_WORKER_URL → moved to js/config/app-config.js */
let __adminApiToken = null; // cached in memory only for this session — never persisted
async function deleteFirebaseAuthAccount(email){
  if(!__adminApiToken){
    __adminApiToken = prompt('Enter the admin worker token to permanently delete this login (leave blank to skip):');
    if(!__adminApiToken) return {deleted:false, reason:'skipped'};
  }
  try{
    const res = await fetch(`${ADMIN_WORKER_URL}/delete-user`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email, token: __adminApiToken})
    });
    const data = await res.json();
    if(!res.ok){
      if(res.status===401) __adminApiToken = null; // bad token — ask again next time
      return {deleted:false, reason: data.error||'failed'};
    }
    return data;
  }catch(e){
    return {deleted:false, reason:'network_error'};
  }
}


async function sosApi(path, body){
  const res = await fetch(`${SOS_WORKER_URL}${path}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body||{})
  });
  if(!res.ok){
    const err = new Error('SOS API '+path+' failed: '+res.status);
    err.status = res.status; // callers can special-case 404 (incident unknown to the Worker)
    throw err;
  }
  return res.json();
}

// One-time cleanup: incidents created by the pre-Worker local-only system used
// IDs like 'INC-XXXXX' (uid('INC')); the Worker issues real UUIDs. Anything
// still in the old format predates the migration, was never sent to the
// Worker, and will 404 forever on any /update /ack /close call — so it's
// dead weight that just breaks "close case" on old records. Strip it out.
function pruneStaleLocalIncidents(){
  const all = db('incidents')||[];
  const kept = all.filter(i=> !/^INC-/.test(i.id));
  if(kept.length!==all.length) dbSet('incidents', kept);
}

// Merges an incident from the Worker into the local db('incidents') mirror so
// every existing db('incidents').find/.filter() call site keeps working as-is.
function mirrorIncident(inc){
  const all = db('incidents')||[];
  const idx = all.findIndex(i=>i.id===inc.id);
  if(idx>=0) all[idx] = {...all[idx], ...inc}; else all.unshift(inc);
  dbSet('incidents', all.slice(0,2000));
}

// If the Worker 404s an action against an incident id, it means this device
// has a local record the Worker has never heard of (e.g. it predates this
// migration, or was pruned server-side some other way) — there's nothing to
// sync, so just drop it locally rather than surfacing a scary error toast.
function dropUnknownLocalIncident(id){
  const all = db('incidents')||[];
  const kept = all.filter(i=>i.id!==id);
  if(kept.length!==all.length) dbSet('incidents', kept);
}

// Dedupe: the device that performs an action gets the result directly from its
// own fetch AND (a beat later) an echo of the same event over its own socket.
// Track the last updatedAt we've reacted to per incident so we mirror the data
// every time (harmless/idempotent) but only run notification fan-out once.
window.__sosSeenUpdatedAt = window.__sosSeenUpdatedAt || {};
function handleIncidentEvent(type, inc){
  if(!inc) return;
  const seen = window.__sosSeenUpdatedAt[inc.id];
  const isNew = !seen || inc.updatedAt > seen;
  mirrorIncident(inc);
  window.__sosSeenUpdatedAt[inc.id] = inc.updatedAt;
  if(isNew) notifyForIncidentEvent(type, inc);
  if(currentRole){ softRefreshCurrentView(); refreshBell(); }
}

window.__sosSockets = window.__sosSockets || {};
function openSosSocket(role, userId, patientId){
  const key = role+':'+userId;
  const existing = window.__sosSockets[key];
  if(existing && existing.readyState <= 1) return existing; // CONNECTING or OPEN
  const ws = new WebSocket(`${SOS_WORKER_URL.replace('https','wss')}/api/sos/ws?role=${encodeURIComponent(role)}&userId=${encodeURIComponent(userId)}&patientId=${encodeURIComponent(patientId||userId)}`);
  ws.onmessage = (e)=>{
    let msg; try{ msg = JSON.parse(e.data); }catch{ return; }
    if(msg.type==='snapshot'){
      (msg.incidents||[]).forEach(inc=>mirrorIncident(inc));
      if(currentRole){ softRefreshCurrentView(); refreshBell(); }
      return;
    }
    if(msg.incident) handleIncidentEvent(msg.type, msg.incident);
  };
  ws.onclose = ()=>{
    if(window.__sosSockets[key]===ws) delete window.__sosSockets[key];
    // Auto-reconnect as long as this device is still in that role.
    setTimeout(()=>{
      if(currentRole===role || (role==='patient' && currentRole)) openSosSocket(role, userId, patientId);
    }, 3000);
  };
  window.__sosSockets[key] = ws;
  return ws;
}

/* Escalation widening: the Worker's alarm() fires 'incident_escalated' for any
   incident still 'broadcasting' 60s after creation (real, server-side timer —
   fires even with no device open) but doesn't know responder locations, so it
   can't pick the wider set itself. The patient's own connected device (the one
   with a live socket open on that incident) does the distance match, same as
   the old escalateStaleSosIncidents(), and PATCHes the result back so everyone
   sees the widened set and the new responders get notified.
   Known limitation: if the patient has no device connected when this fires,
   the widening step is skipped until one reconnects — escalation itself still
   happened server-side (inc.escalated=true), just the wider notify is deferred. */
async function widenEscalatedIncident(inc){
  if(inc.searchRadiusKm===10) return; // already widened
  // Same staleness bug as triggerSOSCore() below: without this, widening
  // picks its "newly available" responders from whatever was last fetched,
  // which can silently exclude someone who came online in the last minute.
  await refreshDispatchDirectories();
  const already = new Set(inc.notifiedResponders||[]);
  const wider = (db('responders')||[]).filter(r=>r.status==='available' && !already.has(r.id))
    .map(r=>({...r, distKm: haversineKm(inc.lat, inc.lng, r.lat, r.lng)}))
    .filter(r=>r.distKm<=10)
    .sort((a,b)=>a.distKm-b.distKm);
  const timelineText = wider.length
    ? `No unit accepted within 1 minute — escalated to ${wider.length} more ambulance(s) within 10km.`
    : 'No unit accepted within 1 minute — no additional ambulances available within 10km.';
  try{
    const {incident} = await sosApi(`/api/sos/${inc.id}/update`, {
      patch: { notifiedResponders: [...(inc.notifiedResponders||[]), ...wider.map(r=>r.id)], searchRadiusKm: 10 },
      timelineText
    });
    handleIncidentEvent('incident_widened', incident);
  }catch(e){ console.error('widen escalation failed', e); }
}

// Central notification fan-out — the single place that decides, for THIS
// device's role/identity, whether an incident event should surface a local
// pushNotification. Runs identically whether the event was this device's own
// action or a remote one, so behavior no longer depends on being the initiator.
function notifyForIncidentEvent(type, inc){
  const locNote = inc.landmark ? ` Landmark: ${inc.landmark}.` : '';
  const bystNote = inc.isBystander ? ` Reported by a bystander (not the patient) — call ${inc.reporterPhone} for on-ground details.` : '';
  // A bystander's reporterId is what identifies "this device", since inc.patientId
  // is 'UNKNOWN' for bystander reports (see currentIncident()/reporterId above).
  const isMine = { patient: currentRole==='patient' && (inc.patientId===currentPatientId() || inc.reporterId===currentPatientId()),
    responder: currentRole==='responder' && CURRENT_RESPONDER_ID,
    hospital: currentRole==='hospital' && CURRENT_HOSPITAL_ID,
    police: currentRole==='police' && CURRENT_POLICE_STATION_ID };

  if(type==='incident_created'){
    if(isMine.hospital && (inc.notifiedHospitals||[]).includes(CURRENT_HOSPITAL_ID)){
      const h = db('hospitals').find(x=>x.id===CURRENT_HOSPITAL_ID);
      const d = h ? haversineKm(inc.lat,inc.lng,h.lat,h.lng) : 0;
      pushNotification('hospital:'+CURRENT_HOSPITAL_ID, 'Incoming emergency alert', `${inc.severity.toUpperCase()} case ${d.toFixed(1)}km away · ETA ${etaMinutes(d)} min.${locNote}${bystNote} Awaiting responder assignment.`, 'danger', inc.id);
    }
    if(isMine.responder && (inc.notifiedResponders||[]).includes(CURRENT_RESPONDER_ID)){
      const r = db('responders').find(x=>x.id===CURRENT_RESPONDER_ID);
      const d = r ? haversineKm(inc.lat,inc.lng,r.lat,r.lng) : 0;
      pushNotification('responder:'+CURRENT_RESPONDER_ID, 'New dispatch request', `${inc.severity.toUpperCase()} case ${d.toFixed(1)}km away · ETA ${etaMinutes(d)} min.${locNote}${bystNote} Tap Accept in your queue.`, 'danger', inc.id);
    }
    if(isMine.police && inc.notifiedPoliceId===CURRENT_POLICE_STATION_ID){
      const p = db('police').find(x=>x.id===CURRENT_POLICE_STATION_ID);
      const d = p ? haversineKm(inc.lat,inc.lng,p.lat,p.lng) : 0;
      pushNotification('police:'+CURRENT_POLICE_STATION_ID, 'Emergency reported near '+(p?p.name:'station'), `${inc.severity.toUpperCase()} case ${d.toFixed(1)}km from station.${locNote}${bystNote} Ambulance + hospital dispatch in progress.`, 'danger', inc.id);
    }
    if(isMine.patient){
      pushNotification('patient:'+(inc.reporterId||inc.patientId), 'Help is on the way', `Notified ${(inc.notifiedHospitals||[]).length} hospitals, ${(inc.notifiedResponders||[]).length} ambulances${inc.searchRadiusKm?' within '+inc.searchRadiusKm+'km':(inc.notifiedResponders&&inc.notifiedResponders.length?' (closest available, beyond 10km)':'')} and local police simultaneously.`, 'info', inc.id);
    }
  } else if(type==='incident_escalated'){
    if(isMine.patient && inc.status==='broadcasting') widenEscalatedIncident(inc);
  } else if(type==='incident_widened'){
    if(isMine.responder && (inc.notifiedResponders||[]).includes(CURRENT_RESPONDER_ID) && inc.assignedResponderId!==CURRENT_RESPONDER_ID){
      const r = db('responders').find(x=>x.id===CURRENT_RESPONDER_ID);
      const d = r ? haversineKm(inc.lat,inc.lng,r.lat,r.lng) : 0;
      pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Dispatch escalation', `${inc.severity.toUpperCase()} case ${d.toFixed(1)}km away · ETA ${etaMinutes(d)} min. No unit accepted within 1 min — please respond if you're available.`, 'danger', inc.id);
    }
  } else if(type==='incident_accept'){
    if(isMine.responder && inc.assignedResponderId===CURRENT_RESPONDER_ID){
      const resp = db('responders').find(r=>r.id===CURRENT_RESPONDER_ID)||{};
      pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Case confirmed', `You're assigned to ${inc.id}. Head to patient location now — you'll pick the receiving hospital once you've got the patient on board.`, 'success', inc.id);
    } else if(isMine.responder && (inc.notifiedResponders||[]).includes(CURRENT_RESPONDER_ID)){
      pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Case no longer available', `${inc.id} was accepted by another unit and removed from your queue.`, 'info', inc.id);
    }
    if(isMine.police && inc.notifiedPoliceId===CURRENT_POLICE_STATION_ID){
      const resp = db('responders').find(r=>r.id===inc.assignedResponderId);
      pushNotification('police:'+CURRENT_POLICE_STATION_ID, 'Unit dispatched', `${resp?resp.vehicle:'Ambulance'} dispatched to ${inc.id}. Consider clearing the route.`, 'dispatch', inc.id);
    }
    if(isMine.patient){
      const resp = db('responders').find(r=>r.id===inc.assignedResponderId);
      pushNotification('patient:'+(inc.reporterId||inc.patientId), 'Ambulance is on its way', `${resp?resp.name:'A responder'} (${resp?resp.vehicle:''}) accepted your case.${resp?' Driver contact: '+resp.phone+'.':''}`, 'success', inc.id);
    }
  } else if(type==='incident_decline'){
    // Decline only removes the declining responder from their own queue — no
    // one else needs to hear about it, so there's nothing to notify here.
  } else if(type==='incident_picked_up'){
    if(isMine.patient) pushNotification('patient:'+(inc.reporterId||inc.patientId), 'Picked up', 'You are on board. The crew is now selecting the nearest hospital with capacity.', 'success', inc.id);
  } else if(type==='incident_choose_hospital'){
    const hosp = db('hospitals').find(h=>h.id===inc.assignedHospitalId);
    const resp = db('responders').find(r=>r.id===inc.assignedResponderId);
    if(isMine.hospital && inc.assignedHospitalId===CURRENT_HOSPITAL_ID){
      const med = inc.medical||{bloodGroup:'Unknown',allergies:'Unknown',chronic:'Unknown'};
      pushNotification('hospital:'+CURRENT_HOSPITAL_ID, 'Incoming patient confirmed', `${inc.id} · ETA ${etaMinutes(haversineKm(inc.lat,inc.lng,hosp.lat,hosp.lng))} min · Ambulance ${resp?resp.vehicle:''} · Blood group ${med.bloodGroup} · Allergies: ${med.allergies}${inc.reportedFor==='other'?' · Patient identity unknown (bystander report) — reporter: '+inc.reporterPhone:''}`, 'danger', inc.id);
    } else if(isMine.hospital && (inc.notifiedHospitals||[]).includes(CURRENT_HOSPITAL_ID)){
      pushNotification('hospital:'+CURRENT_HOSPITAL_ID, 'Case routed elsewhere — stand down', `${inc.id} was taken to another hospital. No action needed.`, 'info', inc.id);
    }
    if(isMine.police && inc.notifiedPoliceId===CURRENT_POLICE_STATION_ID){
      pushNotification('police:'+CURRENT_POLICE_STATION_ID, 'Destination confirmed', `${resp?resp.vehicle:'Ambulance'} is heading to ${hosp?hosp.name:'the hospital'} with ${inc.id}.`, 'dispatch', inc.id);
    }
    if(isMine.patient) pushNotification('patient:'+(inc.reporterId||inc.patientId), 'Heading to hospital', `You're being taken to ${hosp?hosp.name:'the hospital'}.`, 'success', inc.id);
  } else if(type==='incident_arrived'){
    const hosp = db('hospitals').find(h=>h.id===inc.assignedHospitalId);
    if(isMine.patient) pushNotification('patient:'+(inc.reporterId||inc.patientId), 'Arrived', 'You have arrived at '+(hosp?hosp.name:'the hospital')+'.', 'success', inc.id);
    if(isMine.hospital && inc.assignedHospitalId===CURRENT_HOSPITAL_ID) pushNotification('hospital:'+CURRENT_HOSPITAL_ID, 'Patient arrived', 'Case '+inc.id+' has arrived at your facility and needs to be admitted to close the case.', 'success', inc.id);
    if(isMine.responder && inc.assignedResponderId===CURRENT_RESPONDER_ID) pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Handoff pending', 'Patient dropped off'+(hosp?' at '+hosp.name:'')+'. You\'ll be marked available once the hospital confirms admission.', 'info', inc.id);
    if(isMine.police && inc.notifiedPoliceId===CURRENT_POLICE_STATION_ID) pushNotification('police:'+CURRENT_POLICE_STATION_ID, 'Case resolved', 'Ambulance completed transport for '+inc.id+'.', 'info', inc.id);
  } else if(type==='incident_update'){
    if(isMine.patient) return; // patient's own edit — no self-notify needed
    if(isMine.responder && inc.assignedResponderId===CURRENT_RESPONDER_ID) pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Details updated', `${inc.id}: ${inc.landmark?'Landmark — '+inc.landmark:'Notes updated'}${inc.victimNote?' · '+inc.victimNote:''}`, 'info', inc.id);
    if(isMine.hospital && inc.assignedHospitalId===CURRENT_HOSPITAL_ID) pushNotification('hospital:'+CURRENT_HOSPITAL_ID, 'Case details updated', `${inc.id} details were updated by the patient.`, 'info', inc.id);
  } else if(type==='incident_close' || type==='incident_cancel'){
    const wasCancelled = type==='incident_cancel';
    if(isMine.responder){
      if(inc.assignedResponderId===CURRENT_RESPONDER_ID && wasCancelled) pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Case cancelled', 'The patient cancelled this emergency. Case closed — you\'re available again.', 'info', inc.id);
      else if((inc.notifiedResponders||[]).includes(CURRENT_RESPONDER_ID) && inc.assignedResponderId!==CURRENT_RESPONDER_ID && wasCancelled) pushNotification('responder:'+CURRENT_RESPONDER_ID, 'Case cancelled', inc.id+' was cancelled by the patient.', 'info', inc.id);
    }
    if(isMine.hospital && inc.assignedHospitalId===CURRENT_HOSPITAL_ID && wasCancelled) pushNotification('hospital:'+CURRENT_HOSPITAL_ID, 'Case cancelled', 'The patient cancelled this emergency before arrival.', 'info', inc.id);
    if(isMine.police && inc.notifiedPoliceId===CURRENT_POLICE_STATION_ID && wasCancelled) pushNotification('police:'+CURRENT_POLICE_STATION_ID, 'Case cancelled', inc.id+' was cancelled by the patient.', 'info', inc.id);
  }
}

/* Real road-following routing via OSRM's free public routing API (no key required).
   Falls back to null (caller keeps the straight-line placeholder) if unreachable —
   this keeps the app usable offline/on flaky connections while giving realistic
   routes whenever the network allows it. */
async function fetchRoadRoute(pts){
  if(!pts || pts.length<2) return null;
  const coordStr = pts.map(p=>`${p[1]},${p[0]}`).join(';');
  try{
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`);
    if(!res.ok) return null;
    const data = await res.json();
    if(!data.routes || !data.routes.length) return null;
    const route = data.routes[0];
    return {
      coords: route.geometry.coordinates.map(c=>[c[1],c[0]]), // GeoJSON is [lng,lat] — Leaflet wants [lat,lng]
      distanceKm: route.distance/1000,
      durationMin: Math.max(2, Math.round(route.duration/60))
    };
  }catch(e){ console.warn('Road routing unavailable, using straight-line estimate', e); return null; }
}

/* No pre-filled hospitals, ambulances, police stations, doctors, or pharmacies.
   Every one of these now only appears once a real account registers through the
   app's own sign-up flow (see ensureResponderRecord / ensureHospitalRecord /
   ensurePoliceStationRecord below, and "Add doctor" in the hospital console). */
const SEED = {
  hospitals: [],
  responders: [],
  police: [],
  doctors: [],
  pharmacies: []
};
