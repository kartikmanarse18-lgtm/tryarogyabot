/* ============================================================
   REAL-TIME VIDEO CALL (WebRTC) — patient <-> doctor telemedicine.
   The audio/video streams go directly between the two browsers
   (peer-to-peer); Firestore is used ONLY as a signaling channel to
   exchange the one-time SDP offer/answer and ICE candidates for a
   given appointment — same 'arogya_rooms/{ROOM_ID}' room already
   used for every other cross-device sync in this app.

   Whichever side opens the call screen FIRST becomes the caller
   (creates the offer); the second side to open it sees the offer
   already sitting in Firestore and becomes the callee (creates the
   answer) — so it works no matter who joins first.

   Needs: (1) a secure context (https, or localhost) for
   getUserMedia — browsers block camera/mic access otherwise; and
   (2) Firebase configured (fbEnabled), since two different devices
   can't otherwise find each other. Without Firebase this still
   shows the local camera as a preview, but there is no channel to
   reach the other participant, so it says so rather than pretending
   to connect.
   ============================================================ */
let rtcPeerConnection = null;
let rtcLocalStream = null;
let rtcCurrentApptId = null;
let rtcCandidateUnsubs = [];
let rtcCallUnsub = null;

const RTC_ICE_SERVERS = { iceServers: [
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'}
]};

function rtcCallDocRef(apptId){
  if(!fbEnabled) return null;
  return firebase.firestore().collection('arogya_rooms').doc(ROOM_ID).collection('calls').doc(apptId);
}

function rtcTeardown(){
  if(rtcPeerConnection){ try{ rtcPeerConnection.close(); }catch(e){} rtcPeerConnection = null; }
  if(rtcLocalStream){ rtcLocalStream.getTracks().forEach(t=>t.stop()); rtcLocalStream = null; }
  if(rtcCallUnsub){ rtcCallUnsub(); rtcCallUnsub = null; }
  rtcCandidateUnsubs.forEach(u=>u && u());
  rtcCandidateUnsubs = [];
}

// Ends the call for good (both sides hung up, or the call is being abandoned) —
// also deletes the signaling doc so a future call on this same appointment
// starts clean instead of finding a stale offer/answer from last time.
function rtcHangUp(){
  const apptId = rtcCurrentApptId;
  rtcTeardown();
  if(fbEnabled && apptId){
    const ref = rtcCallDocRef(apptId);
    ref && ref.delete().catch(()=>{});
  }
  rtcCurrentApptId = null;
}

function rtcSetStatus(text){
  const el = document.getElementById('rtc-status');
  if(el) el.textContent = text;
}

