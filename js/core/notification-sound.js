/* ============================================================
   NOTIFICATION SOUND — a real, synthesized audio alert (Web Audio API —
   no external sound file to host or fail to load) so a new notification
   is actually HEARD, not just shown as a toast/bell dot. 'danger'
   notifications (SOS, dispatch, emergencies) always play as an urgent
   triple-beep and 'success' as a rising two-tone, regardless of style —
   only the WAVEFORM/pitch (the actual timbre) and volume change, via the
   picker below, so an emergency is never mistaken for a soft chime no
   matter which sound the user picked. Mute + style + volume all persist
   across sessions (localStorage) and are set from the bell panel.
   Browsers block audio until the user has interacted with the page at
   least once — getAudioCtx() creates/resumes the shared context lazily
   on first real use (e.g. opening the bell panel), which satisfies that
   requirement in normal use without needing an extra "enable sound" tap.
   ============================================================ */
let __audioCtx = null;
function getAudioCtx(){
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) return null;
  if(!__audioCtx) __audioCtx = new Ctx();
  if(__audioCtx.state === 'suspended') __audioCtx.resume().catch(()=>{});
  return __audioCtx;
}
function isSoundMuted(){ try{ return localStorage.getItem('abot2_soundMuted')==='1'; }catch(e){ return false; } }
function setSoundMuted(muted){ try{ localStorage.setItem('abot2_soundMuted', muted?'1':'0'); }catch(e){} }
// Browser Notification permission — shared across every role (patient medicine
// reminders, hospital/responder/police dispatch alerts, pharmacy/doctor/delivery
// updates) so a notification can surface on the device's notification bar even
// when ArogyaBot is a background tab, not just as an in-app toast.
function notifSupported(){ return typeof window!=='undefined' && 'Notification' in window; }
function notifPermission(){ return notifSupported() ? Notification.permission : 'unsupported'; }
function requestNotifPermission(){
  if(!notifSupported()){ showToast('Not supported', 'This browser does not support notifications — in-app sound and alerts will still work.', 'warning'); return; }
  Notification.requestPermission().then(perm=>{
    if(perm==='granted') showToast('Notifications enabled', 'You\'ll get an alert here even if this tab is in the background.', 'success');
    else if(perm==='denied') showToast('Notifications blocked', 'Turn them on for this site in your browser settings if you change your mind.', 'warning');
    if(document.getElementById('bell-panel')) renderBellPanel();
    renderCurrentView(currentView);
  }).catch(()=>{});
}
// Fires an actual OS/browser notification with the same specific title+body
// already shown in-app (e.g. "New dispatch request" for a responder, "Time to
// take Metformin 500mg" for a patient) — every role gets the same treatment.
function sendBrowserNotification(title, body, type, tag){
  if(notifPermission()!=='granted') return;
  try{
    const n = new Notification(title, {body: body||'', tag: tag||undefined, requireInteraction: type==='danger'});
    n.onclick = ()=>{ window.focus(); n.close(); };
  }catch(e){ console.warn('Browser notification failed', e); }
}
// Four selectable synthesized styles — each is just a waveform + a base
// pitch; the beep PATTERN (single/double/triple, timing) always stays tied
// to the notification type so meaning never changes, only how it sounds. A
// fifth option, "custom", is a person-uploaded audio clip (see below) that
// plays instead when selected — used app-wide, by every role.
const SOUND_STYLES = {
  chime: {label:'Chime',      wave:'sine',     base:740},
  beep:  {label:'Beep',       wave:'square',   base:660},
  bell:  {label:'Bell',       wave:'triangle', base:900},
  alarm: {label:'Alarm tone', wave:'sawtooth', base:560}
};
function getSoundStyle(){ try{ const s=localStorage.getItem('abot2_soundStyle'); if(s==='custom' && hasCustomSound()) return 'custom'; return SOUND_STYLES[s] ? s : 'chime'; }catch(e){ return 'chime'; } }
function setSoundStyle(style){ try{ localStorage.setItem('abot2_soundStyle', style); }catch(e){} }
function getSoundVolume(){ try{ const v=parseFloat(localStorage.getItem('abot2_soundVolume')); return isNaN(v) ? 0.8 : Math.max(0, Math.min(1.3, v)); }catch(e){ return 0.8; } }
function setSoundVolume(v){ try{ localStorage.setItem('abot2_soundVolume', String(v)); }catch(e){} }
// How long an urgent (danger-type) alert keeps ringing — repeating sound +
// vibration — before it auto-silences. Shared by medicine reminders and
// every role's emergency/dispatch alerts. Clamped 5–180s.
function getRingSeconds(){ try{ const v=parseInt(localStorage.getItem('abot2_ringSeconds'),10); return (v>=5 && v<=180) ? v : 30; }catch(e){ return 30; } }
function setRingSeconds(v){ const n=parseInt(v,10); try{ localStorage.setItem('abot2_ringSeconds', String((n>=5&&n<=180)?n:30)); }catch(e){} }
// ---- Custom uploaded notification sound (global — used for every role's
// alerts and reminders, since the repeating ring is what carries urgency,
// not the specific tone). Stored as a base64 data URL in localStorage.
function hasCustomSound(){ try{ return !!localStorage.getItem('abot2_customSoundData'); }catch(e){ return false; } }
function getCustomSoundName(){ try{ return localStorage.getItem('abot2_customSoundName')||'Custom sound'; }catch(e){ return 'Custom sound'; } }
let __customAudioEl = null;
function playCustomSound(){
  let data = null;
  try{ data = localStorage.getItem('abot2_customSoundData'); }catch(e){}
  if(!data) return false;
  try{
    if(!__customAudioEl) __customAudioEl = new Audio();
    __customAudioEl.pause();
    __customAudioEl.currentTime = 0;
    __customAudioEl.src = data;
    __customAudioEl.volume = Math.min(1, getSoundVolume());
    __customAudioEl.play().catch(()=>{});
    return true;
  }catch(e){ console.warn('Custom sound failed', e); return false; }
}
const CUSTOM_SOUND_MAX = 500*1024; // keep small — shares localStorage quota with all app data
function handleCustomSoundUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!file.type.startsWith('audio/')){ showToast('Not an audio file', 'Please choose an audio file (mp3, wav, ogg…).', 'danger'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const audioBuf = await ctx.decodeAudioData(reader.result.slice(0));
      ctx.close && ctx.close();
      openAudioTrimModal(file, audioBuf); // let the person pick which part to use, like trimming a clip
    }catch(e){
      // Couldn't decode (unsupported container etc.) — fall back to the old
      // direct path: use as-is if small enough, otherwise reject.
      console.warn('Decode for trimming failed, falling back', e);
      if(file.size > CUSTOM_SOUND_MAX){ showToast('File too large', 'This format can\'t be trimmed in-browser. Please choose a clip under 500KB.', 'danger'); }
      else saveCustomSoundBlob(file, file.name, false);
    }
  };
  reader.onerror = ()=> showToast('Upload failed', 'Could not read that file.', 'danger');
  reader.readAsArrayBuffer(file);
  input.value = '';
}
/* ---- Instagram-style waveform trimmer ----
   Lets the person drag two handles over the waveform to pick exactly which
   part of the clip to use, preview it, then saves just that segment
   (auto-shrinking quality only as much as needed to fit under 500KB). */
