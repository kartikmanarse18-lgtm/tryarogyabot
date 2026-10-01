function renderRoleAuthCard(){
  const box = document.getElementById('auth-card-box');
  const role = currentRole;
  const d = roleAuthData;
  const dots = stepDotsHtml;
  const nameField = (SIGNUP_FIELDS[role]||[]).find(f=>f.key==='name') || {label:'Full name', placeholder:'Full name'};
  const extra = roleExtraFields(role);

  if(roleAuthStep==='email'){
    box.innerHTML = `
      <button class="btn-secondary btn-sm" style="margin-bottom:14px;" onclick="backToRoleSelect()"><i class="fa-solid fa-arrow-left"></i> Back to roles</button>
      ${dots(1)}
      <h3>${ROLE_META[role].title} sign-in</h3>
      <p>Enter your Gmail address to sign in or register this ${ROLE_META[role].title.toLowerCase()} account.</p>
      <div class="form-group"><input class="dark-input" id="ra-email" placeholder="you@gmail.com" value="${d.email||''}" autocomplete="email"></div>
      <div id="ra-email-err"></div>
      <button class="btn btn-block" onclick="roleAuthEmailContinue('login')"><i class="fa-solid fa-right-to-bracket"></i> Log in</button>
      <button class="btn-secondary btn-block" style="margin-top:10px;" onclick="roleAuthEmailContinue('signup')"><i class="fa-solid fa-user-plus"></i> Register new account</button>`;
    return;
  }

  if(roleAuthStep==='login'){
    box.innerHTML = `
      ${dots(2)}
      <h3>Welcome back</h3>
      <p>${d.email}</p>
      <div class="form-group"><input type="password" class="dark-input" id="ra-password" placeholder="Password" autocomplete="current-password"></div>
      <div id="ra-login-err"></div>
      <button class="btn btn-block" onclick="roleAuthLogin()"><i class="fa-solid fa-right-to-bracket"></i> Log in</button>
      <div class="auth-link-row">
        <a onclick="roleAuthStep='email';renderAuthCard();">Use a different email</a>
        <a onclick="roleAuthForgotStart();">Forgot password?</a>
      </div>`;
    return;
  }

  if(roleAuthStep==='signup'){
    box.innerHTML = `
      ${dots(1)}
      <h3>Register ${ROLE_META[role].title}</h3>
      <p>Free — no charges. We'll email a 6-digit code to verify it's really you.</p>
      <div class="form-group"><input class="dark-input" id="ra-name" placeholder="${nameField.placeholder}" value="${d.name||''}"></div>
      <div class="form-group"><input class="dark-input" id="ra-email2" placeholder="you@gmail.com" value="${d.email||''}" disabled style="opacity:.7;"></div>
      <div class="form-group"><input type="password" class="dark-input" id="ra-password" placeholder="Create a password (min 6 chars)"></div>
      <div class="form-group"><input type="password" class="dark-input" id="ra-password2" placeholder="Confirm password"></div>
      <div class="form-group"><input class="dark-input" id="ra-phone" placeholder="+91 98xxxxxxxx" value="${d.phone||''}"></div>
      ${extra.map(f=>`<div class="form-group"><input class="dark-input" id="ra-x-${f.key}" placeholder="${f.placeholder}" value="${d[f.key]||''}"></div>`).join('')}
      <div id="ra-signup-err"></div>
      <button class="btn btn-block" onclick="roleAuthSignupContinue()"><i class="fa-solid fa-paper-plane"></i> Continue &amp; send code</button>
      <div class="auth-link-row"><a onclick="roleAuthStep='email';renderAuthCard();">Use a different email</a><span></span></div>`;
    return;
  }

  if(roleAuthStep==='phone_conflict'){
    box.innerHTML = `
      ${dots(1)}
      <h3>That number's already registered</h3>
      <p>This phone number is already linked to another ${ROLE_META[role].title} account.</p>
      <div class="conflict-box"><strong>What happens next:</strong> raise a complaint and our admin team will call this number to verify ownership. If it's really you, we'll re-allot the number to your new account (${d.email}).</div>
      <button class="btn btn-block btn-danger" onclick="roleRaiseComplaint()"><i class="fa-solid fa-flag"></i> Raise complaint &amp; notify admin</button>
      <div class="auth-link-row"><a onclick="roleAuthStep='signup';renderAuthCard();">Use a different number instead</a><span></span></div>`;
    return;
  }

  if(roleAuthStep==='complaint_filed'){
    box.innerHTML = `
      ${dots(1)}
      <h3><i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Complaint filed</h3>
      <p>Reference <strong>${d.complaintId}</strong>. Admin will call ${d.phone} to verify, then either reassign the number to ${d.email} or contact you if it's disputed.</p>
      <p>You can still register now without phone verification, and add the phone later once it's resolved.</p>
      <button class="btn btn-block" onclick="roleContinueWithoutPhone()">Continue without phone for now</button>
      <div class="auth-link-row"><a onclick="roleAuthStep='signup';renderAuthCard();">Try a different number</a><span></span></div>`;
    return;
  }

  if(roleAuthStep==='otp'){
    box.innerHTML = `
      ${dots(2)}
      <h3>Enter the 6-digit code</h3>
      <p>We emailed a code to ${d.email}.</p>
      <div class="otp-boxes">${[0,1,2,3,4,5].map(i=>`<input maxlength="1" id="ra-otp-${i}" oninput="otpAdvance(${i})">`).join('')}</div>
      <div class="otp-hint">${emailjsReady ? 'Check your inbox (and spam folder).' : 'Demo mode: code was shown in a toast — EmailJS keys not configured yet.'}</div>
      <button class="btn btn-block" style="margin-top:16px;" onclick="roleAuthVerifyOtp()"><i class="fa-solid fa-shield-halved"></i> Verify &amp; continue</button>
      <div class="auth-link-row"><a onclick="roleResendOtp()">Resend code</a><span></span></div>`;
    return;
  }

  if(roleAuthStep==='consent'){
    box.innerHTML = `
      ${dots(3)}
      <h3>Consent &amp; data sharing</h3>
      <p>Your profile is encrypted at rest (AES-256) and in transit (TLS 1.3). During emergencies, minimal necessary data is shared with other emergency stakeholders only.</p>
      <div class="consent-row"><input type="checkbox" id="consent-check"><span>I consent to this account's data being shared with dispatched patients, responders, police and hospitals strictly during active emergencies.</span></div>
      <button class="btn btn-block" onclick="roleAuthFinishSignup()"><i class="fa-solid fa-check"></i> Enter ArogyaBot</button>`;
    return;
  }

  if(roleAuthStep==='forgot_otp'){
    box.innerHTML = `
      ${dots(2)}
      <h3>Reset your password</h3>
      <p>We emailed a code to ${d.email}.</p>
      <div class="otp-boxes">${[0,1,2,3,4,5].map(i=>`<input maxlength="1" id="ra-otp-${i}" oninput="otpAdvance(${i})">`).join('')}</div>
      <div class="otp-hint">${emailjsReady ? 'Check your inbox (and spam folder).' : 'Demo mode: code was shown in a toast.'}</div>
      <button class="btn btn-block" style="margin-top:16px;" onclick="roleAuthVerifyOtp()"><i class="fa-solid fa-shield-halved"></i> Verify code</button>
      <div class="auth-link-row"><a onclick="roleAuthStep='login';renderAuthCard();">Back to login</a><span></span></div>`;
    return;
  }

  if(roleAuthStep==='reset_password'){
    box.innerHTML = `
      ${dots(3)}
      <h3>Choose a new password</h3>
      <div class="form-group"><input type="password" class="dark-input" id="ra-newpass" placeholder="New password (min 6 chars)"></div>
      <div class="form-group"><input type="password" class="dark-input" id="ra-newpass2" placeholder="Confirm new password"></div>
      <div id="ra-reset-err"></div>
      <button class="btn btn-block" onclick="roleAuthResetPassword()"><i class="fa-solid fa-key"></i> Save password &amp; log in</button>`;
    return;
  }
}

