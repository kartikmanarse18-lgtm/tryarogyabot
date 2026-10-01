/* ============================================================
   PATIENT — FITNESS TOOLS (BMI, BMR/TDEE, Ideal Weight, Body Fat %, WHR)
   All calculators are interactive: sliders/inputs recompute live via
   oninput, no submit button, and values persist per patient.
   ============================================================ */
function fitRoot(){ const f = db('fitness'); if(f) { if(!f.entries) f.entries={}; return f; } const fresh={entries:{}}; dbSet('fitness', fresh); return fresh; }
function fitEntry(){
  const f = fitRoot();
  const pid = currentPatientId();
  if(!f.entries[pid]){
    const profGender = (db('profile')||{}).gender;
    f.entries[pid] = {height:170, weight:65, age:30, gender: profGender==='Female' ? 'Female' : 'Male', activity:'moderate', neck:'', waist:'', hip:'', whrWaist:'', whrHip:''};
  }
  return f.entries[pid];
}
function fitSave(patch){ const f = fitRoot(); const pid = currentPatientId(); Object.assign(f.entries[pid], patch); dbSet('fitness', f); }
function fitNum(id){ const el=document.getElementById(id); const v=parseFloat(el.value); return isNaN(v)?0:v; }
function fitSyncPair(rangeId, numId, val){
  const r=document.getElementById(rangeId), n=document.getElementById(numId);
  if(r) r.value=val; if(n) n.value=val;
}
// clamp helper for gauge marker positioning (percentage across a min..max domain)
function fitPct(val, min, max){ return Math.max(0, Math.min(100, ((val-min)/(max-min))*100)); }

