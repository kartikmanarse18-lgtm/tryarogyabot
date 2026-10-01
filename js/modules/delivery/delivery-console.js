/* ============================================================
   DELIVERY CONSOLE — scoped to CURRENT_DELIVERY_ID + CURRENT_PHARMACY_ID.
   A delivery boy sees only the orders assigned to them, goes live on
   GPS the moment they log in (see enterConsole -> beginLiveLocationTracking
   ('delivery') and applyLiveLocation), and updates status as they go —
   the patient's tracker (see patient e-Prescriptions) reflects this live.
   ============================================================ */
function currentDeliveryRecord(){ return (db('deliveryBoys')||[]).find(x=>x.id===CURRENT_DELIVERY_ID); }
function viewDeliveryDash(){
  const b = currentDeliveryRecord() || {};
  const ph = (db('pharmacies')||[]).find(x=>x.id===CURRENT_PHARMACY_ID) || {};
  const rx = (db('prescriptions')||[]).filter(r=>r.deliveryBoyId===CURRENT_DELIVERY_ID);
  const active = rx.filter(r=>r.deliveryStatus && r.deliveryStatus!=='delivered');
  const completed = rx.filter(r=>r.deliveryStatus==='delivered');
  return `${viewHeader('Delivery Console', 'Welcome, '+(b.name||'Delivery Partner'), ph.name?('At '+ph.name):'')}
  <div class="grid-3">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-box-open"></i></div><div><div class="dash-stat-num">${active.length}</div><div class="dash-stat-label">Active Deliveries</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="dash-stat-num">${completed.length}</div><div class="dash-stat-label">Delivered (all time)</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-location-crosshairs"></i></div><div><div class="dash-stat-num">${b.lat?'ON':'OFF'}</div><div class="dash-stat-label">Live GPS</div></div></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Your profile summary</h3>
    <p style="color:var(--text-muted);margin:0;">${b.phone||'No phone on file'} · ${b.vehicle||'Vehicle not set'}</p>
    <p style="margin-top:10px;"><span class="status-tag status-ok"><i class="fa-solid fa-location-dot"></i> Your live location is being shared with any patient you're delivering to</span></p>
  </div>`;
}
function viewDeliveryOrders(){
  reconcileDeliveryBoyStatuses(CURRENT_PHARMACY_ID);
  const b = currentDeliveryRecord() || {};
  const rx = (db('prescriptions')||[]).filter(r=>r.deliveryBoyId===CURRENT_DELIVERY_ID).sort((a,b2)=>(a.deliveryStatus==='delivered'?1:-1));
  return `${viewHeader('My Deliveries','Medicine orders assigned to you','Mark "Out for delivery" once you\'ve picked up the medicines — this switches on live tracking for the patient. Mark "Delivered" once handed over.')}
  ${rx.length ? rx.map(r=>{
    const patientMember = findPatientMemberById(r.ownerId);
    const patientName = (patientMember && patientMember.member && patientMember.member.name) || 'Patient';
    const patientPhone = (patientMember && patientMember.account && patientMember.account.phone) || '';
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div><strong>${patientName}</strong>${patientPhone?' · '+patientPhone:''}<p style="margin:8px 0 0;">${r.medicines}</p></div>
        <span class="status-tag ${r.deliveryStatus==='delivered'?'status-muted':r.deliveryStatus==='out_for_delivery'?'status-ok':'status-warn'}">${r.deliveryStatus==='delivered'?'Delivered':r.deliveryStatus==='out_for_delivery'?'Out for delivery':'Assigned'}</span>
      </div>
      ${r.deliveryStatus!=='delivered' ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        ${r.deliveryStatus!=='out_for_delivery' ? `<button class="btn btn-sm" onclick="deliveryStartDelivery('${r.id}')"><i class="fa-solid fa-motorcycle"></i> Start delivery (go live)</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="deliveryMarkDelivered('${r.id}')"><i class="fa-solid fa-check"></i> Mark delivered</button>
      </div>` : ''}
    </div>`;
  }).join('') : `<div class="empty-state"><i class="fa-solid fa-motorcycle"></i><p>No deliveries assigned yet — patients request home delivery from their e-Prescriptions screen.</p></div>`}`;
}
function deliveryStartDelivery(rxId){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===rxId);
  if(!rx || rx.deliveryBoyId!==CURRENT_DELIVERY_ID) return;
  rx.deliveryStatus = 'out_for_delivery';
  dbSet('prescriptions', list);
  audit('delivery:'+CURRENT_DELIVERY_ID, 'delivery_start', rxId);
  pushNotification('patient:'+rx.ownerId, 'Out for delivery', `Your medicines are on the way — you can track your delivery boy's live location in e-Prescriptions.`, 'info', null);
  showToast('Live tracking on', 'The patient can now see your live location until this is delivered.', 'success');
  renderCurrentView('dl-orders');
}
function deliveryMarkDelivered(rxId){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===rxId);
  if(!rx || rx.deliveryBoyId!==CURRENT_DELIVERY_ID) return;
  rx.deliveryStatus = 'delivered';
  dbSet('prescriptions', list);
  const boys = db('deliveryBoys')||[];
  const b = boys.find(x=>x.id===CURRENT_DELIVERY_ID);
  if(b){ b.currentRxId = null; dbSet('deliveryBoys', boys); }
  audit('delivery:'+CURRENT_DELIVERY_ID, 'delivery_complete', rxId);
  pushNotification('patient:'+rx.ownerId, 'Delivered', 'Your medicines have been delivered. Thanks for using ArogyaBot!', 'success', null);
  showToast('Marked delivered', 'Nice work — you\'re free for a new delivery.', 'success');
  renderCurrentView('dl-orders');
}
function viewDeliveryProfile(){
  const b = currentDeliveryRecord() || {};
  return `${viewHeader('My Profile','What patients see once you\'re assigned to their delivery','')}
  <div class="card">
    <div class="grid-2">
      <div class="form-group"><label>Phone</label><input class="form-control" id="dlp-phone" value="${attr(b.phone||'')}"></div>
      <div class="form-group"><label>Vehicle</label><input class="form-control" id="dlp-vehicle" value="${attr(b.vehicle||'')}" placeholder="e.g. Bike · MH12 AB 1234"></div>
    </div>
    <button class="btn" onclick="deliverySaveProfile()"><i class="fa-solid fa-floppy-disk"></i> Save profile</button>
  </div>`;
}
function deliverySaveProfile(){
  const boys = db('deliveryBoys')||[];
  const b = boys.find(x=>x.id===CURRENT_DELIVERY_ID);
  if(!b) return;
  b.phone = document.getElementById('dlp-phone').value.trim();
  b.vehicle = document.getElementById('dlp-vehicle').value.trim();
  dbSet('deliveryBoys', boys);
  audit('delivery:'+CURRENT_DELIVERY_ID, 'profile_update', '');
  showToast('Saved', 'Profile updated.', 'success');
  renderCurrentView('dl-profile');
}
