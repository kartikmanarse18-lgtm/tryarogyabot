/* ============================================================
   PHARMACY BILLING & INVOICING
   A transient "draft bill" lives in window.__phBillCart (same pattern as
   window.__cycDraft elsewhere) so it survives the full-view re-renders
   this app does after every click, without needing to persist a
   half-finished bill to storage. Only finalizeBill() writes anything —
   that's the single point where stock is deducted and the invoice
   record is created, so a bill and a stock deduction can never happen
   without each other.
   ============================================================ */
function phBillDraft(){
  if(!window.__phBillCart) window.__phBillCart = {rxId:'', patientName:'', patientPhone:'', discountPct:0, items:[]};
  return window.__phBillCart;
}
// Reads whatever's currently typed in the customer/discount fields back into
// the draft before any cart mutation triggers a full re-render — otherwise
// typed-but-unsubmitted text would be wiped the moment "Add to bill" is clicked.
function phBillSyncFieldsFromDom(){
  const d = phBillDraft();
  const nameEl = document.getElementById('bill-patient-name');
  const phoneEl = document.getElementById('bill-patient-phone');
  const discEl = document.getElementById('bill-discount');
  if(nameEl) d.patientName = nameEl.value;
  if(phoneEl) d.patientPhone = phoneEl.value;
  if(discEl) d.discountPct = Math.max(0, Math.min(100, parseFloat(discEl.value)||0));
}
// Indian retail medicine MRP is legally GST-inclusive, so the tax is backed
// out of the MRP rather than added on top — this mirrors how a real pharmacy
// POS/bill computes it. CGST+SGST split (half each) is the standard intra-
// state presentation; round-off is applied once on the final total, like a
// real printed bill.
function computeBillTotals(items, discountPct){
  let taxable=0, cgst=0, sgst=0;
  const lines = items.map(it=>{
    const lineGross = it.mrp*it.qty;
    const discGross = lineGross*(1-(discountPct||0)/100);
    const lineTaxable = discGross/(1+it.gst/100);
    const lineGst = discGross-lineTaxable;
    taxable += lineTaxable; cgst += lineGst/2; sgst += lineGst/2;
    return {...it, lineGross, discGross, lineTaxable, cgstAmt: lineGst/2, sgstAmt: lineGst/2};
  });
  const rawTotal = taxable+cgst+sgst;
  const rounded = Math.round(rawTotal);
  const roundOff = +(rounded-rawTotal).toFixed(2);
  return {lines, taxable, cgst, sgst, rawTotal, rounded, roundOff};
}
// Pulls a pending prescription's patient details into the draft bill —
// called both from "Bill this prescription" on the orders screen and from
// the link-a-prescription dropdown on the billing screen itself.
function loadRxIntoBilling(rxId){
  phBillSyncFieldsFromDom();
  const d = phBillDraft();
  d.rxId = rxId;
  if(rxId){
    const rx = (db('prescriptions')||[]).find(r=>r.id===rxId);
    if(rx){
      const found = findPatientMemberById(rx.ownerId);
      if(found){
        d.patientName = found.member.name || d.patientName;
        d.patientPhone = found.account.phone || d.patientPhone;
      }
    }
  }
  renderCurrentView('ph-billing');
}
function addToBillCart(){
  phBillSyncFieldsFromDom();
  const d = phBillDraft();
  const medId = document.getElementById('bill-med-select').value;
  const qty = parseInt(document.getElementById('bill-med-qty').value, 10);
  if(!medId){ showToast('Pick a medicine', 'Select a medicine from your inventory to add.', 'danger'); return; }
  if(!qty || qty<=0){ showToast('Invalid quantity', 'Enter a quantity greater than zero.', 'danger'); return; }
  const inv = (db('pharmacyInventory')||[]).find(m=>m.id===medId);
  if(!inv){ showToast('Not found', 'That medicine is no longer in your inventory.', 'danger'); return; }
  const alreadyInCart = d.items.filter(i=>i.medId===medId).reduce((s,i)=>s+i.qty,0);
  if(alreadyInCart+qty > inv.qty){
    showToast('Not enough stock', `Only ${inv.qty-alreadyInCart} ${inv.unit.toLowerCase()}(s) of ${inv.name} left in stock.`, 'danger');
    return;
  }
  const existing = d.items.find(i=>i.medId===medId);
  if(existing) existing.qty += qty;
  else d.items.push({medId, name:inv.name, batch:inv.batch, hsn:inv.hsn||'3004', unit:inv.unit, qty, mrp:+inv.mrp, gst:inv.gst});
  renderCurrentView('ph-billing');
}
function removeFromBillCart(medId){
  phBillSyncFieldsFromDom();
  const d = phBillDraft();
  d.items = d.items.filter(i=>i.medId!==medId);
  renderCurrentView('ph-billing');
}
function clearBillCart(){
  const d = phBillDraft();
  if(d.items.length && !confirm('Clear all items from this bill?')) return;
  window.__phBillCart = {rxId:'', patientName:'', patientPhone:'', discountPct:0, items:[]};
  renderCurrentView('ph-billing');
}
function viewPharmacyBilling(){
  const d = phBillDraft();
  const invInStock = pharmacyInventoryList().filter(m=>m.qty>0).sort((a,b)=>a.name.localeCompare(b.name));
  const pendingRx = (db('prescriptions')||[]).filter(r=>r.targetPharmacyId===CURRENT_PHARMACY_ID && r.pharmacyStatus!=='fulfilled');
  const totals = computeBillTotals(d.items, d.discountPct);
  const linkedRx = d.rxId ? (db('prescriptions')||[]).find(r=>r.id===d.rxId) : null;
  const bills = (db('pharmacyBills')||[]).filter(b=>b.pharmacyId===CURRENT_PHARMACY_ID).sort((a,b)=>b.createdAt-a.createdAt).slice(0,15);
  return `${viewHeader('Billing &amp; Sales','Generate a GST invoice','Add medicines from your inventory, generate a proper tax invoice with CGST/SGST, and print it — stock is deducted automatically the moment a bill is finalized.')}
  <div class="card">
    <h3 style="margin-top:0;">Link a prescription (optional)</h3>
    <select class="form-control" id="bill-rx-select" onchange="loadRxIntoBilling(this.value)">
      <option value="">Walk-in / OTC sale — no prescription</option>
      ${pendingRx.map(r=>`<option value="${r.id}" ${d.rxId===r.id?'selected':''}>${r.date||''} · ${r.doctor||'Unknown prescriber'} — ${(r.medicines||'').slice(0,50)}</option>`).join('')}
    </select>
    ${linkedRx ? `<p style="color:var(--text-muted);font-size:.82rem;margin:10px 0 0;"><strong>Prescribed:</strong> ${linkedRx.medicines}</p>` : ''}
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Add medicine</h3>
    ${invInStock.length ? `
    <div class="grid-2">
      <div class="form-group"><label>Medicine (in stock)</label>
        <select class="form-control" id="bill-med-select">
          ${invInStock.map(m=>`<option value="${m.id}">${m.name}${m.batch?' · Batch '+m.batch:''} — ${m.qty} ${m.unit} left @ ₹${(+m.mrp).toFixed(2)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Quantity</label><input type="number" min="1" value="1" class="form-control" id="bill-med-qty"></div>
    </div>
    <button class="btn btn-secondary" onclick="addToBillCart()"><i class="fa-solid fa-cart-plus"></i> Add to bill</button>
    ` : `<p style="color:var(--text-muted);margin:0;">No medicines in stock — add some in <a href="#" onclick="renderCurrentView('ph-inventory');return false;">Inventory</a> first.</p>`}
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Bill items</h3>
    ${d.items.length ? `<div style="overflow-x:auto;"><table class="data-table">
      <thead><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>MRP</th><th>GST</th><th>Amount</th><th></th></tr></thead>
      <tbody>
      ${totals.lines.map(l=>`<tr><td>${l.name}</td><td>${l.batch||'—'}</td><td>${l.qty} ${l.unit}</td><td>₹${l.mrp.toFixed(2)}</td><td>${l.gst}%</td><td>₹${l.discGross.toFixed(2)}</td><td><button class="btn btn-sm btn-danger" onclick="removeFromBillCart('${l.medId}')" title="Remove"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('')}
      </tbody>
    </table></div>` : `<p style="color:var(--text-muted);margin:0;">No items added yet.</p>`}
  </div>
  ${d.items.length ? `
  <div class="card">
    <h3 style="margin-top:0;">Customer &amp; totals</h3>
    <div class="grid-2">
      <div class="form-group"><label>Patient / customer name</label><input class="form-control" id="bill-patient-name" value="${attr(d.patientName)}" placeholder="Optional for walk-ins" onchange="phBillSyncFieldsFromDom()"></div>
      <div class="form-group"><label>Phone</label><input class="form-control" id="bill-patient-phone" value="${attr(d.patientPhone)}" placeholder="Optional" onchange="phBillSyncFieldsFromDom()"></div>
    </div>
    <div class="form-group" style="max-width:200px;"><label>Discount %</label><input type="number" min="0" max="100" class="form-control" id="bill-discount" value="${d.discountPct||0}" onchange="renderCurrentView('ph-billing')"></div>
    <div style="border-top:1px dashed var(--border-color);margin-top:10px;padding-top:14px;font-family:var(--ff-mono);font-size:.88rem;">
      <div style="display:flex;justify-content:space-between;"><span>Taxable value</span><span>₹${totals.taxable.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>CGST</span><span>₹${totals.cgst.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>SGST</span><span>₹${totals.sgst.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Round off</span><span>₹${totals.roundOff.toFixed(2)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.05rem;margin-top:6px;border-top:1px solid var(--border-color);padding-top:8px;"><span>Grand total</span><span>₹${totals.rounded.toFixed(2)}</span></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
      <button class="btn" onclick="finalizeBill()"><i class="fa-solid fa-receipt"></i> Generate &amp; print bill</button>
      <button class="btn btn-secondary" onclick="clearBillCart()"><i class="fa-solid fa-trash"></i> Clear</button>
    </div>
  </div>` : ''}
  <div class="card">
    <h3 style="margin-top:0;">Recent bills</h3>
    ${bills.length ? `<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Bill #</th><th>Date</th><th>Patient</th><th>Amount</th><th></th></tr></thead><tbody>
    ${bills.map(b=>`<tr><td>${b.billNo}</td><td>${new Date(b.createdAt).toLocaleString()}</td><td>${b.patientName||'Walk-in'}</td><td>₹${b.grandTotal.toFixed(2)}</td><td><button class="btn btn-sm btn-secondary" onclick="reprintBill('${b.id}')"><i class="fa-solid fa-print"></i> Print</button></td></tr>`).join('')}
    </tbody></table></div>` : `<p style="color:var(--text-muted);margin:0;">No bills generated yet.</p>`}
  </div>`;
}
function finalizeBill(){
  phBillSyncFieldsFromDom();
  const d = phBillDraft();
  if(!d.items.length){ showToast('Empty bill', 'Add at least one medicine first.', 'danger'); return; }
  // Re-verify stock right before committing — inventory could have changed
  // (e.g. synced in from another device) since items were added to the cart.
  const inv = db('pharmacyInventory')||[];
  for(const item of d.items){
    const stockItem = inv.find(m=>m.id===item.medId);
    if(!stockItem || stockItem.qty<item.qty){
      showToast('Stock changed', `${item.name} no longer has enough stock (${stockItem?stockItem.qty:0} left). Adjust the bill and try again.`, 'danger');
      renderCurrentView('ph-billing');
      return;
    }
  }
  const totals = computeBillTotals(d.items, d.discountPct);
  const pList = db('pharmacies')||[];
  const pharmacy = pList.find(p=>p.id===CURRENT_PHARMACY_ID);
  const billNo = 'INV-'+String((pharmacy&&pharmacy.billCounter||0)+1).padStart(5,'0');
  if(pharmacy){ pharmacy.billCounter = (pharmacy.billCounter||0)+1; dbSet('pharmacies', pList); }
  // The one and only place stock is deducted for a sale.
  d.items.forEach(item=>{ const stockItem = inv.find(m=>m.id===item.medId); stockItem.qty -= item.qty; });
  dbSet('pharmacyInventory', inv);
  const bill = {
    id: uid('BILL'), billNo, pharmacyId: CURRENT_PHARMACY_ID,
    patientName: d.patientName||'', patientPhone: d.patientPhone||'', rxId: d.rxId||null,
    discountPct: d.discountPct||0, items: totals.lines,
    taxable: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, roundOff: totals.roundOff, grandTotal: totals.rounded,
    createdAt: now()
  };
  const bills = db('pharmacyBills')||[];
  bills.push(bill);
  dbSet('pharmacyBills', bills);
  if(d.rxId){
    const rxList = db('prescriptions')||[];
    const rx = rxList.find(r=>r.id===d.rxId);
    if(rx){
      rx.pharmacyStatus = 'fulfilled';
      dbSet('prescriptions', rxList);
      pushNotification('patient:'+rx.ownerId, 'Prescription fulfilled', `Your prescription was fulfilled at ${pharmacy?pharmacy.name:'the pharmacy'}. Bill ${billNo} — ₹${bill.grandTotal.toFixed(2)}.`, 'success', null);
    }
  }
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'bill_generated', billNo+' — ₹'+bill.grandTotal.toFixed(2)+' ('+d.items.length+' item'+(d.items.length===1?'':'s')+')');
  showToast('Bill generated', billNo+' — ₹'+bill.grandTotal.toFixed(2)+'. Stock updated.', 'success');
  window.__phBillCart = {rxId:'', patientName:'', patientPhone:'', discountPct:0, items:[]};
  renderCurrentView('ph-billing');
  printBillInvoice(bill.id);
}
function reprintBill(id){ printBillInvoice(id); }
function printBillInvoice(id){
  const bill = (db('pharmacyBills')||[]).find(b=>b.id===id);
  if(!bill) return;
  const pharmacy = (db('pharmacies')||[]).find(p=>p.id===bill.pharmacyId) || {};
  const area = document.getElementById('print-invoice-area');
  if(!area) return;
  area.innerHTML = renderInvoiceHtml(bill, pharmacy);
  setTimeout(()=>window.print(), 60); // let the freshly-injected DOM paint before the print dialog opens
}
function renderInvoiceHtml(bill, pharmacy){
  const dt = new Date(bill.createdAt);
  return `<div class="invoice-box">
    <div class="invoice-head">
      <h2>${pharmacy.name||'Pharmacy'}</h2>
      <p>${[pharmacy.phone?('Phone: '+pharmacy.phone):'', pharmacy.license?('Drug License: '+pharmacy.license):''].filter(Boolean).join(' &nbsp;·&nbsp; ')}</p>
      <p>GSTIN: ${pharmacy.gstin||'—'}</p>
    </div>
    <div class="invoice-title">TAX INVOICE</div>
    <div class="invoice-meta">
      <div><strong>Invoice No:</strong> ${bill.billNo}</div>
      <div><strong>Date:</strong> ${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</div>
      <div><strong>Patient:</strong> ${bill.patientName||'Walk-in customer'}</div>
      <div><strong>Phone:</strong> ${bill.patientPhone||'—'}</div>
    </div>
    <table class="invoice-table">
      <thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>HSN</th><th>Qty</th><th>MRP</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Amount</th></tr></thead>
      <tbody>
      ${bill.items.map((l,i)=>`<tr>
        <td>${i+1}</td><td>${l.name}</td><td>${l.batch||'—'}</td><td>${l.hsn||'3004'}</td>
        <td>${l.qty} ${l.unit}</td><td>₹${l.mrp.toFixed(2)}</td>
        <td>₹${l.lineTaxable.toFixed(2)}</td>
        <td>₹${l.cgstAmt.toFixed(2)} (${l.gst/2}%)</td>
        <td>₹${l.sgstAmt.toFixed(2)} (${l.gst/2}%)</td>
        <td>₹${l.discGross.toFixed(2)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    <div class="invoice-totals">
      ${bill.discountPct?`<div><span>Discount applied</span><span>${bill.discountPct}%</span></div>`:''}
      <div><span>Taxable value</span><span>₹${bill.taxable.toFixed(2)}</span></div>
      <div><span>CGST</span><span>₹${bill.cgst.toFixed(2)}</span></div>
      <div><span>SGST</span><span>₹${bill.sgst.toFixed(2)}</span></div>
      <div><span>Round off</span><span>₹${bill.roundOff.toFixed(2)}</span></div>
      <div class="grand"><span>Grand Total</span><span>₹${bill.grandTotal.toFixed(2)}</span></div>
    </div>
    <p class="invoice-footer">This is a computer-generated invoice. Medicines once sold are non-returnable except in case of a verified manufacturing defect. Thank you for visiting.</p>
  </div>`;
}
