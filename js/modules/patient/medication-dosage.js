/* ============================================================
   PATIENT — MEDICATION & DOSAGE
   Weight-based OTC dosage guidance for common children's
   medicines (paracetamol / ibuprofen), a flat-dose adult OTC
   reference table, adherence-tracked medicine reminders, and the
   safety cross-checks above. Estimates only — always confirm
   the dose with a pharmacist or doctor before giving anything.
   ============================================================ */
function medsRoot(){ const m = db('medsTools'); if(m){ if(!m.entries) m.entries={}; return m; } const fresh={entries:{}}; dbSet('medsTools', fresh); return fresh; }
function medsEntry(){
  const m = medsRoot();
  const pid = currentPatientId();
  if(!m.entries[pid]){
    m.entries[pid] = {childWeight:15, childAgeMonths:36, childMed:'paracetamol', childConc:'120-5'};
  }
  return m.entries[pid];
}
function medsSave(patch){ const m = medsRoot(); const pid = currentPatientId(); Object.assign(m.entries[pid], patch); dbSet('medsTools', m); }

const CHILD_MED_CONFIG = {
  paracetamol: {
    label: 'Paracetamol (Acetaminophen)',
    concentrations: [ {id:'120-5', label:'120mg / 5ml syrup', mgPerMl:24}, {id:'250-5', label:'250mg / 5ml syrup', mgPerMl:50} ],
    lowMgPerKg: 10, highMgPerKg: 15, maxMgPerKgDay: 60,
    frequency: 'Every 4–6 hours, max 4 doses / 24 hrs',
    minAgeMonths: 2,
    ageWarning: "Under 2 months old: don't give without a doctor's instruction."
  },
  ibuprofen: {
    label: 'Ibuprofen',
    concentrations: [ {id:'100-5', label:'100mg / 5ml syrup', mgPerMl:20} ],
    lowMgPerKg: 5, highMgPerKg: 10, maxMgPerKgDay: 30,
    frequency: 'Every 6–8 hours, max 3–4 doses / 24 hrs',
    minAgeMonths: 3,
    ageWarning: "Under 3 months old, or under 5kg: don't give without a doctor's instruction."
  }
};
// Flat-dose reference for common adult OTC medicines — intentionally a static
// reference table, not an interactive "calculator", since adult OTC dosing on
// real product labels is a fixed range rather than weight-scaled like the
// children's syrups above.
const ADULT_MED_REFERENCE = [
  {name:'Paracetamol (500–650mg tablet)', dose:'1 tablet (500–650mg) every 4–6 hours', maxDay:'Max 3,000–4,000mg (6–8 tablets) in 24 hours', notes:'Reduce max dose if you have liver disease or drink alcohol regularly. Check other cold/flu products for hidden paracetamol before adding more.'},
  {name:'Ibuprofen (200–400mg tablet)', dose:'1 tablet (200–400mg) every 6–8 hours, with food', maxDay:'Max 1,200mg (OTC ceiling) in 24 hours', notes:'Avoid if you have a peptic ulcer, kidney disease, or are in the third trimester of pregnancy. Take with food to reduce stomach irritation.'},
  {name:'Cetirizine (10mg tablet)', dose:'1 tablet (10mg) once daily', maxDay:'Max 10mg/24 hours', notes:'Can cause drowsiness in some people — avoid driving until you know how it affects you. Halve the dose if you have reduced kidney function (ask a pharmacist).'},
  {name:'ORS (Oral Rehydration Salts)', dose:'1 sachet dissolved in 1 litre of clean water, sipped through the day', maxDay:'Replace as needed to match fluid lost — no fixed daily ceiling', notes:'Make a fresh solution every 24 hours and discard the rest. Seek care urgently for a baby, an elderly person, or anyone who cannot keep fluids down.'},
  {name:'Antacid (e.g. Omeprazole 20mg OTC pack)', dose:'1 capsule (20mg) once daily before breakfast, for up to 14 days', maxDay:'Max 20mg/24 hours (OTC pack)', notes:'If heartburn continues beyond 14 days, or returns often, see a doctor rather than repeating the course indefinitely.'},
];

