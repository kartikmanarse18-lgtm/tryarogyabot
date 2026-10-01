# ArogyaBot — project layout

The old single `index.html` (785 KB) is now split into small, single-purpose files.
**Nothing was rewritten:** the JavaScript is byte-for-byte the same code (verified — see
"How the split was verified"), only moved into files and the 7 config values gathered into one place.

```
index.html              ← markup only (~17 KB): screens + <link>/<script> tags
css/                    ← 7 stylesheets (tokens → screens → shell → components → print → tools)
js/
  config/app-config.js  ← ALL URLs / keys / passcodes. Edit here, nowhere else.
  core/                 ← load-guard, pwa, storage, account isolation, notifications, location
  services/             ← firebase, emailjs, SOS worker client, video call, payments, maps
  ui/                   ← modal, toasts
  auth/                 ← landing, per-role login, Aadhaar, family members, admin desk
  shell/                ← side nav, quick drawer, view dispatcher
  modules/<role>/       ← patient (23 files), responder, police, hospital, doctor, pharmacy, delivery
  main.js               ← bootstrap (must be last)
tests/                  ← automated smoke + click-through tests (npm test)
```

## Rules that keep it from breaking
1. **Load order is the contract.** These are classic scripts sharing one global scope (so the
   existing `onclick="..."` handlers keep working). Each file may use anything defined in files
   *above* it in `index.html`. `config` is first, `main.js` is last.
2. **To add a feature:** create `js/modules/<role>/my-feature.js`, add one `<script>` line in
   `index.html` before `main.js`. Don't edit unrelated files.
3. **If a file fails to load** (bad deploy / network), a red banner with a Reload button appears
   instead of a half-working app (`js/core/load-guard.js`).
4. Run `cd tests && npm install && npm test` before every deploy.

## Deploying (GitHub Pages)
Upload the whole folder, keeping the structure. Keep your existing `manifest.json`, `sw.js` and
`icons/` next to `index.html` (they were not part of the upload, so they're untouched).
**Important:** if your `sw.js` precaches files, add the new `css/*.css` and `js/**/*.js` paths to its
list and bump its cache version — otherwise returning users keep the old cached monolith.

## Multi-user handling (what exists today)
Already in the code, unchanged: per-account isolation of private patient data
(`js/core/account-isolation.js`), per-scope notification inboxes, Firestore sync, and the
Cloudflare Durable Object SOS backend. **Real multi-user safety depends on your Firestore
Security Rules and Worker auth, which live outside this repo** — test them with two real accounts.

## Security (please read)
* `ADMIN_PASSCODE = 'admin123'` is in `app-config.js`. Anything in the browser is public — **anyone can
  read it.** Replace with a real server-side check (e.g. Firebase Auth allow-listed admin email,
  verified in your admin Worker) before real use.
* The Firebase `apiKey` and EmailJS public key are designed to be public; their protection is
  Firestore rules / EmailJS domain allow-listing. Confirm both are locked to your domain.

## How the split was verified
* Reassembling all files in order reproduces the original JS exactly (10,591 lines, identical).
* All 764 top-level functions/constants exist at runtime; every `node --check` passes.
* Original vs split: same landing screen, same 5 role screens, admin gate opens, 0 runtime errors in both.
