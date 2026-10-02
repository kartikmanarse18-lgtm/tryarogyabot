/* ============================================================
   APP CONFIG — every URL / key / passcode you may need to change
   lives here, and ONLY here. Loaded first, before any other script.
   NOTE: this file is public (it ships to the browser). Never put a
   truly secret value here. See README.md → "Security".
   ============================================================ */
const SOS_WORKER_URL = 'https://arogyabot-sos.kritzaararogyabot.workers.dev';

const ADMIN_WORKER_URL = 'https://arogyabot-admin.kritzaararogyabot.workers.dev';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhzw_8p9pIUO4C2_QYX53CvKuh0NjhY48",
  authDomain: "kritzaararogyabot.firebaseapp.com",
  projectId: "kritzaararogyabot",
  storageBucket: "kritzaararogyabot.firebasestorage.app",
  messagingSenderId: "188593206464",
  appId: "1:188593206464:web:ece8c509f408d20e236925"
};

const EMAILJS_CONFIG = {
  publicKey: "Y4zJTzwVc1zHM5SYu",
  serviceId: "service_dzrh177",
  templateId: "template_ct512x4"
};

/* ADMIN_PASSCODE removed on purpose: it is now a server-side secret in the admin worker (see /admin/login). */

const AI_BACKEND_URL = 'https://arogyabot-ai.kritzaararogyabot.workers.dev';

// Public, harmless: only reveals the admin login box. The real secrets (staff phrase + passcode) live in the admin worker.
const ADMIN_DOOR_WORD = 'staffdesk';

/* ---------- Native (Android) app ---------- */
// True only inside the Capacitor app shell, never in a normal browser/PWA.
const IS_NATIVE_APP = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform==='function' && window.Capacitor.isNativePlatform());
// Remote push (FCM). Leave FALSE until android/app/google-services.json exists —
// registering for push without it crashes the Android app. See NATIVE_APP.md, step 3.
const NATIVE_PUSH_ENABLED = false;
// URL of your deployed push Worker (worker/push-worker.js), e.g. 'https://arogyabot-push.<you>.workers.dev'.
// Empty = remote push relay off (reminders + in-app alerts still work).
const PUSH_WORKER_URL = '';
