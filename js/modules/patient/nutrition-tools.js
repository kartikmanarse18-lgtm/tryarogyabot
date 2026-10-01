/* ============================================================
   PATIENT — NUTRITION TOOLS
   Food lookup table, daily macro calculator, water intake
   calculator and meal calorie estimator. All values are per
   100g unless noted; state persists per patient like Fitness.
   ============================================================ */
const FOOD_DB = [
  // Dals & legumes
  {name:'Toor Dal (cooked)', cat:'Dal & Legumes', kcal:120, protein:6.9, carbs:20.1, fat:0.4, fiber:5.0},
  {name:'Moong Dal (cooked)', cat:'Dal & Legumes', kcal:105, protein:7.5, carbs:19.0, fat:0.4, fiber:4.5},
  {name:'Chana Dal (cooked)', cat:'Dal & Legumes', kcal:164, protein:8.9, carbs:27.4, fat:2.6, fiber:6.0},
  {name:'Masoor Dal (cooked)', cat:'Dal & Legumes', kcal:116, protein:9.0, carbs:20.1, fat:0.4, fiber:4.0},
  {name:'Urad Dal (cooked)', cat:'Dal & Legumes', kcal:147, protein:9.4, carbs:25.2, fat:0.6, fiber:5.5},
  {name:'Rajma / Kidney Beans (cooked)', cat:'Dal & Legumes', kcal:127, protein:8.7, carbs:22.8, fat:0.5, fiber:6.4},
  {name:'Chickpeas / Chole (cooked)', cat:'Dal & Legumes', kcal:164, protein:8.9, carbs:27.4, fat:2.6, fiber:7.6},
  {name:'Soybean (cooked)', cat:'Dal & Legumes', kcal:173, protein:16.6, carbs:9.9, fat:9.0, fiber:6.0},
  // Rice & grains
  {name:'White Rice (cooked)', cat:'Rice & Grains', kcal:130, protein:2.7, carbs:28.2, fat:0.3, fiber:0.4},
  {name:'Brown Rice (cooked)', cat:'Rice & Grains', kcal:123, protein:2.7, carbs:25.6, fat:1.0, fiber:1.8},
  {name:'Poha (flattened rice, cooked)', cat:'Rice & Grains', kcal:130, protein:2.5, carbs:27.0, fat:1.5, fiber:0.9},
  {name:'Idli', cat:'Rice & Grains', kcal:150, protein:4.0, carbs:30.0, fat:1.0, fiber:1.0},
  {name:'Dosa (plain)', cat:'Rice & Grains', kcal:168, protein:3.9, carbs:28.0, fat:4.5, fiber:1.2},
  {name:'Oats (cooked)', cat:'Rice & Grains', kcal:71, protein:2.5, carbs:12.0, fat:1.5, fiber:1.7},
  // Roti / bread
  {name:'Roti / Chapati (whole wheat)', cat:'Roti & Bread', kcal:297, protein:11.0, carbs:59.0, fat:3.7, fiber:11.0},
  {name:'Naan', cat:'Roti & Bread', kcal:310, protein:9.0, carbs:50.0, fat:8.0, fiber:2.0},
  {name:'Paratha (plain)', cat:'Roti & Bread', kcal:330, protein:6.5, carbs:45.0, fat:14.0, fiber:3.0},
  {name:'White Bread', cat:'Roti & Bread', kcal:265, protein:9.0, carbs:49.0, fat:3.2, fiber:2.7},
  // Vegetables
  {name:'Potato (boiled)', cat:'Vegetables', kcal:87, protein:1.9, carbs:20.1, fat:0.1, fiber:1.8},
  {name:'Spinach / Palak (cooked)', cat:'Vegetables', kcal:23, protein:2.9, carbs:3.6, fat:0.4, fiber:2.2},
  {name:'Cauliflower (cooked)', cat:'Vegetables', kcal:25, protein:1.9, carbs:4.9, fat:0.3, fiber:2.3},
  {name:'Okra / Bhindi (cooked)', cat:'Vegetables', kcal:33, protein:1.9, carbs:7.5, fat:0.2, fiber:3.2},
  {name:'Tomato', cat:'Vegetables', kcal:18, protein:0.9, carbs:3.9, fat:0.2, fiber:1.2},
  {name:'Onion', cat:'Vegetables', kcal:40, protein:1.1, carbs:9.3, fat:0.1, fiber:1.7},
  {name:'Carrot', cat:'Vegetables', kcal:41, protein:0.9, carbs:9.6, fat:0.2, fiber:2.8},
  {name:'Green Peas (cooked)', cat:'Vegetables', kcal:84, protein:5.4, carbs:14.5, fat:0.4, fiber:5.5},
  {name:'Broccoli (cooked)', cat:'Vegetables', kcal:35, protein:2.4, carbs:7.2, fat:0.4, fiber:3.3},
  // Fruits
  {name:'Banana', cat:'Fruits', kcal:89, protein:1.1, carbs:22.8, fat:0.3, fiber:2.6},
  {name:'Apple', cat:'Fruits', kcal:52, protein:0.3, carbs:13.8, fat:0.2, fiber:2.4},
  {name:'Mango', cat:'Fruits', kcal:60, protein:0.8, carbs:15.0, fat:0.4, fiber:1.6},
  {name:'Orange', cat:'Fruits', kcal:47, protein:0.9, carbs:11.8, fat:0.1, fiber:2.4},
  {name:'Papaya', cat:'Fruits', kcal:43, protein:0.5, carbs:10.8, fat:0.3, fiber:1.7},
  {name:'Guava', cat:'Fruits', kcal:68, protein:2.6, carbs:14.3, fat:1.0, fiber:5.4},
  {name:'Grapes', cat:'Fruits', kcal:69, protein:0.7, carbs:18.1, fat:0.2, fiber:0.9},
  // Dairy
  {name:'Milk (whole)', cat:'Dairy', kcal:61, protein:3.2, carbs:4.8, fat:3.3, fiber:0},
  {name:'Curd / Dahi (plain)', cat:'Dairy', kcal:60, protein:3.5, carbs:4.7, fat:3.3, fiber:0},
  {name:'Paneer', cat:'Dairy', kcal:265, protein:18.3, carbs:1.2, fat:20.8, fiber:0},
  {name:'Cheese (cheddar)', cat:'Dairy', kcal:402, protein:25.0, carbs:1.3, fat:33.0, fiber:0},
  {name:'Ghee', cat:'Dairy', kcal:900, protein:0, carbs:0, fat:100, fiber:0},
  // Eggs
  {name:'Egg (whole, boiled)', cat:'Eggs', kcal:155, protein:13.0, carbs:1.1, fat:11.0, fiber:0},
  {name:'Egg White (boiled)', cat:'Eggs', kcal:52, protein:11.0, carbs:0.7, fat:0.2, fiber:0},
  // Meat & fish
  {name:'Chicken Breast (cooked)', cat:'Meat & Fish', kcal:165, protein:31.0, carbs:0, fat:3.6, fiber:0},
  {name:'Mutton (cooked)', cat:'Meat & Fish', kcal:250, protein:25.0, carbs:0, fat:16.0, fiber:0},
  {name:'Fish / Rohu (cooked)', cat:'Meat & Fish', kcal:97, protein:19.0, carbs:0, fat:2.0, fiber:0},
  {name:'Prawns (cooked)', cat:'Meat & Fish', kcal:99, protein:24.0, carbs:0.2, fat:0.3, fiber:0},
  // Nuts & seeds
  {name:'Almonds', cat:'Nuts & Seeds', kcal:579, protein:21.2, carbs:21.6, fat:49.9, fiber:12.5},
  {name:'Peanuts (roasted)', cat:'Nuts & Seeds', kcal:567, protein:25.8, carbs:16.1, fat:49.2, fiber:8.5},
  {name:'Cashews', cat:'Nuts & Seeds', kcal:553, protein:18.2, carbs:30.2, fat:43.9, fiber:3.3},
  {name:'Walnuts', cat:'Nuts & Seeds', kcal:654, protein:15.2, carbs:13.7, fat:65.2, fiber:6.7},
];
const NUT_CATS = ['All', ...Array.from(new Set(FOOD_DB.map(f=>f.cat)))];
function nutRoot(){ const n = db('nutrition'); if(n){ if(!n.entries) n.entries={}; return n; } const fresh={entries:{}}; dbSet('nutrition', fresh); return fresh; }
function nutEntry(){
  const n = nutRoot();
  const pid = currentPatientId();
  if(!n.entries[pid]){
    const fit = (db('fitness')||{}).entries||{};
    const w = (fit[pid]||{}).weight || 65;
    n.entries[pid] = {weight:w, goal:'maintain', proteinBasis:'moderate', waterActivity:'moderate', search:'', cat:'All', meal:[]};
  }
  return n.entries[pid];
}
function nutSave(patch){ const n = nutRoot(); const pid = currentPatientId(); Object.assign(n.entries[pid], patch); dbSet('nutrition', n); }

