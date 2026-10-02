/* ============================================================
   NATIVE BRIDGE — makes the Android app (Capacitor) deliver REAL
   notifications. In a plain browser/PWA none of this runs (except
   the push relay in section 1, which is harmless everywhere).

   WHY THIS EXISTS
   The web Notification API only works while the page is alive, and
   Android freezes a WebView in the background within minutes. So:
     • Medicine reminders are handed to Android's alarm manager as
       *scheduled local notifications* (section 3). They fire at the
       right time even if the app is closed or the phone rebooted.
     • Events for someone else's inbox (a new dispatch request, an
       incoming patient, an e-prescription) are relayed to a tiny
       Cloudflare Worker that sends a Firebase Cloud Messaging push to
       that person's phone(s) (sections 1 + 4). See worker/push-worker.js.
     • Every in-app alert that the web build shows via
       sendBrowserNotification() is shown as a real Android
       notification instead (section 2).

   Loaded AFTER notification-sound.js / notification-center.js /
   medicine-reminder-clock.js / profile-menu.js because it wraps
   functions defined there. Plugins are reached through
   window.Capacitor.Plugins (no bundler needed).
   ============================================================ */

/* ---------- 1) Push relay: runs on EVERY client (web or native) ----------
   When this device writes a notification into ANOTHER scope's inbox
   (pushNotification() in notification-center.js), also ask the push
   Worker to ring that person's phone. No-op until PUSH_WORKER_URL is set. */
(function installPushRelay(){
  if(typeof pushNotification!=='function') return;
  const origPush = pushNotification;
  pushNotification = function(scope, title, body, type, incidentId){
    const item = origPush.apply(this, arguments);
    try{
      if(PUSH_WORKER_URL && typeof scopeMatchesCurrent==='function' && !scopeMatchesCurrent(scope)
         && typeof firebase!=='undefined' && firebase.auth && firebase.auth().currentUser){
        firebase.auth().currentUser.getIdToken().then(tok=>
          fetch(PUSH_WORKER_URL.replace(/\/$/,'')+'/notify', {
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
            body: JSON.stringify({scope, title, body: body||'', type: type||'info', incidentId: incidentId||null, notifId: item && item.id})
          })
        ).catch(e=>console.warn('Push relay failed (in-app inbox still delivered)', e));
      }
    }catch(e){ console.warn('Push relay error', e); }
    return item;
  };
})();

