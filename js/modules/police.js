/* ============================================================
   POLICE
   ============================================================ */
// Real-data scoping: a station only ever sees the cases it was actually notified
// of (inc.notifiedPoliceId === its own station id) — mirrors how a hospital only
// sees incidents assigned to CURRENT_HOSPITAL_ID. No station sees every case in
// the system.
// A case counts as "closed" for a station's own dashboard/feed once EITHER the
// case is globally closed (patient/hospital finished it) OR this station has
// marked its own involvement resolved (policeResolved). Previously the feed
// only ever cleared on the global close, which patient/hospital might never
// trigger (e.g. a false alarm, or the reporter simply never taps "close") —
// so a station's "Active Cases Nearby" count could stay stuck/inflated
// forever with nothing the officer could do about it.
function myStationIncidents(){
  return db('incidents').filter(i=>i.status!=='closed' && !(i.flags&&i.flags.policeResolved) && i.notifiedPoliceId===CURRENT_POLICE_STATION_ID);
}
function myStationResolvedCount(){
  return db('incidents').filter(i=>i.notifiedPoliceId===CURRENT_POLICE_STATION_ID && (i.status==='closed' || (i.flags&&i.flags.policeResolved))).length;
}
function viewPoliceDash(){
  const active = myStationIncidents();
  const stationName = ((db('policeProfile')||{})[CURRENT_POLICE_STATION_ID]||{}).station || 'Your Station';
  return `
  ${viewHeader('Police Console', stationName, 'Every emergency dispatch nearest to your station — ambulance and hospital — auto-notifies you. No more silent SOS calls.')}
  <div class="grid-3">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-satellite-dish"></i></div><div><div class="dash-stat-num">${active.length}</div><div class="dash-stat-label">Active Cases Nearby</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-truck-medical"></i></div><div><div class="dash-stat-num">${active.filter(i=>i.assignedResponderId).length}</div><div class="dash-stat-label">Ambulances Dispatched</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="dash-stat-num">${myStationResolvedCount()}</div><div class="dash-stat-label">Cases Resolved</div></div></div>
  </div>
  <div class="card"><h3 style="margin-top:0;">Recent activity</h3>
  <ul class="activity-feed">${db('notifications').filter(n=>n.scope==='police:'+CURRENT_POLICE_STATION_ID).slice(0,8).map(n=>`<li><span class="dot ${n.type==='danger'?'pending':'done'}"></span>${n.title} — ${n.body}<span class="timeline-time">${fmtTime(n.ts)}</span></li>`).join('') || '<li>No activity yet.</li>'}</ul></div>`;
}
function viewPoliceFeed(){
  const incidents = myStationIncidents();
  return `
  ${viewHeader('Dispatch Feed','Cases near your station','Acknowledge to log route-clearing support for the responding ambulance.')}
  ${incidents.length ? `<div class="card card-flush" style="margin-bottom:22px;"><div class="map-container" id="leaflet-map-box"></div></div>` : ''}
  <div id="police-feed-list">${renderPoliceFeedList(incidents)}</div>`;
}
function renderPoliceFeedList(incidents){
  const responders = db('responders'); const hospitals = db('hospitals');
  return incidents.length ? incidents.map(inc=>{
    const resp = inc.assignedResponderId ? responders.find(r=>r.id===inc.assignedResponderId) : null;
    const hosp = inc.assignedHospitalId ? hospitals.find(h=>h.id===inc.assignedHospitalId) : null;
    return `<div class="incident-card">
      <div class="incident-card-top"><span class="incident-id">${inc.id}</span><span class="status-tag ${inc.severity==='critical'?'status-danger':'status-warn'}">${inc.severity}</span></div>
      <div class="incident-meta">
        <span><i class="fa-solid fa-truck-medical"></i> ${resp? resp.name+' · '+resp.vehicle : 'Awaiting assignment'}</span>
        <span><i class="fa-solid fa-hospital"></i> ${hosp? hosp.name : 'Awaiting hospital'}</span>
      </div>
      ${inc.landmark ? `<div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;"><i class="fa-solid fa-signs-post"></i> ${inc.landmark}</div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;">
        <a href="${mapsLink(inc.lat,inc.lng)}" target="_blank" class="btn btn-sm btn-secondary"><i class="fa-solid fa-diamond-turn-right"></i> Directions to the spot</a>
        ${hosp ? `<a href="${mapsLink(hosp.lat,hosp.lng)}" target="_blank" class="btn btn-sm btn-secondary"><i class="fa-solid fa-hospital"></i> Directions to ${hosp.name}</a>` : ''}
      </div>
      <span class="status-tag status-info">${incidentStatusLabel(inc.status)}</span>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        ${(inc.flags&&inc.flags.policeAcked)
          ? `<span class="status-tag status-ok"><i class="fa-solid fa-check"></i> Acknowledged — route support logged</span>`
          : `<button class="btn btn-sm btn-secondary" onclick="ackPolice('${inc.id}')"><i class="fa-solid fa-flag-checkered"></i> Acknowledge / Clear route</button>`}
        <button class="btn btn-sm" onclick="closePoliceCase('${inc.id}')"><i class="fa-solid fa-box-archive"></i> Close case</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty-state"><i class="fa-solid fa-satellite-dish"></i><p>No active cases near your station right now.</p></div>`;
}
// Tick-time update: patch the list in place, leave #leaflet-map-box untouched. If a case
// just appeared/disappeared and the map card itself needs to be added/removed, fall back
// to a full re-render — see the caller in startLiveIncidentTracking().
function patchPoliceFeed(){
  const incidents = myStationIncidents();
  const el = document.getElementById('police-feed-list');
  if(el){
    const html = renderPoliceFeedList(incidents);
    if(el.innerHTML!==html) el.innerHTML = html;
  }
}
async function ackPolice(id){
  const inc = db('incidents').find(i=>i.id===id);
  if(!inc || inc.notifiedPoliceId!==CURRENT_POLICE_STATION_ID) return;
  // Persist the acknowledgment on the incident itself so it's a real, lasting record —
  // not just a one-off toast that vanishes and can be fired over and over.
  const stationLabel = ((db('policeProfile')||{})[CURRENT_POLICE_STATION_ID]||{}).station || 'Local police';
  try{
    const {incident} = await sosApi(`/api/sos/${id}/update`, {
      patchFlags: {policeAcked:true},
      timelineText: stationLabel+' acknowledged and is clearing the route'
    });
    mirrorIncident(incident);
  }catch(e){
    if(e.status===404){ dropUnknownLocalIncident(id); showToast('Case already gone', 'That case no longer exists — removed from your feed.', 'info'); renderCurrentView('po-feed'); return; }
    console.error('police ack failed', e); showToast('Acknowledge failed', 'Please try again.', 'danger'); return;
  }
  pushNotification('patient:'+(inc.reporterId||inc.patientId),'Route support','Local police acknowledged and is helping clear the route.','info',id);
  showToast('Acknowledged','Logged as active route support.','success');
  audit('police:'+CURRENT_POLICE_STATION_ID,'acknowledge',id);
  renderCurrentView('po-feed');
}
// Lets a station clear a case off its own feed once route-support is done,
// independent of whether the patient or hospital has closed it on their end.
// This is what was missing: without it, a station had no way to end its
// involvement, so "Active Cases Nearby" only ever grew and never came down.
async function closePoliceCase(id){
  const inc = db('incidents').find(i=>i.id===id);
  if(!inc || inc.notifiedPoliceId!==CURRENT_POLICE_STATION_ID) return;
  if(inc.flags && inc.flags.policeResolved) return;
  if(!confirm('Close this case on your station\'s side? It will move out of your active feed.')) return;
  const stationLabel = ((db('policeProfile')||{})[CURRENT_POLICE_STATION_ID]||{}).station || 'Local police';
  try{
    const {incident} = await sosApi(`/api/sos/${id}/update`, {
      patchFlags: {policeResolved:true},
      timelineText: stationLabel+' closed the case on their end'
    });
    mirrorIncident(incident);
  }catch(e){
    if(e.status===404){ dropUnknownLocalIncident(id); showToast('Case already gone', 'That case no longer exists — removed from your feed.', 'info'); renderCurrentView('po-feed'); return; }
    console.error('police close failed', e); showToast('Close failed', 'Please try again.', 'danger'); return;
  }
  audit('police:'+CURRENT_POLICE_STATION_ID,'close',id);
  showToast('Case closed', 'Removed from your active feed and logged as resolved.', 'success');
  renderCurrentView('po-feed');
}
