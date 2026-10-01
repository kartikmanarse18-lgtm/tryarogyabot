/* ============================================================
   NOTIFICATION CENTER — PHASE 1: per-scope inbox, not a shared array.
   Each scope ('patient:MEM123', 'hospital:HOSP-01', ...) used to be a
   filter applied client-side to ONE global 'notifications' array that
   every connected device of every role held a live listener on — so a
   notification meant for one hospital re-rendered every patient's,
   pharmacy's, and responder's bell too. Every real call site in this
   app always targets exactly one specific role+id (checked — no
   broadcast/wildcard scope is ever actually used), so each notification
   now goes straight to that one scope's own inbox doc, and a device
   only ever listens to its own scope's inbox.
   ============================================================ */
// scope examples: 'patient:MEM123', 'responder:RSP-01', 'hospital:HOSP-01'
function myNotificationScopeToken(){
  if(currentRole==='patient') return 'patient:'+currentPatientId();
  if(currentRole==='hospital') return CURRENT_HOSPITAL_ID ? 'hospital:'+CURRENT_HOSPITAL_ID : null;
  if(currentRole==='responder') return CURRENT_RESPONDER_ID ? 'responder:'+CURRENT_RESPONDER_ID : null;
  if(currentRole==='police') return CURRENT_POLICE_STATION_ID ? 'police:'+CURRENT_POLICE_STATION_ID : null;
  if(currentRole==='pharmacy') return CURRENT_PHARMACY_ID ? 'pharmacy:'+CURRENT_PHARMACY_ID : null;
  if(currentRole==='doctor') return CURRENT_DOCTOR_ID ? 'doctor:'+CURRENT_DOCTOR_ID : null;
  if(currentRole==='delivery') return CURRENT_DELIVERY_ID ? 'delivery:'+CURRENT_DELIVERY_ID : null;
  return null;
}
function notifInboxRef(scopeToken){
  if(!fbEnabled || !scopeToken || typeof firebase==='undefined') return null;
  return firebase.firestore().collection('inbox').doc(scopeToken).collection('data').doc('notifications');
}
function deleteNotificationInbox(scopeToken){
  const ref = notifInboxRef(scopeToken);
  if(ref) ref.delete().catch(e=>console.warn('Failed to delete inbox for', scopeToken, e));
}
// Writes MY OWN inbox (used for read/unread/clear on notifications I can see).
function persistLocalNotifications(list){
  LOCAL_CACHE['notifications'] = list;
  try{ localStorage.setItem('abot2_notifications', JSON.stringify(list)); }catch(e){}
  const ref = notifInboxRef(myNotificationScopeToken());
  if(!ref) return;
  const updatedAt = Date.now();
  LAST_LOCAL_WRITE_AT['notifications'] = updatedAt;
  ref.set({data: list, updatedAt}).catch(e=>console.warn('Notification sync failed', e));
}
function pushNotification(scope, title, body, type, incidentId){
  const item = {id:uid('NTF'), scope, title, body, type: type||'info', incidentId: incidentId||null, ts: now(), read:false};
  audit(scope, 'notification', title);
  if(scopeMatchesCurrent(scope)){
    // Targeting my own open console — update locally (instant) and persist to my own inbox.
    const n = db('notifications') || [];
    n.unshift(item);
    persistLocalNotifications(n.slice(0,400));
    showToast(title, body, type);
    ringForEvent(item.type);
    sendBrowserNotification(title, body, item.type, 'ntf-'+item.id);
  } else if(fbEnabled){
    // Targeting a DIFFERENT scope's inbox — write directly there. arrayUnion means
    // we never need to read that scope's full list down to this device first.
    const ref = notifInboxRef(scope);
    if(ref && typeof firebase!=='undefined'){
      ref.set({data: firebase.firestore.FieldValue.arrayUnion(item), updatedAt: Date.now()}, {merge:true})
        .catch(e=>console.warn('Remote notification write failed for', scope, e));
    }
  }
  refreshBell();
  return item;
}
let NOTIF_SYNC_UNSUB = null;
/* Removes the still-actionable alerts ("New dispatch request", "Dispatch escalation")
   for a case that is no longer open to this unit, so the bell doesn't keep inviting
   someone to accept a case another unit already took. */
