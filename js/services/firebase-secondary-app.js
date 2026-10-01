/* ============================================================
   PHASE 1D — a SECOND, isolated Firebase App instance, used only for
   creating/verifying a doctor or delivery login (see addDoctorToRoster/
   addDeliveryBoyToRoster below). Calling createUserWithEmailAndPassword()
   on the normal app would sign the current browser session in as that
   BRAND NEW account, silently kicking the hospital/pharmacy admin out of
   their own session mid-task — a well-known Firebase Auth client-SDK
   gotcha. A second named app has its own completely separate auth state,
   so the admin's session on the primary app is never touched; we just
   sign the secondary app straight back out once the account exists.
   This stays 100% client-side — no Cloudflare Worker involved.
   ============================================================ */
function secondaryFirebaseApp(){
  if(!ensureFirebaseApp()) return null;
  let app = (firebase.apps||[]).find(a=>a.name==='secondary');
  if(!app){
    try{ app = firebase.initializeApp(FIREBASE_CONFIG, 'secondary'); }catch(e){ console.error('Secondary Firebase app init failed', e); return null; }
  }
  return app;
}
// Creates (or, if it already exists under a different role, verifies) a
// Firebase Auth account for a login an ADMIN is adding on someone else's
// behalf, without touching the admin's own signed-in session. Returns
// {uid} on success, or null if Firebase Auth isn't configured (caller
// falls back to the local passwordHash scheme, same as patient/role signup).
async function createOrVerifyAuthAccountAsAdmin(email, password){
  const app = secondaryFirebaseApp();
  if(!app) return null;
  const auth = app.auth();
  try{
    const cred = await withTimeout(auth.createUserWithEmailAndPassword(email, password), 12000, 'Account creation');
    const uid = cred.user.uid;
    await auth.signOut().catch(()=>{});
    return {uid};
  }catch(e){
    if(e && e.code==='auth/email-already-in-use'){
      // Same pattern as patientAuthFinishSignup/roleAuthFinishSignup: this
      // email already has an account under a different role — confirm it's
      // really them via the password just entered, then attach this login
      // to that same account rather than failing outright.
      try{
        const cred = await withTimeout(auth.signInWithEmailAndPassword(email, password), 12000, 'Verification');
        const uid = cred.user.uid;
        await auth.signOut().catch(()=>{});
        return {uid};
      }catch(e2){
        throw new Error('An account with this email already exists under a different role, and this password doesn\'t match it. Use a different email, or that email\'s existing password.');
      }
    }
    throw new Error(friendlyAuthError(e));
  }
}
let _authPersistenceSet = false;
function fbAuth(){
  if(!ensureFirebaseApp()) return null;
  if(typeof firebase.auth !== 'function') return null; // auth-compat script didn't load
  try{
    const a = firebase.auth();
    if(!_authPersistenceSet){
      _authPersistenceSet = true;
      // IndexedDB-backed persistence can hang indefinitely on opaque/local origins
      // (e.g. a file opened via a downloads/content:// viewer instead of being hosted
      // at a real http(s) URL). We used to sidestep that entirely with in-memory
      // (NONE) persistence, but that had a worse side effect: this app's own
      // "am I logged in" state (see SESSION_KEY / restoreActiveSession()) DOES
      // survive a reload, so the dashboard would render as logged-in while the
      // real Firebase Auth session was gone — every subsequent Firestore write
      // then failed Firestore's signedIn() rule with permission-denied, which
      // showed up to the user as a confusing "Sync failed" toast right after
      // "Live sync connected". Using LOCAL persistence keeps the two in sync
      // across reloads; the timeout race below is what actually protects
      // against the IndexedDB hang, instead of avoiding persistence outright.
      Promise.race([
        a.setPersistence(firebase.auth.Auth.Persistence.LOCAL),
        new Promise(resolve=>setTimeout(resolve, 3000))
      ]).catch(e=>console.warn('setPersistence failed', e));
      // Fires once Firebase Auth has actually determined whether a persisted
      // session exists (a User, or definitively null) — see waitForAuthReady()
      // and its use in boot() below, which fixes the race where
      // restoreActiveSession() used to render the console and fire Firestore
      // calls synchronously, before this had a chance to run even once.
      a.onAuthStateChanged(()=>{ markAuthReady(); });
    }
    return a;
  }catch(e){ console.warn('Firebase Auth unavailable', e); return null; }
}
function authBackendActive(){ return !!fbAuth(); }
// ------------------------------------------------------------
// AUTH-READY GATE — see the onAuthStateChanged hook inside fbAuth() above.
// boot() awaits this before calling restoreActiveSession() / initFirebaseSync(),
// so nothing tries a Firestore read/write while Firebase Auth is still restoring
// its session from storage (that race was the actual cause of the "Missing or
// insufficient permissions" flood on every reload — request.auth was still null
// at that instant even for a genuinely logged-in user). The 4s timeout is a
// safety net in case onAuthStateChanged never fires (e.g. offline/misconfigured),
// so a broken Auth setup can't block the app from loading at all.
let _authReadyResolve = null;
let _authReadyDone = false;
const _authReadyPromise = new Promise(resolve=>{ _authReadyResolve = resolve; });
function markAuthReady(){
  if(!_authReadyDone){ _authReadyDone = true; _authReadyResolve(); }
}
function waitForAuthReady(){
  const a = fbAuth();
  if(!a){ markAuthReady(); return Promise.resolve(); } // no Auth configured — nothing to wait for
  return Promise.race([_authReadyPromise, new Promise(resolve=>setTimeout(resolve, 4000))]);
}
function friendlyAuthError(e){
  const code = (e && e.code) || '';
  const map = {
    'auth/wrong-password':'Incorrect email or password.',
    'auth/user-not-found':'Incorrect email or password.',
    'auth/invalid-credential':'Incorrect email or password.',
    'auth/email-already-in-use':'An account with this email already exists.',
    'auth/weak-password':'Password must be at least 6 characters.',
    'auth/invalid-email':'That email address looks invalid.',
    'auth/too-many-requests':'Too many attempts — please wait a bit and try again.',
    'auth/network-request-failed':'Network error — check your connection.',
    'auth/operation-not-allowed':'Email/Password sign-in isn\'t enabled in the Firebase console yet.'
  };
  return map[code] || (e && e.message) || 'Something went wrong.';
}