// localVideoElId/remoteVideoElId are the <video> element ids already in the
// DOM for the console currently rendering the call (patient or doctor side).
async function rtcJoinCall(apptId, localVideoElId, remoteVideoElId){
  if(rtcCurrentApptId===apptId) return; // already joined (or joining) this same call — rtcHangUp() clears this to allow a fresh join
  rtcTeardown();
  rtcCurrentApptId = apptId;

  let stream;
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:true, audio:true});
  }catch(e){
    rtcSetStatus('Camera/mic unavailable — check permissions.');
    showToast('Camera/mic blocked', 'Allow camera and microphone access in your browser to join the video call.', 'danger');
    return;
  }
  rtcLocalStream = stream;
  const localEl = document.getElementById(localVideoElId);
  if(localEl){ localEl.srcObject = stream; localEl.play && localEl.play().catch(()=>{}); }

  if(!fbEnabled){
    rtcSetStatus('Local preview only — live sync isn\'t connected on this device, so this call can\'t reach the other side.');
    return;
  }

  rtcSetStatus('Connecting…');
  const pc = new RTCPeerConnection(RTC_ICE_SERVERS);
  rtcPeerConnection = pc;
  stream.getTracks().forEach(t=>pc.addTrack(t, stream));
  const remoteStream = new MediaStream();
  const remoteEl = document.getElementById(remoteVideoElId);
  if(remoteEl) remoteEl.srcObject = remoteStream;
  pc.ontrack = (event)=>{
    event.streams[0].getTracks().forEach(t=>remoteStream.addTrack(t));
    if(remoteEl) remoteEl.play && remoteEl.play().catch(()=>{});
  };
  pc.onconnectionstatechange = ()=>{
    if(pc.connectionState==='connected') rtcSetStatus('Connected');
    else if(pc.connectionState==='disconnected' || pc.connectionState==='failed') rtcSetStatus('Connection lost — try re-joining.');
  };

  // BUGFIX: this whole signaling exchange (get/set on callRef, the candidate
  // writes below) used to run with no try/catch and no .catch() at either call
  // site (postRenderHooks' p-tele/d-appts blocks call rtcJoinCall() fire-and-
  // forget). A rejected promise here — most commonly Firestore denying the
  // read/write because arogya_rooms/{roomId}/calls/{apptId} had no security
  // rule at all — became a silent unhandled rejection: the screen just sat on
  // "Connecting…" forever with no toast and nothing in the UI to explain why.
  // Wrapping it means a failure here now visibly says so and resets state so
  // re-joining (leaving and re-entering the call screen) can try again, instead
  // of leaving rtcCurrentApptId pointing at a half-set-up call that
  // rtcJoinCall's own "already joined" guard would otherwise block forever.
  try{
    const callRef = rtcCallDocRef(apptId);
    const snap = await callRef.get();

    if(!snap.exists || !snap.data().offer){
      // We're first here — become the caller.
      const callerCandidates = callRef.collection('callerCandidates');
      pc.onicecandidate = (e)=>{ if(e.candidate) callerCandidates.add(e.candidate.toJSON()).catch(e2=>console.warn('ICE candidate write failed', e2)); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await callRef.set({offer:{sdp:offer.sdp, type:offer.type}, updatedAt: Date.now()}, {merge:true});
      rtcSetStatus('Waiting for the other side to join…');
      rtcCallUnsub = callRef.onSnapshot(async docSnap=>{
        const data = docSnap.data();
        if(data && data.answer && pc.signalingState!=='stable' && !pc.currentRemoteDescription){
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(e2=>console.warn('setRemoteDescription (answer) failed', e2));
        }
      }, e=>{ rtcSetStatus('Connection lost — try re-joining.'); console.warn('Call doc listener failed', e); });
      rtcCandidateUnsubs.push(callRef.collection('calleeCandidates').onSnapshot(qs=>{
        qs.docChanges().forEach(ch=>{ if(ch.type==='added') pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(e2=>console.warn('addIceCandidate failed', e2)); });
      }, e=>console.warn('Callee candidates listener failed', e)));
    } else {
      // An offer is already waiting — become the callee.
      const data = snap.data();
      const calleeCandidates = callRef.collection('calleeCandidates');
      pc.onicecandidate = (e)=>{ if(e.candidate) calleeCandidates.add(e.candidate.toJSON()).catch(e2=>console.warn('ICE candidate write failed', e2)); };
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await callRef.set({answer:{sdp:answer.sdp, type:answer.type}, updatedAt: Date.now()}, {merge:true});
      rtcCandidateUnsubs.push(callRef.collection('callerCandidates').onSnapshot(qs=>{
        qs.docChanges().forEach(ch=>{ if(ch.type==='added') pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(e2=>console.warn('addIceCandidate failed', e2)); });
      }, e=>console.warn('Caller candidates listener failed', e)));
    }
  }catch(e){
    console.warn('Video call signaling failed for appointment', apptId, e);
    const deniedLikely = String((e && e.code) || (e && e.message) || '').toLowerCase().includes('permission');
    rtcSetStatus(deniedLikely ? 'Could not connect — sync permission denied.' : 'Could not connect — check your connection and try again.');
    showToast('Call failed to connect', deniedLikely ? 'The signaling channel was blocked (Firestore permissions). Ask your admin to check firestore.rules.' : 'Something interrupted the connection — try re-joining.', 'danger');
    rtcTeardown();
    rtcCurrentApptId = null; // clears the "already joined" guard so re-entering this screen can retry
  }
}

function rtcToggleMic(btn){
  if(!rtcLocalStream) return;
  const track = rtcLocalStream.getAudioTracks()[0];
  if(!track) return;
  track.enabled = !track.enabled;
  btn.classList.toggle('off', !track.enabled);
  btn.innerHTML = `<i class="fa-solid ${track.enabled?'fa-microphone':'fa-microphone-slash'}"></i>`;
}
function rtcToggleCam(btn){
  if(!rtcLocalStream) return;
  const track = rtcLocalStream.getVideoTracks()[0];
  if(!track) return;
  track.enabled = !track.enabled;
  btn.classList.toggle('off', !track.enabled);
  btn.innerHTML = `<i class="fa-solid ${track.enabled?'fa-video':'fa-video-slash'}"></i>`;
}

