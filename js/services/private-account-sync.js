/* ============================================================
   PHASE 1 — PRIVATE ACCOUNT SYNC (fitness/cycle/nutrition/vitals/medsTools)
   Call initPrivateAccountSync() right after a patient successfully signs
   in or signs up (wherever patientAuthData.loggedEmail gets set alongside
   a real Firebase Auth session), and teardownPrivateAccountSync() on logout.
   Each key lives at /users/{authUid}/data/{key} — isolated per account, so
   it can never collide with another patient's data the way the old shared
   'arogya_rooms/{room}/state/{key}' doc could when two accounts both used
   the default family-member slot 'ME'.
   ============================================================ */
let PRIVATE_SYNC_UNSUBS = [];
function initPrivateAccountSync(){
  teardownPrivateAccountSync();
  const uid = currentAuthUid();
  if(!fbEnabled || !uid) return;
  PRIVATE_ACCOUNT_KEYS.forEach(key=>{
    const ref = getFirestorePath(key);
    if(!ref) return;
    ref.get().then(snap=>{
      if(snap.exists){
        LOCAL_CACHE[key] = snap.data().data;
        try{ localStorage.setItem('abot2_'+key, JSON.stringify(LOCAL_CACHE[key])); }catch(e){}
      } else if(LOCAL_CACHE[key]!==undefined){
        ref.set({data: LOCAL_CACHE[key], updatedAt: Date.now()}).catch(()=>{});
      }
      scheduleRemoteRefresh();
      const unsub = ref.onSnapshot(liveSnap=>{
        if(!liveSnap.exists) return;
        if(liveSnap.metadata.hasPendingWrites) return;
        const data = liveSnap.data();
        if(LAST_LOCAL_WRITE_AT[key] && data.updatedAt === LAST_LOCAL_WRITE_AT[key]) return;
        LOCAL_CACHE[key] = data.data;
        try{ localStorage.setItem('abot2_'+key, JSON.stringify(LOCAL_CACHE[key])); }catch(e){}
        scheduleRemoteRefresh();
      });
      PRIVATE_SYNC_UNSUBS.push(unsub);
    }).catch(e=>console.warn('Private account sync failed for', key, e));
  });
}
function teardownPrivateAccountSync(){
  PRIVATE_SYNC_UNSUBS.forEach(unsub=>{ try{ unsub(); }catch(e){} });
  PRIVATE_SYNC_UNSUBS = [];
}
