# arogyabot-abdm Worker (ABDM plan, Phase 2)

Separate from the SOS/admin/AI Workers on purpose. The app never talks to ABDM directly; secrets live only here.

- `ABDM_MODE="mock"` (default): fake ABHA data, OTP is always `123456`. Lets you build and test the whole app flow with no ABDM credentials.
- `sandbox`/`production`: gateway calls in `src/gateway.js` are intentionally NOT implemented (return 501). Fill them in from the official ABDM sandbox docs once you have credentials. Aadhaar/OTP encryption required by ABDM is part of that step.
- Every app-facing route verifies a Firebase ID token (Google public keys, no secret).
- Aadhaar, OTPs, ABHA numbers and tokens are never stored or logged; the app only receives a masked ABHA number and address.

## Deploy
    cd worker-abdm
    npx wrangler kv namespace create ABDM_KV      # paste id into wrangler.toml
    npx wrangler deploy
Then set `ABDM_WORKER_URL` in `js/config/app-config.js` and flip `ABDM_ENABLED` to `true` for the build you want to test.