let __trimBuffer=null, __trimStart=0, __trimEnd=0, __trimFile=null, __trimSource=null, __trimPlaying=false;
function openAudioTrimModal(file, audioBuffer){
  __trimFile = file; __trimBuffer = audioBuffer; __trimPlaying = false;
  __trimStart = 0;
  __trimEnd = audioBuffer.duration;
  openModal(`
    <button class="modal-close-x" onclick="closeAudioTrimModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3 style="margin-top:0;"><i class="fa-solid fa-scissors"></i> Choose part of the clip</h3>
    <p class="modal-sub">Drag the handles to select which part to use — the rest gets cut. Saved sounds must fit under 500KB on this device.</p>
    <div id="trim-wave-wrap" style="position:relative;height:76px;background:var(--bg-subtle);border-radius:10px;overflow:hidden;touch-action:none;user-select:none;">
      <canvas id="trim-canvas" style="width:100%;height:100%;display:block;"></canvas>
      <div id="trim-shade-l" style="position:absolute;top:0;bottom:0;left:0;width:0%;background:rgba(2,6,12,.55);pointer-events:none;"></div>
      <div id="trim-shade-r" style="position:absolute;top:0;bottom:0;right:0;width:0%;background:rgba(2,6,12,.55);pointer-events:none;"></div>
      <div id="trim-selection" style="position:absolute;top:0;bottom:0;left:0;width:100%;border-top:3px solid var(--brand-primary);border-bottom:3px solid var(--brand-primary);cursor:grab;"></div>
      <div id="trim-handle-l" style="position:absolute;top:0;bottom:0;left:0%;width:18px;margin-left:-9px;background:var(--brand-primary);border-radius:6px;cursor:ew-resize;display:flex;align-items:center;justify-content:center;"><div style="width:3px;height:26px;background:#fff;border-radius:2px;"></div></div>
      <div id="trim-handle-r" style="position:absolute;top:0;bottom:0;left:100%;width:18px;margin-left:-9px;background:var(--brand-primary);border-radius:6px;cursor:ew-resize;display:flex;align-items:center;justify-content:center;"><div style="width:3px;height:26px;background:#fff;border-radius:2px;"></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:.76rem;color:var(--text-muted);margin-top:8px;">
      <span id="trim-selected-len">0:00 selected</span>
      <span id="trim-total-len">of 0:00</span>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="toggleTrimPreview()"><i class="fa-solid fa-play" id="trim-play-icon"></i> <span id="trim-play-label">Preview</span></button>
      <button class="btn btn-primary" style="flex:1;" onclick="useTrimSelection()"><i class="fa-solid fa-check"></i> Use this part</button>
    </div>
    <div id="trim-size-note" style="font-size:.76rem;color:var(--text-muted);margin-top:10px;"></div>
    <button class="btn btn-sm btn-secondary" style="margin-top:10px;width:100%;" onclick="closeAudioTrimModal()">Cancel</button>
  `);
  requestAnimationFrame(initAudioTrimmerUI);
}
function closeAudioTrimModal(){
  stopTrimPreview();
  __trimBuffer=null; __trimFile=null;
  closeModal();
  openSoundSettingsModal();
}
function formatTrimTime(sec){
  sec = Math.max(0, sec||0);
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return m+':'+String(s).padStart(2,'0');
}
function computeWaveformPeaks(buffer, numBars){
  const data = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length/numBars));
  const peaks = new Float32Array(numBars);
  for(let i=0;i<numBars;i++){
    let max=0;
    const start=i*blockSize, end=Math.min(data.length, start+blockSize);
    for(let j=start;j<end;j++){ const v=Math.abs(data[j]); if(v>max) max=v; }
    peaks[i]=max;
  }
  return peaks;
}
function drawTrimWaveform(){
  const canvas = document.getElementById('trim-canvas');
  const wrap = document.getElementById('trim-wave-wrap');
  if(!canvas || !wrap || !__trimBuffer) return;
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  canvas.width = w*dpr; canvas.height = h*dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);
  const bars = Math.max(40, Math.floor(w/3));
  const peaks = computeWaveformPeaks(__trimBuffer, bars);
  const barW = w/bars;
  const styles = getComputedStyle(document.documentElement);
  ctx.fillStyle = styles.getPropertyValue('--brand-secondary') || '#0284c7';
  for(let i=0;i<bars;i++){
    const amp = Math.max(0.04, peaks[i]);
    const barH = amp*h*0.9;
    ctx.fillRect(i*barW+1, (h-barH)/2, Math.max(1,barW-1.5), barH);
  }
}
function updateTrimUI(){
  const dur = __trimBuffer.duration;
  const leftPct = (__trimStart/dur)*100, rightPct = (__trimEnd/dur)*100;
  const l=document.getElementById('trim-handle-l'), r=document.getElementById('trim-handle-r');
  const sel=document.getElementById('trim-selection');
  const shL=document.getElementById('trim-shade-l'), shR=document.getElementById('trim-shade-r');
  if(l) l.style.left = leftPct+'%';
  if(r) r.style.left = rightPct+'%';
  if(sel){ sel.style.left = leftPct+'%'; sel.style.width = (rightPct-leftPct)+'%'; }
  if(shL) shL.style.width = leftPct+'%';
  if(shR) shR.style.width = (100-rightPct)+'%';
  const selLenEl = document.getElementById('trim-selected-len');
  const totalLenEl = document.getElementById('trim-total-len');
  if(selLenEl) selLenEl.textContent = formatTrimTime(__trimEnd-__trimStart)+' selected';
  if(totalLenEl) totalLenEl.textContent = 'of '+formatTrimTime(dur);
  const note = document.getElementById('trim-size-note');
  if(note){
    const selDur = __trimEnd-__trimStart;
    const fullQualityBytes = 44 + Math.floor(selDur*__trimBuffer.sampleRate)*2;
    if(fullQualityBytes <= CUSTOM_SOUND_MAX){
      note.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--brand-success);"></i> This selection fits at full quality.';
    } else {
      note.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--brand-accent);"></i> Selection is long — quality will be reduced to fit under 500KB.';
    }
  }
}
let __trimDragTarget=null, __trimDragStartX=0, __trimDragStartVal=0;
function initAudioTrimmerUI(){
  drawTrimWaveform();
  updateTrimUI();
  const wrap = document.getElementById('trim-wave-wrap');
  const l = document.getElementById('trim-handle-l'), r = document.getElementById('trim-handle-r'), sel = document.getElementById('trim-selection');
  const MIN_SEL = 0.4; // seconds — smallest selection allowed
  function xToSeconds(clientX){
    const rect = wrap.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX-rect.left)/rect.width));
    return frac*__trimBuffer.duration;
  }
  function onDown(target, e){
    __trimDragTarget = target;
    __trimDragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    __trimDragStartVal = target==='sel' ? __trimStart : (target==='l' ? __trimStart : __trimEnd);
    e.preventDefault();
  }
  function onMove(e){
    if(!__trimDragTarget) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const dur = __trimBuffer.duration;
    if(__trimDragTarget==='l'){
      let v = xToSeconds(clientX);
      __trimStart = Math.max(0, Math.min(v, __trimEnd-MIN_SEL));
    } else if(__trimDragTarget==='r'){
      let v = xToSeconds(clientX);
      __trimEnd = Math.min(dur, Math.max(v, __trimStart+MIN_SEL));
    } else if(__trimDragTarget==='sel'){
      const rect = wrap.getBoundingClientRect();
      const deltaSec = ((clientX-__trimDragStartX)/rect.width)*dur;
      const len = __trimEnd-__trimStart;
      let newStart = Math.max(0, Math.min(dur-len, __trimDragStartVal+deltaSec));
      __trimStart = newStart; __trimEnd = newStart+len;
    }
    updateTrimUI();
  }
  function onUp(){ __trimDragTarget=null; }
  l.addEventListener('pointerdown', e=>onDown('l',e));
  r.addEventListener('pointerdown', e=>onDown('r',e));
  sel.addEventListener('pointerdown', e=>onDown('sel',e));
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  // Clean up the window-level listeners when the modal closes so they don't
  // pile up across multiple upload attempts.
  const overlay = document.getElementById('modal-overlay');
  const cleanup = ()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  if(overlay) overlay.addEventListener('click', function once(e){ if(e.target===overlay){ cleanup(); overlay.removeEventListener('click', once); } });
  window.__trimCleanup = cleanup; // also called explicitly from closeAudioTrimModal via stopTrimPreview path
}
function toggleTrimPreview(){
  if(__trimPlaying){ stopTrimPreview(); return; }
  const ctx = getAudioCtx();
  if(!ctx || !__trimBuffer) return;
  __trimSource = ctx.createBufferSource();
  __trimSource.buffer = __trimBuffer;
  __trimSource.connect(ctx.destination);
  __trimSource.start(0, __trimStart, __trimEnd-__trimStart);
  __trimPlaying = true;
  setTrimPlayIcon(true);
  __trimSource.onended = ()=>{ __trimPlaying=false; setTrimPlayIcon(false); };
}
function stopTrimPreview(){
  if(__trimSource){ try{ __trimSource.stop(); }catch(e){} __trimSource=null; }
  __trimPlaying=false;
  setTrimPlayIcon(false);
  if(window.__trimCleanup) window.__trimCleanup();
}
function setTrimPlayIcon(playing){
  const icon = document.getElementById('trim-play-icon'), label = document.getElementById('trim-play-label');
  if(icon) icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
  if(label) label.textContent = playing ? 'Stop' : 'Preview';
}
function useTrimSelection(){
  if(!__trimBuffer) return;
  stopTrimPreview();
  const sampleRate = __trimBuffer.sampleRate;
  const startIdx = Math.floor(__trimStart*sampleRate);
  const endIdx = Math.floor(__trimEnd*sampleRate);
  const slice = __trimBuffer.getChannelData(0).slice(startIdx, endIdx);
  const fakeBuf = { sampleRate, getChannelData: ()=>slice };
  const blob = shrinkAudioBufferToWav(fakeBuf, CUSTOM_SOUND_MAX);
  const wasShrunk = blob.size < (44+slice.length*2) - 4; // encoded at a lower rate than the raw slice
  const baseName = (__trimFile ? __trimFile.name.replace(/\.[^.]+$/, '') : 'Custom sound');
  const newName = baseName + ' (trimmed).wav';
  saveCustomSoundBlob(blob, newName, wasShrunk);
}
// Re-encodes to mono PCM WAV, preferring the original sample rate (capped at
// 44.1kHz) if it fits, and stepping down through lower rates — only as far
// as needed — until the result is under maxBytes.
function shrinkAudioBufferToWav(audioBuf, maxBytes){
  const src = audioBuf.getChannelData(0); // mono only — halves size right away
  const srcRate = audioBuf.sampleRate;
  const candidateRates = Array.from(new Set([Math.min(srcRate,44100), 22050, 16000, 11025, 8000])).sort((a,b)=>b-a);
  let chosen = null;
  for(const rate of candidateRates){
    const samples = Math.floor(src.length * rate / srcRate);
    const bytes = 44 + samples*2; // 16-bit PCM + WAV header
    if(bytes <= maxBytes){ chosen = {rate, samples}; break; }
  }
  // Even the lowest rate is still too big for the clip's length — keep the
  // lowest rate but trim the duration to whatever fits.
  if(!chosen){
    const rate = candidateRates[candidateRates.length-1];
    const maxSamples = Math.max(1, Math.floor((maxBytes-44)/2));
    chosen = {rate, samples: Math.min(maxSamples, Math.floor(src.length*rate/srcRate))};
  }
  const {rate, samples} = chosen;
  const out = new Int16Array(samples);
  for(let i=0;i<samples;i++){
    const srcIdx = Math.floor(i*srcRate/rate);
    const s = Math.max(-1, Math.min(1, src[srcIdx]||0));
    out[i] = s<0 ? s*0x8000 : s*0x7fff;
  }
  const buf = new ArrayBuffer(44 + out.length*2);
  const view = new DataView(buf);
  const writeStr = (off,str)=>{ for(let i=0;i<str.length;i++) view.setUint8(off+i, str.charCodeAt(i)); };
  writeStr(0,'RIFF'); view.setUint32(4, 36+out.length*2, true); writeStr(8,'WAVE');
  writeStr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  writeStr(36,'data'); view.setUint32(40, out.length*2, true);
  for(let i=0;i<out.length;i++) view.setInt16(44+i*2, out[i], true);
  return new Blob([buf], {type:'audio/wav'});
}
// Shared save path for both the direct (already-small) upload and the
// trimmed/shrunk result.
function saveCustomSoundBlob(fileOrBlob, name, wasShrunk){
  const reader = new FileReader();
  reader.onload = ()=>{
    if(fileOrBlob.size > CUSTOM_SOUND_MAX){
      showToast('Still too large', 'Even after trimming, this selection is too long to fit under 500KB. Select a shorter part.', 'danger');
      return;
    }
    try{
      localStorage.setItem('abot2_customSoundData', reader.result);
      localStorage.setItem('abot2_customSoundName', name);
      setSoundStyle('custom');
      showToast('Custom sound saved', wasShrunk ? name+' will now play (quality reduced to fit) for notifications and reminders.' : name+' will now play for notifications and reminders.', 'success');
      __trimBuffer=null; __trimFile=null;
      closeModal();
      openSoundSettingsModal();
    }catch(e){ showToast('Could not save', 'Your browser storage may be full — try a shorter clip.', 'danger'); }
  };
  reader.onerror = ()=> showToast('Upload failed', 'Could not read that file.', 'danger');
  reader.readAsDataURL(fileOrBlob);
}
function removeCustomSound(e){
  if(e) e.stopPropagation();
  try{ localStorage.removeItem('abot2_customSoundData'); localStorage.removeItem('abot2_customSoundName'); }catch(e){}
  if(getSoundStyle()==='custom') setSoundStyle('chime');
  showToast('Removed', 'Back to the built-in tones.', 'info');
  openSoundSettingsModal();
}
function toggleSoundMuted(e){
  if(e) e.stopPropagation();
  setSoundMuted(!isSoundMuted());
  if(!isSoundMuted()) playNotificationSound('info'); // audible confirmation that sound is back on
  if(document.getElementById('bell-panel')) renderBellPanel();
}
function playTone(freq, startAt, duration, gainPeak, waveType){
  const ctx = getAudioCtx();
  if(!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = waveType || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime+startAt);
  gain.gain.setValueAtTime(0, ctx.currentTime+startAt);
  gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime+startAt+0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+startAt+duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime+startAt);
  osc.stop(ctx.currentTime+startAt+duration+0.03);
}
function playNotificationSound(type){
  if(isSoundMuted()) return;
  if(getSoundStyle()==='custom' && playCustomSound()) return; // uploaded sound replaces the tone entirely; repetition (ringForEvent) still carries urgency
  try{
    const style = SOUND_STYLES[getSoundStyle()] || SOUND_STYLES.chime;
    const vol = getSoundVolume();
    const ratio = style.base/740; // scales the fixed pitch pattern below to this style's base pitch
    const g = (peak)=> peak*vol;
    if(type==='danger'){
      // Urgent triple-beep — SOS / dispatch / emergency alerts.
      playTone(880*ratio, 0,    0.14, g(0.24), style.wave);
      playTone(880*ratio, 0.18, 0.14, g(0.24), style.wave);
      playTone(880*ratio, 0.36, 0.18, g(0.24), style.wave);
    } else if(type==='success'){
      // Rising two-tone — confirmations (accepted, arrived, paid).
      playTone(660*ratio, 0,    0.12, g(0.16), style.wave);
      playTone(880*ratio, 0.12, 0.16, g(0.16), style.wave);
    } else {
      // Soft single chime — general info notifications.
      playTone(740*ratio, 0, 0.16, g(0.14), style.wave);
    }
  }catch(e){ console.warn('Notification sound failed', e); }
}
// Plays a representative "danger" beep in the given style, for the live
// preview in the sound settings modal — lets someone hear a style before
// committing to it, using the same urgent pattern real alerts use.
function previewSoundStyle(styleKey){
  const prevStyle = getSoundStyle();
  setSoundStyle(styleKey);
  playNotificationSound('info');
  setSoundStyle(prevStyle); // don't actually change the saved choice just from a preview tap
}
// ---- Ringing (repeat-until-timeout) for urgent alerts, shared by every
// role's danger-type notifications (SOS/dispatch/incoming-patient/etc.) and
// by medicine reminders. A single shared loop — a second urgent event while
// one is already ringing just extends the timer rather than overlapping
// sounds. Auto-silences after getRingSeconds(); doesn't require an explicit
// dismissal for general notifications (medicine reminders use their own
// dismiss-driven loop below since they have Taken/Missed/Snooze actions).
let __genRingInterval = null;
let __genRingTimeout = null;
function ringForEvent(type){
  if(type!=='danger'){ playNotificationSound(type); return; }
  playNotificationSound('danger');
  if(navigator.vibrate) navigator.vibrate([400,200,400]);
  if(!__genRingInterval){
    __genRingInterval = setInterval(()=>{ playNotificationSound('danger'); if(navigator.vibrate) navigator.vibrate([400,200,400]); }, 2500);
  }
  clearTimeout(__genRingTimeout);
  __genRingTimeout = setTimeout(stopGenRing, getRingSeconds()*1000);
}
function stopGenRing(){
  if(__genRingInterval){ clearInterval(__genRingInterval); __genRingInterval=null; }
  clearTimeout(__genRingTimeout); __genRingTimeout=null;
  if(navigator.vibrate) navigator.vibrate(0);
}
function openSoundSettingsModal(e){
  if(e) e.stopPropagation();
  const cur = getSoundStyle();
  const vol = Math.round(getSoundVolume()*100);
  const ring = getRingSeconds();
  const has = hasCustomSound();
  const perm = notifPermission();
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3 style="margin-top:0;"><i class="fa-solid fa-volume-high"></i> Notification sound &amp; alerts</h3>
    <p class="modal-sub">Applies to every role's alerts on this device — emergency/dispatch notifications and medicine reminders.</p>
    <div class="form-group">
      <label>Sound style</label>
      <div class="chip-select" id="sound-style-chips">
        ${Object.keys(SOUND_STYLES).map(key=>`<button class="chip-opt ${key===cur?'active':''}" data-style="${key}" onclick="selectSoundStyleInModal('${key}')">${SOUND_STYLES[key].label}</button>`).join('')}
        ${has ? `<button class="chip-opt ${cur==='custom'?'active':''}" data-style="custom" onclick="selectSoundStyleInModal('custom')">Custom</button>` : ''}
      </div>
    </div>
    <div class="form-group">
      <label>Custom notification sound (optional)</label>
      <input type="file" accept="audio/*" class="form-control" onchange="handleCustomSoundUpload(this)">
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:.78rem;color:var(--text-muted);flex-wrap:wrap;">
        ${has ? `<span><i class="fa-solid fa-file-audio"></i> ${attr(getCustomSoundName())}</span>
          <button class="btn btn-sm btn-secondary" onclick="playCustomSound()"><i class="fa-solid fa-play"></i> Test</button>
          <button class="btn btn-sm btn-secondary" onclick="removeCustomSound(event)"><i class="fa-solid fa-trash"></i> Remove</button>`
          : `Upload a short clip (under 500KB) to use instead of the built-in tones.`}
      </div>
    </div>
    <div class="form-group">
      <label>Volume</label>
      <input type="range" min="0" max="130" value="${vol}" id="sound-volume-slider" style="width:100%;accent-color:var(--brand-primary);" oninput="document.getElementById('sound-volume-num').textContent=this.value+'%'; setSoundVolume(this.value/100);">
      <div style="text-align:right;font-size:.78rem;color:var(--text-muted);margin-top:2px;" id="sound-volume-num">${vol}%</div>
    </div>
    <div class="form-group">
      <label>Ring for how long (urgent alerts &amp; reminders)</label>
      <input type="number" min="5" max="180" class="form-control" value="${ring}" onchange="setRingSeconds(this.value)"> <span style="font-size:.76rem;color:var(--text-muted);">seconds (5–180)</span>
    </div>
    <div class="form-group">
      <label>Browser notifications</label>
      ${perm==='granted' ? `<div style="color:var(--brand-primary);font-size:.82rem;"><i class="fa-solid fa-circle-check"></i> Enabled — alerts will show on your device's notification bar too.</div>`
        : perm==='denied' ? `<div style="font-size:.82rem;color:var(--text-muted);">Blocked for this site — enable it in your browser's site settings.</div>`
        : perm==='unsupported' ? '' : `<button class="btn btn-sm" onclick="requestNotifPermission()"><i class="fa-solid fa-bell"></i> Enable notifications</button>`}
    </div>
    <button class="btn btn-secondary btn-block" style="margin-bottom:10px;" onclick="playNotificationSound('danger')"><i class="fa-solid fa-play"></i> Preview emergency alert</button>
    <button class="btn btn-block" onclick="closeModal()">Done</button>
  `);
}
function selectSoundStyleInModal(key){
  setSoundStyle(key);
  document.querySelectorAll('#sound-style-chips .chip-opt').forEach(b=>b.classList.toggle('active', b.dataset.style===key));
  previewSoundStyle(key);
}
