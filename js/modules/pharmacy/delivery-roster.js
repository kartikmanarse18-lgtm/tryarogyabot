/* ============================================================
   PHARMACY — DELIVERY BOYS ROSTER
   ------------------------------------------------------------
   Mirrors the hospital's Doctor Roster pattern exactly: a pharmacy
   adds its real delivery staff here, each gets their own email+
   password login (see DELIVERY LOGIN above), and can be toggled
   available/unavailable, password-reset, or removed. A delivery
   boy's live GPS (once they're logged in and on the road) is what
   powers the patient-facing tracker in e-Prescriptions.
   ============================================================ */
// FIXLOG: deliveryMarkDelivered makes two separate writes (the prescription,
// then the delivery boy's currentRxId) — they aren't atomic. If the second
// one is ever lost (closed tab mid-write, dropped connection, or the
// previously-silent Phase1b failure fixed above), the roster keeps showing
// "On a delivery" forever even though the prescription itself already says
// delivered. Recompute the flag from the prescription instead of trusting it
// blindly, and self-heal it whenever we look.
function reconcileDeliveryBoyStatuses(pharmacyId){
  const boys = db('deliveryBoys')||[];
  const rx = db('prescriptions')||[];
  let changed = false;
  boys.forEach(b=>{
    if(pharmacyId!=null && b.pharmacyId!==pharmacyId) return;
    if(!b.currentRxId) return;
    const linked = rx.find(r=>r.id===b.currentRxId);
    if(!linked || linked.deliveryStatus==='delivered'){ b.currentRxId = null; changed = true; }
  });
  if(changed) dbSet('deliveryBoys', boys);
}
function viewPharmacyDeliveryRoster(){
  reconcileDeliveryBoyStatuses(CURRENT_PHARMACY_ID);
  const boys = (db('deliveryBoys')||[]).filter(b=>b.pharmacyId===CURRENT_PHARMACY_ID);
  return `${viewHeader('Delivery Boys','Home-delivery staff','Add your real delivery staff below — each gets their own login to go live on GPS and update delivery status. Patients see their name, phone, vehicle and live location once a delivery is assigned to them.')}
  <div class="card">
    <h3 style="margin-top:0;">Add delivery boy</h3>
    <div class="grid-2">
      <div class="form-group"><label>Full name</label><input class="form-control" id="dlv-name" placeholder="e.g. Ramesh Kumar"></div>
      <div class="form-group"><label>Phone</label><input class="form-control" id="dlv-phone" placeholder="e.g. 98765 43210"></div>
      <div class="form-group"><label>Vehicle</label><input class="form-control" id="dlv-vehicle" placeholder="e.g. Bike · MH12 AB 1234"></div>
      <div class="form-group"><label>Login email</label><input class="form-control" id="dlv-login-email-new" placeholder="delivery@example.com"></div>
      <div class="form-group"><label>Login password</label><div style="display:flex;gap:8px;"><input class="form-control" id="dlv-login-password-new" placeholder="Set a password"><button type="button" class="btn btn-secondary btn-sm" onclick="generateDeliveryPassword()" title="Generate a random password"><i class="fa-solid fa-shuffle"></i></button></div></div>
    </div>
    <button class="btn" onclick="addDeliveryBoyToRoster()"><i class="fa-solid fa-motorcycle"></i> Add to roster &amp; create login</button>
  </div>
  <div class="card">
  ${boys.length ? `<table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>Vehicle</th><th>Login email</th><th>Status</th><th></th></tr></thead><tbody>
  ${boys.map(b=>`<tr><td>${b.name}</td><td>${b.phone||'—'}</td><td>${b.vehicle||'—'}</td><td style="font-family:var(--ff-mono);font-size:.78rem;">${b.loginEmail||'—'}</td><td><span class="status-tag ${b.available?'status-ok':'status-muted'}">${b.currentRxId?'On a delivery':b.available?'Available':'Off duty'}</span></td><td style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-sm btn-secondary" onclick="toggleDeliveryBoy('${b.id}')" ${b.currentRxId?'disabled title="Busy on a delivery"':''}>Toggle</button><button class="btn btn-sm btn-secondary" onclick="resetDeliveryBoyPassword('${b.id}')" title="Reset login password"><i class="fa-solid fa-key"></i></button><button class="btn btn-sm btn-danger" onclick="removeDeliveryBoy('${b.id}')" title="Remove from roster"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}
  </tbody></table>` : `<p style="color:var(--text-muted);margin:0;">No delivery boys added yet — add your first one above.</p>`}
  </div>`;
}
function generateDeliveryPassword(){
  const pw = Math.random().toString(36).slice(-4) + Math.floor(1000+Math.random()*9000);
  document.getElementById('dlv-login-password-new').value = pw;
}
async function addDeliveryBoyToRoster(){
  const name = document.getElementById('dlv-name').value.trim();
  const phone = document.getElementById('dlv-phone').value.trim();
  const vehicle = document.getElementById('dlv-vehicle').value.trim();
  const loginEmail = (document.getElementById('dlv-login-email-new').value||'').trim().toLowerCase();
  const loginPassword = document.getElementById('dlv-login-password-new').value||'';
  if(!name){ showToast('Missing info','Enter the delivery boy\'s name.','danger'); return; }
  if(!loginEmail || !loginPassword){ showToast('Missing login info','A login email and password are required so they can sign in.','danger'); return; }
  if(loginPassword.length<4){ showToast('Weak password','Use at least 4 characters for the password.','danger'); return; }

  const boys = db('deliveryBoys')||[];
  // FIXLOG: reusing an existing local row by email (instead of only ever
  // trusting the live check below) is what turns "recreate this account
  // because login says it doesn't exist" into a repair instead of a dead end.
  // Previously, if the earlier account's Firestore link doc never made it to
  // the server (see diffAndPersistPhase1b's FIXLOG above), liveAccountExists
  // would report "not found", the create-or-verify call below would then hit
  // Firebase Auth's real "email already in use", and — if the verification
  // sign-in happened to succeed — the old code minted a SECOND deliveryId for
  // the same person. That orphaned the first roster row (and anything
  // assigned to it, e.g. an in-progress delivery, which then showed
  // "On a delivery" forever because nothing could ever log in as that ID
  // again to clear it).
  const existing = boys.find(b=>(b.loginEmail||'').toLowerCase()===loginEmail && b.pharmacyId===CURRENT_PHARMACY_ID);
  if(!existing){
    // PHASE 1C: live check — same race as addDoctorToRoster() above.
    if(await liveAccountExists('users_delivery', loginEmail)){ showToast('Email already used','Another delivery account already uses that email.','danger'); return; }
  }
  // PHASE 1D: same reordering as addDoctorToRoster() above — create/verify
  // the login before writing anything else.
  let authUid = null, passwordHash = null;
  try{
    const result = await createOrVerifyAuthAccountAsAdmin(loginEmail, loginPassword);
    if(result) authUid = result.uid; else passwordHash = await hashPassword(loginPassword);
  }catch(e){
    showToast('Could not create login', e.message || String(e), 'danger');
    return;
  }
  const ph = (db('pharmacies')||[]).find(x=>x.id===CURRENT_PHARMACY_ID) || {};
  let deliveryId;
  if(existing){
    existing.name = name; existing.phone = phone; existing.vehicle = vehicle;
    deliveryId = existing.id;
    dbSet('deliveryBoys', boys);
    showToast('Login repaired', name+'\'s login has been re-synced to the server — ask them to try logging in again.', 'success');
  } else {
    deliveryId = uid('DLV');
    boys.push({id:deliveryId, pharmacyId:CURRENT_PHARMACY_ID, name, phone, vehicle, loginEmail, available:true, currentRxId:null, lat: ph.lat, lng: ph.lng});
    dbSet('deliveryBoys', boys);
    showToast('Delivery boy added', name+' can now log in with '+loginEmail+' — share the password with them securely.', 'success');
  }
  saveDeliveryUser({email:loginEmail, ...(authUid?{authUid}:{passwordHash}), deliveryId, pharmacyId:CURRENT_PHARMACY_ID, name});
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'delivery_add', name+' · login: '+loginEmail);
  renderCurrentView('ph-delivery-roster');
}
function removeDeliveryBoy(id){
  const boys = db('deliveryBoys')||[];
  const b = boys.find(x=>x.id===id);
  if(!b) return;
  if(b.currentRxId){ showToast('Busy on a delivery', 'This delivery boy is currently on an active delivery — wait until it\'s marked delivered before removing them.', 'danger'); return; }
  if(!confirm('Remove '+b.name+' from the roster? This also disables their login.')) return;
  dbSet('deliveryBoys', boys.filter(x=>x.id!==id));
  if(b.loginEmail) dbSet('users_delivery', deliveryUsersDb().filter(u=>u.deliveryId!==id));
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'delivery_remove', b.name);
  showToast('Removed', b.name+' taken off the roster.', 'success');
  renderCurrentView('ph-delivery-roster');
}
function toggleDeliveryBoy(id){ const boys=db('deliveryBoys')||[]; const b=boys.find(x=>x.id===id); if(!b || b.currentRxId) return; b.available=!b.available; dbSet('deliveryBoys',boys); renderCurrentView('ph-delivery-roster'); }
async function resetDeliveryBoyPassword(id){
  const b = (db('deliveryBoys')||[]).find(x=>x.id===id);
  if(!b || !b.loginEmail){ showToast('No login found','This delivery boy has no login account to reset.','danger'); return; }
  const u = await liveAccountExists('users_delivery', b.loginEmail);
  if(!u){ showToast('Not found','No login record for that email.','danger'); return; }
  if(u.authUid){
    // PHASE 1D: same reasoning as resetDoctorPassword() above.
    const fa = fbAuth();
    if(!fa){ showToast('Not available offline', 'Connect to the internet to send a password reset email.', 'danger'); return; }
    try{
      await fa.sendPasswordResetEmail(b.loginEmail);
      audit('pharmacy:'+CURRENT_PHARMACY_ID, 'delivery_password_reset', b.name+' (reset email sent)');
      showToast('Reset email sent', b.name+' will get an email at '+b.loginEmail+' with a link to set a new password.', 'success');
    }catch(e){
      showToast('Could not send reset email', friendlyAuthError(e), 'danger');
    }
    return;
  }
  const newPw = prompt('Enter a new password for '+b.name+' ('+b.loginEmail+'):');
  if(!newPw) return;
  if(newPw.length<4){ showToast('Weak password','Use at least 4 characters.','danger'); return; }
  u.passwordHash = await hashPassword(newPw);
  saveDeliveryUser(u);
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'delivery_password_reset', b.name);
  showToast('Password reset', 'New password set for '+b.name+'. Share it with them securely.', 'success');
}
