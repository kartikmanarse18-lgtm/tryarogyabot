// ABDM gateway adapter. ALL ABDM-specific calls live here so a spec change never needs an app release.
//
// mock mode   : deterministic fake data, so the whole app flow can be built and tested today.
// real modes  : NOT implemented on purpose. Endpoint paths, API versions, and the RSA encryption ABDM requires for
//               Aadhaar/OTP values MUST be taken from the official ABDM sandbox docs once you have credentials.
//               Until then real modes return 501 instead of guessing at an API.
const NOT_READY = () => { const e = new Error('abdm_gateway_not_implemented'); e.status = 501; throw e; };

export function makeGateway(env) {
  const mode = env.ABDM_MODE || 'mock';
  if (mode !== 'mock') {
    return { aadhaarOtp: NOT_READY, aadhaarVerify: NOT_READY, mobileOtp: NOT_READY, mobileVerify: NOT_READY, profile: NOT_READY, card: NOT_READY };
  }
  // ---- MOCK ----  (OTP is always 123456; clearly fake data)
  const MOCK_OTP = '123456';
  const profile = (uid) => {
    const n = [...uid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1e8, 7);
    const d = String(n).padStart(8, '0');
    return { abhaNumber: `91-1234-${d.slice(0, 4)}-${d.slice(4)}`, abhaAddress: `mock${d}@sbx`, name: 'Mock Patient', mock: true };
  };
  return {
    async aadhaarOtp() { return { txnId: 'mock-' + crypto.randomUUID(), message: 'Mock OTP sent (use 123456)' }; },
    async aadhaarVerify({ otp, uid }) { if (otp !== MOCK_OTP) { const e = new Error('invalid_otp'); e.status = 400; throw e; } return profile(uid); },
    async mobileOtp() { return { txnId: 'mock-' + crypto.randomUUID(), message: 'Mock OTP sent (use 123456)' }; },
    async mobileVerify({ otp, uid }) { if (otp !== MOCK_OTP) { const e = new Error('invalid_otp'); e.status = 400; throw e; } return profile(uid); },
    async profile({ uid }) { return profile(uid); },
    async card({ uid }) { const p = profile(uid); return { abhaNumberMasked: mask(p.abhaNumber), abhaAddress: p.abhaAddress, qrText: 'MOCK-ABHA:' + p.abhaAddress, mock: true }; },
  };
}
export const mask = n => String(n || '').replace(/\d(?=(?:[\d-]*\d){4})/g, 'X'); // keeps last 4 digits
