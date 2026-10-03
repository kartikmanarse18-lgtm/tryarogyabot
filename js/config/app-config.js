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
// Remote push (FCM). Registering for push without android/app/google-services.json crashes the Android app, so this
// is switched on ONLY by the build: when the GOOGLE_SERVICES_JSON secret exists the workflow adds the marker
// "ArogyaBotPush" to the app's user-agent. (The app loads the live website, so a flag edited inside the APK would never be seen.)
const NATIVE_PUSH_ENABLED = IS_NATIVE_APP && /ArogyaBotPush/.test(navigator.userAgent || '');

/* ---- ABDM / DigiLocker integration (plan: docs/ABDM_INTEGRATION_PLAN.md) ----
   Every flag is OFF. Later phases check these before showing anything new, so each phase can ship dark.
   Secrets (ABDM client id/secret etc.) NEVER go in this file; they live in the arogyabot-abdm Worker. */
const ABDM_ENABLED = true;
const DIGILOCKER_ENABLED = true;
const DOCS_STORAGE_ENABLED = false;  // Phase 3: new document uploads go to Firebase Storage (needs Blaze plan + storage.rules published)
const ABDM_ENV = 'sandbox';          // 'sandbox' | 'production'
const ABDM_WORKER_URL = 'https://arogyabot-abdm.kritzaararogyabot.workers.dev';          // set when the arogyabot-abdm Worker is deployed

/* ---- Android app download (js/services/apk-download.js) ----
   The "Get the Android app" icon/card appears on Android browsers ONLY when a signed APK is published at
   github.com/<APK_RELEASE_REPO>/releases/tag/<APK_RELEASE_TAG> (the GitHub Actions workflow does this on every push to main
   once the signing secrets exist). With no release yet, everything stays hidden by itself. Set to false to hide it always. */
const APK_DOWNLOAD_ENABLED = true;
const APK_RELEASE_REPO = 'kartikmanarse18-lgtm/tryarogyabot';
const APK_RELEASE_TAG = 'android-latest';
const APK_FILE_NAME = 'ArogyaBot.apk';

/* Official sites shown as plain links (Phase 1 / Track A). Re-check these before each release. */
const OFFICIAL_LINKS_REVIEWED = '2026-10-02';
const OFFICIAL_LINKS = {
  abha:       {label:'ABHA (Health ID)',       icon:'fa-id-card',       url:'https://abha.abdm.gov.in/',       hint:'Create or download your ABHA number and card'},
  digilocker: {label:'DigiLocker',             icon:'fa-folder-open',   url:'https://www.digilocker.gov.in/',  hint:'Government-issued documents in one place'},
  pmjay:      {label:'PM-JAY eligibility',     icon:'fa-shield-heart',  url:'https://beneficiary.nha.gov.in/', hint:'Check Ayushman Bharat eligibility'},
  abdm:       {label:'Ayushman Bharat Digital Mission', icon:'fa-landmark', url:'https://abdm.gov.in/',        hint:'About ABHA and digital health records'},
  mjpjay:     {label:'Maharashtra: MJPJAY',    icon:'fa-hospital',      url:'https://www.jeevandayee.gov.in/', hint:'Mahatma Jyotiba Phule Jan Arogya Yojana (state scheme example)'},
  // Added 3 Oct 2026 (gap analysis). echs.gov.in is confirmed on the DESW site. The rest come from the gap-analysis source list or
  // background knowledge: OPEN EACH ONCE BEFORE RELEASE, then bump OFFICIAL_LINKS_REVIEWED above.
  echs:        {label:'ECHS (ex-servicemen)',   icon:'fa-medal',         url:'https://www.echs.gov.in/',        hint:'Polyclinics, empanelled hospitals and forms'},
  janaushadhi: {label:'Jan Aushadhi Kendras',   icon:'fa-pills',         url:'https://janaushadhi.gov.in/',     hint:'Find low-cost generic medicine stores'},
  eraktkosh:   {label:'Blood banks (e-RaktKosh)', icon:'fa-droplet',     url:'https://eraktkosh.mohfw.gov.in/', hint:'Find blood banks and stock (Health Ministry / C-DAC portal)'},
  uwin:        {label:'U-WIN (vaccination)',    icon:'fa-syringe',       url:'https://uwin.mohfw.gov.in/',      hint:'Vaccination records for children and pregnant women'},
  esanjeevani: {label:'eSanjeevani (free tele-consult)', icon:'fa-video', url:'https://esanjeevani.mohfw.gov.in/', hint:'Government telemedicine service'},
  myscheme:    {label:'myScheme (find schemes)', icon:'fa-magnifying-glass', url:'https://www.myscheme.gov.in/', hint:'Search government schemes by eligibility'}
};
function officialLinksCardHTML(keys, heading){
  const rows = keys.map(k=>{ const l = OFFICIAL_LINKS[k]; if(!l) return '';
    return `<a class="btn btn-secondary btn-sm" style="margin:4px 8px 4px 0;" href="${l.url}" target="_blank" rel="noopener noreferrer" title="${l.hint}"><i class="fa-solid ${l.icon}"></i> ${l.label}</a>`; }).join('');
  return `<div class="card"><h3 style="margin-top:0;">${heading}</h3>
    <div>${rows}</div>
    <p style="color:var(--text-muted);font-size:.75rem;margin:8px 0 0;">Opens the official government site in your browser. ArogyaBot does not receive anything you enter there. Links last reviewed ${OFFICIAL_LINKS_REVIEWED}.</p></div>`;
}

// Where the app asks for a push to be sent to ANOTHER user's phone (prescription ready, appointment cancelled ...).
// Served by the SOS Worker at /api/push/notify (same SERVICE_ACCOUNT_JSON secret). Set '' to switch the relay off.
const PUSH_WORKER_URL = SOS_WORKER_URL.replace(/\/$/, '') + '/api/push';