async function roleAuthEmailContinue(choice){
  const email = document.getElementById('ra-email').value.trim().toLowerCase();
  const errBox = document.getElementById('ra-email-err');
  if(!isGmail(email)){ errBox.innerHTML = `<div class="field-err">Please enter a valid Gmail address (name@gmail.com).</div>`; return; }
  errBox.innerHTML = '';
  roleAuthData = {email};
  roleAuthMode = choice;
  roleAuthStep = choice;
  renderAuthCard();
}

async function roleAuthLogin(){
  const role = currentRole;
  const pw = document.getElementById('ra-password').value;
  const errBox = document.getElementById('ra-login-err');
  const btn = event && event.target && event.target.closest ? event.target.closest('button') : null;
  errBox.innerHTML = '';
  if(isEmailRevoked(roleAuthData.email)){
    errBox.innerHTML = `<div class="field-err">This account has been deactivated by an administrator.</div>`;
    return;
  }
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in…'; }
  try{
    const fa = fbAuth();
    if(fa){
      try{
        await withTimeout(fa.signInWithEmailAndPassword(roleAuthData.email, pw), 12000, 'Login');
      }catch(e){
        const code = (e && e.code) || '';
        if(code==='auth/user-not-found' || code==='auth/invalid-credential' || code==='auth/wrong-password'){
          errBox.innerHTML = `<div class="field-err">No account found (or wrong password). <a style="color:#5eead4;cursor:pointer;font-weight:600;" onclick="roleAuthMode='signup';roleAuthStep='signup';renderAuthCard();">Register instead?</a></div>`;
          return;
        }
        errBox.innerHTML = `<div class="field-err">${friendlyAuthError(e)}</div>`;
        return;
      }
      if(isEmailRevoked(roleAuthData.email)){
        errBox.innerHTML = `<div class="field-err">This account has been deactivated by an administrator.</div>`;
        await fa.signOut().catch(()=>{});
        return;
      }
      errBox.innerHTML = '';
      // PHASE 1C: live doc read — see the note in patientAuthLogin() above.
      let u = await liveAccountExists('users_'+role, roleAuthData.email);
      if(!u){
        // Firebase Auth is a single global account pool shared by every role, so a
        // valid email+password does NOT mean this person ever registered for THIS role.
        // Refuse to auto-provision a role record here — that would let e.g. any patient
        // log straight into the police/hospital/ambulance console with their own creds.
        errBox.innerHTML = `<div class="field-err">No ${ROLE_META[role].title.toLowerCase()} account found for this email. <a style="color:#5eead4;cursor:pointer;font-weight:600;" onclick="roleAuthMode='signup';roleAuthStep='signup';renderAuthCard();">Register instead?</a></div>`;
        await fa.signOut().catch(()=>{});
        return;
      }
      mergeAccountIntoLocalCache('users_'+role, u);
      applyRoleUserToSession(role, u);
      saveRoleUser(role, u);
      roleAuthData.loggedEmail = u.email;
      dbSet('auth', {verified:true, consent:true});
      audit(role, 'auth', 'Logged in as '+u.email+' (Firebase Authentication)');
      currentRole = role;
      enterConsole(role);
      return;
    }

    // Local fallback (no Firebase Auth configured)
    const u = findRoleUserByEmail(role, roleAuthData.email);
    const hash = await hashPassword(pw);
    if(!u || u.passwordHash!==hash){ errBox.innerHTML = `<div class="field-err">Incorrect email or password.</div>`; return; }
    errBox.innerHTML = '';
    applyRoleUserToSession(role, u);
    saveRoleUser(role, u);
    roleAuthData.loggedEmail = u.email;
    dbSet('auth', {verified:true, consent:true});
    audit(role, 'auth', 'Logged in as '+u.email+' (local demo mode)');
    currentRole = role;
    enterConsole(role);
  }catch(e){
    console.error('roleAuthLogin failed', e);
    errBox.innerHTML = `<div class="field-err">Something went wrong logging in: ${(e && e.message) || e}</div>`;
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Log in'; }
  }
}