if(IS_NATIVE_APP){
(function installNativeBridge(){
  const P = window.Capacitor.Plugins || {};
  const LN = P.LocalNotifications, PN = P.PushNotifications, APP = P.App;
  if(!LN){ console.warn('LocalNotifications plugin missing — native notifications disabled'); return; }

  const CH_ALERTS = 'arogya_alerts', CH_REMINDERS = 'arogya_reminders', CH_GENERAL = 'arogya_general';
  const ICON = 'ic_stat_arogya', COLOR = '#10b981';
  let perm = 'default';            // 'granted' | 'denied' | 'default'  (what the rest of the app expects)
  window.__nativeExactAlarm = 'unknown';
  const scheduledReminderIds = new Set();
  let lastReminderSig = null;

  // Stable positive 31-bit int from a string (Android notification ids must be ints).
  function nid(str){ let h = 5381; for(let i=0;i<str.length;i++){ h = ((h*33) ^ str.charCodeAt(i)) >>> 0; } return (h % 2147483000) + 1; }
  const mapPerm = p => p==='granted' ? 'granted' : p==='denied' ? 'denied' : 'default';
  const safe = (p, label) => Promise.resolve(p).catch(e=>{ console.warn('[native] '+label+' failed', e); });

  async function refreshPerm(){
    try{ const r = await LN.checkPermissions(); perm = mapPerm(r.display); }catch(e){}
    try{ const x = await LN.checkExactNotificationSetting(); window.__nativeExactAlarm = x.exact_alarm; }catch(e){}
    return perm;
  }
  async function createChannels(){
    const mk = c => safe(LN.createChannel(c), 'createChannel '+c.id);
    await mk({id: CH_ALERTS,    name:'Emergency & dispatch alerts', description:'SOS, dispatch requests and urgent updates', importance:5, visibility:1, vibration:true, lights:true, lightColor:'#EF4444'});
    await mk({id: CH_REMINDERS, name:'Medicine reminders',          description:'Dose-time reminders',                      importance:5, visibility:1, vibration:true, lights:true, lightColor:'#10B981'});
    await mk({id: CH_GENERAL,   name:'General updates',             description:'Appointments, prescriptions, deliveries',   importance:3, visibility:1, vibration:true});
  }
  const ready = (async()=>{ await refreshPerm(); await createChannels(); })();

  /* ---------- 2) Make the app's existing notification helpers native ---------- */
  notifSupported = function(){ return true; };
  notifPermission = function(){ return perm; };
  requestNotifPermission = async function(){
    try{ const r = await LN.requestPermissions(); perm = mapPerm(r.display); }catch(e){}
    await refreshPerm();
    if(perm==='granted'){
      showToast('Notifications enabled', 'ArogyaBot can now alert you even when the app is closed.', 'success');
      await createChannels();
      syncMedicineReminders(true);
      registerPush();
    } else {
      showToast('Notifications blocked', 'Open Android Settings ➜ Apps ➜ ArogyaBot ➜ Notifications to turn them on.', 'warning');
    }
    if(document.getElementById('bell-panel') && typeof renderBellPanel==='function') renderBellPanel();
    if(typeof renderCurrentView==='function' && typeof currentView!=='undefined') renderCurrentView(currentView);
  };
  window.nativeAllowExactAlarms = async function(){
    try{ await LN.changeExactNotificationSetting(); }catch(e){ console.warn(e); }
    setTimeout(async()=>{ await refreshPerm(); if(typeof renderCurrentView==='function' && typeof currentView!=='undefined') renderCurrentView(currentView); }, 800);
  };
  sendBrowserNotification = function(title, body, type, tag){
    if(perm!=='granted') return;
    // Dose alarms are already scheduled natively and will fire on their own — don't double up.
    if(tag && tag.indexOf('medrem-')===0 && scheduledReminderIds.has(tag.slice(7))) return;
    safe(LN.schedule({notifications:[{
      id: nid('n:'+(tag || (title+Date.now()))),
      title, body: body||'',
      channelId: type==='danger' ? CH_ALERTS : CH_GENERAL,
      smallIcon: ICON, iconColor: COLOR,
      extra: {kind:'inapp', type: type||'info', tag: tag||null}
    }]}), 'schedule immediate');
  };

  /* ---------- 3) Medicine reminders → Android alarm manager ---------- */
  function myActiveReminders(){
    if(typeof currentRole==='undefined' || currentRole!=='patient') return [];
    const pid = currentPatientId();
    return (db('reminders')||[]).filter(r=>{
      if(r.ownerId!==pid || !r.on || !/^\d{1,2}:\d{2}$/.test(r.time||'')) return false;
      const rf = typeof refillStatus==='function' ? refillStatus(r) : null;
      return !(rf && rf.remaining===0);          // course finished — stop alerting
    });
  }
  async function cancelAllReminderNotifs(){
    try{
      const pend = await LN.getPending();
      const mine = (pend.notifications||[]).filter(n=>n.extra && (n.extra.kind==='medrem' || n.extra.kind==='medsnooze'));
      if(mine.length) await LN.cancel({notifications: mine.map(n=>({id:n.id}))});
    }catch(e){ console.warn('[native] cancel reminders failed', e); }
    scheduledReminderIds.clear();
  }
  async function syncMedicineReminders(force){
    await ready;
    if(perm!=='granted') return;
    const list = myActiveReminders();
    const sig = JSON.stringify(list.map(r=>[r.id, r.med, r.time]).sort());
    if(!force && sig===lastReminderSig) return;
    lastReminderSig = sig;
    await cancelAllReminderNotifs();
    if(!list.length) return;
    const notifications = list.map(r=>{
      const [h, m] = r.time.split(':').map(Number);
      return {
        id: nid('rem:'+r.id),
        title: r.med+' — dose due now',
        body: 'Scheduled for '+r.time+'. Tap to open ArogyaBot and log it.',
        channelId: CH_REMINDERS,
        smallIcon: ICON, iconColor: COLOR,
        schedule: {on:{hour:h, minute:m}, allowWhileIdle:true},   // repeats every day
        extra: {kind:'medrem', rid:r.id}
      };
    });
    try{
      await LN.schedule({notifications});
      list.forEach(r=>scheduledReminderIds.add(r.id));
    }catch(e){ console.warn('[native] schedule reminders failed', e); lastReminderSig = null; }
  }
  window.syncMedicineReminders = syncMedicineReminders;

  // Re-sync whenever the reminders list is written.
  const origDbSet = dbSet;
  let syncTimer = null;
  dbSet = function(key, val){
    const out = origDbSet.apply(this, arguments);
    if(key==='reminders'){ clearTimeout(syncTimer); syncTimer = setTimeout(()=>syncMedicineReminders(false), 400); }
    return out;
  };
  // Snooze → one-off native notification at the snooze time.
  if(typeof snoozeReminder==='function'){
    const origSnooze = snoozeReminder;
    snoozeReminder = function(id){
      origSnooze.apply(this, arguments);
      const item = (db('reminders')||[]).find(x=>x.id===id);
      if(item && item.snoozeUntil && perm==='granted'){
        safe(LN.schedule({notifications:[{
          id: nid('snz:'+id), title: item.med+' — dose due now (snoozed)', body:'Tap to open ArogyaBot and log it.',
          channelId: CH_REMINDERS, smallIcon: ICON, iconColor: COLOR,
          schedule:{at:new Date(item.snoozeUntil), allowWhileIdle:true}, extra:{kind:'medsnooze', rid:id}
        }]}), 'schedule snooze');
      }
    };
  }
  // Responding inside the app clears the matching tray notification.
  if(typeof dismissAlarm==='function'){
    const origDismiss = dismissAlarm;
    dismissAlarm = function(action){
      const rid = (typeof ringingAlarm!=='undefined' && ringingAlarm) ? ringingAlarm.id : null;
      origDismiss.apply(this, arguments);
      if(rid) safe(LN.removeDeliveredNotifications({notifications:[{id:nid('rem:'+rid)},{id:nid('snz:'+rid)}]}), 'clear delivered');
    };
  }

  /* ---------- 4) Remote push (FCM) — only when explicitly enabled ----------
     Needs android/app/google-services.json (see NATIVE_APP.md). Calling
     PushNotifications.register() without it crashes the app, hence the flag. */
  let pushListenersAdded = false, pushToken = null;
  function pushDocRef(scope){
    if(!fbEnabled || !scope || typeof firebase==='undefined') return null;
    return firebase.firestore().collection('inbox').doc(scope).collection('data').doc('push');
  }
  function uploadPushToken(){
    const scope = myNotificationScopeToken();
    const ref = pushDocRef(scope);
    if(!ref || !pushToken) return;
    ref.set({tokens: firebase.firestore.FieldValue.arrayUnion(pushToken), updatedAt: Date.now()}, {merge:true})
      .catch(e=>console.warn('[native] push token upload failed (check Firestore rules for inbox/*/data/push)', e));
  }
  async function registerPush(){
    await ready;
    if(!NATIVE_PUSH_ENABLED || !PN || perm!=='granted') return;
    try{
      if(!pushListenersAdded){
        pushListenersAdded = true;
        PN.addListener('registration', t=>{ pushToken = t.value; uploadPushToken(); });
        PN.addListener('registrationError', e=>console.warn('[native] FCM registration error', e));
        // Foreground pushes need no UI: the Firestore inbox listener already shows the toast + sound.
        PN.addListener('pushNotificationActionPerformed', ()=>{ /* app is now in front; nothing else to do */ });
      }
      if(pushToken){ uploadPushToken(); return; }
      let p = await PN.checkPermissions();
      if(p.receive!=='granted') p = await PN.requestPermissions();
      if(p.receive==='granted') await PN.register();
    }catch(e){ console.warn('[native] push registration failed', e); }
  }

  // Sign in → schedule this person's reminders + register their phone for push.
  if(typeof initNotificationSync==='function'){
    const origInit = initNotificationSync;
    initNotificationSync = function(){
      origInit.apply(this, arguments);
      ready.then(()=>{ syncMedicineReminders(true); registerPush(); });
    };
  }
  // Sign out → this phone must stop ringing for the previous account.
  if(typeof logout==='function'){
    const origLogout = logout;
    logout = function(){
      const scope = (typeof myNotificationScopeToken==='function') ? myNotificationScopeToken() : null;
      const out = origLogout.apply(this, arguments);
      lastReminderSig = null;
      cancelAllReminderNotifs();
      safe(LN.removeAllDeliveredNotifications(), 'clear tray');
      const ref = pushDocRef(scope);
      if(ref && pushToken){ ref.set({tokens: firebase.firestore.FieldValue.arrayRemove(pushToken)}, {merge:true}).catch(()=>{}); }
      return out;
    };
  }

  /* ---------- 5) Taps, app resume, Android back button ---------- */
  safe(LN.addListener('localNotificationActionPerformed', ev=>{
    const extra = (ev && ev.notification && ev.notification.extra) || {};
    if((extra.kind==='medrem' || extra.kind==='medsnooze') && typeof currentRole!=='undefined' && currentRole==='patient' && typeof renderCurrentView==='function'){
      renderCurrentView('p-pharmacy');
    }
  }), 'addListener tap');
  if(APP){
    safe(APP.addListener('appStateChange', async ({isActive})=>{
      if(!isActive) return;
      await refreshPerm();                 // user may have changed permission in Settings
      syncMedicineReminders(false);
      // Android freezes WebView timers/sockets in the background, so a live-dispatch socket can
      // look OPEN but be dead. Closing them triggers openSosSocket()'s own auto-reconnect, which
      // also re-sends a fresh snapshot of any incident that changed while the app was away.
      try{ Object.values(window.__sosSockets||{}).forEach(ws=>{ try{ ws.close(); }catch(e){} }); }catch(e){}
      if(typeof refreshBell==='function') refreshBell();
    }), 'addListener appState');
    safe(APP.addListener('backButton', ()=>{
      const overlay = document.getElementById('modal-overlay');
      const bell = document.getElementById('bell-panel');
      if(overlay && !overlay.classList.contains('hidden') && !(typeof ringingAlarm!=='undefined' && ringingAlarm)){ closeModal(); return; }
      if(bell && !bell.classList.contains('hidden')){ bell.classList.add('hidden'); return; }
      // Never hard-exit mid-emergency / mid-call — just send the app to the background.
      APP.minimizeApp();
    }), 'addListener back');
  }
})();
}
