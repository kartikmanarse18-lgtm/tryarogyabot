/* Phase 3 (document storage) — mock Storage backend; nothing here touches Firebase. */
const {JSDOM,VirtualConsole,ResourceLoader}=require('jsdom');const path=require('path');const fs=require('fs');
const root=path.resolve(process.argv[2]);let fails=0;const ok=(n,c)=>{console.log((c?'  PASS  ':'  FAIL  ')+n);if(!c)fails++;};
class L extends ResourceLoader{constructor(p){super();this.p=p;}fetch(u,o){
  if(!u.startsWith('file://'))return Promise.resolve(Buffer.from(''));const r=super.fetch(u,o);
  if(this.p&&u.endsWith('/js/config/app-config.js'))return r.then(b=>Buffer.from(b.toString().replace('DOCS_STORAGE_ENABLED = false','DOCS_STORAGE_ENABLED = true')));return r;}}
async function load(flag){
  const f=path.resolve(root,'index.html');const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const dom=await JSDOM.fromFile(f,{runScripts:'dangerously',resources:new L(flag),virtualConsole:vc,pretendToBeVisual:true,url:'file://'+f,
    beforeParse(w){w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});w.HTMLCanvasElement.prototype.getContext=()=>null;w.scrollTo=()=>{};}});
  await new Promise(r=>setTimeout(r,1500));return {w:dom.window,errs};
}
function mockBackend(w,opts={}){
  w.__puts=[];w.__urls=[];w.__removes=[];w.__opened=[];
  w.docStorageApi=()=>({
    put:async(p,file,meta,prog)=>{if(opts.failPut)throw new Error('net');w.__puts.push({p,meta,size:file.size});prog&&prog(1);},
    url:async p=>{w.__urls.push(p);return 'https://dl.test/'+encodeURIComponent(p)+'?token=T';},
    remove:async p=>{w.__removes.push(p);}
  });
  w.open=(...a)=>{w.__opened.push(a);};
  w.eval("window.__renders=0; renderCurrentView=function(){window.__renders++;}");
  const st=w.document.createElement('div');st.id='doc-upload-status';w.document.body.appendChild(st);
  const cat=w.document.createElement('select');cat.id='doc-category';cat.innerHTML='<option value="report">r</option>';w.document.body.appendChild(cat);
}
const mkFile=(w,name,bytes,type)=>new w.File([new Uint8Array(bytes)],name,{type});
const upload=async(w,file)=>{const evt={target:{files:[file],value:'x'}};await w.eval('handleDocUpload')(evt);await new Promise(r=>setTimeout(r,60));return evt;};
const docs=w=>w.eval("db('documents')||[]");