// Shared markup for both the patient and doctor call screens — peerLabel is
// the other participant's display name, endFn is the console-specific hang-up
// function name ('endCall' for patient, 'doctorEndCall' for doctor).
function videoCallHtml(peerLabel, endFn){
  return `<div class="video-call">
    <span class="call-status" id="rtc-status"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:6px;animation:pulse 1.4s infinite;"></span>Connecting…</span>
    <video id="rtc-remote-video" autoplay playsinline></video>
    <video id="rtc-local-video" autoplay playsinline muted></video>
    <div style="position:absolute;top:14px;right:14px;left:14px;text-align:right;color:#fff;font-size:.78rem;text-shadow:0 1px 4px rgba(0,0,0,.6);">${peerLabel}</div>
    <div class="video-controls">
      <button id="rtc-mic-btn" onclick="rtcToggleMic(this)"><i class="fa-solid fa-microphone"></i></button>
      <button id="rtc-cam-btn" onclick="rtcToggleCam(this)"><i class="fa-solid fa-video"></i></button>
      <button class="end" onclick="${endFn}()"><i class="fa-solid fa-phone-slash"></i></button>
    </div>
  </div>
  <p style="font-size:.76rem;color:var(--text-muted);text-align:center;margin:10px 0 0;"><i class="fa-solid fa-lock"></i> This is a real, live peer-to-peer video call (WebRTC) — not a recording or simulation. Allow camera/microphone access when your browser asks, and keep this tab open until the call ends.</p>`;
}

// Multiple Firestore keys can update within the same instant (e.g. an ambulance
// moving updates both 'responders' and 'incidents'). Batch those into a single
// screen refresh instead of re-rendering once per key, and prefer a lightweight
// in-place update over a full teardown/rebuild for map-bearing views.
let remoteRefreshTimer = null;
function scheduleRemoteRefresh(){
  enforceRevokedEmailLockout();
  if(!currentRole) return;
  if(remoteRefreshTimer) clearTimeout(remoteRefreshTimer);
  remoteRefreshTimer = setTimeout(()=>{
    remoteRefreshTimer = null;
    softRefreshCurrentView();
    refreshBell();
  }, 300);
}

/* ---- Revoked-account blocklist ------------------------------------------
   Firebase Auth accounts can't be force-deleted from a browser-only client
   (that needs the Admin SDK, i.e. a server). This blocklist is the practical
   substitute: an admin-deleted email is added here, and every login path AND
   every already-open session (via enforceRevokedEmailLockout, called on
   every remote sync tick) checks it — so the account is fully locked out of
   the app everywhere, even though the underlying Auth credential technically
   still exists. */
