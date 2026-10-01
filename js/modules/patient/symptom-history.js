/* ============================================================
   SYMPTOM HISTORY — every generated report (AI or offline KB) is
   archived here permanently (until the user deletes it), separate
   from the live chat conversation below. This is what lets the
   active chat start fresh on every page reload without losing past
   reports: the conversation itself is disposable, the reports aren't.
   ============================================================ */
const WELCOME_MSG = {who:'bot', text:"Hi, I'm ArogyaBot's symptom assistant. Describe what you're feeling in your own words (e.g. \"I have a fever and sore throat\") and I'll break down likely causes, home care, when to see a doctor, and which specialist to see — this is general guidance, not a diagnosis."};
// Stays true only until the chat view is first opened after a real page
// load (this is a plain JS variable, so it resets automatically whenever
// the page/script reloads, but NOT when the user just navigates between
// in-app tabs — exactly the "fresh on reload, not on tab-switch" behavior).
let chatIsFreshThisPageLoad = true;
function addToSymptomHistory(query, source, entry){
  const hist = db('symptomHistory') || [];
  hist.unshift({ id: uid('SH'), ts: Date.now(), query, source, entry });
  dbSet('symptomHistory', hist);
}
function deleteSymptomHistoryItem(id){
  const hist = (db('symptomHistory') || []).filter(h=>h.id!==id);
  dbSet('symptomHistory', hist);
  renderCurrentView('p-history');
  showToast('Deleted', 'That entry was removed from your symptom history.', 'success');
}
function clearSymptomHistory(){
  if(!confirm('Delete your entire symptom history? This cannot be undone.')) return;
  dbSet('symptomHistory', []);
  renderCurrentView('p-history');
  showToast('History cleared', 'Your symptom history is now empty.', 'success');
}
function openSymptomHistoryDetail(id){
  const hist = db('symptomHistory') || [];
  const item = hist.find(h=>h.id===id); if(!item) return;
  openModal(`<div style="max-height:78vh;overflow:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="margin:0;">Symptom report</h3>
      <button class="btn btn-secondary btn-sm" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
    </div>
    <p style="color:var(--text-muted);font-size:.82rem;margin-top:-6px;">You said: "${item.query}" — ${new Date(item.ts).toLocaleString()}</p>
    ${renderSymptomCard(item.entry, item.source)}
  </div>`);
}
function viewPatientSymptomHistory(){
  const hist = db('symptomHistory') || [];
  return `${viewHeader('Symptom History','Your past symptom reports','Reports are saved here automatically. Delete any entry, or clear everything, at any time.')}
  ${hist.length ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px;"><button class="btn btn-danger btn-sm" onclick="clearSymptomHistory()"><i class="fa-solid fa-trash"></i> Clear all history</button></div>` : ''}
  <div class="card" style="padding:0;overflow:hidden;">
    ${hist.length ? hist.map(h=>{
      const sev = severityMeta(h.entry.severity);
      return `<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="openSymptomHistoryDetail('${h.id}')">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${h.entry.title || 'Symptom Report'}</div>
          <div style="color:var(--text-muted);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">"${h.query}" · ${new Date(h.ts).toLocaleString()}</div>
        </div>
        <span class="status-tag ${sev.cls}">${sev.label}</span>
        <button class="btn btn-secondary btn-sm" title="Delete" onclick="event.stopPropagation(); deleteSymptomHistoryItem('${h.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }).join('') : `<div class="empty-state" style="padding:32px;text-align:center;color:var(--text-muted);"><i class="fa-solid fa-clock-rotate-left" style="font-size:1.6rem;display:block;margin-bottom:8px;"></i>No symptom reports yet. Anything you check in the AI Symptom Checker will show up here.</div>`}
  </div>`;
}
function viewPatientChat(){
  // Every fresh page load starts the conversation clean; anything from a
  // previous session already lives in Symptom History (see addToSymptomHistory),
  // so nothing is actually lost — the live chat just doesn't carry it forward.
  if(chatIsFreshThisPageLoad){
    dbSet('chatHistory', [WELCOME_MSG]);
    chatIsFreshThisPageLoad = false;
  }
  const msgs = db('chatHistory') || [WELCOME_MSG];
  dbSet('chatHistory', msgs);
  const aiOn = aiBackendConfigured();
  return `${viewHeader('AI Symptom Checker','Describe your symptoms','This assistant offers general guidance only — always confirm with a licensed doctor.')}
  <div class="chat-container">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;background:var(--bg-subtle);border-bottom:1px solid var(--border-color);font-size:.8rem;">
      <span>${aiOn ? `<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--brand-primary);"></i> Live AI engine <strong>on</strong> — Google Search-grounded, backed up by Groq &amp; OpenRouter` : '<i class="fa-solid fa-database"></i> Using built-in offline guidance — AI backend not yet deployed (see AI Settings)'}</span>
      <button class="btn btn-sm btn-secondary" onclick="openAISettingsModal()"><i class="fa-solid fa-gear"></i> AI Settings</button>
    </div>
    <div class="chat-messages" id="chat-messages-box">${msgs.map(m=>m.html ? m.html : `<div class="chat-bubble ${m.who}">${m.text}</div>`).join('')}</div>
    <div class="chat-bottom-bar">
      <div class="chat-quick-prompts">
        <button class="prompt-chip" onclick="setChatInput('I have a fever')">Fever</button>
        <button class="prompt-chip" onclick="setChatInput('I have chest pain')">Chest pain</button>
        <button class="prompt-chip" onclick="setChatInput('I have a headache')">Headache</button>
        <button class="prompt-chip" onclick="setChatInput('I have a cough and cold')">Cough &amp; cold</button>
        <button class="prompt-chip" onclick="setChatInput('I have stomach pain')">Stomach pain</button>
        <button class="prompt-chip" onclick="setChatInput('I feel dizzy')">Dizziness</button>
      </div>
      <div class="chat-input-bar">
        <input type="text" id="chat-user-input" class="form-control" placeholder="Type your symptoms..." onkeydown="if(event.key==='Enter') sendChatMessage()">
        <button class="btn" id="chat-send-btn" onclick="sendChatMessage()"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
  </div>`;
}
function setChatInput(t){ document.getElementById('chat-user-input').value=t; document.getElementById('chat-user-input').focus(); }
function scrollNewestIntoView(box){
  if(!box || !box.lastElementChild) return;
  try{
    // Scroll so the TOP of the newest message is visible, not the bottom of the
    // container — a long symptom report is often taller than the chat window,
    // and jumping straight to box.scrollHeight used to hide the report's own
    // heading and "why this happens" section above the fold.
    if(typeof box.lastElementChild.scrollIntoView === 'function'){
      box.lastElementChild.scrollIntoView({block:'start', behavior:'smooth'});
    } else {
      box.scrollTop = box.lastElementChild.offsetTop;
    }
  }catch(e){
    try{ box.scrollTop = box.scrollHeight; }catch(e2){}
  }
}
function renderChatBox(msgs){
  const box = document.getElementById('chat-messages-box'); if(!box) return;
  box.innerHTML = msgs.map(m=>m.html ? m.html : `<div class="chat-bubble ${m.who}">${m.text}</div>`).join('');
  scrollNewestIntoView(box);
}
function showTypingIndicator(){
  const box = document.getElementById('chat-messages-box');
  if(!box || document.getElementById('ai-typing-indicator')) return;
  const el = document.createElement('div');
  el.className = 'chat-bubble bot'; el.id = 'ai-typing-indicator';
  el.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles fa-fade"></i> Generating your report…';
  box.appendChild(el); scrollNewestIntoView(box);
}
function hideTypingIndicator(){ const el = document.getElementById('ai-typing-indicator'); if(el) el.remove(); }
let chatSendInFlight = false;
async function sendChatMessage(){
  // Guard against double-submits (e.g. mashing Enter while an AI report is
  // still loading) — without this, overlapping calls could race on the
  // typing indicator and leave the chat looking stuck/empty.
  if(chatSendInFlight) return;
  const inp = document.getElementById('chat-user-input');
  const btn = document.getElementById('chat-send-btn');
  const text = inp.value.trim(); if(!text) return;

  chatSendInFlight = true;
  if(inp) inp.disabled = true;
  if(btn) btn.disabled = true;

  try{
    const msgs = db('chatHistory');
    msgs.push({who:'user', text});
    dbSet('chatHistory', msgs);
    inp.value='';
    renderChatBox(msgs);

    // Safety-critical checks always run locally first, whether or not AI mode is on.
    if(CRISIS_PATTERNS.test(text)){
      msgs.push({who:'bot', html:renderCrisisSupport()});
      dbSet('chatHistory', msgs); renderChatBox(msgs);
      return;
    }
    const isEmergency = EMERGENCY_PATTERNS.some(p=>p.test(text));
    if(isEmergency){
      msgs.push({who:'bot', html:renderEmergencyAlert()});
      dbSet('chatHistory', msgs); renderChatBox(msgs);
    }

    const aiKey = getAIKey();
    if(aiKey){
      showTypingIndicator();
      try{
        const entry = await fetchAISymptomReport(text);
        hideTypingIndicator();
        msgs.push({who:'bot', html:renderSymptomCard(entry, 'ai')});
        addToSymptomHistory(text, 'ai', entry);
      }catch(err){
        hideTypingIndicator();
        msgs.push({who:'bot', text:'⚠️ AI report failed ('+(err && err.message ? err.message : 'network error')+') — showing offline guidance instead.'});
        const matches = SYMPTOM_KB.filter(e=>e.match.test(text));
        if(matches.length) matches.forEach(m=>{ msgs.push({who:'bot', html:renderSymptomCard(m,'kb')}); addToSymptomHistory(text, 'kb', m); });
        else if(!isEmergency) msgs.push({who:'bot', html:renderFallbackCard()});
      }
    } else {
      const matches = SYMPTOM_KB.filter(e=>e.match.test(text));
      if(matches.length) matches.forEach(m=>{ msgs.push({who:'bot', html:renderSymptomCard(m,'kb')}); addToSymptomHistory(text, 'kb', m); });
      else if(!isEmergency) msgs.push({who:'bot', html:renderFallbackCard()});
    }

    dbSet('chatHistory', msgs);
    renderChatBox(msgs);
  }catch(err){
    // Belt-and-braces: if anything above throws unexpectedly, surface it as a
    // chat bubble instead of leaving the conversation silently stuck.
    console.error('sendChatMessage failed', err);
    const msgs = db('chatHistory') || [];
    msgs.push({who:'bot', text:'⚠️ Something went wrong showing that report. Please try rephrasing your symptoms.'});
    dbSet('chatHistory', msgs); renderChatBox(msgs);
  }finally{
    chatSendInFlight = false;
    if(inp){ inp.disabled = false; inp.focus(); }
    if(btn) btn.disabled = false;
  }
}
