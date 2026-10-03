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

## About page
`js/modules/shared/about.js` renders one About page used by **every role** (last item in each side menu) and
by a pre-login screen opened from the landing page. Edit `ABOUT_INFO` at the top of that file for version,
maker, contact e-mail, website and an optional founder note (empty fields are hidden). The
"what is live vs test mode" table reads the real flags in `app-config.js`, so it stays truthful when you
switch a flag. Covered by `tests/about-test.js`. When you add files, keep `sw.js` in step and bump its cache version.

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
* The staff phrase and passcode are **not** in this repo. They are Cloudflare secrets (`ADMIN_PHRASE`, `ADMIN_PASSCODE`)
  in the admin worker, which checks both on the server (`/admin/login`) and returns a Firebase sign-in token with an
  admin claim. `ADMIN_DOOR_WORD` in `app-config.js` only shows the login box; it is not a security control.
* The Firebase `apiKey` and EmailJS public key are designed to be public; their protection is
  Firestore rules / EmailJS domain allow-listing. Confirm both are locked to your domain.

## How the split was verified
* Reassembling all files in order reproduces the original JS exactly (10,591 lines, identical).
* All 764 top-level functions/constants exist at runtime; every `node --check` passes.
* Original vs split: same landing screen, same 5 role screens, admin gate opens, 0 runtime errors in both.
