/* ============================================================
   PATIENT — E-PRESCRIPTIONS
   ============================================================ */
function viewPatientRx(){
  const rx = db('prescriptions').filter(r=>r.ownerId===currentPatientId());
  const bills = db('pharmacyBills')||[];
  const boys = db('deliveryBoys')||[];
  const activeDeliveryId = (rx.find(r=>r.deliveryStatus==='out_for_delivery')||{}).id;
  return `${viewHeader('e-Prescriptions','Digitally signed prescriptions','')}
  ${rx.length ? rx.map(r=>{
    const bill = r.targetPharmacyId ? bills.find(b=>b.rxId===r.id) : null;
    let statusHtml;
    if(!r.targetPharmacyId){
      statusHtml = `<button class="btn btn-sm" onclick="openPharmacyPickerForRx('${r.id}')"><i class="fa-solid fa-pills"></i> Send to pharmacy</button>`;
    } else if(r.pharmacyStatus!=='fulfilled'){
      statusHtml = `<span class="status-tag status-warn">Sent — awaiting fulfillment</span>`;
    } else if(bill && r.paymentStatus!=='paid'){
      statusHtml = `<span class="status-tag status-ok">Fulfilled by pharmacy</span> <button class="btn btn-sm" style="margin-top:8px;" onclick="openMedicinePayment('${r.id}',${bill.grandTotal})"><i class="fa-solid fa-indian-rupee-sign"></i> Pay &#8377;${bill.grandTotal.toFixed(2)} for medicines</button>`;
    } else if(bill && r.paymentStatus==='paid'){
      statusHtml = `<span class="status-tag status-ok">Paid &#8377;${bill.grandTotal.toFixed(2)} · Fulfilled</span>`;
    } else {
      statusHtml = `<span class="status-tag status-ok">Fulfilled by pharmacy</span>`;
    }
    let deliveryHtml = '';
    if(r.pharmacyStatus==='fulfilled'){
      if(!r.deliveryBoyId){
        deliveryHtml = `<button class="btn btn-sm btn-secondary" onclick="requestMedicineDelivery('${r.id}')"><i class="fa-solid fa-motorcycle"></i> Request home delivery</button>`;
      } else {
        const boy = boys.find(b=>b.id===r.deliveryBoyId) || {};
        const label = r.deliveryStatus==='delivered' ? 'Delivered' : r.deliveryStatus==='out_for_delivery' ? 'Out for delivery' : 'Assigned';
        const tone = r.deliveryStatus==='delivered' ? 'status-muted' : r.deliveryStatus==='out_for_delivery' ? 'status-ok' : 'status-warn';
        deliveryHtml = `<div style="background:var(--bg-subtle);border-radius:12px;padding:12px 14px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
            <div><i class="fa-solid fa-motorcycle"></i> <strong>${boy.name||'Delivery partner'}</strong>${boy.vehicle?' · '+boy.vehicle:''}${boy.phone?' · '+boy.phone:''}</div>
            <span class="status-tag ${tone}">${label}</span>
          </div>
          ${r.deliveryStatus==='out_for_delivery' && r.id===activeDeliveryId ? `<div class="card card-flush" style="margin-top:10px;"><div class="map-container" id="leaflet-map-box"></div><div id="delivery-live-eta" style="padding:10px 14px;font-size:.85rem;color:var(--text-muted);border-top:1px solid var(--border-color);"><i class="fa-solid fa-route"></i> Calculating route…</div></div>`
            : r.deliveryStatus==='delivered' ? `<p style="margin:8px 0 0;color:var(--text-muted);font-size:.82rem;">Delivered — thanks for using ArogyaBot.</p>`
            : `<p style="margin:8px 0 0;color:var(--text-muted);font-size:.82rem;">Live tracking starts automatically once your delivery partner sets out.</p>`}
        </div>`;
      }
    }
    return `<div class="card"><strong>${r.date}</strong> · ${r.doctor}<p style="margin:8px 0 12px;">${r.medicines}</p><div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;">${statusHtml}${deliveryHtml}</div></div>`;
  }).join('') : `<div class="empty-state"><i class="fa-solid fa-prescription"></i><p>No prescriptions yet. Complete a telemedicine consult to receive one.</p></div>`}`;
}
// Medicine payment (patient -> pharmacy) — same simulated checkout as the
// consultation fee. Marks the prescription paid on this device once the
// (fake) payment succeeds; wire this to a real gateway + backend later.
function openMedicinePayment(rxId, amount){
  openPaymentModal(amount, 'Medicine bill payment', 'confirmMedicinePayment', [rxId]);
}
function confirmMedicinePayment(rxId){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===rxId);
  if(!rx) return;
  rx.paymentStatus = 'paid';
  dbSet('prescriptions', list);
  const bills = db('pharmacyBills')||[];
  const bill = bills.find(b=>b.rxId===rxId);
  if(rx.targetPharmacyId) pushNotification('pharmacy:'+rx.targetPharmacyId, 'Payment received', `${db('profile').name} paid ₹${(bill?bill.grandTotal:0).toFixed(2)} for their medicines${bill?' (Bill '+bill.billNo+')':''}.`, 'success', null);
  renderCurrentView('p-rx');
}
// Assigns the nearest available delivery boy from the fulfilling pharmacy —
// same nearest-match style as sendToPharmacy(). The delivery boy is marked
// busy until they mark the order delivered, so one person is never assigned
// two deliveries at once.
function requestMedicineDelivery(rxId){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===rxId);
  if(!rx || !rx.targetPharmacyId) return;
  const boys = db('deliveryBoys')||[];
  const available = boys.filter(b=>b.pharmacyId===rx.targetPharmacyId && b.available && !b.currentRxId);
  if(!available.length){ showToast('No delivery staff available', 'This pharmacy has no delivery boy free right now — you can still pick up in person.', 'danger'); return; }
  const profile = db('profile')||{};
  let nearest = available[0], nearestDist = Infinity;
  available.forEach(b=>{
    const dist = (profile.lat && profile.lng && b.lat!=null && b.lng!=null) ? haversineKm(profile.lat, profile.lng, b.lat, b.lng) : 0;
    if(dist < nearestDist){ nearestDist = dist; nearest = b; }
  });
  rx.deliveryBoyId = nearest.id;
  rx.deliveryStatus = 'assigned';
  dbSet('prescriptions', list);
  nearest.currentRxId = rx.id;
  nearest.available = false; // busy until delivered
  dbSet('deliveryBoys', boys);
  pushNotification('delivery:'+nearest.id, 'New delivery assigned', `${db('profile').name} requested home delivery for: ${rx.medicines}.`, 'info', null);
  showToast('Delivery requested', nearest.name+' will bring your medicines — you\'ll see their live location here once they set out.', 'success');
  renderCurrentView('p-rx');
}
function sendToPharmacy(id){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===id);
  if(!rx) return;
  const pharmacies = db('pharmacies')||[];
  if(!pharmacies.length){
    showToast('No pharmacies registered yet', 'No pharmacy has signed up in your area yet — check back soon.', 'danger');
    return;
  }
  const profile = db('profile')||{};
  let nearest = pharmacies[0], nearestDist = Infinity;
  pharmacies.forEach(p=>{
    const dist = (profile.lat && profile.lng) ? haversineKm(profile.lat, profile.lng, p.lat, p.lng) : 0;
    if(dist < nearestDist){ nearestDist = dist; nearest = p; }
  });
  rx.targetPharmacyId = nearest.id;
  rx.pharmacyStatus = 'sent';
  dbSet('prescriptions', list);
  pushNotification('pharmacy:'+nearest.id, 'New prescription received', `${rx.medicines} — sent by a patient nearby for fulfillment.`, 'info', null);
  showToast('Sent to pharmacy', nearest.name+' has been notified for fulfillment.', 'success');
  renderCurrentView('p-rx');
}
// Lets the patient actually pick which pharmacy gets the prescription, instead
// of always auto-routing to the nearest one (sendToPharmacy() above still does
// that silently and is kept only as a fallback). Shows every registered
// pharmacy sorted nearest-first, each with distance + stock status, plus a
// small live map so "location too" is visible, not just a number. Tapping a
// row calls the existing sendSpecificPrescriptionToPharmacy(), so the actual
// send/notify logic isn't duplicated.
let pharmacyPickerMap = null;
function openPharmacyPickerForRx(rxId){
  const pharmacies = db('pharmacies')||[];
  if(!pharmacies.length){
    showToast('No pharmacies registered yet', 'No pharmacy has signed up in your area yet — check back soon.', 'danger');
    return;
  }
  const profile = db('profile')||{};
  const withDist = pharmacies.map(p=>({
    ...p,
    dist: (profile.lat!=null && profile.lng!=null && p.lat!=null && p.lng!=null) ? haversineKm(profile.lat, profile.lng, p.lat, p.lng) : null
  })).sort((a,b)=>(a.dist==null?Infinity:a.dist)-(b.dist==null?Infinity:b.dist));
  openModal(`
    <button class="modal-close-x" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
    <h3 style="margin-top:0;">Choose a pharmacy</h3>
    <p class="modal-sub">Nearest first. Tap one to send this prescription there.</p>
    <div class="card card-flush" style="margin-bottom:14px;"><div class="map-container" id="pharmacy-picker-map" style="min-height:180px;height:180px;"></div></div>
    <div style="display:flex;flex-direction:column;gap:10px;max-height:40vh;overflow-y:auto;">
      ${withDist.map(p=>`
        <div class="reminder-row" style="cursor:pointer;" onclick="sendSpecificPrescriptionToPharmacy('${rxId}','${p.id}')">
          <div>
            <strong>${p.name}</strong><br>
            <span style="color:var(--text-muted);font-size:.82rem;">${p.dist!=null ? p.dist.toFixed(1)+' km away' : 'Distance unknown'}${p.phone?' · '+p.phone:''}</span>
          </div>
          <span class="status-tag ${p.stock==='high'?'status-ok':p.stock==='medium'?'status-warn':'status-danger'}">${p.stock||'—'} stock</span>
        </div>`).join('')}
    </div>
  `);
  // Modal HTML is injected synchronously above but the #pharmacy-picker-map
  // div isn't attached/laid-out until the next tick — Leaflet needs real
  // dimensions to initialize against, hence the 0ms defer.
  setTimeout(()=>initPharmacyPickerMap(withDist, profile), 30);
}
function initPharmacyPickerMap(pharmacies, profile){
  const el = document.getElementById('pharmacy-picker-map');
  if(!el || typeof L==='undefined') return;
  if(pharmacyPickerMap){ pharmacyPickerMap.remove(); pharmacyPickerMap=null; }
  const center = (profile.lat!=null && profile.lng!=null) ? [profile.lat, profile.lng] : [BASE.lat, BASE.lng];
  pharmacyPickerMap = L.map(el, {zoomControl:false, scrollWheelZoom:false}).setView(center, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18}).addTo(pharmacyPickerMap);
  const pts = [];
  if(profile.lat!=null && profile.lng!=null){
    L.marker([profile.lat, profile.lng], {icon: icon('#0d9488')}).addTo(pharmacyPickerMap).bindPopup('You');
    pts.push([profile.lat, profile.lng]);
  }
  pharmacies.forEach(p=>{
    if(p.lat==null || p.lng==null) return;
    L.marker([p.lat, p.lng], {icon: icon('#2563eb')}).addTo(pharmacyPickerMap).bindPopup(p.name);
    pts.push([p.lat, p.lng]);
  });
  if(pts.length>1) pharmacyPickerMap.fitBounds(pts, {padding:[30,30]});
}
