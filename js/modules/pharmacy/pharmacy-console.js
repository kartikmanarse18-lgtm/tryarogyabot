/* ============================================================
   PHARMACY CONSOLE
   A pharmacy signs up like any other role (see ensurePharmacyRecord).
   Their listing then appears automatically in the patient-side "Nearby
   pharmacies" list, and any prescription a patient sends is routed here.

   Beyond the original stock-status toggle + prescription inbox, this
   console now also runs actual per-medicine inventory (with batch/
   container tracking) and a GST billing flow — see PHARMACY INVENTORY
   and PHARMACY BILLING & INVOICING below. Generating a bill is the one
   and only thing that deducts stock, so quantities can't silently drift
   out of sync with what's actually been sold.
   ============================================================ */
const STOCK_LEVELS = [
  {id:'high', label:'High — well stocked'},
  {id:'medium', label:'Medium — limited stock'},
  {id:'low', label:'Low — mostly out of stock'}
];
function viewPharmacyDash(){
  const p = db('pharmacies').find(x=>x.id===CURRENT_PHARMACY_ID);
  if(!p) return `<div class="empty-state"><p>Pharmacy record not found.</p></div>`;
  const orders = db('prescriptions').filter(r=>r.targetPharmacyId===CURRENT_PHARMACY_ID);
  const pending = orders.filter(r=>r.pharmacyStatus==='sent').length;
  const invAll = pharmacyInventoryList();
  const lowStock = invAll.filter(m=>m.qty<=(m.reorderLevel||10));
  const expiringSoon = invAll.filter(m=>{ const d=daysUntilDate(m.expiry); return d!==null && d>=0 && d<=90; });
  const expired = invAll.filter(m=>{ const d=daysUntilDate(m.expiry); return d!==null && d<0; });
  const bills = (db('pharmacyBills')||[]).filter(b=>b.pharmacyId===CURRENT_PHARMACY_ID);
  const paidRxIds = new Set(orders.filter(r=>r.paymentStatus==='paid').map(r=>r.id));
  const totalReceived = bills.filter(b=>b.rxId && paidRxIds.has(b.rxId)).reduce((s,b)=>s+b.grandTotal,0);
  return `
  ${viewHeader('Pharmacy Console', p.name, 'Your live stock status is what patients see in "Nearby pharmacies" — keep it current.')}
  <div class="grid-4">
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-boxes-stacked"></i></div><div><div class="dash-stat-num" style="text-transform:capitalize;">${p.stock}</div><div class="dash-stat-label">Current Stock Status</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-file-prescription"></i></div><div><div class="dash-stat-num">${pending}</div><div class="dash-stat-label">Pending Prescriptions</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-clipboard-check"></i></div><div><div class="dash-stat-num">${orders.length-pending}</div><div class="dash-stat-label">Fulfilled (all time)</div></div></div>
    <div class="dash-stat-card"><div class="dash-stat-icon"><i class="fa-solid fa-pills"></i></div><div><div class="dash-stat-num">${invAll.length}</div><div class="dash-stat-label">Medicines Tracked</div></div></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;"><i class="fa-solid fa-indian-rupee-sign"></i> Payments received</h3>
    <p style="font-family:var(--ff-display);font-size:1.8rem;font-weight:800;margin:0;">&#8377;${totalReceived.toFixed(2)}</p>
    <p style="color:var(--text-muted);font-size:.82rem;margin:6px 0 0;">From ${paidRxIds.size} patient app payment${paidRxIds.size===1?'':'s'} — in-person/cash sales are recorded separately in Billing &amp; Sales. See each order's status in Incoming Prescriptions.</p>
  </div>
  ${pending ? `<div class="card"><h3 style="margin-top:0;">Action needed</h3><button class="btn btn-danger" onclick="renderCurrentView('ph-orders')">View ${pending} pending prescription${pending>1?'s':''}</button></div>` : ''}
  ${(lowStock.length||expiringSoon.length||expired.length) ? `<div class="card">
    <h3 style="margin-top:0;">Inventory alerts</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      ${expired.length?`<span class="status-tag status-danger">${expired.length} expired</span>`:''}
      ${lowStock.length?`<span class="status-tag status-danger">${lowStock.length} low on stock</span>`:''}
      ${expiringSoon.length?`<span class="status-tag status-warn">${expiringSoon.length} expiring within 90 days</span>`:''}
    </div>
    <button class="btn btn-sm btn-secondary" onclick="renderCurrentView('ph-inventory')"><i class="fa-solid fa-boxes-stacked"></i> Review inventory</button>
  </div>` : ''}
  <div class="card">
    <h3 style="margin-top:0;">Update stock status</h3>
    <p style="color:var(--text-muted);font-size:.85rem;margin:0 0 14px;">This is the live status patients see when browsing nearby pharmacies. Keep it current as stock changes.</p>
    <div class="fit-row">
      <label>Stock status</label>
      <select class="fit-num" id="pharm-stock-select" style="flex:1;">
        ${STOCK_LEVELS.map(s=>`<option value="${s.id}" ${p.stock===s.id?'selected':''}>${s.label}</option>`).join('')}
      </select>
    </div>
    <button class="btn" onclick="updatePharmacyStock()"><i class="fa-solid fa-rotate"></i> Update status</button>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Business details (for invoices)</h3>
    <p style="color:var(--text-muted);font-size:.85rem;margin:0 0 14px;"><strong>${p.name}</strong><br>${p.phone||'No phone on file'}</p>
    <div class="grid-2">
      <div class="form-group"><label>Drug License No.</label><input class="form-control" id="pharm-license-input" value="${attr(p.license||'')}" placeholder="e.g. 20B/21B-MH-1234"></div>
      <div class="form-group"><label>GSTIN</label><input class="form-control" id="pharm-gstin-input" value="${attr(p.gstin||'')}" placeholder="e.g. 27AAAAA0000A1Z5"></div>
    </div>
    <button class="btn btn-secondary" onclick="savePharmacyBusinessDetails()"><i class="fa-solid fa-floppy-disk"></i> Save</button>
    <p style="color:var(--text-muted);font-size:.76rem;margin:10px 0 0;">These print on every generated bill — see Billing &amp; Sales.</p>
  </div>`;
}
function updatePharmacyStock(){
  const stock = document.getElementById('pharm-stock-select').value;
  const list = db('pharmacies');
  const p = list.find(x=>x.id===CURRENT_PHARMACY_ID);
  if(!p) return;
  p.stock = stock;
  dbSet('pharmacies', list);
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'update_stock', 'stock='+stock);
  showToast('Stock status updated', 'Now showing "'+stock+'" to nearby patients.', 'success');
  renderCurrentView('ph-dash');
}
function savePharmacyBusinessDetails(){
  const list = db('pharmacies');
  const p = list.find(x=>x.id===CURRENT_PHARMACY_ID);
  if(!p) return;
  p.license = document.getElementById('pharm-license-input').value.trim();
  p.gstin = document.getElementById('pharm-gstin-input').value.trim();
  dbSet('pharmacies', list);
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'business_details_update', 'License/GSTIN updated');
  showToast('Saved', 'Business details updated — they\'ll appear on your next printed invoice.', 'success');
  renderCurrentView('ph-dash');
}
function viewPharmacyOrders(){
  const orders = db('prescriptions').filter(r=>r.targetPharmacyId===CURRENT_PHARMACY_ID).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const bills = db('pharmacyBills')||[];
  return `${viewHeader('Incoming Prescriptions','Sent to you by patients nearby','Bill a prescription to bring its patient details into the billing screen automatically and mark it fulfilled the moment the sale is completed.')}
  ${orders.length ? orders.map(r=>{
    const bill = bills.find(b=>b.rxId===r.id);
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div><strong>${r.date||''}</strong> · ${r.doctor||'Unknown prescriber'}<p style="margin:8px 0 0;">${r.medicines}</p></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="status-tag ${r.pharmacyStatus==='fulfilled'?'status-ok':'status-warn'}">${r.pharmacyStatus==='fulfilled'?'Fulfilled':'Pending'}</span>
          ${bill ? (r.paymentStatus==='paid' ? `<span class="status-tag status-ok"><i class="fa-solid fa-circle-check"></i> Payment received · &#8377;${bill.grandTotal.toFixed(2)}</span>` : `<span class="status-tag status-warn">Awaiting payment · &#8377;${bill.grandTotal.toFixed(2)}</span>`) : ''}
        </div>
      </div>
      ${r.pharmacyStatus!=='fulfilled' ? `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="loadRxIntoBilling('${r.id}')"><i class="fa-solid fa-receipt"></i> Bill this prescription</button>
        <button class="btn btn-sm btn-secondary" onclick="markPharmacyOrderFulfilled('${r.id}')">Mark fulfilled without billing</button>
      </div>` : ''}
    </div>`;
  }).join('') : `<div class="empty-state"><i class="fa-solid fa-file-prescription"></i><p>No prescriptions sent to you yet.</p></div>`}`;
}
function markPharmacyOrderFulfilled(id){
  const list = db('prescriptions');
  const rx = list.find(r=>r.id===id);
  if(!rx) return;
  rx.pharmacyStatus = 'fulfilled';
  dbSet('prescriptions', list);
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'rx_fulfilled', id);
  showToast('Marked fulfilled', 'This prescription is now marked as fulfilled.', 'success');
  renderCurrentView('ph-orders');
}
