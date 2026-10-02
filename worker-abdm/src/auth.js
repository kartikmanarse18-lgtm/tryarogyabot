// Verifies a Firebase ID token (RS256) using Google's public keys. No secrets needed.
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { keys: null, at: 0 };

const b64uToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const b64uToJson = s => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));

async function getKeys() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error('jwks_unavailable');
  jwksCache = { keys: (await r.json()).keys, at: Date.now() };
  return jwksCache.keys;
}

// Returns { uid, email } or throws Error('unauthorized').
export async function verifyFirebaseToken(request, projectId, keysOverride) {
  const h = request.headers.get('Authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const parts = tok.split('.');
  if (parts.length !== 3) throw new Error('unauthorized');
  let header, payload;
  try { header = b64uToJson(parts[0]); payload = b64uToJson(parts[1]); } catch { throw new Error('unauthorized'); }
  if (header.alg !== 'RS256') throw new Error('unauthorized');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId || payload.iss !== 'https://securetoken.google.com/' + projectId ||
      !payload.sub || payload.exp < now || payload.iat > now + 60) throw new Error('unauthorized');
  const keys = keysOverride || await getKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('unauthorized');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('unauthorized');
  return { uid: payload.sub, email: payload.email || null };
}
