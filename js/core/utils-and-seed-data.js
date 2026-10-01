/* ============================================================
   CONFIG + SEED DATA (simulated backend)
   ============================================================ */
const BASE = { lat: 28.6139, lng: 77.2090 }; // New Delhi reference point
const now = () => Date.now();
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const rnd = (a,b) => Math.random()*(b-a)+a;
// Old version used only a 5-char random suffix (36^5 ≈ 60M combinations), which by
// the birthday paradox has a ~95%+ chance of a collision somewhere in 20,000 IDs —
// a real risk at this app's target scale. Adding a base36 timestamp component means
// two IDs can only collide if they're generated in the same millisecond AND the
// random part also matches, which is astronomically less likely.
const uid = (p) => p + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,7).toUpperCase();
// Escapes a value for safe use inside an HTML attribute (value="..."), so a medicine
// name or note containing a quote can't break out of the attribute it's placed in.
function attr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

function getDeviceLocation(){
  return new Promise(resolve=>{
    if(!navigator.geolocation){ resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos=>resolve({lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:Math.round(pos.coords.accuracy||0)}),
      ()=>resolve(null),
      {enableHighAccuracy:true, timeout:8000, maximumAge:0}
    );
  });
}
