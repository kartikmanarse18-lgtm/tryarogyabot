/* ============================================================
   PHASE 1B — the two "hard tier" keys (appointments, prescriptions)
   plus the 5 public directories (hospitals/responders/police/doctors/
   pharmacies), migrated off the shared 'arogya_rooms' blob entirely.

   Every existing call site (bookAppt, doctorSubmitRx, hospitalCancelAppt,
   updateHospitalCapacity, doctorAddSlot, sendToPharmacy, ...) is
   UNCHANGED — they still call db(key)/dbSet(key, fullArray) exactly as
   before. What changes is only what StorageAdapter does with that array
   underneath: instead of writing the whole thing to one shared doc (so
   one patient's cancellation could overwrite another patient's booking,
   or at minimum re-broadcast to devices that have no business seeing
   it), each record is mirrored to its own doc under whichever
   partition(s) actually need it — and only the records that changed
   since this device's last write get touched. Nothing here is a full
   overwrite of a collection, so two devices writing different records
   at the same time can never clobber each other.

   Partitions:
     hospitals/responders/police/doctors/pharmacies
       -> /public/{key}/items/{id}                (read by everyone)
     appointments
       -> /doctors/{doctorPartitionKey}/appointments/{id}   (doctor + hospital)
       -> /users/{ownerAuthUid}/appointmentRefs/{id}        (that patient only)
     prescriptions
       -> /pharmacies/{targetPharmacyId}/prescriptions/{id} (that pharmacy + its delivery staff)
       -> /users/{ownerAuthUid}/prescriptionRefs/{id}       (that patient only)

   Known limitation (same class of gap called out in the migration plan
   for admin-deletion): a record only gets an ownerAuthUid if it was
   created (or last touched) after this Phase 1b rollout, or by a device
   that was logged in via Firebase Auth when it wrote the record. A
   record without one still fans out fine to its doctor/pharmacy
   partition, it just won't mirror into that patient's own partition —
   the patient still sees it fine via the doctor/pharmacy's copy while
   she's the one who owns the appointment view locally, but it means the
   'my own records' collection isn't guaranteed complete for pre-rollout
   data. Not an issue for a fresh deploy; worth a one-time backfill pass
   before cutting an existing production room over.
   ============================================================ */
const PHASE1B_KEYS = ['hospitals','responders','police','doctors','pharmacies','appointments','prescriptions','deliveryBoys'];

// Stable per-doctor partition key: doctor records in this app carry a name +
// a hospital id, not a dedicated doctorId on the appointment record itself,
// so the partition key is derived from the pair (matches how every existing
// call site already looks appointments up: a.hospital + a.doctor).
function doctorPartitionKey(hospital, doctor){
  return String(hospital||'_none_')+'__'+String(doctor||'_none_').trim().replace(/[^a-zA-Z0-9]+/g,'_').toLowerCase();
}

// Every Firestore doc a given record of a Phase-1b key should be mirrored
// to. Returning 2 refs (e.g. for a booking) is what makes one write reach
// both the doctor and the patient without either side needing to read the
// other's data first.
function phase1bDocRefs(key, record){
  if(!fbEnabled || typeof firebase==='undefined' || !record) return [];
  const fs = firebase.firestore();
  // PHASE 1C accounts (users/users_*) don't carry an .id field — they're
  // identified by email, so route them before the generic record.id==null
  // guard below would otherwise drop them.
  if(PHASE1C_KEYS.includes(key)){
    const id = accountRecordId(record);
    return id ? [fs.collection('accounts').doc(key).collection('items').doc(id)] : [];
  }
  if(record.id==null) return [];
  if(PUBLIC_DIRECTORY_KEYS.includes(key)){
    return [fs.collection('public').doc(key).collection('items').doc(String(record.id))];
  }
  if(key === 'appointments'){
    const refs = [fs.collection('doctors').doc(doctorPartitionKey(record.hospital, record.doctor)).collection('appointments').doc(String(record.id))];
    if(record.ownerAuthUid) refs.push(fs.collection('users').doc(record.ownerAuthUid).collection('appointmentRefs').doc(String(record.id)));
    return refs;
  }
  if(key === 'prescriptions'){
    const refs = [];
    if(record.targetPharmacyId) refs.push(fs.collection('pharmacies').doc(String(record.targetPharmacyId)).collection('prescriptions').doc(String(record.id)));
    if(record.ownerAuthUid) refs.push(fs.collection('users').doc(record.ownerAuthUid).collection('prescriptionRefs').doc(String(record.id)));
    return refs;
  }
  return [];
}

