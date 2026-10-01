/* ============================================================
   PHASE 1 — PER-ACCOUNT ISOLATION ROUTER
   Keys in PRIVATE_ACCOUNT_KEYS used to be written into the single
   shared 'arogya_rooms/{room}/state/{key}' doc just like everything
   else, even though every one of them only ever belongs to ONE
   patient account (verified by checking every read/write call site —
   none of these are ever read by another role):
     - fitness/cycle/pregnancy/nutrition/vitals/medsTools hold an
       `.entries` object keyed by currentPatientId() (family-member
       slot, e.g. 'ME') — so two DIFFERENT patient accounts sharing
       the same room and the same default slot 'ME' would silently
       overwrite each other's data.
     - documents/reminders/claims/insurance are arrays/objects filtered
       client-side by ownerId===currentPatientId() — same shared-doc
       exposure, just without the 'ME' collision risk.
   These now route to a per-authenticated-account document instead, so
   they can never collide across accounts and are never listened to
   by anyone else's device. (documents/reminders/claims/insurance were
   NOT sent through this router: prescriptions and appointments — see
   the migration plan's Phase 1b list — because those two ARE read by
   other roles too: pharmacy/delivery read prescriptions by
   targetPharmacyId/deliveryBoyId, and hospital/doctor read appointments
   by hospital/doctor name. Isolating those needs the denormalized-write
   pattern, not a simple per-uid route.)
   ============================================================ */
const PRIVATE_ACCOUNT_KEYS = ['fitness','cycle','pregnancy','nutrition','vitals','medsTools','documents','reminders','claims','insurance'];

// Keys that are read by everyone but only ever seeded/administered, not
// something a single logged-in account owns — fetched once, cached, and
// refreshed on demand instead of held open as a live listener (see
// initPublicDirectories()). PHASE 1B: writes for these now go straight to
// per-record docs at /public/{key}/items/{id} (see the PHASE 1B block
// further down) instead of the legacy shared-room path.
// deliveryBoys belongs here too, and for the same reason hospitals/
// responders/police/pharmacies do: it's read by every role in the room
// (patient tracking a delivery, pharmacy staffing a roster) but only ever
// written by one device at a time (the delivery boy's own GPS tick, or the
// pharmacy assigning/toggling someone) — see the flicker postmortem in
// initFirebaseSync() for what putting it on the legacy live-listener path
// instead actually cost. Live map updates for an in-progress delivery
// come from a live listener scoped to that one delivery boy's own
// /public/deliveryBoys/items/{id} doc (see startDeliveryBoyLiveTracking()),
// not the whole collection — same continuous push sync as before, just
// aimed at one record instead of everyone's.
const PUBLIC_DIRECTORY_KEYS = ['hospitals','responders','police','doctors','pharmacies','deliveryBoys'];

function currentAuthUid(){
  const a = fbAuth();
  return (a && a.currentUser) ? a.currentUser.uid : null;
}

// Returns the Firestore doc a given key should live at under the new
// per-account structure, or null if this key hasn't been migrated off
// the legacy shared-room path yet (see PHASE1B_PENDING_KEYS below).
function getFirestorePath(key){
  if(!fbEnabled || typeof firebase==='undefined') return null;
  const fs = firebase.firestore();
  if(PRIVATE_ACCOUNT_KEYS.includes(key)){
    const uid = currentAuthUid();
    if(!uid) return null; // not logged in via Firebase Auth yet — stay local-only
    return fs.collection('users').doc(uid).collection('data').doc(key);
  }
  return null; // not migrated yet — caller falls back to the legacy room path
}

