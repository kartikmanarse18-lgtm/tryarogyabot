/* ============================================================
   DOCTOR LOGIN — a doctor account is created BY a hospital (see
   addDoctorToRoster in the Hospital console), never self-signed-up.
   Because the hospital already vouches for the doctor's identity,
   this is deliberately a simple email+password login — no OTP, no
   phone verification, no consent step. Doctor sessions are scoped
   to CURRENT_DOCTOR_ID + CURRENT_HOSPITAL_ID so a doctor only ever
   sees their own patients/appointments, never another doctor's.
   ============================================================ */
let doctorAuthData = {};      // {loggedEmail}
let doctorLoginError = '';
function doctorUsersDb(){ return db('users_doctor') || []; }
function findDoctorUserByEmail(email){ return doctorUsersDb().find(u=>u.email===(email||'').trim().toLowerCase()); }
function saveDoctorUser(u){ const list=doctorUsersDb(); const i=list.findIndex(x=>x.email===u.email); if(i>-1) list[i]=u; else list.push(u); dbSet('users_doctor', list); }

function openDoctorLoginScreen(){
  document.getElementById('screen-landing').classList.add('hidden');
  document.getElementById('screen-doctor-login').classList.remove('hidden');
  doctorLoginError = '';
  renderDoctorLoginCard();
}
function backToRoleSelectFromDoctorLogin(){
  document.getElementById('screen-doctor-login').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
}
function renderDoctorLoginCard(){
  const box = document.getElementById('doctor-login-card-box');
  if(!box) return;
  box.innerHTML = `
    <h3>Doctor sign-in</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">Use the email and password your hospital admin gave you.</p>
    <div class="form-group"><label>Email</label><input class="form-control" id="doc-login-email" placeholder="you@hospital.com" onkeydown="if(event.key==='Enter')doctorLoginSubmit();"></div>
    <div class="form-group"><label>Password</label><input class="form-control" type="password" id="doc-login-password" placeholder="Password" onkeydown="if(event.key==='Enter')doctorLoginSubmit();"></div>
    ${doctorLoginError ? `<div class="field-err">${doctorLoginError}</div>` : ''}
    <button class="btn btn-block" onclick="doctorLoginSubmit()"><i class="fa-solid fa-right-to-bracket"></i> Log in</button>
    <p style="text-align:center;margin-top:14px;"><a href="#" onclick="backToRoleSelectFromDoctorLogin();return false;" style="color:var(--text-muted);font-size:.82rem;">&larr; Back</a></p>
  `;
}
async function doctorLoginSubmit(){
  const email = (document.getElementById('doc-login-email').value||'').trim().toLowerCase();
  const pw = document.getElementById('doc-login-password').value||'';
  if(!email || !pw){ doctorLoginError='Enter both email and password.'; renderDoctorLoginCard(); return; }
  if(isEmailRevoked(email)){ doctorLoginError='This account has been deactivated. Contact your hospital admin.'; renderDoctorLoginCard(); return; }
  // PHASE 1C: doctor accounts synced to /accounts/users_doctor/items/{email} —
  // a live doc read here is what lets a login added by the hospital on a
  // different device work immediately, instead of only after this device's
  // next one-time account fetch.
  const u = await liveAccountExists('users_doctor', email);
  if(!u){ doctorLoginError='No doctor account found for this email — ask your hospital admin to add you on their Doctor Roster.'; renderDoctorLoginCard(); return; }
  // PHASE 1D: accounts created after this pass carry a real Firebase Auth uid
  // instead of a local passwordHash — verify against Auth when present, and
  // fall back to the old local hash check for accounts created before this
  // migration (still perfectly valid, just not yet moved over).
  if(u.authUid){
    const fa = fbAuth();
    if(!fa){ doctorLoginError='Connect to the internet to log in.'; renderDoctorLoginCard(); return; }
    try{
      await withTimeout(fa.signInWithEmailAndPassword(email, pw), 12000, 'Login');
    }catch(e){
      doctorLoginError = friendlyAuthError(e); renderDoctorLoginCard(); return;
    }
  } else {
    const hash = await hashPassword(pw);
    if(hash !== u.passwordHash){ doctorLoginError='Incorrect password.'; renderDoctorLoginCard(); return; }
  }
  mergeAccountIntoLocalCache('users_doctor', u);
  const docRecord = (db('doctors')||[]).find(d=>d.id===u.doctorId);
  if(!docRecord){ doctorLoginError='Your doctor record no longer exists — contact your hospital admin.'; renderDoctorLoginCard(); return; }
  doctorLoginError='';
  loginAsDoctor(u);
}
function loginAsDoctor(u){
  currentRole = 'doctor';
  CURRENT_DOCTOR_ID = u.doctorId;
  CURRENT_HOSPITAL_ID = u.hospitalId;
  doctorAuthData = {loggedEmail: u.email};
  dbSet('auth', {verified:true, consent:true});
  document.getElementById('screen-doctor-login').classList.add('hidden');
  audit('doctor:'+CURRENT_DOCTOR_ID, 'auth', 'Doctor logged in: '+u.email);
  saveActiveSession('doctor');
  enterConsole('doctor');
}
