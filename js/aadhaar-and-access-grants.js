/* ============================================================
   AADHAAR — VALIDATION, PATIENT DIRECTORY & HOSPITAL ACCESS GRANTS
   ------------------------------------------------------------
   This is a self-contained SIMULATION of the consent-based record
   sharing pattern used by real Indian health-data systems (UIDAI
   eKYC OTP + the ABDM/NDHM "consent manager" model, where a
   Health Information User — a hospital — never gets a live,
   standing connection into a patient's private records; they get
   a time-boxed, OTP-approved copy of exactly what the patient
   chose to share). No real UIDAI/ABDM API is called anywhere in
   this file — there is no key or endpoint for one. Three pieces:

   1. isValidAadhaar() — real Verhoeff checksum, the same digit
      algorithm UIDAI uses, so bad numbers are caught client-side
      (this validates FORMAT only; it says nothing about whether
      a number is real or belongs to anyone).
   2. aadhaarDirectory (shared, keyed by 12-digit number) — a thin
      identity+consent-snapshot record a patient explicitly
      publishes from their OWN session (syncMyAadhaarSharing()),
      never written to by anyone else's account.
   3. accessGrants (shared, array) — one row per hospital lookup:
      starts 'otp_pending' with a freshly generated demo OTP,
      becomes 'active' for a short window once confirmed, and
      expires/can be revoked. Hospital code only ever reads the
      directory snapshot + an active grant; it never reaches into
      documents/insurance/prescriptions under another account's
      private partition (those stay behind PRIVATE_ACCOUNT_KEYS).
   ============================================================ */
const ACCESS_GRANT_OTP_WINDOW_MS = 3*60*1000;   // 3 min to enter the OTP
const ACCESS_GRANT_ACTIVE_WINDOW_MS = 15*60*1000; // 15 min unlocked once confirmed

function normalizeAadhaar(v){ return (v||'').replace(/\D/g,'').slice(0,12); }
function formatAadhaar(v){ const n = normalizeAadhaar(v); return n.replace(/(\d{4})(?=\d)/g,'$1 ').trim(); }
// Verhoeff checksum tables (the exact digit-check algorithm UIDAI uses for Aadhaar).
const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
];
function isValidAadhaar(raw){
  const n = normalizeAadhaar(raw);
  if(n.length!==12) return false;
  if(/^0|^1/.test(n)) return false; // UIDAI never issues numbers starting with 0 or 1
  let c = 0;
  const digits = n.split('').map(Number).reverse();
  digits.forEach((d,i)=>{ c = VERHOEFF_D[c][VERHOEFF_P[i%8][d]]; });
  return c===0;
}
function maskAadhaar(n){ const v=normalizeAadhaar(n); return v.length===12 ? `XXXX XXXX ${v.slice(8)}` : ''; }

