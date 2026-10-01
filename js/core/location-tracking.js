/* ============================================================
   LIVE LOCATION TRACKING (all roles)
   ------------------------------------------------------------
   Ambulances and patients move, so those two get a continuous
   navigator.geolocation.watchPosition() feed that keeps their
   record's lat/lng current — this is what nearest-ambulance
   matching and the live map should be driven by. Hospitals and
   police stations are fixed addresses; for those we just take a
   one-time GPS fix at login to confirm/correct their pinned
   location rather than continuously "tracking" a building.
   Each role explicitly grants browser location permission the
   first time this runs — nothing is captured silently.
   ============================================================ */
let geoWatchIds = {};
function beginLiveLocationTracking(kind){
  if(!navigator.geolocation){
    showToast('Location unavailable', 'This browser/device doesn\'t support GPS — live tracking is off for this session.', 'danger');
    return;
  }
  if(geoWatchIds[kind]!=null) return; // already watching
  geoWatchIds[kind] = navigator.geolocation.watchPosition(
    pos => applyLiveLocation(kind, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    err => {
      console.warn('['+kind+'] location watch error:', err && err.message);
      if(err && err.code===1){ // PERMISSION_DENIED
        showToast('Location permission needed', 'Turn on location access for this site in your browser settings — it\'s how we place you accurately and match the nearest ambulance.', 'danger');
      }
    },
    {enableHighAccuracy:true, maximumAge:5000, timeout:15000}
  );
}
function stopLiveLocationTracking(kind){
  if(geoWatchIds[kind]!=null){ navigator.geolocation.clearWatch(geoWatchIds[kind]); delete geoWatchIds[kind]; }
}
function stopAllLiveLocationTracking(){
  Object.keys(geoWatchIds).forEach(stopLiveLocationTracking);
}
async function captureOneTimeLocation(kind){
  const loc = await getDeviceLocation();
  if(loc) applyLiveLocation(kind, loc.lat, loc.lng, loc.accuracy);
  else showToast('Location permission needed', 'Turn on location access for this site so we can confirm your facility\'s position.', 'danger');
}
// Live GPS location during an active SOS now PATCHes through to the Worker's
// existing generic /update endpoint (the same one widenEscalatedIncident()
// below already uses for other partial-field patches) instead of writing to
// the old Firestore mirror — see the PHASE 1D note on StorageAdapter.set.
// Throttled client-side (watchPosition can fire every couple of seconds)
// so a moving patient isn't sending the Worker a request per GPS tick; the
// most recent fix within a throttle window still goes out via the trailing
// timer, it's coalesced rather than dropped.
const INCIDENT_LOC_THROTTLE_MS = 6000;
let __incLocLastSentAt = {};
let __incLocPendingTimer = {};
function pushIncidentLocationUpdate(incId, lat, lng, accuracy){
  const send = ()=>{
    __incLocLastSentAt[incId] = Date.now();
    sosApi(`/api/sos/${incId}/update`, { patch: { lat, lng, locationAccuracy: accuracy } })
      .then(({incident})=>handleIncidentEvent('incident_location_updated', incident))
      .catch(e=>{
        if(e && e.status===404) dropUnknownLocalIncident(incId); // Worker's never heard of it — see note above
        else console.warn('Live location patch failed for', incId, e);
      });
  };
  const wait = INCIDENT_LOC_THROTTLE_MS - (Date.now() - (__incLocLastSentAt[incId]||0));
  if(wait<=0){ send(); return; }
  clearTimeout(__incLocPendingTimer[incId]);
  __incLocPendingTimer[incId] = setTimeout(send, wait);
}
function applyLiveLocation(kind, lat, lng, accuracy){
  const acc = Math.round(accuracy||0);
  if(kind==='responder' && CURRENT_RESPONDER_ID){
    const list = db('responders');
    const r = list.find(x=>x.id===CURRENT_RESPONDER_ID);
    if(r){ r.lat=lat; r.lng=lng; r.locAccuracy=acc; dbSet('responders', list); }
  } else if(kind==='patient'){
    const profile = db('profile');
    if(profile){ profile.lat=lat; profile.lng=lng; profile.locAccuracy=acc; dbSet('profile', profile); }
    // Keep an in-progress SOS's pin live too, so responders/hospital/police see the reporter actually moving.
    const inc = currentIncident();
    if(inc && inc.status!=='closed') pushIncidentLocationUpdate(inc.id, lat, lng, acc);
  } else if(kind==='hospital' && CURRENT_HOSPITAL_ID){
    const list = db('hospitals');
    const h = list.find(x=>x.id===CURRENT_HOSPITAL_ID);
    if(h){ h.lat=lat; h.lng=lng; dbSet('hospitals', list); }
  } else if(kind==='police' && CURRENT_POLICE_STATION_ID){
    const list = db('police');
    const p = list.find(x=>x.id===CURRENT_POLICE_STATION_ID);
    if(p){ p.lat=lat; p.lng=lng; dbSet('police', list); }
  } else if(kind==='pharmacy' && CURRENT_PHARMACY_ID){
    const list = db('pharmacies');
    const ph = list.find(x=>x.id===CURRENT_PHARMACY_ID);
    if(ph){ ph.lat=lat; ph.lng=lng; dbSet('pharmacies', list); }
  } else if(kind==='delivery' && CURRENT_DELIVERY_ID){
    const list = db('deliveryBoys')||[];
    const bwy = list.find(x=>x.id===CURRENT_DELIVERY_ID);
    if(bwy){ bwy.lat=lat; bwy.lng=lng; bwy.locAccuracy=acc; dbSet('deliveryBoys', list); }
  }
}

function mapsLink(lat,lng){ return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`; }
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function etaMinutes(km, speedKmh=32){ return Math.max(2, Math.round(km/speedKmh*60)); }

/* Nearest-ambulance matching: broadcast to EVERY available unit within 5km first
   (not just the closest few — a unit at 4.9km must never be silently skipped just
   because 3 others happen to be slightly closer). If nobody at all is available
   within 5km, widen once to 10km; if still nothing, fall back to the closest
   available unit anywhere so a case never gets stranded. Returns every matching
   unit plus the radius tier that was actually used (null when we had to fall back
   beyond 10km). The *time-based* escalation — pulling in the 5-10km ring if nobody
   in the initial batch accepts within 60s — is handled server-side by the SOS
   Worker's alarm(), with the client-side widening reaction in
   widenEscalatedIncident() below. */
function findNearbyAvailableResponders(lat, lng, fallbackCount=3){
  const RADIUS_TIERS_KM = [5, 10];
  const available = (db('responders')||[]).filter(r=>r.status==='available')
    .map(r=>({...r, distKm: haversineKm(lat,lng,r.lat,r.lng)}))
    .sort((a,b)=>a.distKm-b.distKm);
  for(const radiusKm of RADIUS_TIERS_KM){
    const within = available.filter(r=>r.distKm<=radiusKm);
    if(within.length>0) return {responders: within, radiusKm};
  }
  return {responders: available.slice(0,fallbackCount), radiusKm: null};
}

// How long we wait for someone in the initial notified batch to accept before
// pulling in additional available ambulances out to 10km. Mirrors ESCALATE_AFTER_MS
// in the SOS Worker (sosHub.js) — the Worker's alarm() is what actually fires the
// escalation now (real, server-side, fires whether any device is open or not);
// this constant is only used client-side for the *widening* follow-up (see
// widenEscalatedIncident() below), since only the client has the responder
// location data needed to compute the wider match.
const SOS_ESCALATE_AFTER_MS = 60*1000;
