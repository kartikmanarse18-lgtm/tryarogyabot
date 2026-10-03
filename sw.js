/* ============================================================
   ArogyaBot service worker
   ------------------------------------------------------------
   This app is a real-time emergency dispatch platform (live SOS
   broadcast over a Cloudflare Worker + WebSocket, Firebase
   Auth/Firestore sync, emailed OTPs, live GPS). None of that can or
   should be served from a cache — a stale bed count or a swallowed
   SOS request is unacceptable. So this service worker deliberately
   does ONE job only: cache the static app shell (this HTML file,
   manifest, icons, and the handful of third-party static libraries)
   so the app *installs* like a real app, opens instantly on repeat
   visits, and shows something instead of a browser error page if
   the network briefly drops — NOT full offline functionality for
   emergency features, which genuinely need a live connection.

   Registered with a relative path from index.html (see the
   navigator.serviceWorker.register('./sw.js') call in the page), so
   its scope is automatically whatever folder the app is deployed to
   — the root of a GitHub Pages *user* site (username.github.io) or a
   subpath on a *project* site (username.github.io/repo-name/). This
   file only ever uses relative paths for that same reason.
   ============================================================ */
const CACHE_VERSION = 'v10';
const CACHE_NAME = 'arogyabot-shell-' + CACHE_VERSION;

// Precached at install time. Keep this list to the actual app shell —
// anything dynamic (data, API responses) does not belong here.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  // app code (so an installed PWA opens offline) — regenerate this list when files are added
  './css/app-shell.css',
  './css/base-and-screens.css',
  './css/fitness-and-health-tools.css',
  './css/invoice-print.css',
  './css/quick-drawer.css',
  './css/tokens.css',
  './css/views-and-components.css',
  './js/auth/aadhaar-and-access-grants.js',
  './js/auth/admin-desk.js',
  './js/auth/auth-dispatch.js',
  './js/auth/delivery-login.js',
  './js/auth/doctor-login.js',
  './js/auth/family-members.js',
  './js/auth/landing.js',
  './js/auth/patient-auth.js',
  './js/auth/profile-menu.js',
  './js/auth/role-auth-flows.js',
  './js/auth/secret-admin-access.js',
  './js/auth/shared-role-auth.js',
  './js/config/app-config.js',
  './js/core/account-isolation.js',
  './js/core/view-state.js',
  './js/core/load-guard.js',
  './js/core/location-tracking.js',
  './js/core/native-bridge.js',
  './js/core/notification-center.js',
  './js/core/notification-sound.js',
  './js/core/pwa.js',
  './js/core/storage.js',
  './js/core/utils-and-seed-data.js',
  './js/main.js',
  './js/modules/delivery/delivery-console.js',
  './js/modules/doctor/doctor-console.js',
  './js/modules/hospital/hospital.js',
  './js/modules/patient/ai-chat.js',
  './js/modules/patient/dashboard.js',
  './js/modules/patient/e-prescriptions.js',
  './js/modules/patient/fitness-tools.js',
  './js/data/schemes-registry.js',
  './js/modules/patient/insurance-schemes.js',
  './js/modules/patient/service-schemes.js',
  './js/modules/patient/lifestyle-tools.js',
  './js/modules/patient/medication-dosage.js',
  './js/modules/patient/medicine-reminder-clock.js',
  './js/modules/patient/my-documents.js',
  './js/modules/patient/abha-health-id.js',
  './js/services/doc-storage.js',
  './js/services/digilocker.js',
  './js/services/abdm-client.js',
  './js/services/apk-download.js',
  './js/modules/patient/nearby-help.js',
  './js/modules/patient/nutrition-tools.js',
  './js/modules/patient/pharmacy-reminders.js',
  './js/modules/patient/pregnancy-tools.js',
  './js/modules/patient/records.js',
  './js/modules/patient/sos.js',
  './js/modules/patient/symptom-history.js',
  './js/modules/patient/telemedicine.js',
  './js/modules/patient/vitals-screening.js',
  './js/modules/patient/womens-health.js',
  './js/modules/shared/about.js',
  './js/modules/pharmacy/billing-invoicing.js',
  './js/modules/pharmacy/delivery-roster.js',
  './js/modules/pharmacy/inventory.js',
  './js/modules/pharmacy/pharmacy-console.js',
  './js/modules/police/police.js',
  './js/modules/responder/responder.js',
  './js/services/emailjs-otp.js',
  './js/services/firebase-secondary-app.js',
  './js/services/firebase-sync.js',
  './js/services/hard-tier-sync.js',
  './js/services/maps-leaflet.js',
  './js/services/payments.js',
  './js/services/private-account-sync.js',
  './js/services/public-directories.js',
  './js/services/sos-worker-client.js',
  './js/services/users-sync.js',
  './js/services/video-call.js',
  './js/shell/quick-access-drawer.js',
  './js/shell/side-nav.js',
  './js/shell/view-dispatch.js',
  './js/ui/modal.js',
  './js/ui/toasts.js'
];

// Hosts this service worker must NEVER intercept or cache a response for —
// live dispatch, auth, database sync, and OTP email delivery all go through
// these. Serving anything cached for these (even briefly) risks showing a
// stale incident/bed status or silently eating a real request.
const NEVER_INTERCEPT_HOSTS = [
  'arogyabot-sos.kritzaararogyabot.workers.dev',
  'arogyabot-admin.kritzaararogyabot.workers.dev',
  'firestore.googleapis.com',
  // Phase 3: private health documents. Never cache Storage responses/download links on the device's shared cache.
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'api.emailjs.com',
  'api.github.com',   // APK release check: always live, never cached
  'router.project-osrm.org',
  'nominatim.openstreetmap.org'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(e => console.warn('SW precache failed (app still works online)', e))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch non-GET requests (SOS dispatch actions, OTP sends, payments,
  // Firestore writes, etc. all go over POST/PUT and must always hit the
  // network directly — a cached "response" to one of these would be nonsense).
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Real-time/backend traffic: pass straight through, untouched, no fallback.
  if (NEVER_INTERCEPT_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
    return;
  }

  // This app's own files: network-first, falling back to the cached copy
  // when offline (or on a flaky connection), so a reload always gets the
  // latest deployed version when online, but the installed app still opens
  // — showing the last-cached shell — with no network at all.
  if (url.origin === self.location.origin) {
    // Network-first, but give up after 4s so a weak/"connected but dead" signal
    // falls back to the cached copy instead of hanging on a blank screen.
    const net = fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    });
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 4000));
    const fromCache = () => caches.match(req).then(c => c || caches.match('./index.html'));
    event.respondWith(
      Promise.race([net.catch(() => null), timeout])
        .then(res => res || fromCache().then(c => c || net))
    );
    return;
  }

  // Third-party STATIC libraries only (Leaflet, Font Awesome, Google Fonts,
  // the Firebase/EmailJS SDK script files themselves — their actual API
  // endpoints are excluded above): stale-while-revalidate. Serve the cached
  // copy immediately if there is one (fast, works offline once fetched
  // once), while quietly fetching a fresh copy in the background for next
  // time.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req)
          .then(res => { cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
