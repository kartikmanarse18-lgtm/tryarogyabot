import { verifyFirebaseToken } from './auth.js';
import { makeGateway, mask } from './gateway.js';

const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors } });
const corsFor = (req, env) => {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' }
    : { 'Vary': 'Origin' };
};
// Aadhaar/OTP/ABHA numbers are NEVER logged. Only the route and a status are.
const log = (...a) => console.log('[abdm]', ...a);

export default {
  async fetch(req, env, ctx, testHooks) {
    const cors = corsFor(req, env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health') return json({ ok: true, mode: env.ABDM_MODE || 'mock' }, 200, cors);

    // Gateway callbacks (public). Phase 2 (M1) flows are request/response, so this only acknowledges.
    // Signature/IP verification + Firestore write to abdm_callbacks arrive with Phase 5 (see plan §3).
    if (url.pathname.startsWith('/webhooks/abdm/')) { log('webhook', url.pathname); return json({ received: true }, 202, cors); }

    let user;
    try { user = await verifyFirebaseToken(req, env.FIREBASE_PROJECT_ID, testHooks && testHooks.keys); }
    catch { return json({ error: 'unauthorized' }, 401, cors); }

    const gw = makeGateway(env);
    let body = {};
    if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400, cors); } }
    const txnKey = (t) => 'txn:' + user.uid + ':' + t;
    const kv = env.ABDM_KV;
    const saveTxn = async (txnId) => { if (kv) await kv.put(txnKey(txnId), '1', { expirationTtl: 600 }); };
    const checkTxn = async (txnId) => !kv || !!(await kv.get(txnKey(txnId)));

    try {
      const p = url.pathname;
      if (req.method === 'POST' && p === '/abha/aadhaar/otp') {
        if (!/^\d{12}$/.test(body.aadhaar || '')) return json({ error: 'invalid_aadhaar_format' }, 400, cors);
        const r = await gw.aadhaarOtp({ aadhaar: body.aadhaar, uid: user.uid }); // value used in-memory only, never stored/logged
        await saveTxn(r.txnId); return json({ txnId: r.txnId, message: r.message }, 200, cors);
      }
      if (req.method === 'POST' && p === '/abha/mobile/otp') {
        if (!/^\d{10}$/.test(body.mobile || '')) return json({ error: 'invalid_mobile_format' }, 400, cors);
        const r = await gw.mobileOtp({ mobile: body.mobile, uid: user.uid });
        await saveTxn(r.txnId); return json({ txnId: r.txnId, message: r.message }, 200, cors);
      }
      if (req.method === 'POST' && (p === '/abha/aadhaar/verify' || p === '/abha/mobile/verify')) {
        if (!/^\d{6}$/.test(body.otp || '') || !body.txnId) return json({ error: 'invalid_request' }, 400, cors);
        if (!(await checkTxn(body.txnId))) return json({ error: 'txn_expired' }, 400, cors);
        const fn = p.includes('aadhaar') ? gw.aadhaarVerify : gw.mobileVerify;
        const prof = await fn({ otp: body.otp, txnId: body.txnId, uid: user.uid });
        // Only masked/identifier data goes back to the app. No tokens, no Aadhaar.
        return json({ abhaNumberMasked: mask(prof.abhaNumber), abhaAddress: prof.abhaAddress, name: prof.name, mock: !!prof.mock }, 200, cors);
      }
      if (req.method === 'GET' && p === '/abha/profile') { const r = await gw.profile({ uid: user.uid }); return json({ abhaNumberMasked: mask(r.abhaNumber), abhaAddress: r.abhaAddress, name: r.name, mock: !!r.mock }, 200, cors); }
      if (req.method === 'GET' && p === '/abha/card') return json(await gw.card({ uid: user.uid }), 200, cors);
      return json({ error: 'not_found' }, 404, cors);
    } catch (e) {
      log('error', url.pathname, e.status || 500, e.message);
      return json({ error: e.message || 'server_error' }, e.status || 500, cors);
    }
  },
};