function normEmail(email){ return (email||'').trim().toLowerCase(); }
function isEmailRevoked(email){
  const clean = normEmail(email);
  if(!clean) return false;
  return (db('revokedEmails')||[]).some(r=>r.email===clean);
}
function revokeEmailEverywhere(email, role, reason){
  const clean = normEmail(email);
  const list = db('revokedEmails')||[];
  if(!list.some(r=>r.email===clean)){
    list.push({email: clean, role, reason: reason||'Account deleted by admin', revokedAt: now()});
    dbSet('revokedEmails', list);
  }
}
function unrevokeEmail(email){
  const clean = normEmail(email);
  const list = db('revokedEmails')||[];
  const kept = list.filter(r=>r.email!==clean);
  if(kept.length!==list.length) dbSet('revokedEmails', kept);
}
function currentSessionEmail(){
  if(currentRole==='patient') return (patientAuthData && patientAuthData.loggedEmail) || null;
  return (roleAuthData && roleAuthData.loggedEmail) || null;
}
// Runs on every remote sync tick (scheduleRemoteRefresh fires on any Firestore
// update, including to 'revokedEmails' itself). If THIS device's own active
// session's email has just been revoked — e.g. an admin deleted the account
// from a different device while this one stayed open — force sign-out right
// away instead of waiting for a manual refresh. This is what makes deletion
// take effect "everywhere", not just on next login.
function enforceRevokedEmailLockout(){
  if(!currentRole) return;
  const email = currentSessionEmail();
  if(email && isEmailRevoked(email)) forceSignOutRevoked();
}
async function forceSignOutRevoked(){
  clearActiveSession();
  teardownPrivateAccountSync();
  teardownPhase1bApptRxSync();
  stopDeliveryBoyLiveTracking();
  const fa = fbAuth();
  if(fa) await fa.signOut().catch(()=>{});
  currentRole = null;
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
  showToast('Account deactivated', 'This account was deactivated by an administrator. You have been logged out.', 'danger');
}
function softRefreshCurrentView(){
  if(currentView==='p-sos'){
    const inc=currentIncident();
    if(inc){
      if(!document.getElementById('sos-stepper')){ renderCurrentView('p-sos'); return; }
      patchActiveSosTracking(inc); initSosMapIfNeeded(true); return;
    }
    // No incident yet — if the patient is mid-flow (picked report type, is waiting on
    // GPS, or has already chosen a severity and is about to tap "Confirm & Dispatch"),
    // that entire in-progress form lives only in the DOM (#severity-picker-slot) and in
    // window.__report/__sev. A full renderCurrentView('p-sos') here would wipe it back to
    // a blank SOS button, which is why "Confirm & Dispatch" used to sometimes silently do
    // nothing — a background sync refresh landed between picking severity and tapping
    // the button and reset the screen out from under the user. Nothing here is urgent
    // enough to justify blowing that away, so just skip the refresh whenever we still
    // have the in-memory state. (window.__report/__sev are also mirrored into
    // localStorage as they change — see persistInProgressSOS/rehydrateInProgressSOS —
    // so even if this guard is bypassed, e.g. state got cleared by something else
    // entirely, the p-sos screen can rebuild the exact step the user was on instead
    // of dropping them back to a blank button.)
    if(window.__report) return;
  }
  if(currentView==='r-active'){
    const inc=db('incidents').find(i=>i.assignedResponderId===CURRENT_RESPONDER_ID && i.status!=='closed');
    if(inc){
      if(!document.getElementById('resp-dynamic-card')){ renderCurrentView('r-active'); return; }
      patchResponderActive(inc); initResponderMap(true); return;
    }
  }
  if(currentView==='po-feed'){
    const incidentsNow = myStationIncidents();
    const hasMapEl = !!document.getElementById('leaflet-map-box');
    if(!document.getElementById('police-feed-list') || (incidentsNow.length>0) !== hasMapEl){ renderCurrentView('po-feed'); }
    else { patchPoliceFeed(); }
    initPoliceMap(true);
    return;
  }
  // Fallback for every screen that isn't one of the special-cased ones above
  // (dashboard, fitness, nutrition, vitals, women's health, records, etc).
  // This runs on every background sync tick — any change to fitness, cycle,
  // pregnancy, nutrition, vitals, medsTools, documents, reminders, claims or
  // insurance data reaches here via scheduleRemoteRefresh(), which is most of
  // the app.
  // .content-area (#app-content-area) is the real scroll container now
  // (#app-shell/.app-container are fixed-height with overflow:hidden), so a
  // background refresh needs to save/restore ITS scrollTop, not the
  // window's — the window itself no longer scrolls at all.
  const scrollBox = document.getElementById('app-content-area');
  const savedScroll = scrollBox ? scrollBox.scrollTop : 0;
  renderCurrentView(currentView);
  if(scrollBox) scrollBox.scrollTop = savedScroll;
}