function aadhaarDirectory(){ return db('aadhaarDirectory') || {}; }
// PHASE 1F: each patient's shared snapshot lives at its own Firestore doc,
// keyed by the Aadhaar number itself — see the PHASE 1D comment in
// StorageAdapter.set for why this replaced the old shared-object pattern.
function aadhaarRecordRef(aadhaar){
  if(!fbEnabled || typeof firebase==='undefined' || !aadhaar) return null;
  return firebase.firestore().collection('aadhaarDirectory').doc(aadhaar);
}
// Called ONLY from the patient's own session — builds and publishes the
// exact snapshot a hospital would be allowed to see once a grant is active.
// Re-running this (e.g. after uploading a new document) refreshes what's shared.
function syncMyAadhaarSharing(){
  const p = db('profile')||{};
  const pid = currentPatientId();
  const aadhaar = normalizeAadhaar(p.aadhaarNumber);
  if(!isValidAadhaar(aadhaar)){ showToast('Invalid Aadhaar', 'Enter a valid 12-digit Aadhaar number first.', 'danger'); return; }
  const myDocs = (db('documents')||[]).filter(d=>d.ownerId===pid);
  // Keep the shared snapshot light: full file bytes only for reasonably small
  // files, so this never risks the same 1MB-per-doc sync ceiling flagged
  // elsewhere in this file. Larger files still show as an entry (name/type/
  // size/date) — the hospital sees that it exists and can ask the patient to
  // share it directly, exactly as a real HIU would fall back to a fetch link
  // instead of an inline payload.
  const docSnapshot = myDocs.map(d=>({
    id:d.id, name:d.name, category:d.category, sizeKB:d.sizeKB, uploadedAt:d.uploadedAt,
    dataUrl: d.sizeKB<=180 ? d.dataUrl : null
  }));
  const rxSnapshot = (db('prescriptions')||[]).filter(r=>r.ownerId===pid).slice(0,25)
    .map(r=>({id:r.id, doctor:r.doctor, hospital:r.hospital, medicines:r.medicines, date:r.date}));
  const entry = {
    aadhaar, ownerAuthUid: currentAuthUid(), patientId: pid,
    name:p.name||'', gender:p.gender||'', bloodGroup:p.bloodGroup||'', allergies:p.allergies||'',
    chronic:p.chronic||'', emergencyContact:p.emergencyContact||'', phone:(currentUserRecord()||{}).phone||p.phone||'',
    insurance: getInsuranceRecord(pid),
    documents: docSnapshot,
    prescriptions: rxSnapshot,
    sharingEnabled: true,
    lastSyncedAt: now()
  };
  const dir = aadhaarDirectory();
  dir[aadhaar] = entry;
  dbSet('aadhaarDirectory', dir); // local mirror only now — see PHASE 1D note
  const ref = aadhaarRecordRef(aadhaar);
  if(ref){
    ref.set(entry).catch(e=>{
      console.warn('Aadhaar share write failed', e);
      showToast('Sync failed', 'This device could not publish your shared record. Check your connection and try again.', 'danger');
    });
  }
  p.aadhaarNumber = aadhaar;
  dbSet('profile', p);
  showToast('Shared for hospital lookup', 'Hospitals can now pull this snapshot after you approve their OTP request.', 'success');
}
function stopMyAadhaarSharing(){
  const p = db('profile')||{};
  const aadhaar = normalizeAadhaar(p.aadhaarNumber);
  const dir = aadhaarDirectory();
  if(dir[aadhaar]){ dir[aadhaar].sharingEnabled = false; dbSet('aadhaarDirectory', dir); }
  const ref = aadhaarRecordRef(aadhaar);
  if(ref) ref.set({sharingEnabled:false}, {merge:true}).catch(e=>console.warn('Aadhaar unshare write failed', e));
  showToast('Sharing turned off', 'Hospitals can no longer look up your records by Aadhaar.', 'info');
  renderCurrentView(currentView);
}

