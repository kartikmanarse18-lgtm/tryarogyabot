import { verifyFirebaseToken } from './auth.js';
import { makeGateway, mask } from './gateway.js';
import { makeDigilocker, makeStore, randomToken, esc, DL_MAX_BYTES, DL_STATE_TTL, DL_SESSION_TTL } from './digilocker.js';

const json = (obj, status, cors) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors } });
// Small HTML pages for the browser redirect legs of the DigiLocker flow (no scripts, no external loads).
const page = (title, bodyHtml, status) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
  `<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;max-width:480px;margin-inline:auto;line-height:1.5}a.b{display:inline-block;margin:6px 8px 0 0;padding:10px 16px;border-radius:8px;background:#0d9488;color:#fff;text-decoration:none}a.g{background:#e5e7eb;color:#111}.t{background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:8px;font-size:.85rem}</style></head><body>${bodyHtml}</body></html>`,
  { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
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

    // ---- DigiLocker redirect legs (public: they are plain browser navigations; the single-use `state` binds them to a user) ----
    const dlMode = env.ABDM_MODE || 'mock';
    if (req.method === 'GET' && url.pathname === '/digilocker/mock-authorize') {
      if (dlMode !== 'mock') return json({ error: 'not_found' }, 404, cors);
      const state = url.searchParams.get('state') || '';
      const rec = state ? await makeStore(env).get('dlstate:' + state) : null;
      if (!rec) return page('Link expired', '<h2>This link has expired</h2><p>Please go back to ArogyaBot and start again.</p>', 400);
      const q = encodeURIComponent(state);
      return page('Test consent', `<div class="t"><strong>TEST MODE.</strong> This is a fake DigiLocker consent screen. No real documents are involved.</div>` +
        `<h2>Allow ArogyaBot to fetch your documents?</h2><p>ArogyaBot is asking to read the documents you choose.</p>` +
        `<a class="b" href="/digilocker/callback?code=mock-code&amp;state=${esc(q)}">Allow</a><a class="b g" href="/digilocker/callback?error=access_denied&amp;state=${esc(q)}">Deny</a>`);
    }
    if (req.method === 'GET' && url.pathname === '/digilocker/callback') {
      const store = makeStore(env);
      if (!store.durable && dlMode !== 'mock') return page('Not available', '<h2>Not available</h2><p>This service is not configured yet.</p>', 500);
      const state = url.searchParams.get('state') || '';
      const rec = state ? await store.get('dlstate:' + state) : null;
      if (!rec) return page('Link expired', '<h2>This link has expired</h2><p>Please go back to ArogyaBot and start again.</p>', 400);
      await store.del('dlstate:' + state);                       // single use: replaying the redirect does nothing
      if (url.searchParams.get('error')) return page('Not connected', '<h2>Access was not granted</h2><p>Nothing was shared. You can close this tab and return to ArogyaBot.</p>');
      try {
        const r = await makeDigilocker(env).exchange({ code: url.searchParams.get('code') || '', uid: rec.uid });
        await store.put('dlsess:' + rec.uid, { session: r.session }, DL_SESSION_TTL);   // token stays in the Worker
        log('digilocker connected');
        return page('Connected', '<h2>Connected</h2><p>You can close this tab and return to ArogyaBot.</p>');
      } catch (e) {
        log('digilocker callback error', e.status || 500, e.message);
        return page('Not connected', '<h2>Could not connect</h2><p>Please return to ArogyaBot and try again.</p>', e.status || 500);
      }
    }

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
      // ---- DigiLocker (plan Phase 4) ----
      if (p.startsWith('/digilocker/')) {
        const dl = makeDigilocker(env), store = makeStore(env);
        const sessKey = 'dlsess:' + user.uid;
        if (req.method === 'POST' && p === '/digilocker/start') {
          if (!store.durable && dlMode !== 'mock') return json({ error: 'kv_required' }, 500, cors);
          const state = randomToken();
          await store.put('dlstate:' + state, { uid: user.uid }, DL_STATE_TTL);
          return json({ authUrl: dl.authUrl({ state, origin: url.origin }), expiresIn: DL_STATE_TTL, mock: dl.mock }, 200, cors);
        }
        if (req.method === 'GET' && p === '/digilocker/status') return json({ connected: !!(await store.get(sessKey)), mock: dl.mock }, 200, cors);
        if (req.method === 'POST' && p === '/digilocker/disconnect') { await store.del(sessKey); return json({ connected: false }, 200, cors); }
        const sess = (p === '/digilocker/documents' || p === '/digilocker/fetch') ? await store.get(sessKey) : null;
        if (req.method === 'GET' && p === '/digilocker/documents') {
          if (!sess) return json({ error: 'not_connected' }, 409, cors);
          const docs = await dl.list({ session: sess.session, uid: user.uid });
          return json({ documents: docs.map(d => ({ uri: d.uri, name: d.name, issuer: d.issuer, type: d.type, category: d.category, date: d.date })), mock: dl.mock }, 200, cors);
        }
        if (req.method === 'POST' && p === '/digilocker/fetch') {
          if (!sess) return json({ error: 'not_connected' }, 409, cors);
          if (!/^[A-Za-z0-9:._-]{1,200}$/.test(body.uri || '') || (body.uri || '').includes('..')) return json({ error: 'invalid_request' }, 400, cors);   // confirm the real URI format in the Requester spec
          const d = await dl.fetchDoc({ session: sess.session, uri: body.uri, uid: user.uid });
          if (d.size > DL_MAX_BYTES) return json({ error: 'too_large' }, 413, cors);
          if (!(d.mime === 'application/pdf' || /^image\//.test(d.mime))) return json({ error: 'unsupported_type' }, 415, cors);
          return json({ name: d.name, mime: d.mime, size: d.size, issuer: d.issuer, type: d.type, category: d.category, externalId: d.uri, contentBase64: d.contentBase64, mock: dl.mock }, 200, cors);
        }
      }
      return json({ error: 'not_found' }, 404, cors);
    } catch (e) {
      log('error', url.pathname, e.status || 500, e.message);
      return json({ error: e.message || 'server_error' }, e.status || 500, cors);
    }
  },
};
