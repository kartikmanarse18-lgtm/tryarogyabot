/* ============================================================
   PATIENT — VITALS & RISK SCREENING
   Blood pressure category, blood sugar range, heart-rate zones,
   a simple ADA-style diabetes risk questionnaire and a simplified
   cardiovascular risk indicator. Educational screening only — not
   a diagnosis. State persists per patient like Fitness/Nutrition.
   ============================================================ */
function vitRoot(){ const v = db('vitals'); if(v){ if(!v.entries) v.entries={}; return v; } const fresh={entries:{}}; dbSet('vitals', fresh); return fresh; }
function vitEntry(){
  const v = vitRoot();
  const pid = currentPatientId();
  if(!v.entries[pid]){
    const fit = (db('fitness')||{}).entries||{};
    const age = (fit[pid]||{}).age || 30;
    v.entries[pid] = {
      sys:120, dia:80,
      sugarType:'fasting', sugarVal:90,
      hrAge:age, hrResting:70,
      diaAge:'lt40', diaSex:'Female', diaFam:'no', diaBP:'no', diaActive:'yes', diaWeight:'normal',
      cvAge:'lt45', cvSys:'lt120', cvChol:'normal', cvSmoke:'no', cvDiab:'no'
    };
  }
  return v.entries[pid];
}
function vitSave(patch){ const v = vitRoot(); const pid = currentPatientId(); Object.assign(v.entries[pid], patch); dbSet('vitals', v); }

