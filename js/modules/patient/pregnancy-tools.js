/* ============================================================
   PATIENT — WOMEN'S HEALTH: PREGNANCY TOOLS
   Due date calculator (Naegele's rule) and a weight gain tracker
   using IOM pre-pregnancy-BMI-based guidance. Shown when "Pregnant"
   mode is selected above. Educational estimates only.
   ============================================================ */
function pregRoot(){ const p = db('pregnancy'); if(p){ if(!p.entries) p.entries={}; return p; } const fresh={entries:{}}; dbSet('pregnancy', fresh); return fresh; }
function pregEntry(){
  const p = pregRoot();
  const pid = currentPatientId();
  if(!p.entries[pid]){
    const fit = (db('fitness')||{}).entries||{};
    const f = fit[pid]||{};
    p.entries[pid] = {lmp: isoDay(addDays(new Date(),-42)), preWeight: f.weight||60, height: f.height||160, currentWeight: f.weight||60};
  }
  return p.entries[pid];
}
function pregSave(patch){ const p = pregRoot(); const pid = currentPatientId(); Object.assign(p.entries[pid], patch); dbSet('pregnancy', p); }

function viewPregnancyTools(){
  const e = pregEntry();
  return `
  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-calendar-day" style="color:var(--brand-primary);"></i> Pregnancy Due Date Calculator</h3>
    <div class="form-group"><label>First day of your last menstrual period (LMP)</label><input type="date" class="form-control" id="preg-lmp" value="${e.lmp}" onchange="pregOnLMPChange(this.value)"></div>
    <div id="preg-due-result"></div>
    ${calcInfo('How is the due date worked out?', `This uses <b>Naegele's rule</b>, the standard estimate doctors start with: it adds <b>280 days (40 weeks)</b> to the first day of your last period. It assumes a regular ~28-day cycle, so it's an estimate, not a guarantee — only about 1 in 20 babies actually arrive on the exact predicted date. Your doctor may adjust this after an early ultrasound.`)}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-weight-scale" style="color:var(--brand-secondary);"></i> Pregnancy Weight Gain Tracker</h3>
    <div class="fit-row"><label>Pre-pregnancy weight (kg)</label><input type="range" id="preg-preweight-r" min="35" max="150" value="${e.preWeight}" oninput="fitSyncPair('preg-preweight-r','preg-preweight-n',this.value);pregOnWeightChange();"><input type="number" class="fit-num" id="preg-preweight-n" min="35" max="150" value="${e.preWeight}" oninput="fitSyncPair('preg-preweight-r','preg-preweight-n',this.value);pregOnWeightChange();"></div>
    <div class="fit-row"><label>Height (cm)</label><input type="range" id="preg-height-r" min="130" max="200" value="${e.height}" oninput="fitSyncPair('preg-height-r','preg-height-n',this.value);pregOnWeightChange();"><input type="number" class="fit-num" id="preg-height-n" min="130" max="200" value="${e.height}" oninput="fitSyncPair('preg-height-r','preg-height-n',this.value);pregOnWeightChange();"></div>
    <div class="fit-row"><label>Current weight (kg)</label><input type="range" id="preg-curweight-r" min="35" max="160" value="${e.currentWeight}" oninput="fitSyncPair('preg-curweight-r','preg-curweight-n',this.value);pregOnWeightChange();"><input type="number" class="fit-num" id="preg-curweight-n" min="35" max="160" value="${e.currentWeight}" oninput="fitSyncPair('preg-curweight-r','preg-curweight-n',this.value);pregOnWeightChange();"></div>
    <div id="preg-weight-result"></div>
    ${calcInfo('How this tracker works', `Healthy pregnancy weight gain depends on your <b>pre-pregnancy BMI</b> category — someone who was underweight beforehand is guided to gain more than someone who was in a higher weight category. This uses the widely-used <b>IOM (Institute of Medicine)</b> guidance to show a recommended total-gain range for your category, and compares your logged gain-so-far against the pace expected for how far along you are (from your due date calculator above). Every pregnancy is different — use this as a general guide and follow your doctor's or midwife's advice over this tool.`)}
  </div>
  `;
}
function pregOnLMPChange(v){ pregSave({lmp:v}); renderPregDue(); renderPregWeight(); }
function pregOnWeightChange(){ pregSave({preWeight:fitNum('preg-preweight-n'), height:fitNum('preg-height-n'), currentWeight:fitNum('preg-curweight-n')}); renderPregWeight(); }
function pregGestWeeks(lmp){
  const days = Math.round((new Date() - new Date(lmp+'T00:00:00'))/86400000);
  return Math.max(0, days/7);
}
function renderPregDue(){
  const el=document.getElementById('preg-due-result'); if(!el) return;
  const lmp = document.getElementById('preg-lmp').value;
  const lmpDate = new Date(lmp+'T00:00:00');
  const due = addDays(lmpDate, 280);
  const weeks = pregGestWeeks(lmp);
  const wholeWeeks = Math.floor(weeks), days = Math.round((weeks-wholeWeeks)*7);
  const trimester = weeks<13 ? '1st trimester' : weeks<27 ? '2nd trimester' : weeks<=42 ? '3rd trimester' : 'Past due date';
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num" style="color:var(--brand-primary);font-size:1.4rem;">${due.toDateString()}</div><div class="fit-result-sub">Estimated due date</div></div>
    </div>
    <div class="fit-mini-grid" style="grid-template-columns:repeat(2,1fr);margin-top:10px;">
      <div class="fit-mini-stat"><div class="fit-mini-num">${wholeWeeks}w ${days}d</div><div class="fit-mini-label">Gestational age today</div></div>
      <div class="fit-mini-stat"><div class="fit-mini-num" style="font-size:1rem;">${trimester}</div><div class="fit-mini-label">Current stage</div></div>
    </div>
  `;
}
const IOM_GAIN = {
  Underweight: {total:[12.5,18], rate:[0.44,0.58]},
  Normal:      {total:[11.5,16], rate:[0.35,0.50]},
  Overweight:  {total:[7,11.5],  rate:[0.23,0.33]},
  Obese:       {total:[5,9],     rate:[0.17,0.27]},
};
function renderPregWeight(){
  const el=document.getElementById('preg-weight-result'); if(!el) return;
  const e = pregEntry();
  const preWeight=fitNum('preg-preweight-n'), height=fitNum('preg-height-n'), curWeight=fitNum('preg-curweight-n');
  const h=height/100;
  const preBmi = h>0 ? preWeight/(h*h) : 0;
  const bmiCat = bmiCategory(preBmi).label; // Underweight / Normal / Overweight / Obese
  const guide = IOM_GAIN[bmiCat] || IOM_GAIN.Normal;
  const weeks = pregGestWeeks(document.getElementById('preg-lmp') ? document.getElementById('preg-lmp').value : e.lmp);
  const gain = curWeight - preWeight;
  // expected gain range so far: ~0.5-2kg flat in first 13 weeks, then IOM weekly rate applied
  let expLo, expHi;
  if(weeks<=13){ expLo = (0.5/13)*weeks; expHi = (2/13)*weeks; }
  else { expLo = 0.5 + guide.rate[0]*(weeks-13); expHi = 2 + guide.rate[1]*(weeks-13); }
  let status;
  if(gain < expLo-1) status={label:'Below expected pace', color:'#3b82f6', note:'Your logged gain is tracking below the typical pace for someone with your pre-pregnancy BMI. Mention this at your next antenatal visit.'};
  else if(gain > expHi+1) status={label:'Above expected pace', color:'#f59e0b', note:'Your logged gain is tracking above the typical pace for your pre-pregnancy BMI category. Worth discussing with your doctor or midwife.'};
  else status={label:'On typical pace', color:'#10b981', note:'Your logged gain is broadly in line with typical guidance for your pre-pregnancy BMI category at this stage.'};
  el.innerHTML = `
    <div class="fit-result">
      <div><div class="fit-result-num">${preBmi.toFixed(1)}</div><div class="fit-result-sub">Pre-pregnancy BMI (${bmiCat})</div></div>
      <div><div class="fit-result-num" style="color:${status.color};">${gain>=0?'+':''}${gain.toFixed(1)} kg</div><div class="fit-result-sub">Gained so far</div></div>
    </div>
    <span class="fit-badge" style="background:${status.color}22;color:${status.color};">${status.label}</span>
    <p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;">${status.note} Typical <strong>total</strong> gain recommended for your category across the whole pregnancy is <strong>${guide.total[0]}–${guide.total[1]} kg</strong>; at ~${weeks.toFixed(0)} weeks, the expected gain-so-far is roughly <strong>${Math.max(0,expLo).toFixed(1)}–${expHi.toFixed(1)} kg</strong>.</p>
  `;
}
function renderPregnancyTools(){ if(!document.getElementById('preg-due-result')) return; renderPregDue(); renderPregWeight(); }

/* ---------- main view ---------- */
function viewPatientWomen(){
  const c = cycRoot();
  if(c.pinLock && !cycSessionUnlocked){
    return `${viewHeader("Women's Health","Privacy protected","Enter your PIN to continue.")}
    <div class="pin-lock">
      <i class="fa-solid fa-lock" style="font-size:2rem;color:var(--brand-primary);"></i>
      <div class="pin-dots" id="pin-dots">${'0000'.split('').map(()=>'<span></span>').join('')}</div>
      <div class="pin-pad">${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n=>`<button onclick="pinPress('${n}')">${n}</button>`).join('')}</div>
    </div>`;
  }
  const entry = cycEntry();
  const stats = cycStats(entry);
  const pred = cycPredict(entry, stats);
  const today = cycPhaseToday(entry, stats, pred);
  const overdueBanner = (pred && pred.overdueDays>5 && !(entry.days[isoDay(new Date())]&&entry.days[isoDay(new Date())].flow) && entry.mode!=='pregnant')
    ? `<div class="redflag-box" style="margin-bottom:18px;"><b>Your period is ${pred.overdueDays} days later than predicted.</b> A late period can happen for many reasons (stress, travel, illness, birth control changes, or pregnancy). If it's unusual for you, consider a pregnancy test if relevant, and see a doctor if it's been 3+ months or you have other symptoms.</div>` : '';
  const irregularBanner = (stats.regularity==='Irregular' && entry.mode!=='pregnant')
    ? `<div class="redflag-box" style="margin-bottom:18px;"><b>Your recent cycles look quite irregular</b> (lengths ranging ${stats.minLen}–${stats.maxLen} days). This is sometimes normal, but persistent irregularity is worth mentioning to a doctor — it can relate to conditions like PCOS or thyroid changes.</div>` : '';
  const reminderBanner = entry.mode!=='pregnant' ? cycReminderBanner(entry, pred) : '';
  const bbtConfirm = cycBBTConfirmedOvulation(entry);
  const insights = cycSymptomInsights(entry, stats);
  return `${viewHeader("Women's Health","Period &amp; cycle tracker","Log your cycle, see personalised predictions, and browse women's health awareness content.")}
  ${reminderBanner}${overdueBanner}${irregularBanner}

  <div class="card">
    <h3 style="margin-top:0;">What are you focused on right now?</h3>
    <p style="font-size:.82rem;color:var(--text-muted);margin-top:-8px;">This changes what predictions and tips are emphasised below.</p>
    <div class="mode-select">
      ${CYC_MODES.map(m=>`<div class="mode-opt ${entry.mode===m.k?'active':''}" onclick="cycSetMode('${m.k}')"><i class="${m.icon}"></i>${m.l}</div>`).join('')}
    </div>
  </div>
  ${entry.mode==='pregnant' ? `<div class="card" style="text-align:center;padding:26px;"><i class="fa-solid fa-baby" style="font-size:1.8rem;color:var(--brand-primary);"></i><p style="margin-top:10px;color:var(--text-muted);">You've marked yourself as pregnant, so cycle/ovulation predictions are paused. You can still log symptoms and notes below, or switch modes above once that changes.</p></div>
  ${viewPregnancyTools()}` : `
  <div class="card phase-hero">
    <div class="phase-ring" style="--pct:${today.pct}"><b>${today.cycleDay ?? '—'}</b><small>${today.cycleDay ? 'cycle day' : ''}</small></div>
    <div style="flex:1;min-width:220px;">
      <span class="phase-tag">${today.phase}</span>
      <div style="font-size:.9rem;color:var(--text-muted);line-height:1.7;">
        ${pred ? `${today.daysToNext>0 ? `<strong>${today.daysToNext} day${today.daysToNext===1?'':'s'}</strong> until your next period is predicted to start.` : today.daysToNext===0 ? `Your next period is predicted to start <strong>today</strong>.` : `Your predicted period start has passed — log it below when it begins so predictions stay accurate.`}<br>Predicted next period: <strong>${pred.nextStart.toDateString()}</strong> &nbsp;·&nbsp; Fertile window (est.): <strong>${pred.fertileStart.toDateString()} – ${pred.fertileEnd.toDateString()}</strong>${entry.mode==='ttc' ? `<br><span style="color:var(--brand-primary);font-weight:700;">Trying to conceive: your best-estimated fertile days are highlighted above — logging BBT and LH tests will sharpen this.</span>` : entry.mode==='avoid' ? `<br><span style="color:var(--brand-danger);font-weight:700;">Avoiding pregnancy: treat the fertile window as an estimate only, not a contraceptive method.</span>` : ''}` : `Log at least one period to unlock personalised predictions.`}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-sm" onclick="openDayLogModal('${isoDay(new Date())}')"><i class="fa-solid fa-plus"></i> Log today</button>
      <button class="btn btn-secondary btn-sm" onclick="cycOpenBulkModal()"><i class="fa-solid fa-clock-rotate-left"></i> Add past period</button>
    </div>
  </div>
  `}

  <div class="card">
    <div class="cal-nav">
      <button onclick="cycNavMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="cal-month-label" id="cal-month-label"></div>
      <button onclick="cycNavMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div id="cycle-cal"></div>
    <div class="cyc-legend">
      <span><i style="background:#ef4444;"></i> Period logged</span>
      <span><i style="background:repeating-linear-gradient(135deg,rgba(239,68,68,.6) 0 2px,transparent 2px 4px);"></i> Spotting</span>
      <span><i style="background:rgba(239,68,68,.25);"></i> Predicted period</span>
      <span><i style="background:rgba(245,158,11,.3);"></i> Fertile window</span>
      <span><i style="background:rgba(139,92,246,.35);"></i> Ovulation (est.)</span>
      <span><i style="background:rgba(245,158,11,.16);"></i> PMS window</span>
    </div>
    <p style="font-size:.78rem;color:var(--text-muted);margin-top:10px;">Tap any day to log flow, symptoms, mood or notes for that date.</p>
  </div>

  ${bbtConfirm ? `<div class="redflag-box" style="margin-bottom:18px;background:rgba(139,92,246,.08);border-color:rgba(139,92,246,.3);"><b style="color:#7c3aed;"><i class="fa-solid fa-temperature-half"></i> Temperature shift detected:</b> your BBT rose on <strong>${new Date(bbtConfirm.date+'T00:00:00').toDateString()}</strong> and stayed up — this pattern usually means ovulation had already happened around that day.</div>` : ''}

  <div class="grid-2">
    <div class="card">
      <h3 style="margin-top:0;">Your cycle stats</h3>
      <div class="stat-mini-grid">
        <div class="stat-mini"><b>${stats.avgCycleLen}</b><span>Avg cycle length (days)</span></div>
        <div class="stat-mini"><b>${stats.avgPeriodLen}</b><span>Avg period length (days)</span></div>
        <div class="stat-mini"><b>${stats.cyclesTracked}</b><span>Cycles tracked</span></div>
        <div class="stat-mini"><b>${stats.regularity}</b><span>Regularity</span></div>
      </div>
      ${stats.minLen ? `<p style="font-size:.76rem;color:var(--text-muted);margin-top:12px;">Recent cycle lengths ranged from <strong>${stats.minLen}</strong> to <strong>${stats.maxLen}</strong> days.</p>` : ''}
      <p style="font-size:.76rem;color:var(--text-muted);margin-top:6px;">A typical cycle is 21–35 days and a period lasts 2–7 days — both vary a lot between people, and your own predictions get more accurate the more cycles you log. Unusually large gaps between logged periods are automatically excluded from the average so a missed month of logging doesn't skew your predictions.</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Recent cycles</h3>
      ${stats.episodes.length ? [...stats.episodes].reverse().slice(0,6).map((e,i,arr)=>{
        const idxInAll = stats.episodes.length-1-i;
        const len = idxInAll>0 ? Math.round((new Date(stats.episodes[idxInAll].start+'T00:00:00') - new Date(stats.episodes[idxInAll-1].start+'T00:00:00'))/86400000)+' day cycle' : 'baseline';
        return `<div class="cyc-history-row"><span>${new Date(e.start+'T00:00:00').toDateString()}</span><span style="color:var(--text-muted);">${e.days.length}-day period · ${len}</span></div>`;
      }).join('') : `<p class="empty-state" style="padding:20px 0;">No periods logged yet. Tap "Log today" or "Add past period" to get started.</p>`}
    </div>
  </div>

  ${stats.cycleLens.length>=2 || Object.values(entry.days).some(d=>d.bbt!=null) ? `<div class="grid-2">
    ${cycLenChartCard(stats)}
    ${cycBBTChartCard(entry)}
  </div>` : ''}

  ${insights.length ? `<div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-chart-simple" style="color:var(--brand-primary);"></i> Your patterns</h3>
    <p style="font-size:.82rem;color:var(--text-muted);margin-top:-8px;">Based on what you've logged so far — most-logged symptoms and which phase they tend to show up in.</p>
    ${insights.map(i=>{
      const pct = Math.round((i.total/Math.max(...insights.map(x=>x.total)))*100);
      return `<div class="insight-row"><span class="insight-label">${i.symptom}</span><div class="insight-bar-track"><div class="insight-bar-fill" style="width:${pct}%;"></div></div><span class="insight-pct">${i.total}×</span></div>
      <div style="font-size:.72rem;color:var(--text-muted);margin:-4px 0 6px 140px;">Most common in: ${i.topPhase}</div>`;
    }).join('')}
  </div>` : ''}

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-sliders" style="color:var(--brand-primary);"></i> Prediction settings</h3>
    <p style="font-size:.85rem;color:var(--text-muted);">Predictions are calculated automatically from your logged periods. If you already know your typical cycle length, you can set it manually instead.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
      <div class="form-group" style="margin-bottom:0;"><label>Cycle length override (days)</label><input class="form-control" style="max-width:140px;" type="number" min="15" max="60" id="cyc-override-len" value="${entry.avgCycleLenOverride||''}" placeholder="Auto"></div>
      <button class="btn btn-secondary btn-sm" onclick="cycSaveOverride()">Save</button>
      ${entry.avgCycleLenOverride ? `<button class="btn btn-secondary btn-sm" onclick="cycClearOverride()">Reset to auto</button>` : ''}
    </div>
    <div class="reminder-row">
      <div><b style="font-size:.85rem;">On hormonal birth control</b><div style="font-size:.76rem;color:var(--text-muted);">Pill, IUD, injection, implant, etc. — we'll flag that ovulation/fertile-window predictions won't apply to you.</div></div>
      <div class="toggle-sw ${entry.onBirthControl?'on':''}" onclick="cycToggleBC()"></div>
    </div>
    <div class="reminder-row">
      <div><b style="font-size:.85rem;">Remind me before my period</b><div style="font-size:.76rem;color:var(--text-muted);">Shows a banner at the top of this page once you're inside the window (no push notifications in this build).</div></div>
      <div class="toggle-sw ${entry.reminderOn?'on':''}" onclick="cycToggleReminder()"></div>
    </div>
    ${entry.reminderOn ? `<div class="form-group" style="margin-top:10px;max-width:220px;"><label>Days before predicted start</label><input class="form-control" type="number" min="1" max="10" value="${entry.reminderDays}" onchange="cycSetReminderDays(this.value)"></div>` : ''}
    ${entry.onBirthControl ? `<p style="font-size:.76rem;color:var(--text-muted);margin-top:10px;">Predictions below are still shown, but treat ovulation/fertile-window estimates as not applicable while on hormonal birth control.</p>` : ''}
  </div>

  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-lock" style="color:var(--brand-primary);"></i> Privacy &amp; backup</h3>
    <p style="color:var(--text-muted);font-size:.85rem;">This data is private to your own account — it syncs only to devices where <em>you</em> are signed in, and is never visible to responders, hospitals, pharmacies, doctors or other family accounts sharing this app. It is not part of any shared/broadcast data. Even so, an export is a good idea before switching devices, clearing your browser, or if you ever want a copy outside the app.</p>
    ${c.pinLock ? `<p style="font-size:.76rem;color:var(--text-muted);">Your PIN re-locks this section every time you open the app or switch family profiles.</p><button class="btn btn-secondary btn-sm" onclick="removePin()">Remove PIN</button>` : `<div style="display:flex;gap:10px;margin-bottom:14px;"><input class="form-control" id="new-pin" maxlength="4" placeholder="Set 4-digit PIN" style="max-width:160px;"><button class="btn btn-sm" onclick="setPin()">Save</button></div>`}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
      <button class="btn btn-secondary btn-sm" onclick="cycExportData()"><i class="fa-solid fa-download"></i> Export my data (JSON)</button>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('cyc-import-file').click()"><i class="fa-solid fa-upload"></i> Import backup</button>
      <input type="file" id="cyc-import-file" accept="application/json" class="hidden" onchange="cycImportData(this.files[0])">
    </div>
  </div>

  <div class="disclaimer-note" style="margin-bottom:22px;"><i class="fa-solid fa-triangle-exclamation"></i> Predicted dates (period, ovulation, fertile window) are statistical estimates based on your own logged history — they are <strong>not precise enough to rely on for contraception or for timing conception</strong>. Use a doctor-recommended method for either.</div>

  ${renderCycAwareness()}
  `;
}
function cycSetMode(k){ const entry=cycEntry(); entry.mode=k; cycSaveEntry(entry); renderCurrentView('p-women'); }
function cycToggleBC(){ const entry=cycEntry(); entry.onBirthControl=!entry.onBirthControl; cycSaveEntry(entry); renderCurrentView('p-women'); }
function cycToggleReminder(){ const entry=cycEntry(); entry.reminderOn=!entry.reminderOn; cycSaveEntry(entry); renderCurrentView('p-women'); }
function cycSetReminderDays(v){ const entry=cycEntry(); const n=parseInt(v,10); entry.reminderDays=(n&&n>=1&&n<=10)?n:2; cycSaveEntry(entry); }
/* ---------- small inline SVG charts (no external chart lib in this build) ---------- */
function cycLenChartCard(stats){
  const lens = stats.cycleLens.slice(-12);
  if(lens.length<2) return `<div class="card"><h3 style="margin-top:0;">Cycle length trend</h3><p class="empty-state" style="padding:20px 0;">Log at least 3 periods to see a trend.</p></div>`;
  const w=280,h=110,pad=18, max=Math.max(...lens,35), min=Math.min(...lens,21);
  const bw = (w-pad*2)/lens.length;
  const bars = lens.map((v,i)=>{
    const bh = Math.max(4, ((v-min+2)/(max-min+4))*(h-pad*2));
    const x = pad + i*bw + bw*0.15, y = h-pad-bh;
    return `<rect x="${x}" y="${y}" width="${bw*0.7}" height="${bh}" rx="3" fill="var(--brand-primary)"></rect><text x="${x+bw*0.35}" y="${h-4}" font-size="7" text-anchor="middle" fill="var(--text-muted)">${v}</text>`;
  }).join('');
  return `<div class="card"><h3 style="margin-top:0;">Cycle length trend</h3><p style="font-size:.76rem;color:var(--text-muted);margin-top:-6px;">Last ${lens.length} cycles, in days.</p>
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">${bars}</svg></div>`;
}
function cycBBTChartCard(entry){
  const dates = Object.keys(entry.days).filter(d=>entry.days[d].bbt!=null).sort().slice(-20);
  if(dates.length<2) return `<div class="card"><h3 style="margin-top:0;">Basal body temperature</h3><p class="empty-state" style="padding:20px 0;">Log your temperature each morning (in the day log) to build a BBT chart.</p></div>`;
  const temps = dates.map(d=>entry.days[d].bbt);
  const w=280,h=110,pad=18, max=Math.max(...temps)+0.15, min=Math.min(...temps)-0.15;
  const pts = temps.map((t,i)=>{
    const x = pad + (i/(temps.length-1))*(w-pad*2);
    const y = h-pad - ((t-min)/(max-min))*(h-pad*2);
    return `${x},${y}`;
  }).join(' ');
  return `<div class="card"><h3 style="margin-top:0;">Basal body temperature</h3><p style="font-size:.76rem;color:var(--text-muted);margin-top:-6px;">Last ${temps.length} logged readings (°C).</p>
  <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;"><polyline points="${pts}" fill="none" stroke="#7c3aed" stroke-width="2"></polyline>${temps.map((t,i)=>{const x=pad+(i/(temps.length-1))*(w-pad*2);const y=h-pad-((t-min)/(max-min))*(h-pad*2);return `<circle cx="${x}" cy="${y}" r="2.4" fill="#7c3aed"></circle>`;}).join('')}</svg></div>`;
}

