/* ============================================================
   PHASE 1C — users / users_* accounts, the "still not done" item
   from the Phase 1b changelog. Same per-record diffing as Phase 1b
   above (this file no longer writes a single shared array doc for
   any of these 7 keys either), but keyed by email instead of
   record.id, since these role records were never given one — email
   already has to be unique per role, so it doubles as the Firestore
   document ID. That turns "does this email already exist" from an
   array scan into a single doc read, no query needed.
   Every existing call site (saveUser, saveRoleUser, saveDoctorUser,
   saveDeliveryUser, usersDb, roleUsersDb, doctorUsersDb,
   deliveryUsersDb, findUserByEmail, findRoleUserByEmail, etc.) is
   unchanged — they still read/write the full array via db(key)/
   dbSet(key, fullArray) exactly as before. Only the two places that
   actually gate a login (doctorLoginSubmit, deliveryLoginSubmit) and
   the two Firebase-Auth-backed logins (patientAuthLogin,
   roleAuthLogin) now confirm against a live doc read via
   liveAccountExists() instead of trusting the local cache — doctor
   and delivery accounts in particular have no Firebase Auth check of
   their own to fall back on, so a hospital/pharmacy adding a login on
   one device needs that login to work on a *different* device right
   away, not just after that device's next one-time directory fetch.
   ============================================================ */
const PHASE1C_KEYS = ['users','users_responder','users_police','users_hospital','users_pharmacy','users_doctor','users_delivery'];
function accountRecordId(record){ return String((record && record.email) || '').trim().toLowerCase(); }
// One-time fetch + seed, same pattern as initPublicDirectories() — these are
// read-mostly (a login only needs "the latest", not a live stream), so no
// onSnapshot listener here; see liveAccountExists() for the moment that
// actually needs a guaranteed-fresh read.
function initUsersAccountSync(){
  if(!fbEnabled || typeof firebase==='undefined') return;
  const fs = firebase.firestore();
  PHASE1C_KEYS.forEach(key=>{
    fs.collection('accounts').doc(key).collection('items').get().then(snap=>{
      if(!snap.empty){
        const arr = snap.docs.map(d=>d.data());
        LOCAL_CACHE[key] = arr;
        PHASE1B_LAST_WRITE[key] = new Map(arr.map(r=>[accountRecordId(r), phase1bClone(r)]));
        try{ localStorage.setItem('abot2_'+key, JSON.stringify(arr)); }catch(e){}
      } else if(Array.isArray(LOCAL_CACHE[key]) && LOCAL_CACHE[key].length){
        // First device ever to connect — seed /accounts/{key}/items from local defaults.
        diffAndPersistPhase1b(key, LOCAL_CACHE[key]);
      }
      scheduleRemoteRefresh();
    }).catch(e=>console.warn('Account directory fetch failed for', key, e));
  });
}
// The actual fix: a live, targeted read of the one doc this email would
// occupy, instead of trusting the local cache — mirrors bookAppt()'s live
// conflict check from Phase 1b. Falls back to the local array scan when
// offline/unconfigured (same answer local demo mode always gave), and again
// if the live read itself fails, rather than blocking someone from logging
// in over a dropped connection.
// After a login succeeds via liveAccountExists() (meaning this device's local
// cache didn't already have the record), fold it into the local array so the
// rest of the session — currentUserRecord(), usersDb(), etc. — sees it too,
// without forcing a redundant remote write back to the doc we just read it from.
function mergeAccountIntoLocalCache(key, record){
  if(!record) return;
  const id = accountRecordId(record);
  const list = db(key) || [];
  const i = list.findIndex(x=>accountRecordId(x)===id);
  if(i>-1) list[i] = record; else list.push(record);
  LOCAL_CACHE[key] = list;
  const prevMap = PHASE1B_LAST_WRITE[key] || new Map();
  prevMap.set(id, phase1bClone(record));
  PHASE1B_LAST_WRITE[key] = prevMap; // mark as already-synced so it isn't re-written verbatim
  try{ localStorage.setItem('abot2_'+key, JSON.stringify(list)); }catch(e){}
}
async function liveAccountExists(key, email){
  const id = accountRecordId({email});
  if(!id) return null;
  if(!fbEnabled || typeof firebase==='undefined') return (db(key)||[]).find(u=>accountRecordId(u)===id) || null;
  try{
    const snap = await firebase.firestore().collection('accounts').doc(key).collection('items').doc(id).get();
    return snap.exists ? snap.data() : null;
  }catch(e){
    console.warn('liveAccountExists failed for', key, id, e);
    return (db(key)||[]).find(u=>accountRecordId(u)===id) || null;
  }
}