// Per-key snapshot of "the array as this device last wrote it", keyed by
// record id -> JSON string. Diffing against this (instead of writing the
// whole incoming array every time) is what keeps every write down to just
// the record(s) that actually changed. Accounts (Phase 1C) are keyed by
// email via accountRecordId() instead of record.id — see phase1RecordKey().
const PHASE1B_LAST_WRITE = {};
// BUGFIX: every snapshot stored in PHASE1B_LAST_WRITE must be an independent
// deep copy, never a live reference into LOCAL_CACHE[key]. Every record in
// this app is fetched once and then mutated in place (e.g. doctorAddSlot does
// `d.slots.push(val)` on the very object living inside LOCAL_CACHE['doctors'],
// then calls dbSet('doctors', docs)). If PHASE1B_LAST_WRITE held that same
// object reference as its "previous" snapshot, the mutation would silently
// change prev and next at once, so diffAndPersistPhase1b's
// `prevJson === JSON.stringify(record)` check always saw "no change" and
// skipped the Firestore write entirely — the UI (reading the same mutated
// local object) looked updated, but nothing ever reached Firestore, so every
// other device's refresh never saw the new data.
function phase1bClone(r){ return r==null ? r : JSON.parse(JSON.stringify(r)); }
function phase1RecordKey(key, r){
  if(!r) return null;
  return PHASE1C_KEYS.includes(key) ? (accountRecordId(r) || null) : (r.id!=null ? String(r.id) : null);
}
function diffAndPersistPhase1b(key, newArr){
  if(!fbEnabled || typeof firebase==='undefined') return;
  const prev = PHASE1B_LAST_WRITE[key] || new Map();
  const next = new Map();
  (newArr||[]).forEach(r=>{ const k=phase1RecordKey(key,r); if(k) next.set(k, r); });
  next.forEach((record, id)=>{
    const prevJson = prev.has(id) ? JSON.stringify(prev.get(id)) : null;
    if(prevJson === JSON.stringify(record)) return; // unchanged since our last write — skip
    phase1bDocRefs(key, record).forEach(ref=>{
      ref.set(record).catch(e=>{
        console.warn('Phase1b write failed for', key, id, e);
        // FIXLOG: this used to fail 100% silently — the local cache (and so the
        // UI, e.g. the Delivery Boys roster) already looked correct, so an admin
        // had no way to know the record never actually reached the server. For
        // account keys (PHASE1C) that's exactly what caused "added here, but
        // login says no account exists on another device" — the login-linking
        // doc never made it to Firestore, but nothing said so at the time.
        const warnKey = 'phase1b:'+key;
        if(!STORAGE_WARNED.has(warnKey)){
          STORAGE_WARNED.add(warnKey);
          if(typeof showToast==='function') showToast('Sync failed', (PHASE1C_KEYS.includes(key) ? 'A login change' : 'A change') + " didn't reach the server — check your connection and try the action again.", 'danger');
        }
      });
    });
  });
  prev.forEach((record, id)=>{
    if(next.has(id)) return; // still present, nothing to delete
    phase1bDocRefs(key, record).forEach(ref=>{
      ref.delete().catch(e=>console.warn('Phase1b delete failed for', key, id, e));
    });
  });
  // Store CLONES as the new "previous" snapshot, not the live objects from
  // newArr — those are the same objects sitting in LOCAL_CACHE[key] and will
  // keep getting mutated in place by future dbSet(key, ...) calls. See
  // phase1bClone() comment above for why this matters.
  const clonedNext = new Map();
  next.forEach((record, id)=>clonedNext.set(id, phase1bClone(record)));
  PHASE1B_LAST_WRITE[key] = clonedNext;
}
