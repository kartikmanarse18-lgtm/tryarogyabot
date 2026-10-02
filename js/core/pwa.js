/* ============================================================
   PWA — service worker registration + "Add to Home Screen" prompt.
   Registered with a RELATIVE path ('./sw.js') and no explicit scope
   argument, so its scope defaults to the directory index.html is
   served from — correct whether this is deployed as a GitHub Pages
   user site (root) or a project site (a subpath). Wrapped in a
   feature check + try/catch so a browser without SW support (or a
   file opened straight from disk, where the API doesn't exist at all)
   just silently skips this instead of throwing.
   ============================================================ */
// Inside the Android app the files ship inside the APK, so a service worker would only
// get in the way (and would cache stale copies after an app update).
if('serviceWorker' in navigator && !IS_NATIVE_APP){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Service worker registration failed', e));
  });
}
// Chrome/Edge/Android fire this instead of showing their own install UI
// immediately, so a custom "Install app" button (topbar + landing page)
// can trigger the native prompt on demand. iOS Safari never fires this —
// there's no programmatic install prompt there, only the manual Share ➜
// "Add to Home Screen" flow, so the button just stays hidden on iOS.
let __pwaDeferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  __pwaDeferredPrompt = e;
  ['pwa-install-btn','pwa-install-btn-landing'].forEach(id=>{
    const btn = document.getElementById(id);
    if(btn) btn.classList.remove('hidden');
  });
});
async function triggerPwaInstall(){
  if(!__pwaDeferredPrompt){ showToast('Already installed (or not supported)', 'Use your browser\'s menu ➜ "Add to Home Screen" / "Install app" if you don\'t see a prompt.', 'info'); return; }
  __pwaDeferredPrompt.prompt();
  await __pwaDeferredPrompt.userChoice.catch(()=>{});
  __pwaDeferredPrompt = null;
  ['pwa-install-btn','pwa-install-btn-landing'].forEach(id=>{
    const btn = document.getElementById(id);
    if(btn) btn.classList.add('hidden');
  });
}
window.addEventListener('appinstalled', ()=>{
  __pwaDeferredPrompt = null;
  ['pwa-install-btn','pwa-install-btn-landing'].forEach(id=>{
    const btn = document.getElementById(id);
    if(btn) btn.classList.add('hidden');
  });
  audit('system', 'pwa', 'App installed to home screen/desktop');
});
