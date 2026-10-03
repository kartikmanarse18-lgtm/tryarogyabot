/* ============================================================
   LANDING / ROLE SELECT (first screen)
   ============================================================ */
let currentRole = null;
let CURRENT_RESPONDER_ID = null;
let CURRENT_HOSPITAL_ID = null;
let CURRENT_POLICE_STATION_ID = null;
let CURRENT_PHARMACY_ID = null;
let CURRENT_DOCTOR_ID = null;
let CURRENT_DELIVERY_ID = null;
let currentView = null;
let liveTrackingTimer = null;
let lastRQueueSnapshot = null; // detects new/escalated pending cases so r-queue can re-render itself

// Fixed specialty list — used for the hospital's "Add doctor" dropdown AND
// to group doctors on the patient telemedicine screen, so a doctor never
// ends up in a specialty bucket of one because of free-text typos.
const DOCTOR_SPECIALTIES = ['Physiotherapy','General Physician','Cardiology','Dermatology','Pediatrics','Gynecology','Orthopedics','ENT (Ear, Nose &amp; Throat)','Neurology','Psychiatry','Dentistry','Ophthalmology','Gastroenterology','Pulmonology','Urology','Endocrinology','Oncology'];
const ROLE_META = {
  patient:   {icon:'fa-user-injured', title:'Patient', id:'ROLE // PT-01', desc:'Symptom checker, one-tap SOS with live multi-agency dispatch, records, telemedicine, pharmacy, women\'s health and government schemes.'},
  responder: {icon:'fa-truck-medical', title:'Ambulance / Responder', id:'ROLE // RS-01', desc:'Live dispatch queue broadcast from Command, patient medical summary on accept, turn-by-turn navigation simulation.'},
  police:    {icon:'fa-shield-halved', title:'Police', id:'ROLE // PO-01', desc:'Every SOS auto-notifies the nearest station. Track dispatch status, acknowledge, and clear the route.'},
  hospital:  {icon:'fa-hospital', title:'Hospital', id:'ROLE // HP-01', desc:'Incoming-patient alerts the moment a responder accepts a case, bed &amp; ICU capacity, doctor roster, telemedicine and insurance verification.'},
  pharmacy:  {icon:'fa-mortar-pestle', title:'Pharmacy', id:'ROLE // PH-01', desc:'Keep your live stock status visible to nearby patients, and receive prescriptions patients send your way for fulfillment.'}
};

function renderLandingBadges(){
  const grid = document.getElementById('badge-grid');
  grid.innerHTML = Object.keys(ROLE_META).map(r=>{
    const m = ROLE_META[r];
    return `<div class="badge-card" data-role-type="${r}" onclick="beginSignup('${r}')">
      <div class="badge-header"><div class="badge-icon"><i class="fa-solid ${m.icon}"></i></div><span class="badge-id">${m.id}</span></div>
      <div class="badge-title">${m.title}</div>
      <div class="badge-body">${m.desc}</div>
      <div class="badge-footer"><span>Sign in / Sign up</span><i class="fa-solid fa-arrow-right"></i></div>
    </div>`;
  }).join('');
}
renderLandingBadges();

function beginSignup(role){
  currentRole = role;
  patientAuthStep = 'email';
  patientAuthData = {};
  patientAuthMode = null;
  pendingOtp = null;
  roleAuthStep = 'email';
  roleAuthData = {};
  roleAuthMode = null;
  rolePendingOtp = null;
  document.getElementById('auth-role-tagline').textContent = ROLE_META[role].title + ' sign-in';
  document.getElementById('screen-landing').classList.add('hidden');
  document.getElementById('screen-auth').classList.remove('hidden');
  renderAuthCard();
}
function backToRoleSelect(){
  currentRole = null;
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
}

