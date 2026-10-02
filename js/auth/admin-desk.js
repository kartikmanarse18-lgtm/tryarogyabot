function openAdminGate(){
  // Works no matter which screen is currently showing — landing, auth,
  // or a logged-in console (app-shell) — and remembers what to restore
  // on "Back" via backToRoleSelectFromAdmin().
  document.getElementById('screen-landing').classList.add('hidden');
  document.getElementById('screen-auth').classList.add('hidden');
  const shell = document.getElementById('app-shell');
  if(shell) shell.classList.add('hidden');
  document.getElementById('screen-admin').classList.remove('hidden');
  renderAdminScreen();
}
function backToRoleSelectFromAdmin(){
  document.getElementById('screen-admin').classList.add('hidden');
  if(currentRole && document.getElementById('app-shell')){
    document.getElementById('app-shell').classList.remove('hidden');
  } else {
    document.getElementById('screen-landing').classList.remove('hidden');
  }
}
function renderAdminScreen(){
  const box = document.getElementById('admin-card-box');
  if(!adminUnlocked){
    box.innerHTML = `
      <button class="btn-secondary btn-sm" style="margin-bottom:14px;" onclick="backToRoleSelectFromAdmin()"><i class="fa-solid fa-arrow-left"></i> Back</button>
      <h3>Admin access</h3>
      <p style="color:var(--text-muted, #94a3b8);">Restricted — enter the staff phrase and passcode.</p>
      <div class="form-group"><input type="password" class="dark-input" id="admin-phrase" placeholder="Staff phrase" autocomplete="off"></div>
      <div class="form-group"><input type="password" class="dark-input" id="admin-pass" placeholder="Passcode" autocomplete="off"></div>
      <button class="btn btn-block" onclick="adminUnlock()">Unlock</button>`;
    return;
  }
  box.innerHTML = `
    <button class="btn-secondary btn-sm" style="margin-bottom:14px;" onclick="backToRoleSelectFromAdmin()"><i class="fa-solid fa-arrow-left"></i> Back</button>
    <h3>Admin desk</h3>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn btn-sm ${adminTab==='complaints'?'':'btn-secondary'}" onclick="adminTab='complaints';renderAdminScreen();">Phone complaints</button>
      <button class="btn btn-sm ${adminTab==='users'?'':'btn-secondary'}" onclick="adminTab='users';renderAdminScreen();">Users</button>
      <button class="btn btn-sm ${adminTab==='deactivated'?'':'btn-secondary'}" onclick="adminTab='deactivated';renderAdminScreen();">Deactivated</button>
    </div>
    ${adminTab==='users' ? renderAdminUsersTab() : adminTab==='deactivated' ? renderAdminDeactivatedTab() : renderAdminComplaintsTab()}
  `;
}
function renderAdminDeactivatedTab(){
  const list = (db('revokedEmails')||[]).slice().sort((a,b)=>(b.revokedAt||0)-(a.revokedAt||0));
  return `
    <p>${list.length} email${list.length===1?'':'s'} permanently locked out. Un-revoking only lifts the app-side blocklist — it does NOT restore any of the deleted account's old data (that was already wiped) or its old Firebase Auth login if that was deleted too; the person would need to register fresh.</p>
    ${list.length ? list.map(r=>`
      <div class="card" style="margin-bottom:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <strong>${r.email}</strong>
          <span class="status-tag status-danger">${r.role||'unknown role'}</span>
        </div>
        <p style="font-size:.8rem;color:var(--text-muted);margin:8px 0;">${r.reason||'Deactivated'} · ${r.revokedAt?fmtTime(r.revokedAt):''}</p>
        <button class="btn btn-secondary btn-sm" onclick="adminUnrevokeEmail('${r.email}')"><i class="fa-solid fa-unlock"></i> Allow this email to register again</button>
      </div>`).join('') : `<p style="color:var(--text-muted);">No deactivated accounts.</p>`}
  `;
}
function adminUnrevokeEmail(email){
  if(!confirm(email+' will be able to log in or register again. Continue?')) return;
  unrevokeEmail(email);
  audit('admin', 'email_unrevoke', email+' un-blocklisted');
  showToast('Un-revoked', email+' can now register or log in again.', 'success');
  renderAdminScreen();
}
function complaintUsersKey(role){ return (role||'patient')==='patient' ? 'users' : 'users_'+role; }
function renderAdminComplaintsTab(){
  const complaints = (db('phoneComplaints')||[]).slice().reverse();
  return `
    <p>${complaints.length} total. Admin calls the number to verify ownership, then resolves below.</p>
    ${complaints.length ? complaints.map(c=>`
      <div class="card" style="margin-bottom:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;"><strong>${c.phone}</strong><span class="status-tag ${c.status==='pending'?'status-warn':'status-ok'}">${c.status}</span></div>
        <p style="font-size:.72rem;color:var(--text-muted);margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em;">${(c.role||'patient')}</p>
        <p style="font-size:.8rem;color:var(--text-muted);margin:8px 0;">Currently on <strong>${c.existingEmail}</strong> · requested by <strong>${c.requestingEmail}</strong></p>
        ${c.status==='pending' ? `<button class="btn btn-sm" onclick="adminResolveComplaint('${c.id}')"><i class="fa-solid fa-phone"></i> Verified — reassign to requester</button>
        <button class="btn btn-secondary btn-sm" onclick="adminDismissComplaint('${c.id}')">Dismiss (keep with original)</button>` : ''}
      </div>`).join('') : `<p style="color:var(--text-muted);">No complaints filed yet.</p>`}
  `;
}
function renderAdminUsersTab(){
  const roles = ['patient','responder','police','hospital'];
  const users = roles.flatMap(role => (db(complaintUsersKey(role))||[]).map(u=>({...u, role})))
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const backendNote = authBackendActive()
    ? `<i class="fa-solid fa-shield-halved"></i> Passwords are stored and hashed by Firebase Authentication — not visible here, by design.`
    : `<i class="fa-solid fa-shield-halved"></i> Passwords are one-way hashed locally — not visible here, by design.`;
  return `
    <p>${users.length} registered account${users.length===1?'':'s'} across all roles. ${backendNote}</p>
    ${users.length ? users.map(u=>`
      <div class="card" style="margin-bottom:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <strong>${u.email}</strong>
          <span class="status-tag ${u.phoneVerified?'status-ok':'status-warn'}">${u.phoneVerified?'Phone verified':'Phone unverified'}</span>
        </div>
        <p style="font-size:.72rem;color:var(--text-muted);margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em;">${u.role}</p>
        <p style="font-size:.8rem;color:var(--text-muted);margin:8px 0;">
          ${u.role==='patient'
            ? `Phone: <strong>${u.phone||'—'}</strong> · ${u.members?u.members.length:1} member${(u.members?u.members.length:1)===1?'':'s'} (${(u.members||[]).map(m=>m.name).join(', ')}) · Joined ${u.createdAt?new Date(u.createdAt).toLocaleDateString():'—'}`
            : `${u.name||''} · Phone: <strong>${u.phone||'—'}</strong> · Joined ${u.createdAt?new Date(u.createdAt).toLocaleDateString():'—'}`}
        </p>
        <button class="btn btn-secondary btn-sm" onclick="adminSendReset('${u.email}')"><i class="fa-solid fa-key"></i> Send password reset</button>
        <button class="btn btn-sm btn-danger" onclick="adminDeleteUser('${u.role}','${u.email}')"><i class="fa-solid fa-trash"></i> Delete account</button>
      </div>`).join('') : `<p style="color:var(--text-muted);">No registered users yet.</p>`}
  `;
}
// Removes the account record itself AND its linked live record (the ambulance in
// 'responders', the facility in 'hospitals', or the station in 'police') so a test
// signup actually disappears from things like "Nearby help right now" — not just
// from the admin list. Writes go through dbSet, so this syncs the deletion to every
// other device in the same Firestore room too, not just this browser.
async function adminDeleteUser(role, email){
  const key = complaintUsersKey(role);
  const list = db(key) || [];
  const idx = list.findIndex(u=>u.email===email);
  if(idx===-1){ showToast('Not found', 'That account no longer exists.', 'danger'); return; }
  const user = list[idx];

  if(!confirm('Permanently delete '+email+' ('+role+')? This removes their account, documents, appointments and other records, and cannot be undone.')) return;

  // Gate the destructive wipe below on the admin worker token FIRST, instead of
  // asking for it afterward (previously deleteFirebaseAuthAccount() was only
  // called at the very end, by which point the account and its data were
  // already gone — the prompt looked like a safety check but guarded nothing).
  // 'not_found' still means the token was valid and the worker was reached —
  // it just means this account has no separate Auth credential — so that case
  // is allowed to proceed. Anything else (skipped/wrong token/unreachable
  // worker) blocks the deletion entirely rather than partially wiping data.
  const authResult = await deleteFirebaseAuthAccount(email);
  if(!authResult.deleted && authResult.reason!=='not_found'){
    const reasonMsg = authResult.reason==='skipped' ? 'No admin token was entered.' : ('Admin worker error: '+authResult.reason+'.');
    showToast('Deletion blocked', reasonMsg+' '+email+' was NOT deleted.', 'danger');
    return;
  }

  list.splice(idx, 1);
  dbSet(key, list);

  // Permanently locks this email out everywhere — see the block comment above
  // isEmailRevoked()/enforceRevokedEmailLockout() for why this is the reliable
  // part regardless of whether the Auth-delete step below succeeds.
  revokeEmailEverywhere(email, role, 'Deleted by admin');

  if(role==='responder' && user.responderId){
    dbSet('responders', (db('responders')||[]).filter(r=>r.id!==user.responderId));
    deleteNotificationInbox('responder:'+user.responderId);
  } else if(role==='hospital' && user.hospitalId){
    dbSet('hospitals', (db('hospitals')||[]).filter(h=>h.id!==user.hospitalId));
    deleteNotificationInbox('hospital:'+user.hospitalId);
  } else if(role==='police' && user.stationId){
    dbSet('police', (db('police')||[]).filter(p=>p.id!==user.stationId));
    deleteNotificationInbox('police:'+user.stationId);
    const pp = db('policeProfile')||{};
    delete pp[user.stationId];
    dbSet('policeProfile', pp);
  } else if(role==='patient' && Array.isArray(user.members)){
    const memberIds = user.members.map(m=>m.id);
    // cycle/documents/reminders/claims/insurance are PRIVATE_ACCOUNT_KEYS now
    // (routed per-authenticated-account, see the router above) — there's no
    // longer a shared local array/cache to purge them from here, and this
    // admin session's own currentAuthUid() is NOT the deleted patient's uid,
    // so writing through dbSet() here would touch the ADMIN's own account
    // data instead, not the deleted patient's. Correctly wiping the deleted
    // patient's isolated /users/{theirUid}/data/* docs needs their auth uid
    // stored on the account record — not tracked yet (Phase 1c).
    // prescriptions/appointments are still on the legacy shared array (see
    // Phase 1b in the migration plan), so purging them here is still correct.
    dbSet('prescriptions', (db('prescriptions')||[]).filter(r=>!memberIds.includes(r.ownerId)));
    dbSet('appointments', (db('appointments')||[]).filter(a=>!memberIds.includes(a.ownerId)));
    memberIds.forEach(mid=>deleteNotificationInbox('patient:'+mid));
  }

  // If the deleted account happens to be logged in on THIS device right now,
  // sign it out immediately rather than waiting for the next sync tick.
  if(currentRole===role && normEmail(currentSessionEmail())===normEmail(email)) forceSignOutRevoked();

  audit('admin', 'user_delete', email+' ('+role+') removed and permanently deactivated');
  if(authResult.deleted) audit('admin', 'auth_delete', email+' Firebase Auth credential permanently deleted');
  renderAdminScreen();

  if(authResult.deleted){
    showToast('Account deleted', email+' was removed, blocklisted, and its login credential permanently deleted.', 'success');
  } else {
    // authResult.reason === 'not_found' — token was valid, worker was reached,
    // this account just never had a separate Auth credential to remove.
    showToast('Account deleted', email+' had no separate Auth credential to remove. Fully blocklisted.', 'success');
  }
}
async function adminSendReset(email){
  const fa = fbAuth();
  if(fa){
    try{
      await fa.sendPasswordResetEmail(email);
      audit('admin', 'password_reset_sent', email);
      showToast('Reset email sent', email+' will receive a link to set a new password.', 'success');
    }catch(e){
      showToast('Could not send reset email', friendlyAuthError(e), 'danger');
    }
    return;
  }
  showToast('Local demo mode', 'Firebase Authentication isn\'t connected — ask the user to use "Forgot password" on the login screen instead.', 'danger');
}
// The staff phrase and passcode are NOT in this file or in app-config.js. They live only as Cloudflare
// secrets (ADMIN_PHRASE, ADMIN_PASSCODE) in the admin worker, which checks what you type and, if both are
// correct, returns a Firebase sign-in token carrying an admin claim.
let adminFailCount = 0;
let adminLockUntil = 0;
async function adminUnlock(){
  if(Date.now() < adminLockUntil){
    const secs = Math.ceil((adminLockUntil-Date.now())/1000);
    showToast('Too many attempts', 'Locked for '+secs+'s — try again shortly.', 'danger');
    return;
  }
  const pass = document.getElementById('admin-pass').value;
  const phrase = document.getElementById('admin-phrase').value;
  if(!pass || !phrase){ showToast('Enter the phrase and the passcode', '', 'danger'); return; }

  let data = null, status = 0;
  try{
    const res = await fetch(`${ADMIN_WORKER_URL}/admin/login`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phrase: phrase, passcode: pass })
    });
    status = res.status;
    data = await res.json().catch(()=>({}));
  }catch(e){
    showToast('Admin server unreachable', 'Check your internet connection and try again.', 'danger');
    return;
  }

  if(status===429){
    adminLockUntil = Date.now()+60000;
    showToast('Too many attempts', 'Locked. Try again in a few minutes.', 'danger');
    return;
  }
  if(status!==200 || !data || !data.customToken){
    adminFailCount++;
    audit('admin', 'unlock_failed', 'attempt #'+adminFailCount);
    if(adminFailCount>=5){
      adminLockUntil = Date.now()+30000;
      adminFailCount = 0;
      showToast('Too many attempts', 'Locked for 30s.', 'danger');
    } else {
      showToast(status===403 ? 'Not allowed from this address' : 'Wrong phrase or passcode', '', 'danger');
    }
    return;
  }

  adminFailCount = 0;
  adminUnlocked = true;
  // Sign in to Firebase as the verified admin (replaces the old anonymous sign-in), so admin writes
  // reach Firestore and rules can recognise request.auth.token.admin == true.
  const fa = fbAuth();
  if(fa){
    try{
      await fa.signInWithCustomToken(data.customToken);
      audit('admin', 'unlock_success', 'signed in (admin token)');
    }catch(e){
      console.warn('Admin sign-in with custom token failed — admin writes may stay local-only.', e);
      showToast('Admin sync not connected', 'Signed in to the desk, but Firebase sign-in failed ('+(e.code||e.message||e)+').', 'danger');
      audit('admin', 'unlock_success', 'local-only — custom token sign-in failed: '+(e.code||e.message||e));
    }
  } else {
    audit('admin', 'unlock_success', 'local demo mode — no Firebase connected');
  }
  renderAdminScreen();
}
function adminResolveComplaint(id){
  const list = db('phoneComplaints')||[];
  const c = list.find(x=>x.id===id); if(!c) return;
  const role = c.role || 'patient';
  if(role==='patient'){
    const oldUser = findUserByEmail(c.existingEmail);
    if(oldUser){ oldUser.phone=''; oldUser.phoneVerified=false; saveUser(oldUser); }
    const newUser = findUserByEmail(c.requestingEmail);
    if(newUser){ newUser.phone=c.phone; newUser.phoneVerified=true; saveUser(newUser); }
  } else {
    const oldUser = findRoleUserByEmail(role, c.existingEmail);
    if(oldUser){ oldUser.phone=''; oldUser.phoneVerified=false; saveRoleUser(role, oldUser); }
    const newUser = findRoleUserByEmail(role, c.requestingEmail);
    if(newUser){ newUser.phone=c.phone; newUser.phoneVerified=true; saveRoleUser(role, newUser); }
  }
  c.status = 'resolved';
  dbSet('phoneComplaints', list);
  audit('admin', 'phone_reassign', c.phone+' moved from '+c.existingEmail+' to '+c.requestingEmail);
  renderAdminScreen();
  showToast('Number reassigned', c.phone+' now belongs to '+c.requestingEmail, 'success');
}
function adminDismissComplaint(id){
  const list = db('phoneComplaints')||[];
  const c = list.find(x=>x.id===id); if(!c) return;
  c.status = 'dismissed';
  dbSet('phoneComplaints', list);
  renderAdminScreen();
}