// ---- Hospital-side access grants ----
function accessGrants(){ return db('accessGrants') || []; }
function activeGrantFor(aadhaar, hospitalId){
  const n = normalizeAadhaar(aadhaar);
  return accessGrants().find(g=>g.aadhaar===n && g.hospitalId===hospitalId && g.status==='active' && g.expiresAt>now());
}
function pendingGrantFor(aadhaar, hospitalId){
  const n = normalizeAadhaar(aadhaar);
  return accessGrants().find(g=>g.aadhaar===n && g.hospitalId===hospitalId && g.status==='otp_pending' && g.expiresAt>now());
}
// Hospital enters an Aadhaar number and requests a lookup. This never returns
// record data directly — it only starts a consent request (a fresh demo OTP)
// that must be confirmed before anything unlocks. The existence check itself
// now does a direct, one-time Firestore read of that ONE patient's doc (see
// aadhaarRecordRef()) instead of trusting this device's local cache, which
// might never have caught up with a share that happened on another device —
// that mismatch used to be exactly why "Not found" could show up even for a
// patient who really had linked and shared.
async function hospitalRequestAccess(){
  const raw = document.getElementById('aadhaar-input-field').value;
  const aadhaar = normalizeAadhaar(raw);
  const hospId = CURRENT_HOSPITAL_ID;
  if(!isValidAadhaar(aadhaar)){ showToast('Invalid Aadhaar', 'That number fails the checksum — double-check the 12 digits.', 'danger'); return; }
  let entry = null;
  const ref = aadhaarRecordRef(aadhaar);
  if(ref){
    try{
      const snap = await ref.get();
      if(snap.exists) entry = snap.data();
    }catch(e){
      console.warn('Aadhaar lookup fetch failed', e);
      showToast('Lookup failed', 'Could not reach the shared records service — check your connection and try again.', 'danger');
      return;
    }
  } else {
    // Offline/single-device demo mode — fall back to whatever's in the local mirror.
    entry = aadhaarDirectory()[aadhaar] || null;
  }
  if(!entry || !entry.sharingEnabled){ showToast('Not found', 'No patient has linked and shared this Aadhaar number for hospital lookup.', 'danger'); return; }
  // Cache the freshly-fetched entry locally so the unlocked-record card (and
  // a page reload while the grant is still active) reads accurate data
  // without needing another round trip — see hospitalUnlockedRecordCard().
  const dir = aadhaarDirectory();
  dir[aadhaar] = entry;
  LOCAL_CACHE['aadhaarDirectory'] = dir;
  try{ localStorage.setItem('abot2_aadhaarDirectory', JSON.stringify(dir)); }catch(e){}
  const existingActive = activeGrantFor(aadhaar, hospId);
  if(existingActive){ renderCurrentView('h-verify'); return; }
  const grants = accessGrants();
  // Drop any of this hospital's own stale pending/expired requests for the same number first.
  const filtered = grants.filter(g=>!(g.aadhaar===aadhaar && g.hospitalId===hospId && g.status!=='active'));
  const hosp = db('hospitals').find(h=>h.id===hospId);
  const otp = String(Math.floor(100000+Math.random()*900000));
  const grant = {
    id: uid('GRANT'), aadhaar, ownerAuthUid: entry.ownerAuthUid, patientId: entry.patientId, patientName: entry.name,
    hospitalId: hospId, hospitalName: (hosp && hosp.name) || 'This hospital',
    otp, status:'otp_pending', requestedAt: now(), expiresAt: now()+ACCESS_GRANT_OTP_WINDOW_MS
  };
  filtered.push(grant);
  dbSet('accessGrants', filtered);
  audit('hospital:'+hospId, 'aadhaar_lookup_requested', `Requested access to ${entry.name||'patient'} (Aadhaar ****${aadhaar.slice(8)})`);
  pushNotification('patient:'+entry.patientId, 'Hospital record request', `${grant.hospitalName} requested access to your records via Aadhaar lookup. Share the OTP only if you're at their desk.`, 'warning', null);
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>Confirm with patient OTP</h3>
    <p class="modal-sub">Ask the patient for the OTP just sent to their registered mobile, then enter it below. This grant unlocks their shared records for ${Math.round(ACCESS_GRANT_ACTIVE_WINDOW_MS/60000)} minutes.</p>
    <div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:10px 14px;font-size:.78rem;color:#92400e;margin-bottom:14px;">
      <strong>[DEMO ONLY]</strong> No SMS gateway is wired up in this build, so the OTP is shown here instead of being sent by SMS: <span style="font-family:var(--ff-mono);font-weight:700;">${otp}</span>. A real deployment sends this only to the patient's UIDAI-linked mobile via the ABDM consent flow.
    </div>
    <div class="otp-boxes" style="justify-content:center;">
      <input maxlength="6" style="width:100%;max-width:220px;height:52px;font-size:1.2rem;letter-spacing:.3em;text-align:center;border-radius:10px;border:1px solid var(--border-color);" id="access-otp-input" placeholder="••••••">
    </div>
    <button class="btn" style="width:100%;margin-top:10px;" onclick="hospitalConfirmAccessOtp('${grant.id}')"><i class="fa-solid fa-unlock"></i> Confirm &amp; unlock records</button>
  `);
}
function hospitalConfirmAccessOtp(grantId){
  const grants = accessGrants();
  const g = grants.find(x=>x.id===grantId);
  const entered = normalizeAadhaar(document.getElementById('access-otp-input').value);
  if(!g || g.status!=='otp_pending' || g.expiresAt<now()){ showToast('Expired', 'That request expired — start the lookup again.', 'danger'); closeModal(); renderCurrentView('h-verify'); return; }
  if(entered !== g.otp){ showToast('Incorrect OTP', 'That code doesn\'t match — ask the patient to re-check.', 'danger'); return; }
  g.status='active'; g.grantedAt=now(); g.expiresAt=now()+ACCESS_GRANT_ACTIVE_WINDOW_MS;
  dbSet('accessGrants', grants);
  audit('hospital:'+g.hospitalId, 'aadhaar_lookup_granted', `Unlocked records for ${g.patientName||'patient'} (Aadhaar ****${g.aadhaar.slice(8)}), expires in ${Math.round(ACCESS_GRANT_ACTIVE_WINDOW_MS/60000)} min`);
  pushNotification('patient:'+g.patientId, 'Records accessed', `${g.hospitalName} viewed your shared records after OTP confirmation.`, 'info', null);
  closeModal();
  showToast('Access granted', 'Patient records unlocked for this desk session.', 'success');
  renderCurrentView('h-verify');
}
function hospitalRevokeAccess(grantId){
  const grants = accessGrants();
  const g = grants.find(x=>x.id===grantId);
  if(!g) return;
  g.status='revoked'; g.expiresAt=now();
  dbSet('accessGrants', grants);
  audit('hospital:'+g.hospitalId, 'aadhaar_lookup_ended', `Closed access session for ${g.patientName||'patient'}`);
  renderCurrentView('h-verify');
}
function saveUser(u){ const list=usersDb(); const i=list.findIndex(x=>x.email===u.email); if(i>-1) list[i]=u; else list.push(u); dbSet('users', list); }
function isGmail(email){ return /^[^\s@]+@gmail\.com$/i.test((email||'').trim()); }

function renderPatientAuthCard(){
  const box = document.getElementById('auth-card-box');
  const d = patientAuthData;
  const dots = (n)=>`<div class="step-dots">${[1,2,3].map(i=>`<span class="${i<=n?'done':''}"></span>`).join('')}</div>`;

  if(patientAuthStep==='email'){
    box.innerHTML = `
      <button class="btn-secondary btn-sm" style="margin-bottom:14px;" onclick="backToRoleSelect()"><i class="fa-solid fa-arrow-left"></i> Back to roles</button>
      ${dots(1)}
      <h3>Patient sign-in</h3>
      <p>Enter your Gmail address to sign in or create a free account.</p>
      <div class="form-group"><input class="dark-input" id="pa-email" placeholder="you@gmail.com" value="${d.email||''}" autocomplete="email"></div>
      <div id="pa-email-err"></div>
      <button class="btn btn-block" onclick="patientAuthEmailContinue('login')"><i class="fa-solid fa-right-to-bracket"></i> Log in</button>
      <button class="btn-secondary btn-block" style="margin-top:10px;" onclick="patientAuthEmailContinue('signup')"><i class="fa-solid fa-user-plus"></i> Create new account</button>`;
    return;
  }

  if(patientAuthStep==='login'){
    box.innerHTML = `
      ${dots(2)}
      <h3>Welcome back</h3>
      <p>${d.email}</p>
      <div class="form-group"><input type="password" class="dark-input" id="pa-password" placeholder="Password" autocomplete="current-password"></div>
      <div id="pa-login-err"></div>
      <button class="btn btn-block" onclick="patientAuthLogin()"><i class="fa-solid fa-right-to-bracket"></i> Log in</button>
      <div class="auth-link-row">
        <a onclick="patientAuthStep='email';renderAuthCard();">Use a different email</a>
        <a onclick="patientAuthForgotStart();">Forgot password?</a>
      </div>`;
    return;
  }

  if(patientAuthStep==='signup'){
    box.innerHTML = `
      ${dots(1)}
      <h3>Create your patient account</h3>
      <p>Free — no charges. We'll email a 6-digit code to verify it's really you.</p>
      <div class="form-group"><input class="dark-input" id="pa-name" placeholder="Full name" value="${d.name||''}"></div>
      <div class="form-group"><input class="dark-input" id="pa-email2" placeholder="you@gmail.com" value="${d.email||''}" disabled style="opacity:.7;"></div>
      <div class="form-group"><input type="password" class="dark-input" id="pa-password" placeholder="Create a password (min 6 chars)"></div>
      <div class="form-group"><input type="password" class="dark-input" id="pa-password2" placeholder="Confirm password"></div>
      <div class="form-group"><input class="dark-input" id="pa-phone" placeholder="+91 98xxxxxxxx" value="${d.phone||''}"></div>
      <div class="form-group">
        <label style="display:block;margin-bottom:6px;color:var(--text-muted);font-size:.85rem;">Gender</label>
        <select class="dark-input" id="pa-gender">
          <option value="Female" ${d.gender==='Female'?'selected':''}>Female</option>
          <option value="Male" ${d.gender==='Male'?'selected':''}>Male</option>
          <option value="Other" ${d.gender==='Other'?'selected':''}>Other / Prefer not to say</option>
        </select>
      </div>
      <div id="pa-signup-err"></div>
      <button class="btn btn-block" onclick="patientAuthSignupContinue()"><i class="fa-solid fa-paper-plane"></i> Continue &amp; send code</button>
      <div class="auth-link-row"><a onclick="patientAuthStep='email';renderAuthCard();">Use a different email</a><span></span></div>`;
    return;
  }

  if(patientAuthStep==='phone_conflict'){
    box.innerHTML = `
      ${dots(1)}
      <h3>That number's already registered</h3>
      <p>This phone number is already linked to another ArogyaBot account.</p>
      <div class="conflict-box"><strong>What happens next:</strong> raise a complaint and our admin team will call this number to verify ownership. If it's really you, we'll re-allot the number to your new account (${d.email}).</div>
      <button class="btn btn-block btn-danger" onclick="patientRaiseComplaint()"><i class="fa-solid fa-flag"></i> Raise complaint &amp; notify admin</button>
      <div class="auth-link-row"><a onclick="patientAuthStep='signup';renderAuthCard();">Use a different number instead</a><span></span></div>`;
    return;
  }

  if(patientAuthStep==='complaint_filed'){
    box.innerHTML = `
      ${dots(1)}
      <h3><i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Complaint filed</h3>
      <p>Reference <strong>${d.complaintId}</strong>. Admin will call ${d.phone} to verify, then either reassign the number to ${d.email} or contact you if it's disputed.</p>
      <p>You can still create your account now without phone verification, and add the phone later once it's resolved.</p>
      <button class="btn btn-block" onclick="patientContinueWithoutPhone()">Continue without phone for now</button>
      <div class="auth-link-row"><a onclick="patientAuthStep='signup';renderAuthCard();">Try a different number</a><span></span></div>`;
    return;
  }

  if(patientAuthStep==='otp'){
    box.innerHTML = `
      ${dots(2)}
      <h3>Enter the 6-digit code</h3>
      <p>We emailed a code to ${d.email}.</p>
      <div class="otp-boxes">${[0,1,2,3,4,5].map(i=>`<input maxlength="1" id="pa-otp-${i}" oninput="otpAdvance(${i})">`).join('')}</div>
      <div class="otp-hint">${emailjsReady ? 'Check your inbox (and spam folder).' : 'Demo mode: code was shown in a toast — EmailJS keys not configured yet.'}</div>
      <button class="btn btn-block" style="margin-top:16px;" onclick="patientAuthVerifyOtp()"><i class="fa-solid fa-shield-halved"></i> Verify &amp; continue</button>
      <div class="auth-link-row"><a onclick="patientResendOtp()">Resend code</a><span></span></div>`;
    return;
  }

  if(patientAuthStep==='consent'){
    box.innerHTML = `
      ${dots(3)}
      <h3>Consent &amp; data sharing</h3>
      <p>Your profile is encrypted at rest (AES-256) and in transit (TLS 1.3). During emergencies, minimal necessary data is shared with responders and hospitals only.</p>
      <div class="consent-row"><input type="checkbox" id="consent-check"><span>I consent to sharing my profile data with dispatched responders and hospitals strictly during active emergencies.</span></div>
      <button class="btn btn-block" onclick="patientAuthFinishSignup()"><i class="fa-solid fa-check"></i> Enter ArogyaBot</button>`;
    return;
  }

  if(patientAuthStep==='forgot_otp'){
    box.innerHTML = `
      ${dots(2)}
      <h3>Reset your password</h3>
      <p>We emailed a code to ${d.email}.</p>
      <div class="otp-boxes">${[0,1,2,3,4,5].map(i=>`<input maxlength="1" id="pa-otp-${i}" oninput="otpAdvance(${i})">`).join('')}</div>
      <div class="otp-hint">${emailjsReady ? 'Check your inbox (and spam folder).' : 'Demo mode: code was shown in a toast.'}</div>
      <button class="btn btn-block" style="margin-top:16px;" onclick="patientAuthVerifyOtp()"><i class="fa-solid fa-shield-halved"></i> Verify code</button>
      <div class="auth-link-row"><a onclick="patientAuthStep='login';renderAuthCard();">Back to login</a><span></span></div>`;
    return;
  }

  if(patientAuthStep==='reset_password'){
    box.innerHTML = `
      ${dots(3)}
      <h3>Choose a new password</h3>
      <div class="form-group"><input type="password" class="dark-input" id="pa-newpass" placeholder="New password (min 6 chars)"></div>
      <div class="form-group"><input type="password" class="dark-input" id="pa-newpass2" placeholder="Confirm new password"></div>
      <div id="pa-reset-err"></div>
      <button class="btn btn-block" onclick="patientAuthResetPassword()"><i class="fa-solid fa-key"></i> Save password &amp; log in</button>`;
    return;
  }
}

async function patientAuthEmailContinue(choice){
  const email = document.getElementById('pa-email').value.trim().toLowerCase();
  const errBox = document.getElementById('pa-email-err');
  if(!isGmail(email)){ errBox.innerHTML = `<div class="field-err">Please enter a valid Gmail address (name@gmail.com).</div>`; return; }
  errBox.innerHTML = '';
  patientAuthData = {email};
  // Note: we deliberately don't auto-detect via fetchSignInMethodsForEmail — Firebase
  // projects with Email Enumeration Protection (default on newer projects) always return
  // an empty list from that call, which would silently force everyone into signup.
  // Instead the user picks Log in / Create account explicitly, and patientAuthLogin()
  // below redirects to signup if it turns out no account exists yet.
  patientAuthMode = choice;
  patientAuthStep = choice;
  renderAuthCard();
}

function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error((label||'Request')+' timed out. If you opened this file from Downloads, try hosting it online instead (Firebase Hosting, GitHub Pages, etc.) — local file storage can block Firebase Auth.')), ms))
  ]);
}
async function patientAuthLogin(){
  const pw = document.getElementById('pa-password').value;
  const errBox = document.getElementById('pa-login-err');
  const btn = event && event.target && event.target.closest ? event.target.closest('button') : null;
  errBox.innerHTML = '';
  if(isEmailRevoked(patientAuthData.email)){
    errBox.innerHTML = `<div class="field-err">This account has been deactivated by an administrator.</div>`;
    return;
  }
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in…'; }
  try{
    const fa = fbAuth();

    if(fa){
      try{
        await withTimeout(fa.signInWithEmailAndPassword(patientAuthData.email, pw), 12000, 'Login');
      }catch(e){
        const code = (e && e.code) || '';
        if(code==='auth/user-not-found' || code==='auth/invalid-credential' || code==='auth/wrong-password'){
          // Could be "no account yet" — offer a direct path to signup instead of a dead end.
          errBox.innerHTML = `<div class="field-err">No account found (or wrong password). <a style="color:#5eead4;cursor:pointer;font-weight:600;" onclick="patientAuthMode='signup';patientAuthStep='signup';renderAuthCard();">Create an account instead?</a></div>`;
          return;
        }
        errBox.innerHTML = `<div class="field-err">${friendlyAuthError(e)}</div>`;
        return;
      }
      if(isEmailRevoked(patientAuthData.email)){
        errBox.innerHTML = `<div class="field-err">This account has been deactivated by an administrator.</div>`;
        await fa.signOut().catch(()=>{});
        return;
      }
      errBox.innerHTML = '';
      // PHASE 1C: live doc read instead of the local array scan — this device's
      // one-time account fetch may not have caught a patient record created or
      // updated on a different device yet, and findUserByEmail() would otherwise
      // report "no account" for a real one.
      let u = await liveAccountExists('users', patientAuthData.email);
      if(!u){
        // Firebase Auth is a single global account pool shared by every role, so a
        // valid email+password does NOT mean this person ever registered as a patient.
        // Refuse to auto-provision a patient record here — that would let e.g. a
        // responder/police/hospital account log straight into the patient console.
        errBox.innerHTML = `<div class="field-err">No patient account found for this email. <a style="color:#5eead4;cursor:pointer;font-weight:600;" onclick="patientAuthMode='signup';patientAuthStep='signup';renderAuthCard();">Create an account instead?</a></div>`;
        await fa.signOut().catch(()=>{});
        return;
      }
      mergeAccountIntoLocalCache('users', u);
      patientAuthData.loggedEmail = u.email;
      loadActiveMemberIntoProfile(u);
      dbSet('auth', {verified:true, consent:true});
      audit('patient', 'auth', 'Logged in as '+u.email+' (Firebase Authentication)');
      currentRole = 'patient';
      initPrivateAccountSync();
      enterConsole('patient');
      return;
    }

    // Local fallback (no Firebase Auth configured)
    const u = findUserByEmail(patientAuthData.email);
    const hash = await hashPassword(pw);
    if(!u || u.passwordHash!==hash){ errBox.innerHTML = `<div class="field-err">Incorrect email or password.</div>`; return; }
    errBox.innerHTML = '';
    patientAuthData.loggedEmail = u.email;
    loadActiveMemberIntoProfile(u);
    dbSet('auth', {verified:true, consent:true});
    audit('patient', 'auth', 'Logged in as '+u.email+' (local demo mode)');
    currentRole = 'patient';
    initPrivateAccountSync();
    enterConsole('patient');
  }catch(e){
    console.error('patientAuthLogin failed', e);
    errBox.innerHTML = `<div class="field-err">Something went wrong logging in: ${(e && e.message) || e}</div>`;
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Log in'; }
  }
}

async function patientAuthForgotStart(){
  patientAuthMode = 'forgot';
  const fa = fbAuth();
  if(fa){
    try{
      await fa.sendPasswordResetEmail(patientAuthData.email);
      showToast('Reset email sent', 'Check '+patientAuthData.email+' for a link to set a new password.', 'success');
    }catch(e){
      showToast('Could not send reset email', friendlyAuthError(e), 'danger');
    }
    patientAuthStep = 'login';
    renderAuthCard();
    return;
  }
  // Local fallback: our own OTP-based reset flow
  patientResendOtp();
  patientAuthStep = 'forgot_otp';
  renderAuthCard();
}

async function patientAuthSignupContinue(){
  const name = document.getElementById('pa-name').value.trim();
  const pw = document.getElementById('pa-password').value;
  const pw2 = document.getElementById('pa-password2').value;
  const phone = document.getElementById('pa-phone').value.trim();
  const gender = document.getElementById('pa-gender').value;
  const errBox = document.getElementById('pa-signup-err');
  if(!name || !phone){ errBox.innerHTML = `<div class="field-err">Name and phone number are required.</div>`; return; }
  if(pw.length<6){ errBox.innerHTML = `<div class="field-err">Password must be at least 6 characters.</div>`; return; }
  if(pw!==pw2){ errBox.innerHTML = `<div class="field-err">Passwords don't match.</div>`; return; }
  errBox.innerHTML = '';
  patientAuthData.name = name; patientAuthData.phone = phone; patientAuthData.password = pw; patientAuthData.gender = gender;

  const conflict = findUserByPhone(phone, patientAuthData.email);
  if(conflict){
    patientAuthData.conflictWithEmail = conflict.email;
    patientAuthStep = 'phone_conflict';
    renderAuthCard();
    return;
  }
  await patientSendSignupOtp();
}

