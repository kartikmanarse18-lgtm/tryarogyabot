/* ============================================================
   ABOUT AROGYABOT — one page, every role, also reachable before login.
   ------------------------------------------------------------
   * Edit ABOUT_INFO below for version / maker / contact. Empty fields are simply hidden.
   * "Live vs test mode" rows are computed from the real feature flags in app-config.js,
     so this page cannot drift out of date when you switch a flag on or off.
   * Uses only the shared design tokens, so it automatically follows each role's theme.
   * Keep wording honest: this page says what is real, what is simulated, and what is only planned.
   ============================================================ */
const ABOUT_INFO = {
  version: '0.1.0',               // keep in step with package.json
  lastUpdated: '3 October 2026',
  stage: 'Early build — testing & pilot preparation',
  maker: '',                      // e.g. 'Your name / team' (hidden when empty)
  contactEmail: '',               // e.g. 'hello@yourdomain.in' (hidden when empty)
  website: '',                    // e.g. 'https://yourdomain.in' (hidden when empty)
  founderNote: ''                 // optional short personal note shown under "Why we built it"
};

function aboutFlags(){
  return {
    abdm: typeof ABDM_ENABLED!=='undefined' && ABDM_ENABLED===true,
    dl: typeof DIGILOCKER_ENABLED!=='undefined' && DIGILOCKER_ENABLED===true,
    url: typeof ABDM_WORKER_URL!=='undefined' ? ABDM_WORKER_URL : '',
    docs: typeof DOCS_STORAGE_ENABLED!=='undefined' && DOCS_STORAGE_ENABLED===true,
    push: typeof NATIVE_PUSH_ENABLED!=='undefined' && NATIVE_PUSH_ENABLED===true,
    ai: typeof AI_BACKEND_URL!=='undefined' && !!AI_BACKEND_URL
  };
}

/* ---------- small building blocks ---------- */
function aboutCard(icon, title, bodyHTML){
  return `<div class="card about-card"><h3 class="about-h"><i class="fa-solid ${icon}"></i>${title}</h3>${bodyHTML}</div>`;
}
function aboutChips(list){ return list.map(t=>`<span class="med-tag">${t}</span>`).join(''); }
function aboutRows(rows){
  return `<div class="about-table">${rows.map(r=>`<div class="about-row"><div class="about-k">${r[0]}</div><div class="about-v">${r[1]}</div></div>`).join('')}</div>`;
}
function aboutStatus(kind, label){
  const cls = kind==='live' ? 'status-ok' : kind==='test' ? 'status-warn' : kind==='info' ? 'status-info' : 'status-muted';
  return `<span class="status-tag ${cls}">${label}</span>`;
}