// ------------------------------------------------------------
// SESSION PERSISTENCE — keeps the user logged into their console
// across a page refresh. This is deliberately separate from
// Firebase Auth's own persistence (which is set to NONE above to
// dodge an IndexedDB hang on opaque origins); it's just a small,
// synchronous localStorage record of "who is logged in as what",
// restored on boot() before anything else renders.
// ------------------------------------------------------------
const SESSION_KEY = 'abot2_active_session';
function saveActiveSession(role){
  try{
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      role,
      loggedEmail: role==='patient' ? patientAuthData.loggedEmail : role==='doctor' ? doctorAuthData.loggedEmail : role==='delivery' ? deliveryAuthData.loggedEmail : roleAuthData.loggedEmail,
      responderId: CURRENT_RESPONDER_ID,
      hospitalId: CURRENT_HOSPITAL_ID,
      policeStationId: CURRENT_POLICE_STATION_ID,
      pharmacyId: CURRENT_PHARMACY_ID,
      doctorId: CURRENT_DOCTOR_ID,
      deliveryId: CURRENT_DELIVERY_ID
    }));
  }catch(e){ console.warn('Could not persist session', e); }
}
function clearActiveSession(){
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  if(typeof uiStateClear==='function') uiStateClear();   // never carry unsaved form drafts across a sign-out
}
function loadActiveSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
// Restores in-memory session state from the saved record, then opens the
// console directly — used on boot() so a refresh doesn't bounce the user
// back to role selection.
function restoreActiveSession(){
  const s = loadActiveSession();
  if(!s || !s.role || (s.role!=='doctor' && s.role!=='delivery' && !ROLE_META[s.role])) return false;
  currentRole = s.role;
  CURRENT_RESPONDER_ID = s.responderId || null;
  CURRENT_HOSPITAL_ID = s.hospitalId || null;
  CURRENT_POLICE_STATION_ID = s.policeStationId || null;
  CURRENT_PHARMACY_ID = s.pharmacyId || null;
  CURRENT_DOCTOR_ID = s.doctorId || null;
  CURRENT_DELIVERY_ID = s.deliveryId || null;
  if(s.role==='patient'){
    patientAuthData = {loggedEmail: s.loggedEmail};
    if(isEmailRevoked(s.loggedEmail)) return false;
    const u = s.loggedEmail ? findUserByEmail(s.loggedEmail) : null;
    if(!u) return false; // stale/corrupt session — fall back to landing
    loadActiveMemberIntoProfile(u);
    // FIXLOG: initPrivateAccountSync() was only ever called from the login/
    // signup screens, never from here. That meant fitness/cycle/pregnancy/
    // nutrition/vitals/medsTools/documents/reminders/claims/insurance only
    // ever synced on THIS device's very first sign-in — every time the app
    // was simply reopened afterwards (the common case, since a saved session
    // skips the login screen entirely), this device kept reading its own
    // stale local cache with no live listener, so another device's edits
    // never arrived and looked like they needed re-entering. boot() awaits
    // waitForAuthReady() before calling restoreActiveSession(), so
    // currentAuthUid() below is already valid by this point.
    initPrivateAccountSync();
  } else if(s.role==='doctor'){
    doctorAuthData = {loggedEmail: s.loggedEmail};
    if(isEmailRevoked(s.loggedEmail)) return false;
    const u = s.loggedEmail ? findDoctorUserByEmail(s.loggedEmail) : null;
    if(!u) return false;
    const docRecord = (db('doctors')||[]).find(d=>d.id===u.doctorId);
    if(!docRecord) return false;
  } else if(s.role==='delivery'){
    deliveryAuthData = {loggedEmail: s.loggedEmail};
    if(isEmailRevoked(s.loggedEmail)) return false;
    const u = s.loggedEmail ? findDeliveryUserByEmail(s.loggedEmail) : null;
    if(!u) return false;
    const dRecord = (db('deliveryBoys')||[]).find(d=>d.id===u.deliveryId);
    if(!dRecord) return false;
  } else {
    roleAuthData = {loggedEmail: s.loggedEmail};
    if(isEmailRevoked(s.loggedEmail)) return false; // deactivated since last session — bounce to landing
    const u = s.loggedEmail ? findRoleUserByEmail(s.role, s.loggedEmail) : null;
    if(!u) return false;
    // Re-derive responder/hospital/police station records the same way login does,
    // in case CURRENT_*_ID above was ever missing (e.g. an older saved session).
    applyRoleUserToSession(s.role, u);
  }
  dbSet('auth', {verified:true, consent:true});
  enterConsole(s.role);
  return true;
}

