const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');
class L extends ResourceLoader{fetch(u,o){return u.startsWith('file://')?super.fetch(u,o):Promise.resolve(Buffer.from(''))}}
(async()=>{const f=path.resolve(process.argv[2],'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};}});
const w=dom.window,d=w.document;await new Promise(r=>setTimeout(r,1500));
const out=[];const badges=[...d.querySelectorAll('#badge-grid > *')];
for(let i=0;i<badges.length;i++){
  // return to landing between roles
  ['screen-auth','screen-doctor-login','screen-delivery-login','screen-admin','app-shell'].forEach(id=>d.getElementById(id).classList.add('hidden'));d.getElementById('screen-landing').classList.remove('hidden');
  d.querySelectorAll('#badge-grid > *')[i].click();await new Promise(r=>setTimeout(r,300));
  const shown=['screen-auth','screen-doctor-login','screen-delivery-login','app-shell'].find(id=>!d.getElementById(id).classList.contains('hidden'));
  const card=(d.getElementById('auth-card-box')||{}).innerHTML||'';
  out.push(`${badges[i].textContent.trim().replace(/\s+/g,' ').slice(0,28)} → ${shown||'none'} (${card.length}b)`);}
// admin gate via secret hash
w.location.hash='#opsdesk';w.dispatchEvent(new w.HashChangeEvent('hashchange'));await new Promise(r=>setTimeout(r,300));
out.push('admin gate visible: '+!d.getElementById('screen-admin').classList.contains('hidden'));
console.log(process.argv[2]+'\n  '+out.join('\n  ')+'\n  errors: '+JSON.stringify([...new Set(errs)]));process.exit(0)})();