function initFirebaseSync(){
  if(!ensureFirebaseApp()){
    console.log('ArogyaBot: Firebase not configured — running in single-device demo mode.');
    return;
  }
  try{
    const fs = firebase.firestore();
    fbRoomRef = fs.collection('arogya_rooms').doc(ROOM_ID).collection('state');
    fbEnabled = true;
    // PHASE 1 + 1B + 1C + 1D + 1E: PRIVATE_ACCOUNT_KEYS, PHASE1B_KEYS (public
    // directories + appointments/prescriptions), PHASE1C_KEYS (users/users_*),
    // 'notifications', 'incidents', and 'audit' no longer go through the
    // shared-room live-listener loop below — see initPrivateAccountSync() /
    // initPublicDirectories() / initUsersAccountSync() / initNotificationSync()
    // / initPhase1bApptRxSync() / the SOS Worker (sosApi/openSosSocket) /
    // initAuditSync(). What's left in LEGACY_LIVE_KEYS after this filter is
    // now just: policeProfile, phoneComplaints, revokedEmails,
    // pharmacyInventory, pharmacyBills — none of them has the fan-out or
    // size problems the others did.
    //
    // POSTMORTEM — deliveryBoys and the flicker bug: deliveryBoys used to be
    // missing from SYNC_KEYS entirely, so dbSet('deliveryBoys', ...) fell
    // through to the fbRoomRef.doc(key).set(...) branch below (nothing gated
    // the WRITE on membership in this list) — writes reached Firestore, but
    // no device ever subscribed to read them back, so pharmacies were
    // assigning deliveries off stale local defaults. The first fix added
    // deliveryBoys to SYNC_KEYS to get it read back — but that was the wrong
    // list to add it to: SYNC_KEYS (via LEGACY_LIVE_KEYS) is the shared
    // ONE-DOC-PER-KEY + onSnapshot loop below, so it put deliveryBoys' entire
    // array behind a single live listener that fires on EVERY connected
    // device. deliveryBoys' lat/lng gets rewritten every few seconds per
    // active delivery by applyLiveLocation('delivery', ...) — so every GPS
    // tick from any delivery boy in the room re-triggered that listener on
    // every device, and softRefreshCurrentView()'s fallback does a full
    // renderCurrentView() for any screen that isn't specifically patched
    // (p-rx, where patients watch a delivery, wasn't) — hence the flicker.
    // hospitals/responders/police/pharmacies move just as often but never
    // caused this, because they're PUBLIC_DIRECTORY_KEYS: per-record diffed
    // writes (see diffAndPersistPhase1b) and a fetch-once/manual-refresh
    // read (see initPublicDirectories()), never a live listener. deliveryBoys
    // now lives there too — see PUBLIC_DIRECTORY_KEYS/PHASE1B_KEYS above —
    // instead of in SYNC_KEYS's legacy live path.
    const LEGACY_LIVE_KEYS = SYNC_KEYS.filter(k => !PHASE1B_KEYS.includes(k) && !PHASE1C_KEYS.includes(k) && !PRIVATE_ACCOUNT_KEYS.includes(k) && k !== 'notifications' && k !== 'incidents' && k !== 'audit' && k !== 'aadhaarDirectory');
    LEGACY_LIVE_KEYS.forEach(key=>{
      fbRoomRef.doc(key).get().then(snap=>{
        if(snap.exists){
          // Shared room already has data — remote is the source of truth.
          LOCAL_CACHE[key] = snap.data().data;
          try{ localStorage.setItem('abot2_'+key, JSON.stringify(LOCAL_CACHE[key])); }catch(e){}
        } else if(LOCAL_CACHE[key]!==undefined){
          // First device in this room — seed the shared room from our local defaults.
          fbRoomRef.doc(key).set({data: LOCAL_CACHE[key], updatedAt: Date.now()}).catch(()=>{});
        }
        scheduleRemoteRefresh();
        // Live updates from every other phone in the same room:
        fbRoomRef.doc(key).onSnapshot(liveSnap=>{
          if(!liveSnap.exists) return;
          // hasPendingWrites only catches the FIRST (optimistic, local) echo of our own
          // write. Once the server acknowledges it, this listener fires again with
          // hasPendingWrites:false — indistinguishable from a real change from another
          // device unless we check for it explicitly. Without this check, every single
          // dbSet() this device makes (incidents, notifications, audit log, etc.) causes
          // a second, delayed re-render of the current screen a moment later — that's
          // the "keeps refreshing/flickering while sync is connected" bug.
          if(liveSnap.metadata.hasPendingWrites) return;
          const data = liveSnap.data();
          if(LAST_LOCAL_WRITE_AT[key] && data.updatedAt === LAST_LOCAL_WRITE_AT[key]) return;
          LOCAL_CACHE[key] = data.data;
          try{ localStorage.setItem('abot2_'+key, JSON.stringify(LOCAL_CACHE[key])); }catch(e){}
          scheduleRemoteRefresh();
        });
      }).catch(e=>console.warn('Firestore read failed for', key, e));
    });
    initPublicDirectories();
    initUsersAccountSync();
    startResponderDirectoryPolling();
    showToast('Live sync connected', 'This device is syncing in real time (room: '+ROOM_ID+').', 'success');
  }catch(e){
    console.error('Firebase init failed — falling back to single-device mode.', e);
    fbEnabled = false;
  }
}
