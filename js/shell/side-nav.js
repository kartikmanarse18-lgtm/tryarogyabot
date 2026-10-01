/* ============================================================
   SIDE NAV PER ROLE
   ============================================================ */
const SIDENAV = {
  patient: [
    {id:'p-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'p-sos', label:'Emergency SOS', icon:'fa-triangle-exclamation'},
    {id:'p-chat', label:'AI Symptom Checker', icon:'fa-comment-medical'},
    {id:'p-history', label:'Symptom History', icon:'fa-clock-rotate-left'},
    {id:'p-fitness', label:'Fitness Tools', icon:'fa-heart-pulse'},
    {id:'p-nutrition', label:'Nutrition', icon:'fa-apple-whole'},
    {id:'p-vitals', label:'Vitals &amp; Risk Screening', icon:'fa-heart-circle-check'},
    {id:'p-records', label:'Medical Records', icon:'fa-file-medical'},
    {id:'p-tele', label:'Telemedicine', icon:'fa-video'},
    {id:'p-rx', label:'e-Prescriptions', icon:'fa-prescription'},
    {id:'p-pharmacy', label:'Pharmacy &amp; Reminders', icon:'fa-pills'},
    {id:'p-meds', label:'Medication &amp; Dosage', icon:'fa-tablets'},
    {id:'p-lifestyle', label:'Lifestyle Tools', icon:'fa-person-walking'},
    {id:'p-women', label:"Women's Health", icon:'fa-venus'},
    {id:'p-insurance', label:'Govt. Schemes &amp; Insurance', icon:'fa-file-shield'},
    {id:'p-documents', label:'My Documents', icon:'fa-folder-open'},
  ],
  responder: [
    {id:'r-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'r-queue', label:'Dispatch Queue', icon:'fa-list-check'},
    {id:'r-active', label:'Active Case', icon:'fa-route'},
  ],
  police: [
    {id:'po-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'po-feed', label:'Dispatch Feed', icon:'fa-satellite-dish'},
  ],
  hospital: [
    {id:'h-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'h-incoming', label:'Incoming Patients', icon:'fa-bed-pulse'},
    {id:'h-roster', label:'Doctor Roster', icon:'fa-user-doctor'},
    {id:'h-doctor-login', label:'Doctor Login', icon:'fa-right-to-bracket'},
    {id:'h-verify', label:'Aadhaar &amp; Scheme Verify', icon:'fa-id-card'},
    {id:'h-audit', label:'Audit Trail', icon:'fa-clipboard-list'},
  ],
  pharmacy: [
    {id:'ph-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'ph-orders', label:'Incoming Prescriptions', icon:'fa-file-prescription'},
    {id:'ph-inventory', label:'Medicine Inventory', icon:'fa-boxes-stacked'},
    {id:'ph-billing', label:'Billing &amp; Sales', icon:'fa-receipt'},
    {id:'ph-delivery-roster', label:'Delivery Boys', icon:'fa-motorcycle'},
    {id:'ph-delivery-login', label:'Delivery Login', icon:'fa-right-to-bracket'},
  ],
  doctor: [
    {id:'d-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'d-appts', label:'My Appointments', icon:'fa-calendar-check'},
    {id:'d-slots', label:'My Availability', icon:'fa-clock'},
    {id:'d-profile', label:'My Profile', icon:'fa-id-badge'},
  ],
  delivery: [
    {id:'dl-dash', label:'Dashboard', icon:'fa-gauge-high'},
    {id:'dl-orders', label:'My Deliveries', icon:'fa-motorcycle'},
    {id:'dl-profile', label:'My Profile', icon:'fa-id-badge'},
  ]
};
// Nav items that hand off to a totally separate login screen instead of
// rendering a normal view — mirrors 'h-doctor-login' for the pharmacy's
// delivery boys.
const SIDENAV_HANDOFFS = {
  'h-doctor-login': 'openDoctorLoginFromHospital()',
  'ph-delivery-login': 'openDeliveryLoginFromPharmacy()'
};
function buildSideNav(role){
  const nav = document.getElementById('app-sidenav');
  let items = SIDENAV[role];
  if(role==='patient'){
    // Women's Health is a dedicated section, not a general-purpose tab — only
    // surfaced once the active profile is actually switched to a female
    // member, rather than showing by default for everyone who isn't Male.
    const gender = (db('profile')||{}).gender;
    if(gender!=='Female') items = items.filter(item=>item.id!=='p-women');
  }
  nav.innerHTML = items.map(item=>`<button class="nav-link" data-nav="${item.id}" onclick="${SIDENAV_HANDOFFS[item.id] || `renderCurrentView('${item.id}')`}"><i class="fa-solid ${item.icon}"></i>${item.label}</button>`).join('');
  updateSidenavScrollHint();
}
// Mobile's sidenav scrolls horizontally (see the max-width:900px rule), which
// isn't obvious at a glance — this shows a fading "there's more" chevron on
// the right edge whenever the nav actually overflows, and hides it again
// once the user has scrolled all the way to the end (or if it never
// overflowed in the first place, e.g. a short list or a wide screen).
function updateSidenavScrollHint(){
  const nav = document.getElementById('app-sidenav');
  const hint = document.getElementById('sidenav-scroll-hint');
  if(!nav || !hint) return;
  const overflowing = nav.scrollWidth > nav.clientWidth + 4;
  const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4;
  hint.classList.toggle('hidden', !overflowing || atEnd);
}
(function initSidenavScrollHintListeners(){
  document.addEventListener('DOMContentLoaded', ()=>{
    const nav = document.getElementById('app-sidenav');
    if(!nav) return;
    nav.addEventListener('scroll', updateSidenavScrollHint, {passive:true});
    window.addEventListener('resize', updateSidenavScrollHint);
  });
})();
function setActiveNav(navId){
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active', b.dataset.nav===navId));
  updateSidenavScrollHint();
}
