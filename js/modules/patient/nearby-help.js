/* ============================================================
   PATIENT — NEARBY HELP (live-location aware, Google Maps links)
   ============================================================ */
function nearbyHelpCard(){
  const profile = db('profile')||{};
  const lat = profile.lat, lng = profile.lng;
  if(lat==null || lng==null){
    return `<div class="card">
      <h3 style="margin-top:0;">Nearby help right now</h3>
      <p style="color:var(--text-muted);font-size:.85rem;">We don't have a location on file yet.</p>
      <button class="btn btn-secondary btn-sm" onclick="refreshNearbyWithGPS()"><i class="fa-solid fa-location-crosshairs"></i> Use my live location</button>
    </div>`;
  }
  // Only show units genuinely within range — no padding the list out to 3/2 with
  // whatever's left in the database regardless of distance. A unit 1000km away
  // isn't "nearby help right now", so it's better to show fewer results (or none)
  // than to mislabel something far away as close by.
  const NEARBY_RADIUS_KM = 15;
  const responders = (db('responders')||[]).filter(r=>r.status==='available')
    .map(r=>({...r, distKm:haversineKm(lat,lng,r.lat,r.lng)}))
    .filter(r=>r.distKm<=NEARBY_RADIUS_KM)
    .sort((a,b)=>a.distKm-b.distKm).slice(0,3);
  const police = (db('police')||[])
    .map(p=>({...p, distKm:haversineKm(lat,lng,p.lat,p.lng)}))
    .filter(p=>p.distKm<=NEARBY_RADIUS_KM)
    .sort((a,b)=>a.distKm-b.distKm).slice(0,2);
  const row = (name, sub, plat, plng) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
    <span style="font-size:.85rem;">${name}<br><span style="color:var(--text-muted);">${sub}</span></span>
    <a href="${mapsLink(plat,plng)}" target="_blank" class="btn btn-sm btn-secondary" title="Get directions"><i class="fa-solid fa-diamond-turn-right"></i></a>
  </div>`;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
      <h3 style="margin-top:0;">Nearby help right now</h3>
      <button class="btn btn-secondary btn-sm" onclick="refreshNearbyWithGPS()"><i class="fa-solid fa-location-crosshairs"></i> Refresh with GPS</button>
    </div>
    <p style="color:var(--text-muted);font-size:.78rem;margin:-8px 0 12px;">Based on your last known location, within ${NEARBY_RADIUS_KM}km — updates automatically once an SOS is active.</p>
    <strong style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">Ambulances</strong>
    ${responders.length ? responders.map(r=>row(r.name+' · '+r.vehicle, r.distKm.toFixed(1)+' km · ETA '+etaMinutes(r.distKm)+' min', r.lat, r.lng)).join('') : `<p style="color:var(--text-muted);font-size:.85rem;">None available within ${NEARBY_RADIUS_KM}km right now.</p>`}
    <strong style="font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);display:block;margin-top:14px;">Police stations</strong>
    ${police.length ? police.map(p=>row(p.name, p.distKm.toFixed(1)+' km · ETA '+etaMinutes(p.distKm)+' min', p.lat, p.lng)).join('') : `<p style="color:var(--text-muted);font-size:.85rem;">None found within ${NEARBY_RADIUS_KM}km.</p>`}
  </div>`;
}
async function refreshNearbyWithGPS(){
  const loc = await getDeviceLocation();
  if(!loc){ showToast('Location unavailable', 'Could not get a GPS fix — showing your last known location instead.', 'danger'); return; }
  const p = db('profile')||{};
  p.lat = loc.lat; p.lng = loc.lng;
  dbSet('profile', p);
  if(typeof persistActiveProfileBackToMember==='function') persistActiveProfileBackToMember();
  showToast('Location updated', 'Nearby ambulances and police recalculated from your current GPS position.', 'success');
  if(currentView==='p-dash') renderCurrentView('p-dash');
}