let cycCalMonth = null; // {year, month}
function cycNavMonth(delta){
  if(!cycCalMonth){ const t=new Date(); cycCalMonth={year:t.getFullYear(), month:t.getMonth()}; }
  cycCalMonth.month += delta;
  if(cycCalMonth.month<0){ cycCalMonth.month=11; cycCalMonth.year--; }
  if(cycCalMonth.month>11){ cycCalMonth.month=0; cycCalMonth.year++; }
  renderCycleCalendar();
}
let pinBuffer = '';
function pinPress(n){
  if(n==='' ) return;
  if(n==='⌫'){ pinBuffer = pinBuffer.slice(0,-1); }
  else if(pinBuffer.length<4){ pinBuffer += n; }
  document.querySelectorAll('#pin-dots span').forEach((d,i)=>d.classList.toggle('filled', i<pinBuffer.length));
  if(pinBuffer.length===4){
    const c = db('cycle');
    if(pinBuffer===c.pinLock){ cycSessionUnlocked=true; renderCurrentView('p-women'); }
    else { showToast('Incorrect PIN','Try again.','danger'); pinBuffer=''; }
  }
}
function setPin(){ const v=document.getElementById('new-pin').value; if(v.length!==4){showToast('Invalid','PIN must be 4 digits.','danger');return;} const c=db('cycle'); c.pinLock=v; dbSet('cycle',c); cycSessionUnlocked=true; renderCurrentView('p-women'); }
function removePin(){ const c=db('cycle'); c.pinLock=''; dbSet('cycle',c); cycSessionUnlocked=true; renderCurrentView('p-women'); }
function cycSaveOverride(){ const v=parseInt(document.getElementById('cyc-override-len').value,10); const entry=cycEntry(); entry.avgCycleLenOverride = (v && v>=15 && v<=60) ? v : null; cycSaveEntry(entry); renderCurrentView('p-women'); }
function cycClearOverride(){ const entry=cycEntry(); entry.avgCycleLenOverride=null; cycSaveEntry(entry); renderCurrentView('p-women'); }