(async()=>{
  /* ---------- flag OFF: behaves exactly as before ---------- */
  let {w,errs}=await load(false);let ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  ok('flag DOCS_STORAGE_ENABLED is false by default',ev('DOCS_STORAGE_ENABLED')===false);
  ok('docStorageEnabled() is false',ev('docStorageEnabled()')===false);
  mockBackend(w);w.eval("currentAuthUid=()=>'U1'");
  await upload(w,mkFile(w,'old.pdf',2000,'application/pdf'));
  let d=docs(w);
  ok('flag off: upload uses the OLD dataUrl path (no Storage call)',d.length===1&&/^data:/.test(d[0].dataUrl)&&!d[0].storagePath&&w.__puts.length===0);
  ok('flag off: legacy row still renders an inline download link',/href="data:/.test(ev('viewPatientDocuments()')));
  w.eval("dbSet('documents',(db('documents')||[]).concat([{id:'S1',ownerId:currentPatientId(),name:'cloud.pdf',category:'report',sizeKB:5,uploadedAt:1,storagePath:'users/U1/documents/S1/cloud.pdf'}]))");
  ok('flag off: existing Storage docs still list with an Open button',/docOpenFromStorage\('S1'\)/.test(ev('viewPatientDocuments()')));
  await w.eval("docOpenFromStorage('S1')");
  ok('flag off: Storage doc can still be opened (flag only gates new uploads)',w.__urls.length===1&&w.__opened.length===1&&w.__opened[0][2]==='noopener');
  ['handleDocUpload','deleteDocument','patientVerifyAadhaar','hospitalRequestAccess','doctorSubmitRx'].forEach(n=>ok('old function still exists: '+n,typeof ev(n)==='function'));
  ok('flag off: no script errors',errs.length===0||console.log('   ',[...new Set(errs)])||false);

  /* ---------- flag ON ---------- */
  ({w,errs}=await load(true));ev=s=>{try{return w.eval(s)}catch(e){return undefined}};
  mockBackend(w);
  ok('flag on but no Firebase login → falls back to legacy',ev('docStorageEnabled()')===false);
  w.eval("currentAuthUid=()=>'U1'");
  ok('flag on + login + SDK → cloud path active',ev('docStorageEnabled()')===true);
  ok('dropzone mentions the 10 MB limit',/up to 10 MB/.test(ev('viewPatientDocuments()')));

  let evt=await upload(w,mkFile(w,'my report (1).pdf',2*1024*1024,'application/pdf'));d=docs(w);
  ok('upload: put called with per-user path and safe file name',w.__puts.length===1&&/^users\/U1\/documents\/DOC[^/]+\/my_report__1_\.pdf$/.test(w.__puts[0].p));
  ok('upload: content type sent as application/pdf',w.__puts[0].meta.contentType==='application/pdf');
  ok('upload: Firestore doc holds metadata + storagePath and NO file data',d.length===1&&d[0].storagePath===w.__puts[0].p&&!d[0].dataUrl&&d[0].source==='upload'&&d[0].storage==='firebase'&&JSON.stringify(d[0]).length<500);
  ok('upload: input cleared and list re-rendered',evt.target.value===''&&w.eval('window.__renders')>=1);

  await upload(w,mkFile(w,'scan.pdf',8*1024*1024,'application/pdf'));
  ok('8 MB PDF accepted (old limit was ~4.5 MB)',w.__puts.length===2&&docs(w).length===2);
  const before=docs(w).length;
  evt=await upload(w,mkFile(w,'huge.pdf',11*1024*1024,'application/pdf'));
  ok('11 MB file rejected with message, nothing uploaded or saved',w.__puts.length===2&&docs(w).length===before&&/10 MB/.test(w.document.getElementById('doc-upload-status').innerHTML));
  await upload(w,mkFile(w,'run.exe',100,'application/x-msdownload'));
  ok('non PDF/image rejected',w.__puts.length===2&&docs(w).length===before);
  await upload(w,mkFile(w,'photo.JPG',500,''));
  ok('image with empty browser type gets image/jpeg from extension',w.__puts[2]&&w.__puts[2].meta.contentType==='image/jpeg');
  ok('path-traversal style names are neutralised',ev("docStoragePath('U1','D','../../etc/passwd')")==='users/U1/documents/D/_.._etc_passwd'||/^users\/U1\/documents\/D\/[A-Za-z0-9._-]+$/.test(ev("docStoragePath('U1','D','../../etc/passwd')")));
  const n=docs(w).length;
  mockBackend(w,{failPut:true});
  await upload(w,mkFile(w,'fail.pdf',100,'application/pdf'));
  ok('failed upload: no metadata saved, friendly error shown',docs(w).length===n&&/Upload failed/.test(w.document.getElementById('doc-upload-status').innerHTML));

  mockBackend(w);
  w.eval("dbSet('documents',(db('documents')||[]).concat([{id:'X1',ownerId:'OTHER',name:'theirs.pdf',category:'report',sizeKB:1,uploadedAt:1,storagePath:'users/U1/documents/X1/theirs.pdf'},{id:'E1',ownerId:currentPatientId(),name:'<img src=x onerror=alert(1)>.pdf',category:'report',sizeKB:1,uploadedAt:1,storagePath:'users/U1/documents/E1/a.pdf'},{id:'FOREIGN',ownerId:currentPatientId(),name:'f.pdf',category:'report',sizeKB:1,uploadedAt:1,storagePath:'users/SOMEONE_ELSE/documents/F/f.pdf'}]))");
  const html=ev('viewPatientDocuments()');
  ok('file names are HTML-escaped in the list',!html.includes('<img src=x onerror')&&html.includes('&lt;img src=x'));
  await w.eval("docOpenFromStorage('X1')");
  ok("cannot open another patient's document",w.__urls.length===0);
  await w.eval("docOpenFromStorage('FOREIGN')");
  ok('cannot open a path outside own auth uid',w.__urls.length===0);
  await w.eval("docOpenFromStorage('E1')");
  ok('own document opens via on-demand URL with noopener; URL not stored',w.__urls.length===1&&w.__opened.length===1&&!JSON.stringify(ev("db('documents')")).includes('token='));

  const sp=docs(w).find(x=>x.storagePath&&x.source==='upload');
  w.eval("deleteDocument('"+sp.id+"')");await new Promise(r=>setTimeout(r,30));
  ok('delete: Storage object removed and metadata removed',w.__removes.length===1&&w.__removes[0]===sp.storagePath&&!docs(w).some(x=>x.id===sp.id));
  const rm=w.__removes.length;w.eval("deleteDocument('X1')");await new Promise(r=>setTimeout(r,30));
  ok("delete: another owner's doc is not removed (and no Storage call)",docs(w).some(x=>x.id==='X1')&&w.__removes.length===rm);
  ok('flag on: no script errors',errs.length===0||console.log('   ',[...new Set(errs)])||false);

  /* ---------- static checks ---------- */
  const rules=fs.readFileSync(path.join(root,'storage.rules'),'utf8').replace(/\/\/.*$/gm,'');
  ok('storage.rules: owner-only read/delete',/allow read:\s*if request\.auth != null && request\.auth\.uid == uid/.test(rules)&&/allow delete:\s*if request\.auth != null && request\.auth\.uid == uid/.test(rules));
  ok('storage.rules: size capped at 10 MB and type limited on create',/size < 10 \* 1024 \* 1024/.test(rules)&&/application\/pdf\|image\/\.\*/.test(rules));
  ok('storage.rules: updates denied, no blanket allow',/allow update:\s*if false/.test(rules)&&!/allow (read|write)[^;]*:\s*if true/.test(rules)&&!/\{allPaths=\*\*\}/.test(rules));
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),idx=fs.readFileSync(path.join(root,'index.html'),'utf8');
  ok('sw.js never intercepts Storage hosts',/'firebasestorage\.googleapis\.com'/.test(sw)&&/'storage\.googleapis\.com'/.test(sw));
  ok('sw.js caches doc-storage.js and cache version bumped to v5',sw.includes('./js/services/doc-storage.js')&&/CACHE_VERSION = 'v5'/.test(sw));
  ok('index.html loads storage SDK before app scripts, doc-storage before my-documents',idx.indexOf('firebase-storage-compat.js')>0&&idx.indexOf('firebase-storage-compat.js')<idx.indexOf('js/services/doc-storage.js')&&idx.indexOf('doc-storage.js')<idx.indexOf('my-documents.js')&&idx.indexOf('my-documents.js')<idx.indexOf('js/main.js'));
  console.log(fails?'\n  '+fails+' CHECK(S) FAILED':'\n  ALL PHASE 3 CHECKS PASSED');process.exit(fails?1:0);
})();
