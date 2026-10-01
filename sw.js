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
const CACHE_VERSION = 'v1';
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
  './icons/favicon-16.png'
];

// Hosts this service worker must NEVER intercept or cache a response for —
// live dispatch, auth, database sync, and OTP email delivery all go through
// these. Serving anything cached for these (even briefly) risks showing a
// stale incident/bed status or silently eating a real request.
const NEVER_INTERCEPT_HOSTS = [
  'arogyabot-sos.kritzaararogyabot.workers.dev',
  'arogyabot-admin.kritzaararogyabot.workers.dev',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'api.emailjs.com',
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
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
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
