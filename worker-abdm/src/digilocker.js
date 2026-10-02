// DigiLocker "Fetch" adapter (plan Phase 4 / Track D). ALL DigiLocker-specific calls live here.
//
// mock mode : fake consent page + fake documents, so the whole app flow can be built and tested today.
// real modes: NOT implemented on purpose. The authorize/token/list/fetch endpoints, parameters (including any PKCE
//             requirement), token lifetime and the document URI format MUST be taken from the official DigiLocker
//             Requester API specification and API Setu partner documentation once ArogyaBot's Requester application is
//             approved. Until then real modes return 501 instead of guessing at an API.
//
// Tokens never leave the Worker: the app only ever receives document metadata and file bytes.

const NOT_READY = () => { const e = new Error('digilocker_gateway_not_implemented'); e.status = 501; throw e; };

export const DL_MAX_BYTES = 5 * 1024 * 1024;      // largest document the Worker will hand to the app
export const DL_STATE_TTL = 600;                   // seconds the consent redirect stays valid
export const DL_SESSION_TTL = 3600;                // seconds a connected session is kept

/* ---- short-lived store: KV in production; in-memory (mock/dev only, not durable across Worker instances) ---- */
const mem = new Map();
export function makeStore(env) {
  const kv = env.ABDM_KV;
  if (kv) {
    return {
      durable: true,
      get: async (k) => { const v = await kv.get(k); return v ? JSON.parse(v) : null; },
      put: async (k, v, ttl) => kv.put(k, JSON.stringify(v), { expirationTtl: Math.max(60, ttl) }),
      del: async (k) => kv.delete(k),
    };
  }
  return {
    durable: false,
    get: async (k) => { const e = mem.get(k); if (!e) return null; if (e.exp < Date.now()) { mem.delete(k); return null; } return e.v; },
    put: async (k, v, ttl) => { mem.set(k, { v, exp: Date.now() + ttl * 1000 }); },
    del: async (k) => { mem.delete(k); },
  };
}

export const randomToken = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- a tiny valid PDF for the mock documents (clearly labelled TEST) ---- */
function mockPdf(title) {
  const text = String(title).replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj 0 -28 Td (TEST DOCUMENT - not a real record) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
const toBase64 = (str) => btoa(str);

const MOCK_DOCS = [
  { uri: 'mock:in.gov.mock-insurance-card', name: 'Mock Insurance Card (TEST).pdf', issuer: 'Mock Health Authority', type: 'Insurance card', category: 'insurance', date: '2026-01-15' },
  { uri: 'mock:in.gov.mock-vaccination', name: 'Mock Vaccination Certificate (TEST).pdf', issuer: 'Mock Immunisation Programme', type: 'Vaccination certificate', category: 'history', date: '2025-11-02' },
];
export const isMockUri = (u) => MOCK_DOCS.some(d => d.uri === u);

export function makeDigilocker(env) {
  const mode = env.ABDM_MODE || 'mock';
  if (mode !== 'mock') {
    return { authUrl: NOT_READY, exchange: NOT_READY, list: NOT_READY, fetchDoc: NOT_READY, mock: false };
  }
  return {
    mock: true,
    // The mock "DigiLocker" consent page is served by this Worker itself (see index.js).
    authUrl({ state, origin }) { return `${origin}/digilocker/mock-authorize?state=${encodeURIComponent(state)}`; },
    async exchange({ code }) { if (code !== 'mock-code') { const e = new Error('invalid_code'); e.status = 400; throw e; } return { session: 'mock-session' }; },
    async list() { return MOCK_DOCS.map(d => ({ ...d })); },
    async fetchDoc({ uri }) {
      const d = MOCK_DOCS.find(x => x.uri === uri);
      if (!d) { const e = new Error('document_not_found'); e.status = 404; throw e; }
      const b64 = toBase64(mockPdf(d.name.replace(/\.pdf$/, '')));
      return { ...d, mime: 'application/pdf', contentBase64: b64, size: Math.floor(b64.length * 3 / 4) };
    },
  };
}
