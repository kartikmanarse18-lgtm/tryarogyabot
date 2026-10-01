/* ============================================================
   PHASE 1 — PUBLIC DIRECTORIES: fetch once, cache, manual refresh.
   hospitals/responders/police/doctors/pharmacies used to be held open
   as live onSnapshot listeners on EVERY connected device — meaning one
   hospital updating its own bed count re-rendered every patient's,
   pharmacy's, and responder's screen too. They're read-mostly reference
   data, so a one-time fetch (plus a manual "Refresh" the user can hit)
   is enough, and removes them from the live-fanout path entirely.
   Writes to these still go through the legacy shared-room path for now
   (Phase 1b denormalizes the writes themselves into /public/{type}/{id}
   sub-docs — see the migration plan).
   deliveryBoys joined this list after the same live-listener fanout bug
   showed up on it (see the postmortem in initFirebaseSync()) — its
   lat/lng changes just as often as a hospital's bed count, so it gets
   the same treatment. The difference is that a delivery in progress
   genuinely needs to look live on the patient's screen, which a fetch-
   once cache can't do on its own — see startDeliveryBoyLiveTracking() for
   how p-rx gets that: a live listener on just that one delivery boy's
   own doc, patched straight into the map, never the shared collection.
   ============================================================ */
function initPublicDirectories(){
  if(!fbEnabled || typeof firebase==='undefined') return;
  const fs = firebase.firestore();
  PUBLIC_DIRECTORY_KEYS.forEach(key=>{
    fs.collection('public').doc(key).collection('items').get().then(snap=>{
      if(!snap.empty){
        const arr = snap.docs.map(d=>d.data());
        LOCAL_CACHE[key] = arr;
        PHASE1B_LAST_WRITE[key] = new Map(arr.map(r=>[String(r.id), phase1bClone(r)]));
        try{ localStorage.setItem('abot2_'+key, JSON.stringify(arr)); }catch(e){}
      } else if(Array.isArray(LOCAL_CACHE[key]) && LOCAL_CACHE[key].length){
        // First device ever to connect — seed /public/{key}/items from our
        // local defaults (one doc per record, not one shared array doc).
        diffAndPersistPhase1b(key, LOCAL_CACHE[key]);
      }
      scheduleRemoteRefresh();
    }).catch(e=>console.warn('Public directory fetch failed for', key, e));
  });
}
// BUGFIX (responder-not-notified): PUBLIC_DIRECTORY_KEYS — 'responders'
// included — was fetch-once-then-manual-refresh ONLY. That's a fine tier for
// hospitals (bed counts) and police (near-static), but a responder's own
// `status` flips available -> busy -> available every single case (see
// acceptIncident/confirmCancelIncident/closeIncidentHospitalSide). Any other
// device (crucially, a PATIENT about to trigger an SOS) only ever saw that
// flip if a human had tapped "Refresh directory" since it happened — so a
// responder who came back online, or who freed up moments ago, silently
// never entered findNearbyAvailableResponders()'s candidate pool and so
// never made it into notifiedResponders / ever got notified, with no error
// anywhere. Root cause was a caching-tier mismatch, not a matching-logic bug.
// Fix, without reintroducing the live-listener fan-out/flicker problem this
// tier was deliberately built to avoid (see the block comment above
// initPublicDirectories()):
//   1. fetchDirectoryKeys() below is the shared fetch, split out of
//      refreshPublicDirectories() so it can be reused silently.
//   2. triggerSOSCore() and widenEscalatedIncident() now force a fresh,
//      awaited pull of exactly 'responders'+'hospitals' immediately before
//      matching (see refreshDispatchDirectories()) — the one moment where
//      stale availability data actually costs someone a dispatch.
//   3. A lightweight background poll (startResponderDirectoryPolling())
//      silently refreshes just 'responders' every 20s while any
//      dispatch-relevant role is open, so the window for this to bite is
//      seconds, not "until someone happens to hit Refresh".
function fetchDirectoryKeys(keys){
  if(!fbEnabled || typeof firebase==='undefined') return Promise.resolve();
  const fs = firebase.firestore();
  return Promise.all(keys.map(key=>
    fs.collection('public').doc(key).collection('items').get().then(snap=>{
      if(!snap.empty){
        const arr = snap.docs.map(d=>d.data());
        LOCAL_CACHE[key] = arr;
        PHASE1B_LAST_WRITE[key] = new Map(arr.map(r=>[String(r.id), phase1bClone(r)]));
        try{ localStorage.setItem('abot2_'+key, JSON.stringify(arr)); }catch(e){}
      }
    }).catch(e=>console.warn('Directory refresh failed for', key, e))
  ));
}
// Call this from a "Refresh directory" button in the UI instead of relying
// on a live listener. Cheap — costs 6 reads total, not 6 reads × every device.
function refreshPublicDirectories(){
  if(!fbEnabled || !fbRoomRef){ showToast('Offline', 'Connect to sync to refresh directories.', 'danger'); return; }
  showToast('Refreshing…', 'Pulling the latest hospitals, doctors, pharmacies, responders, and delivery riders.', 'success');
  fetchDirectoryKeys(PUBLIC_DIRECTORY_KEYS).then(()=>{
    // Re-render whatever screen is currently open so newly-added doctor slots
    // (or any other directory change) actually show up without a full page
    // reload — this is the piece that was missing: initPublicDirectories()
    // only ever updated LOCAL_CACHE, it never told the UI to re-draw.
    if(currentView) renderCurrentView(currentView);
  });
}
// Silent, awaited pull of just the two directories an SOS match actually
// depends on, right before we compute who to notify. No toast, no forced
// re-render — this runs mid-dispatch and must stay fast and quiet. Safe to
// call even when Firebase isn't configured (single-device demo mode):
// fetchDirectoryKeys() no-ops and the existing local cache is used as-is,
// exactly like before this fix.
function refreshDispatchDirectories(){
  return fetchDirectoryKeys(['responders','hospitals']);
}
let RESPONDER_DIRECTORY_POLL = null;
// Keeps the responder list from ever going stale for longer than ~20s on
// any device that might need to act on it — the patient about to trigger an
// SOS, a responder waiting on their queue, or a hospital/police console
// showing "ambulances alerted" counts. refreshDispatchDirectories() above is
// the hard guarantee at the moment an SOS actually fires; this just shrinks
// the everyday gap so the app *looks* live even though it's deliberately
// not a full onSnapshot listener (see the postmortem above
// initPublicDirectories()).
function startResponderDirectoryPolling(){
  stopResponderDirectoryPolling();
  if(!fbEnabled) return;
  RESPONDER_DIRECTORY_POLL = setInterval(()=>{
    if(['patient','responder','hospital','police'].includes(currentRole)) fetchDirectoryKeys(['responders']);
  }, 20000);
}
function stopResponderDirectoryPolling(){
  if(RESPONDER_DIRECTORY_POLL){ clearInterval(RESPONDER_DIRECTORY_POLL); RESPONDER_DIRECTORY_POLL = null; }
}
