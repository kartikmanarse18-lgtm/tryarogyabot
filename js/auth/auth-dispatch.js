/* ============================================================
   AUTH FLOW DISPATCH — patient has its own dedicated flow below;
   responder/police/hospital share the generic role-auth flow
   (see "SHARED ROLE AUTH" section further down).
   ============================================================ */
const SIGNUP_FIELDS = {
  patient: [
    {key:'name', label:'Full name', placeholder:'Your full name'},
    {key:'phone', label:'Phone number', placeholder:'+91 98xxxxxxxx'},
    {key:'blood', label:'Blood group', placeholder:'e.g. O+'},
  ],
  responder: [
    {key:'name', label:'Driver / EMT name', placeholder:'Full name'},
    {key:'ambname', label:'Ambulance service name', placeholder:'e.g. City Rapid Response'},
    {key:'ambno', label:'Ambulance number', placeholder:'e.g. DL-01-AB-1234'},
    {key:'phone', label:'Phone number', placeholder:'+91 98xxxxxxxx'},
  ],
  police: [
    {key:'name', label:'Officer name', placeholder:'Full name'},
    {key:'badge', label:'Badge / ID number', placeholder:'e.g. PS-2291'},
    {key:'station', label:'Police station', placeholder:'e.g. Sector 9 Police Station'},
    {key:'phone', label:'Phone number', placeholder:'+91 98xxxxxxxx'},
  ],
  hospital: [
    {key:'name', label:'Hospital name', placeholder:'e.g. City Care Hospital'},
    {key:'regno', label:'Registration / license number', placeholder:'e.g. DL-HOSP-4471'},
    {key:'contact', label:'Contact person', placeholder:'Admin / front-desk name'},
    {key:'phone', label:'Phone number', placeholder:'+91 98xxxxxxxx'},
    {key:'beds', label:'Total beds', placeholder:'e.g. 120'},
    {key:'icu', label:'ICU beds', placeholder:'e.g. 15'},
    {key:'specialties', label:'Specialties (comma separated)', placeholder:'e.g. Cardiology, Trauma, Pediatrics'},
  ],
  pharmacy: [
    {key:'name', label:'Pharmacy name', placeholder:'e.g. Apollo Pharmacy — MG Road'},
    {key:'license', label:'Drug license number', placeholder:'e.g. KA-B-2024-01234'},
    {key:'phone', label:'Phone number', placeholder:'+91 98xxxxxxxx'},
  ],
};
function roleExtraFields(role){ return (SIGNUP_FIELDS[role]||[]).filter(f=>f.key!=='name' && f.key!=='phone'); }
function otpAdvance(i){ const el=document.getElementById('otp-'+i)||document.getElementById('pa-otp-'+i)||document.getElementById('ra-otp-'+i); if(el && el.value && i<5){ const next=document.getElementById('otp-'+(i+1))||document.getElementById('pa-otp-'+(i+1))||document.getElementById('ra-otp-'+(i+1)); if(next) next.focus(); } }
function stepDotsHtml(n){ return `<div class="step-dots">${[1,2,3].map(i=>`<span class="${i<=n?'done':''}"></span>`).join('')}</div>`; }

function renderAuthCard(){
  const box = document.getElementById('auth-card-box');
  if(!currentRole) return;
  if(currentRole==='patient'){ renderPatientAuthCard(); return; }
  renderRoleAuthCard();
}
