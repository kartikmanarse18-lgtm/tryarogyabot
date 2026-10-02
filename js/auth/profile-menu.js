/* ============================================================
   PROFILE MENU (replaces old "Switch Role" — shows who's signed
   in for this console and offers Logout)
   ============================================================ */
function currentIdentity(){
  if(currentRole==='patient'){ const p=db('profile')||{}; const u=currentUserRecord(); return {name:p.name||'Patient', sub:(u&&u.email)||p.phone||'', unit:p.relation&&p.relation!=='Self'?p.relation:''}; }
  if(currentRole==='responder'){ const r=(db('responders')||[]).find(x=>x.id===CURRENT_RESPONDER_ID)||{}; const u=findRoleUserByEmail('responder', roleAuthData.loggedEmail); return {name:r.name||'Responder', sub:(u&&u.email)||r.phone||'', unit:r.vehicle||CURRENT_RESPONDER_ID}; }
  if(currentRole==='hospital'){ const h=(db('hospitals')||[]).find(x=>x.id===CURRENT_HOSPITAL_ID)||{}; const u=findRoleUserByEmail('hospital', roleAuthData.loggedEmail); return {name:h.name||'Hospital', sub:(u&&u.email)||h.phone||'', unit:h.id}; }
  if(currentRole==='police'){ const po=(db('policeProfile')||{})[CURRENT_POLICE_STATION_ID]||{}; return {name:po.name||'Officer', sub:po.email||po.phone||'', unit:po.station||''}; }
  if(currentRole==='doctor'){ const d=(db('doctors')||[]).find(x=>x.id===CURRENT_DOCTOR_ID)||{}; const h=(db('hospitals')||[]).find(x=>x.id===CURRENT_HOSPITAL_ID)||{}; return {name:d.name||'Doctor', sub:doctorAuthData.loggedEmail||'', unit:h.name||CURRENT_HOSPITAL_ID}; }
  if(currentRole==='delivery'){ const dv=(db('deliveryBoys')||[]).find(x=>x.id===CURRENT_DELIVERY_ID)||{}; const ph=(db('pharmacies')||[]).find(x=>x.id===CURRENT_PHARMACY_ID)||{}; return {name:dv.name||'Delivery', sub:deliveryAuthData.loggedEmail||'', unit:ph.name||CURRENT_PHARMACY_ID}; }
  return {name:'—', sub:'', unit:''};
}
function toggleProfileMenu(e){
  e.stopPropagation();
  const panel = document.getElementById('profile-menu');
  if(panel.classList.contains('hidden')){
    renderProfileMenu();
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
}
document.addEventListener('click', (e)=>{
  const panel = document.getElementById('profile-menu');
  if(panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('.profile-btn')){
    panel.classList.add('hidden');
  }
});
function renderProfileMenu(){
  const panel = document.getElementById('profile-menu');
  const idn = currentIdentity();
  const initials = (idn.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  panel.innerHTML = `
    <div class="profile-menu-head">
      <div class="profile-avatar">${initials}</div>
      <div><div class="profile-menu-name">${idn.name}</div><div class="profile-menu-sub">${(currentRole||'').toUpperCase()}${idn.unit?' · '+idn.unit:''}</div></div>
    </div>
    <div class="profile-menu-body">
      ${idn.sub ? `<div class="profile-menu-row"><span>${idn.sub.includes('@')?'Account':'Phone'}</span><strong>${idn.sub}</strong></div>` : ''}
      ${currentRole==='patient' ? `<button class="profile-menu-logout" style="color:var(--text-main);" onclick="openFamilyModal()"><i class="fa-solid fa-people-roof"></i> Family members</button>` : ''}
      ${currentRole==='patient' && typeof abdmEnabled==='function' && abdmEnabled() ? `<button class="profile-menu-logout" style="color:var(--text-main);" onclick="renderCurrentView('p-abha');document.getElementById('profile-menu').classList.add('hidden')"><i class="fa-solid fa-id-card-clip"></i> ABHA Health ID</button>` : ''}
      ${currentRole==='responder' ? `<button class="profile-menu-logout" style="color:var(--text-main);" onclick="beginLiveLocationTracking('responder');showToast('Refreshing location','Re-requesting GPS access…','info')"><i class="fa-solid fa-location-crosshairs"></i> Refresh live location</button>` : ''}
      ${currentRole==='hospital' ? `<button class="profile-menu-logout" style="color:var(--text-main);" onclick="captureOneTimeLocation('hospital').then(()=>showToast('Location updated','Facility position recalibrated.','success'))"><i class="fa-solid fa-location-crosshairs"></i> Recalibrate location</button>` : ''}
      ${currentRole==='police' ? `<button class="profile-menu-logout" style="color:var(--text-main);" onclick="captureOneTimeLocation('police').then(()=>showToast('Location updated','Station position recalibrated.','success'))"><i class="fa-solid fa-location-crosshairs"></i> Recalibrate location</button>` : ''}
      <button class="profile-menu-logout" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Log out</button>
    </div>`;
}
function logout(silent){
  if(typeof abdmResetViewState==='function') abdmResetViewState();
  if(typeof dlResetViewState==='function') dlResetViewState();
  cycSessionUnlocked = false; // re-lock Women's Health so the next person to open this device must re-enter the PIN
  if(liveTrackingTimer){ clearInterval(liveTrackingTimer); liveTrackingTimer=null; }
  stopDeliveryBoyLiveTracking(); // stop listening to a tracked delivery boy's live-position doc
  stopAllLiveLocationTracking();
  cleanupMap();
  teardownPrivateAccountSync(); // stop listening to this account's fitness/cycle/vitals/etc. docs
  teardownNotificationSync(); // stop listening to this account's notification inbox
  teardownPhase1bApptRxSync(); // stop listening to this role's appointment/prescription partition(s)
  document.getElementById('profile-menu').classList.add('hidden');
  audit(currentRole||'system', 'session', 'Logged out');
  dbSet('auth', {verified:false, consent:false});
  clearActiveSession();
  document.getElementById('app-shell').classList.add('hidden');
  document.body.removeAttribute('data-role');
  currentRole = null;
  patientAuthStep = 'email';
  patientAuthData = {};
  patientAuthMode = null;
  pendingOtp = null;
  roleAuthStep = 'email';
  roleAuthData = {};
  roleAuthMode = null;
  rolePendingOtp = null;
  doctorAuthData = {};
  CURRENT_DOCTOR_ID = null;
  deliveryAuthData = {};
  CURRENT_DELIVERY_ID = null;
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-doctor-login').classList.add('hidden');
  document.getElementById('screen-delivery-login').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
  renderLandingBadges();
  if(!silent) showToast('Logged out', 'Come back any time — your data stays saved on this device.');
}
// Doctor accounts are a separate identity from the hospital's own login, so
// jumping here from inside the hospital console first ends the hospital's
// session quietly (no "Logged out" toast — this isn't really a logout from
// the hospital staff's point of view, just a handover) and drops straight
// into doctor sign-in instead of bouncing through role selection.
function openDoctorLoginFromHospital(){
  logout(true);
  openDoctorLoginScreen();
}
// Same handover pattern, for a pharmacy's delivery boys.
function openDeliveryLoginFromPharmacy(){
  logout(true);
  openDeliveryLoginScreen();
}