function viewPatientVitals(){
  const e = vitEntry();
  return `
  ${viewHeader('Patient Console','Vitals &amp; Risk Screening','Quick, educational checks for blood pressure, blood sugar, heart-rate training zones and simplified risk scores. These are screening tools only — they don\'t diagnose anything and don\'t replace a lab test or a doctor\'s visit.')}

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-heart-circle-bolt" style="color:var(--brand-danger);"></i> Blood Pressure (BP) Category Checker</h3>
    <div class="fit-row"><label>Systolic (top number)</label><input type="range" id="vit-sys-r" min="80" max="220" value="${e.sys}" oninput="fitSyncPair('vit-sys-r','vit-sys-n',this.value);vitOnBPChange();"><input type="number" class="fit-num" id="vit-sys-n" min="80" max="220" value="${e.sys}" oninput="fitSyncPair('vit-sys-r','vit-sys-n',this.value);vitOnBPChange();"></div>
    <div class="fit-row"><label>Diastolic (bottom number)</label><input type="range" id="vit-dia-r" min="40" max="140" value="${e.dia}" oninput="fitSyncPair('vit-dia-r','vit-dia-n',this.value);vitOnBPChange();"><input type="number" class="fit-num" id="vit-dia-n" min="40" max="140" value="${e.dia}" oninput="fitSyncPair('vit-dia-r','vit-dia-n',this.value);vitOnBPChange();"></div>
    <div id="vit-bp-result"></div>
    ${calcInfo('What is "BP" and what do the two numbers mean?', `<b>BP</b> is short for <b>blood pressure</b> — the force of blood pushing against your artery walls, written as two numbers in mmHg. The top number, <b>systolic</b>, is the pressure when your heart beats; the bottom number, <b>diastolic</b>, is the pressure when your heart rests between beats. This checks your reading against standard categories (normal, elevated, hypertension stage 1/2, or a crisis needing urgent care) — high blood pressure usually has no symptoms but raises the risk of heart attack and stroke over time, which is why regular checks matter.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-droplet" style="color:var(--brand-accent);"></i> Blood Sugar Range Checker</h3>
    <div class="fit-row">
      <label>Test type</label>
      <select class="fit-num" id="vit-sugar-type" onchange="vitOnSugarTypeChange(this.value);" style="flex:1;">
        <option value="fasting" ${e.sugarType==='fasting'?'selected':''}>Fasting (mg/dL) — no food/drink for 8+ hrs</option>
        <option value="postprandial" ${e.sugarType==='postprandial'?'selected':''}>Postprandial (mg/dL) — 2 hrs after a meal</option>
        <option value="hba1c" ${e.sugarType==='hba1c'?'selected':''}>HbA1c (%) — 2–3 month average</option>
      </select>
    </div>
    <div class="fit-row"><label id="vit-sugar-label">${e.sugarType==='hba1c'?'Value (%)':'Value (mg/dL)'}</label><input type="range" id="vit-sugar-r" min="${e.sugarType==='hba1c'?3:50}" max="${e.sugarType==='hba1c'?15:400}" step="${e.sugarType==='hba1c'?0.1:1}" value="${e.sugarVal}" oninput="fitSyncPair('vit-sugar-r','vit-sugar-n',this.value);vitOnSugarValueChange();"><input type="number" class="fit-num" id="vit-sugar-n" min="${e.sugarType==='hba1c'?3:50}" max="${e.sugarType==='hba1c'?15:400}" step="${e.sugarType==='hba1c'?0.1:1}" value="${e.sugarVal}" oninput="fitSyncPair('vit-sugar-r','vit-sugar-n',this.value);vitOnSugarValueChange();"></div>
    <div id="vit-sugar-result"></div>
    ${calcInfo('Fasting, postprandial &amp; HbA1c — what\'s the difference?', `<b>Fasting</b> blood sugar is measured after 8+ hours without food. <b>Postprandial</b> means "after a meal" — usually checked 2 hours after eating, showing how your body handles a food load. <b>HbA1c</b> (glycated haemoglobin) is a blood test that reflects your <b>average</b> blood sugar over the past 2–3 months, not a single moment — doctors use it to diagnose and monitor diabetes. Pick the test you actually have results for; each has its own normal/prediabetes/diabetes cut-offs.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-heart-pulse" style="color:var(--brand-primary);"></i> Heart Rate (HR) Zone Calculator</h3>
    <div class="fit-row"><label>Age (years)</label><input type="range" id="vit-hr-age-r" min="10" max="90" value="${e.hrAge}" oninput="fitSyncPair('vit-hr-age-r','vit-hr-age-n',this.value);vitOnHRChange();"><input type="number" class="fit-num" id="vit-hr-age-n" min="10" max="90" value="${e.hrAge}" oninput="fitSyncPair('vit-hr-age-r','vit-hr-age-n',this.value);vitOnHRChange();"></div>
    <div class="fit-row"><label>Resting heart rate (bpm)</label><input type="range" id="vit-hr-rest-r" min="35" max="110" value="${e.hrResting}" oninput="fitSyncPair('vit-hr-rest-r','vit-hr-rest-n',this.value);vitOnHRChange();"><input type="number" class="fit-num" id="vit-hr-rest-n" min="35" max="110" value="${e.hrResting}" oninput="fitSyncPair('vit-hr-rest-r','vit-hr-rest-n',this.value);vitOnHRChange();"></div>
    <div id="vit-hr-result"></div>
    ${calcInfo('What are HR training zones?', `<b>HR</b> is short for <b>heart rate</b> — beats per minute. Your <b>resting heart rate</b> is your pulse when fully relaxed (a lower resting HR generally means better cardiovascular fitness). This tool estimates your <b>maximum heart rate</b> from your age, then uses the Karvonen method (which factors in your resting HR) to calculate <b>training zones</b> — ranges of bpm that correspond to light, moderate and vigorous exercise intensity, useful for pacing cardio workouts.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-clipboard-question" style="color:var(--brand-secondary);"></i> Diabetes Risk Screener</h3>
    <p style="color:var(--text-muted);font-size:.82rem;margin-top:-8px;">A short questionnaire modelled on the American Diabetes Association (ADA) risk test. Answer each question — your score updates live.</p>
    <div class="risk-q-row"><span class="risk-q-label">Age</span><div class="risk-opt-group">${[['lt40','Under 40'],['40to49','40–49'],['50to59','50–59'],['60plus','60+']].map(o=>`<button class="risk-opt-btn ${e.diaAge===o[0]?'active':''}" onclick="vitSetDia('diaAge','${o[0]}')">${o[1]}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Sex</span><div class="risk-opt-group">${['Female','Male'].map(o=>`<button class="risk-opt-btn ${e.diaSex===o?'active':''}" onclick="vitSetDia('diaSex','${o}')">${o}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Parent or sibling with diabetes?</span><div class="risk-opt-group">${['no','yes'].map(o=>`<button class="risk-opt-btn ${e.diaFam===o?'active':''}" onclick="vitSetDia('diaFam','${o}')">${o==='no'?'No':'Yes'}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Ever told you have high blood pressure?</span><div class="risk-opt-group">${['no','yes'].map(o=>`<button class="risk-opt-btn ${e.diaBP===o?'active':''}" onclick="vitSetDia('diaBP','${o}')">${o==='no'?'No':'Yes'}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Physically active most days?</span><div class="risk-opt-group">${['yes','no'].map(o=>`<button class="risk-opt-btn ${e.diaActive===o?'active':''}" onclick="vitSetDia('diaActive','${o}')">${o==='no'?'No':'Yes'}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Weight status</span><div class="risk-opt-group">${[['normal','Normal'],['overweight','Overweight'],['obese','Obese']].map(o=>`<button class="risk-opt-btn ${e.diaWeight===o[0]?'active':''}" onclick="vitSetDia('diaWeight','${o[0]}')">${o[1]}</button>`).join('')}</div></div>
    <div id="vit-dia-result"></div>
    ${calcInfo('How this score works', `Each answer adds points based on known diabetes risk factors (age, family history, blood pressure history, activity level and weight status) — the same factors used in the ADA's own paper-based risk test. It's a rough screener to flag whether you might benefit from an actual fasting blood sugar or HbA1c test, not a diagnosis by itself.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-heart-circle-exclamation" style="color:var(--brand-danger);"></i> Cardiovascular (Heart) Risk Indicator</h3>
    <p style="color:var(--text-muted);font-size:.82rem;margin-top:-8px;">A simplified indicator using age, blood pressure, cholesterol, smoking and diabetes status.</p>
    <div class="risk-q-row"><span class="risk-q-label">Age</span><div class="risk-opt-group">${[['lt45','Under 45'],['45to54','45–54'],['55to64','55–64'],['65plus','65+']].map(o=>`<button class="risk-opt-btn ${e.cvAge===o[0]?'active':''}" onclick="vitSetCV('cvAge','${o[0]}')">${o[1]}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Systolic BP</span><div class="risk-opt-group">${[['lt120','<120'],['120to139','120–139'],['140to159','140–159'],['160plus','160+']].map(o=>`<button class="risk-opt-btn ${e.cvSys===o[0]?'active':''}" onclick="vitSetCV('cvSys','${o[0]}')">${o[1]}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Cholesterol</span><div class="risk-opt-group">${[['normal','Normal / not sure'],['borderline','Borderline high'],['high','High']].map(o=>`<button class="risk-opt-btn ${e.cvChol===o[0]?'active':''}" onclick="vitSetCV('cvChol','${o[0]}')">${o[1]}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Smoker?</span><div class="risk-opt-group">${['no','yes'].map(o=>`<button class="risk-opt-btn ${e.cvSmoke===o?'active':''}" onclick="vitSetCV('cvSmoke','${o}')">${o==='no'?'No':'Yes'}</button>`).join('')}</div></div>
    <div class="risk-q-row"><span class="risk-q-label">Diabetes?</span><div class="risk-opt-group">${['no','yes'].map(o=>`<button class="risk-opt-btn ${e.cvDiab===o?'active':''}" onclick="vitSetCV('cvDiab','${o}')">${o==='no'?'No':'Yes'}</button>`).join('')}</div></div>
    <div id="vit-cv-result"></div>
    ${calcInfo('What "cardiovascular risk" means here', `<b>Cardiovascular</b> refers to your heart and blood vessels. This adds up points for the major, well-known risk factors for heart attack and stroke — age, high blood pressure, high cholesterol, smoking and diabetes — into a simplified low/moderate/high indicator. It is <b>not</b> a validated clinical score like Framingham or ASCVD, which need an actual lipid profile; treat a moderate/high result as a prompt to get proper blood pressure and cholesterol tests done, not as a diagnosis.`)}
  </div>
  <p style="color:var(--text-muted);font-size:.78rem;text-align:center;margin-top:-10px;">These are simplified screening tools for general awareness only and cannot replace lab tests or a doctor's assessment. If you have chest pain, severe shortness of breath, or a BP/sugar reading in the "crisis"/severe range, seek medical care immediately.</p>
  `;
}

function vitOnBPChange(){ vitSave({sys:fitNum('vit-sys-n'), dia:fitNum('vit-dia-n')}); renderBPResult(); }
function bpCategory(sys, dia){
  if(sys>180 || dia>120) return {label:'Hypertensive Crisis', color:'#ef4444', note:'This range needs urgent medical attention — please contact a doctor or emergency services now, especially if you also have chest pain, shortness of breath, vision changes or confusion.'};
  if(sys>=140 || dia>=90) return {label:'Hypertension Stage 2', color:'#ef4444', note:'Consistently high — please see a doctor about treatment options.'};
  if(sys>=130 || dia>=80) return {label:'Hypertension Stage 1', color:'#f59e0b', note:'Above the healthy range — lifestyle changes are usually recommended, and a doctor may suggest monitoring or medication.'};
  if(sys>=120 && dia<80) return {label:'Elevated', color:'#f59e0b', note:'Higher than normal — a good time to focus on diet, activity and salt intake before it progresses.'};
  if(sys<90 || dia<60) return {label:'Low (Hypotension)', color:'#3b82f6', note:'Below the typical range — usually fine if you have no symptoms, but dizziness or fainting should be checked.'};
  return {label:'Normal', color:'#10b981', note:'Within the healthy range for most adults. Keep up regular checks.'};
}
function renderBPResult(){
  const el=document.getElementById('vit-bp-result'); if(!el) return;
  const sys=fitNum('vit-sys-n'), dia=fitNum('vit-dia-n');
  const cat=bpCategory(sys,dia);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:${cat.color};">${sys}/${dia}</div><div class="fit-result-sub">mmHg</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">${cat.note}</p>
  `;
}

function vitOnSugarTypeChange(type){
  // reset to a sensible mid-range default for the newly selected test type, then re-render
  // the whole view so the slider's min/max/step/label switch correctly (mg/dL vs %).
  const defaults = {fasting:90, postprandial:120, hba1c:5.5};
  vitSave({sugarType:type, sugarVal:defaults[type]});
  renderCurrentView('p-vitals');
}
function vitOnSugarValueChange(){
  vitSave({sugarVal:fitNum('vit-sugar-n')});
  renderSugarResult();
}
function sugarCategory(type, val){
  if(type==='fasting'){
    if(val<70) return {label:'Low (Hypoglycemia)', color:'#3b82f6', note:'Below the normal fasting range — if you feel shaky, sweaty or confused, treat it right away (e.g. fast-acting sugar) and tell your doctor.'};
    if(val<100) return {label:'Normal', color:'#10b981', note:'A healthy fasting blood sugar level.'};
    if(val<126) return {label:'Prediabetes', color:'#f59e0b', note:'Above normal — this range suggests prediabetes. Lifestyle changes now can often prevent progression to diabetes.'};
    return {label:'Diabetes range', color:'#ef4444', note:'This is in the diabetes range on a fasting test. Please confirm with a doctor and get a formal diagnosis and care plan.'};
  }
  if(type==='postprandial'){
    if(val<140) return {label:'Normal', color:'#10b981', note:'A healthy blood sugar level 2 hours after eating.'};
    if(val<200) return {label:'Prediabetes', color:'#f59e0b', note:'Above normal after a meal — this range suggests prediabetes. Worth discussing with a doctor.'};
    return {label:'Diabetes range', color:'#ef4444', note:'This is in the diabetes range for a post-meal test. Please get this confirmed by a doctor.'};
  }
  // HbA1c
  if(val<5.7) return {label:'Normal', color:'#10b981', note:'A healthy 2–3 month average blood sugar level.'};
  if(val<6.5) return {label:'Prediabetes', color:'#f59e0b', note:'This average is in the prediabetes range — lifestyle changes can help bring it back down.'};
  return {label:'Diabetes range', color:'#ef4444', note:'This average is in the diabetes range. Please see a doctor to confirm and discuss a management plan.'};
}
function renderSugarResult(){
  const el=document.getElementById('vit-sugar-result'); if(!el) return;
  const type=document.getElementById('vit-sugar-type').value, val=fitNum('vit-sugar-n');
  const cat=sugarCategory(type, val);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:${cat.color};">${val}${type==='hba1c'?'%':' mg/dL'}</div><div class="fit-result-sub">${type==='fasting'?'Fasting':type==='postprandial'?'Postprandial (2hr)':'HbA1c'}</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">${cat.note}</p>
  `;
}

function vitOnHRChange(){ vitSave({hrAge:fitNum('vit-hr-age-n'), hrResting:fitNum('vit-hr-rest-n')}); renderHRResult(); }
function renderHRResult(){
  const el=document.getElementById('vit-hr-result'); if(!el) return;
  const age=fitNum('vit-hr-age-n'), resting=fitNum('vit-hr-rest-n');
  const maxHR = 220-age;
  const reserve = Math.max(1, maxHR-resting);
  const zones = [
    {label:'Warm up', lo:0.5, hi:0.6, color:'#3b82f6'},
    {label:'Fat burn', lo:0.6, hi:0.7, color:'#10b981'},
    {label:'Cardio (aerobic)', lo:0.7, hi:0.8, color:'#f59e0b'},
    {label:'Hard (anaerobic)', lo:0.8, hi:0.9, color:'#f97316'},
    {label:'Max effort', lo:0.9, hi:1.0, color:'#ef4444'},
  ].map(z=>({...z, from:Math.round(reserve*z.lo+resting), to:Math.round(reserve*z.hi+resting)}));
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num">${maxHR}</div><div class="fit-result-sub">Estimated max HR (bpm)</div></div>
    </div>
    <div class="fit-mini-grid" style="grid-template-columns:1fr;gap:8px;margin-top:10px;">
      ${zones.map(z=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:10px;background:${z.color}14;"><span style="font-weight:700;font-size:.82rem;color:${z.color};">${z.label}</span><span style="font-family:var(--ff-mono);font-size:.82rem;">${z.from}–${z.to} bpm</span></div>`).join('')}
    </div>
  `;
}

function vitSetDia(field, val){ vitSave({[field]:val}); renderCurrentView('p-vitals'); }
function diaRiskScore(e){
  let s=0;
  s += {lt40:0,'40to49':1,'50to59':2,'60plus':3}[e.diaAge]||0;
  s += e.diaSex==='Male' ? 1 : 0;
  s += e.diaFam==='yes' ? 1 : 0;
  s += e.diaBP==='yes' ? 1 : 0;
  s += e.diaActive==='no' ? 1 : 0;
  s += {normal:0,overweight:1,obese:3}[e.diaWeight]||0;
  return s;
}
function renderDiaResult(){
  const el=document.getElementById('vit-dia-result'); if(!el) return;
  const e=vitEntry();
  const score=diaRiskScore(e);
  let cat;
  if(score>=6) cat={label:'Higher risk', color:'#ef4444', note:'Your score suggests a higher chance of prediabetes or type 2 diabetes. Please talk to a doctor about getting a fasting blood sugar or HbA1c test.'};
  else if(score>=4) cat={label:'Increased risk', color:'#f59e0b', note:'A few risk factors are present. Consider discussing screening with a doctor and focusing on activity, weight and diet.'};
  else cat={label:'Lower risk', color:'#10b981', note:'Fewer risk factors present, based on this questionnaire. Keep up healthy habits and routine checkups.'};
  el.innerHTML = `
    <div class="fit-result" style="margin-top:14px;">
      <div><div class="fit-result-num" style="color:${cat.color};">${score}</div><div class="fit-result-sub">Risk score</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">${cat.note}</p>
  `;
}

function vitSetCV(field, val){ vitSave({[field]:val}); renderCurrentView('p-vitals'); }
function cvRiskScore(e){
  let s=0;
  s += {lt45:0,'45to54':1,'55to64':2,'65plus':3}[e.cvAge]||0;
  s += {lt120:0,'120to139':1,'140to159':2,'160plus':3}[e.cvSys]||0;
  s += {normal:0,borderline:1,high:2}[e.cvChol]||0;
  s += e.cvSmoke==='yes' ? 2 : 0;
  s += e.cvDiab==='yes' ? 2 : 0;
  return s;
}
function renderCVResult(){
  const el=document.getElementById('vit-cv-result'); if(!el) return;
  const e=vitEntry();
  const score=cvRiskScore(e);
  let cat;
  if(score>=6) cat={label:'Higher risk', color:'#ef4444', note:'Several major risk factors are present. Please get a proper blood pressure and cholesterol (lipid profile) check and speak with a doctor about heart health.'};
  else if(score>=3) cat={label:'Moderate risk', color:'#f59e0b', note:'Some risk factors are present. Worth getting blood pressure and cholesterol checked and addressing smoking status if applicable.'};
  else cat={label:'Lower risk', color:'#10b981', note:'Fewer major risk factors present, based on this simplified check. Keep up regular checkups and a heart-healthy lifestyle.'};
  el.innerHTML = `
    <div class="fit-result" style="margin-top:14px;">
      <div><div class="fit-result-num" style="color:${cat.color};">${score}</div><div class="fit-result-sub">Risk score</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">${cat.note}</p>
  `;
}
function renderVitalsAll(){ renderBPResult(); renderSugarResult(); renderHRResult(); renderDiaResult(); renderCVResult(); }
