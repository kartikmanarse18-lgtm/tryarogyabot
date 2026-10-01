/* ============================================================
   PATIENT — LIFESTYLE TOOLS
   Sleep calculator, step-to-calories converter, smoking
   pack-years calculator, and a short, non-diagnostic wellbeing
   self-check (PHQ-2 / GAD-2 style).
   ============================================================ */
function lsRoot(){ const l = db('lifestyleTools'); if(l){ if(!l.entries) l.entries={}; return l; } const fresh={entries:{}}; dbSet('lifestyleTools', fresh); return fresh; }
function lsEntry(){
  const l = lsRoot();
  const pid = currentPatientId();
  if(!l.entries[pid]){
    l.entries[pid] = {
      sleepMode:'age', sleepAgeGroup:'adult', sleepWake:'07:00',
      stepCount:6000, stepWeight:65, stepPace:'moderate',
      packPerDay:10, packYears:15,
      mhAnswers:[null,null,null,null]
    };
  }
  return l.entries[pid];
}
function lsSave(patch){ const l = lsRoot(); const pid = currentPatientId(); Object.assign(l.entries[pid], patch); dbSet('lifestyleTools', l); }

const SLEEP_AGE_TABLE = [
  {id:'newborn', label:'Newborn (0–3 months)', lo:14, hi:17},
  {id:'infant', label:'Infant (4–11 months)', lo:12, hi:15},
  {id:'toddler', label:'Toddler (1–2 years)', lo:11, hi:14},
  {id:'preschool', label:'Preschool (3–5 years)', lo:10, hi:13},
  {id:'school', label:'School age (6–13 years)', lo:9, hi:11},
  {id:'teen', label:'Teen (14–17 years)', lo:8, hi:10},
  {id:'adult', label:'Adult (18–64 years)', lo:7, hi:9},
  {id:'older', label:'Older adult (65+ years)', lo:7, hi:8},
];