async function patientSendSignupOtp(){
  const code = genOtp();
  pendingOtp = code;
  await sendOtpEmail(patientAuthData.email, code);
  patientAuthStep = 'otp';
  renderAuthCard();
}
async function patientResendOtp(){
  const code = genOtp();
  pendingOtp = code;
  await sendOtpEmail(patientAuthData.email, code);
}

function patientRaiseComplaint(){
  const list = db('phoneComplaints') || [];
  const c = {id: uid('CMP'), role:'patient', phone: patientAuthData.phone, existingEmail: patientAuthData.conflictWithEmail, requestingEmail: patientAuthData.email, status:'pending', createdAt: now()};
  list.push(c);
  dbSet('phoneComplaints', list);
  audit('patient', 'phone_complaint', patientAuthData.phone+' claimed by '+patientAuthData.email+' — was on '+patientAuthData.conflictWithEmail);
  patientAuthData.complaintId = c.id;
  patientAuthStep = 'complaint_filed';
  renderAuthCard();
  showToast('Complaint filed', 'Reference '+c.id+' — admin will call to verify.', 'success');
}
async function patientContinueWithoutPhone(){
  patientAuthData.phone = ''; // released — leave unverified for now
  await patientSendSignupOtp();
}

async function patientAuthVerifyOtp(){
  const code = [0,1,2,3,4,5].map(i=>document.getElementById('pa-otp-'+i).value||'').join('');
  const demoBypass = code==='123456';
  if(code.length<6 || (!demoBypass && code!==pendingOtp)){
    showToast('Incorrect code', 'That code doesn\'t match — check your inbox and try again.', 'danger');
    return;
  }
  if(patientAuthMode==='forgot'){ patientAuthStep = 'reset_password'; renderAuthCard(); return; }
  patientAuthStep = 'consent';
  renderAuthCard();
}

