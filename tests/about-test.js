/* About page — in-app view for every role, the pre-login screen, honest status labels, wiring, and "nothing else broke". */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');
const root=path.resolve(process.argv[2]);
class L extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''))}}
(async()=>{
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};}});
  const w=dom.window;await new Promise(r=>setTimeout(r,1500));
  let fails=0;const ok=(name,cond)=>{console.log((cond?'  PASS  ':'  FAIL  ')+name);if(!cond)fails++;};
  const ev=s=>{try{return w.eval(s)}catch(e){return undefined}};

  // --- wiring
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  ok('index.html loads about.js before main.js',html.indexOf('js/modules/shared/about.js')>-1&&html.indexOf('js/modules/shared/about.js')<html.indexOf('js/main.js'));
  ok('sw.js caches about.js',sw.includes("./js/modules/shared/about.js"));
  ok('sw.js CACHE_VERSION bumped to v7 or newer',(+((sw.match(/CACHE_VERSION = 'v(\d+)'/)||[])[1]||0))>=7);
  ok('landing page has the About button',!!w.document.getElementById('about-link-landing'));
  ok('pre-login About screen exists and is hidden by default',!!w.document.getElementById('screen-about')&&w.document.getElementById('screen-about').classList.contains('hidden'));
  ok('dispatcher knows the about view',(ev('renderCurrentView.toString()')||'').includes("'about': viewAbout"));

  // --- every role gets exactly one About entry, last in its menu
  ['patient','responder','police','hospital','pharmacy','doctor','delivery'].forEach(r=>{
    const n=ev(`SIDENAV.${r}.filter(i=>i.id==='about').length`);const last=ev(`SIDENAV.${r}[SIDENAV.${r}.length-1].id`);
    ok(`nav: ${r} has one About item, at the end`,n===1&&last==='about');
  });

  // --- content
  const page=ev('aboutContentHTML()')||'';
  ['What is ArogyaBot','Why we built it','How an emergency works','Who uses it','What is live today','Government schemes and official links','Privacy and safety principles','How it is built','What is planned next','Important notices','App details'].forEach(h=>ok('section present: '+h,page.includes(h)));
  ok('all 7 roles described',['Patients','Ambulance responders','Police','Hospitals','Doctors','Pharmacies','Delivery partners'].every(x=>page.includes(x)));
  ok('emergency notice tells people to call 112',/call 112/.test(page));
  ok('roadmap names ECHS and says it is pan-India',/ECHS/.test(page)&&/pan-India/.test(page));
  ok('roadmap says dates are not promised',/not a promise/.test(page));
  ok('states payments are simulated and no real money moves',/no real money moves/.test(page));
  ok('says it is independent of the Government of India',/not part of, endorsed by, or acting for the Government of India/.test(page));
  ok('official links card is included and https',/href="https:\/\/abha\.abdm\.gov\.in/.test(page));
  ok('empty maker/contact are hidden (no empty links)',!/href="mailto:"/.test(page)&&!/Built by/.test(page));
  ok('no HTML left unbalanced (div open/close match)',(page.match(/<div/g)||[]).length===(page.match(/<\/div>/g)||[]).length);

  // --- complete-health-companion positioning (fitness, vitals, screening, women's health, diary is NOT live)
  ok('hero calls it a complete health companion',/complete health companion/.test(page));
  ok('has an everyday health companion section',page.includes('Your everyday health companion'));
  ['Fitness &amp; body','Vitals &amp; risk screening','Nutrition','Sleep &amp; lifestyle',"Women\\'s health",'Medicines'].forEach(k=>ok('companion section covers: '+k.replace('&amp;','&').replace("\\'","'"),page.includes(k)||page.includes(k.replace("\\'","'"))));
  ok('mentions BP, blood sugar and custom measurements for the diary',/blood sugar/i.test(page)&&/blood pressure/i.test(page)&&/custom measurement/i.test(page));
  ok('diary is labelled Coming soon and says it is not live',/Coming soon/.test(page)&&/not live yet/.test(page));
  const rowsD=ev('aboutStatusRows()')||[];const diary=(rowsD.find(r=>r[0].startsWith('Daily health diary'))||[])[1]||'';
  ok('status table: diary is never labelled Live',diary!==''&&!/>Live</.test(diary));
  const tools=(rowsD.find(r=>r[0].startsWith('Health tools'))||[])[1]||'';
  ok('status table: health tools labelled Live',/>Live</.test(tools));
  ok('page still says tools are not diagnosis',/do not diagnose or treat/.test(page));
  ok('roadmap lists the daily health diary',/daily health diary/.test(page));

  // --- status labels follow the real flags
  const rowsNow=ev('aboutStatusRows()')||[];const get=n=>(rowsNow.find(r=>r[0].startsWith(n))||[])[1]||'';
  ok('payments always labelled Simulated',/Simulated/.test(get('Payments')));
  ok('ABHA is never labelled Live while the gateway is mock/sandbox',!/>Live</.test(get('ABHA')));
  ok('SOS labelled Live',/>Live</.test(get('Emergency SOS')));
  w.eval("window.__t=1");
  // flags are consts; prove the label logic by reading the function source for the guard
  const src=fs.readFileSync(path.join(root,'js/modules/shared/about.js'),'utf8');
  ok('ABHA label depends on the real flag + Worker URL',/abdmOn\s*=\s*f\.abdm\s*&&\s*!!f\.url/.test(src));
  ok('about.js does not use eval or localStorage',!/\beval\(/.test(src)&&!/localStorage|sessionStorage/.test(src));

  // --- in-app view renders for a logged-in patient and for another role
  ev("window.currentRole='patient'");
  const view=ev('viewAbout()')||'';
  ok('in-app view has the header and the content',/About ArogyaBot/.test(view)&&view.includes('What is ArogyaBot'));
  let threw=false;try{w.eval("renderCurrentView('about')")}catch(e){threw=true}
  ok('renderCurrentView("about") runs without error',!threw);
  ok('active view container now shows the About page',(w.document.getElementById('active-view-container')||{innerHTML:''}).innerHTML.includes('Why we built it'));

  // --- pre-login screen opens and closes
  ev("openAboutFromLanding()");
  ok('pre-login: About screen visible, landing hidden',!w.document.getElementById('screen-about').classList.contains('hidden')&&w.document.getElementById('screen-landing').classList.contains('hidden'));
  ok('pre-login: body filled with the page',(w.document.getElementById('about-screen-body').innerHTML||'').includes('What is planned next'));
  ev("closeAboutToLanding()");
  ok('pre-login: Back returns to landing',w.document.getElementById('screen-about').classList.contains('hidden')&&!w.document.getElementById('screen-landing').classList.contains('hidden'));

  // --- nothing old was removed
  ['viewPatientDash','viewPatientInsurance','viewPatientSOS','viewResponderDash','viewHospitalDash','viewPharmacyDash','viewDoctorDash','viewDeliveryDash','buildSideNav','renderCurrentView'].forEach(n=>ok('old function still exists: '+n,typeof ev(n)==='function'));
  ok('no script errors while loading and using About',errs.length===0||console.log('   errors:',[...new Set(errs)])||false);

  console.log(fails?`\n  ${fails} CHECK(S) FAILED`:'\n  ALL ABOUT-PAGE CHECKS PASSED');process.exit(fails?1:0);
})();
