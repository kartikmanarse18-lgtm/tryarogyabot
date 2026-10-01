/* ============================================================
   PAYMENTS (front-end only, for now)
   ------------------------------------------------------------
   Shared checkout modal used by BOTH patient -> doctor consultation
   fees and patient -> pharmacy medicine bills. This only collects
   the payment method and simulates a short "processing" delay —
   there is no real gateway wired up yet. To go live, replace the
   body of confirmPayment() with a real call (Razorpay/Stripe/UPI
   intent, etc.) from your backend and only run onConfirm() once
   that backend confirms the payment actually succeeded. Nothing
   else in the app needs to change — every caller just does
   openPaymentModal(amount, label, 'someGlobalFnName', [args...]).
   ============================================================ */
let pendingPayment = null;
function openPaymentModal(amount, label, onConfirmFnName, onConfirmArgs){
  amount = +amount || 0;
  pendingPayment = {amount, label, onConfirmFnName, onConfirmArgs: onConfirmArgs||[]};
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3 style="margin-top:0;"><i class="fa-solid fa-indian-rupee-sign"></i> Payment</h3>
    <p class="modal-sub">${label}</p>
    <div style="background:var(--bg-subtle);border-radius:14px;padding:18px;margin-bottom:18px;text-align:center;">
      <div style="font-size:.76rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Amount payable</div>
      <div style="font-family:var(--ff-display);font-size:2.1rem;font-weight:800;">&#8377;${amount.toFixed(2)}</div>
    </div>
    <div class="form-group">
      <label>Pay with</label>
      <select class="form-control" id="pay-method" onchange="renderPayMethodFields()">
        <option value="upi">UPI (Google Pay / PhonePe / Paytm)</option>
        <option value="card">Credit / Debit Card</option>
        <option value="netbanking">Net Banking</option>
      </select>
    </div>
    <div id="pay-fields"></div>
    <button class="btn btn-block" id="pay-confirm-btn" onclick="confirmPayment()"><i class="fa-solid fa-lock"></i> Pay &#8377;${amount.toFixed(2)}</button>
    <p style="font-size:.72rem;color:var(--text-muted);text-align:center;margin:12px 0 0;">Payments are simulated for this demo — no money actually moves yet. Real gateway integration will be connected on the backend.</p>
  `);
  renderPayMethodFields();
}
function renderPayMethodFields(){
  const method = document.getElementById('pay-method') ? document.getElementById('pay-method').value : 'upi';
  const el = document.getElementById('pay-fields');
  if(!el) return;
  if(method==='upi'){
    el.innerHTML = `<div class="form-group"><label>UPI ID</label><input class="form-control" id="pay-upi" placeholder="yourname@upi"></div>`;
  } else if(method==='card'){
    el.innerHTML = `<div class="form-group"><label>Card number</label><input class="form-control" id="pay-card" placeholder="1234 5678 9012 3456" maxlength="19"></div>
    <div class="grid-2"><div class="form-group"><label>Expiry</label><input class="form-control" id="pay-exp" placeholder="MM/YY" maxlength="5"></div><div class="form-group"><label>CVV</label><input class="form-control" id="pay-cvv" placeholder="123" maxlength="3" type="password"></div></div>`;
  } else {
    el.innerHTML = `<div class="form-group"><label>Bank</label><select class="form-control" id="pay-bank"><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Axis Bank</option><option>Punjab National Bank</option></select></div>`;
  }
}
function confirmPayment(){
  if(!pendingPayment) return;
  const payment = pendingPayment;
  pendingPayment = null;
  const btn = document.getElementById('pay-confirm-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…'; }
  setTimeout(()=>{
    closeModal();
    showToast('Payment successful', `&#8377;${payment.amount.toFixed(2)} paid — ${payment.label}.`, 'success');
    const fn = window[payment.onConfirmFnName];
    if(typeof fn === 'function') fn(...payment.onConfirmArgs);
  }, 900);
}
let fbEnabled = false, fbRoomRef = null;

/* Real password storage — Firebase Authentication (Spark/free plan).
   Google stores and hashes passwords; we never see or keep them. Falls
   back to the local one-way-hash system automatically if Auth isn't
   enabled in your Firebase console yet. */
function ensureFirebaseApp(){
  if(typeof firebase==='undefined') return false;
  if(!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('PASTE_')===0) return false;
  if(!firebase.apps || !firebase.apps.length){
    try{ firebase.initializeApp(FIREBASE_CONFIG); }catch(e){ console.error('Firebase app init failed', e); return false; }
  }
  return true;
}
