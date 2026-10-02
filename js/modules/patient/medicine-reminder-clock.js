/* ============================================================
   MEDICINE REMINDER CLOCK — reminders used to just store a time and
   wait for a manual tap; nothing was ever watching the clock, so a
   reminder never actually fired (no sound, no alert) and there was no
   "enable notifications" option either. This adds:
     1) A clock that checks every active reminder's time each tick and,
        on a match, RINGS like an alarm — sound + vibration repeat, and
        a forced on-screen dialog stays up — until the person Takes,
        Marks missed, or Snoozes it, not just a single beep that's easy
        to sleep through. The ring itself auto-silences after the
        configured "ring for how long" duration (Notification sound &
        alerts settings, shared with every role) if untouched, but the
        dialog stays open so a late response still logs correctly.
     2) A real browser Notification (if permission was granted) so it
        can surface even if ArogyaBot is a background tab, with the
        medicine's name right in the notification-bar text.
     Custom sound and ring duration are configured once, app-wide, from
     the bell icon's "Notification sound & alerts" settings — the same
     place every other role configures its own alerts — rather than a
     medicine-only copy of those controls.
   ============================================================ */
function medReminderNotifBannerHTML(){
  const perm = notifPermission();
  if(perm==='granted'){
    const exactBtn = (IS_NATIVE_APP && window.__nativeExactAlarm && window.__nativeExactAlarm!=='granted' && window.__nativeExactAlarm!=='unknown')
      ? ` <button class="btn btn-sm btn-secondary" style="margin-left:6px;" onclick="nativeAllowExactAlarms()"><i class="fa-solid fa-clock"></i> Allow on-the-minute alarms</button>` : '';
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;color:var(--brand-primary);font-size:.82rem;"><span><i class="fa-solid fa-circle-check"></i> Notifications enabled — you'll be alerted when a dose is due${IS_NATIVE_APP?', even if the app is closed':''}.</span>${exactBtn}</div>`;
  }
  if(perm==='unsupported') return '';
  const blocked = perm==='denied';
  return `<div class="reminder-row" style="background:rgba(13,148,136,.08);border:1px solid rgba(13,148,136,.3);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
    <div style="font-size:.82rem;"><i class="fa-solid fa-bell" style="color:var(--brand-primary);"></i> ${blocked ? (IS_NATIVE_APP ? 'Notifications are blocked — turn them on in Android Settings ➜ Apps ➜ ArogyaBot ➜ Notifications to get dose alerts.' : 'Notifications are blocked for this site — enable them in your browser\'s site settings to get dose alerts.') : 'Turn on notifications so a reminder can alert you with a sound at dose time.'}</div>
    ${blocked ? '' : `<button class="btn btn-sm" onclick="requestNotifPermission()"><i class="fa-solid fa-bell"></i> Enable notifications</button>`}
  </div>`;
}

// ---- The alarm itself: rings (sound + vibration, repeating) and forces a
// dialog until dismissed or the ring duration elapses, instead of a single
// beep that's easy to miss. If more than one reminder is due at once, they
// ring one at a time.
let ringingAlarm = null; // {id, med, time, soundTimer, vibTimer, silenceTimeout}
let alarmQueue = [];
function fireMedicineReminder(r){
  alarmQueue.push(r);
  if(!ringingAlarm) advanceAlarmQueue();
}
function advanceAlarmQueue(){
  if(!alarmQueue.length){ ringingAlarm = null; return; }
  startRingingAlarm(alarmQueue.shift());
}
function startRingingAlarm(r){
  ringingAlarm = {id:r.id, med:r.med, time:r.time};
  playNotificationSound('danger');
  ringingAlarm.soundTimer = setInterval(()=>playNotificationSound('danger'), 2500);
  if(navigator.vibrate){
    navigator.vibrate([400,200,400]);
    ringingAlarm.vibTimer = setInterval(()=>navigator.vibrate([400,200,400]), 2500);
  }
  // Auto-silence after the configured ring duration if nobody's responded —
  // the dialog itself stays open so Taken/Missed/Snooze still work after.
  ringingAlarm.silenceTimeout = setTimeout(()=>{ if(ringingAlarm && ringingAlarm.id===r.id) muteRingingAlarmSound(); }, getRingSeconds()*1000);
  sendBrowserNotification(r.med+' — dose due now', 'Scheduled for '+r.time+'. Tap to open ArogyaBot and log it.', 'danger', 'medrem-'+r.id);
  // An alarm should interrupt, so this replaces whatever else is in the modal.
  openModal(`
    <h3 style="margin-top:0;"><i class="fa-solid fa-bell" style="color:var(--brand-danger);"></i> Time for your medicine</h3>
    <p class="modal-sub">${attr(r.med)} — scheduled for ${r.time}. Ringing until you respond.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn" onclick="dismissAlarm('taken')"><i class="fa-solid fa-check"></i> Taken</button>
      <button class="btn btn-secondary" onclick="dismissAlarm('missed')"><i class="fa-solid fa-xmark"></i> Missed</button>
      <button class="btn btn-secondary" onclick="dismissAlarm('snooze')"><i class="fa-solid fa-clock"></i> Snooze 5 min</button>
    </div>`);
}
function muteRingingAlarmSound(){
  if(!ringingAlarm) return;
  if(ringingAlarm.soundTimer){ clearInterval(ringingAlarm.soundTimer); ringingAlarm.soundTimer=null; }
  if(ringingAlarm.vibTimer){ clearInterval(ringingAlarm.vibTimer); ringingAlarm.vibTimer=null; }
  if(navigator.vibrate) navigator.vibrate(0);
}
function stopRingingAlarm(){
  if(!ringingAlarm) return;
  muteRingingAlarmSound();
  if(ringingAlarm.silenceTimeout) clearTimeout(ringingAlarm.silenceTimeout);
}
function dismissAlarm(action){
  if(!ringingAlarm) return;
  const id = ringingAlarm.id;
  stopRingingAlarm();
  closeModal();
  if(action==='taken' || action==='missed') logDose(id, action);
  else if(action==='snooze') snoozeReminder(id);
  advanceAlarmQueue();
}
function snoozeReminder(id){
  const all = db('reminders')||[];
  const item = all.find(x=>x.id===id);
  if(!item) return;
  item.snoozeUntil = Date.now()+5*60000;
  dbSet('reminders', all);
  showToast('Snoozed', item.med+' — reminding again in 5 minutes.', 'info');
}
function checkMedicineReminders(){
  if(currentRole!=='patient') return;
  const all = db('reminders')||[];
  const mine = all.filter(r=>r.ownerId===currentPatientId() && r.on);
  if(!mine.length) return;
  const d = new Date();
  const nowHM = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  const today = todayKey();
  const nowMs = Date.now();
  let changed = false;
  mine.forEach(r=>{
    if(r.snoozeUntil && nowMs>=r.snoozeUntil){
      delete r.snoozeUntil;
      r.lastFiredDate = today;
      changed = true;
      fireMedicineReminder(r);
      return;
    }
    if(r.time===nowHM && r.lastFiredDate!==today){
      r.lastFiredDate = today;
      changed = true;
      fireMedicineReminder(r);
    }
  });
  if(changed) dbSet('reminders', all);
}
let MED_REMINDER_CLOCK = null;
function startMedicineReminderClock(){
  if(MED_REMINDER_CLOCK) return;
  checkMedicineReminders();
  MED_REMINDER_CLOCK = setInterval(checkMedicineReminders, 20000);
}
