/* ============================================================
   LEAFLET MAPS
   ============================================================ */
let mapInstance = null, mapMarkers = {}, routeFetchGen = 0;
function cleanupMap(){ if(mapInstance){ mapInstance.remove(); mapInstance=null; mapMarkers={}; } routeFetchGen++; }
function ensureMap(){
  const el = document.getElementById('leaflet-map-box'); if(!el) return null;
  if(mapInstance){ mapInstance.remove(); mapInstance=null; }
  mapInstance = L.map(el, {zoomControl:true}).setView([BASE.lat, BASE.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18}).addTo(mapInstance);
  return mapInstance;
}
function icon(color){ return L.divIcon({className:'', html:`<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>`, iconSize:[16,16]}); }
function drawRoute(pts, color, etaElId){
  if(mapMarkers.route){ mapInstance.removeLayer(mapMarkers.route); mapMarkers.route=null; }
  if(pts.length>1){
    // Straight-line placeholder, shown immediately while the real road route loads.
    mapMarkers.route = L.polyline(pts, {color: color||'#0d9488', weight:4, opacity:.6, dashArray:'9,9'}).addTo(mapInstance);
  } else {
    return;
  }
  const myGen = ++routeFetchGen;
  const totalKm = pts.slice(1).reduce((sum,p,i)=>sum+haversineKm(pts[i][0],pts[i][1],p[0],p[1]),0);
  if(etaElId){
    const el = document.getElementById(etaElId);
    if(el) el.innerHTML = `<i class="fa-solid fa-route"></i> ~${etaMinutes(totalKm)} min (straight-line estimate, finding real route…)`;
  }
  fetchRoadRoute(pts).then(real=>{
    if(myGen!==routeFetchGen || !mapInstance) return; // view changed or map torn down before this resolved
    if(mapMarkers.route){ mapInstance.removeLayer(mapMarkers.route); mapMarkers.route=null; }
    if(real){
      mapMarkers.route = L.polyline(real.coords, {color: color||'#0d9488', weight:5, opacity:.85}).addTo(mapInstance);
      if(etaElId){
        const el = document.getElementById(etaElId);
        if(el) el.innerHTML = `<i class="fa-solid fa-route"></i> ${real.distanceKm.toFixed(1)} km by road · ETA ${real.durationMin} min`;
      }
    } else {
      // Road routing unreachable — keep a straight-line placeholder rather than leaving no route at all.
      mapMarkers.route = L.polyline(pts, {color: color||'#0d9488', weight:4, opacity:.6, dashArray:'9,9'}).addTo(mapInstance);
      if(etaElId){
        const el = document.getElementById(etaElId);
        if(el) el.innerHTML = `<i class="fa-solid fa-route"></i> ~${etaMinutes(totalKm)} min (straight-line estimate — live routing unavailable)`;
      }
    }
  });
}
function initSosMapIfNeeded(update){
  const inc = currentIncident(); if(!inc) return;
  if(!mapInstance || !update){ ensureMap(); }
  if(!mapInstance) return;
  const pts = [];
  mapMarkers.patient && mapInstance.removeLayer(mapMarkers.patient);
  mapMarkers.patient = L.marker([inc.lat,inc.lng], {icon: icon('#0d9488')}).addTo(mapInstance).bindPopup('You');
  if(inc.assignedResponderId){
    const r = db('responders').find(x=>x.id===inc.assignedResponderId);
    mapMarkers.resp && mapInstance.removeLayer(mapMarkers.resp);
    mapMarkers.resp = L.marker([r.lat,r.lng], {icon: icon('#ef4444')}).addTo(mapInstance).bindPopup(r.name);
    pts.push([r.lat,r.lng]);
  }
  pts.push([inc.lat, inc.lng]);
  if(inc.assignedHospitalId){
    const h = db('hospitals').find(x=>x.id===inc.assignedHospitalId);
    mapMarkers.hosp && mapInstance.removeLayer(mapMarkers.hosp);
    mapMarkers.hosp = L.marker([h.lat,h.lng], {icon: icon('#2563eb')}).addTo(mapInstance).bindPopup(h.name);
    pts.push([h.lat,h.lng]);
  }
  drawRoute(pts, '#0d9488', 'sos-live-eta');
  if(pts.length>1) mapInstance.fitBounds(pts, {padding:[40,40]});
}
function initResponderMap(update){
  const inc = db('incidents').find(i=>i.assignedResponderId===CURRENT_RESPONDER_ID && i.status!=='closed'); if(!inc) return;
  if(!mapInstance || !update){ ensureMap(); }
  if(!mapInstance) return;
  const r = db('responders').find(x=>x.id===CURRENT_RESPONDER_ID);
  const pts = [[r.lat,r.lng],[inc.lat,inc.lng]];
  mapMarkers.resp && mapInstance.removeLayer(mapMarkers.resp);
  mapMarkers.resp = L.marker([r.lat,r.lng], {icon: icon('#ef4444')}).addTo(mapInstance).bindPopup('You');
  mapMarkers.patient && mapInstance.removeLayer(mapMarkers.patient);
  mapMarkers.patient = L.marker([inc.lat,inc.lng], {icon: icon('#0d9488')}).addTo(mapInstance).bindPopup('Patient');
  if(inc.assignedHospitalId){
    const h = db('hospitals').find(x=>x.id===inc.assignedHospitalId);
    mapMarkers.hosp && mapInstance.removeLayer(mapMarkers.hosp);
    mapMarkers.hosp = L.marker([h.lat,h.lng], {icon: icon('#2563eb')}).addTo(mapInstance).bindPopup(h.name);
    pts.push([h.lat,h.lng]);
  }
  drawRoute(pts, '#ef4444', 'resp-live-eta');
  mapInstance.fitBounds(pts, {padding:[40,40]});
}
// Patient-facing live delivery tracker — shows the assigned delivery boy's
// live GPS position (updated by their own beginLiveLocationTracking('delivery')
// while their console is open) plus the patient's own pin, with a route and
// ETA between them. Only called from postRenderHooks when p-rx has an active
// 'out_for_delivery' order and the #leaflet-map-box element is present.
function initDeliveryTrackingMap(rx){
  const boy = (db('deliveryBoys')||[]).find(x=>x.id===rx.deliveryBoyId);
  const profile = db('profile')||{};
  if(!boy || boy.lat==null || boy.lng==null || profile.lat==null || profile.lng==null) return;
  if(!mapInstance){ ensureMap(); }
  if(!mapInstance) return;
  const pts = [[boy.lat,boy.lng],[profile.lat,profile.lng]];
  mapMarkers.deliveryBoy && mapInstance.removeLayer(mapMarkers.deliveryBoy);
  mapMarkers.deliveryBoy = L.marker([boy.lat,boy.lng], {icon: icon('#f59e0b')}).addTo(mapInstance).bindPopup(boy.name+(boy.vehicle?' · '+boy.vehicle:''));
  mapMarkers.deliveryDest && mapInstance.removeLayer(mapMarkers.deliveryDest);
  mapMarkers.deliveryDest = L.marker([profile.lat,profile.lng], {icon: icon('#0d9488')}).addTo(mapInstance).bindPopup('You');
  drawRoute(pts, '#f59e0b', 'delivery-live-eta');
  mapInstance.fitBounds(pts, {padding:[40,40]});
}
// deliveryBoys is a PUBLIC_DIRECTORY_KEY now (fetch-once + manual refresh,
// no room-wide live listener — see the flicker postmortem in
// initFirebaseSync()), so the fan-out that caused the bug is gone. But a
// delivery actually in progress still needs to look live on the patient's
// screen, and now that every delivery boy has their OWN doc at
// /public/deliveryBoys/items/{id} (see phase1bDocRefs), we can subscribe to
// just that one doc instead of the old shared blob. This is continuous
// push sync, same as before — the fix isn't "stop syncing," it's "sync only
// the one record that's actually relevant, and patch only the map when it
// changes" instead of one listener for every delivery boy in the room
// driving a full renderCurrentView() on every device.
let DELIVERY_TRACK_UNSUB = null;
let DELIVERY_TRACK_ID = null;
function startDeliveryBoyLiveTracking(deliveryBoyId){
  if(DELIVERY_TRACK_ID === deliveryBoyId) return; // already subscribed to this one
  stopDeliveryBoyLiveTracking();
  if(!fbEnabled || typeof firebase==='undefined' || !deliveryBoyId) return;
  DELIVERY_TRACK_ID = deliveryBoyId;
  DELIVERY_TRACK_UNSUB = firebase.firestore()
    .collection('public').doc('deliveryBoys').collection('items').doc(String(deliveryBoyId))
    .onSnapshot(snap=>{
      if(!snap.exists) return;
      const fresh = snap.data();
      const boys = db('deliveryBoys')||[];
      const idx = boys.findIndex(b=>b.id===deliveryBoyId);
      if(idx>=0) boys[idx] = fresh; else boys.push(fresh);
      LOCAL_CACHE['deliveryBoys'] = boys;
      try{ localStorage.setItem('abot2_deliveryBoys', JSON.stringify(boys)); }catch(e){}
      // Mark this as already-synced so diffAndPersistPhase1b doesn't turn
      // around and write this device's own read straight back to Firestore
      // as if it were a local change (same guard the fetch side of
      // initPublicDirectories uses via PHASE1B_LAST_WRITE).
      const prevMap = PHASE1B_LAST_WRITE['deliveryBoys'] || new Map();
      prevMap.set(String(deliveryBoyId), phase1bClone(fresh));
      PHASE1B_LAST_WRITE['deliveryBoys'] = prevMap;
      // Patch ONLY the map — never touches the rest of #app-content-area, so
      // this can fire every couple of seconds without re-rendering the rest
      // of the prescriptions list, let alone the rest of the app.
      if(currentView==='p-rx' && document.getElementById('leaflet-map-box')){
        const rx = db('prescriptions').find(r=>r.deliveryBoyId===deliveryBoyId && r.deliveryStatus==='out_for_delivery');
        if(rx) initDeliveryTrackingMap(rx);
      }
    }, e=>console.warn('Delivery tracking listener failed', e));
}
function stopDeliveryBoyLiveTracking(){
  if(DELIVERY_TRACK_UNSUB){ try{ DELIVERY_TRACK_UNSUB(); }catch(e){} }
  DELIVERY_TRACK_UNSUB = null;
  DELIVERY_TRACK_ID = null;
}
function initPoliceMap(update){
  const incidents = myStationIncidents();
  if(!incidents.length){ cleanupMap(); return; }
  if(!mapInstance || !update){ ensureMap(); }
  if(!mapInstance) return;
  (mapMarkers.dynList||[]).forEach(l=>mapInstance.removeLayer(l));
  mapMarkers.dynList = [];
  const pts = [];
  const myGen = ++routeFetchGen;
  incidents.forEach(inc=>{
    const im = L.marker([inc.lat,inc.lng], {icon: icon('#ef4444')}).addTo(mapInstance).bindPopup(inc.id+' · '+inc.severity+' · '+incidentStatusLabel(inc.status));
    mapMarkers.dynList.push(im); pts.push([inc.lat,inc.lng]);
    if(inc.assignedResponderId){
      const r = db('responders').find(x=>x.id===inc.assignedResponderId);
      if(r){
        const rm = L.marker([r.lat,r.lng], {icon: icon('#f59e0b')}).addTo(mapInstance).bindPopup(r.name+' · '+r.vehicle);
        mapMarkers.dynList.push(rm); pts.push([r.lat,r.lng]);
        const routePts = [[r.lat,r.lng],[inc.lat,inc.lng]];
        // Straight-line placeholder, upgraded to a real road route below once fetched.
        const line = L.polyline(routePts, {color:'#f59e0b', weight:3, opacity:.75, dashArray:'7,7'}).addTo(mapInstance);
        mapMarkers.dynList.push(line);
        fetchRoadRoute(routePts).then(real=>{
          if(!real || myGen!==routeFetchGen || !mapInstance) return; // stale or map gone
          mapInstance.removeLayer(line);
          const idx = mapMarkers.dynList.indexOf(line);
          const solid = L.polyline(real.coords, {color:'#f59e0b', weight:3, opacity:.85}).addTo(mapInstance).bindPopup(`${real.distanceKm.toFixed(1)} km · ETA ${real.durationMin} min`);
          if(idx>-1) mapMarkers.dynList[idx] = solid; else mapMarkers.dynList.push(solid);
        });
      }
    }
  });
  if(pts.length) mapInstance.fitBounds(pts, {padding:[40,40]});
}
