/* ============================================================
   PATIENT — DAILY HEALTH DIARY & CALENDAR
   ------------------------------------------------------------
   A dated log of the readings people take at home: blood sugar, blood pressure, weight, pulse,
   oxygen (SpO2), temperature, plus any CUSTOM measurement the patient or their doctor defines
   (name, unit, optional healthy range). Shown on a month calendar, with trends, simple status
   labels, and a summary that can be copied / printed to show a doctor.

   * Private: stored under the 'diary' key (account-isolation PRIVATE_ACCOUNT_KEYS), one log per
     family-member slot (currentPatientId), exactly like the vitals / fitness tools.
   * Status labels REUSE bpCategory() and sugarCategory() from vitals-screening.js so the
     diary and the Vitals screen can never disagree.
   * Educational only. It does not diagnose, and the page says so.
   * Additive: nothing existing was changed to add this. Vitals tools still check a typed reading.
   ============================================================ */
const DY_MAX_ENTRIES = 4000;      // ~500 KB per person, safely under Firestore's 1 MB document limit
const DY_WARN_ENTRIES = 3500;
const DY_BUILTIN = {
  sugar:  {label:'Blood sugar',      short:'Sugar',  icon:'fa-droplet',            color:'#ef4444', unit:'mg/dL'},
  bp:     {label:'Blood pressure',   short:'BP',     icon:'fa-heart-circle-bolt',  color:'#8b5cf6', unit:'mmHg'},
  weight: {label:'Weight',           short:'Weight', icon:'fa-weight-scale',       color:'#0ea5e9', unit:'kg'},
  pulse:  {label:'Pulse (resting)',  short:'Pulse',  icon:'fa-heart-pulse',        color:'#ec4899', unit:'bpm'},
  spo2:   {label:'Oxygen (SpO\u2082)', short:'SpO\u2082', icon:'fa-lungs',           color:'#14b8a6', unit:'%'},
  temp:   {label:'Temperature',      short:'Temp',   icon:'fa-temperature-half',   color:'#f59e0b', unit:'\u00b0C'}
};
const DY_SUGAR_CTX = {fasting:'Fasting', before:'Before a meal', post:'2 hours after a meal', bed:'Bedtime', random:'Random'};
const DY_SEV = {none:0, good:1, borderline:2, low:3, high:4, urgent:5};
const DY_COLORS = {none:'#94a3b8', good:'#10b981', borderline:'#f59e0b', low:'#3b82f6', high:'#ef4444', urgent:'#dc2626'};
const DY_MGDL_PER_MMOL = 18.0182;

let dyMonth = null;            // {year, month}
let dySelected = null;         // 'YYYY-MM-DD'
let dyTrendMetric = null;
let dyTrendDays = 30;
let dyEditingId = null;