const StorageAdapter = {
  get(key, fallback){
    if(Object.prototype.hasOwnProperty.call(LOCAL_CACHE, key)) return LOCAL_CACHE[key];
    try{
      const v = localStorage.getItem('abot2_'+key);
      if(v!==null){ const parsed = JSON.parse(v); LOCAL_CACHE[key] = parsed; return parsed; }
    }catch(e){}
    return fallback;
  },
  set(key, val){
    LOCAL_CACHE[key] = val;
    try{
      localStorage.setItem('abot2_'+key, JSON.stringify(val));
    }catch(e){
      // Quota exceeded (or private-browsing storage block) used to fail silently here —
      // the app looked fine for the rest of the session but lost the update on refresh.
      // Warn once per key per session instead of every write, so it doesn't spam the user.
      if(!STORAGE_WARNED.has('local:'+key)){
        STORAGE_WARNED.add('local:'+key);
        if(typeof showToast==='function') showToast('Storage almost full', 'This device is low on storage — some changes may not be saved after you close the app.', 'danger');
      }
    }
    if(!fbEnabled) return;

    const isolatedRef = getFirestorePath(key);
    if(isolatedRef){
      // New Phase 1 path: this key is isolated to the logged-in account only.
      const updatedAt = Date.now();
      LAST_LOCAL_WRITE_AT[key] = updatedAt;
      isolatedRef.set({data: val, updatedAt}).catch(e=>{
        console.warn('Firestore write failed for', key, e);
        if(!STORAGE_WARNED.has('remote:'+key)){
          STORAGE_WARNED.add('remote:'+key);
          if(typeof showToast==='function') showToast('Sync failed', 'Your last update may not have saved to your other devices. Check your connection.', 'danger');
        }
      });
      return;
    }

    // PHASE 1B: hospitals/responders/police/doctors/pharmacies/appointments/
    // prescriptions/deliveryBoys no longer write through the shared-room doc
    // at all. Each record is diffed against this device's last write and
    // mirrored to its own partition doc(s) — see the PHASE 1B block above
    // for the full rationale. This replaces the old
    // fbRoomRef.doc(key).set(fullArray) call for these 8 keys, which used to
    // overwrite one shared blob every time and fan the whole thing out live
    // to every connected device.
    if(PHASE1B_KEYS.includes(key) || PHASE1C_KEYS.includes(key)){
      diffAndPersistPhase1b(key, val);
      return;
    }

    // PHASE 1D: skip the shared-room mirror entirely for keys that no longer
    // need one: private account keys (no uid yet = stay local), 'notifications'
    // (routed per-scope via pushNotification/persistLocalNotifications instead
    // — this call only ever seeds the local empty-array default at boot), and
    // 'incidents'. Incidents already has a real backend — the SOS Cloudflare
    // Worker/Durable Object (see sosApi()/openSosSocket() above) — which every
    // consuming role (patient/responder/hospital/police) already gets live
    // updates from over its own WebSocket. The legacy Firestore room doc for
    // 'incidents' was pure redundant broadcast on top of that (and a real risk:
    // mirrorIncident() writes up to 2000 records into ONE doc, which could
    // exceed Firestore's 1MB-per-doc limit well before that). db('incidents')/
    // dbSet('incidents', ...) still work exactly as before as the LOCAL mirror
    // every existing render call site reads — this only stops that mirror from
    // also fanning out to Firestore, which nothing needs it to do anymore.
    // 'audit' is PHASE 1E — audit() now writes each entry straight to its own
    // /audit/{actor}/entries/{id} partition (see persistAuditEntry()) instead
    // of the whole capped 300-entry array going through here every single
    // time any role logs anything. dbSet('audit', ...) below still updates the
    // local buffer exactly as before; it just no longer also re-broadcasts
    // the entire thing to every connected device on every log line.
    // 'aadhaarDirectory' is PHASE 1F — same root problem as incidents/audit
    // (one shared object every sharing patient gets merged into, then the
    // WHOLE thing rewritten on every single share/unshare), except it also
    // caused a correctness bug, not just a size risk: syncMyAadhaarSharing()
    // read this device's local copy of the directory, added one entry, and
    // wrote the full object back — so if this device's copy hadn't caught up
    // with some OTHER patient's more recent share yet, that patient's entry
    // silently vanished from the shared doc, and a hospital looking them up
    // got "Not found" even though they'd genuinely linked and shared. Each
    // patient's entry now lives at its own /aadhaarDirectory/{aadhaar} doc
    // (see aadhaarRecordRef()), written directly by syncMyAadhaarSharing()/
    // stopMyAadhaarSharing() — no shared object, nothing to clobber. Hospital
    // lookups (hospitalRequestAccess()) fetch that one doc directly instead
    // of trusting a background-synced local cache, so it's never stale.
    // dbSet('aadhaarDirectory', ...) below still updates the local mirror
    // exactly as before, for whatever code still reads db('aadhaarDirectory')
    // as a convenience cache — it just no longer round-trips the whole
    // directory through Firestore.
    if(PRIVATE_ACCOUNT_KEYS.includes(key) || key === 'notifications' || key === 'incidents' || key === 'audit' || key === 'aadhaarDirectory') return;
    if(fbRoomRef){
      const updatedAt = Date.now();
      LAST_LOCAL_WRITE_AT[key] = updatedAt;
      fbRoomRef.doc(key).set({data: val, updatedAt}).catch(e=>{
        console.warn('Firestore write failed for', key, e);
        // Previously silent — a failed sync write (e.g. hitting Firestore's 1MB
        // document limit, or a dropped connection) looked identical to success from
        // the user's point of view. They need to know the action may not have saved
        // for everyone else in the room.
        if(!STORAGE_WARNED.has('remote:'+key)){
          STORAGE_WARNED.add('remote:'+key);
          if(typeof showToast==='function') showToast('Sync failed', 'Your last update may not have saved for other devices. Check your connection.', 'danger');
        }
      });
    }
  }
};

function db(key){ return StorageAdapter.get(key, null); }
function dbSet(key,val){ StorageAdapter.set(key,val); }