/* ---------- live-vs-test table, computed from real flags ---------- */
function aboutStatusRows(){
  const f = aboutFlags();
  const abdmOn = f.abdm && !!f.url;
  const dlOn = f.dl && !!f.url;
  const docsOn = f.docs;
  const pushOn = f.push;
  const aiOn = f.ai;
  return [
    ['Emergency SOS dispatch', aboutStatus('live','Live'), 'Real-time broadcast to nearby responders, hospitals and police through a Cloudflare Worker, backed by Firebase.'],
    ['Accounts &amp; sign-in OTP', aboutStatus('live','Live'), 'Firebase sign-in with e-mailed one-time codes.'],
    ['Telemedicine video', aboutStatus('live','Live'), 'Direct peer-to-peer video (WebRTC) between patient and doctor.'],
    ['Maps &amp; nearby help', aboutStatus('live','Live'), 'OpenStreetMap maps with GPS. Directory entries shown are the ones in this app, not a complete national list yet.'],
    ['AI symptom checker', aiOn ? aboutStatus('live','Live + built-in') : aboutStatus('test','Built-in only'), 'A built-in medical knowledge base always works offline' + (aiOn ? ', and a cloud AI service adds richer reports when reachable.' : '.') + ' It gives information, not a diagnosis.'],
    ['Health tools (fitness, vitals, nutrition, sleep, women\'s health)', aboutStatus('live','Live'), 'Calculators, screening tools and trackers that save to your private account. They are for awareness, not diagnosis.'],
    ['Daily health diary &amp; calendar', aboutStatus('plan','Coming soon'), 'Planned: a dated log of blood sugar, blood pressure and your own custom measurements, shown on a calendar. Today the vitals tools check a reading you type in; they do not yet keep a history.'],
    ['ABHA Health ID', abdmOn ? aboutStatus('test','Test mode') : aboutStatus('plan','Not switched on'), abdmOn ? 'You can try the full linking flow, but it is a <strong>simulation</strong> (test OTP, no real ABHA is created) until the government approves production access.' : 'Official ABHA links are shown; in-app linking is switched off.'],
    ['DigiLocker import', dlOn ? aboutStatus('test','Test mode') : aboutStatus('plan','Not switched on'), dlOn ? 'Demonstration documents only. Real DigiLocker needs separate government approval.' : 'Official DigiLocker link only.'],
    ['Cloud document storage', docsOn ? aboutStatus('live','Live') : aboutStatus('plan','Rolling out'), docsOn ? 'New uploads go to private cloud storage.' : 'Waiting for the storage plan and security rules to be switched on. Existing upload still works.'],
    ['Payments (consultation &amp; medicines)', aboutStatus('test','Simulated'), 'The checkout screen works but <strong>no real money moves</strong> yet. A licensed payment gateway is planned.'],
    ['Ambulance route guidance', aboutStatus('test','Simulated'), 'Responder navigation is a simulation of turn-by-turn guidance.'],
    ['Android push notifications', pushOn ? aboutStatus('live','Live') : aboutStatus('plan','Not enabled'), pushOn ? 'Remote push is enabled.' : 'In-app alerts and on-device medicine reminders work; remote push needs Firebase set-up for the Android app.']
  ];
}

