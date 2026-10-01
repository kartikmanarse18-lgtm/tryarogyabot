/* ============================================================
   PATIENT — WOMEN'S HEALTH (with PIN lock)
   ============================================================ */
/* ---------- data helpers ---------- */
// Whether the Women's Health PIN has been unlocked THIS SESSION. Deliberately kept in memory only
// (never written to db/localStorage) so it can't stay "unlocked" forever across logouts, browser
// restarts, or after switching to a different family member's profile on a shared device.
let cycSessionUnlocked = false;
function cycRoot(){ const c = db('cycle'); if(!c.entries) c.entries={}; return c; }
function cycEntry(){
  const c = cycRoot();
  const pid = currentPatientId();
  if(!c.entries[pid]) c.entries[pid] = {days:{}, avgCycleLenOverride:null, avgPeriodLenOverride:null, mode:'track', onBirthControl:false, tempUnit:'C', reminderOn:false, reminderDays:2, customSymptoms:[]};
  // backfill fields for entries created before these features existed
  const e = c.entries[pid];
  if(e.mode===undefined) e.mode='track';
  if(e.onBirthControl===undefined) e.onBirthControl=false;
  if(e.tempUnit===undefined) e.tempUnit='C';
  if(e.reminderOn===undefined) e.reminderOn=false;
  if(e.reminderDays===undefined) e.reminderDays=2;
  if(!e.customSymptoms) e.customSymptoms=[];
  return e;
}
function cycSaveEntry(entry){ const c = cycRoot(); c.entries[currentPatientId()] = entry; dbSet('cycle', c); }
const CYC_BASE_SYMPTOMS = ['Cramps','Headache','Bloating','Backache','Breast tenderness','Acne','Fatigue','Nausea','Mood swings','Food cravings','Tender joints','Trouble sleeping'];
function cycAllSymptoms(entry){ return [...CYC_BASE_SYMPTOMS, ...((entry && entry.customSymptoms) || [])]; }
const CYC_MOODS = [{k:'happy',e:'😊',l:'Happy'},{k:'calm',e:'😌',l:'Calm'},{k:'tired',e:'😴',l:'Tired'},{k:'irritable',e:'😠',l:'Irritable'},{k:'anxious',e:'😰',l:'Anxious'},{k:'sad',e:'😢',l:'Sad'}];
// 'spotting' is intentionally excluded from period-episode math (see cycEpisodes) so a single
// spotting day mid-cycle can't be mistaken for a new period and skew cycle-length predictions.
const CYC_FLOWS = [{k:'',l:'None'},{k:'spotting',l:'Spotting'},{k:'light',l:'Light'},{k:'medium',l:'Medium'},{k:'heavy',l:'Heavy'}];
const CYC_PERIOD_FLOWS = ['light','medium','heavy'];
const CYC_MUCUS = [{k:'',l:'—'},{k:'dry',l:'Dry'},{k:'sticky',l:'Sticky'},{k:'creamy',l:'Creamy'},{k:'watery',l:'Watery'},{k:'eggwhite',l:'Egg-white (fertile)'}];
const CYC_LH = [{k:'',l:'Not tested'},{k:'negative',l:'Negative'},{k:'high',l:'High'},{k:'peak',l:'Peak (positive)'}];
const CYC_MODES = [
  {k:'track', icon:'fa-solid fa-calendar-check', l:'Just tracking'},
  {k:'ttc', icon:'fa-solid fa-seedling', l:'Trying to conceive'},
  {k:'avoid', icon:'fa-solid fa-shield-heart', l:'Avoiding pregnancy'},
  {k:'pregnant', icon:'fa-solid fa-baby', l:'Pregnant'},
  {k:'perimenopause', icon:'fa-solid fa-leaf', l:'Perimenopause'},
];
function isoDay(d){ return d.toISOString().slice(0,10); }
function addDays(d,n){ return new Date(d.getTime()+n*86400000); }
// group logged flow-days into consecutive-day period episodes, sorted oldest -> newest.
// Only "real" period flow (light/medium/heavy) counts here — spotting is logged and shown
// on the calendar, but never treated as a period start, so mid-cycle spotting can't skew predictions.
function cycEpisodes(entry){
  const dates = Object.keys(entry.days).filter(d=>entry.days[d].flow && CYC_PERIOD_FLOWS.includes(entry.days[d].flow)).sort();
  const episodes = [];
  let cur = null;
  dates.forEach(d=>{
    const dt = new Date(d+'T00:00:00');
    if(cur && (dt - new Date(cur.end+'T00:00:00'))/86400000 <= 1.5){ cur.end = d; cur.days.push(d); }
    else { cur = {start:d, end:d, days:[d]}; episodes.push(cur); }
  });
  return episodes;
}
function cycStats(entry){
  const episodes = cycEpisodes(entry);
  const starts = episodes.map(e=>new Date(e.start+'T00:00:00'));
  const cycleLens = [];
  for(let i=1;i<starts.length;i++) cycleLens.push(Math.round((starts[i]-starts[i-1])/86400000));
  // ignore implausible gaps (e.g. months of missed logging) when computing the average, but keep them in history
  const plausible = cycleLens.filter(n=>n>=15 && n<=90);
  const recentLens = (plausible.length ? plausible : cycleLens).slice(-6);
  const avgCycleLen = entry.avgCycleLenOverride || (recentLens.length ? Math.round(recentLens.reduce((a,b)=>a+b,0)/recentLens.length) : 28);
  const periodLens = episodes.map(e=>e.days.length);
  const recentPLens = periodLens.slice(-6);
  const avgPeriodLen = entry.avgPeriodLenOverride || (recentPLens.length ? Math.round(recentPLens.reduce((a,b)=>a+b,0)/recentPLens.length) : 5);
  let regularity = 'Not enough data yet';
  if(recentLens.length>=2){
    const mean = recentLens.reduce((a,b)=>a+b,0)/recentLens.length;
    const variance = recentLens.reduce((a,b)=>a+Math.pow(b-mean,2),0)/recentLens.length;
    const sd = Math.sqrt(variance);
    regularity = sd<=3 ? 'Regular' : sd<=6 ? 'Slightly irregular' : 'Irregular';
  }
  const minLen = recentLens.length ? Math.min(...recentLens) : null;
  const maxLen = recentLens.length ? Math.max(...recentLens) : null;
  return {episodes, cycleLens, avgCycleLen, avgPeriodLen, regularity, cyclesTracked: episodes.length, minLen, maxLen};
}
function cycWindowFor(start, cycleLen){
  const lutealPhase = 14; // typical luteal phase length; the follicular phase is what actually varies cycle to cycle
  const ovulation = addDays(start, -lutealPhase);
  return {start, ovulation, fertileStart: addDays(ovulation,-5), fertileEnd: addDays(ovulation,1)};
}
function cycPredict(entry, stats){
  const episodes = stats.episodes;
  if(!episodes.length) return null;
  const lastStart = new Date(episodes[episodes.length-1].start+'T00:00:00');
  const nextStart = addDays(lastStart, stats.avgCycleLen);
  const futureStarts = [nextStart, addDays(nextStart, stats.avgCycleLen), addDays(nextStart, stats.avgCycleLen*2)];
  const futureWindows = futureStarts.map(fs=>cycWindowFor(fs, stats.avgCycleLen));
  const w0 = futureWindows[0];
  const today = new Date(); today.setHours(0,0,0,0);
  const overdueDays = Math.round((today - nextStart)/86400000);
  return {lastStart, nextStart, ovulation:w0.ovulation, fertileStart:w0.fertileStart, fertileEnd:w0.fertileEnd, futureStarts, futureWindows, overdueDays};
}
function cycPhaseToday(entry, stats, pred){
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = isoDay(today);
  const inLoggedPeriod = entry.days[todayStr] && entry.days[todayStr].flow;
  if(!pred) return {phase: inLoggedPeriod ? 'Menstrual' : 'Log a period to see your phase', cycleDay: null, pct:0, daysToNext:null};
  const cycleDay = Math.round((today - pred.lastStart)/86400000) + 1;
  const daysToNext = Math.round((pred.nextStart - today)/86400000);
  let phase = 'Follicular';
  if(inLoggedPeriod || (cycleDay>=1 && cycleDay<=stats.avgPeriodLen)) phase='Menstrual';
  else if(today>=pred.fertileStart && today<=pred.fertileEnd) phase='Fertile window';
  else if(daysToNext<=5 && daysToNext>=0) phase='Late luteal (PMS likely)';
  const pct = Math.max(0, Math.min(100, Math.round(((cycleDay-1)/stats.avgCycleLen)*100)));
  return {phase, cycleDay, pct, daysToNext};
}
// Basal body temperature: a sustained rise of ~0.2°C+ above the prior baseline, held for 2+ days,
// is the classic sign ovulation has already happened (this is what BBT charting is for in real trackers).
function cycBBTConfirmedOvulation(entry){
  const dates = Object.keys(entry.days).filter(d=>entry.days[d].bbt!=null).sort();
  if(dates.length<8) return null;
  for(let i=6;i<dates.length-1;i++){
    const prior = dates.slice(Math.max(0,i-6),i).map(d=>entry.days[d].bbt);
    if(prior.length<4) continue;
    const baseline = prior.reduce((a,b)=>a+b,0)/prior.length;
    const t1 = entry.days[dates[i]].bbt, t2 = entry.days[dates[i+1]].bbt;
    if(t1>=baseline+0.2 && t2>=baseline+0.15) return {date:dates[i], baseline:Math.round(baseline*100)/100};
  }
  return null;
}
// symptom frequency by cycle phase, for the "Patterns" insight card — helps a person notice e.g.
// "Bloating shows up almost every luteal phase" the way Flo/Clue's cycle-insights features do.
function cycSymptomInsights(entry, stats){
  const counts = {};
  const phaseTotals = {Menstrual:0, Follicular:0, 'Fertile window':0, 'Late luteal (PMS likely)':0};
  Object.keys(entry.days).forEach(d=>{
    const day = entry.days[d];
    if(!day.symptoms || !day.symptoms.length) return;
    // approximate the phase that date fell in using its position within the nearest period episode
    const dt = new Date(d+'T00:00:00');
    let phase = null;
    for(let i=0;i<stats.episodes.length;i++){
      const start = new Date(stats.episodes[i].start+'T00:00:00');
      const nextStart = i+1<stats.episodes.length ? new Date(stats.episodes[i+1].start+'T00:00:00') : addDays(start, stats.avgCycleLen);
      if(dt>=start && dt<nextStart){
        const day0 = Math.round((dt-start)/86400000)+1;
        const lutealStart = stats.avgCycleLen - 12;
        if(day0<=stats.avgPeriodLen) phase='Menstrual';
        else if(day0>=lutealStart) phase='Late luteal (PMS likely)';
        else if(day0>=Math.round(stats.avgCycleLen/2)-3 && day0<=Math.round(stats.avgCycleLen/2)+2) phase='Fertile window';
        else phase='Follicular';
        break;
      }
    }
    if(!phase) return;
    phaseTotals[phase] = (phaseTotals[phase]||0)+1;
    day.symptoms.forEach(s=>{
      counts[s] = counts[s]||{total:0, byPhase:{}};
      counts[s].total++;
      counts[s].byPhase[phase] = (counts[s].byPhase[phase]||0)+1;
    });
  });
  const ranked = Object.keys(counts).map(s=>{
    const c = counts[s];
    const topPhase = Object.keys(c.byPhase).sort((a,b)=>c.byPhase[b]-c.byPhase[a])[0];
    return {symptom:s, total:c.total, topPhase};
  }).sort((a,b)=>b.total-a.total).slice(0,6);
  return ranked;
}
// in-app "period coming up" reminder — there's no push-notification channel in this build, so this
// surfaces as a banner in Women's Health itself once the person is inside the reminder window they set.
function cycReminderBanner(entry, pred){
  if(!entry.reminderOn || !pred) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const daysAway = Math.round((pred.nextStart-today)/86400000);
  if(daysAway<0 || daysAway>entry.reminderDays) return '';
  return `<div class="redflag-box" style="margin-bottom:18px;background:rgba(13,148,136,.08);border-color:rgba(13,148,136,.3);"><b style="color:var(--brand-primary);"><i class="fa-solid fa-bell"></i> Reminder:</b> your period is predicted to start ${daysAway===0?'<strong>today</strong>':`in <strong>${daysAway} day${daysAway===1?'':'s'}</strong>`}. Good time to stock up on supplies.</div>`;
}
