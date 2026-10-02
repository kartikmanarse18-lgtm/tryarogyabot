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

/* ---- ABDM / DigiLocker integration (plan: docs/ABDM_INTEGRATION_PLAN.md) ----
   Every flag is OFF. Later phases check these before showing anything new, so each phase can ship dark.
   Secrets (ABDM client id/secret etc.) NEVER go in this file; they live in the arogyabot-abdm Worker. */
const ABDM_ENABLED = false;
const DIGILOCKER_ENABLED = false;
const ABDM_ENV = 'sandbox';          // 'sandbox' | 'production'
const ABDM_WORKER_URL = '';          // set when the arogyabot-abdm Worker is deployed

/* Official sites shown as plain links (Phase 1 / Track A). Re-check these before each release. */
const OFFICIAL_LINKS_REVIEWED = '2026-10-02';
const OFFICIAL_LINKS = {
  abha:       {label:'ABHA (Health ID)',       icon:'fa-id-card',       url:'https://abha.abdm.gov.in/',       hint:'Create or download your ABHA number and card'},
  digilocker: {label:'DigiLocker',             icon:'fa-folder-open',   url:'https://www.digilocker.gov.in/',  hint:'Government-issued documents in one place'},
  pmjay:      {label:'PM-JAY eligibility',     icon:'fa-shield-heart',  url:'https://beneficiary.nha.gov.in/', hint:'Check Ayushman Bharat eligibility'},
  abdm:       {label:'Ayushman Bharat Digital Mission', icon:'fa-landmark', url:'https://abdm.gov.in/',        hint:'About ABHA and digital health records'},
  mjpjay:     {label:'Maharashtra: MJPJAY',    icon:'fa-hospital',      url:'https://www.jeevandayee.gov.in/', hint:'Mahatma Jyotiba Phule Jan Arogya Yojana (state scheme example)'}
};
function officialLinksCardHTML(keys, heading){
  const rows = keys.map(k=>{ const l = OFFICIAL_LINKS[k]; if(!l) return '';
    return `<a class="btn btn-secondary btn-sm" style="margin:4px 8px 4px 0;" href="${l.url}" target="_blank" rel="noopener noreferrer" title="${l.hint}"><i class="fa-solid ${l.icon}"></i> ${l.label}</a>`; }).join('');
  return `<div class="card"><h3 style="margin-top:0;">${heading}</h3>
    <div>${rows}</div>
    <p style="color:var(--text-muted);font-size:.75rem;margin:8px 0 0;">Opens the official government site in your browser. ArogyaBot does not receive anything you enter there. Links last reviewed ${OFFICIAL_LINKS_REVIEWED}.</p></div>`;
}

// URL of your deployed push Worker (worker/push-worker.js), e.g. 'https://arogyabot-push.<you>.workers.dev'.
// Empty = remote push relay off (reminders + in-app alerts still work).
const PUSH_WORKER_URL = '';