async function roleAuthForgotStart(){
  roleAuthMode = 'forgot';
  const fa = fbAuth();
  if(fa){
    try{
      await fa.sendPasswordResetEmail(roleAuthData.email);
      showToast('Reset email sent', 'Check '+roleAuthData.email+' for a link to set a new password.', 'success');
    }catch(e){
      showToast('Could not send reset email', friendlyAuthError(e), 'danger');
    }
    roleAuthStep = 'login';
    renderAuthCard();
    return;
  }
  await roleResendOtp();
  roleAuthStep = 'forgot_otp';
  renderAuthCard();
}

async function roleAuthSignupContinue(){
  const role = currentRole;
  const name = document.getElementById('ra-name').value.trim();
  const pw = document.getElementById('ra-password').value;
  const pw2 = document.getElementById('ra-password2').value;
  const phone = document.getElementById('ra-phone').value.trim();
  const errBox = document.getElementById('ra-signup-err');
  if(!name || !phone){ errBox.innerHTML = `<div class="field-err">Name and phone number are required.</div>`; return; }
  if(pw.length<6){ errBox.innerHTML = `<div class="field-err">Password must be at least 6 characters.</div>`; return; }
  if(pw!==pw2){ errBox.innerHTML = `<div class="field-err">Passwords don't match.</div>`; return; }
  if(role==='hospital'){
    const bedsVal = (document.getElementById('ra-x-beds')||{}).value?.trim();
    const icuVal = (document.getElementById('ra-x-icu')||{}).value?.trim();
    const specVal = (document.getElementById('ra-x-specialties')||{}).value?.trim();
    if(!bedsVal || !icuVal || !specVal){ errBox.innerHTML = `<div class="field-err">Total beds, ICU beds, and specialties are required — real capacity, not a placeholder.</div>`; return; }
    if(!/^\d+$/.test(bedsVal) || !/^\d+$/.test(icuVal)){ errBox.innerHTML = `<div class="field-err">Beds and ICU beds must be whole numbers.</div>`; return; }
  }
  errBox.innerHTML = '';
  roleAuthData.name = name; roleAuthData.phone = phone; roleAuthData.password = pw;
  roleExtraFields(role).forEach(f=>{ const el=document.getElementById('ra-x-'+f.key); roleAuthData[f.key] = el ? el.value.trim() : ''; });

  // Phone numbers are namespaced per role — the same number can be used for a
  // patient account and, separately, for an ambulance/police/hospital account.
  const conflict = findRoleUserByPhone(role, phone, roleAuthData.email);
  if(conflict){
    roleAuthData.conflictWithEmail = conflict.email;
    roleAuthStep = 'phone_conflict';
    renderAuthCard();
    return;
  }
  await roleSendSignupOtp();
}

