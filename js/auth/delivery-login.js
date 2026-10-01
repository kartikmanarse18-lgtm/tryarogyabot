/* ============================================================
   DELIVERY LOGIN — a delivery boy account is created BY a pharmacy
   (see addDeliveryBoyToRoster in the Pharmacy console), never
   self-signed-up. Mirrors the doctor login pattern exactly: simple
   email+password, no OTP/consent, sessions scoped to
   CURRENT_DELIVERY_ID + CURRENT_PHARMACY_ID.
   ============================================================ */
let deliveryAuthData = {};    // {loggedEmail}
let deliveryLoginError = '';
function deliveryUsersDb(){ return db('users_delivery') || []; }
function findDeliveryUserByEmail(email){ return deliveryUsersDb().find(u=>u.email===(email||'').trim().toLowerCase()); }
function saveDeliveryUser(u){ const list=deliveryUsersDb(); const i=list.findIndex(x=>x.email===u.email); if(i>-1) list[i]=u; else list.push(u); dbSet('users_delivery', list); }

function openDeliveryLoginScreen(){
  document.getElementById('screen-landing').classList.add('hidden');
  document.getElementById('screen-delivery-login').classList.remove('hidden');
  deliveryLoginError = '';
  renderDeliveryLoginCard();
}
function backToRoleSelectFromDeliveryLogin(){
  document.getElementById('screen-delivery-login').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
}
function renderDeliveryLoginCard(){
  const box = document.getElementById('delivery-login-card-box');
  if(!box) return;
  box.innerHTML = `
    <h3>Delivery sign-in</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">Use the email and password your pharmacy gave you.</p>
    <div class="form-group"><label>Email</label><input class="form-control" id="dlv-login-email" placeholder="you@pharmacy.com" onkeydown="if(event.key==='Enter')deliveryLoginSubmit();"></div>
    <div class="form-group"><label>Password</label><input class="form-control" type="password" id="dlv-login-password" placeholder="Password" onkeydown="if(event.key==='Enter')deliveryLoginSubmit();"></div>
    ${deliveryLoginError ? `<div class="field-err">${deliveryLoginError}</div>` : ''}
    <button class="btn btn-block" onclick="deliveryLoginSubmit()"><i class="fa-solid fa-right-to-bracket"></i> Log in</button>
    <p style="text-align:center;margin-top:14px;"><a href="#" onclick="backToRoleSelectFromDeliveryLogin();return false;" style="color:var(--text-muted);font-size:.82rem;">&larr; Back</a></p>
  `;
}
async function deliveryLoginSubmit(){
  const email = (document.getElementById('dlv-login-email').value||'').trim().toLowerCase();
  const pw = document.getElementById('dlv-login-password').value||'';
  if(!email || !pw){ deliveryLoginError='Enter both email and password.'; renderDeliveryLoginCard(); return; }
  if(isEmailRevoked(email)){ deliveryLoginError='This account has been deactivated. Contact your pharmacy.'; renderDeliveryLoginCard(); return; }
  // PHASE 1C: same live-read reasoning as doctorLoginSubmit() above.
  const u = await liveAccountExists('users_delivery', email);
  if(!u){ deliveryLoginError='No delivery account found for this email — ask your pharmacy to add you on their Delivery Boys screen.'; renderDeliveryLoginCard(); return; }
  // PHASE 1D: same Auth-vs-local-hash branch as doctorLoginSubmit() above.
  if(u.authUid){
    const fa = fbAuth();
    if(!fa){ deliveryLoginError='Connect to the internet to log in.'; renderDeliveryLoginCard(); return; }
    try{
      await withTimeout(fa.signInWithEmailAndPassword(email, pw), 12000, 'Login');
    }catch(e){
      deliveryLoginError = friendlyAuthError(e); renderDeliveryLoginCard(); return;
    }
  } else {
    const hash = await hashPassword(pw);
    if(hash !== u.passwordHash){ deliveryLoginError='Incorrect password.'; renderDeliveryLoginCard(); return; }
  }
  mergeAccountIntoLocalCache('users_delivery', u);
  let dRecord = (db('deliveryBoys')||[]).find(x=>x.id===u.deliveryId);
  if(!dRecord){
    // FIXLOG: fall back to matching by email before giving up — the same
    // anchor accountRecordId() already uses. This repairs a login whose
    // deliveryId drifted from the roster row (e.g. from the duplicate-ID bug
    // fixed in addDeliveryBoyToRoster above), instead of permanently locking
    // out a delivery boy whose seat genuinely still exists.
    dRecord = (db('deliveryBoys')||[]).find(x=>(x.loginEmail||'').toLowerCase()===email && x.pharmacyId===u.pharmacyId);
    if(dRecord){ u.deliveryId = dRecord.id; saveDeliveryUser(u); }
  }
  if(!dRecord){ deliveryLoginError='Your delivery record no longer exists — contact your pharmacy.'; renderDeliveryLoginCard(); return; }
  deliveryLoginError='';
  loginAsDelivery(u);
}
function loginAsDelivery(u){
  currentRole = 'delivery';
  CURRENT_DELIVERY_ID = u.deliveryId;
  CURRENT_PHARMACY_ID = u.pharmacyId;
  deliveryAuthData = {loggedEmail: u.email};
  dbSet('auth', {verified:true, consent:true});
  document.getElementById('screen-delivery-login').classList.add('hidden');
  audit('delivery:'+CURRENT_DELIVERY_ID, 'auth', 'Delivery boy logged in: '+u.email);
  saveActiveSession('delivery');
  enterConsole('delivery');
}