function viewPatientMeds(){
  const e = medsEntry();
  const med = CHILD_MED_CONFIG[e.childMed];
  return `
  ${viewHeader('Patient Console','Medication &amp; Dosage','Dosage reference for common over-the-counter medicines, adherence-tracked reminders, and basic safety cross-checks. Estimates only — always confirm with a pharmacist or doctor before taking or giving any medicine.')}

  <div class="card safety-banner">
    <strong><i class="fa-solid fa-triangle-exclamation"></i> Before you take or give any medicine</strong>
    <ul>
      <li>Everything on this page is a general estimate — it's not a prescription and doesn't replace advice from a doctor or pharmacist.</li>
      <li>Always use the measuring syringe/cup that came with a syrup, not a kitchen spoon.</li>
      <li>Check that no other medicine already contains the same ingredient (many cold &amp; fever products already contain paracetamol) — combining can cause an overdose.</li>
      <li>If you're pregnant, have a chronic condition, are very young/elderly, or are at all unsure, speak to a doctor or pharmacist first.</li>
      <li>If you suspect an overdose or an allergic reaction (rash, swelling, difficulty breathing), get emergency help immediately or call 112.</li>
    </ul>
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-child" style="color:var(--brand-primary);"></i> Child dosage calculator</h3>
    <div class="fit-row">
      <label>Medicine</label>
      <select class="fit-num" id="cd-med" onchange="medsOnDetailChange();" style="flex:1;">
        ${Object.keys(CHILD_MED_CONFIG).map(k=>`<option value="${k}" ${e.childMed===k?'selected':''}>${CHILD_MED_CONFIG[k].label}</option>`).join('')}
      </select>
    </div>
    <div class="fit-row">
      <label>Formulation</label>
      <select class="fit-num" id="cd-conc" onchange="medsOnDetailChange();" style="flex:1;">
        ${med.concentrations.map(c=>`<option value="${c.id}" ${e.childConc===c.id?'selected':''}>${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="fit-row">
      <label>Weight (kg)</label>
      <input type="range" id="cd-weight-r" min="3" max="40" step="0.5" value="${e.childWeight}" oninput="fitSyncPair('cd-weight-r','cd-weight-n',this.value);medsOnDetailChange();">
      <input type="number" class="fit-num" id="cd-weight-n" min="3" max="40" step="0.5" value="${e.childWeight}" oninput="fitSyncPair('cd-weight-r','cd-weight-n',this.value);medsOnDetailChange();">
    </div>
    <div class="fit-row">
      <label>Age (months)</label>
      <input type="range" id="cd-age-r" min="0" max="144" value="${e.childAgeMonths}" oninput="fitSyncPair('cd-age-r','cd-age-n',this.value);medsOnDetailChange();">
      <input type="number" class="fit-num" id="cd-age-n" min="0" max="144" value="${e.childAgeMonths}" oninput="fitSyncPair('cd-age-r','cd-age-n',this.value);medsOnDetailChange();">
    </div>
    <div id="child-dose-result"></div>
    ${calcInfo('How this dosage estimate works', `Doses for children are calculated per <b>kilogram of body weight</b> rather than a flat adult dose, since a child's ability to process medicine scales with their size. This tool applies standard mg/kg ranges for the medicine and formulation you pick, then converts that into a millilitre volume for the syrup strength selected. Always double-check against the product's own leaflet, since brands can vary.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-user" style="color:var(--brand-primary);"></i> Adult OTC dosage reference</h3>
    <div class="card-flush" style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Medicine</th><th>Typical adult dose</th><th>Daily maximum</th><th>Notes</th></tr></thead>
        <tbody>
          ${ADULT_MED_REFERENCE.map(m=>`<tr><td><strong>${m.name}</strong></td><td>${m.dose}</td><td>${m.maxDay}</td><td style="color:var(--text-muted);font-size:.82rem;">${m.notes}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p style="color:var(--text-muted);font-size:.76rem;margin:10px 0 0;">Fixed OTC reference ranges for a typical healthy adult — not adjusted for weight, kidney/liver function, pregnancy, or other medicines you're on. Prescription-only medicines (antibiotics, controlled substances, etc.) aren't listed here on purpose — those doses must come from your prescribing doctor.</p>
  </div>

  ${remindersCardHTML()}
  `;
}
function medsOnDetailChange(){
  medsSave({
    childMed: document.getElementById('cd-med').value,
    childConc: document.getElementById('cd-conc').value,
    childWeight: parseFloat(document.getElementById('cd-weight-n').value)||0,
    childAgeMonths: parseFloat(document.getElementById('cd-age-n').value)||0
  });
  // Formulation options depend on the chosen medicine — rebuild that dropdown if the medicine changed.
  const med = CHILD_MED_CONFIG[document.getElementById('cd-med').value];
  const concSel = document.getElementById('cd-conc');
  const validIds = med.concentrations.map(c=>c.id);
  if(!validIds.includes(concSel.value)){
    concSel.innerHTML = med.concentrations.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');
    medsSave({childConc: med.concentrations[0].id});
  }
  renderChildDose();
}
function renderChildDose(){
  const el = document.getElementById('child-dose-result'); if(!el) return;
  const medKey = document.getElementById('cd-med').value;
  const med = CHILD_MED_CONFIG[medKey];
  const concId = document.getElementById('cd-conc').value;
  const conc = med.concentrations.find(c=>c.id===concId) || med.concentrations[0];
  const weight = parseFloat(document.getElementById('cd-weight-n').value)||0;
  const ageMonths = parseFloat(document.getElementById('cd-age-n').value)||0;

  if(weight < 3){
    el.innerHTML = `<div class="fit-result" style="background:rgba(239,68,68,.1);"><p style="margin:0;color:var(--brand-danger);font-weight:600;">Too low a weight for this calculator — please consult a doctor for dosing.</p></div>`;
    return;
  }
  const lowMg = weight*med.lowMgPerKg, highMg = weight*med.highMgPerKg;
  const lowMl = lowMg/conc.mgPerMl, highMl = highMg/conc.mgPerMl;
  const maxDailyMg = weight*med.maxMgPerKgDay;
  const ageIssue = ageMonths < med.minAgeMonths;

  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num">${lowMl.toFixed(1)}–${highMl.toFixed(1)} <span style="font-size:1rem;">ml</span></div><div class="fit-result-sub">${lowMg.toFixed(0)}–${highMg.toFixed(0)} mg per dose</div></div>
      <span class="fit-badge" style="background:var(--brand-primary)22;color:var(--brand-primary);">${med.frequency}</span>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">Don't exceed roughly <strong>${maxDailyMg.toFixed(0)} mg</strong> of ${med.label.split(' (')[0]} in 24 hours at this weight.</p>
    ${ageIssue ? `<p style="color:var(--brand-danger);font-size:.82rem;font-weight:700;margin:10px 0 0;"><i class="fa-solid fa-triangle-exclamation"></i> ${med.ageWarning}</p>` : ''}
    <p style="color:var(--text-muted);font-size:.76rem;margin:10px 0 0;">General estimate based on standard weight-based dosing ranges. Product labels vary — always check the leaflet and confirm with a pharmacist or doctor, especially for infants.</p>
  `;
}