function viewPatientLifestyle(){
  const e = lsEntry();
  return `
  ${viewHeader('Patient Console','Lifestyle Tools','Sleep, activity and habit calculators, plus a short wellbeing self-check — all for general guidance, not a medical diagnosis.')}

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-moon" style="color:var(--brand-secondary);"></i> Sleep calculator</h3>
    <div class="nut-cat-row" id="sleep-mode-chips">
      <button class="chip-opt ${e.sleepMode==='age'?'active':''}" data-mode="age" onclick="sleepPickMode('age')">Recommended by age</button>
      <button class="chip-opt ${e.sleepMode==='cycle'?'active':''}" data-mode="cycle" onclick="sleepPickMode('cycle')">Wake-up planner</button>
    </div>
    <div id="sleep-tool-body"></div>
    ${calcInfo('Why sleep cycles matter', `Sleep runs in roughly <b>90-minute cycles</b> that move through light, deep and REM (dream) sleep. Waking up in the middle of a cycle (deep sleep) tends to leave you groggy, while waking up at the <b>end</b> of a cycle usually feels easier — that's why the wake-up planner works backward in 90-minute blocks from your target time, adding ~15 minutes to account for the time it typically takes to fall asleep.`)}
  </div>

  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-shoe-prints" style="color:var(--brand-accent);"></i> Steps → calories burned</h3>
      <div class="fit-row"><label>Steps today</label><input type="range" id="sc-steps-r" min="0" max="30000" step="100" value="${e.stepCount}" oninput="fitSyncPair('sc-steps-r','sc-steps-n',this.value);lsOnStepChange();"><input type="number" class="fit-num" id="sc-steps-n" min="0" max="30000" value="${e.stepCount}" oninput="fitSyncPair('sc-steps-r','sc-steps-n',this.value);lsOnStepChange();"></div>
      <div class="fit-row"><label>Weight (kg)</label><input type="range" id="sc-weight-r" min="30" max="150" value="${e.stepWeight}" oninput="fitSyncPair('sc-weight-r','sc-weight-n',this.value);lsOnStepChange();"><input type="number" class="fit-num" id="sc-weight-n" min="30" max="150" value="${e.stepWeight}" oninput="fitSyncPair('sc-weight-r','sc-weight-n',this.value);lsOnStepChange();"></div>
      <div class="fit-row">
        <label>Pace</label>
        <select class="fit-num" id="sc-pace" onchange="lsOnStepChange();" style="flex:1;">
          <option value="slow" ${e.stepPace==='slow'?'selected':''}>Slow / strolling</option>
          <option value="moderate" ${e.stepPace==='moderate'?'selected':''}>Moderate walk</option>
          <option value="brisk" ${e.stepPace==='brisk'?'selected':''}>Brisk walk</option>
        </select>
      </div>
      <div id="step-calc-result"></div>
      ${calcInfo('How this estimate works', `Calorie burn per step depends mostly on your <b>body weight</b> and <b>pace</b> — heavier or faster walking burns more per step. This uses an average of ~0.04 kcal per step for a 70kg person at a moderate pace, scaled to your own weight and adjusted for pace, plus an average stride length to estimate distance. Actual burn varies with height, fitness level and terrain, so treat this as a ballpark figure.`)}
    </div>
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-smoking" style="color:var(--brand-danger);"></i> Smoking pack-years</h3>
      <div class="fit-row"><label>Cigarettes/day</label><input type="range" id="py-perday-r" min="0" max="60" value="${e.packPerDay}" oninput="fitSyncPair('py-perday-r','py-perday-n',this.value);lsOnPackChange();"><input type="number" class="fit-num" id="py-perday-n" min="0" max="60" value="${e.packPerDay}" oninput="fitSyncPair('py-perday-r','py-perday-n',this.value);lsOnPackChange();"></div>
      <div class="fit-row"><label>Years smoked</label><input type="range" id="py-years-r" min="0" max="60" value="${e.packYears}" oninput="fitSyncPair('py-years-r','py-years-n',this.value);lsOnPackChange();"><input type="number" class="fit-num" id="py-years-n" min="0" max="60" value="${e.packYears}" oninput="fitSyncPair('py-years-r','py-years-n',this.value);lsOnPackChange();"></div>
      <div id="pack-years-result"></div>
      ${calcInfo('What is a "pack-year"?', `A <b>pack-year</b> is a standard way doctors measure lifetime smoking exposure: one pack-year equals smoking <b>20 cigarettes (one pack) a day for one year</b>. It's calculated as (cigarettes per day ÷ 20) × years smoked, so smoking half a pack for 20 years gives the same score as one pack for 10 years. It's widely used to judge risk of smoking-related disease and, at 20+ pack-years, whether lung cancer screening may be worth discussing with a doctor.`)}
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-brain" style="color:var(--brand-secondary);"></i> Wellbeing self-check <span style="font-weight:500;color:var(--text-muted);font-size:.78rem;">(PHQ-2 / GAD-2 style)</span></h3>
    <p style="color:var(--text-muted);font-size:.82rem;margin-top:-6px;">Over the last 2 weeks, how often have you been bothered by the following? This is a short, non-diagnostic screening tool — not a clinical assessment.</p>
    ${MH_QUESTIONS.map((q,i)=>`
      <div class="mh-question">
        <p>${i+1}. ${q}</p>
        <div class="mh-opts">${MH_OPTIONS.map((o,v)=>`<button class="chip-opt ${e.mhAnswers[i]===v?'active':''}" data-q="${i}" data-v="${v}" onclick="mhPick(${i},${v})">${o}</button>`).join('')}</div>
      </div>
    `).join('')}
    <button class="btn" onclick="renderMhResult()"><i class="fa-solid fa-check"></i> See my result</button>
    <div id="mh-result"></div>
    ${calcInfo('What are PHQ-2 and GAD-2?', `<b>PHQ-2</b> and <b>GAD-2</b> are the first two questions of longer, clinically-validated screening questionnaires (PHQ-9 for depression, GAD-7 for anxiety) used by doctors worldwide as a quick first pass. A combined score of 3 or more on either pair suggests it may be worth completing the fuller questionnaire with a professional — it does not, by itself, mean you have depression or anxiety.`)}
  </div>
  `;
}

function sleepPickMode(mode){
  lsSave({sleepMode:mode});
  document.querySelectorAll('#sleep-mode-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  renderSleepTool();
}
function renderSleepTool(){
  const body = document.getElementById('sleep-tool-body'); if(!body) return;
  const e = lsEntry();
  if(e.sleepMode==='age'){
    body.innerHTML = `
      <div class="fit-row">
        <label>Age group</label>
        <select class="fit-num" id="sleep-age" onchange="lsOnSleepAgeChange();" style="flex:1;">
          ${SLEEP_AGE_TABLE.map(g=>`<option value="${g.id}" ${e.sleepAgeGroup===g.id?'selected':''}>${g.label}</option>`).join('')}
        </select>
      </div>
      <div id="sleep-age-result"></div>
    `;
    renderSleepAgeResult();
  } else {
    body.innerHTML = `
      <div class="fit-row"><label>Wake-up time</label><input type="time" class="fit-num" id="sleep-wake" value="${e.sleepWake}" onchange="lsOnSleepCycleChange();" style="flex:0 0 130px;"></div>
      <p style="color:var(--text-muted);font-size:.8rem;margin:0 0 6px;">Suggested bedtimes, counting back in 90-minute sleep cycles plus ~15 minutes to fall asleep:</p>
      <div id="sleep-cycle-result"></div>
    `;
    renderSleepCycleResult();
  }
}
function lsOnSleepAgeChange(){ lsSave({sleepAgeGroup: document.getElementById('sleep-age').value}); renderSleepAgeResult(); }
function renderSleepAgeResult(){
  const el = document.getElementById('sleep-age-result'); if(!el) return;
  const group = SLEEP_AGE_TABLE.find(g=>g.id===document.getElementById('sleep-age').value);
  el.innerHTML = `<div class="fit-result"><div><div class="fit-result-num">${group.lo}–${group.hi}<span style="font-size:1rem;"> hrs</span></div><div class="fit-result-sub">Recommended sleep for this age group</div></div></div>`;
}
function lsOnSleepCycleChange(){ lsSave({sleepWake: document.getElementById('sleep-wake').value}); renderSleepCycleResult(); }
function renderSleepCycleResult(){
  const el = document.getElementById('sleep-cycle-result'); if(!el) return;
  const wake = document.getElementById('sleep-wake').value || '07:00';
  const [h,m] = wake.split(':').map(Number);
  const wakeMinutes = h*60+m;
  const cycles = [6,5,4,3];
  el.innerHTML = `<div class="fit-mini-grid" style="grid-template-columns:repeat(4,1fr);">
    ${cycles.map(n=>{
      let bedMinutes = wakeMinutes - (n*90+15);
      while(bedMinutes<0) bedMinutes += 1440;
      const bh = Math.floor(bedMinutes/60)%24, bm = bedMinutes%60;
      const label = `${bh.toString().padStart(2,'0')}:${bm.toString().padStart(2,'0')}`;
      return `<div class="fit-mini-stat"><div class="fit-mini-num">${label}</div><div class="fit-mini-label">${n} cycles (~${(n*1.5).toFixed(1)}h)</div></div>`;
    }).join('')}
  </div>`;
}

function lsOnStepChange(){
  lsSave({
    stepCount: parseFloat(document.getElementById('sc-steps-n').value)||0,
    stepWeight: parseFloat(document.getElementById('sc-weight-n').value)||0,
    stepPace: document.getElementById('sc-pace').value
  });
  renderStepCalc();
}
function renderStepCalc(){
  const el = document.getElementById('step-calc-result'); if(!el) return;
  const steps = parseFloat(document.getElementById('sc-steps-n').value)||0;
  const weight = parseFloat(document.getElementById('sc-weight-n').value)||0;
  const pace = document.getElementById('sc-pace').value;
  const paceMult = {slow:0.8, moderate:1.0, brisk:1.25}[pace] || 1.0;
  const kcalPerStep = 0.04 * (weight/70) * paceMult;
  const kcal = steps * kcalPerStep;
  const km = (steps * 0.00076).toFixed(2);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:var(--brand-accent);">${Math.round(kcal)}</div><div class="fit-result-sub">Estimated kcal burned</div></div>
      <div><div class="fit-result-num">${km}<span style="font-size:1rem;"> km</span></div><div class="fit-result-sub">Approx. distance</div></div>
    </div>
    <p style="color:var(--text-muted);font-size:.76rem;margin:10px 0 0;">Rough estimate based on average stride length and calorie burn per step — actual burn varies by height, fitness and terrain.</p>
  `;
}