function enterConsole(role){
  document.getElementById('screen-splash').classList.add('hidden');
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-landing').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  // A doctor's console lives under their hospital, and a delivery boy's
  // console lives under their pharmacy: both keep their own role
  // ('doctor'/'delivery') for session/nav/view routing, but visually theme
  // as the parent role so it reads as a tab inside that shell rather than a
  // separate top-level identity.
  document.body.setAttribute('data-role', role==='doctor' ? 'hospital' : role==='delivery' ? 'pharmacy' : role);
  const hospForTag = role==='doctor' ? (db('hospitals')||[]).find(x=>x.id===CURRENT_HOSPITAL_ID) : null;
  const pharmForTag = role==='delivery' ? (db('pharmacies')||[]).find(x=>x.id===CURRENT_PHARMACY_ID) : null;
  const unitTag = role==='responder' ? ' · '+CURRENT_RESPONDER_ID : role==='hospital' ? ' · '+CURRENT_HOSPITAL_ID : role==='pharmacy' ? ' · '+CURRENT_PHARMACY_ID : role==='doctor' ? ' · '+(hospForTag?hospForTag.name:CURRENT_HOSPITAL_ID) : role==='delivery' ? ' · '+(pharmForTag?pharmForTag.name:CURRENT_PHARMACY_ID) : '';
  document.getElementById('current-role-tag').textContent = role.toUpperCase()+unitTag;
  pruneStaleLocalIncidents();
  buildSideNav(role);
  // Restore whichever section the user was last on, instead of always
  // dropping them back at the dashboard on every reload — that was forcing
  // people to re-navigate to wherever they actually were (Nutrition, Women's
  // Health, etc) every single time. Falls back to the normal first-item
  // default if there's no saved view, it belongs to a different role's nav
  // (e.g. switched accounts on this device), or it's the login/landing
  // screens themselves.
  let lastView = null;
  try{ lastView = localStorage.getItem('abot2_lastView'); }catch(e){}
  const validForRole = lastView && SIDENAV[role] && SIDENAV[role].some(item=>item.id===lastView);
  const first = validForRole ? lastView : SIDENAV[role][0].id;
  renderCurrentView(first);
  refreshBell();
  initNotificationSync();
  initPhase1bApptRxSync(); // appointments/prescriptions: subscribe to this role's own partition(s) only
  audit(role, 'session', role+' console opened'+unitTag);
  saveActiveSession(role);
  // One live SOS socket per role — replaces the old Firestore onSnapshot /
  // local-poll watcher. The server (sosHub.js alarm()) now owns escalation
  // timing for real, independent of whether any device is connected.
  if(role==='patient') openSosSocket('patient', currentPatientId(), currentPatientId());
  else if(role==='responder') openSosSocket('responder', CURRENT_RESPONDER_ID, null);
  else if(role==='hospital'){ openSosSocket('hospital', CURRENT_HOSPITAL_ID, null); initAuditSync('hospital:'+CURRENT_HOSPITAL_ID); }
  else if(role==='police') openSosSocket('police', CURRENT_POLICE_STATION_ID, null);
  // Pharmacies don't take part in emergency dispatch, so no SOS socket for them.

  // Ask for location permission up front for every role so tracking/matching works from
  // the moment they're in, rather than only when a patient happens to trigger an SOS.
  if(role==='responder'){
    beginLiveLocationTracking('responder');
    showToast('Live location on', 'Your position now updates in real time so nearby cases can find you accurately.', 'info');
  } else if(role==='patient'){
    beginLiveLocationTracking('patient');
  } else if(role==='hospital'){
    captureOneTimeLocation('hospital');
  } else if(role==='police'){
    captureOneTimeLocation('police');
  } else if(role==='pharmacy'){
    captureOneTimeLocation('pharmacy');
  } else if(role==='delivery'){
    beginLiveLocationTracking('delivery');
    showToast('Live location on', 'Your position now updates in real time so the patient can track their delivery.', 'info');
  }
}