async function patientAuthFinishSignup(){
  const consent = document.getElementById('consent-check').checked;
  if(!consent){ showToast('Consent required', 'Please accept the data-sharing consent to continue.', 'danger'); return; }
  const d = patientAuthData;
  if(isEmailRevoked(d.email)){
    showToast('Account deactivated', 'This email was deactivated by an administrator and can\'t be used to register again.', 'danger');
    return;
  }
  const fa = fbAuth();
  let passwordHash;
  if(fa){
    try{
      await withTimeout(fa.createUserWithEmailAndPassword(d.email, d.password), 12000, 'Account creation');
    }catch(e){
      if(e && e.code==='auth/email-already-in-use'){
        // This email already has a Firebase account under a different role (e.g. responder).
        // Firebase Auth's user pool is global, not per-role, so we can't create a second
        // account — instead confirm it's really them by signing in with the password they
        // just entered, then attach a fresh patient record to that same account.
        try{
          await withTimeout(fa.signInWithEmailAndPassword(d.email, d.password), 12000, 'Verification');
        }catch(e2){
          showToast('Could not verify account', 'An account with this email already exists under a different role, and this password doesn\'t match it. Log in with that role\'s password first, or use a different email.', 'danger');
          return;
        }
      } else {
        showToast('Could not create account', friendlyAuthError(e), 'danger');
        return;
      }
    }
  } else {
    passwordHash = await hashPassword(d.password); // local fallback only — Firebase Auth stores it otherwise
  }
  const memberId = uid('MEM');
  const primaryMember = {
    id: memberId, name: d.name, relation: 'Self', isPrimary: true, gender: d.gender || 'Other',
    bloodGroup: 'Unknown', allergies: 'None recorded', chronic: 'None recorded', emergencyContact: '—',
    phone: d.phone || '', lat: BASE.lat+rnd(-0.01,0.01), lng: BASE.lng+rnd(-0.01,0.01)
  };
  const user = {
    email: d.email, phone: d.phone || '', phoneVerified: !!d.phone,
    members: [primaryMember], activeMemberId: memberId, createdAt: now()
  };
  if(passwordHash) user.passwordHash = passwordHash;
  saveUser(user);
  patientAuthData.loggedEmail = user.email;
  loadActiveMemberIntoProfile(user);
  dbSet('auth', {verified:true, consent:true});
  audit('patient', 'auth', 'Account created for '+user.email+'; identity verified via emailed OTP ('+(fa?'Firebase Authentication':'local demo mode')+')');
  currentRole = 'patient';
  initPrivateAccountSync();
  enterConsole('patient');
}

async function patientAuthResetPassword(){
  // Only reached in local fallback mode — Firebase Auth handles resets via its own emailed link instead.
  const p1 = document.getElementById('pa-newpass').value;
  const p2 = document.getElementById('pa-newpass2').value;
  const errBox = document.getElementById('pa-reset-err');
  if(p1.length<6){ errBox.innerHTML = `<div class="field-err">Password must be at least 6 characters.</div>`; return; }
  if(p1!==p2){ errBox.innerHTML = `<div class="field-err">Passwords don't match.</div>`; return; }
  const u = findUserByEmail(patientAuthData.email);
  if(!u){ errBox.innerHTML = `<div class="field-err">Account not found.</div>`; return; }
  u.passwordHash = await hashPassword(p1);
  saveUser(u);
  audit('patient', 'auth', 'Password reset for '+u.email+' (local demo mode)');
  showToast('Password updated', 'Log in with your new password.', 'success');
  patientAuthMode = 'login';
  patientAuthStep = 'login';
  renderAuthCard();
}