/* ---- Appointments & prescriptions: role-aware live read side ---- */
let PHASE1B_APPT_UNSUBS = [];
let PHASE1B_RX_UNSUBS = [];
let PHASE1B_APPT_CACHE = new Map();
let PHASE1B_RX_CACHE = new Map();
function mergePhase1bAppts(){
  const arr = Array.from(PHASE1B_APPT_CACHE.values());
  LOCAL_CACHE['appointments'] = arr;
  PHASE1B_LAST_WRITE['appointments'] = new Map(arr.map(r=>[String(r.id), phase1bClone(r)]));
  try{ localStorage.setItem('abot2_appointments', JSON.stringify(arr)); }catch(e){}
  scheduleRemoteRefresh();
}
function mergePhase1bRx(){
  const arr = Array.from(PHASE1B_RX_CACHE.values());
  LOCAL_CACHE['prescriptions'] = arr;
  PHASE1B_LAST_WRITE['prescriptions'] = new Map(arr.map(r=>[String(r.id), phase1bClone(r)]));
  try{ localStorage.setItem('abot2_prescriptions', JSON.stringify(arr)); }catch(e){}
  scheduleRemoteRefresh();
}
function subscribePhase1bAppts(collRef){
  if(!collRef) return;
  const unsub = collRef.onSnapshot(snap=>{
    snap.docChanges().forEach(ch=>{
      if(ch.type==='removed') PHASE1B_APPT_CACHE.delete(ch.doc.id); else PHASE1B_APPT_CACHE.set(ch.doc.id, ch.doc.data());
    });
    mergePhase1bAppts();
  }, e=>console.warn('Appointment collection listen failed', e));
  PHASE1B_APPT_UNSUBS.push(unsub);
}
function subscribePhase1bRx(collRef){
  if(!collRef) return;
  const unsub = collRef.onSnapshot(snap=>{
    snap.docChanges().forEach(ch=>{
      if(ch.type==='removed') PHASE1B_RX_CACHE.delete(ch.doc.id); else PHASE1B_RX_CACHE.set(ch.doc.id, ch.doc.data());
    });
    mergePhase1bRx();
  }, e=>console.warn('Prescription collection listen failed', e));
  PHASE1B_RX_UNSUBS.push(unsub);
}
function teardownPhase1bApptRxSync(){
  PHASE1B_APPT_UNSUBS.forEach(u=>{ try{u();}catch(e){} });
  PHASE1B_APPT_UNSUBS = [];
  PHASE1B_RX_UNSUBS.forEach(u=>{ try{u();}catch(e){} });
  PHASE1B_RX_UNSUBS = [];
  PHASE1B_APPT_CACHE = new Map();
  PHASE1B_RX_CACHE = new Map();
}
// Call right after enterConsole() settles on a role (mirrors
// initPrivateAccountSync/initNotificationSync). Each role subscribes only
// to the partition(s) it's actually allowed to act on — a pharmacy device
// never receives another pharmacy's queue, a patient device never receives
// another patient's booking, and a doctor only ever sees their own slate.
function initPhase1bApptRxSync(){
  teardownPhase1bApptRxSync();
  if(!fbEnabled || typeof firebase==='undefined') return;
  const fs = firebase.firestore();
  if(currentRole === 'patient'){
    const uid = currentAuthUid();
    if(uid){
      subscribePhase1bAppts(fs.collection('users').doc(uid).collection('appointmentRefs'));
      subscribePhase1bRx(fs.collection('users').doc(uid).collection('prescriptionRefs'));
    }
  } else if(currentRole === 'doctor'){
    const d = currentDoctorRecord();
    if(d) subscribePhase1bAppts(fs.collection('doctors').doc(doctorPartitionKey(CURRENT_HOSPITAL_ID, d.name)).collection('appointments'));
  } else if(currentRole === 'hospital'){
    // A hospital needs visibility across every one of its own doctors —
    // that's still just N doctor-partition subscriptions (N = doctors at
    // this hospital), never every doctor at every hospital.
    (db('doctors')||[]).filter(d=>d.hospital===CURRENT_HOSPITAL_ID).forEach(d=>{
      subscribePhase1bAppts(fs.collection('doctors').doc(doctorPartitionKey(CURRENT_HOSPITAL_ID, d.name)).collection('appointments'));
    });
  } else if(currentRole === 'pharmacy' || currentRole === 'delivery'){
    // Delivery boys are always scoped to one pharmacy (CURRENT_PHARMACY_ID
    // is set for both roles at login), so the pharmacy's own queue already
    // covers exactly what a delivery boy needs — they filter their own
    // deliveryBoyId out of it client-side, same as before.
    if(CURRENT_PHARMACY_ID) subscribePhase1bRx(fs.collection('pharmacies').doc(CURRENT_PHARMACY_ID).collection('prescriptions'));
  }
  // NOTE: if a hospital adds a brand-new doctor, or a doctor is added mid-
  // session, that doctor's (empty, brand-new) partition isn't picked up
  // until the next login — same "manual refresh" tradeoff already accepted
  // for the public directories. Worth revisiting if live doctor-roster
  // changes turn out to matter for the demo.
}
