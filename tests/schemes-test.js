/* Schemes registry, ECHS/CAPF/Railways, state selector, helplines and finders (gap analysis D1/D2). */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');class Local extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''));}}const path=require('path');const fs=require('fs');
const root=path.resolve(process.argv[2]);let fails=0;const ok=(n,c)=>{console.log((c?'  PASS  ':'  FAIL  ')+n);if(!c)fails++;};
async function load(){
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new Local(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};}});
  await new Promise(r=>setTimeout(r,1800));return {w:dom.window,errs};
}
(async()=>{
  const {w,errs}=await load();const ev=s=>{try{return w.eval(s)}catch(e){return 'ERR:'+e.message}};
  /* ---- registry integrity ---- */
  const S=JSON.parse(ev('JSON.stringify(SCHEME_STATES)'));
  ok('registry has all 36 States/UTs (28 states + 8 UTs)',S.length===36&&S.filter(s=>s.kind==='state').length===28&&S.filter(s=>s.kind==='ut').length===8);
  ok('state codes are unique',new Set(S.map(s=>s.code)).size===36);
  ok('every state has at least one scheme with a name',S.every(s=>s.schemes.length&&s.schemes.every(x=>x.name)));
  ok('confirmed rows (ok:true) that show money have a cover; unconfirmed rows never carry a displayable cover',S.every(s=>s.schemes.every(x=>x.ok?true:!('cover' in x))));
  const names=S.map(s=>s.name);
  ['Maharashtra','Punjab','Rajasthan','West Bengal','Delhi','Telangana','Tamil Nadu','Kerala','Uttar Pradesh','Odisha','Himachal Pradesh','Andhra Pradesh'].forEach(n=>ok('registry includes '+n,names.includes(n)));
  ok('only Maharashtra carries a state portal url (others fall back to myScheme)',S.filter(s=>s.url).map(s=>s.code).join()==='MH');

  /* ---- state card rendering ---- */
  const body=c=>ev(`stateSchemesBodyHTML('${c}')`);
  ok('no state chosen: prompt shown, no amounts',/Pick your state/.test(body(''))&&!/₹/.test(body('')));
  ok('Punjab shows ₹10 lakh and universal note',/₹10 lakh per family/.test(body('PB'))&&/Universal/.test(body('PB')));
  ok('Rajasthan shows ₹25 lakh inpatient and MADBY accident cover',/₹25 lakh/.test(body('RJ'))&&/MADBY/.test(body('RJ')));
  ok('Delhi shows the ₹10 lakh combined cover',/₹10 lakh/.test(body('DL')));
  ok('West Bengal lists PM-JAY, Swasthya Sathi and the bima scheme',/PM-JAY/.test(body('WB'))&&/Swasthya Sathi/.test(body('WB'))&&/Swasthya Bima/.test(body('WB')));
  ok('Maharashtra shows the conflict note, not a single amount, and links jeevandayee',/Sources disagree/.test(body('MH'))&&/jeevandayee\.gov\.in/.test(body('MH'))&&!/Cover:/.test(body('MH')));
  ok('unconfirmed states (Goa, Assam, Gujarat) never show their unverified amount',!/₹4 lakh/.test(body('GA'))&&!/₹2 lakh/.test(body('AS'))&&!/₹10 lakh/.test(body('GJ'))&&/check the official site/.test(body('GA')));
  ok('every state body shows the reviewed date and an official-site link',S.every(s=>body(s.code).includes('last reviewed 2026-10-03')&&/rel="noopener noreferrer"/.test(body(s.code))));
  ok('no leftover "states not implementing PM-JAY" text anywhere in the app',!/not implement/i.test(fs.readFileSync(path.join(root,'js/modules/patient/insurance-schemes.js'),'utf8')+fs.readFileSync(path.join(root,'js/modules/patient/service-schemes.js'),'utf8'))&&/Every State and UT is now part of PM-JAY/.test(body('BR')));

  /* ---- Schemes screen ---- */
  w.eval("window.__renders=0;renderCurrentView=function(){window.__renders++;}");
  const html=ev('viewPatientInsurance()');
  ok('screen: ECHS, CAPF and Railways appear as scheme types',/value="echs"/.test(html)&&/value="capf"/.test(html)&&/value="railways"/.test(html));
  ok('screen: old scheme types still present (pmjay, cghs, esic, state, private, none)',['pmjay','cghs','esic','state','private','none'].every(k=>html.includes(`value="${k}"`)));
  ok('screen: state selector has 36 states/UTs + placeholder',(html.match(/<option value="[A-Z]{2}"/g)||[]).length===36);
  ok('screen: Tele-MANAS 14416 tap-to-call',/href="tel:14416"/.test(html)&&/20 languages/.test(html));
  ok('screen: finders for Arogya Mandir, Jan Aushadhi, blood banks, U-WIN, eSanjeevani',['Arogya Mandir','Jan Aushadhi','e-RaktKosh','U-WIN','eSanjeevani'].every(t=>html.includes(t)));
  ok('screen: header mentions ECHS',/ECHS/.test(html));
  const box=w.document.createElement('div');box.id='t-box';box.innerHTML=html;w.document.body.appendChild(box);

  /* ---- state selection persists per member ---- */
  w.document.getElementById('ins-state-select').value='PB';w.eval('patientOnStateChange()');
  ok('choosing a state saves it and updates the box without a full re-render',ev("getInsuranceRecord(currentPatientId()).stateCode")==='PB'&&/Mukh Mantri Sehat Yojana/.test(w.document.getElementById('state-schemes-box').innerHTML)&&w.__renders===0);
  ok('state is stored per patient/member record',ev("(db('insurance')||{})[currentPatientId()].stateCode")==='PB');

  /* ---- ECHS fields, masking, save ---- */
  w.document.getElementById('ins-scheme-select').value='echs';w.eval('patientOnSchemeChange()');
  const ex=w.document.getElementById('ins-scheme-extra').innerHTML;
  ok('ECHS: card, rank, parent polyclinic and ward fields shown',['svc-card','svc-rank','svc-poly','svc-ward'].every(i=>ex.includes('id="'+i+'"')));
  ok('ECHS: emergency direct-admission note and keep-ready list shown',/without a prior referral/.test(ex)&&/ECHS smart card/.test(ex)&&/discharge summary/.test(ex));
  ok('ECHS: official echs.gov.in link opens safely',/href="https:\/\/www\.echs\.gov\.in\/"[^>]*noopener/.test(ex));
  ok('ECHS: referral tracker present',/Referral tracker/.test(ex)&&ex.includes('id="ref-no"'));
  w.document.getElementById('svc-card').value='1234 5678 90AB';w.document.getElementById('svc-rank').value='Havildar (Retd.)';w.document.getElementById('svc-poly').value='ECHS Polyclinic <b>Nashik</b>';
  w.eval('patientSaveSchemeDetails()');
  const rec=ev("getInsuranceRecord(currentPatientId())");const raw=JSON.stringify(rec);
  ok('ECHS: only the last 4 characters of the card number are stored',rec.svcCardMasked==='XXXXXXXX90AB'&&!raw.includes('1234567890')&&!raw.includes('1234 5678'));
  ok('ECHS: scheme type and details saved',rec.scheme==='echs'&&rec.svcRank==='Havildar (Retd.)');
  w.document.getElementById('ins-scheme-extra').innerHTML=w.eval("schemeExtraFieldsHTML(getInsuranceRecord(currentPatientId()))");
  ok('ECHS: saved masked number shown; real number never re-displayed; user text escaped',/Saved: XXXXXXXX90AB/.test(w.document.getElementById('ins-scheme-extra').innerHTML)&&!/1234567890/.test(w.document.getElementById('ins-scheme-extra').innerHTML)&&!w.document.getElementById('ins-scheme-extra').querySelector('b')&&w.document.getElementById('svc-poly').value==='ECHS Polyclinic <b>Nashik</b>');
  w.document.getElementById('svc-card').value='';w.eval('patientSaveSchemeDetails()');
  ok('ECHS: leaving the card box empty keeps the saved masked value',ev("getInsuranceRecord(currentPatientId()).svcCardMasked")==='XXXXXXXX90AB');

  /* ---- referral tracker ---- */
  const dstr=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
  w.document.getElementById('ins-scheme-extra').innerHTML=w.eval("schemeExtraFieldsHTML(getInsuranceRecord(currentPatientId()))");
  const setRef=(no,h,v)=>{w.document.getElementById('ref-no').value=no;w.document.getElementById('ref-hosp').value=h;w.document.getElementById('ref-valid').value=v;w.eval('patientAddReferral()');w.document.getElementById('ins-scheme-extra').innerHTML=w.eval("schemeExtraFieldsHTML(getInsuranceRecord(currentPatientId()))");};
  setRef('R-100','City Hospital',dstr(10));
  ok('referral: future date shows days left',/Valid · (9|10|11) days left/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  setRef('R-101','Old Hospital',dstr(-3));
  ok('referral: past date shows Expired',/Expired/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  setRef('R-102','<img src=x onerror=alert(1)>',dstr(5));
  ok('referral: hospital name is HTML-escaped',!w.document.getElementById('ins-scheme-extra').innerHTML.includes('<img src=x')&&/&lt;img src=x/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  ok('referral: card number kept after adding referrals',ev("getInsuranceRecord(currentPatientId()).svcCardMasked")==='XXXXXXXX90AB');
  const refId=ev("getInsuranceRecord(currentPatientId()).referrals[0].id");w.eval(`patientRemoveReferral('${refId}')`);
  ok('referral: remove works',ev("getInsuranceRecord(currentPatientId()).referrals.length")===2&&ev("getInsuranceRecord(currentPatientId()).referrals.every(r=>r.id!=='"+refId+"')"));
  w.document.getElementById('ref-no').value='';w.document.getElementById('ref-hosp').value='';w.eval('patientAddReferral()');
  ok('referral: empty entry rejected',ev("getInsuranceRecord(currentPatientId()).referrals.length")===2);

  /* ---- CAPF / Railways / old types ---- */
  w.document.getElementById('ins-scheme-select').value='capf';w.eval('patientOnSchemeChange()');
  ok('CAPF: fields shown, no referral tracker, no invented amounts',/id="svc-card"/.test(w.document.getElementById('ins-scheme-extra').innerHTML)&&!/Referral tracker/.test(w.document.getElementById('ins-scheme-extra').innerHTML)&&!/₹/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  w.document.getElementById('ins-scheme-select').value='railways';w.eval('patientOnSchemeChange()');
  ok('Railways: fields and referral tracker shown',/id="svc-card"/.test(w.document.getElementById('ins-scheme-extra').innerHTML)&&/Referral tracker/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  w.document.getElementById('ins-scheme-select').value='cghs';w.eval('patientOnSchemeChange()');
  ok('CGHS still uses its original single card field',/id="ins-extra-field"/.test(w.document.getElementById('ins-scheme-extra').innerHTML)&&!/svc-card/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  w.document.getElementById('ins-scheme-select').value='private';w.eval('patientOnSchemeChange()');
  ok('Private insurance still shows policy fields',/id="ins-insurer"/.test(w.document.getElementById('ins-scheme-extra').innerHTML));
  ['patientVerifyAadhaar','submitClaim','renderClaimsTable','schemeLabel','patientResetInsurance'].forEach(n=>ok('old function still exists: '+n,typeof w.eval(n)==='function'));
  ok('schemeLabel works for new types',ev("schemeLabel('echs')").startsWith('ECHS')&&ev("schemeLabel('nope')")==='Not verified');

  /* ---- Nearby Help ---- */
  w.eval("dbSet('profile',Object.assign({},db('profile')||{},{lat:null,lng:null}))");
  const n1=ev('nearbyHelpCard()');
  ok('Nearby Help (no location): finder links present',/Jan Aushadhi/.test(n1)&&/e-RaktKosh/.test(n1)&&/Arogya Mandir/.test(n1)&&/ECHS/.test(n1)&&/Use my live location/.test(n1));
  w.eval("dbSet('profile',Object.assign({},db('profile')||{},{lat:19.99,lng:73.78}))");
  const n2=ev('nearbyHelpCard()');
  ok('Nearby Help (with location): ambulances/police sections kept, finder links added',/Ambulances/.test(n2)&&/Police stations/.test(n2)&&/Jan Aushadhi/.test(n2));

  /* ---- links safety ---- */
  const L=JSON.parse(ev('JSON.stringify(OFFICIAL_LINKS)'));
  const bad=Object.entries(L).filter(([k,l])=>!/^https:\/\//.test(l.url)||!/\.gov\.in\/?/.test(l.url));
  ok('all official links are https and on .gov.in domains',bad.length===0||console.log('   ',bad.map(b=>b[0]))||false);
  ['echs','janaushadhi','aam','eraktkosh','uwin','esanjeevani','myscheme'].forEach(k=>ok('link defined: '+k,!!L[k]));

  /* ---- static ---- */
  const idx=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  ok('index.html: registry loads before insurance-schemes, service-schemes after, all before main.js',idx.indexOf('schemes-registry.js')>0&&idx.indexOf('schemes-registry.js')<idx.indexOf('insurance-schemes.js')&&idx.indexOf('insurance-schemes.js')<idx.indexOf('service-schemes.js')&&idx.indexOf('service-schemes.js')<idx.indexOf('js/main.js'));
  ok('sw.js caches both new files and version is v9 or newer',sw.includes('./js/data/schemes-registry.js')&&sw.includes('./js/modules/patient/service-schemes.js')&&(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=9);
  ok('no script errors',errs.length===0||console.log('   ',[...new Set(errs)])||false);
  console.log(fails?'\n  '+fails+' CHECK(S) FAILED':'\n  ALL SCHEMES CHECKS PASSED');process.exit(fails?1:0);
})();
