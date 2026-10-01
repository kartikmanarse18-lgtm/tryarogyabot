/* ============================================================
   PATIENT — REAL AUTH: Gmail + password + emailed OTP + phone,
   with family sub-profiles (up to 3 members per account) and a
   raise-a-complaint path when a phone is already registered.
   ============================================================ */
let patientAuthStep = 'email';   // email -> login|signup -> phone_conflict -> otp -> consent -> reset_password
let patientAuthMode = null;      // 'login' | 'signup' | 'forgot'
let patientAuthData = {};        // {email,password,name,phone,conflictWithEmail,newPassword}
let pendingOtp = null;

function usersDb(){ return db('users') || []; }
function findUserByEmail(email){ return usersDb().find(u=>u.email===(email||'').trim().toLowerCase()); }
function findUserByPhone(phone, excludeEmail){
  const norm = (phone||'').replace(/\D/g,'');
  if(!norm) return null;
  return usersDb().find(u=>u.email!==excludeEmail && (u.phone||'').replace(/\D/g,'')===norm);
}
function currentUserRecord(){ return patientAuthData.loggedEmail ? findUserByEmail(patientAuthData.loggedEmail) : null; }
function currentPatientId(){ const u = currentUserRecord(); return (u && u.activeMemberId) ? u.activeMemberId : 'ME'; }
// Prescriptions are only tagged with a memberId (see ownerId elsewhere), not a
// name/phone — this walks every patient account to find which one owns that
// member, so the pharmacy billing screen can prefill the customer's details
// when a prescription is linked to a bill.
function findPatientMemberById(memberId){
  const patients = db('users') || [];
  for(const u of patients){
    const m = (u.members||[]).find(x=>x.id===memberId);
    if(m) return {member:m, account:u};
  }
  return null;
}
// ---- Per-patient scoping helpers for documents/prescriptions/appointments/
// claims/insurance — these collections are shared/synced room-wide, so every
// record needs an ownerId (a memberId) written on creation and filtered on
// read. Without this, a brand-new signup (or any other account) would see
// every other patient's — including a deleted patient's — old records. ----
function getInsuranceRecord(pid){
  const ins=db('insurance')||{};
  return ins[pid] || {aadhaar_verified:false, scheme:'', policyNumber:'', insurer:'', tpa:'', sumInsured:'', validTill:'', cghsCategory:'', esicIpNumber:''};
}
function setInsuranceVerified(pid, val){ const ins=db('insurance')||{}; ins[pid] = Object.assign({}, ins[pid]||{}, {aadhaar_verified: val}); dbSet('insurance', ins); }
function setInsuranceFields(pid, patch){ const ins=db('insurance')||{}; ins[pid] = Object.assign({}, ins[pid]||{}, patch); dbSet('insurance', ins); }