function renderCycleCalendar(){
  const slot = document.getElementById('cycle-cal'); if(!slot) return;
  const entry = cycEntry();
  const stats = cycStats(entry);
  const pred = cycPredict(entry, stats);
  if(!cycCalMonth){ const t=new Date(); cycCalMonth={year:t.getFullYear(), month:t.getMonth()}; }
  const {year, month} = cycCalMonth;
  document.getElementById('cal-month-label').textContent = new Date(year,month,1).toLocaleDateString([], {month:'long', year:'numeric'});
  const first = new Date(year,month,1); const startDow = first.getDay(); const daysInMonth = new Date(year,month+1,0).getDate();
  const todayStr = isoDay(new Date());
  let cells = '';
  for(let i=0;i<startDow;i++) cells += `<div class="cal-cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = isoDay(new Date(year,month,d));
    const dObj = new Date(dateStr+'T00:00:00');
    let cls='';
    const dayFlow = entry.days[dateStr] && entry.days[dateStr].flow;
    if(dayFlow==='spotting') cls='spotting';
    else if(dayFlow) cls='period';
    else if(pred && pred.futureStarts.some(fs=>{ const start=fs, end=addDays(fs, stats.avgPeriodLen-1); return dObj>=start && dObj<=end; })) cls='predicted';
    else if(pred && pred.futureWindows.some(w=>dObj>=w.fertileStart && dObj<=w.fertileEnd)){
      cls = pred.futureWindows.some(w=>isoDay(dObj)===isoDay(w.ovulation)) ? 'ovulation' : 'fertile';
    }
    else if(pred){
      const untilNext = pred.futureStarts.map(fs=>Math.round((fs-dObj)/86400000)).find(x=>x>=0 && x<=5);
      if(untilNext!==undefined) cls='pms';
    }
    const hasNote = entry.days[dateStr] && (entry.days[dateStr].symptoms?.length || entry.days[dateStr].mood || entry.days[dateStr].notes || entry.days[dateStr].bbt!=null || entry.days[dateStr].lh || entry.days[dateStr].mucus);
    cells += `<div class="cal-cell ${cls} ${dateStr===todayStr?'today':''}" onclick="openDayLogModal('${dateStr}')">${d}${hasNote?'<span class="cal-dot"></span>':''}</div>`;
  }
  slot.innerHTML = `<div class="cal-grid">${['S','M','T','W','T','F','S'].map(d=>`<div style="text-align:center;font-size:.7rem;font-weight:700;color:var(--text-muted);">${d}</div>`).join('')}${cells}</div>`;
}

/* ---------- day log modal ---------- */
const CYC_PAIN = [{k:'',l:'None'},{k:'mild',l:'Mild'},{k:'moderate',l:'Moderate'},{k:'severe',l:'Severe'}];
function openDayLogModal(dateStr){
  const entry = cycEntry();
  const day = entry.days[dateStr] || {flow:'', symptoms:[], mood:'', notes:'', pain:'', bbt:null, lh:'', mucus:'', medTaken:false};
  window.__cycDraft = {dateStr, flow:day.flow||'', symptoms:[...(day.symptoms||[])], mood:day.mood||'', notes:day.notes||'', pain:day.pain||'', bbt:(day.bbt!=null?day.bbt:''), lh:day.lh||'', mucus:day.mucus||'', medTaken:!!day.medTaken};
  const allSymptoms = cycAllSymptoms(entry);
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>${new Date(dateStr+'T00:00:00').toDateString()}</h3>
    <p class="modal-sub">Log your flow, symptoms and mood for this day. This stays private to this device.</p>
    <div class="form-group"><label>Flow</label>
      <div class="chip-select" id="cyc-flow-chips">${CYC_FLOWS.map(f=>`<button type="button" class="chip-opt ${window.__cycDraft.flow===f.k?'active':''}" data-flow="${f.k}" onclick="cycPickFlow('${f.k}')">${f.l}</button>`).join('')}</div>
    </div>
    <div class="form-group"><label>Pain level</label>
      <div class="chip-select" id="cyc-pain-chips">${CYC_PAIN.map(p=>`<button type="button" class="chip-opt ${window.__cycDraft.pain===p.k?'active':''}" data-pain="${p.k}" onclick="cycPickPain('${p.k}')">${p.l}</button>`).join('')}</div>
    </div>
    <div class="form-group"><label>Symptoms</label>
      <div class="chip-select" id="cyc-symptom-chips">${allSymptoms.map(s=>`<button type="button" class="chip-opt ${window.__cycDraft.symptoms.includes(s)?'active':''}" onclick="cycToggleSymptom('${s.replace(/'/g,"\\'")}')">${s}</button>`).join('')}</div>
      <div class="mini-chip-add"><input class="form-control" id="cyc-new-symptom" placeholder="Add your own symptom..."><button class="btn btn-secondary btn-sm" onclick="cycAddCustomSymptom()">Add</button></div>
    </div>
    <div class="form-group"><label>Mood</label>
      <div class="chip-select" id="cyc-mood-chips">${CYC_MOODS.map(m=>`<button type="button" class="chip-opt ${window.__cycDraft.mood===m.k?'active':''}" onclick="cycPickMood('${m.k}')">${m.e} ${m.l}</button>`).join('')}</div>
    </div>
    <div class="form-group"><label>Cervical mucus</label>
      <div class="chip-select" id="cyc-mucus-chips">${CYC_MUCUS.filter(m=>m.k).map(m=>`<button type="button" class="chip-opt ${window.__cycDraft.mucus===m.k?'active':''}" data-mucus="${m.k}" onclick="cycPickMucus('${m.k}')">${m.l}</button>`).join('')}</div>
    </div>
    <div class="form-group"><label>Ovulation (LH) test</label>
      <div class="chip-select" id="cyc-lh-chips">${CYC_LH.filter(l=>l.k).map(l=>`<button type="button" class="chip-opt ${window.__cycDraft.lh===l.k?'active':''}" data-lh="${l.k}" onclick="cycPickLH('${l.k}')">${l.l}</button>`).join('')}</div>
    </div>
    <div class="form-group"><label>Basal body temperature (°C, taken on waking)</label><input class="form-control" style="max-width:160px;" type="number" step="0.01" min="34" max="42" id="cyc-bbt" value="${window.__cycDraft.bbt}" placeholder="e.g. 36.55"></div>
    <div class="reminder-row" style="padding:4px 0 10px;">
      <div><b style="font-size:.85rem;">Took birth control / medication today</b></div>
      <div class="toggle-sw ${window.__cycDraft.medTaken?'on':''}" id="cyc-med-toggle" onclick="cycToggleMed()"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea class="form-control" id="cyc-notes" rows="2" placeholder="Optional notes...">${window.__cycDraft.notes}</textarea></div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-block" onclick="saveDayLog()"><i class="fa-solid fa-check"></i> Save</button>
      ${(entry.days[dateStr]) ? `<button class="btn btn-secondary" onclick="clearDayLog('${dateStr}')"><i class="fa-solid fa-trash"></i></button>` : ''}
    </div>
  `);
}
function cycPickPain(k){ window.__cycDraft.pain = (window.__cycDraft.pain===k?'':k); document.querySelectorAll('#cyc-pain-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.pain===window.__cycDraft.pain)); }
function cycPickFlow(k){ window.__cycDraft.flow = (window.__cycDraft.flow===k ? '' : k); document.querySelectorAll('#cyc-flow-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.flow===window.__cycDraft.flow)); }
function cycToggleSymptom(s){ const i=window.__cycDraft.symptoms.indexOf(s); if(i>-1) window.__cycDraft.symptoms.splice(i,1); else window.__cycDraft.symptoms.push(s); document.querySelectorAll('#cyc-symptom-chips .chip-opt').forEach(b=>b.classList.toggle('active', window.__cycDraft.symptoms.includes(b.textContent))); }
function cycPickMood(k){ window.__cycDraft.mood = (window.__cycDraft.mood===k?'':k); document.querySelectorAll('#cyc-mood-chips .chip-opt').forEach((b,i)=>b.classList.toggle('active', CYC_MOODS[i].k===window.__cycDraft.mood)); }
function cycPickMucus(k){ window.__cycDraft.mucus = (window.__cycDraft.mucus===k?'':k); document.querySelectorAll('#cyc-mucus-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.mucus===window.__cycDraft.mucus)); }
function cycPickLH(k){ window.__cycDraft.lh = (window.__cycDraft.lh===k?'':k); document.querySelectorAll('#cyc-lh-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.lh===window.__cycDraft.lh)); }
function cycToggleMed(){ window.__cycDraft.medTaken = !window.__cycDraft.medTaken; document.getElementById('cyc-med-toggle').classList.toggle('on', window.__cycDraft.medTaken); }
function cycAddCustomSymptom(){
  const input = document.getElementById('cyc-new-symptom');
  const val = (input.value||'').trim();
  if(!val){ return; }
  const entry = cycEntry();
  if(!cycAllSymptoms(entry).some(s=>s.toLowerCase()===val.toLowerCase())){
    entry.customSymptoms.push(val);
    cycSaveEntry(entry);
  }
  if(!window.__cycDraft.symptoms.includes(val)) window.__cycDraft.symptoms.push(val);
  input.value='';
  openDayLogModal(window.__cycDraft.dateStr); // re-render chips with the new symptom included and selected
  document.querySelectorAll('#cyc-symptom-chips .chip-opt').forEach(b=>{ if(b.textContent===val) b.classList.add('active'); });
}
function saveDayLog(){
  const d = window.__cycDraft;
  d.notes = document.getElementById('cyc-notes').value.trim();
  const bbtRaw = document.getElementById('cyc-bbt').value;
  d.bbt = bbtRaw!=='' ? parseFloat(bbtRaw) : null;
  const entry = cycEntry();
  const isEmpty = !d.flow && !d.symptoms.length && !d.mood && !d.notes && !d.pain && d.bbt==null && !d.lh && !d.mucus && !d.medTaken;
  if(isEmpty){ delete entry.days[d.dateStr]; }
  else entry.days[d.dateStr] = {flow:d.flow, symptoms:d.symptoms, mood:d.mood, notes:d.notes, pain:d.pain, bbt:d.bbt, lh:d.lh, mucus:d.mucus, medTaken:d.medTaken};
  cycSaveEntry(entry);
  closeModal();
  renderCurrentView('p-women');
}
function clearDayLog(dateStr){ const entry=cycEntry(); delete entry.days[dateStr]; cycSaveEntry(entry); closeModal(); renderCurrentView('p-women'); }
function logPeriodToday(){ openDayLogModal(isoDay(new Date())); }

/* ---------- bulk / past-period entry ---------- */
function cycOpenBulkModal(){
  const entry = cycEntry();
  const stats = cycStats(entry);
  const todayStr = isoDay(new Date());
  const defStart = isoDay(addDays(new Date(), -(stats.avgPeriodLen||5)));
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>Add a past period</h3>
    <p class="modal-sub">Quickly back-fill a period you've already had, so predictions become accurate right away without tapping every single day.</p>
    <div class="form-group"><label>Period start date</label><input class="form-control" type="date" id="bulk-start" max="${todayStr}" value="${defStart}"></div>
    <div class="form-group"><label>Number of days</label><input class="form-control" type="number" id="bulk-days" min="1" max="14" value="${stats.avgPeriodLen||5}"></div>
    <div class="form-group"><label>Flow (applied to all days)</label>
      <div class="chip-select" id="bulk-flow-chips">${CYC_FLOWS.filter(f=>f.k).map((f,i)=>`<button type="button" class="chip-opt ${f.k==='medium'?'active':''}" data-flow="${f.k}" onclick="cycBulkPickFlow('${f.k}')">${f.l}</button>`).join('')}</div>
    </div>
    <button class="btn btn-block" onclick="cycSaveBulk()"><i class="fa-solid fa-check"></i> Add period</button>
  `);
  window.__cycBulkFlow = 'medium';
}
function cycBulkPickFlow(k){ window.__cycBulkFlow=k; document.querySelectorAll('#bulk-flow-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.flow===k)); }
function cycSaveBulk(){
  const startStr = document.getElementById('bulk-start').value;
  const numDays = parseInt(document.getElementById('bulk-days').value,10) || 1;
  if(!startStr){ showToast('Missing date','Pick a start date first.','danger'); return; }
  const entry = cycEntry();
  const start = new Date(startStr+'T00:00:00');
  for(let i=0;i<Math.min(numDays,14);i++){
    const ds = isoDay(addDays(start,i));
    const existing = entry.days[ds] || {};
    entry.days[ds] = {...existing, flow: window.__cycBulkFlow||'medium'};
  }
  cycSaveEntry(entry);
  closeModal();
  renderCurrentView('p-women');
  showToast('Period added','Your predictions have been updated.','success');
}

/* ---------- backup / restore ---------- */
function cycExportData(){
  const c = cycRoot();
  // Pregnancy tracker data (due date/LMP, weight-gain log) shares this backup file
  // rather than needing its own export button — same feature, same privacy tier.
  const p = pregRoot();
  const payload = {exportedAt: new Date().toISOString(), app:'ArogyaBot Women\'s Health', data: c, pregnancy: p};
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'arogyabot-cycle-backup-'+isoDay(new Date())+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('Exported','Your cycle and pregnancy data was downloaded as a JSON file.','success');
}
function cycImportData(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const parsed = JSON.parse(e.target.result);
      const incoming = parsed.data || parsed; // tolerate a raw cycle object too
      if(!incoming || typeof incoming!=='object' || !incoming.entries){ throw new Error('bad shape'); }
      const current = cycRoot();
      // merge: incoming days win on conflict per member, but don't wipe entries not present in the file.
      // Settings (mode/birth control/reminders/custom symptoms/period-length override) are restored
      // too, not just the day-by-day log — a restored backup should put you back where you left off,
      // not just bring your history back with defaults for everything else.
      Object.keys(incoming.entries).forEach(memberId=>{
        const inc = incoming.entries[memberId];
        if(!current.entries[memberId]) current.entries[memberId] = {days:{}, avgCycleLenOverride:null, avgPeriodLenOverride:null, mode:'track', onBirthControl:false, tempUnit:'C', reminderOn:false, reminderDays:2, customSymptoms:[]};
        const cur = current.entries[memberId];
        Object.assign(cur.days, inc.days||{});
        if(inc.avgCycleLenOverride) cur.avgCycleLenOverride = inc.avgCycleLenOverride;
        if(inc.avgPeriodLenOverride) cur.avgPeriodLenOverride = inc.avgPeriodLenOverride;
        if(inc.mode) cur.mode = inc.mode;
        if(inc.onBirthControl!==undefined) cur.onBirthControl = inc.onBirthControl;
        if(inc.tempUnit) cur.tempUnit = inc.tempUnit;
        if(inc.reminderOn!==undefined) cur.reminderOn = inc.reminderOn;
        if(inc.reminderDays) cur.reminderDays = inc.reminderDays;
        if(inc.customSymptoms && inc.customSymptoms.length) cur.customSymptoms = [...new Set([...(cur.customSymptoms||[]), ...inc.customSymptoms])];
      });
      dbSet('cycle', current);
      // Pregnancy data is optional in older backup files exported before this was added —
      // only merge it in when the file actually has it.
      if(parsed.pregnancy && parsed.pregnancy.entries){
        const curPreg = pregRoot();
        Object.keys(parsed.pregnancy.entries).forEach(memberId=>{
          curPreg.entries[memberId] = Object.assign({}, curPreg.entries[memberId]||{}, parsed.pregnancy.entries[memberId]);
        });
        dbSet('pregnancy', curPreg);
      }
      renderCurrentView('p-women');
      showToast('Import complete','Your backup was merged into this device.','success');
    }catch(err){
      showToast('Import failed','That file doesn\'t look like a valid ArogyaBot cycle backup.','danger');
    }
  };
  reader.readAsText(file);
}