function lsOnPackChange(){
  lsSave({
    packPerDay: parseFloat(document.getElementById('py-perday-n').value)||0,
    packYears: parseFloat(document.getElementById('py-years-n').value)||0
  });
  renderPackYears();
}
function packYearsCategory(py){
  if(py<10) return {label:'Lower exposure', color:'#10b981'};
  if(py<20) return {label:'Moderate exposure', color:'#f59e0b'};
  if(py<40) return {label:'High exposure', color:'#ef4444'};
  return {label:'Very high exposure', color:'#ef4444'};
}
function renderPackYears(){
  const el = document.getElementById('pack-years-result'); if(!el) return;
  const perDay = parseFloat(document.getElementById('py-perday-n').value)||0;
  const years = parseFloat(document.getElementById('py-years-n').value)||0;
  const py = (perDay/20)*years;
  const cat = packYearsCategory(py);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:${cat.color};">${py.toFixed(1)}</div><div class="fit-result-sub">Pack-years</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
    ${py>=20 ? `<p style="color:var(--text-muted);font-size:.8rem;margin:10px 0 0;">A history of 20+ pack-years is often used as a starting point for discussing lung cancer screening eligibility with a doctor.</p>` : ''}
    <p style="color:var(--text-muted);font-size:.76rem;margin:10px 0 0;">Not a diagnosis. Quitting at any point reduces future health risk — ask a doctor or your local Tobacco Cessation Centre for support.</p>
  `;
}

const MH_QUESTIONS = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying'
];
const MH_OPTIONS = ['Not at all','Several days','More than half the days','Nearly every day'];
function mhPick(qIndex, val){
  const e = lsEntry();
  const answers = e.mhAnswers.slice();
  answers[qIndex] = val;
  lsSave({mhAnswers: answers});
  document.querySelectorAll(`.mh-opts button[data-q="${qIndex}"]`).forEach(b=>b.classList.toggle('active', parseInt(b.dataset.v,10)===val));
}
function renderMhResult(){
  const el = document.getElementById('mh-result');
  const e = lsEntry();
  if(e.mhAnswers.some(a=>a===null)){
    el.innerHTML = `<p style="color:var(--brand-danger);font-size:.82rem;font-weight:600;margin-top:10px;">Please answer all 4 questions first.</p>`;
    return;
  }
  const phq2 = e.mhAnswers[0]+e.mhAnswers[1];
  const gad2 = e.mhAnswers[2]+e.mhAnswers[3];
  const depressionFlag = phq2>=3, anxietyFlag = gad2>=3;
  el.innerHTML = `
    <div class="fit-result" style="margin-top:14px;">
      <div><div class="fit-result-num" style="color:${depressionFlag?'#ef4444':'#10b981'};">${phq2}/6</div><div class="fit-result-sub">Low mood screen (PHQ-2)</div></div>
      <div><div class="fit-result-num" style="color:${anxietyFlag?'#ef4444':'#10b981'};">${gad2}/6</div><div class="fit-result-sub">Anxiety screen (GAD-2)</div></div>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:12px 0 0;">
      ${(depressionFlag||anxietyFlag)
        ? "Your answers suggest it could help to talk this through with a doctor, counsellor or therapist for a fuller assessment — this short check can't tell you what's going on, only that it may be worth a conversation."
        : "Your answers don't suggest significant symptoms right now. If that changes, or you're ever concerned, it's always okay to talk to a doctor or counsellor."}
    </p>
    <p style="color:var(--text-muted);font-size:.76rem;margin:10px 0 0;">This is a brief, non-diagnostic self-check, not a clinical diagnosis. If you are having thoughts of harming yourself or are in crisis, please reach out right away — <strong>KIRAN helpline: 1800-599-0019</strong>, <strong>iCall: 9152987821</strong>, or emergency services on <strong>112</strong>.</p>
  `;
}
