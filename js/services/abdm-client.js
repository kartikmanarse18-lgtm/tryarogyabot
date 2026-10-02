/* ============================================================
   ABDM CLIENT (plan §4.3) — thin client for the arogyabot-abdm Worker.
   - Everything here is dormant unless ABDM_ENABLED is true AND ABDM_WORKER_URL is set.
   - Sends the Firebase ID token; the Worker holds all ABDM secrets. No Aadhaar, OTP or token is ever stored by the app.
   - Per-member ABHA state lives in the private 'abdm' key (masked number + address only).
   ============================================================ */
function abdmEnabled(){ return typeof ABDM_ENABLED!=='undefined' && ABDM_ENABLED===true && typeof ABDM_WORKER_URL!=='undefined' && !!ABDM_WORKER_URL; }

async function abdmCall(path, method, body){
  if(!abdmEnabled()) { const e=new Error('abdm_disabled'); e.code='abdm_disabled'; throw e; }
  const a = (typeof fbAuth==='function') ? fbAuth() : null;
  if(!a || !a.currentUser){ const e=new Error('not_signed_in'); e.code='not_signed_in'; throw e; }
  const token = await a.currentUser.getIdToken();
  const res = await fetch(ABDM_WORKER_URL.replace(/\/$/,'') + path, {
    method: method||'GET',
    headers: {'Authorization':'Bearer '+token, 'Content-Type':'application/json'},
    body: method==='POST' ? JSON.stringify(body||{}) : undefined
  });
  let data = {}; try{ data = await res.json(); }catch(e){}
  if(!res.ok){ const e=new Error(data.error||('http_'+res.status)); e.code=data.error||('http_'+res.status); e.status=res.status; throw e; }
  return data;
}

/* ---- per-member ABHA state (stored under private key 'abdm'; masked data only, never tokens) ---- */
function abdmGetMember(memberId){
  const all = db('abdm') || {members:{}};
  return (all.members||{})[memberId||currentPatientId()] || null;
}
function abdmSetMember(memberId, rec){
  const all = db('abdm') || {members:{}};
  all.members = all.members || {};
  if(rec) all.members[memberId] = rec; else delete all.members[memberId];
  dbSet('abdm', all);
}

/* ---- in-memory view state (OTP step, transaction id). Cleared on member switch and logout, like the cycle PIN. ---- */
let abdmView = {step:'choose', method:null, txnId:null, busy:false, error:''};
function abdmResetViewState(){ abdmView = {step:'choose', method:null, txnId:null, busy:false, error:''}; }

const ABDM_ERRORS = {
  invalid_aadhaar_format:'Enter the 12-digit Aadhaar number.', invalid_mobile_format:'Enter a 10-digit mobile number.',
  invalid_otp:'That OTP was not correct. Please try again.', txn_expired:'This request expired. Please start again.',
  unauthorized:'Please sign in again, then retry.', not_signed_in:'Please sign in again, then retry.',
  abdm_gateway_not_implemented:'ABHA service is not switched on for real use yet (test mode only).',
  abdm_disabled:'ABHA is not enabled in this build.'
};
function abdmErrorText(code){ return ABDM_ERRORS[code] || 'Something went wrong. Please try again in a moment.'; }
