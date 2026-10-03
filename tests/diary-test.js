/* Daily Health Diary & Calendar — logic, validation, calendar, trends, summary, privacy, and "nothing old was touched". */
process.env.TZ='Asia/Kolkata';   // so a UTC-vs-local date bug (off by one around midnight in India) would be caught
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');
const root=path.resolve(process.argv[2]);
class L extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''))}}
(async()=>{
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};w.confirm=()=>true;}});
  const w=dom.window;await new Promise(r=>setTimeout(r,1500));
  let fails=0;const ok=(n,c)=>{console.log((c?'  PASS  ':'  FAIL  ')+n);if(!c)fails++;};
  const ev=s=>{try{return w.eval(s)}catch(e){console.log('   (eval error: '+e.message+')');return undefined}};
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const day=(n)=>ev(`dyIso(new Date(Date.now()-${n}*86400000))`);   // n days ago, local date
  const add=(m,fl,id)=>ev(`dyAddEntry(${JSON.stringify(m)},${JSON.stringify(fl)},${id?JSON.stringify(id):'null'})`);
  const reset=()=>ev(`dySave(dyBlank())`);

  // ---------- wiring
  ok('index.html loads the diary script before main.js',html.indexOf('health-diary.js')>-1&&html.indexOf('health-diary.js')<html.indexOf('js/main.js'));
  ok('index.html links the diary stylesheet',html.includes('css/health-diary.css'));
  ok('sw.js caches the diary script and stylesheet',sw.includes('./js/modules/patient/health-diary.js')&&sw.includes('./css/health-diary.css'));
  ok('sw.js CACHE_VERSION is v11 or newer',(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=11);
  ok("'diary' is a private per-account storage key",ev("PRIVATE_ACCOUNT_KEYS.includes('diary')"));
  ok('all old private keys are still present',['fitness','cycle','pregnancy','nutrition','vitals','medsTools','documents','reminders','claims','insurance','abdm'].every(k=>ev(`PRIVATE_ACCOUNT_KEYS.includes('${k}')`)));
  ok('patient nav has Health Diary right after Vitals',(()=>{const n=ev('SIDENAV.patient.map(i=>i.id)')||[];return n.indexOf('p-diary')===n.indexOf('p-vitals')+1&&n.indexOf('p-vitals')>-1;})());
  ok('view dispatch knows p-diary',fs.readFileSync(path.join(root,'js/shell/view-dispatch.js'),'utf8').includes("'p-diary': viewPatientDiary"));
  ok('old screens untouched: vitals, women, bp and sugar classifiers still exist',['viewPatientVitals','renderCycleCalendar','bpCategory','sugarCategory','viewPatientFitness'].every(n=>typeof ev(n)==='function'));
  ok('Vitals screen still renders',(ev('viewPatientVitals()')||'').includes('Blood Pressure (BP) Category Checker'));

  // ---------- dates are LOCAL (India is UTC+5:30)
  ok('local-date helper is correct just after midnight in India',ev("dyIso(new Date(2026,9,3,0,30))")==='2026-10-03');

  // ---------- blood sugar
  reset();
  let r=add('sugar',{v:'85',ctx:'fasting',date:day(0),tm:'00:00'});
  ok('sugar: fasting 85 saved, status Normal (green)',r.ok&&ev(`dyStatus(${JSON.stringify(r.entry)})`).label==='Normal'&&ev(`dyStatus(${JSON.stringify(r.entry)})`).sev==='good');
  r=add('sugar',{v:'112',ctx:'fasting',date:day(0),tm:'00:01'});ok('sugar: fasting 112 = Prediabetes (amber), same wording as the Vitals screen',ev(`dyStatus(${JSON.stringify(r.entry)})`).label==='Prediabetes'&&ev(`dyStatus(${JSON.stringify(r.entry)})`).sev==='borderline'&&ev("sugarCategory('fasting',112).label")==='Prediabetes');
  r=add('sugar',{v:'150',ctx:'post',date:day(0),tm:'00:02'});ok('sugar: 2h after meal 150 = Prediabetes',ev(`dyStatus(${JSON.stringify(r.entry)})`).sev==='borderline');
  r=add('sugar',{v:'250',ctx:'random',date:day(0),tm:'00:03'});ok('sugar: random 250 = High (red), no urgent alert',ev(`dyStatus(${JSON.stringify(r.entry)})`).sev==='high'&&!r.alert);
  r=add('sugar',{v:'320',ctx:'random',date:day(0),tm:'00:04'});ok('sugar: 320 raises an urgent alert',r.ok&&/Contact your doctor today/.test(r.alert));
  r=add('sugar',{v:'48',ctx:'random',date:day(0),tm:'00:05'});ok('sugar: 48 raises a very-low alert (treat now)',r.ok&&/fast-acting sugar/.test(r.alert));
  r=add('sugar',{v:'5.6',sugarUnit:'mmol',ctx:'fasting',date:day(0),tm:'00:06'});ok('sugar: 5.6 mmol/L is stored as 101 mg/dL',r.ok&&r.entry.v===101);
  ok('sugar: unit choice is remembered (mmol) and shown converted',ev('dyData().prefs.sugarUnit')==='mmol'&&ev(`dyValueText(${JSON.stringify(r.entry)})`)==='5.6 mmol/L');
  ok('sugar: rejects 5 mg/dL, 900 and text',!add('sugar',{v:'5',sugarUnit:'mgdl'}).ok&&!add('sugar',{v:'900',sugarUnit:'mgdl'}).ok&&!add('sugar',{v:'abc',sugarUnit:'mgdl'}).ok);

  // ---------- blood pressure
  reset();
  const bp=(s,d,p)=>add('bp',{v:String(s),v2:String(d),p:p==null?'':String(p),date:day(0),tm:'00:00'});
  ok('bp: 118/76 Normal',ev(`dyStatus(${JSON.stringify(bp(118,76).entry)})`).label==='Normal');
  ok('bp: 135/85 Stage 1 (amber)',ev(`dyStatus(${JSON.stringify(bp(135,85).entry)})`).sev==='borderline');
  ok('bp: 150/95 Stage 2 (red)',ev(`dyStatus(${JSON.stringify(bp(150,95).entry)})`).sev==='high');
  r=bp(190,125);ok('bp: 190/125 = urgent alert with the emergency wording',r.ok&&/emergency services/.test(r.alert)&&ev(`dyStatus(${JSON.stringify(r.entry)})`).sev==='urgent');
  ok('bp: 85/55 = Low (blue)',ev(`dyStatus(${JSON.stringify(bp(85,55).entry)})`).sev==='low');
  ok('bp: pulse is kept and optional',bp(120,80,72).entry.p===72&&bp(120,80).entry.p===undefined);
  ok('bp: rejects top <= bottom, out-of-range, missing, bad pulse',!bp(80,90).ok&&!bp(300,100).ok&&!add('bp',{v:'120',v2:''}).ok&&!bp(120,80,500).ok);

  // ---------- other built-in metrics
  const st=(m,fl)=>{const x=add(m,Object.assign({date:day(0),tm:'00:00'},fl));return x.ok?ev(`dyStatus(${JSON.stringify(x.entry)})`):null;};
  ok('pulse: 72 Normal, 110 Raised, 130 High, 55 Slightly low',st('pulse',{v:'72'}).sev==='good'&&st('pulse',{v:'110'}).sev==='borderline'&&st('pulse',{v:'130'}).sev==='high'&&st('pulse',{v:'55'}).sev==='low');
  ok('spo2: 97 Normal, 93 Slightly low, 88 urgent',st('spo2',{v:'97'}).sev==='good'&&st('spo2',{v:'93'}).sev==='borderline'&&st('spo2',{v:'88'}).sev==='urgent');
  ok('spo2: rejects 120 and 20',!add('spo2',{v:'120'}).ok&&!add('spo2',{v:'20'}).ok);
  ok('temp: 36.8 Normal, 38.5 Fever, 41 urgent',st('temp',{v:'36.8',tempUnit:'c'}).sev==='good'&&st('temp',{v:'38.5',tempUnit:'c'}).label==='Fever'&&st('temp',{v:'41',tempUnit:'c'}).sev==='urgent');
  r=add('temp',{v:'101.3',tempUnit:'f',date:day(0),tm:'00:00'});ok('temp: 101.3\u00b0F is stored as 38.5\u00b0C and shown in \u00b0F',r.ok&&r.entry.v===38.5&&ev(`dyValueText(${JSON.stringify(r.entry)})`)==='101.3 \u00b0F');
  ok('temp: rejects 250 and 5',!add('temp',{v:'250',tempUnit:'c'}).ok&&!add('temp',{v:'5',tempUnit:'c'}).ok);
  ok('weight: 68.54 saved as 68.5 with no judgement label',(()=>{const x=add('weight',{v:'68.54',date:day(0),tm:'00:00'});return x.ok&&x.entry.v===68.5&&ev(`dyStatus(${JSON.stringify(x.entry)})`).sev==='none';})());
  ok('weight: rejects 0 and 900',!add('weight',{v:'0'}).ok&&!add('weight',{v:'900'}).ok);

  // ---------- dates / notes
  ok('rejects a future date',!add('weight',{v:'70',date:ev("dyIso(new Date(Date.now()+2*86400000))")}).ok);
  ok('rejects a future time today',(()=>{const t=ev("(()=>{const d=new Date(Date.now()+3600000);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')})()");return ev('dyNowTime()')>t?true:!add('weight',{v:'70',date:day(0),tm:t}).ok;})());
  ok('rejects an invalid date',!add('weight',{v:'70',date:'2026-13-45'}).ok&&!add('weight',{v:'70',date:'1990-01-01'}).ok);
  ok('note is trimmed to 200 characters',add('weight',{v:'70',date:day(0),tm:'00:00',note:'x'.repeat(500)}).entry.note.length===200);

  // ---------- edit / delete
  reset();
  r=add('weight',{v:'70',date:day(1),tm:'08:00'});const id=r.entry.id,ts0=r.entry.ts;
  const r2=add('weight',{v:'71.2',date:day(1),tm:'08:30'},id);
  ok('edit keeps the same id, replaces the value, and does not add a second row',r2.ok&&ev('dyData().log.length')===1&&ev('dyData().log[0].v')===71.2&&ev('dyData().log[0].id')===id&&ev('dyData().log[0].ts')===ts0);
  ok('editing a missing reading fails cleanly',!add('weight',{v:'70',date:day(1),tm:'08:00'},'nope').ok);
  ok('delete removes it (and reports false for a missing id)',ev(`dyDeleteById(${JSON.stringify(id)})`)===true&&ev('dyData().log.length')===0&&ev("dyDeleteById('nope')")===false);

  // ---------- custom measurements
  reset();
  let c=ev("dyAddCustom('HbA1c','%','4','5.6',1,null)");ok('custom: HbA1c with a healthy range is created',c.ok&&c.custom.min===4&&c.custom.max===5.6);
  const cm='c:'+c.custom.id;
  const cst=(v)=>{const x=add(cm,{v:String(v),date:day(0),tm:'00:00'});return ev(`dyStatus(${JSON.stringify(x.entry)})`);};
  ok('custom: in range / above / below are labelled with the person\u2019s own range',cst(5.2).label==='In your range'&&cst(7.1).label==='Above your range'&&cst(3.5).label==='Below your range');
  ok('custom: value rounded to the chosen decimals',add(cm,{v:'5.678',date:day(0),tm:'00:00'}).entry.v===5.7);
  ok('custom: duplicate and built-in names are refused',!ev("dyAddCustom('hba1c','%','','',1,null)").ok&&!ev("dyAddCustom('Blood sugar','','','',1,null)").ok);
  ok('custom: bad range refused (min >= max, non-numbers, empty name)',!ev("dyAddCustom('X','u','10','5',1,null)").ok&&!ev("dyAddCustom('Y','u','a','b',1,null)").ok&&!ev("dyAddCustom('  ','u','','',1,null)").ok);
  ok('custom: without a range shows no judgement',(()=>{const k=ev("dyAddCustom('Peak flow','L/min','','',0,null)").custom;const x=add('c:'+k.id,{v:'400',date:day(0),tm:'00:00'});return ev(`dyStatus(${JSON.stringify(x.entry)})`).sev==='none';})());
  ok('custom: a custom measurement can be edited',ev(`dyAddCustom('HbA1c (lab)','%','4','5.7',1,${JSON.stringify(c.custom.id)})`).ok&&ev(`dyCustomById(${JSON.stringify(c.custom.id)}).name`)==='HbA1c (lab)');
  const before=ev('dyData().log.length');ev(`dyDeleteCustom(${JSON.stringify(c.custom.id)})`);
  ok('custom: deleting a measurement also removes its readings, and nothing else',ev(`dyData().log.filter(e=>e.m===${JSON.stringify(cm)}).length`)===0&&ev('dyData().log.length')===before-4&&ev('dyData().custom.length')===1);

  // ---------- capacity
  reset();ev(`(()=>{const d=dyData();d.log=Array.from({length:DY_MAX_ENTRIES},(_,i)=>({id:'x'+i,m:'weight',v:70,d:'2026-01-01',tm:'08:00'}));dySave(d);})()`);
  r=add('weight',{v:'70',date:day(0),tm:'00:00'});ok('a full diary refuses new readings with a helpful message',!r.ok&&/full/.test(r.error));
  ok('editing still works when the diary is full',add('weight',{v:'71',date:'2026-01-01',tm:'08:00'},'x5').ok);

  // ---------- privacy: separate per family member
  reset();add('weight',{v:'70',date:day(0),tm:'00:00'});
  ev("window.__origPid=currentPatientId;currentPatientId=function(){return 'KID1'}");
  ok('a different family member starts with an empty diary',ev('dyData().log.length')===0);
  add('weight',{v:'20',date:day(0),tm:'00:00'});ok('...and their readings are stored separately',ev('dyData().log.length')===1&&ev('dyData().log[0].v')===20);
  ev("currentPatientId=window.__origPid");
  ok('...without touching the first person\u2019s diary',ev('dyData().log.length')===1&&ev('dyData().log[0].v')===70);

  // ---------- calendar rendering
  reset();
  const host=w.document.createElement('div');host.id='dy-host';w.document.body.appendChild(host);
  host.innerHTML=ev('viewPatientDiary()');
  add('sugar',{v:'300',ctx:'random',date:day(0),tm:'07:00'});add('bp',{v:'118',v2:'76',date:day(0),tm:'08:00'});add('weight',{v:'70',date:day(2),tm:'08:00'});
  ev('dyMonth=null;dySelected=null;dyRenderAll()');
  const y=ev('new Date().getFullYear()'),mo=ev('new Date().getMonth()');const dim=ev(`new Date(${y},${mo}+1,0).getDate()`),lead=ev(`new Date(${y},${mo},1).getDay()`);
  const cells=[...w.document.querySelectorAll('#dy-cal .cal-cell')];
  ok('calendar has the right number of day cells and leading blanks',cells.filter(c=>!c.classList.contains('empty')).length===dim&&cells.filter(c=>c.classList.contains('empty')).length===lead);
  const todayCell=w.document.querySelector('#dy-cal .cal-cell.today');
  ok('today is highlighted and shows its coloured dots (worst first)',!!todayCell&&todayCell.querySelectorAll('.dy-dot').length===2&&/dc2626/i.test(todayCell.querySelector('.dy-dot').getAttribute('style')));
  ok('days after today are dimmed',(()=>{const t=new Date().getDate();return t>=dim||[...cells].filter(c=>c.classList.contains('dy-future')).length===dim-t;})());
  ok('the day panel lists today\u2019s readings with values and status labels',/300 mg\/dL/.test(w.document.getElementById('dy-day').textContent)&&/118\/76/.test(w.document.getElementById('dy-day').textContent)&&/Very|High/.test(w.document.getElementById('dy-day').textContent));
  ok('an urgent reading shows the SOS shortcut in the day panel',w.document.getElementById('dy-day').innerHTML.includes("renderCurrentView('p-sos')"));
  ev(`dySelectDay(${JSON.stringify(day(2))})`);ok('tapping another day shows that day\u2019s readings',/70 kg/.test(w.document.getElementById('dy-day').textContent)&&!/118\/76/.test(w.document.getElementById('dy-day').textContent));
  ev(`dySelectDay(${JSON.stringify(day(5))})`);ok('a day with nothing logged says so',/No readings logged/.test(w.document.getElementById('dy-day').textContent));
  const lab0=w.document.getElementById('dy-month-label').textContent;ev('dyChangeMonth(-1)');const lab1=w.document.getElementById('dy-month-label').textContent;ev('dyChangeMonth(1)');
  ok('month navigation changes the label and returns',lab0!==lab1&&w.document.getElementById('dy-month-label').textContent===lab0);
  ok('quick-log chips show the last value and how long ago',/118\/76 mmHg/.test(w.document.getElementById('dy-today').textContent)&&/today/.test(w.document.getElementById('dy-today').textContent));

  // ---------- streak
  reset();[0,1,2].forEach(n=>add('weight',{v:'70',date:day(n),tm:'00:00'}));ok('streak counts consecutive days (3)',ev('dyStreak()')===3);
  reset();add('weight',{v:'70',date:day(1),tm:'00:00'});add('weight',{v:'70',date:day(2),tm:'00:00'});ok('streak still counts if today is not logged yet (2)',ev('dyStreak()')===2);
  reset();add('weight',{v:'70',date:day(0),tm:'00:00'});add('weight',{v:'70',date:day(2),tm:'00:00'});ok('a missed day breaks the streak (1)',ev('dyStreak()')===1);

  // ---------- trends + stats
  reset();[[6,'100'],[4,'130'],[2,'90'],[0,'180']].forEach(([n,v])=>add('sugar',{v,ctx:'fasting',date:day(n),tm:'07:00',sugarUnit:'mgdl'}));
  const s=ev("dyStats('sugar',30)");ok('stats: count, average, min and max are right',s.count===4&&Math.round(s.avg)===125&&s.min===90&&s.max===180);
  ok('stats: % in healthy range counts only Normal readings (1 of 4 = 25%)',s.inRangePct===25);
  ev("dyTrendMetric=null;dyTrendDays=30;dyRenderTrends()");const tr=w.document.getElementById('dy-trends').innerHTML;
  ok('trend chart is an SVG with one dot per reading and a shaded healthy band',(tr.match(/<circle/g)||[]).length===4&&tr.includes('<polyline')&&tr.includes('opacity=".13"'));
  ok('trend output never contains NaN or undefined',!/NaN|undefined/.test(tr));
  ev("dySetTrendDays(7)");ok('shorter range still renders',(w.document.getElementById('dy-trends').innerHTML.match(/<circle/g)||[]).length===4);
  reset();add('sugar',{v:'100',ctx:'fasting',date:day(0),tm:'07:00',sugarUnit:'mgdl'});ev("dyTrendMetric=null;dyRenderTrends()");
  ok('a single reading still draws (no NaN, centred dot)',(w.document.getElementById('dy-trends').innerHTML.match(/<circle/g)||[]).length===1&&!/NaN/.test(w.document.getElementById('dy-trends').innerHTML));
  reset();add('bp',{v:'120',v2:'80',date:day(1),tm:'07:00'});add('bp',{v:'130',v2:'85',date:day(0),tm:'07:00'});ev("dyTrendMetric=null;dyRenderTrends()");
  ok('blood pressure trend draws two lines (top and bottom number)',(w.document.getElementById('dy-trends').innerHTML.match(/<polyline/g)||[]).length===2);
  reset();ev("dyRenderTrends()");ok('with no data the trends card explains what will appear',/Log a few readings/.test(w.document.getElementById('dy-trends').textContent));

  // ---------- summary for the doctor
  reset();add('sugar',{v:'120',ctx:'fasting',date:day(1),tm:'07:00',sugarUnit:'mgdl',note:'<img src=x onerror=alert(1)>'});add('bp',{v:'128',v2:'82',date:day(0),tm:'08:00'});
  ev("dyAddCustom('Waist <b>size</b>','cm','','',0,null)");
  const sum=ev('dySummaryText(30)');
  ok('summary has a title, the disclaimer and each metric with stats',/HEALTH DIARY SUMMARY/.test(sum)&&/Not a diagnosis/.test(sum)&&/BLOOD SUGAR/.test(sum)&&/BLOOD PRESSURE/.test(sum)&&/Average 128\/82 mmHg/.test(sum));
  ok('summary has no NaN/undefined and lists the readings',!/NaN|undefined/.test(sum)&&/120 mg\/dL/.test(sum));
  ok('an empty period says so honestly',ev('(()=>{const d=dyData();const keep=d.log;d.log=[];dySave(d);const t=dySummaryText(7);d.log=keep;dySave(d);return t;})()').includes('No readings were logged'));
  ev('dyOpenSummary(30)');const pre=w.document.getElementById('dy-summary-pre');
  ok('summary window is shown and HTML in notes is escaped (no injected tag)',!!pre&&pre.textContent.includes('<img src=x')&&!pre.querySelector('img'));
  ev('closeModal()');
  ev(`dySelected=${JSON.stringify(day(1))};dyRenderDay()`);
  ok('notes are escaped in the day list',!w.document.getElementById('dy-day').querySelector('img')&&w.document.getElementById('dy-day').textContent.includes('<img src=x'));
  ev('dyRenderSettings()');ok('custom names are escaped in Settings',!w.document.getElementById('dy-settings').querySelector('b')&&w.document.getElementById('dy-settings').textContent.includes('Waist <b>size</b>'));

  // ---------- the add-a-reading window end to end
  reset();ev("dyOpenLog('sugar')");
  ok('log window opens with value, unit, when-taken, date, time and note',['dy-f-v','dy-f-su','dy-f-ctx','dy-f-date','dy-f-tm','dy-f-note'].every(i=>!!w.document.getElementById(i)));
  w.document.getElementById('dy-f-v').value='abc';ev('dySubmitLog()');
  ok('a bad entry shows a plain error and keeps the window open',w.document.getElementById('dy-f-err').style.display==='block'&&!w.document.getElementById('modal-overlay').classList.contains('hidden'));
  w.document.getElementById('dy-f-v').value='190';w.document.getElementById('dy-f-ctx').value='fasting';ev('dyPreview()');
  ok('typing a value previews its status live',/Diabetes range/.test(w.document.getElementById('dy-f-preview').textContent));
  ev('dySubmitLog()');ok('saving stores the reading, closes the window and selects that day',ev('dyData().log.length')===1&&w.document.getElementById('modal-overlay').classList.contains('hidden')&&ev('dySelected')===day(0));
  ev("dyOpenLog('sugar')");ok('the unit last used is pre-selected next time',w.document.getElementById('dy-f-su').value==='mgdl');
  ev('closeModal()');
  ev(`dySelected=${JSON.stringify(day(3))}`);ev("dyOpenLog('sugar')");ok('the quick-log buttons default to TODAY even when another day is selected on the calendar',w.document.getElementById('dy-f-date').value===day(0));ev('closeModal()');
  ev(`dyOpenLog('sugar',${JSON.stringify(day(3))})`);ok('"Add a reading for this day" uses the day you picked',w.document.getElementById('dy-f-date').value===day(3));ev('closeModal()');
  ev(`dyOpenLog('sugar',null,${JSON.stringify(ev('dyData().log[0].id'))})`);ok('editing opens with the saved value filled in',w.document.getElementById('dy-f-v').value==='190');ev('closeModal()');
  ev('dyOpenCustom()');w.document.getElementById('dy-c-name').value='Cholesterol';w.document.getElementById('dy-c-unit').value='mg/dL';w.document.getElementById('dy-c-max').value='200';ev('dySubmitCustom()');
  ok('creating a measurement through the window works',ev("dyData().custom.some(c=>c.name==='Cholesterol'&&c.max===200)"));
  ev('closeModal()');
  ev('dyClearAll()');ok('Delete all diary data clears this person\u2019s readings and measurements',ev('dyData().log.length')===0&&ev('dyData().custom.length')===0);

  // ---------- About page + errors
  ok('About page now claims the diary is Live (and the test above proved it exists)',/>Live</.test((ev('aboutStatusRows()')||[]).find(x=>x[0].startsWith('Daily health diary'))[1]));
  console.log('  errors: '+JSON.stringify([...new Set(errs)]));ok('no script errors while loading',errs.length===0);
  console.log(fails?`\n  ${fails} CHECK(S) FAILED`:'\n  ALL HEALTH-DIARY CHECKS PASSED');process.exit(fails?1:0);
})();