/* ---------- small helpers ---------- */
function dyEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dyIso(d){ const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), da = String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+da; }   // LOCAL date (not UTC)
function dyToday(){ return dyIso(new Date()); }
function dyParseIso(s){ const p = String(s).split('-').map(Number); return new Date(p[0], (p[1]||1)-1, p[2]||1); }
function dyNowTime(){ const d = new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function dyFmtDate(iso, long){ try{ return dyParseIso(iso).toLocaleDateString('en-IN', long ? {weekday:'long', day:'numeric', month:'long', year:'numeric'} : {day:'numeric', month:'short', year:'numeric'}); }catch(e){ return iso; } }
function dyFmtTime(t){ if(!t) return ''; const p = t.split(':').map(Number); const h = p[0], m = p[1]||0; return ((h%12)||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'pm':'am'); }
function dyNum(v){ const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; }
function dyRound(n, d){ const f = Math.pow(10, d||0); return Math.round(n*f)/f; }
function dyId(){ return 'dy' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ---------- storage (one log per family-member slot) ---------- */
function dyRoot(){ const v = db('diary'); return (v && v.entries) ? v : {entries:{}}; }
function dyBlank(){ return {log:[], custom:[], prefs:{sugarUnit:'mgdl', tempUnit:'c'}}; }
function dyData(){
  const root = dyRoot(); const pid = currentPatientId();
  const e = root.entries[pid] || dyBlank();
  if(!Array.isArray(e.log)) e.log = [];
  if(!Array.isArray(e.custom)) e.custom = [];
  e.prefs = Object.assign({sugarUnit:'mgdl', tempUnit:'c'}, e.prefs || {});
  return e;
}
function dySave(e){ const root = dyRoot(); root.entries[currentPatientId()] = e; dbSet('diary', root); }

/* ---------- metric info ---------- */
function dyCustomById(id){ return dyData().custom.find(c => c.id === id) || null; }
function dyMetricInfo(key){
  if(DY_BUILTIN[key]) return Object.assign({key}, DY_BUILTIN[key]);
  if(String(key).indexOf('c:') === 0){
    const c = dyCustomById(String(key).slice(2));
    if(c) return {key, label:c.name, short:c.name, icon:'fa-notes-medical', color:'#6366f1', unit:c.unit||'', min:c.min, max:c.max, decimals:c.decimals, custom:true};
  }
  return {key, label:'Deleted measurement', short:'Deleted', icon:'fa-notes-medical', color:'#94a3b8', unit:'', custom:true};
}
function dyMetricKeys(){ return Object.keys(DY_BUILTIN).concat(dyData().custom.map(c => 'c:'+c.id)); }

/* ---------- units ---------- */
function dySugarDisplay(mgdl, unit){ return unit === 'mmol' ? (mgdl/DY_MGDL_PER_MMOL).toFixed(1) : String(Math.round(mgdl)); }
function dySugarUnitLabel(unit){ return unit === 'mmol' ? 'mmol/L' : 'mg/dL'; }
function dyTempDisplay(c, unit){ return unit === 'f' ? (c*9/5+32).toFixed(1) : c.toFixed(1); }
function dyTempUnitLabel(unit){ return unit === 'f' ? '\u00b0F' : '\u00b0C'; }

/* ---------- status (labels) ---------- */
function dySevFromColor(color){
  return color === '#10b981' ? 'good' : color === '#f59e0b' ? 'borderline' : color === '#3b82f6' ? 'low' : color === '#ef4444' ? 'high' : 'none';
}
function dyStatus(e){
  if(!e) return {sev:'none', label:'Logged', color:DY_COLORS.none, note:''};
  const mk = (sev, label, note, alert) => ({sev, label, color:DY_COLORS[sev], note:note||'', alert:alert||''});
  if(e.m === 'bp'){
    if(typeof bpCategory === 'function'){
      const c = bpCategory(e.v, e.v2); const sev = (e.v > 180 || e.v2 > 120) ? 'urgent' : dySevFromColor(c.color);
      return mk(sev, c.label, c.note, sev === 'urgent' ? c.note : '');
    }
    return mk('none', 'Logged');
  }
  if(e.m === 'sugar'){
    let c;
    if(e.ctx === 'fasting' && typeof sugarCategory === 'function') c = sugarCategory('fasting', e.v);
    else if(e.ctx === 'post' && typeof sugarCategory === 'function') c = sugarCategory('postprandial', e.v);
    else if(e.v < 70) c = {label:'Low (Hypoglycemia)', color:'#3b82f6', note:'Below the usual range. If you feel shaky, sweaty or confused, take fast-acting sugar and tell your doctor.'};
    else if(e.v < 140) c = {label:'Normal', color:'#10b981', note:'Within the usual range for a reading not taken fasting or after a meal.'};
    else if(e.v < 200) c = {label:'Above normal', color:'#f59e0b', note:'A little high. Check how it compares with your fasting and after-meal readings, and mention it to your doctor if it keeps happening.'};
    else c = {label:'High', color:'#ef4444', note:'High for a random reading. Please talk to your doctor, especially if you have symptoms such as thirst, frequent urination or tiredness.'};
    let sev = dySevFromColor(c.color), alert = '';
    if(e.v < 54){ sev = 'urgent'; alert = 'Very low blood sugar. Treat it right away with fast-acting sugar, and get help if you feel unwell or confused.'; }
    else if(e.v >= 300){ sev = 'urgent'; alert = 'Very high blood sugar. Contact your doctor today, and get urgent care if you feel very unwell, are vomiting or are short of breath.'; }
    return mk(sev, c.label, c.note, alert);
  }
  if(e.m === 'pulse'){
    if(e.v < 50) return mk('low', 'Low', 'Often normal for very fit people, otherwise worth checking if you feel dizzy or faint.');
    if(e.v < 60) return mk('low', 'Slightly low', 'A little below the usual 60 to 100 range, which is often fine if you feel well.');
    if(e.v <= 100) return mk('good', 'Normal', 'Within the usual resting range of 60 to 100 beats per minute.');
    if(e.v <= 120) return mk('borderline', 'Raised', 'Higher than the usual resting range. Rest, then re-check. Caffeine, fever, stress and activity can raise it.');
    return mk('high', 'High at rest', 'A high resting pulse should be checked by a doctor, especially with chest pain, breathlessness or fainting.');
  }
  if(e.m === 'spo2'){
    if(e.v >= 95) return mk('good', 'Normal', 'A healthy oxygen level for most people.');
    if(e.v >= 92) return mk('borderline', 'Slightly low', 'A bit below normal. Re-check after resting, with warm hands, and mention it to a doctor if it stays here.');
    if(e.v >= 90) return mk('high', 'Low', 'Low oxygen. Please contact a doctor soon, and urgently if you are breathless.');
    return mk('urgent', 'Very low', 'Very low oxygen.', 'Very low oxygen level. Get medical help now, especially if you are breathless, confused or have blue lips.');
  }
  if(e.m === 'temp'){
    if(e.v < 35) return mk('low', 'Low', 'Below the usual range. Re-check, and see a doctor if you feel cold, drowsy or unwell.');
    if(e.v <= 37.2) return mk('good', 'Normal', 'Within the usual body temperature range.');
    if(e.v < 38) return mk('borderline', 'Slightly raised', 'A little above normal. Rest, drink fluids and re-check in a few hours.');
    if(e.v < 40) return mk('high', 'Fever', 'You have a fever. See a doctor if it lasts more than 2 to 3 days, or sooner for infants, older adults or if you feel very unwell.');
    return mk('urgent', 'Very high fever', 'Very high temperature.', 'Very high fever. Get medical help now.');
  }
  if(e.m === 'weight') return mk('none', 'Logged');
  if(String(e.m).indexOf('c:') === 0){
    const info = dyMetricInfo(e.m);
    const hasMin = typeof info.min === 'number', hasMax = typeof info.max === 'number';
    if(hasMin && e.v < info.min) return mk('low', 'Below your range', 'Below the minimum you set ('+info.min+' '+dyEsc(info.unit)+').');
    if(hasMax && e.v > info.max) return mk('borderline', 'Above your range', 'Above the maximum you set ('+info.max+' '+dyEsc(info.unit)+').');
    if(hasMin || hasMax) return mk('good', 'In your range', 'Within the range you set.');
    return mk('none', 'Logged');
  }
  return mk('none', 'Logged');
}

/* ---------- reading text ---------- */
function dyValueText(e){
  const d = dyData();
  if(e.m === 'bp') return e.v+'/'+e.v2+' mmHg'+(e.p ? ' \u00b7 pulse '+e.p : '');
  if(e.m === 'sugar') return dySugarDisplay(e.v, d.prefs.sugarUnit)+' '+dySugarUnitLabel(d.prefs.sugarUnit);
  if(e.m === 'temp') return dyTempDisplay(e.v, d.prefs.tempUnit)+' '+dyTempUnitLabel(d.prefs.tempUnit);
  if(e.m === 'weight') return e.v+' kg';
  if(e.m === 'pulse') return e.v+' bpm';
  if(e.m === 'spo2') return e.v+'%';
  const info = dyMetricInfo(e.m); return e.v+(info.unit ? ' '+info.unit : '');
}
function dyContextText(e){ return e.m === 'sugar' ? (DY_SUGAR_CTX[e.ctx] || '') : ''; }

/* ---------- validation + add / edit / delete ---------- */
function dyValidate(m, f){
  const r = {ok:true, entry:null, error:''};
  const bad = msg => { r.ok = false; r.error = msg; return r; };
  const entry = {m};
  if(m === 'sugar'){
    let v = dyNum(f.v); if(isNaN(v)) return bad('Enter your blood sugar reading.');
    if(f.sugarUnit === 'mmol') v = v * DY_MGDL_PER_MMOL;
    v = Math.round(v);
    if(v < 20 || v > 800) return bad('That blood sugar looks out of range. Please check the number and the unit (mg/dL or mmol/L).');
    entry.v = v; entry.ctx = DY_SUGAR_CTX[f.ctx] ? f.ctx : 'random';
  } else if(m === 'bp'){
    const s = dyNum(f.v), di = dyNum(f.v2); if(isNaN(s) || isNaN(di)) return bad('Enter both numbers: the top (systolic) and bottom (diastolic).');
    if(s < 50 || s > 260 || di < 30 || di > 160) return bad('Those blood pressure numbers look out of range. Please check them.');
    if(s <= di) return bad('The top number (systolic) should be higher than the bottom number (diastolic).');
    entry.v = Math.round(s); entry.v2 = Math.round(di);
    if(f.p !== '' && f.p != null){ const p = dyNum(f.p); if(isNaN(p) || p < 25 || p > 220) return bad('That pulse looks out of range (25 to 220).'); entry.p = Math.round(p); }
  } else if(m === 'weight'){
    const v = dyNum(f.v); if(isNaN(v)) return bad('Enter your weight in kg.'); if(v < 2 || v > 400) return bad('That weight looks out of range (2 to 400 kg).');
    entry.v = dyRound(v, 1);
  } else if(m === 'pulse'){
    const v = dyNum(f.v); if(isNaN(v)) return bad('Enter your pulse in beats per minute.'); if(v < 25 || v > 220) return bad('That pulse looks out of range (25 to 220).');
    entry.v = Math.round(v);
  } else if(m === 'spo2'){
    const v = dyNum(f.v); if(isNaN(v)) return bad('Enter your oxygen level (%).'); if(v < 50 || v > 100) return bad('Oxygen level should be between 50 and 100%.');
    entry.v = dyRound(v, 0);
  } else if(m === 'temp'){
    let v = dyNum(f.v); if(isNaN(v)) return bad('Enter your temperature.');
    if(f.tempUnit === 'f') v = (v - 32) * 5 / 9;
    if(v < 30 || v > 45) return bad('That temperature looks out of range. Please check the number and the unit (\u00b0C or \u00b0F).');
    entry.v = dyRound(v, 1);
  } else if(String(m).indexOf('c:') === 0){
    const c = dyCustomById(String(m).slice(2)); if(!c) return bad('That measurement no longer exists.');
    const v = dyNum(f.v); if(isNaN(v)) return bad('Enter a number for '+c.name+'.'); if(Math.abs(v) > 1e9) return bad('That number is too large.');
    entry.v = typeof c.decimals === 'number' ? dyRound(v, c.decimals) : v;
  } else return bad('Unknown measurement.');

  const date = f.date || dyToday();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(dyParseIso(date).getTime())) return bad('Please choose a valid date.');
  if(date > dyToday()) return bad('The date cannot be in the future.');
  if(date < '2000-01-01') return bad('That date is too far in the past.');
  const tm = /^\d{2}:\d{2}$/.test(f.tm || '') ? f.tm : dyNowTime();
  if(date === dyToday() && tm > dyNowTime()) return bad('That time is in the future. Please choose a time that has already passed.');
  entry.d = date; entry.tm = tm;
  const note = String(f.note || '').trim().slice(0, 200); if(note) entry.note = note;
  r.entry = entry;
  return r;
}
// Adds (or, with an existing id, replaces) a reading. Returns {ok, error, entry, alert}.
function dyAddEntry(m, fields, editId){
  const res = dyValidate(m, fields);
  if(!res.ok) return res;
  const d = dyData();
  if(!editId && d.log.length >= DY_MAX_ENTRIES) return {ok:false, error:'Your diary is full ('+DY_MAX_ENTRIES+' readings). Please copy your summary for your doctor, then delete some old readings to make room.'};
  const e = res.entry; e.id = editId || dyId(); e.ts = Date.now();
  if(editId){ const i = d.log.findIndex(x => x.id === editId); if(i < 0) return {ok:false, error:'That reading no longer exists.'}; e.ts = d.log[i].ts || e.ts; d.log[i] = e; }
  else d.log.push(e);
  // remember units the person used, so the next reading opens in the same unit
  if(m === 'sugar' && (fields.sugarUnit === 'mgdl' || fields.sugarUnit === 'mmol')) d.prefs.sugarUnit = fields.sugarUnit;
  if(m === 'temp' && (fields.tempUnit === 'c' || fields.tempUnit === 'f')) d.prefs.tempUnit = fields.tempUnit;
  dySave(d);
  res.entry = e; res.alert = dyStatus(e).alert || '';
  try{ if(typeof audit === 'function') audit('patient', 'diary_'+(editId ? 'edit' : 'add'), m); }catch(err){}
  return res;
}
function dyDeleteById(id){
  const d = dyData(); const n = d.log.length; d.log = d.log.filter(x => x.id !== id);
  if(d.log.length !== n){ dySave(d); return true; } return false;
}

/* ---------- queries ---------- */
function dyEntriesOn(iso){ return dyData().log.filter(e => e.d === iso).sort((a, b) => (a.tm || '').localeCompare(b.tm || '')); }
function dyEntriesOf(m, days){
  const cutoff = dyIso(new Date(Date.now() - (days - 1) * 86400000));
  return dyData().log.filter(e => e.m === m && e.d >= cutoff).sort((a, b) => (a.d + (a.tm||'')).localeCompare(b.d + (b.tm||'')));
}
function dyWorstSev(list){ return list.reduce((w, e) => { const s = dyStatus(e).sev; return DY_SEV[s] > DY_SEV[w] ? s : w; }, 'none'); }
function dyStreak(){
  const days = new Set(dyData().log.map(e => e.d)); let n = 0; const t = new Date();
  if(!days.has(dyIso(t))) t.setDate(t.getDate() - 1);   // today may not be logged yet
  while(days.has(dyIso(t))){ n++; t.setDate(t.getDate() - 1); }
  return n;
}
function dyStats(m, days){
  const list = dyEntriesOf(m, days); if(!list.length) return null;
  const vals = list.map(e => e.v); const sum = vals.reduce((a, b) => a + b, 0);
  const good = list.filter(e => dyStatus(e).sev === 'good').length;
  const hasRange = list.some(e => dyStatus(e).sev !== 'none');
  const st = {count:list.length, avg:sum / vals.length, min:Math.min.apply(null, vals), max:Math.max.apply(null, vals), latest:list[list.length-1], first:list[0], inRangePct: hasRange ? Math.round(good / list.length * 100) : null};
  if(m === 'bp'){ st.avg2 = list.reduce((a, e) => a + e.v2, 0) / list.length; st.min2 = Math.min.apply(null, list.map(e => e.v2)); st.max2 = Math.max.apply(null, list.map(e => e.v2)); }
  return st;
}

/* ---------- main view ---------- */
function viewPatientDiary(){
  const d = dyData();
  return `
  ${viewHeader('Patient Console','Daily Health Diary &amp; Calendar','Log your blood sugar, blood pressure and other readings every day, see them on a calendar, spot trends, and show your doctor a clear summary. For awareness only: it does not diagnose or replace a doctor.')}
  ${typeof quickDrawer === 'function' ? quickDrawer('p-diary') : ''}
  <div class="card" id="dy-today"></div>
  <div class="card">
    <div class="cal-nav">
      <button onclick="dyChangeMonth(-1)" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>
      <span class="cal-month-label" id="dy-month-label"></span>
      <button onclick="dyChangeMonth(1)" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div class="cal-grid" style="margin-bottom:6px;">${['S','M','T','W','T','F','S'].map(x => `<div style="text-align:center;font-size:.7rem;color:var(--text-muted);font-weight:600;">${x}</div>`).join('')}</div>
    <div class="cal-grid" id="dy-cal"></div>
    <div class="cyc-legend">
      <span><i style="background:${DY_COLORS.good}"></i>In a healthy range</span>
      <span><i style="background:${DY_COLORS.borderline}"></i>Borderline</span>
      <span><i style="background:${DY_COLORS.high}"></i>High or out of range</span>
      <span><i style="background:${DY_COLORS.low}"></i>Low</span>
      <span><i style="background:${DY_COLORS.none}"></i>Logged, no range</span>
    </div>
  </div>
  <div class="card" id="dy-day"></div>
  <div class="card" id="dy-trends"></div>
  <div class="card" id="dy-share"></div>
  <div class="card" id="dy-settings"></div>
  <p style="color:var(--text-muted);font-size:.76rem;text-align:center;margin-top:4px;">Status labels use common adult reference ranges and are for general awareness. They are not a diagnosis. If a reading worries you, or you feel unwell, speak to a doctor. In an emergency, use SOS.</p>`;
}
function dyRenderAll(){
  if(!dyMonth){ const t = new Date(); dyMonth = {year:t.getFullYear(), month:t.getMonth()}; }
  if(!dySelected) dySelected = dyToday();
  dyRenderToday(); dyRenderCalendar(); dyRenderDay(); dyRenderTrends(); dyRenderShare(); dyRenderSettings();
}

/* ---------- today / quick log ---------- */
function dyAgo(iso){
  const days = Math.round((dyParseIso(dyToday()) - dyParseIso(iso)) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
}
function dyRenderToday(){
  const slot = document.getElementById('dy-today'); if(!slot) return;
  const d = dyData(); const todayN = d.log.filter(e => e.d === dyToday()).length; const streak = dyStreak();
  const chips = dyMetricKeys().map(k => {
    const info = dyMetricInfo(k); const last = d.log.filter(e => e.m === k).sort((a, b) => (b.d + (b.tm||'')).localeCompare(a.d + (a.tm||'')))[0];
    return `<button class="dy-chip" onclick="dyOpenLog('${dyEsc(k)}')"><span class="dy-chip-ico" style="background:${info.color}22;color:${info.color};"><i class="fa-solid ${info.icon}"></i></span>
      <span class="dy-chip-txt"><strong>${dyEsc(info.short)}</strong><small>${last ? dyEsc(dyValueText(last)) + ' \u00b7 ' + dyAgo(last.d) : 'Not logged yet'}</small></span><i class="fa-solid fa-plus dy-chip-plus"></i></button>`;
  }).join('');
  slot.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
      <h3 style="margin:0;"><i class="fa-solid fa-notes-medical" style="color:var(--brand-primary);"></i> Log a reading</h3>
      <div style="font-size:.8rem;color:var(--text-muted);">${todayN ? '<i class="fa-solid fa-circle-check" style="color:'+DY_COLORS.good+';"></i> '+todayN+' logged today' : 'Nothing logged today yet'}${streak >= 2 ? ' \u00b7 <i class="fa-solid fa-fire" style="color:#f97316;"></i> '+streak+'-day streak' : ''}</div>
    </div>
    <div class="dy-chips">${chips}<button class="dy-chip dy-chip-new" onclick="dyOpenCustom()"><span class="dy-chip-ico"><i class="fa-solid fa-plus"></i></span><span class="dy-chip-txt"><strong>New measurement</strong><small>Add your own, e.g. HbA1c, peak flow</small></span></button></div>
    ${d.log.length >= DY_WARN_ENTRIES ? `<p style="color:#f59e0b;font-size:.8rem;margin:10px 0 0;"><i class="fa-solid fa-triangle-exclamation"></i> Your diary is nearly full (${d.log.length} of ${DY_MAX_ENTRIES}). Copy your summary for your doctor, then delete old readings.</p>` : ''}`;
}

/* ---------- calendar ---------- */
function dyChangeMonth(delta){
  if(!dyMonth){ const t = new Date(); dyMonth = {year:t.getFullYear(), month:t.getMonth()}; }
  const d = new Date(dyMonth.year, dyMonth.month + delta, 1); dyMonth = {year:d.getFullYear(), month:d.getMonth()}; dyRenderCalendar();
}
function dySelectDay(iso){ dySelected = iso; dyRenderCalendar(); dyRenderDay(); const el = document.getElementById('dy-day'); if(el && el.scrollIntoView) try{ el.scrollIntoView({behavior:'smooth', block:'nearest'}); }catch(e){} }
function dyDotsFor(list){
  const bySev = {}; list.forEach(e => { const s = dyStatus(e).sev; bySev[s] = (bySev[s] || 0) + 1; });
  return Object.keys(bySev).sort((a, b) => DY_SEV[b] - DY_SEV[a]).slice(0, 3);
}
function dyRenderCalendar(){
  const grid = document.getElementById('dy-cal'); if(!grid) return;
  if(!dyMonth){ const t = new Date(); dyMonth = {year:t.getFullYear(), month:t.getMonth()}; }
  const {year, month} = dyMonth; const label = document.getElementById('dy-month-label');
  if(label) label.textContent = new Date(year, month, 1).toLocaleDateString('en-IN', {month:'long', year:'numeric'});
  const startDow = new Date(year, month, 1).getDay(); const dim = new Date(year, month + 1, 0).getDate(); const today = dyToday();
  const byDate = {}; dyData().log.forEach(e => { if(e.d.slice(0, 7) === year + '-' + String(month + 1).padStart(2, '0')) (byDate[e.d] = byDate[e.d] || []).push(e); });
  let cells = '';
  for(let i = 0; i < startDow; i++) cells += '<div class="cal-cell empty"></div>';
  for(let day = 1; day <= dim; day++){
    const iso = dyIso(new Date(year, month, day)); const list = byDate[iso] || []; const future = iso > today;
    const dots = dyDotsFor(list).map(s => `<span class="dy-dot" style="background:${DY_COLORS[s]};"></span>`).join('');
    cells += `<div class="cal-cell dy-cell ${iso === today ? 'today' : ''} ${iso === dySelected ? 'dy-selected' : ''} ${future ? 'dy-future' : ''}" role="button" tabindex="0" aria-label="${dyEsc(dyFmtDate(iso, true))}, ${list.length} readings" onclick="dySelectDay('${iso}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();dySelectDay('${iso}')}">${day}${dots ? `<span class="dy-dots">${dots}</span>` : ''}</div>`;
  }
  grid.innerHTML = cells;
}

/* ---------- selected day ---------- */
function dyEntryRowHTML(e){
  const info = dyMetricInfo(e.m); const st = dyStatus(e); const ctx = dyContextText(e);
  return `<div class="dy-row">
    <span class="dy-chip-ico" style="background:${info.color}22;color:${info.color};"><i class="fa-solid ${info.icon}"></i></span>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"><strong>${dyEsc(info.label)}</strong><span class="dy-badge" style="background:${st.color}22;color:${st.color};">${dyEsc(st.label)}</span></div>
      <div style="font-size:1.05rem;font-weight:700;margin:2px 0;">${dyEsc(dyValueText(e))}</div>
      <div style="font-size:.76rem;color:var(--text-muted);">${dyFmtTime(e.tm)}${ctx ? ' \u00b7 ' + dyEsc(ctx) : ''}${e.note ? ' \u00b7 \u201c' + dyEsc(e.note) + '\u201d' : ''}</div>
      ${st.alert ? `<div class="dy-alert"><i class="fa-solid fa-triangle-exclamation"></i> ${dyEsc(st.alert)} <button class="btn btn-danger btn-sm" style="margin-left:6px;" onclick="renderCurrentView('p-sos')">Open SOS</button></div>` : ''}
    </div>
    <div class="dy-row-actions"><button onclick="dyOpenLog('${dyEsc(e.m)}','${e.d}','${e.id}')" aria-label="Edit reading"><i class="fa-solid fa-pen"></i></button><button onclick="dyConfirmDelete('${e.id}')" aria-label="Delete reading"><i class="fa-solid fa-trash"></i></button></div>
  </div>`;
}
function dyRenderDay(){
  const slot = document.getElementById('dy-day'); if(!slot) return;
  const iso = dySelected || dyToday(); const list = dyEntriesOn(iso);
  slot.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
      <h3 style="margin:0;"><i class="fa-solid fa-calendar-day" style="color:var(--brand-primary);"></i> ${dyEsc(dyFmtDate(iso, true))}</h3>
      ${iso <= dyToday() ? `<button class="btn btn-secondary btn-sm" onclick="dyOpenPicker('${iso}')"><i class="fa-solid fa-plus"></i> Add a reading for this day</button>` : ''}</div>
    ${list.length ? list.map(dyEntryRowHTML).join('') : `<p style="color:var(--text-muted);margin:10px 0 0;">${iso > dyToday() ? 'This day has not happened yet.' : 'No readings logged for this day.'}</p>`}`;
}
function dyConfirmDelete(id){
  if(!window.confirm('Delete this reading? This cannot be undone.')) return;
  dyDeleteById(id); dyRenderAll(); if(typeof showToast === 'function') showToast('Reading deleted', '', 'info');
}
function dyOpenPicker(iso){
  const keys = dyMetricKeys();
  openModal(`<button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>Add a reading for ${dyEsc(dyFmtDate(iso))}</h3><p class="modal-sub">Which measurement?</p>
    <div class="dy-chips">${keys.map(k => { const info = dyMetricInfo(k); return `<button class="dy-chip" onclick="dyOpenLog('${dyEsc(k)}','${iso}')"><span class="dy-chip-ico" style="background:${info.color}22;color:${info.color};"><i class="fa-solid ${info.icon}"></i></span><span class="dy-chip-txt"><strong>${dyEsc(info.label)}</strong></span></button>`; }).join('')}</div>`);
}

/* ---------- add / edit modal ---------- */
function dyFieldsHTML(m, e){
  const d = dyData(); const v = e || {};
  const sugarUnit = d.prefs.sugarUnit, tempUnit = d.prefs.tempUnit;
  if(m === 'sugar'){
    const shown = e ? dySugarDisplay(e.v, sugarUnit) : '';
    return `<div class="form-group"><label>Blood sugar</label><div style="display:flex;gap:8px;"><input type="number" inputmode="decimal" class="dark-input" id="dy-f-v" step="${sugarUnit === 'mmol' ? '0.1' : '1'}" value="${shown}" oninput="dyPreview()" placeholder="e.g. ${sugarUnit === 'mmol' ? '5.6' : '100'}" style="flex:1;">
        <select class="dark-input" id="dy-f-su" onchange="dyPreview()" style="width:110px;"><option value="mgdl" ${sugarUnit === 'mgdl' ? 'selected' : ''}>mg/dL</option><option value="mmol" ${sugarUnit === 'mmol' ? 'selected' : ''}>mmol/L</option></select></div></div>
      <div class="form-group"><label>When was it taken?</label><select class="dark-input" id="dy-f-ctx" onchange="dyPreview()">${Object.keys(DY_SUGAR_CTX).map(k => `<option value="${k}" ${(v.ctx || 'fasting') === k ? 'selected' : ''}>${DY_SUGAR_CTX[k]}</option>`).join('')}</select></div>`;
  }
  if(m === 'bp') return `<div class="form-group"><label>Blood pressure (mmHg)</label><div style="display:flex;gap:8px;align-items:center;"><input type="number" inputmode="numeric" class="dark-input" id="dy-f-v" value="${v.v || ''}" placeholder="Top (systolic)" oninput="dyPreview()" style="flex:1;"><span>/</span><input type="number" inputmode="numeric" class="dark-input" id="dy-f-v2" value="${v.v2 || ''}" placeholder="Bottom (diastolic)" oninput="dyPreview()" style="flex:1;"></div></div>
      <div class="form-group"><label>Pulse (optional)</label><input type="number" inputmode="numeric" class="dark-input" id="dy-f-p" value="${v.p || ''}" placeholder="beats per minute"></div>`;
  if(m === 'weight') return `<div class="form-group"><label>Weight (kg)</label><input type="number" inputmode="decimal" step="0.1" class="dark-input" id="dy-f-v" value="${v.v || ''}" placeholder="e.g. 68.5"></div>`;
  if(m === 'pulse') return `<div class="form-group"><label>Resting pulse (beats per minute)</label><input type="number" inputmode="numeric" class="dark-input" id="dy-f-v" value="${v.v || ''}" oninput="dyPreview()" placeholder="e.g. 72"></div>`;
  if(m === 'spo2') return `<div class="form-group"><label>Oxygen level, SpO\u2082 (%)</label><input type="number" inputmode="numeric" class="dark-input" id="dy-f-v" value="${v.v || ''}" oninput="dyPreview()" placeholder="e.g. 98"></div>`;
  if(m === 'temp'){
    const shown = e ? dyTempDisplay(e.v, tempUnit) : '';
    return `<div class="form-group"><label>Temperature</label><div style="display:flex;gap:8px;"><input type="number" inputmode="decimal" step="0.1" class="dark-input" id="dy-f-v" value="${shown}" oninput="dyPreview()" placeholder="e.g. ${tempUnit === 'f' ? '98.6' : '37.0'}" style="flex:1;"><select class="dark-input" id="dy-f-tu" onchange="dyPreview()" style="width:90px;"><option value="c" ${tempUnit === 'c' ? 'selected' : ''}>\u00b0C</option><option value="f" ${tempUnit === 'f' ? 'selected' : ''}>\u00b0F</option></select></div></div>`;
  }
  const info = dyMetricInfo(m);
  return `<div class="form-group"><label>${dyEsc(info.label)}${info.unit ? ' (' + dyEsc(info.unit) + ')' : ''}</label><input type="number" inputmode="decimal" step="any" class="dark-input" id="dy-f-v" value="${v.v != null ? v.v : ''}" oninput="dyPreview()"></div>`;
}
function dyOpenLog(m, date, editId){
  dyEditingId = editId || null;
  const e = editId ? dyData().log.find(x => x.id === editId) : null;
  const info = dyMetricInfo(m);
  openModal(`<button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3><i class="fa-solid ${info.icon}" style="color:${info.color};"></i> ${editId ? 'Edit' : 'Log'} ${dyEsc(info.label)}</h3>
    <p class="modal-sub" id="dy-f-err" style="color:#ef4444;display:none;"></p>
    <input type="hidden" id="dy-f-m" value="${dyEsc(m)}">
    ${dyFieldsHTML(m, e)}
    <div style="display:flex;gap:8px;">
      <div class="form-group" style="flex:1;"><label>Date</label><input type="date" class="dark-input" id="dy-f-date" max="${dyToday()}" value="${dyEsc(e ? e.d : (date || dyToday()))}"></div>
      <div class="form-group" style="flex:1;"><label>Time</label><input type="time" class="dark-input" id="dy-f-tm" value="${dyEsc(e ? e.tm : dyNowTime())}"></div>
    </div>
    <div class="form-group"><label>Note (optional)</label><input type="text" class="dark-input" id="dy-f-note" maxlength="200" value="${dyEsc(e ? e.note || '' : '')}" placeholder="e.g. after a walk, missed morning tablet"></div>
    <div id="dy-f-preview" style="min-height:22px;margin-bottom:10px;"></div>
    <div style="display:flex;gap:8px;"><button class="btn" style="flex:1;" onclick="dySubmitLog()">${editId ? 'Save changes' : 'Save reading'}</button>${editId ? `<button class="btn btn-secondary" onclick="closeModal();dyConfirmDelete('${editId}')"><i class="fa-solid fa-trash"></i></button>` : ''}</div>`);
  if(e) dyPreview();
}
function dyReadFields(){
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  return {v:g('dy-f-v'), v2:g('dy-f-v2'), p:g('dy-f-p'), ctx:g('dy-f-ctx'), sugarUnit:g('dy-f-su') || dyData().prefs.sugarUnit, tempUnit:g('dy-f-tu') || dyData().prefs.tempUnit, date:g('dy-f-date'), tm:g('dy-f-tm'), note:g('dy-f-note')};
}
function dyPreview(){
  const box = document.getElementById('dy-f-preview'); if(!box) return;
  const m = (document.getElementById('dy-f-m') || {}).value; const f = dyReadFields();
  const probe = Object.assign({}, f, {date:dyToday(), tm:'00:00'});
  const r = dyValidate(m, probe);
  if(!r.ok || f.v === ''){ box.innerHTML = ''; return; }
  const st = dyStatus(r.entry);
  box.innerHTML = st.sev === 'none' ? '' : `<span class="dy-badge" style="background:${st.color}22;color:${st.color};">${dyEsc(st.label)}</span> <span style="font-size:.8rem;color:var(--text-muted);">${dyEsc(st.note)}</span>`;
}
function dySubmitLog(){
  const m = (document.getElementById('dy-f-m') || {}).value; const f = dyReadFields();
  const res = dyAddEntry(m, f, dyEditingId);
  if(!res.ok){ const err = document.getElementById('dy-f-err'); if(err){ err.textContent = res.error; err.style.display = 'block'; } return; }
  dySelected = res.entry.d; const dd = dyParseIso(res.entry.d); dyMonth = {year:dd.getFullYear(), month:dd.getMonth()};
  closeModal(); dyEditingId = null; dyRenderAll();
  if(typeof showToast === 'function'){
    if(res.alert) showToast('Please read this', res.alert, 'danger');
    else { const st = dyStatus(res.entry); showToast('Reading saved', dyValueText(res.entry) + (st.sev !== 'none' ? ' \u00b7 ' + st.label : ''), 'success'); }
  }
}

/* ---------- custom measurements ---------- */
function dyOpenCustom(id){
  const c = id ? dyCustomById(id) : null;
  openModal(`<button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>${c ? 'Edit' : 'New'} measurement</h3><p class="modal-sub">Track anything your doctor asks you to, such as HbA1c, peak flow, waist size or cholesterol. Set a healthy range if you were given one (optional).</p>
    <p class="modal-sub" id="dy-c-err" style="color:#ef4444;display:none;"></p>
    <div class="form-group"><label>Name</label><input type="text" class="dark-input" id="dy-c-name" maxlength="40" value="${dyEsc(c ? c.name : '')}" placeholder="e.g. HbA1c"></div>
    <div style="display:flex;gap:8px;"><div class="form-group" style="flex:1;"><label>Unit</label><input type="text" class="dark-input" id="dy-c-unit" maxlength="12" value="${dyEsc(c ? c.unit : '')}" placeholder="e.g. %"></div>
    <div class="form-group" style="flex:1;"><label>Decimals</label><select class="dark-input" id="dy-c-dec">${[0, 1, 2].map(n => `<option value="${n}" ${c && c.decimals === n ? 'selected' : (!c && n === 1 ? 'selected' : '')}>${n}</option>`).join('')}</select></div></div>
    <div style="display:flex;gap:8px;"><div class="form-group" style="flex:1;"><label>Healthy minimum (optional)</label><input type="number" step="any" class="dark-input" id="dy-c-min" value="${c && typeof c.min === 'number' ? c.min : ''}"></div>
    <div class="form-group" style="flex:1;"><label>Healthy maximum (optional)</label><input type="number" step="any" class="dark-input" id="dy-c-max" value="${c && typeof c.max === 'number' ? c.max : ''}"></div></div>
    <input type="hidden" id="dy-c-id" value="${dyEsc(id || '')}">
    <div style="display:flex;gap:8px;"><button class="btn" style="flex:1;" onclick="dySubmitCustom()">${c ? 'Save changes' : 'Add measurement'}</button></div>`);
}
function dyAddCustom(name, unit, min, max, decimals, editId){
  name = String(name || '').trim().slice(0, 40); unit = String(unit || '').trim().slice(0, 12);
  if(!name) return {ok:false, error:'Please give the measurement a name.'};
  const d = dyData();
  if(d.custom.length >= 20 && !editId) return {ok:false, error:'You can have up to 20 custom measurements.'};
  if(d.custom.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editId) || Object.keys(DY_BUILTIN).some(k => DY_BUILTIN[k].label.toLowerCase() === name.toLowerCase())) return {ok:false, error:'You already have a measurement with that name.'};
  const mn = (min === '' || min == null) ? null : dyNum(min), mx = (max === '' || max == null) ? null : dyNum(max);
  if((mn !== null && isNaN(mn)) || (mx !== null && isNaN(mx))) return {ok:false, error:'The healthy range must be numbers.'};
  if(mn !== null && mx !== null && mn >= mx) return {ok:false, error:'The healthy minimum must be lower than the maximum.'};
  const rec = {id:editId || dyId(), name, unit, decimals:[0, 1, 2].includes(+decimals) ? +decimals : 1};
  if(mn !== null) rec.min = mn; if(mx !== null) rec.max = mx;
  if(editId){ const i = d.custom.findIndex(c => c.id === editId); if(i < 0) return {ok:false, error:'That measurement no longer exists.'}; d.custom[i] = rec; } else d.custom.push(rec);
  dySave(d); return {ok:true, custom:rec};
}
function dySubmitCustom(){
  const g = id => (document.getElementById(id) || {}).value;
  const res = dyAddCustom(g('dy-c-name'), g('dy-c-unit'), g('dy-c-min'), g('dy-c-max'), g('dy-c-dec'), g('dy-c-id') || null);
  if(!res.ok){ const err = document.getElementById('dy-c-err'); if(err){ err.textContent = res.error; err.style.display = 'block'; } return; }
  closeModal(); dyRenderAll(); if(typeof showToast === 'function') showToast('Measurement saved', res.custom.name, 'success');
}
function dyDeleteCustom(id){
  const c = dyCustomById(id); if(!c) return;
  const n = dyData().log.filter(e => e.m === 'c:' + id).length;
  if(!window.confirm('Delete "' + c.name + '"' + (n ? ' and its ' + n + ' reading' + (n > 1 ? 's' : '') : '') + '? This cannot be undone.')) return;
  const d = dyData(); d.custom = d.custom.filter(x => x.id !== id); d.log = d.log.filter(e => e.m !== 'c:' + id); dySave(d);
  if(dyTrendMetric === 'c:' + id) dyTrendMetric = null; dyRenderAll();
}

/* ---------- trends ---------- */
function dyBand(m){
  if(m === 'sugar') return [70, 140]; if(m === 'bp') return [90, 120]; if(m === 'pulse') return [60, 100]; if(m === 'spo2') return [95, 100]; if(m === 'temp') return [36.1, 37.2];
  if(String(m).indexOf('c:') === 0){ const i = dyMetricInfo(m); if(typeof i.min === 'number' && typeof i.max === 'number') return [i.min, i.max]; }
  return null;
}
function dyTimeOf(e){ const tm = e.tm || '12:00'; return dyParseIso(e.d).getTime() + ((parseInt(tm.slice(0, 2), 10) || 0) * 60 + (parseInt(tm.slice(3, 5), 10) || 0)) * 60000; }
function dyChartSVG(m, list){
  const W = 420, H = 240, L = 42, R = 12, T = 14, B = 32;
  const series = [{color:dyMetricInfo(m).color, get:e => e.v, main:true}];
  if(m === 'bp') series.push({color:'#a78bfa', get:e => e.v2, main:false});
  const band = dyBand(m); const t0 = dyTimeOf(list[0]), t1 = dyTimeOf(list[list.length - 1]); const span = Math.max(t1 - t0, 3600000);
  const ys = []; series.forEach(s => list.forEach(e => ys.push(s.get(e)))); if(band) ys.push(band[0], band[1]);
  let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys); if(hi === lo){ hi += 1; lo -= 1; } const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const X = t => list.length === 1 ? L + (W - L - R) / 2 : L + (t - t0) / span * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${dyEsc(dyMetricInfo(m).label)} trend, ${list.length} readings" style="max-width:100%;height:auto;display:block;">`;
  if(band) svg += `<rect x="${L}" y="${Y(band[1]).toFixed(1)}" width="${W - L - R}" height="${Math.max(2, Y(band[0]) - Y(band[1])).toFixed(1)}" fill="${DY_COLORS.good}" opacity=".13"/>`;
  for(let i = 0; i <= 4; i++){ const v = lo + (hi - lo) * i / 4, y = Y(v); svg += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" opacity=".1"/><text x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--text-muted)">${Math.abs(hi - lo) > 20 ? Math.round(v) : dyRound(v, 1)}</text>`; }
  (list.length === 1 ? [0] : [0, 1, 2, 3]).forEach(i => { const t = list.length === 1 ? t0 : t0 + span * i / 3; const anchor = list.length === 1 ? 'middle' : (i === 0 ? 'start' : i === 3 ? 'end' : 'middle'); svg += `<text x="${X(t).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" font-size="13" fill="var(--text-muted)">${dyEsc(new Date(t).toLocaleDateString('en-IN', {day:'numeric', month:'short'}))}</text>`; });
  series.forEach(s => {
    const pts = list.map(e => [X(dyTimeOf(e)), Y(s.get(e))]);
    if(list.length > 1) svg += `<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="${s.main ? 1 : .75}"/>`;
    list.forEach((e, i) => { svg += `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="4" fill="${s.main ? DY_COLORS[dyStatus(e).sev] : s.color}" stroke="var(--bg-card, #fff)" stroke-width="1.5"><title>${dyEsc(dyFmtDate(e.d) + ' ' + dyFmtTime(e.tm) + ': ' + dyValueText(e))}</title></circle>`; });
  });
  return svg + '</svg>';
}
function dySetTrend(m){ dyTrendMetric = m; dyRenderTrends(); }
function dySetTrendDays(n){ dyTrendDays = n; dyRenderTrends(); }
function dyStatsHTML(m, st){
  const cell = (label, val) => `<div class="dy-stat"><small>${label}</small><strong>${val}</strong></div>`;
  const f = x => m === 'bp' ? x : (m === 'sugar' ? dySugarDisplay(x, dyData().prefs.sugarUnit) : m === 'temp' ? dyTempDisplay(x, dyData().prefs.tempUnit) : dyRound(x, 1));
  const unit = m === 'sugar' ? ' ' + dySugarUnitLabel(dyData().prefs.sugarUnit) : m === 'temp' ? ' ' + dyTempUnitLabel(dyData().prefs.tempUnit) : (dyMetricInfo(m).unit ? ' ' + dyMetricInfo(m).unit : '');
  if(m === 'bp') return cell('Average', Math.round(st.avg) + '/' + Math.round(st.avg2)) + cell('Highest top', st.max) + cell('Lowest top', st.min) + cell('Readings', st.count) + (st.inRangePct != null ? cell('In healthy range', st.inRangePct + '%') : '');
  return cell('Average', dyEsc(String(f(st.avg)) + unit)) + cell('Lowest', dyEsc(String(f(st.min)) + unit)) + cell('Highest', dyEsc(String(f(st.max)) + unit)) + cell('Readings', st.count) + (st.inRangePct != null ? cell('In healthy range', st.inRangePct + '%') : '');
}
function dyRenderTrends(){
  const slot = document.getElementById('dy-trends'); if(!slot) return;
  const d = dyData(); const withData = dyMetricKeys().filter(k => d.log.some(e => e.m === k));
  if(!withData.length){
    slot.innerHTML = `<h3 style="margin-top:0;"><i class="fa-solid fa-chart-line" style="color:var(--brand-primary);"></i> Trends</h3><p style="color:var(--text-muted);margin:0;">Log a few readings and your trends will appear here, with your healthy range shaded in green.</p>`; return;
  }
  if(!dyTrendMetric || !withData.includes(dyTrendMetric)) dyTrendMetric = withData[0];
  const m = dyTrendMetric; const list = dyEntriesOf(m, dyTrendDays); const st = dyStats(m, dyTrendDays);
  slot.innerHTML = `<h3 style="margin-top:0;"><i class="fa-solid fa-chart-line" style="color:var(--brand-primary);"></i> Trends</h3>
    <div class="dy-tabs">${withData.map(k => `<button class="dy-tab ${k === m ? 'on' : ''}" onclick="dySetTrend('${dyEsc(k)}')">${dyEsc(dyMetricInfo(k).short)}</button>`).join('')}</div>
    <div class="dy-tabs" style="margin-top:6px;">${[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']].map(r => `<button class="dy-tab sm ${r[0] === dyTrendDays ? 'on' : ''}" onclick="dySetTrendDays(${r[0]})">${r[1]}</button>`).join('')}</div>
    ${list.length ? `<div style="margin:12px 0 8px;overflow-x:auto;">${dyChartSVG(m, list)}</div>
      <div style="font-size:.74rem;color:var(--text-muted);margin-bottom:10px;">${dyBand(m) ? '<span style="display:inline-block;width:10px;height:10px;background:'+DY_COLORS.good+';opacity:.4;border-radius:2px;"></span> Usual range shaded. ' : ''}Dot colours match the calendar. Tap or hover a dot for the exact reading.</div>
      <div class="dy-stats">${dyStatsHTML(m, st)}</div>` : `<p style="color:var(--text-muted);margin:12px 0 0;">No ${dyEsc(dyMetricInfo(m).label.toLowerCase())} readings in this period. Try a longer range.</p>`}`;
}

/* ---------- share with a doctor ---------- */
function dyRenderShare(){
  const slot = document.getElementById('dy-share'); if(!slot) return;
  slot.innerHTML = `<h3 style="margin-top:0;"><i class="fa-solid fa-share-nodes" style="color:var(--brand-primary);"></i> Share with your doctor</h3>
    <p style="color:var(--text-muted);margin:0 0 12px;font-size:.88rem;">Make a clear summary of your readings to show at your next visit. Nothing is sent anywhere: you choose whether to copy, print or share it.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(r => `<button class="btn btn-secondary btn-sm" onclick="dyOpenSummary(${r[0]})"><i class="fa-solid fa-file-lines"></i> ${r[1]}</button>`).join('')}</div>`;
}
function dySummaryText(days){
  const d = dyData(); const profile = (typeof db === 'function' && db('profile')) || {}; const to = dyToday(); const from = dyIso(new Date(Date.now() - (days - 1) * 86400000));
  const lines = ['HEALTH DIARY SUMMARY', (profile.name ? profile.name + ' \u00b7 ' : '') + dyFmtDate(from) + ' to ' + dyFmtDate(to), 'Self-recorded at home. For discussion with a doctor. Not a diagnosis.', ''];
  let any = false;
  dyMetricKeys().forEach(k => {
    const st = dyStats(k, days); if(!st) return; any = true; const info = dyMetricInfo(k);
    lines.push(info.label.toUpperCase() + ' (' + st.count + ' reading' + (st.count > 1 ? 's' : '') + ')');
    if(k === 'bp') lines.push('  Average ' + Math.round(st.avg) + '/' + Math.round(st.avg2) + ' mmHg, top number ranged ' + st.min + ' to ' + st.max + '; ' + (st.inRangePct != null ? st.inRangePct + '% in the healthy range' : ''));
    else { const fmt = x => k === 'sugar' ? dySugarDisplay(x, d.prefs.sugarUnit) : k === 'temp' ? dyTempDisplay(x, d.prefs.tempUnit) : String(dyRound(x, 1)); const u = k === 'sugar' ? dySugarUnitLabel(d.prefs.sugarUnit) : k === 'temp' ? dyTempUnitLabel(d.prefs.tempUnit) : info.unit; lines.push('  Average ' + fmt(st.avg) + ' ' + u + ', lowest ' + fmt(st.min) + ', highest ' + fmt(st.max) + (st.inRangePct != null ? '; ' + st.inRangePct + '% in the healthy range' : '')); }
    dyEntriesOf(k, days).slice(-30).forEach(e => { const s = dyStatus(e); lines.push('  ' + dyFmtDate(e.d) + ' ' + dyFmtTime(e.tm) + '  ' + dyValueText(e) + (dyContextText(e) ? ' (' + dyContextText(e) + ')' : '') + (s.sev !== 'none' ? '  [' + s.label + ']' : '') + (e.note ? '  - ' + e.note : '')); });
    lines.push('');
  });
  if(!any) lines.push('No readings were logged in this period.');
  lines.push('Generated by ArogyaBot on ' + dyFmtDate(to) + '.');
  return lines.join('\n');
}
let dySummaryDays = 30;
function dyOpenSummary(days){
  dySummaryDays = days || 30; const text = dySummaryText(dySummaryDays);
  openModal(`<button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>Summary for your doctor</h3><p class="modal-sub">Last ${dySummaryDays} days. Check it, then copy, share or print.</p>
    <pre id="dy-summary-pre" class="dy-pre">${dyEsc(text)}</pre>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;"><button class="btn" onclick="dyCopySummary()"><i class="fa-solid fa-copy"></i> Copy</button>
    ${typeof navigator !== 'undefined' && navigator.share ? '<button class="btn btn-secondary" onclick="dyShareSummary()"><i class="fa-solid fa-share-nodes"></i> Share</button>' : ''}
    <button class="btn btn-secondary" onclick="dyPrintSummary()"><i class="fa-solid fa-print"></i> Print</button></div>`);
}
function dyCopySummary(){
  const text = dySummaryText(dySummaryDays);
  const done = () => { if(typeof showToast === 'function') showToast('Copied', 'Paste it into a message or document.', 'success'); };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => dySelectSummary());
  else dySelectSummary();
}
function dySelectSummary(){ const pre = document.getElementById('dy-summary-pre'); if(pre && window.getSelection){ const r = document.createRange(); r.selectNodeContents(pre); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } if(typeof showToast === 'function') showToast('Press and hold to copy', 'The summary is selected.', 'info'); }
function dyShareSummary(){ try{ navigator.share({title:'My health diary summary', text:dySummaryText(dySummaryDays)}).catch(() => {}); }catch(e){} }
function dyPrintSummary(){
  const w = window.open('', '_blank');
  if(!w){ if(typeof showToast === 'function') showToast('Could not open the print view', 'Use Copy instead and paste into a document.', 'info'); return; }
  w.document.write('<!doctype html><title>Health diary summary</title><body style="font-family:system-ui,Arial,sans-serif;padding:24px;"><pre style="white-space:pre-wrap;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;">' + dyEsc(dySummaryText(dySummaryDays)) + '</pre></body>');
  w.document.close(); try{ w.focus(); w.print(); }catch(e){}
}

/* ---------- settings ---------- */
function dySetPref(k, v){ const d = dyData(); if(k === 'sugarUnit' && (v === 'mgdl' || v === 'mmol')) d.prefs.sugarUnit = v; if(k === 'tempUnit' && (v === 'c' || v === 'f')) d.prefs.tempUnit = v; dySave(d); dyRenderAll(); }
function dyClearAll(){
  const d = dyData(); if(!d.log.length && !d.custom.length) return;
  if(!window.confirm('Delete ALL ' + d.log.length + ' diary readings and your custom measurements for this person? This cannot be undone.')) return;
  dySave(dyBlank()); dyTrendMetric = null; dyRenderAll(); if(typeof showToast === 'function') showToast('Diary cleared', '', 'info');
}
function dyRenderSettings(){
  const slot = document.getElementById('dy-settings'); if(!slot) return;
  const d = dyData();
  const seg = (k, opts, cur) => `<div class="dy-tabs">${opts.map(o => `<button class="dy-tab sm ${o[0] === cur ? 'on' : ''}" onclick="dySetPref('${k}','${o[0]}')">${o[1]}</button>`).join('')}</div>`;
  slot.innerHTML = `<h3 style="margin-top:0;"><i class="fa-solid fa-sliders" style="color:var(--brand-primary);"></i> Settings</h3>
    <div style="display:grid;gap:14px;">
      <div><div class="dy-set-label">Blood sugar unit</div>${seg('sugarUnit', [['mgdl', 'mg/dL'], ['mmol', 'mmol/L']], d.prefs.sugarUnit)}</div>
      <div><div class="dy-set-label">Temperature unit</div>${seg('tempUnit', [['c', '\u00b0C'], ['f', '\u00b0F']], d.prefs.tempUnit)}</div>
      <div><div class="dy-set-label">Your own measurements</div>
        ${d.custom.length ? d.custom.map(c => `<div class="dy-row" style="padding:8px 0;"><div style="flex:1;"><strong>${dyEsc(c.name)}</strong> <small style="color:var(--text-muted);">${dyEsc(c.unit || '')}${(typeof c.min === 'number' || typeof c.max === 'number') ? ' \u00b7 range ' + (typeof c.min === 'number' ? c.min : '\u2026') + ' to ' + (typeof c.max === 'number' ? c.max : '\u2026') : ''}</small></div><div class="dy-row-actions"><button onclick="dyOpenCustom('${c.id}')" aria-label="Edit"><i class="fa-solid fa-pen"></i></button><button onclick="dyDeleteCustom('${c.id}')" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></div></div>`).join('') : '<p style="color:var(--text-muted);margin:4px 0 8px;font-size:.85rem;">None yet.</p>'}
        <button class="btn btn-secondary btn-sm" onclick="dyOpenCustom()"><i class="fa-solid fa-plus"></i> Add a measurement</button></div>
      <div><div class="dy-set-label">Privacy</div><p style="color:var(--text-muted);margin:0 0 8px;font-size:.82rem;">Your diary is private to your account and is kept separately for each family member. Only you can see it unless you copy or print a summary.</p>
        <button class="btn btn-secondary btn-sm" style="color:#ef4444;" onclick="dyClearAll()"><i class="fa-solid fa-trash"></i> Delete all diary data</button></div>
    </div>`;
}
