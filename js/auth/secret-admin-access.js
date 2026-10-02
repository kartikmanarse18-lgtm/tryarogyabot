/* ============================================================
   ADMIN DOOR
   ------------------------------------------------------------
   No visible link points to the admin desk. From any screen, staff can:
     1. Load the app with #staffdesk in the URL, or
     2. Type the word "staffdesk" anywhere in the app (outside input fields).
   The door word is PUBLIC and NOT a security control: it only shows the login box.
   The real protection is the secret staff phrase + passcode, which are checked on
   the admin worker (never stored in this repo). See js/auth/admin-desk.js.
   ============================================================ */
/* ADMIN_DOOR_WORD → moved to js/config/app-config.js */
let _secretKeyBuffer = '';
document.addEventListener('keydown', (e)=>{
  const tag = document.activeElement && document.activeElement.tagName;
  if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return; // don't hijack normal typing in forms
  if(e.ctrlKey || e.metaKey || e.altKey || e.key.length!==1) return;
  _secretKeyBuffer = (_secretKeyBuffer + e.key.toLowerCase()).slice(-ADMIN_DOOR_WORD.length);
  if(_secretKeyBuffer === ADMIN_DOOR_WORD){
    _secretKeyBuffer = '';
    openAdminGate();
  }
});
function checkSecretHashRoute(){
  if(location.hash.replace('#','').toLowerCase() === ADMIN_DOOR_WORD){
    openAdminGate();
  }
}
window.addEventListener('hashchange', checkSecretHashRoute);