/* ---------- awareness / education hub ---------- */
function renderCycAwareness(){
  return `<div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-book-open" style="color:var(--brand-primary);"></i> Women's health awareness</h3>
    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px;">General educational information to help you understand your body. This is not a diagnosis — use the <a href="#" onclick="renderCurrentView('p-chat');return false;" style="color:var(--brand-primary);font-weight:600;">AI Symptom Checker</a> or <a href="#" onclick="renderCurrentView('p-tele');return false;" style="color:var(--brand-primary);font-weight:600;">Telemedicine</a> for anything concerning you personally.</p>

    <details class="awareness-item" open>
      <summary>Understanding your cycle <i class="fa-solid fa-chevron-down"></i></summary>
      <div class="awareness-body">
        <p>The menstrual cycle is counted from the first day of one period to the first day of the next, and moves through four broad phases driven by shifting hormone levels:</p>
        <h5>Menstrual phase</h5><p>The uterine lining sheds, causing bleeding. Usually lasts 2–7 days.</p>
        <h5>Follicular phase</h5><p>Starts on day 1 of the period and runs until ovulation; the body prepares an egg for release and rebuilds the uterine lining.</p>
        <h5>Ovulation</h5><p>An egg is released, typically around the midpoint of the cycle (about 14 days before the next period). This is when pregnancy is most likely if unprotected sex occurs.</p>
        <h5>Luteal phase</h5><p>After ovulation until the next period. Hormone shifts here are what commonly cause PMS symptoms like mood changes, bloating and breast tenderness.</p>
        <p>A cycle length of 21–35 days and a period of 2–7 days both fall within a wide normal range — "normal" varies a lot between individuals.</p>
      </div>
    </details>

    <details class="awareness-item">
      <summary>What's normal vs. when to see a doctor <i class="fa-solid fa-chevron-down"></i></summary>
      <div class="awareness-body">
        <p>Some variation cycle-to-cycle is expected. Consider speaking with a doctor if you notice:</p>
        <div class="redflag-box">
          <b>Talk to a doctor if:</b>
          <ul>
            <li>Periods regularly last longer than 7 days</li>
            <li>You soak through a pad or tampon every 1–2 hours</li>
            <li>Cycles are consistently shorter than 21 or longer than 35 days</li>
            <li>You miss periods for 3+ months and pregnancy is ruled out</li>
            <li>Pain is severe enough to disrupt work, school or daily activity</li>
            <li>You notice bleeding between periods, after sex, or after menopause</li>
            <li>Severe mood symptoms (e.g. hopelessness, panic) show up predictably before your period</li>
          </ul>
        </div>
      </div>
    </details>

    <details class="awareness-item">
      <summary>Common conditions, explained simply <i class="fa-solid fa-chevron-down"></i></summary>
      <div class="awareness-body">
        <h5>PCOS (Polycystic Ovary Syndrome)</h5><p>A hormonal condition that can cause irregular or missed periods, acne, extra hair growth, and weight changes. It's common and manageable with medical guidance.</p>
        <h5>Endometriosis</h5><p>Tissue similar to the uterine lining grows outside the uterus, often causing worsening pain during periods, pain during sex, or pain with bowel movements.</p>
        <h5>Uterine fibroids</h5><p>Non-cancerous growths in the uterus that can cause heavy or prolonged bleeding and pelvic pressure.</p>
        <h5>PMDD (Premenstrual Dysphoric Disorder)</h5><p>A more severe form of PMS with intense mood symptoms in the days before a period, significant enough to affect daily life — this is a recognised medical condition, not "just PMS."</p>
        <p style="margin-top:10px;">None of these can be diagnosed from an app — they're mentioned so the symptoms are easier to recognise and discuss with a doctor.</p>
      </div>
    </details>

    <details class="awareness-item">
      <summary>Myths vs. facts <i class="fa-solid fa-chevron-down"></i></summary>
      <div class="awareness-body">
        <p><b>Myth:</b> You shouldn't exercise during your period.<br><b>Fact:</b> Light-to-moderate exercise is generally safe and can even ease cramps for many people.</p>
        <p><b>Myth:</b> A "normal" cycle is always exactly 28 days.<br><b>Fact:</b> 21–35 days is typical, and it can vary cycle to cycle for the same person.</p>
        <p><b>Myth:</b> You can't get pregnant during your period.<br><b>Fact:</b> It's less likely but not impossible, especially with shorter cycles or irregular ovulation.</p>
        <p><b>Myth:</b> Period pain is always something you just have to endure.<br><b>Fact:</b> Pain that disrupts daily life is worth discussing with a doctor — effective treatments exist.</p>
      </div>
    </details>

    <details class="awareness-item">
      <summary>Self-care &amp; hygiene tips <i class="fa-solid fa-chevron-down"></i></summary>
      <div class="awareness-body">
        <ul>
          <li>Change pads every 4–6 hours, tampons every 4–8 hours, and menstrual cups per manufacturer guidance, to reduce infection risk.</li>
          <li>A heating pad or warm compress on the lower abdomen can ease cramps.</li>
          <li>Staying hydrated and getting light movement (like walking or stretching) can help with bloating and fatigue.</li>
          <li>Iron-rich foods (leafy greens, legumes, lean meat) can help offset iron lost during heavier periods.</li>
          <li>Tracking symptoms over a few cycles (like you're doing here) makes it much easier to describe patterns to a doctor.</li>
        </ul>
      </div>
    </details>

    <details class="awareness-item">
      <summary>Mood &amp; mental health connection <i class="fa-solid fa-chevron-down"></i></summary>
      <div class="awareness-body">
        <p>Hormonal shifts in the luteal phase are a real, physiological cause of mood changes for many people — irritability, low mood, or anxiety in the days before a period is common and not "in your head." If mood symptoms feel severe, out of proportion, or are affecting relationships or daily functioning, it's worth talking to a doctor — this can sometimes indicate PMDD, which responds well to treatment.</p>
      </div>
    </details>

    <div class="disclaimer-note"><i class="fa-solid fa-circle-info"></i> This section provides general educational information only and is not a medical diagnosis. Your logged cycle data is private to your account and is never shared with any other role or family member on this app.</div>
  </div>`;
}