function viewPatientNutrition(){
  const e = nutEntry();
  return `
  ${viewHeader('Patient Console','Nutrition Tools','Look up common foods, plan daily macros, check your water needs and build up a meal to see its totals — all calculated instantly as you go. For general wellness guidance only, not a clinical diet plan.')}

  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-chart-pie" style="color:var(--brand-primary);"></i> Daily Macro Calculator</h3>
      <div class="fit-row">
        <label>Weight (kg)</label>
        <input type="range" id="nut-weight-r" min="30" max="180" value="${e.weight}" oninput="fitSyncPair('nut-weight-r','nut-weight-n',this.value);nutOnMacroChange();">
        <input type="number" class="fit-num" id="nut-weight-n" min="30" max="180" value="${e.weight}" oninput="fitSyncPair('nut-weight-r','nut-weight-n',this.value);nutOnMacroChange();">
      </div>
      <div class="fit-row">
        <label>Goal</label>
        <select class="fit-num" id="nut-goal" onchange="nutOnMacroChange();" style="flex:1;">
          <option value="lose" ${e.goal==='lose'?'selected':''}>Lose weight</option>
          <option value="maintain" ${e.goal==='maintain'?'selected':''}>Maintain weight</option>
          <option value="gain" ${e.goal==='gain'?'selected':''}>Gain muscle</option>
        </select>
      </div>
      <div id="nut-macro-result"></div>
      ${calcInfo('What are "macros"?', `<b>Macros</b> is short for <b>macronutrients</b> — the three big food groups your body needs in large amounts: <b>protein</b> (builds and repairs muscle), <b>carbs</b> (main energy source) and <b>fat</b> (hormones, cell health, energy). This tool splits your daily calorie target into grams of each based on your weight and goal, which is more actionable than a calorie number alone.`)}
    </div>
    <div class="card">
      <h3 style="margin-top:0;"><i class="fa-solid fa-droplet" style="color:var(--brand-secondary);"></i> Water Intake Calculator</h3>
      <div class="fit-row">
        <label>Activity level</label>
        <select class="fit-num" id="nut-water-activity" onchange="nutOnWaterChange();" style="flex:1;">
          <option value="sedentary" ${e.waterActivity==='sedentary'?'selected':''}>Sedentary (little/no exercise)</option>
          <option value="moderate" ${e.waterActivity==='moderate'?'selected':''}>Moderate (some daily activity)</option>
          <option value="active" ${e.waterActivity==='active'?'selected':''}>Active (intense/outdoor work)</option>
        </select>
      </div>
      <p style="color:var(--text-muted);font-size:.78rem;margin:-4px 0 8px;">Uses the weight entered in the macro calculator above.</p>
      <div id="nut-water-result"></div>
      ${calcInfo('Why track water intake?', `This gives a rough daily fluid target based on your body weight and how active you are. Staying adequately hydrated supports digestion, joint health, concentration and body temperature control — needs go up with heat, exercise, and illness (e.g. fever, vomiting or diarrhoea), so treat this as a starting point, not a fixed rule.`)}
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-table-list" style="color:var(--brand-primary);"></i> Food Nutrition Lookup <span style="font-weight:500;color:var(--text-muted);font-size:.78rem;">(per 100g)</span></h3>
    <input type="text" class="nut-search" id="nut-search-input" placeholder="Search a food, e.g. paneer, roti, banana..." value="${e.search||''}" oninput="nutOnSearch(this.value)">
    <div class="nut-cat-row" id="nut-cat-chips">
      ${NUT_CATS.map(c=>`<button class="chip-opt ${e.cat===c?'active':''}" data-cat="${c}" onclick="nutPickCat('${c}')">${c}</button>`).join('')}
    </div>
    <div style="overflow-x:auto;"><table class="data-table" id="nut-food-table"><thead><tr><th>Food</th><th>Kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th></th></tr></thead><tbody id="nut-food-tbody"></tbody></table></div>
    ${calcInfo('How to read this table', `Every food is listed <b>per 100g</b> so different foods can be compared fairly, whatever portion you actually eat. <b>Kcal</b> (kilocalories) is the energy the food provides; <b>protein</b>, <b>carbs</b> and <b>fat</b> are the macronutrients in grams; <b>fiber</b> is the plant matter that aids digestion and fullness. Tap "+ Add" to send a food into the Meal Calorie Estimator below.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-bowl-food" style="color:var(--brand-accent);"></i> Meal Calorie Estimator</h3>
    <p style="color:var(--text-muted);font-size:.82rem;margin-top:-8px;">Add foods from the lookup table above, then adjust the grams for each — totals update live.</p>
    <div id="nut-meal-list"></div>
    <div id="nut-meal-totals"></div>
    ${calcInfo('What this does', `Builds up a full meal or plate from the foods you add, scaling each food's per-100g values to the actual grams you enter, then totalling the kcal and macros for the whole meal — handy for checking a meal against your daily macro or calorie target above.`)}
  </div>
  <p style="color:var(--text-muted);font-size:.78rem;text-align:center;margin-top:-10px;">Nutrition values are typical estimates and can vary by brand, cut and preparation. Not a substitute for advice from a dietitian.</p>
  `;
}

function nutPickCat(c){ nutSave({cat:c}); document.querySelectorAll('#nut-cat-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.cat===c)); renderNutritionTable(); }
function nutOnSearch(v){ nutSave({search:v}); renderNutritionTable(); }
function nutFilteredFoods(){
  const e = nutEntry();
  const q = (e.search||'').trim().toLowerCase();
  return FOOD_DB.filter(f => (e.cat==='All' || f.cat===e.cat) && (!q || f.name.toLowerCase().includes(q)));
}
function renderNutritionTable(){
  const tbody = document.getElementById('nut-food-tbody'); if(!tbody) return;
  const list = nutFilteredFoods();
  const meal = nutEntry().meal;
  tbody.innerHTML = list.length ? list.map(f=>{
    const inMeal = meal.some(m=>m.name===f.name);
    return `<tr><td><strong>${f.name}</strong><div style="color:var(--text-muted);font-size:.72rem;">${f.cat}</div></td><td>${f.kcal}</td><td>${f.protein}g</td><td>${f.carbs}g</td><td>${f.fat}g</td><td>${f.fiber}g</td><td><button class="nut-add-btn" ${inMeal?'disabled':''} onclick="nutAddMealFood('${f.name.replace(/'/g,"\\'")}')">${inMeal?'Added':'+ Add'}</button></td></tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">No foods match your search.</td></tr>`;
}

function nutAddMealFood(name){
  const e = nutEntry();
  if(e.meal.some(m=>m.name===name)) return;
  const meal = e.meal.concat([{name, grams:100}]);
  nutSave({meal});
  renderNutritionTable();
  renderMealBuilder();
}
function nutRemoveMealFood(idx){
  const e = nutEntry();
  const meal = e.meal.slice(); meal.splice(idx,1);
  nutSave({meal});
  renderNutritionTable();
  renderMealBuilder();
}
function nutUpdateMealQty(idx, grams){
  const e = nutEntry();
  const meal = e.meal.slice();
  const g = Math.max(0, parseFloat(grams)||0);
  meal[idx] = Object.assign({}, meal[idx], {grams: g});
  nutSave({meal});
  // The totals below already recalculated live via renderMealTotals() — the bug was
  // that THIS row's own "X kcal" label next to the input only ever got set inside
  // renderMealBuilder(), which nothing called after a gram edit, so it stayed stale
  // until something else (add/remove a food, reload) forced a full rebuild. Fixed by
  // updating just this row's label in place instead of full renderMealBuilder(),
  // which would also wipe the <input> the user is actively typing in.
  const list = document.getElementById('nut-meal-list');
  const row = list ? list.children[idx] : null;
  if(row){
    const f = FOOD_DB.find(x=>x.name===meal[idx].name);
    const kcal = f ? Math.round(f.kcal*g/100) : 0;
    const kcalEl = row.querySelector('.nut-meal-kcal');
    if(kcalEl) kcalEl.textContent = kcal + ' kcal';
  }
  renderMealTotals();
}
function renderMealBuilder(){
  const list = document.getElementById('nut-meal-list'); if(!list) return;
  const meal = nutEntry().meal;
  list.innerHTML = meal.length ? meal.map((m,i)=>{
    const f = FOOD_DB.find(x=>x.name===m.name);
    const kcal = f ? Math.round(f.kcal*m.grams/100) : 0;
    return `<div class="nut-meal-row">
      <div class="nut-meal-name">${m.name}<span>${f?f.cat:''}</span></div>
      <input type="number" class="nut-meal-qty" min="0" step="10" value="${m.grams}" oninput="nutUpdateMealQty(${i}, this.value)"> g
      <div class="nut-meal-kcal">${kcal} kcal</div>
      <button class="nut-meal-remove" onclick="nutRemoveMealFood(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }).join('') : `<p style="color:var(--text-muted);font-size:.85rem;">No foods added yet — use the "+ Add" button in the lookup table above.</p>`;
  renderMealTotals();
}
function renderMealTotals(){
  const el = document.getElementById('nut-meal-totals'); if(!el) return;
  const meal = nutEntry().meal;
  if(!meal.length){ el.innerHTML=''; return; }
  const totals = meal.reduce((acc,m)=>{
    const f = FOOD_DB.find(x=>x.name===m.name);
    if(f){ const mult=m.grams/100; acc.kcal+=f.kcal*mult; acc.protein+=f.protein*mult; acc.carbs+=f.carbs*mult; acc.fat+=f.fat*mult; acc.fiber+=f.fiber*mult; }
    return acc;
  }, {kcal:0,protein:0,carbs:0,fat:0,fiber:0});
  el.innerHTML = `
    <div class="fit-result" style="margin-top:8px;">
      <div><div class="fit-result-num" style="color:var(--brand-accent);">${Math.round(totals.kcal)}</div><div class="fit-result-sub">Total calories</div></div>
    </div>
    <div class="fit-mini-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="fit-mini-stat"><div class="fit-mini-num">${totals.protein.toFixed(1)}g</div><div class="fit-mini-label">Protein</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num">${totals.carbs.toFixed(1)}g</div><div class="fit-mini-label">Carbs</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num">${totals.fat.toFixed(1)}g</div><div class="fit-mini-label">Fat</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num">${totals.fiber.toFixed(1)}g</div><div class="fit-mini-label">Fiber</div></div>
    </div>
  `;
}