/* ---------- the full page content (shared by in-app view and pre-login screen) ---------- */
function aboutContentHTML(){
  const meta = [
    ['App name','ArogyaBot — Emergency &amp; Health Intelligence Platform'],
    ['Version', ABOUT_INFO.version + ' &nbsp;·&nbsp; ' + ABOUT_INFO.stage],
    ['Last updated', ABOUT_INFO.lastUpdated],
    ['Works on','Any modern browser (installable as an app), and Android through a packaged app. iPhone: use it in the browser or add it to the Home Screen.'],
    ['Language','English today. Hindi and Marathi are planned first.'],
    ['Made for','Patients and families, ambulance crews, police, hospitals, doctors, pharmacies and delivery partners in India.']
  ];
  if(ABOUT_INFO.maker) meta.push(['Built by', ABOUT_INFO.maker]);
  if(ABOUT_INFO.website) meta.push(['Website', `<a href="${ABOUT_INFO.website}" target="_blank" rel="noopener noreferrer">${ABOUT_INFO.website}</a>`]);
  if(ABOUT_INFO.contactEmail) meta.push(['Contact', `<a href="mailto:${ABOUT_INFO.contactEmail}">${ABOUT_INFO.contactEmail}</a>`]);

  const hero = `<div class="card about-hero">
    <div class="about-hero-logo"><i class="fa-solid fa-heart-pulse"></i></div>
    <div>
      <div class="about-hero-title">ArogyaBot</div>
      <div class="about-hero-sub">Your complete health companion — emergency help, everyday health tools, records, medicines and government health schemes, built for India.</div>
      <div style="margin-top:10px;">${aboutStatus('test','v'+ABOUT_INFO.version)} ${aboutStatus('test','Early build')}</div>
    </div>
  </div>`;

  const emergencyNotice = `<div class="card about-notice">
    <i class="fa-solid fa-triangle-exclamation"></i>
    <div><strong>In a life-threatening emergency, call 112 (or your local ambulance number) directly.</strong>
    ArogyaBot is an early build, and no app should be your only way to reach help. Use the SOS button as well, never instead.</div>
  </div>`;

  const what = aboutCard('circle-info','What is ArogyaBot?', `
    <p>ArogyaBot connects the people who are involved when something goes wrong with someone's health — the patient, the ambulance, the police, the hospital, the doctor and the pharmacy — on one live platform.</p>
    <p>A patient presses one SOS button. Their location and a short medical summary go out at the same time to the nearest responders, hospitals and police station, instead of the family making call after call. The same app also holds their records, prescriptions, reminders, telemedicine visits and government scheme details, so everyday care and emergency care live in the same place.</p>
    <p>Beyond emergencies, ArogyaBot is meant to be an <strong>everyday health companion</strong>: fitness and body-health calculators, vitals and risk screening, nutrition, sleep and lifestyle tools, and a women\'s health suite with a period and pregnancy tracker.</p>
    <p style="margin-bottom:0;">It works in the browser, can be installed like an app, and is also packaged as an Android app from the same code.</p>`);

  const companion = aboutCard('heart-circle-check','Your everyday health companion', `
    <p>Emergencies are rare. Staying well is every day. Alongside SOS, ArogyaBot gives patients and families a set of health tools that work together with their records, medicines and doctor visits.</p>
    <div class="about-grid">
      <div class="about-mini"><i class="fa-solid fa-heart-pulse"></i><strong>Fitness &amp; body</strong><span>BMI, ideal body weight, daily calorie needs (BMR), body-fat estimate and waist-to-hip ratio.</span></div>
      <div class="about-mini"><i class="fa-solid fa-heart-circle-check"></i><strong>Vitals &amp; risk screening</strong><span>Check a blood-pressure or blood-sugar reading against standard ranges, see heart-rate training zones, and get diabetes and heart-disease risk scores.</span></div>
      <div class="about-mini"><i class="fa-solid fa-apple-whole"></i><strong>Nutrition</strong><span>A food nutrition table, a meal builder, and macro and daily water calculators.</span></div>
      <div class="about-mini"><i class="fa-solid fa-moon"></i><strong>Sleep &amp; lifestyle</strong><span>Sleep needs by age and sleep-cycle timing, a daily step goal, smoking pack-years and a short mental-wellbeing check.</span></div>
      <div class="about-mini"><i class="fa-solid fa-venus"></i><strong>Women\'s health</strong><span>A period and cycle tracker with a calendar, symptom, mood and pain logging, fertile-window and ovulation estimates, an optional PIN lock, plus pregnancy due-date and weight tools. Shown for female profiles.</span></div>
      <div class="about-mini"><i class="fa-solid fa-pills"></i><strong>Medicines</strong><span>Reminders that ring like alarms on Android, medication and child-dose calculators, and e-prescriptions from your doctor.</span></div>
    </div>
    <div class="about-inner" style="margin-top:14px;">
      <div style="margin-bottom:6px;">${aboutStatus('plan','Coming soon')} <strong>Daily health diary on a calendar</strong></div>
      <p style="margin:0;">Log your own daily readings, such as <strong>blood sugar</strong>, <strong>blood pressure</strong>, weight, and any <strong>custom measurement</strong> your doctor asks you to track, then see them day by day on a calendar with trends. You will be able to share the history with your doctor only when you choose to. This is planned and not live yet: today the vitals tools check a reading you type in, but do not keep a history.</p>
    </div>
    <p style="margin:12px 0 0;font-size:.82rem;color:var(--text-muted);">These tools are for information and awareness. They do not diagnose or treat, and they do not replace a doctor.</p>`);

  const why = aboutCard('lightbulb','Why we built it', `
    <p>Healthcare in India is not short of services. It is short of <strong>connection between them</strong>. The problem comes down to five gaps:</p>
    <div class="about-grid">
      <div class="about-mini"><i class="fa-solid fa-phone-volume"></i><strong>Emergencies are slow to coordinate.</strong><span>Families phone an ambulance, then a hospital, then the police, one by one, while minutes pass. Responders may arrive knowing nothing about the patient.</span></div>
      <div class="about-mini"><i class="fa-solid fa-folder-open"></i><strong>Records are scattered.</strong><span>Prescriptions on paper, reports in WhatsApp, scans in phone galleries. Nothing is at hand when a new doctor asks "what are you on?"</span></div>
      <div class="about-mini"><i class="fa-solid fa-file-shield"></i><strong>Schemes are hard to understand.</strong><span>PM-JAY, CGHS, ESIC, ECHS and state schemes each have their own cards, rules and portals. It is easy for eligible families to miss out.</span></div>
      <div class="about-mini"><i class="fa-solid fa-pills"></i><strong>Medicines are a separate errand.</strong><span>A prescription, a pharmacy, a payment and a delivery are four disconnected steps, and refills are easy to forget.</span></div>
      <div class="about-mini"><i class="fa-solid fa-users"></i><strong>Responders work in silos.</strong><span>Ambulance, police and hospitals each see only their own part of the same incident.</span></div>
    </div>
    <p style="margin-top:14px;">ArogyaBot is our attempt to close those gaps in one app, with India's own systems as the foundation: ABHA and the Ayushman Bharat Digital Mission for health identity, PM-JAY and state schemes for coverage, DigiLocker for documents.</p>
    <p style="margin-bottom:0;"><strong>How it relates to Aarogya Setu and other official apps:</strong> we are an independent project and we do not replace them. Aarogya Setu 2.0 is the government's health-record app. ArogyaBot focuses on what happens <em>around</em> the record — live emergency response, medicines, consultations and everyday care — and links out to the official sites for anything government-issued.</p>
    ${ABOUT_INFO.founderNote ? `<blockquote class="about-quote">${ABOUT_INFO.founderNote}</blockquote>` : ''}`);

  const emergencyFlow = aboutCard('truck-medical','How an emergency works', `
    <ol class="about-steps">
      <li><strong>Patient taps SOS.</strong> The app captures live GPS and attaches the patient's saved medical summary.</li>
      <li><strong>One broadcast, many receivers.</strong> The alert goes out in real time to the nearest ambulance responders, hospitals and the nearest police station together.</li>
      <li><strong>A responder accepts.</strong> The patient sees who is coming. The responder gets the medical summary and a route.</li>
      <li><strong>The hospital is warned early.</strong> The moment a responder accepts, the chosen hospital gets an incoming-patient alert so a bed and a team can be ready.</li>
      <li><strong>Police are in the loop.</strong> The station sees the case, can acknowledge it and help clear the route.</li>
      <li><strong>Everything is tracked to the end</strong> with status updates and an audit trail.</li>
    </ol>`);

  const roles = aboutCard('people-group','Who uses it, and what each person gets', `
    <div class="about-roles">
      ${[
        ['user-injured','Patients &amp; families','SOS, AI symptom checker, symptom history, medical records, telemedicine, e-prescriptions, pharmacy and reminders, medication and child-dose calculators, fitness, nutrition, vitals and risk screening, lifestyle tools, women\'s health and pregnancy tools (shown for female profiles), government schemes and insurance, My Documents, ABHA Health ID, and family profiles so one login can look after a household.'],
        ['truck-medical','Ambulance responders','A live dispatch queue, patient medical summary on accept, an active-case screen with map and route guidance, and status updates back to everyone watching.'],
        ['shield-halved','Police','Every SOS reaches the nearest station automatically. A dispatch feed with map, acknowledgement and route clearance.'],
        ['hospital','Hospitals','Incoming-patient alerts, bed and ICU capacity, doctor roster and doctor account creation, telemedicine, Aadhaar and scheme verification (only with the patient\'s approval), and a full audit trail.'],
        ['user-doctor','Doctors','Appointments, availability slots, a professional profile, video consultations and writing e-prescriptions that flow straight to the patient and pharmacy.'],
        ['mortar-pestle','Pharmacies','Incoming prescriptions, live medicine inventory visible to nearby patients, billing and printable invoices, and a delivery roster.'],
        ['motorcycle','Delivery partners','Assigned deliveries, live location sharing for order tracking, and a simple profile.']
      ].map(r=>`<div class="about-role"><div class="about-role-ico"><i class="fa-solid fa-${r[0]}"></i></div><div><strong>${r[1]}</strong><div class="about-role-txt">${r[2]}</div></div></div>`).join('')}
    </div>
    <p style="margin:12px 0 0;font-size:.82rem;color:var(--text-muted);">A restricted staff desk also exists for platform administration. It is not part of the public app.</p>`);

  const status = aboutCard('flask-vial','What is live today, and what is only a test', `
    <p>We would rather be clear than impressive. Here is the honest state of each part of the app right now. These labels are read from the app's real settings, so they change when we switch something on.</p>
    <div class="about-status">
      ${aboutStatusRows().map(r=>`<div class="about-status-row"><div class="about-status-name">${r[0]}</div><div>${r[1]}</div><div class="about-status-note">${r[2]}</div></div>`).join('')}
    </div>
    <p style="margin:14px 0 0;"><strong>Why some parts are in test mode:</strong></p>
    <ul class="about-list">
      <li><strong>ABHA and DigiLocker</strong> are government systems. Connecting to the real ones needs registration and approval, so we built the full flow first against a safe simulator. When approval arrives the same screens switch to the real service, with no redesign.</li>
      <li><strong>Payments</strong> need a licensed gateway and business verification before real money can move. Until then the checkout is a demonstration.</li>
      <li><strong>Cloud documents and Android push</strong> depend on cloud billing and platform set-up that we are completing step by step, shipping each piece switched off until it has been tested.</li>
    </ul>`);

  const schemes = aboutCard('landmark','Government schemes and official links', `
    <p>The Government Schemes screen helps you record your cover, verify details with your Aadhaar where allowed, and prepare claim documents. It covers PM-JAY (Ayushman Bharat), CGHS, ESIC, state schemes (Maharashtra's MJPJAY is linked today) and private insurance.</p>
    <p>Coverage rules change often, so every scheme card shows the date it was last reviewed, and the official site is one tap away. <strong>Always confirm eligibility and amounts on the official portal before relying on them.</strong></p>
    ${typeof officialLinksCardHTML==='function' ? officialLinksCardHTML(['abha','abdm','pmjay','digilocker','mjpjay'],'Official government sites').replace('class="card"','class="about-inner"') : ''}
    <p style="margin-bottom:0;font-size:.82rem;color:var(--text-muted);">ArogyaBot is not part of, endorsed by, or acting for the Government of India, the National Health Authority or any scheme. Names and logos belong to their owners.</p>`);

  const privacy = aboutCard('lock','Privacy and safety principles', `
    <ul class="about-list">
      <li><strong>Your data stays with your account.</strong> Private health data is kept separate for each account, with its own profile for each family member.</li>
      <li><strong>Consent first.</strong> A hospital can only see your shared records after you approve its request with a one-time code. Every access is written to an audit trail.</li>
      <li><strong>Aadhaar is handled carefully.</strong> It is masked on screen, and in the ABHA flow the number is sent for verification but not kept in the app.</li>
      <li><strong>Secrets stay on the server.</strong> Government API keys and staff passcodes live in protected server-side Workers and are never shipped in the app.</li>
      <li><strong>Be realistic.</strong> This is an early build and has not had an independent security audit. Do not store anything you would not be comfortable testing with, until the production hardening listed in the roadmap is complete.</li>
    </ul>`);

  const tech = aboutCard('microchip','How it is built', `
    <div class="about-chips">${aboutChips(['Progressive Web App','Plain JavaScript (no framework)','Android via Capacitor 8','Firebase Auth &amp; Firestore','Firebase Storage','Cloudflare Workers','Durable Objects (live SOS)','WebRTC video','Leaflet + OpenStreetMap','EmailJS one-time codes','GitHub Pages hosting','GitHub Actions APK build','Automated test suite'])}</div>
    <p style="margin-top:12px;">The app is split into small single-purpose files, one folder per role, so each console can change without breaking the others. Four separate Cloudflare Workers keep the risky or secret work off the phone: <em>SOS dispatch</em>, <em>admin</em>, <em>AI</em> and <em>ABDM</em>. A service worker caches the app shell so it opens quickly, but emergency features always need a live connection and are never served from a cache.</p>
    <p style="margin-bottom:0;">Every change is run through an automated test suite (smoke, click-through flows and the government-integration phases) before it is deployed.</p>`);

  const roadmap = aboutCard('road','What is planned next', `
    <p>This is a direction, not a promise. Dates depend on government approvals, so we list order, not deadlines.</p>
    <div class="about-road">
      <div class="about-phase"><div class="about-phase-h">${aboutStatus('info','Next')} Schemes made complete</div>
        <ul class="about-list">
          <li>A <strong>state selector</strong> that shows the schemes available where you live, covering all 28 states and 8 union territories, built from one maintained registry instead of hard-coded text.</li>
          <li><strong>ECHS</strong> (Ex-Servicemen Contributory Health Scheme), a pan-India central scheme, plus CGHS, CAPF and Railways cards with referral tracking.</li>
          <li><strong>Locators</strong> for ECHS polyclinics, Jan Aushadhi kendras, Ayushman Arogya Mandirs and blood banks, plus a one-tap Tele-MANAS (14416) mental-health helpline card.</li>
        </ul></div>
      <div class="about-phase"><div class="about-phase-h">${aboutStatus('test','Soon')} Everyday care, done better</div>
        <ul class="about-list">
          <li>A <strong>daily health diary</strong> on a calendar: log blood sugar, blood pressure, weight and your own custom measurements, with trends and out-of-range flags, and share with your doctor only if you choose.</li>
          <li>Vaccination and mother-and-child tracking with due-date reminders, linked to national programmes.</li>
          <li>A <strong>My Consent</strong> screen to approve, deny and revoke who can see your records.</li>
          <li>AI that reads a photographed lab report or prescription and turns it into trackable numbers, always for you to review before saving.</li>
          <li>Family profiles with caregiver access, an emergency health card (QR on the lock screen) and wearable data from Android.</li>
          <li><strong>Hindi and Marathi</strong> first, then more languages, plus voice input and a large-text mode.</li>
        </ul></div>
      <div class="about-phase"><div class="about-phase-h">${aboutStatus('plan','When approvals arrive')} Connected to national systems</div>
        <ul class="about-list">
          <li>Real <strong>ABHA</strong> creation and linking, and real <strong>DigiLocker</strong> document fetch, replacing today's test mode.</li>
          <li>Records exchange with hospitals through ABDM: prescriptions and reports as standard digital records that follow you between facilities.</li>
          <li>PM-JAY balance and claims view, and discovery of consultations through the Unified Health Interface.</li>
          <li>Doctors and hospitals registered in the national professional and facility registries.</li>
        </ul></div>
      <div class="about-phase"><div class="about-phase-h">${aboutStatus('plan','Before public launch')} Production readiness</div>
        <ul class="about-list">
          <li>Real payments through a licensed gateway.</li>
          <li>Android push notifications.</li>
          <li>Independent security review, privacy-law (DPDP) compliance work, load testing and a monitored launch with a pilot hospital.</li>
          <li>Retiring old temporary structures only after everything above is tested and approved.</li>
        </ul></div>
    </div>`);

  const notices = aboutCard('scale-balanced','Important notices', `
    <ul class="about-list">
      <li><strong>Not medical advice.</strong> The symptom checker, calculators and screening tools are for information and awareness. They do not diagnose or treat. A qualified doctor must make medical decisions.</li>
      <li><strong>Not a certified medical device</strong> and not an official government application.</li>
      <li><strong>Scheme information can be out of date.</strong> Check the official source before acting on it.</li>
      <li><strong>Test data.</strong> Anything labelled test mode or simulated is for demonstration only.</li>
    </ul>`);

  const credits = aboutCard('heart','Built with, and thanks to', `
    <p style="margin-bottom:0;">Leaflet and OpenStreetMap contributors for maps, Firebase and Cloudflare for infrastructure, Capacitor for the Android app, EmailJS for sign-in codes, Font Awesome for icons, and the Plus Jakarta Sans, Space Grotesk and JetBrains Mono typefaces. And to the India Stack and Ayushman Bharat teams whose open standards make an app like this possible.</p>`);

  const facts = aboutCard('id-card','App details', aboutRows(meta));

  return hero + emergencyNotice + what + companion + why + emergencyFlow + roles + status + schemes + privacy + tech + roadmap + notices + credits + facts;
}

/* ---------- in-app view (all roles) ---------- */
function viewAbout(){
  return `${viewHeader('About','About ArogyaBot','What it is, why it exists, what works today, and where it is going.')}
  <div class="about-wrap">${aboutContentHTML()}</div>`;
}

/* ---------- pre-login screen (reachable from the landing page) ---------- */
function openAboutFromLanding(){
  const body = document.getElementById('about-screen-body');
  if(body) body.innerHTML = aboutContentHTML();
  document.getElementById('screen-landing').classList.add('hidden');
  document.getElementById('screen-about').classList.remove('hidden');
  window.scrollTo(0,0);
}
function closeAboutToLanding(){
  document.getElementById('screen-about').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
}