function initializeDataStore(){
  if(!db('hospitals')) dbSet('hospitals', SEED.hospitals);
  if(!db('responders')) dbSet('responders', SEED.responders);
  if(!db('police')) dbSet('police', SEED.police);
  if(!db('doctors')) dbSet('doctors', SEED.doctors);
  if(!db('pharmacies')) dbSet('pharmacies', SEED.pharmacies);
  if(!db('incidents')) dbSet('incidents', []);
  if(!db('notifications')) dbSet('notifications', []);
  if(!db('audit')) dbSet('audit', []);
  // Blank scaffold only — real values are written by loadActiveMemberIntoProfile()
  // the moment an actual patient account signs up or logs in.
  if(!db('profile')) dbSet('profile', {name:'', gender:'', phone:'', bloodGroup:'', allergies:'', chronic:'', emergencyContact:'', lat:null, lng:null, aadhaarNumber:''});
  else { const pr = db('profile'); if(pr.aadhaarNumber===undefined){ pr.aadhaarNumber=''; dbSet('profile', pr); } }
  if(!db('appointments')) dbSet('appointments', []);
  if(!db('prescriptions')) dbSet('prescriptions', []);
  if(!db('reminders')) dbSet('reminders', []);
  if(!db('cycle')) dbSet('cycle', {pinLock:'', entries:{}}); // unlocked state is intentionally NOT persisted here — see cycSessionUnlocked
  else {
    // migrate legacy shape {logs:[...]} -> {entries:{memberId:{days:{...}}}}
    const c = db('cycle');
    if(!c.entries){
      c.entries = {};
      if(Array.isArray(c.logs) && c.logs.length){
        c.entries.ME = {days:{}};
        c.logs.forEach(d=>{ c.entries.ME.days[d] = {flow:'medium', symptoms:[], mood:'', notes:''}; });
      }
      delete c.logs;
      dbSet('cycle', c);
    }
  }
  if(!db('claims')) dbSet('claims', []);
  // Keyed by patient memberId ('_walkin' = hospital front-desk demo screen, which
  // has no real patient context of its own) so one account's/member's verification
  // status and claims never leak into another's — see getInsuranceRecord() below.
  if(!db('insurance')) dbSet('insurance', {});
  if(!db('documents')) dbSet('documents', []);
  if(!db('aadhaarDirectory')) dbSet('aadhaarDirectory', {});
  if(!db('accessGrants')) dbSet('accessGrants', []);
  // Per-pharmacy stock: each item tagged with pharmacyId (same pattern as
  // 'doctors' being tagged with a hospital id) so every pharmacy only ever
  // sees and edits its own stock, even though it's one shared collection.
  if(!db('pharmacyInventory')) dbSet('pharmacyInventory', []);
  // Generated tax invoices — kept even after stock is deducted so a bill can
  // always be reprinted later from "Recent bills".
  if(!db('pharmacyBills')) dbSet('pharmacyBills', []);
  // Keyed by stationId, same pattern as insurance — otherwise the most recent
  // police login anywhere in the room overwrites every other officer's name/
  // badge/station/phone shown on their own session.
  if(!db('policeProfile')) dbSet('policeProfile', {});
  if(!db('auth')) dbSet('auth', {verified:false, consent:false});
}
initializeDataStore();

function audit(actor, action, detail){
  const a = db('audit');
  const entry = {id:uid('LOG'), ts:now(), actor, action, detail};
  a.unshift(entry);
  dbSet('audit', a.slice(0,300));
  persistAuditEntry(entry);
}
// PHASE 1E: each entry writes straight to its own actor's partition
// (/audit/{actor}/entries/{id}) instead of the shared room doc every device
// was downloading in full — see the LEGACY_LIVE_KEYS/StorageAdapter.set note.
// Entries are immutable once written (per the Audit Trail's own "immutable
// ... log" description), so this is just a one-time set per entry, no
// diffing or deletes needed, unlike Phase 1b/c's mutable records.
function persistAuditEntry(entry){
  if(!fbEnabled || typeof firebase==='undefined' || !entry || !entry.actor) return;
  try{
    firebase.firestore().collection('audit').doc(entry.actor).collection('entries').doc(entry.id).set(entry)
      .catch(e=>console.warn('Audit entry write failed', e));
  }catch(e){ console.warn('Audit entry write failed', e); }
}
// One-time fetch of an actor's own audit history (called when a role's console
// opens — see enterConsole()), merged into the local buffer other roles'
// audit() calls also write into on this same device. Not a live listener:
// an audit trail is reviewed after the fact, not something that needs to
// update mid-session the instant another device logs something.
function initAuditSync(actorKey){
  if(!fbEnabled || typeof firebase==='undefined' || !actorKey) return;
  firebase.firestore().collection('audit').doc(actorKey).collection('entries')
    .orderBy('ts','desc').limit(200).get().then(snap=>{
      if(snap.empty) return;
      const remote = snap.docs.map(d=>d.data());
      const local = db('audit')||[];
      const seen = new Set(local.map(e=>e.id));
      const merged = local.concat(remote.filter(e=>!seen.has(e.id))).sort((a,b)=>b.ts-a.ts).slice(0,300);
      LOCAL_CACHE['audit'] = merged;
      try{ localStorage.setItem('abot2_audit', JSON.stringify(merged)); }catch(e){}
      if(currentRole) softRefreshCurrentView();
    }).catch(e=>console.warn('Audit sync fetch failed for', actorKey, e));
}
