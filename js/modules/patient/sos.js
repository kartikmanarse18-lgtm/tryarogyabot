/* ============================================================
   PATIENT — SOS
   ============================================================ */
function currentIncident(){
  // Match on patientId (self-reports) OR reporterId (bystander reports, where
  // patientId is 'UNKNOWN' since the victim's identity isn't known). Without the
  // reporterId check, a bystander who just submitted an SOS had no way to find
  // their own incident again — the p-sos screen would just show a blank SOS
  // button, with no tracking and no way to cancel what they'd just reported.
  const me = currentPatientId();
  return db('incidents').find(i=>(i.patientId===me || i.reporterId===me) && i.status!=='closed');
}
function viewPatientSOS(){
  const inc = currentIncident();
  if(!inc){
    return `
    ${viewHeader('Emergency SOS','One tap. Every nearby responder knows.','This immediately alerts the nearest hospitals, ambulances, and police — not just a single hospital.')}
    <div class="card" style="padding:0;">
      <div class="sos-banner">
        <div style="font-family:var(--ff-mono);text-transform:uppercase;letter-spacing:.1em;font-size:.8rem;opacity:.85;">Press and hold is not required — one tap dispatches help</div>
        <button class="sos-trigger-btn" onclick="openReportTypePicker()"><i class="fa-solid fa-triangle-exclamation" style="font-size:1.8rem;margin-bottom:6px;"></i>SOS</button>
        <div style="font-size:.85rem;opacity:.9;">Voice trigger also available — say "Help, Arogya Emergency"</div>
        <button class="btn btn-secondary btn-sm" style="margin-top:14px;background:rgba(255,255,255,.18);color:#fff;" onclick="startVoiceSOS()"><i class="fa-solid fa-microphone"></i> Enable voice SOS</button>
      </div>
    </div>
    <div id="severity-picker-slot"></div>
    ${offlineFallbackCard()}`;
  }
  return renderActiveSosTracking(inc);
}
// --------------------------------------------------------------------------
// OFFLINE FALLBACK — this used to just claim "automatically falls back to
// SMS-based location reporting and serves cached first-aid instructions from
// the offline service worker cache." None of that existed: there is no
// service worker anywhere in this app, no cache registration, and no SMS
// integration. A user who lost connectivity mid-emergency and believed that
// text would have gotten nothing.
// A browser genuinely cannot send SMS on its own — there's no API for it —
// so the honest version is the `sms:` link below: it opens the phone's own
// messaging app pre-addressed and pre-filled, and the user hits send. That's
// a real, working fallback, just not a silent/automatic one, and the first-
// aid steps beneath it are plain static content already sitting in this
// page's own JS, so they're readable with zero network regardless of
// whether the rest of the app can sync.
// --------------------------------------------------------------------------
const OFFLINE_FIRST_AID = [
  {title:'Severe bleeding', steps:'Apply firm, direct pressure with a clean cloth. Do not remove it if it soaks through — add more on top. Keep the injured part raised above heart level if possible.'},
  {title:'Not breathing / CPR', steps:'Call for help loudly. Push hard and fast in the center of the chest, about 2 inches deep, 100–120 pushes/minute, until help arrives or the person responds.'},
  {title:'Choking', steps:'5 back blows between the shoulder blades, then 5 abdominal thrusts (Heimlich). Repeat until the object clears or the person can breathe/cough/speak.'},
  {title:'Burns', steps:'Cool the burn under running water for 20 minutes. Do not apply ice, butter, or ointments. Cover loosely with a clean, non-stick cloth.'},
  {title:'Suspected fracture', steps:'Do not try to straighten or realign the limb. Immobilize it as found using a splint or sling. Watch for numbness or loss of color beyond the injury.'},
];
function offlineFallbackCard(){
  const profile = db('profile') || {};
  return `
    <div class="card">
      <h3 style="margin-top:0;">If you lose connection</h3>
      <p style="color:var(--text-muted);font-size:.88rem;">The SOS button above needs a data connection to reach hospitals and responders. If it fails, use this to send your location by text instead — your phone's own messaging app will open, pre-filled, ready to send.</p>
      <button class="btn btn-danger btn-block" onclick="openEmergencySmsFallback()"><i class="fa-solid fa-comment-sms"></i> Send my location via SMS</button>
      <details style="margin-top:14px;">
        <summary style="cursor:pointer;font-weight:700;font-size:.85rem;color:var(--text-main);">First-aid quick reference (works with no signal — already loaded on this page)</summary>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;">
          ${OFFLINE_FIRST_AID.map(f=>`<div><strong style="font-size:.85rem;">${f.title}</strong><p style="margin:2px 0 0;color:var(--text-muted);font-size:.82rem;">${f.steps}</p></div>`).join('')}
        </div>
      </details>
    </div>`;
}
async function openEmergencySmsFallback(){
  const profile = db('profile') || {};
  const loc = await getDeviceLocation();
  const lat = loc ? loc.lat : profile.lat, lng = loc ? loc.lng : profile.lng;
  const body = `EMERGENCY - ${profile.name||'ArogyaBot user'} needs help. Location: https://maps.google.com/?q=${lat},${lng} (Blood group: ${profile.bloodGroup||'unknown'})`;
  // No fixed emergency number is wired up here on purpose — SMS numbers for
  // ambulance/police vary by region, and hardcoding one would be wrong for
  // most users. Opening the compose screen blank-addressed still saves them
  // typing out the whole message; they just need to pick or type a number.
  window.location.href = 'sms:?body=' + encodeURIComponent(body);
}
// In-progress SOS reports live in window.__report/__sev (see softRefreshCurrentView
// for why). That's fine while the tab stays open and untouched, but it means the
// data has nowhere to go if the page reloads, the tab gets backgrounded and the
// browser reclaims it, or a sync refresh slips through outside the guard below —
// any of which silently reset the form and made "Confirm & Dispatch" a no-op.
// Mirroring the same state into localStorage costs nothing (it's a tiny object,
// written on the same ticks the state already changes) and lets us rebuild the
// exact step the user was on instead of dropping them back to a blank SOS button.
function persistInProgressSOS(stage){
  try{
    if(window.__report){
      localStorage.setItem('abot2_sos_inprogress', JSON.stringify({report:window.__report, sev:window.__sev||null, stage:stage||null}));
    } else {
      localStorage.removeItem('abot2_sos_inprogress');
    }
  }catch(e){}
}
function loadInProgressSOS(){
  try{
    const raw = localStorage.getItem('abot2_sos_inprogress');
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function clearInProgressSOS(){
  try{ localStorage.removeItem('abot2_sos_inprogress'); }catch(e){}
}
// Called after the p-sos screen renders. If the in-memory report got wiped out
// from under the user (see above) but a saved draft exists, silently rebuild the
// step they were on instead of leaving them at a blank SOS button they already
// thought they'd moved past.
function rehydrateInProgressSOS(){
  if(currentIncident()) return; // a real incident already exists — nothing to resume
  if(window.__report) return; // state is intact in memory, nothing to do
  const saved = loadInProgressSOS();
  if(!saved || !saved.report || !saved.report.type) return; // nothing meaningful was in flight
  window.__report = saved.report;
  window.__sev = saved.sev || 'severe';
  if(saved.stage==='locating'){
    // GPS lookup hadn't resolved yet when state was lost — just resume that lookup.
    chooseReportType(saved.report.type);
    return;
  }
  if(saved.stage==='bystander') renderBystanderForm();
  else renderSeverityStep();
  showToast('Resumed your report', 'We restored the emergency details you were entering — double-check and tap Confirm & Dispatch.', 'info');
}
function openReportTypePicker(){
  window.__report = {type:null, lat:null, lng:null, accuracy:null, landmark:'', victimNote:'', reporterPhone: (db('profile')||{}).phone || ''};
  persistInProgressSOS('type-picker');
  const slot = document.getElementById('severity-picker-slot');
  slot.innerHTML = `
  <div class="card">
    <h3 style="margin-top:0;">Who is this emergency for?</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">This changes what info we can safely send to responders — we won't guess someone else's medical details.</p>
    <button class="btn btn-danger btn-block" style="margin-bottom:10px;" onclick="chooseReportType('self')"><i class="fa-solid fa-user"></i> This is happening to me</button>
    <button class="btn btn-secondary btn-block" onclick="chooseReportType('other')"><i class="fa-solid fa-people-group"></i> I'm a bystander reporting for someone else</button>
  </div>`;
}
async function chooseReportType(type){
  window.__report.type = type;
  persistInProgressSOS('locating');
  const slot = document.getElementById('severity-picker-slot');
  slot.innerHTML = `<div class="card"><p style="color:var(--text-muted);font-size:.85rem;"><i class="fa-solid fa-location-crosshairs fa-spin"></i> Getting your exact GPS location…</p></div>`;
  const loc = await getDeviceLocation();
  const profile = db('profile');
  if(loc){ window.__report.lat = loc.lat; window.__report.lng = loc.lng; window.__report.accuracy = loc.accuracy; }
  else { window.__report.lat = profile.lat; window.__report.lng = profile.lng; window.__report.accuracy = null; }

  if(type==='self'){ renderSeverityStep(); return; }
  renderBystanderForm();
}
function renderBystanderForm(){
  const r = window.__report;
  const locLine = r.accuracy!=null ? `GPS locked (±${r.accuracy}m)` : `Using approximate location — GPS unavailable/denied`;
  const slot = document.getElementById('severity-picker-slot');
  slot.innerHTML = `
  <div class="card">
    <h3 style="margin-top:0;">Bystander report</h3>
    <p style="color:var(--text-muted);font-size:.85rem;"><i class="fa-solid fa-location-dot"></i> ${locLine} · <a href="${mapsLink(r.lat,r.lng)}" target="_blank" style="color:var(--brand-primary);">preview on map</a></p>
    <div class="form-group"><label>Landmark / direction (helps the ambulance find the exact spot)</label>
      <input class="form-control" id="bys-landmark" placeholder="e.g. NH-8 service lane, opp. Sector 18 metro gate 2, facing towards Gurgaon"></div>
    <div class="form-group"><label>What do you see? (visible condition — optional)</label>
      <textarea class="form-control" id="bys-note" rows="2" placeholder="e.g. Man, ~30s, conscious but bleeding from head, two-wheeler accident"></textarea></div>
    <div class="form-group"><label>Your phone (so responders can call you back for directions)</label>
      <input class="form-control" id="bys-phone" value="${r.reporterPhone}"></div>
    <button class="btn btn-danger btn-block" style="margin-top:6px;" onclick="submitBystanderForm()">Continue</button>
  </div>`;
  persistInProgressSOS('bystander');
}
function submitBystanderForm(){
  window.__report.landmark = document.getElementById('bys-landmark').value.trim();
  window.__report.victimNote = document.getElementById('bys-note').value.trim();
  window.__report.reporterPhone = document.getElementById('bys-phone').value.trim();
  renderSeverityStep();
}
function renderSeverityStep(){
  const r = window.__report;
  const slot = document.getElementById('severity-picker-slot');
  const locLine = r.accuracy!=null ? `Location locked (±${r.accuracy}m)` : `Approximate location (GPS unavailable)`;
  slot.innerHTML = `
  <div class="card">
    <h3 style="margin-top:0;">Confirm severity</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">This helps dispatch the right response (ambulance only, or ambulance + police + fire).</p>
    <p style="color:var(--text-muted);font-size:.8rem;"><i class="fa-solid fa-location-dot"></i> ${locLine}${r.landmark? ' · '+r.landmark : ''} · <a href="${mapsLink(r.lat,r.lng)}" target="_blank" style="color:var(--brand-primary);">view on map</a></p>
    <div class="severity-picker" id="sev-picker">
      <button class="severity-opt" data-sev="moderate" onclick="pickSeverity('moderate')">Moderate</button>
      <button class="severity-opt" data-sev="severe" onclick="pickSeverity('severe')">Severe</button>
      <button class="severity-opt" data-sev="critical" onclick="pickSeverity('critical')">Critical</button>
    </div>
    <button class="btn btn-danger btn-block" id="confirm-dispatch-btn" style="margin-top:16px;" onclick="triggerSOS(this)"><i class="fa-solid fa-bolt"></i> Confirm &amp; Dispatch Now</button>
  </div>`;
  window.__sev = 'severe';
  persistInProgressSOS('severity');
}
function pickSeverity(s){ window.__sev = s; document.querySelectorAll('.severity-opt').forEach(b=>b.classList.toggle('sel', b.dataset.sev===s)); persistInProgressSOS('severity'); }
// --------------------------------------------------------------------------
// VOICE SOS — previously this was `setTimeout(...,2500)` that ALWAYS fired a
// real emergency dispatch 2.5s after the button was tapped, regardless of
// whether anything was said, while telling the user "Listening... (simulated)".
// That's a false-alarm risk (anyone curious-tapping the button silently
// triggers a real hospital/police/ambulance dispatch) and a trust problem
// (the UI claims live voice detection that never existed). This now uses the
// real Web Speech API: it actually listens, only dispatches on a genuine
// phrase match, restarts itself if the browser auto-stops on silence, and is
// honest with the user (and can be cancelled) when the browser doesn't
// support it at all instead of pretending to listen.
// --------------------------------------------------------------------------
let __voiceRecognition = null;
function startVoiceSOS(){
  if(currentIncident()){ showToast('Already dispatched', 'An SOS is already active — no need to arm voice trigger.', 'info'); return; }
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const slot = document.getElementById('severity-picker-slot');
  if(!SpeechRec){
    showToast('Voice SOS not supported', 'This browser doesn\'t support voice recognition — use the SOS button instead.', 'danger');
    return;
  }
  if(__voiceRecognition) return; // already armed
  const rec = new SpeechRec();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = 'en-IN';
  __voiceRecognition = rec;
  if(slot){
    slot.innerHTML = `
    <div class="card" style="border-color:var(--brand-primary);">
      <p style="color:var(--text-muted);font-size:.85rem;"><i class="fa-solid fa-microphone" style="color:var(--brand-primary);"></i> Listening for "Help, Arogya Emergency"… speak clearly, this really is live.</p>
      <button class="btn btn-secondary btn-block" onclick="stopVoiceSOS(true)">Cancel voice SOS</button>
    </div>`;
  }
  rec.onresult = (e)=>{
    const transcript = e.results[e.results.length-1][0].transcript.toLowerCase();
    if(transcript.includes('help') && transcript.includes('emergency')){
      stopVoiceSOS(false);
      if(currentIncident()) return;
      window.__sev = 'severe';
      window.__report = {type:'self', lat:null, lng:null, accuracy:null, landmark:'', victimNote:'Triggered via voice SOS.', reporterPhone:(db('profile')||{}).phone||''};
      getDeviceLocation().then(loc=>{
        const profile = db('profile');
        if(loc){ window.__report.lat=loc.lat; window.__report.lng=loc.lng; window.__report.accuracy=loc.accuracy; }
        else { window.__report.lat=profile.lat; window.__report.lng=profile.lng; window.__report.accuracy=null; }
        triggerSOS();
      });
    }
  };
  rec.onerror = (e)=>{
    if(e.error==='not-allowed' || e.error==='service-not-allowed'){
      showToast('Microphone blocked', 'Voice SOS needs microphone permission — allow it in your browser settings to use this.', 'danger');
    }
    stopVoiceSOS(true);
  };
  rec.onend = ()=>{
    // Most browsers auto-stop recognition after a stretch of silence — restart
    // automatically while still armed, so "armed" actually means armed until
    // the user cancels or it dispatches, not just for the first pause.
    if(__voiceRecognition===rec){ try{ rec.start(); }catch(err){} }
  };
  try{
    rec.start();
    showToast('Voice SOS armed', 'Say "Help, Arogya Emergency" clearly — this will dispatch immediately on match.', 'info');
  }catch(err){
    stopVoiceSOS(true);
  }
}
function stopVoiceSOS(clearUI){
  if(__voiceRecognition){
    const rec = __voiceRecognition;
    __voiceRecognition = null; // clear first so onend doesn't restart it
    try{ rec.stop(); }catch(e){}
  }
  if(clearUI){
    const slot = document.getElementById('severity-picker-slot');
    if(slot) slot.innerHTML = '';
  }
}

// --------------------------------------------------------------------------
// DISPATCH — crash-proof wrapper around the real logic (triggerSOSCore).
//
// Why this exists: "Confirm & Dispatch" used to call the dispatch logic
// directly from the button's onclick. That logic reads several shared
// records (profile / hospitals / police / responders) straight out of
// db(). If ANY of those came back null/undefined for a moment — a fresh
// account whose profile hadn't finished seeding yet, a Firestore snapshot
// still in flight, a device that briefly lost sync — the very first
// property access (e.g. profile.lat) threw a plain JS TypeError. Because
// inline onclick="..." handlers are not wrapped in try/catch anywhere,
// that exception died silently in the console: the button visibly did
// nothing, no toast, no error, nothing the user could act on. That is the
// "sync-related dispatch button" bug.
//
// The fix has three independent layers, each of which alone would stop
// the symptom, so this is failure-proof even if one layer is bypassed:
//   1. triggerSOSCore() no longer trusts any shared record to exist —
//      every db() read used here has a `|| fallback`.
//   2. triggerSOS() runs the core logic inside try/catch. If something
//      still goes wrong, the user gets a visible toast telling them to
//      tap again — instead of a dead button and silence.
//   3. A dispatch-in-progress flag + button disable/re-enable prevents a
//      double machine-gunned tap (or a second click firing mid-render)
//      from creating two incidents or racing itself.
// --------------------------------------------------------------------------
let __sosDispatchInFlight = false;
async function triggerSOS(btnEl){
  if(__sosDispatchInFlight) return; // ignore a second tap while the first is still processing
  __sosDispatchInFlight = true;
  let restoreBtn = null;
  if(btnEl){
    const originalHtml = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dispatching…';
    restoreBtn = ()=>{ btnEl.disabled = false; btnEl.innerHTML = originalHtml; };
  }
  try{
    await triggerSOSCore();
    // On success triggerSOSCore() re-renders the p-sos view (a new stepper
    // replaces this button entirely), so there is nothing left to restore.
    // window.__sosClientRequestId is only cleared on confirmed success, so a
    // failed attempt below reuses the SAME clientRequestId on retry — the
    // Worker dedupes on it, so a flaky network never creates two incidents.
  }catch(e){
    console.error('SOS dispatch failed:', e);
    showToast('Dispatch didn\'t go through', 'Something interrupted sending your SOS. Your details were kept — please tap Confirm & Dispatch again.', 'danger');
    if(restoreBtn) restoreBtn();
  }finally{
    __sosDispatchInFlight = false;
  }
}
async function triggerSOSCore(){
  const profile = db('profile') || {};
  const sev = window.__sev || 'severe';
  const r = window.__report || {type:'self', lat:profile.lat, lng:profile.lng, accuracy:null, landmark:'', victimNote:'', reporterPhone:profile.phone};
  const patientLat = r.lat, patientLng = r.lng;
  const isBystander = r.type==='other';

  // BUGFIX (responder-not-notified): 'responders'/'hospitals' are cached,
  // fetch-once-then-manual-refresh directories (see initPublicDirectories()),
  // so without this, matching below runs against whatever snapshot happened
  // to be in LOCAL_CACHE when this device last loaded/refreshed — which can
  // be arbitrarily out of date with who's actually available right now. An
  // SOS trigger is exactly the one moment that can't tolerate that, so pull
  // a fresh copy of just those two directories and await it before matching.
  // No-ops instantly in single-device/offline mode (see fetchDirectoryKeys()).
  await refreshDispatchDirectories();

  const hospitals = (db('hospitals')||[]).map(h=>({...h, distKm: haversineKm(patientLat,patientLng,h.lat,h.lng)})).sort((a,b)=>a.distKm-b.distKm);
  const nearestHospitals = hospitals.filter(h=>h.beds>0).slice(0,3);
  const nearbyMatch = findNearbyAvailableResponders(patientLat, patientLng, 3);
  const nearestResponders = nearbyMatch.responders;
  const police = (db('police')||[]).map(p=>({...p, distKm: haversineKm(patientLat,patientLng,p.lat,p.lng)})).sort((a,b)=>a.distKm-b.distKm)[0];

  const patientId = isBystander ? 'UNKNOWN' : currentPatientId();
  const initialTimelineText = (isBystander?'SOS reported by bystander':'SOS triggered by patient')+' · severity: '+sev+(r.landmark?' · near '+r.landmark:'')+(nearbyMatch.radiusKm?` · ${nearestResponders.length} ambulance(s) found within ${nearbyMatch.radiusKm}km`:(nearestResponders.length?' · nearest available ambulances notified (none within 10km)':' · no ambulances currently available'));

  // clientRequestId is generated once per report attempt and only cleared on
  // confirmed success, so a retry after a failed tap reuses the same id — the
  // Worker's /trigger is idempotent on it (see sosHub.js findByClientRequestId).
  if(!window.__sosClientRequestId) window.__sosClientRequestId = uid('REQ');

  const {incident: inc} = await sosApi('/api/sos/trigger', {
    clientRequestId: window.__sosClientRequestId,
    // reporterId is the device/account that actually submitted this SOS — for a
    // self-report it's the same as patientId, but for a bystander report
    // patientId is 'UNKNOWN' (we don't know who the victim is), so reporterId is
    // the ONLY way the reporting device can find its way back to this incident
    // afterward to track status or cancel it. See currentIncident() below.
    reporterId: currentPatientId(),
    patientId, patientName: isBystander ? 'Unknown patient (bystander report)' : (profile.name || 'Patient'),
    reportedFor: r.type, reporterPhone: r.reporterPhone || profile.phone || '',
    isBystander, severity: sev,
    lat: patientLat, lng: patientLng, landmark: r.landmark || '', victimNote: r.victimNote || '',
    locationAccuracy: r.accuracy,
    medical: isBystander ? {bloodGroup:'Unknown', allergies:'Unknown', chronic:'Unknown'} : {bloodGroup:profile.bloodGroup, allergies:profile.allergies, chronic:profile.chronic},
    notifiedHospitals: nearestHospitals.map(h=>h.id), notifiedResponders: nearestResponders.map(r=>r.id),
    notifiedPoliceId: police ? police.id : null,
    searchRadiusKm: nearbyMatch.radiusKm,
    initialTimelineText
  });
  window.__sosClientRequestId = null; // clear only on confirmed success

  handleIncidentEvent('incident_created', inc);
  audit(isBystander?'bystander':'patient', 'sos_trigger', inc.id+' severity='+sev+' radius='+(nearbyMatch.radiusKm||'>10')+'km');

  window.__report = null;
  window.__sev = null;
  clearInProgressSOS();
  renderCurrentView('p-sos');
}

function renderActiveSosTracking(inc){
  const hospitals = db('hospitals');
  const responders = db('responders');
  const assignedHosp = inc.assignedHospitalId ? hospitals.find(h=>h.id===inc.assignedHospitalId) : null;
  const assignedResp = inc.assignedResponderId ? responders.find(r=>r.id===inc.assignedResponderId) : null;
  const stepIdx = {broadcasting:0, accepted:1, picked_up:2, enroute_hospital:2, arrived:3, closed:4}[inc.status];
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
    ${viewHeader('Live Emergency Tracking', inc.id, 'Severity: '+inc.severity.toUpperCase()+(inc.reportedFor==='other'?' · Reported for someone else':''))}
    <button class="btn btn-secondary btn-sm" style="margin-top:2px;" onclick="renderCurrentView('p-dash')" title="This stays active in the background — use Cancel below to actually cancel it"><i class="fa-solid fa-xmark"></i> Exit to dashboard</button>
  </div>
  ${inc.landmark ? `<p style="color:var(--text-muted);font-size:.85rem;margin:-6px 0 12px;"><i class="fa-solid fa-location-dot"></i> ${inc.landmark} · <a href="${mapsLink(inc.lat,inc.lng)}" target="_blank" style="color:var(--brand-primary);">view on map</a>${inc.status!=='arrived'&&inc.status!=='closed'?` · <a href="#" onclick="openEditSosDetails('${inc.id}');return false;" style="color:var(--brand-primary);">edit</a>`:''}</p>` : (inc.status!=='arrived'&&inc.status!=='closed' ? `<p style="margin:-6px 0 12px;"><a href="#" onclick="openEditSosDetails('${inc.id}');return false;" style="color:var(--brand-primary);font-size:.85rem;"><i class="fa-solid fa-pen"></i> Add a landmark</a></p>` : '')}
  <div id="sos-edit-slot"></div>
  <div class="stepper" id="sos-stepper">
    ${['Broadcast','Ambulance Assigned','Picked Up','At Hospital'].map((lbl,i)=>`<div class="step ${i<stepIdx?'done':i===stepIdx?'active':''}"><div class="circ">${i<stepIdx?'<i class=\"fa-solid fa-check\"></i>':i+1}</div><div class="lbl">${lbl}</div></div>`).join('')}
  </div>
  <div class="grid-2">
    <div class="card card-flush"><div class="map-container" id="leaflet-map-box"></div><div id="sos-live-eta" style="padding:10px 14px;font-size:.85rem;color:var(--text-muted);border-top:1px solid var(--border-color);"><i class="fa-solid fa-route"></i> Calculating route…</div></div>
    <div class="card">
      <h3 style="margin-top:0;">Dispatch activity</h3>
      <ul class="activity-feed" id="sos-timeline">
        ${inc.timeline.slice().reverse().map(t=>`<li><span class="dot done"></span>${t.text}<span class="timeline-time">${fmtTime(t.ts)}</span></li>`).join('')}
      </ul>
      <div id="sos-driver-block">${renderSosDriverBlock(inc, assignedResp, assignedHosp)}</div>
    </div>
  </div>`;
}
function renderSosDriverBlock(inc, assignedResp, assignedHosp){
  return `${assignedResp ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
    <strong>Responder:</strong> ${assignedResp.name} · ${assignedResp.vehicle}<br>
    <strong>Driver phone:</strong> <a href="tel:${assignedResp.phone}" style="color:var(--brand-primary);font-weight:700;">${assignedResp.phone} <i class="fa-solid fa-phone"></i></a><br>
    ${assignedHosp ? `<strong>Hospital:</strong> ${assignedHosp.name}` : (inc.status==='picked_up' ? `<strong>Hospital:</strong> crew is selecting nearest hospital…` : `<strong>Hospital:</strong> pending confirmation`)}
  </div>` : ''}
  ${inc.status==='arrived'
    ? `<button class="btn btn-secondary btn-block" style="margin-top:14px;" onclick="closeIncidentPatientSide('${inc.id}')">Close case</button>`
    : `<button class="btn btn-secondary btn-block" id="cancel-emergency-btn" style="margin-top:14px;" onclick="openCancelConfirm('${inc.id}')"><i class="fa-solid fa-ban"></i> Cancel emergency</button>`}`;
}
// Shown in place of the "Cancel emergency" button. This is used identically for
// a patient's own SOS and for a bystander's report — renderSosDriverBlock() is
// the same shared markup for both, so fixing it here covers both cases. A plain
// browser confirm() used to be the only guard here; this replaces it with an
// in-app card so there's always a visible, explicit "no, don't cancel" option
// alongside the confirm action, for both self-reports and bystander reports.
function openCancelConfirm(incId){
  const inc = db('incidents').find(i=>i.id===incId);
  const slot = document.getElementById('sos-edit-slot');
  if(!slot || !inc) return;
  const forSomeoneElse = inc.reportedFor==='other';
  slot.innerHTML = `
  <div class="card" style="border-color:#ef4444;background:rgba(239,68,68,.06);">
    <h3 style="margin-top:0;color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Cancel this emergency?</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">${forSomeoneElse ? 'Any assigned ambulance, hospital and police will be told the person you reported no longer needs help.' : 'Any assigned ambulance, hospital and police will be notified it\'s no longer needed.'}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-danger" onclick="confirmCancelIncident('${incId}')"><i class="fa-solid fa-ban"></i> Yes, cancel emergency</button>
      <button class="btn btn-secondary" onclick="closeCancelConfirm()">No, don't cancel</button>
    </div>
  </div>`;
}
function closeCancelConfirm(){
  const slot = document.getElementById('sos-edit-slot');
  if(slot) slot.innerHTML = '';
}
/* Called on every simulation tick instead of re-rendering the whole card: rewriting the
   full innerHTML every 1.4s destroyed and recreated #leaflet-map-box each time, which
   orphaned the live Leaflet map instance and produced the flicker/"stuck loading" look.
   This only touches the specific pieces that actually changed, and never touches the map
   container — initSosMapIfNeeded() keeps moving markers on the same live map instance. */
function patchActiveSosTracking(inc){
  const hospitals = db('hospitals');
  const responders = db('responders');
  const assignedHosp = inc.assignedHospitalId ? hospitals.find(h=>h.id===inc.assignedHospitalId) : null;
  const assignedResp = inc.assignedResponderId ? responders.find(r=>r.id===inc.assignedResponderId) : null;
  const stepIdx = {broadcasting:0, accepted:1, picked_up:2, enroute_hospital:2, arrived:3, closed:4}[inc.status];

  const stepperEl = document.getElementById('sos-stepper');
  if(stepperEl){
    stepperEl.querySelectorAll('.step').forEach((el,i)=>{
      const done = i<stepIdx, active = i===stepIdx;
      el.classList.toggle('done', done);
      el.classList.toggle('active', active);
      const circ = el.querySelector('.circ');
      const wantHtml = done ? '<i class="fa-solid fa-check"></i>' : String(i+1);
      if(circ && circ.innerHTML!==wantHtml) circ.innerHTML = wantHtml;
    });
  }
  const timelineEl = document.getElementById('sos-timeline');
  if(timelineEl){
    const html = inc.timeline.slice().reverse().map(t=>`<li><span class="dot done"></span>${t.text}<span class="timeline-time">${fmtTime(t.ts)}</span></li>`).join('');
    if(timelineEl.innerHTML!==html) timelineEl.innerHTML = html;
  }
  const driverEl = document.getElementById('sos-driver-block');
  if(driverEl){
    const html = renderSosDriverBlock(inc, assignedResp, assignedHosp);
    if(driverEl.innerHTML!==html) driverEl.innerHTML = html;
  }
}
async function closeIncidentPatientSide(id){
  const inc = db('incidents').find(i=>i.id===id);
  if(inc){
    try{
      const {incident} = await sosApi(`/api/sos/${id}/close`, { timelineText: 'Case closed by patient' });
      creditResponderCase(incident);
      handleIncidentEvent('incident_close', incident);
    }catch(e){
      if(e.status===404){ dropUnknownLocalIncident(id); }
      else { console.error('close failed', e); showToast('Close failed', 'Please try again.', 'danger'); return; }
    }
  }
  audit('patient','incident_close', id);
  renderCurrentView('p-dash');
}
