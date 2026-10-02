function loadActiveMemberIntoProfile(user){
  const m = user.members.find(x=>x.id===user.activeMemberId) || user.members[0];
  dbSet('profile', {...m});
}
function persistActiveProfileBackToMember(){
  const u = currentUserRecord(); if(!u) return;
  const p = db('profile') || {};
  const i = u.members.findIndex(x=>x.id===u.activeMemberId);
  if(i>-1){ u.members[i] = {...u.members[i], ...p}; saveUser(u); }
}
function openFamilyModal(){ renderFamilyModal(); }
function renderFamilyModal(){
  const u = currentUserRecord();
  if(!u){ return; }
  const rows = u.members.map(m=>`
    <div class="member-row ${m.id===u.activeMemberId?'active':''}">
      <div class="member-avatar">${(m.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div>
      <div><div class="member-name">${m.name}</div><div class="member-rel">${m.relation}${m.id===u.activeMemberId?' · currently active':''}</div></div>
      <div class="member-actions">
        ${m.id!==u.activeMemberId ? `<button class="btn btn-secondary btn-sm" onclick="switchFamilyMember('${m.id}')">Switch to</button>` : ''}
        ${!m.isPrimary ? `<button class="btn btn-secondary btn-sm" onclick="removeFamilyMember('${m.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
    </div>`).join('');
  const canAdd = u.members.length < 3;
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3>Family members</h3>
    <p class="modal-sub">One Gmail login can cover up to 3 people — add a spouse or children instead of creating separate accounts. Each member keeps their own health profile; switching just changes whose profile the app is showing.</p>
    ${rows}
    ${canAdd ? `
    <div class="form-group" style="margin-top:16px;"><label>Add a family member</label>
      <input class="form-control" id="fam-name" placeholder="Full name" style="margin-bottom:8px;">
      <input class="form-control" id="fam-rel" placeholder="Relation (e.g. Daughter, Son, Spouse)" style="margin-bottom:8px;">
      <label style="display:block;margin-bottom:6px;color:var(--text-muted);font-size:.85rem;">Gender</label>
      <select class="form-control" id="fam-gender">
        <option value="Female">Female</option>
        <option value="Male">Male</option>
        <option value="Other">Other / Prefer not to say</option>
      </select>
    </div>
    <button class="btn btn-block" onclick="addFamilyMember()"><i class="fa-solid fa-user-plus"></i> Add member</button>`
    : `<p style="font-size:.8rem;color:var(--text-muted);margin-top:10px;">Maximum of 3 members reached for this account.</p>`}
  `);
}
function switchFamilyMember(memberId){
  const u = currentUserRecord(); if(!u) return;
  if(typeof abdmResetViewState==='function') abdmResetViewState(); // ABDM: never carry an OTP step/txn across members
  cycSessionUnlocked = false; // each family member's cycle data needs the PIN re-entered on switch, not just on first unlock
  persistActiveProfileBackToMember();
  u.activeMemberId = memberId;
  saveUser(u);
  loadActiveMemberIntoProfile(u);
  // The active SOS socket is keyed by patientId, so switching the active family
  // member means re-opening it under the new member's id — otherwise this device
  // would keep listening for the previous member's incidents only.
  Object.keys(window.__sosSockets||{}).filter(k=>k.startsWith('patient:')).forEach(k=>{
    try{ window.__sosSockets[k].close(); }catch{}
    delete window.__sosSockets[k];
  });
  if(currentRole==='patient') openSosSocket('patient', currentPatientId(), currentPatientId());
  buildSideNav('patient');
  closeModal();
  const targetView = (currentView==='p-women' && (db('profile')||{}).gender!=='Female') ? 'p-dash' : currentView;
  if(targetView) renderCurrentView(targetView);
  refreshBell();
  showToast('Switched profile', 'Now viewing '+ (u.members.find(m=>m.id===memberId)||{}).name, 'success');
}
function addFamilyMember(){
  const u = currentUserRecord(); if(!u) return;
  if(u.members.length>=3){ showToast('Limit reached', 'Maximum of 3 members per account.', 'danger'); return; }
  const name = document.getElementById('fam-name').value.trim();
  const rel = document.getElementById('fam-rel').value.trim() || 'Family member';
  const gender = document.getElementById('fam-gender').value || 'Other';
  if(!name){ showToast('Name required', 'Enter a name for the new family member.', 'danger'); return; }
  persistActiveProfileBackToMember();
  const m = {id: uid('MEM'), name, relation: rel, isPrimary:false, gender, bloodGroup:'Unknown', allergies:'None recorded', chronic:'None recorded', emergencyContact:'—', phone:u.phone||'', lat:BASE.lat+rnd(-0.01,0.01), lng:BASE.lng+rnd(-0.01,0.01)};
  u.members.push(m);
  saveUser(u);
  renderFamilyModal();
  showToast('Member added', name+' can now be switched to.', 'success');
}
function removeFamilyMember(memberId){
  const u = currentUserRecord(); if(!u) return;
  if(memberId===u.activeMemberId){ showToast("Can't remove active profile", 'Switch to another member first.', 'danger'); return; }
  u.members = u.members.filter(m=>m.id!==memberId);
  saveUser(u);
  renderFamilyModal();
}

/* ---- Admin desk: resolves phone-number complaints + user directory ----
   No public link points here anymore — see the "Secret admin access"
   block near the bottom of this script for the two ways in. ---- */
let adminUnlocked = false;
let adminTab = 'complaints';
