/* ============================================================
   BOOTSTRAP
   ============================================================ */
// Runs once at load; checkMedicineReminders() itself no-ops until a patient
// session is actually active, so it's safe to start unconditionally here
// rather than hunting down every login/session-restore path.
startMedicineReminderClock();
(async function boot(){
  // Wait for Firebase Auth to finish restoring its persisted session (or confirm
  // there isn't one) BEFORE touching Firestore at all. Skipping this used to let
  // restoreActiveSession() render the console and fire dbSet()/audit() calls
  // while request.auth was still null, causing "Missing or insufficient
  // permissions" on nearly every read/write right after a reload — even for a
  // genuinely logged-in user. See waitForAuthReady()/markAuthReady() above.
  await waitForAuthReady();
  initFirebaseSync();
  // If a console session was saved (from a previous login on this device), restore it
  // straight into the console instead of bouncing back to role selection. Otherwise,
  // fall back to the original behaviour: start at role selection.
  if(restoreActiveSession()){ checkSecretHashRoute(); return; }
  document.getElementById('screen-splash').classList.add('hidden');
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-landing').classList.remove('hidden');
  checkSecretHashRoute();
})();