function retireDispatchAlerts(incidentId){
  const all = db('notifications') || [];
  const kept = all.filter(n=>!(n.incidentId===incidentId && (n.title==='New dispatch request' || n.title==='Dispatch escalation')));
  if(kept.length!==all.length){ persistLocalNotifications(kept); }
  const panel = document.getElementById('bell-panel');
  if(panel && !panel.classList.contains('hidden')) renderBellPanel();
  refreshBell();
}
function initNotificationSync(){
  teardownNotificationSync();
  const token = myNotificationScopeToken();
  const ref = notifInboxRef(token);
  if(!ref) return;
  ref.get().then(snap=>{
    if(snap.exists){
      LOCAL_CACHE['notifications'] = snap.data().data || [];
      try{ localStorage.setItem('abot2_notifications', JSON.stringify(LOCAL_CACHE['notifications'])); }catch(e){}
    } else if(LOCAL_CACHE['notifications']===undefined){
      LOCAL_CACHE['notifications'] = [];
    }
    refreshBell();
    NOTIF_SYNC_UNSUB = ref.onSnapshot(liveSnap=>{
      if(!liveSnap.exists) return;
      if(liveSnap.metadata.hasPendingWrites) return;
      const data = liveSnap.data();
      if(LAST_LOCAL_WRITE_AT['notifications'] && data.updatedAt === LAST_LOCAL_WRITE_AT['notifications']) return;
      const prevList = LOCAL_CACHE['notifications'] || [];
      const newList = data.data || [];
      // This device didn't write these itself (that path is handled in
      // pushNotification() above) — it just received them from another
      // device's write to this same inbox. Play a sound for whichever new
      // item(s) actually arrived, so a remote alert (e.g. dispatch info
      // pushed from the SOS Worker/another tab) is heard here too.
      const seenIds = new Set(prevList.map(x=>x.id));
      const arrived = newList.filter(x=>!seenIds.has(x.id));
      LOCAL_CACHE['notifications'] = newList;
      try{ localStorage.setItem('abot2_notifications', JSON.stringify(LOCAL_CACHE['notifications'])); }catch(e){}
      refreshBell();
      if(arrived.length){
        // Loudest/most-urgent type wins if several landed in the same tick.
        const loudest = arrived.some(x=>x.type==='danger') ? 'danger' : arrived.some(x=>x.type==='success') ? 'success' : 'info';
        ringForEvent(loudest);
        // Notification bar gets the specific text for each item that arrived
        // (e.g. "New dispatch request" / "Incoming patient confirmed"), not
        // just a generic "you have alerts" — same treatment every role gets.
        arrived.forEach(x=>sendBrowserNotification(x.title, x.body, x.type, 'ntf-'+x.id));
      }
      if(document.getElementById('bell-panel') && !document.getElementById('bell-panel').classList.contains('hidden')) renderBellPanel();
    });
  }).catch(e=>console.warn('Notification inbox fetch failed', e));
}
function teardownNotificationSync(){
  if(NOTIF_SYNC_UNSUB){ try{ NOTIF_SYNC_UNSUB(); }catch(e){} NOTIF_SYNC_UNSUB = null; }
}
function scopeMatchesCurrent(scope){
  if(!currentRole) return false;
  return scope === myNotificationScopeToken();
}
// Everything currently in LOCAL_CACHE['notifications'] already belongs to my
// own scope's inbox — no client-side filtering needed anymore.
function notificationsForCurrentScope(){
  return db('notifications') || [];
}
function refreshBell(){
  const list = notificationsForCurrentScope();
  const unread = list.filter(x=>!x.read).length;
  const dot = document.getElementById('bell-count');
  if(!dot) return;
  if(unread>0){ dot.textContent = unread>9?'9+':unread; dot.classList.remove('hidden'); } else { dot.classList.add('hidden'); }
}
function toggleBell(e){
  e.stopPropagation();
  const panel = document.getElementById('bell-panel');
  if(panel.classList.contains('hidden')){
    renderBellPanel();
    panel.classList.remove('hidden');
    stopGenRing(); // opening the bell = acknowledging whatever's ringing
  } else {
    panel.classList.add('hidden');
  }
}
document.addEventListener('click', (e)=>{
  const panel = document.getElementById('bell-panel');
  if(panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !e.target.closest('.bell-btn')){
    panel.classList.add('hidden');
  }
});
function renderBellPanel(){
  const panel = document.getElementById('bell-panel');
  const list = notificationsForCurrentScope().slice(0,25);
  const n = db('notifications') || [];
  n.forEach(x=>{ if(list.includes(x)) x.read = true; });
  persistLocalNotifications(n);
  panel.innerHTML = `<div class="bell-panel-head"><span>Notifications</span><span style="display:flex;align-items:center;gap:6px;">
      <button class="btn-secondary btn-sm" style="padding:3px 9px;font-size:.7rem;" onclick="openSoundSettingsModal(event)" title="Notification sound settings"><i class="fa-solid fa-sliders"></i></button>
      <button class="btn-secondary btn-sm" style="padding:3px 9px;font-size:.7rem;" onclick="toggleSoundMuted(event)" title="${isSoundMuted()?'Turn notification sound on':'Turn notification sound off'}"><i class="fa-solid ${isSoundMuted()?'fa-volume-xmark':'fa-volume-high'}"></i></button>
      ${list.length ? `<button class="btn-secondary btn-sm" style="padding:3px 9px;font-size:.7rem;" onclick="clearAllNotifications(event)">Clear all</button>` : ``}
    </span></div>` +
    (list.length ? list.map(x=>`
      <div class="bell-item ${x.read?'':'unread'}" ${x.incidentId?`onclick="openNotificationTarget('${x.incidentId}')" style="cursor:pointer;"`:''}>
        <i class="fa-solid ${iconForType(x.type)}"></i>
        <div>
          <div class="bell-item-title">${x.title}</div>
          <div class="bell-item-body">${x.body}</div>
          <div class="bell-item-time">${relTime(x.ts)}</div>
        </div>
      </div>`).join('') : `<div class="bell-empty">No notifications yet</div>`);
  refreshBell();
}
function relTime(ts){
  const diffSec = Math.max(0, Math.round((Date.now()-ts)/1000));
  if(diffSec<60) return 'just now';
  const diffMin = Math.round(diffSec/60);
  if(diffMin<60) return diffMin+'m ago';
  const diffHr = Math.round(diffMin/60);
  if(diffHr<24) return diffHr+'h ago';
  return fmtTime(ts);
}
function clearAllNotifications(e){
  if(e) e.stopPropagation();
  persistLocalNotifications([]);
  renderBellPanel();
}
// Deep-links a notification straight to the relevant live view for the
// current role, so tapping "Ambulance dispatched" etc. actually takes you
// somewhere instead of just sitting in the panel.
function openNotificationTarget(incidentId){
  document.getElementById('bell-panel').classList.add('hidden');
  const targetByRole = {patient:'p-sos', responder:'r-active', police:'po-feed', hospital:'h-incoming', pharmacy:'ph-orders'};
  const target = targetByRole[currentRole];
  if(target) renderCurrentView(target);
}
function iconForType(t){
  return {danger:'fa-triangle-exclamation', success:'fa-circle-check', info:'fa-circle-info', dispatch:'fa-truck-medical'}[t] || 'fa-circle-info';
}