function nutOnMacroChange(){
  const weight = fitNum('nut-weight-n');
  const goal = document.getElementById('nut-goal').value;
  nutSave({weight, goal});
  renderMacroCalc();
  renderWaterCalc();
}
function renderMacroCalc(){
  const el = document.getElementById('nut-macro-result'); if(!el) return;
  const weight = fitNum('nut-weight-n');
  const goal = document.getElementById('nut-goal').value;
  // Rough calorie target: 24 kcal/kg maintenance baseline, adjusted by goal.
  const kcalPerKg = {lose:22, maintain:26, gain:30}[goal] || 26;
  const calories = weight * kcalPerKg;
  // Macro split (% of calories) by goal
  const split = {
    lose:    {protein:0.35, carbs:0.35, fat:0.30},
    maintain:{protein:0.25, carbs:0.45, fat:0.30},
    gain:    {protein:0.30, carbs:0.45, fat:0.25},
  }[goal];
  const proteinG = (calories*split.protein)/4;
  const carbsG = (calories*split.carbs)/4;
  const fatG = (calories*split.fat)/9;
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:var(--brand-accent);">${Math.round(calories)}</div><div class="fit-result-sub">Target kcal/day</div></div>
    </div>
    <div class="gauge-track">
      <div class="gauge-seg" style="width:${(split.protein*100).toFixed(1)}%;background:#0d9488;"></div>
      <div class="gauge-seg" style="width:${(split.carbs*100).toFixed(1)}%;background:#f59e0b;"></div>
      <div class="gauge-seg" style="width:${(split.fat*100).toFixed(1)}%;background:#3b82f6;"></div>
    </div>
    <div class="fit-mini-grid">
      <div class="fit-mini-stat"><div class="fit-mini-num" style="color:#0d9488;">${Math.round(proteinG)}g</div><div class="fit-mini-label">Protein</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num" style="color:#f59e0b;">${Math.round(carbsG)}g</div><div class="fit-mini-label">Carbs</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num" style="color:#3b82f6;">${Math.round(fatG)}g</div><div class="fit-mini-label">Fat</div></div>
    </div>
  `;
}
function nutOnWaterChange(){
  nutSave({waterActivity: document.getElementById('nut-water-activity').value});
  renderWaterCalc();
}
function renderWaterCalc(){
  const el = document.getElementById('nut-water-result'); if(!el) return;
  const weight = fitNum('nut-weight-n');
  const activity = document.getElementById('nut-water-activity').value;
  const bonusMl = {sedentary:0, moderate:350, active:700}[activity] || 0;
  const liters = (weight*33 + bonusMl)/1000;
  const glasses = Math.round(liters*1000/250);
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:var(--brand-secondary);">${liters.toFixed(1)} L</div><div class="fit-result-sub">Recommended per day</div></div>
    </div>
    <div class="fit-mini-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="fit-mini-stat"><div class="fit-mini-num">${glasses}</div><div class="fit-mini-label">~250ml glasses</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num">${Math.round(liters*1000)}ml</div><div class="fit-mini-label">Total volume</div></div>
    </div>
  `;
}