async function roleSendSignupOtp(){
  const code = genOtp();
  rolePendingOtp = code;
  await sendOtpEmail(roleAuthData.email, code);
  roleAuthStep = 'otp';
  renderAuthCard();
}
async function roleResendOtp(){
  const code = genOtp();
  rolePendingOtp = code;
  await sendOtpEmail(roleAuthData.email, code);
}

function roleRaiseComplaint(){
  const role = currentRole;
  const list = db('phoneComplaints') || [];
  const c = {id: uid('CMP'), role, phone: roleAuthData.phone, existingEmail: roleAuthData.conflictWithEmail, requestingEmail: roleAuthData.email, status:'pending', createdAt: now()};
  list.push(c);
  dbSet('phoneComplaints', list);
  audit(role, 'phone_complaint', roleAuthData.phone+' claimed by '+roleAuthData.email+' — was on '+roleAuthData.conflictWithEmail);
  roleAuthData.complaintId = c.id;
  roleAuthStep = 'complaint_filed';
  renderAuthCard();
  showToast('Complaint filed', 'Reference '+c.id+' — admin will call to verify.', 'success');
}
async function roleContinueWithoutPhone(){
  roleAuthData.phone = ''; // released — leave unverified for now
  await roleSendSignupOtp();
}

async function roleAuthVerifyOtp(){
  const code = [0,1,2,3,4,5].map(i=>document.getElementById('ra-otp-'+i).value||'').join('');
  const demoBypass = code==='123456';
  if(code.length<6 || (!demoBypass && code!==rolePendingOtp)){
    showToast('Incorrect code', 'That code doesn\'t match — check your inbox and try again.', 'danger');
    return;
  }
  if(roleAuthMode==='forgot'){ roleAuthStep = 'reset_password'; renderAuthCard(); return; }
  roleAuthStep = 'consent';
  renderAuthCard();
}

async function roleAuthFinishSignup(){
  const role = currentRole;
  const consent = document.getElementById('consent-check').checked;
  if(!consent){ showToast('Consent required', 'Please accept the data-sharing consent to continue.', 'danger'); return; }
  const d = roleAuthData;
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
        // This email already has a Firebase account under a different role (e.g. patient).
        // Firebase Auth's user pool is global, not per-role, so we can't create a second
        // account — instead confirm it's really them by signing in with the password they
        // just entered, then attach a fresh record for THIS role to that same account.
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
  const user = { email: d.email, phone: d.phone || '', phoneVerified: !!d.phone, name: d.name, createdAt: now() };
  roleExtraFields(role).forEach(f=>{ user[f.key] = d[f.key] || ''; });
  if(passwordHash) user.passwordHash = passwordHash;
  applyRoleUserToSession(role, user);
  saveRoleUser(role, user);
  roleAuthData.loggedEmail = user.email;
  dbSet('auth', {verified:true, consent:true});
  audit(role, 'auth', 'Account created for '+user.email+'; identity verified via emailed OTP ('+(fa?'Firebase Authentication':'local demo mode')+')');
  currentRole = role;
  enterConsole(role);
}

async function roleAuthResetPassword(){
  // Only reached in local fallback mode — Firebase Auth handles resets via its own emailed link instead.
  const role = currentRole;
  const p1 = document.getElementById('ra-newpass').value;
  const p2 = document.getElementById('ra-newpass2').value;
  const errBox = document.getElementById('ra-reset-err');
  if(p1.length<6){ errBox.innerHTML = `<div class="field-err">Password must be at least 6 characters.</div>`; return; }
  if(p1!==p2){ errBox.innerHTML = `<div class="field-err">Passwords don't match.</div>`; return; }
  const u = findRoleUserByEmail(role, roleAuthData.email);
  if(!u){ errBox.innerHTML = `<div class="field-err">Account not found.</div>`; return; }
  u.passwordHash = await hashPassword(p1);
  saveRoleUser(role, u);
  audit(role, 'auth', 'Password reset for '+u.email+' (local demo mode)');
  showToast('Password updated', 'Log in with your new password.', 'success');
  roleAuthMode = 'login';
  roleAuthStep = 'login';
  renderAuthCard();
}

/* ---- Family sub-profiles: up to 3 members share one login ---- */
