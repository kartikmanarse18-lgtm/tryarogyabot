/* ============================================================
   SHARED ROLE AUTH — Ambulance / Police / Hospital
   Same real-auth flow as Patient (Gmail + password + Firebase,
   emailed OTP, consent) but each role keeps its own account
   store, so the same mobile number can be reused across roles
   (a person can be a patient AND an ambulance driver, etc.)
   ============================================================ */
let roleAuthStep = 'email';   // email -> login|signup -> phone_conflict -> otp -> consent -> reset_password
let roleAuthMode = null;      // 'login' | 'signup' | 'forgot'
let roleAuthData = {};        // {email,password,name,phone,...role-specific fields,conflictWithEmail}
let rolePendingOtp = null;

function roleUsersDb(role){ return db('users_'+role) || []; }
function findRoleUserByEmail(role, email){ return roleUsersDb(role).find(u=>u.email===(email||'').trim().toLowerCase()); }
function findRoleUserByPhone(role, phone, excludeEmail){
  // Deliberately scoped to THIS role's own account store — the same phone number
  // can be registered once as a patient and separately as, say, an ambulance driver.
  const norm = (phone||'').replace(/\D/g,'');
  if(!norm) return null;
  return roleUsersDb(role).find(u=>u.email!==excludeEmail && (u.phone||'').replace(/\D/g,'')===norm);
}
function saveRoleUser(role, u){ const list=roleUsersDb(role); const i=list.findIndex(x=>x.email===u.email); if(i>-1) list[i]=u; else list.push(u); dbSet('users_'+role, list); }

function ensureResponderRecord(user){
  const list = db('responders') || [];
  let r = list.find(x=>x.id===user.responderId);
  if(!r){
    r = {id: user.responderId || uid('RSP'), name:user.name||'Responder', vehicle:user.ambno||'AMB-NEW', serviceName:user.ambname||'', phone:user.phone||'', lat:BASE.lat+rnd(-0.02,0.02), lng:BASE.lng+rnd(-0.02,0.02), status:'available'};
    user.responderId = r.id;
    list.push(r);
    dbSet('responders', list);
  }
  CURRENT_RESPONDER_ID = r.id;
}
function ensureHospitalRecord(user){
  const list = db('hospitals') || [];
  let h = list.find(x=>x.id===user.hospitalId);
  if(!h){
    // beds/icu/specialties come straight from what the hospital entered at signup —
    // no placeholder capacity numbers.
    const specialties = (user.specialties||'').split(',').map(s=>s.trim()).filter(Boolean);
    h = {
      id: user.hospitalId || uid('HOSP'),
      name: user.name || '',
      regNo: user.regno || '',
      contact: user.contact || '',
      phone: user.phone || '',
      beds: parseInt(user.beds, 10) || 0,
      icu: parseInt(user.icu, 10) || 0,
      lat: BASE.lat+rnd(-0.02,0.02), lng: BASE.lng+rnd(-0.02,0.02),
      specialties
    };
    user.hospitalId = h.id;
    list.push(h);
    dbSet('hospitals', list);
  }
  CURRENT_HOSPITAL_ID = h.id;
}
function applyPoliceProfile(user){
  const all = db('policeProfile')||{};
  all[user.stationId] = {name:user.name||'Officer', badge:user.badge||'', station:user.station||'', phone:user.phone||'', email:user.email};
  dbSet('policeProfile', all);
}
// Real station record so this officer's station actually shows up in nearest-police
// matching and on the live map — mirrors ensureResponderRecord/ensureHospitalRecord.
function ensurePoliceStationRecord(user){
  const list = db('police') || [];
  let p = list.find(x=>x.id===user.stationId);
  if(!p){
    p = {id: user.stationId || uid('PS'), name:user.station||'Police Station', phone:user.phone||'', lat:BASE.lat+rnd(-0.02,0.02), lng:BASE.lng+rnd(-0.02,0.02)};
    user.stationId = p.id;
    list.push(p);
    dbSet('police', list);
  }
  CURRENT_POLICE_STATION_ID = p.id;
}
// Real pharmacy record so this account shows up in the patient-side "Nearby
// pharmacies" list and can receive prescriptions — mirrors the pattern above.
// Starts with 'high' stock; the pharmacy updates it from their own dashboard.
function ensurePharmacyRecord(user){
  const list = db('pharmacies') || [];
  let p = list.find(x=>x.id===user.pharmacyId);
  if(!p){
    p = {id: user.pharmacyId || uid('PHM'), name:user.name||'Pharmacy', license:user.license||'', phone:user.phone||'', lat:BASE.lat+rnd(-0.02,0.02), lng:BASE.lng+rnd(-0.02,0.02), stock:'high'};
    user.pharmacyId = p.id;
    list.push(p);
    dbSet('pharmacies', list);
  }
  CURRENT_PHARMACY_ID = p.id;
}
function applyRoleUserToSession(role, user){
  if(role==='responder') ensureResponderRecord(user);
  else if(role==='hospital') ensureHospitalRecord(user);
  else if(role==='pharmacy') ensurePharmacyRecord(user);
  // Station record first so applyPoliceProfile always has a real stationId to key on.
  else if(role==='police'){ ensurePoliceStationRecord(user); applyPoliceProfile(user); }
}