function viewPatientFitness(){
  const e = fitEntry();
  return `
  ${viewHeader('Patient Console','Fitness &amp; Body Metrics Tools','Interactive calculators using your height, weight, age and activity level — everything updates live as you adjust the sliders. For guidance only, not a medical diagnosis.')}

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-sliders" style="color:var(--brand-primary);"></i> Your details</h3>
    <p style="color:var(--text-muted);font-size:.82rem;margin-top:-8px;">Shared by the BMI, BMR/TDEE and Ideal Weight calculators below.</p>
    <div class="fit-row">
      <label>Height (cm)</label>
      <input type="range" id="fit-height-r" min="120" max="210" value="${e.height}" oninput="fitSyncPair('fit-height-r','fit-height-n',this.value);fitOnDetailChange();">
      <input type="number" class="fit-num" id="fit-height-n" min="120" max="210" value="${e.height}" oninput="fitSyncPair('fit-height-r','fit-height-n',this.value);fitOnDetailChange();">
    </div>
    <div class="fit-row">
      <label>Weight (kg)</label>
      <input type="range" id="fit-weight-r" min="30" max="180" value="${e.weight}" oninput="fitSyncPair('fit-weight-r','fit-weight-n',this.value);fitOnDetailChange();">
      <input type="number" class="fit-num" id="fit-weight-n" min="30" max="180" value="${e.weight}" oninput="fitSyncPair('fit-weight-r','fit-weight-n',this.value);fitOnDetailChange();">
    </div>
    <div class="fit-row">
      <label>Age (years)</label>
      <input type="range" id="fit-age-r" min="10" max="90" value="${e.age}" oninput="fitSyncPair('fit-age-r','fit-age-n',this.value);fitOnDetailChange();">
      <input type="number" class="fit-num" id="fit-age-n" min="10" max="90" value="${e.age}" oninput="fitSyncPair('fit-age-r','fit-age-n',this.value);fitOnDetailChange();">
    </div>
    <div class="fit-row">
      <label>Gender</label>
      <select class="fit-num" id="fit-gender" onchange="fitOnDetailChange();">
        <option value="Male" ${e.gender==='Male'?'selected':''}>Male</option>
        <option value="Female" ${e.gender==='Female'?'selected':''}>Female</option>
      </select>
      <label style="flex:0 0 130px;">Activity level</label>
      <select class="fit-num" id="fit-activity" onchange="fitOnDetailChange();">
        <option value="sedentary" ${e.activity==='sedentary'?'selected':''}>Sedentary (little/no exercise)</option>
        <option value="light" ${e.activity==='light'?'selected':''}>Light (1-3 days/week)</option>
        <option value="moderate" ${e.activity==='moderate'?'selected':''}>Moderate (3-5 days/week)</option>
        <option value="active" ${e.activity==='active'?'selected':''}>Active (6-7 days/week)</option>
        <option value="very_active" ${e.activity==='very_active'?'selected':''}>Very active (hard daily training)</option>
      </select>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-weight-scale" style="color:var(--brand-primary);"></i> BMI Calculator</h3>
      <div id="bmi-result"></div>
      ${calcInfo('What is BMI?', `<b>BMI</b> stands for <b>Body Mass Index</b> — a simple number worked out from your height and weight (weight ÷ height²). It doesn't measure body fat directly, but it's the quickest way to check whether your weight falls in a range that's typically considered healthy for your height. Doctors use it as a first-glance screening tool — not a diagnosis — to flag when someone may be underweight, overweight, or at higher risk of conditions like diabetes and heart disease, and to decide if closer tests are needed.`)}
    </div>
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-ruler-vertical" style="color:var(--brand-primary);"></i> Ideal Body Weight</h3>
      <div id="ibw-result"></div>
      ${calcInfo('What is Ideal Body Weight (IBW)?', `<b>IBW</b> estimates a healthy target weight for your height using a formula doctors have long used to plan things like medicine dosages and nutrition goals. It's a general reference range, not a strict target — healthy weight also depends on muscle mass, frame size, age and overall health, so use it as a guide rather than a rule.`)}
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-fire" style="color:var(--brand-accent);"></i> BMR, TDEE &amp; Daily Calorie Targets</h3>
    <div id="bmr-result"></div>
    ${calcInfo('What are BMR and TDEE?', `<b>BMR (Basal Metabolic Rate)</b> is the number of calories your body burns just to stay alive at complete rest — breathing, circulation, cell repair — before you move at all. <b>TDEE (Total Daily Energy Expenditure)</b> adds your daily activity on top of that, giving the total calories you burn in a normal day. Knowing your TDEE tells you roughly how many calories to eat to <b>maintain</b>, <b>lose</b>, or <b>gain</b> weight — it's the starting point most diet and fitness plans are built from.`)}
  </div>

  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-percent" style="color:var(--brand-secondary);"></i> Body Fat % (U.S. Navy method)</h3>
      <div class="fit-row"><label>Neck (cm)</label><input type="range" class="bf-input" id="bf-neck-r" min="20" max="60" value="${e.neck||36}" oninput="fitSyncPair('bf-neck-r','bf-neck-n',this.value);fitOnBodyFatChange();"><input type="number" class="fit-num" id="bf-neck-n" min="20" max="60" value="${e.neck||36}" oninput="fitSyncPair('bf-neck-r','bf-neck-n',this.value);fitOnBodyFatChange();"></div>
      <div class="fit-row"><label>Waist (cm)</label><input type="range" class="bf-input" id="bf-waist-r" min="50" max="160" value="${e.waist||80}" oninput="fitSyncPair('bf-waist-r','bf-waist-n',this.value);fitOnBodyFatChange();"><input type="number" class="fit-num" id="bf-waist-n" min="50" max="160" value="${e.waist||80}" oninput="fitSyncPair('bf-waist-r','bf-waist-n',this.value);fitOnBodyFatChange();"></div>
      <div class="fit-row" id="bf-hip-row" style="${e.gender==='Female'?'':'display:none;'}"><label>Hip (cm)</label><input type="range" class="bf-input" id="bf-hip-r" min="60" max="180" value="${e.hip||95}" oninput="fitSyncPair('bf-hip-r','bf-hip-n',this.value);fitOnBodyFatChange();"><input type="number" class="fit-num" id="bf-hip-n" min="60" max="180" value="${e.hip||95}" oninput="fitSyncPair('bf-hip-r','bf-hip-n',this.value);fitOnBodyFatChange();"></div>
      <div id="bodyfat-result"></div>
      ${calcInfo('What is Body Fat %?', `This estimates what portion of your total body weight is fat, using the <b>U.S. Navy method</b> (neck, waist and, for women, hip measurements). Two people with the same BMI can have very different amounts of muscle vs fat, so body fat % gives a more direct picture of body composition — useful for tracking fitness progress, not just weight change.`)}
    </div>
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-arrows-left-right" style="color:var(--brand-secondary);"></i> Waist-to-Hip Ratio</h3>
      <div class="fit-row"><label>Waist (cm)</label><input type="range" id="whr-waist-r" min="50" max="160" value="${e.whrWaist||80}" oninput="fitSyncPair('whr-waist-r','whr-waist-n',this.value);fitOnWHRChange();"><input type="number" class="fit-num" id="whr-waist-n" min="50" max="160" value="${e.whrWaist||80}" oninput="fitSyncPair('whr-waist-r','whr-waist-n',this.value);fitOnWHRChange();"></div>
      <div class="fit-row"><label>Hip (cm)</label><input type="range" id="whr-hip-r" min="60" max="180" value="${e.whrHip||95}" oninput="fitSyncPair('whr-hip-r','whr-hip-n',this.value);fitOnWHRChange();"><input type="number" class="fit-num" id="whr-hip-n" min="60" max="180" value="${e.whrHip||95}" oninput="fitSyncPair('whr-hip-r','whr-hip-n',this.value);fitOnWHRChange();"></div>
      <div id="whr-result"></div>
      ${calcInfo('What is Waist-to-Hip Ratio (WHR)?', `<b>WHR</b> compares your waist size to your hip size (waist ÷ hip). It shows how your body stores fat — fat carried around the belly ("apple shape") is linked to higher risk of heart disease and diabetes than fat carried around the hips ("pear shape"), even at the same weight. It's a quick way to check fat distribution, not just total fat.`)}
    </div>
  </div>
  <p style="color:var(--text-muted);font-size:.78rem;text-align:center;margin-top:-10px;">These tools give general wellness estimates only and don't replace a doctor's assessment.</p>
  `;
}

function fitOnDetailChange(){
  const height=fitNum('fit-height-n'), weight=fitNum('fit-weight-n'), age=fitNum('fit-age-n');
  const gender=document.getElementById('fit-gender').value, activity=document.getElementById('fit-activity').value;
  fitSave({height, weight, age, gender, activity});
  const hipRow=document.getElementById('bf-hip-row'); if(hipRow) hipRow.style.display = gender==='Female' ? '' : 'none';
  renderBMI(); renderIBW(); renderBMR(); renderBodyFat(); renderWHR();
}
function fitOnBodyFatChange(){
  fitSave({neck:fitNum('bf-neck-n'), waist:fitNum('bf-waist-n'), hip:fitNum('bf-hip-n')});
  renderBodyFat();
}
function fitOnWHRChange(){
  fitSave({whrWaist:fitNum('whr-waist-n'), whrHip:fitNum('whr-hip-n')});
  renderWHR();
}

function bmiCategory(bmi){
  if(bmi<18.5) return {label:'Underweight', color:'#3b82f6'};
  if(bmi<25) return {label:'Normal', color:'#10b981'};
  if(bmi<30) return {label:'Overweight', color:'#f59e0b'};
  return {label:'Obese', color:'#ef4444'};
}
function renderBMI(){
  const el=document.getElementById('bmi-result'); if(!el) return;
  const heightCm=fitNum('fit-height-n'), weightKg=fitNum('fit-weight-n');
  const h=heightCm/100;
  const bmi = h>0 ? weightKg/(h*h) : 0;
  const cat = bmiCategory(bmi);
  const pct = fitPct(bmi, 12, 42);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:${cat.color};">${bmi.toFixed(1)}</div><div class="fit-result-sub">Body Mass Index</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
    <div class="gauge-track">
      <div class="gauge-seg" style="width:21.6%;background:#3b82f6;"></div>
      <div class="gauge-seg" style="width:21.6%;background:#10b981;"></div>
      <div class="gauge-seg" style="width:16.6%;background:#f59e0b;"></div>
      <div class="gauge-seg" style="width:40.2%;background:#ef4444;"></div>
      <div class="gauge-marker" style="left:${pct}%;"></div>
    </div>
    <div class="gauge-labels"><span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span></div>
  `;
}
function renderIBW(){
  const el=document.getElementById('ibw-result'); if(!el) return;
  const heightCm=fitNum('fit-height-n'), gender=document.getElementById('fit-gender').value;
  const inchesOver5ft = Math.max(0, (heightCm - 152.4)/2.54);
  const base = gender==='Female' ? 45.5 : 50;
  const ibw = base + 2.3*inchesOver5ft;
  const lo=(ibw*0.9).toFixed(1), hi=(ibw*1.1).toFixed(1);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num">${ibw.toFixed(1)} <span style="font-size:1rem;">kg</span></div><div class="fit-result-sub">Devine formula estimate</div></div>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">A healthy range for your height is roughly <strong>${lo}–${hi} kg</strong>.</p>
  `;
}
function renderBMR(){
  const el=document.getElementById('bmr-result'); if(!el) return;
  const height=fitNum('fit-height-n'), weight=fitNum('fit-weight-n'), age=fitNum('fit-age-n');
  const gender=document.getElementById('fit-gender').value, activity=document.getElementById('fit-activity').value;
  const bmr = gender==='Female' ? (10*weight + 6.25*height - 5*age - 161) : (10*weight + 6.25*height - 5*age + 5);
  const mult = {sedentary:1.2, light:1.375, moderate:1.55, active:1.725, very_active:1.9}[activity] || 1.2;
  const tdee = bmr*mult;
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num">${Math.round(bmr)}</div><div class="fit-result-sub">BMR (kcal/day at rest)</div></div>
      <div><div class="fit-result-num" style="color:var(--brand-accent);">${Math.round(tdee)}</div><div class="fit-result-sub">TDEE (kcal/day, maintenance)</div></div>
    </div>
    <div class="fit-mini-grid">
      <div class="fit-mini-stat"><div class="fit-mini-num" style="color:#ef4444;">${Math.round(tdee-500)}</div><div class="fit-mini-label">Lose ~0.5kg/wk</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num" style="color:#10b981;">${Math.round(tdee)}</div><div class="fit-mini-label">Maintain weight</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num" style="color:#3b82f6;">${Math.round(tdee+500)}</div><div class="fit-mini-label">Gain ~0.5kg/wk</div></div>
    </div>
  `;
}
function bodyFatCategory(bf, gender){
  const ranges = gender==='Female'
    ? [{max:13,label:'Essential fat',color:'#3b82f6'},{max:20,label:'Athletic',color:'#10b981'},{max:24,label:'Fitness',color:'#10b981'},{max:31,label:'Average',color:'#f59e0b'},{max:999,label:'Obese range',color:'#ef4444'}]
    : [{max:5,label:'Essential fat',color:'#3b82f6'},{max:13,label:'Athletic',color:'#10b981'},{max:17,label:'Fitness',color:'#10b981'},{max:24,label:'Average',color:'#f59e0b'},{max:999,label:'Obese range',color:'#ef4444'}];
  return ranges.find(r=>bf<=r.max) || ranges[ranges.length-1];
}
function renderBodyFat(){
  const el=document.getElementById('bodyfat-result'); if(!el) return;
  const height=fitNum('fit-height-n'), gender=document.getElementById('fit-gender').value;
  const neck=fitNum('bf-neck-n'), waist=fitNum('bf-waist-n'), hip=fitNum('bf-hip-n');
  let bf;
  if(gender==='Female'){
    const denom = 1.29579 - 0.35004*Math.log10(Math.max(1,waist+hip-neck)) + 0.22100*Math.log10(Math.max(1,height));
    bf = 495/denom - 450;
  } else {
    const denom = 1.0324 - 0.19077*Math.log10(Math.max(1,waist-neck)) + 0.15456*Math.log10(Math.max(1,height));
    bf = 495/denom - 450;
  }
  bf = Math.max(2, Math.min(60, bf));
  const cat = bodyFatCategory(bf, gender);
  el.innerHTML = `
    <div class="fit-result" style="margin-top:14px;">
      <div><div class="fit-result-num" style="color:${cat.color};">${bf.toFixed(1)}%</div><div class="fit-result-sub">Estimated body fat</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
  `;
}
function whrCategory(whr, gender){
  if(gender==='Female'){
    if(whr<0.80) return {label:'Low risk', color:'#10b981'};
    if(whr<0.85) return {label:'Moderate risk', color:'#f59e0b'};
    return {label:'High risk', color:'#ef4444'};
  }
  if(whr<0.90) return {label:'Low risk', color:'#10b981'};
  if(whr<1.0) return {label:'Moderate risk', color:'#f59e0b'};
  return {label:'High risk', color:'#ef4444'};
}
function renderWHR(){
  const el=document.getElementById('whr-result'); if(!el) return;
  const gender=document.getElementById('fit-gender').value;
  const waist=fitNum('whr-waist-n'), hip=fitNum('whr-hip-n');
  const whr = hip>0 ? waist/hip : 0;
  const cat = whrCategory(whr, gender);
  el.innerHTML = `
    <div class="fit-result" style="margin-top:14px;">
      <div><div class="fit-result-num" style="color:${cat.color};">${whr.toFixed(2)}</div><div class="fit-result-sub">Waist-to-hip ratio</div></div>
      <span class="fit-badge" style="background:${cat.color}22;color:${cat.color};">${cat.label}</span>
    </div>
  `;
}
