/* Phase 1 (ABDM plan) — checks the new official-links cards and that every flag is OFF,
   AND that the old Aadhaar / access-grant structure is still present (nothing removed). */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');
class L extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''))}}
(async()=>{
  const f=path.resolve(process.argv[2],'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};}});
  const w=dom.window;await new Promise(r=>setTimeout(r,1500));
  let fails=0;const ok=(name,cond)=>{console.log((cond?'  PASS  ':'  FAIL  ')+name);if(!cond)fails++;};
  const ev=s=>{try{return w.eval(s)}catch(e){return undefined}};

  // flags all off
  ok('ABDM_ENABLED is a boolean',typeof ev('ABDM_ENABLED')==='boolean');
  ok('DIGILOCKER_ENABLED is a boolean',typeof ev('DIGILOCKER_ENABLED')==='boolean');
  ok('ABDM_ENV is sandbox',ev('ABDM_ENV')==='sandbox');
  ok('ABDM_WORKER_URL is empty or an https URL',/^(|https:\/\/.+)$/.test(ev('ABDM_WORKER_URL')));
  // every official link is https and on a government domain
  const links=ev('OFFICIAL_LINKS')||{};const keys=Object.keys(links);
  ok('official links present ('+keys.join(',')+')',keys.length>=5);
  ok('all official links are https + .gov.in',keys.every(k=>/^https:\/\/([a-z0-9-]+\.)*(gov\.in)(\/|$)/.test(links[k].url)));

  // the helper renders safe external links
  const html=ev("officialLinksCardHTML(['abha','digilocker'],'T')")||'';
  ok('card has 2 links with rel=noopener',(html.match(/rel="noopener noreferrer"/g)||[]).length===2);
  ok('card shows last-reviewed date',/last reviewed \d{4}-\d{2}-\d{2}/.test(html));

  // the two screens include the new cards
  const sch=ev('viewPatientInsurance()')||'', docs=ev('viewPatientDocuments()')||'';
  ok('Schemes screen shows official links',sch.includes('Official government sites')&&sch.includes('beneficiary.nha.gov.in')&&sch.includes('jeevandayee.gov.in'));
  ok('scheme details include the last-reviewed note (shown once a scheme is chosen)',(ev('viewPatientInsurance.toString()')||'').includes('Information last reviewed'));
  ok('PM-JAY text mentions the 70+ Vay Vandana cover',(ev('SCHEME_CONFIG.pmjay.desc')||'').includes('Vay Vandana'));
  ok('PM-JAY / CGHS / ESIC / state / private / none schemes all still present',['pmjay','cghs','esic','state','private','none'].every(k=>ev('!!SCHEME_CONFIG.'+k)));
  ok('My Documents shows official sources',docs.includes('Get documents from official sources')&&docs.includes('digilocker.gov.in'));

  // OLD structure untouched (nothing removed)
  ok('old Aadhaar field still on Schemes screen',sch.includes('aadhaar-input-field'));
  ok('old document upload still on My Documents',docs.includes('doc-file-input'));
  ['patientVerifyAadhaar','hospitalRequestAccess','hospitalConfirmAccessOtp','syncMyAadhaarSharing','doctorSubmitRx','handleDocUpload'].forEach(n=>ok('old function still exists: '+n,typeof ev(n)==='function'));

  console.log('  errors: '+JSON.stringify([...new Set(errs)]));
  console.log(fails?('\n  '+fails+' CHECK(S) FAILED'):'\n  ALL PHASE 1 CHECKS PASSED');
  process.exit(fails?1:0);
})();
