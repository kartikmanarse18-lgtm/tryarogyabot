/* ============================================================
   SECRET ADMIN ACCESS
   ------------------------------------------------------------
   No visible link points to the admin desk anywhere in the UI.
   Staff reach it one of two ways, from any screen:
     1. Load/navigate the app with #opsdesk in the URL —
        e.g. https://yoursite.com/arogyabot.html#opsdesk
     2. Type the word "opsdesk" anywhere in the app (no need to
        click into a field — just start typing on any screen).
   Either way just reveals the passcode gate; ADMIN_PASSCODE above
   still has to be entered correctly. Change ADMIN_SECRET_PHRASE
   here (and ADMIN_PASSCODE above) before real-world use.
   ============================================================ */
/* ADMIN_SECRET_PHRASE → moved to js/config/app-config.js */
let _secretKeyBuffer = '';
document.addEventListener('keydown', (e)=>{
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return; // don't hijack normal typing in forms
  if(e.ctrlKey || e.metaKey || e.altKey || e.key.length!==1) return;
  _secretKeyBuffer = (_secretKeyBuffer + e.key.toLowerCase()).slice(-ADMIN_SECRET_PHRASE.length);
  if(_secretKeyBuffer === ADMIN_SECRET_PHRASE){
    _secretKeyBuffer = '';
    openAdminGate();
  }
});
function checkSecretHashRoute(){
  if(location.hash.replace('#','').toLowerCase() === ADMIN_SECRET_PHRASE){
    openAdminGate();
  }
}
window.addEventListener('hashchange', checkSecretHashRoute);
