/* ============================================================
   PHARMACY INVENTORY
   Stock lives in the shared 'pharmacyInventory' collection, one entry
   per medicine, tagged with pharmacyId (same pattern as 'doctors' being
   tagged with a hospital id) — each pharmacy only ever sees its own.
   Quantities are only ever changed here (manually) or by
   finalizeBill()/undoBillStock() when a sale is made or reversed.
   ============================================================ */
const GST_RATES = [5, 12, 18]; // standard Indian GST slabs that apply to pharma (HSN 30xx); MRP is treated as GST-inclusive, as required by law
const MED_UNITS = ['Strip','Bottle','Box','Tube','Vial','Sachet','Piece','Jar'];
function pharmacyInventoryList(){ return (db('pharmacyInventory')||[]).filter(m=>m.pharmacyId===CURRENT_PHARMACY_ID); }
// Whole-day granularity is enough here — returns null if there's no expiry set,
// negative if already expired, else days remaining.
function daysUntilDate(dateStr){
  if(!dateStr) return null;
  const d = new Date(dateStr+'T00:00:00');
  if(isNaN(d.getTime())) return null;
  return Math.round((d - new Date(new Date().toDateString())) / 86400000);
}
function viewPharmacyInventory(){
  const list = pharmacyInventoryList().sort((a,b)=>a.name.localeCompare(b.name));
  return `${viewHeader('Medicine Inventory','Stock, batches &amp; storage locations','Track what you actually have on the shelf — including which batch and which container/rack it\'s in — and get warned before something runs low or expires. Quantities only change here or automatically when a bill is generated.')}
  <div class="card">
    <h3 style="margin-top:0;">Add medicine</h3>
    <div class="grid-2">
      <div class="form-group"><label>Medicine name</label><input class="form-control" id="med-name" placeholder="e.g. Paracetamol 500mg"></div>
      <div class="form-group"><label>Generic / composition</label><input class="form-control" id="med-generic" placeholder="e.g. Paracetamol"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Manufacturer</label><input class="form-control" id="med-mfr" placeholder="e.g. Cipla"></div>
      <div class="form-group"><label>Batch No.</label><input class="form-control" id="med-batch" placeholder="e.g. B4471"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Container / rack location</label><input class="form-control" id="med-container" placeholder="e.g. Rack A3, Shelf 2, Box 14"></div>
      <div class="form-group"><label>Unit type</label><select class="form-control" id="med-unit">${MED_UNITS.map(u=>`<option>${u}</option>`).join('')}</select></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Quantity in stock</label><input type="number" min="0" class="form-control" id="med-qty" placeholder="e.g. 200"></div>
      <div class="form-group"><label>MRP per unit (₹, incl. GST)</label><input type="number" min="0" step="0.01" class="form-control" id="med-mrp" placeholder="e.g. 25.00"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>GST rate</label><select class="form-control" id="med-gst">${GST_RATES.map(r=>`<option value="${r}" ${r===12?'selected':''}>${r}%</option>`).join('')}</select></div>
      <div class="form-group"><label>HSN code</label><input class="form-control" id="med-hsn" value="3004"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Expiry date</label><input type="date" class="form-control" id="med-expiry"></div>
      <div class="form-group"><label>Low-stock alert below</label><input type="number" min="0" class="form-control" id="med-reorder" value="10"></div>
    </div>
    <button class="btn" onclick="addMedicineToInventory()"><i class="fa-solid fa-plus"></i> Add to inventory</button>
  </div>
  <div class="card card-flush">
  ${list.length ? `<div style="overflow-x:auto;"><table class="data-table">
    <thead><tr><th>Medicine</th><th>Batch</th><th>Container</th><th>Qty</th><th>MRP</th><th>GST</th><th>Expiry</th><th></th></tr></thead>
    <tbody>
    ${list.map(m=>{
      const low = m.qty<=(m.reorderLevel||10);
      const dLeft = daysUntilDate(m.expiry);
      const expired = dLeft!==null && dLeft<0;
      const soon = !expired && dLeft!==null && dLeft<=90;
      return `<tr>
        <td><strong>${m.name}</strong>${m.generic?`<br><span style="color:var(--text-muted);font-size:.74rem;">${m.generic}</span>`:''}</td>
        <td>${m.batch||'—'}</td>
        <td>${m.container||'—'}</td>
        <td>${m.qty} ${m.unit}${low?` <span class="status-tag status-danger low-stock-badge">Low</span>`:''}</td>
        <td>₹${(+m.mrp).toFixed(2)}</td>
        <td>${m.gst}%</td>
        <td>${m.expiry||'—'}${expired?` <span class="status-tag status-danger low-stock-badge">Expired</span>`:soon?` <span class="status-tag status-warn low-stock-badge">Expiring soon</span>`:''}</td>
        <td style="display:flex;gap:6px;"><button class="btn btn-sm btn-secondary" onclick="editMedicineModal('${m.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-danger" onclick="deleteMedicineFromInventory('${m.id}')" title="Remove"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>` : `<div class="empty-state"><i class="fa-solid fa-pills"></i><p>No medicines added yet — add your first one above.</p></div>`}
  </div>`;
}
function addMedicineToInventory(){
  const name = document.getElementById('med-name').value.trim();
  const qty = parseInt(document.getElementById('med-qty').value, 10);
  const mrp = parseFloat(document.getElementById('med-mrp').value);
  if(!name || isNaN(qty) || qty<0 || isNaN(mrp) || mrp<=0){
    showToast('Missing info', 'Enter at least the medicine name, a valid quantity, and MRP.', 'danger');
    return;
  }
  const list = db('pharmacyInventory')||[];
  const batch = document.getElementById('med-batch').value.trim();
  list.push({
    id: uid('MED'),
    pharmacyId: CURRENT_PHARMACY_ID,
    name,
    generic: document.getElementById('med-generic').value.trim(),
    mfr: document.getElementById('med-mfr').value.trim(),
    batch,
    container: document.getElementById('med-container').value.trim(),
    unit: document.getElementById('med-unit').value,
    qty,
    mrp,
    gst: parseFloat(document.getElementById('med-gst').value),
    hsn: document.getElementById('med-hsn').value.trim() || '3004',
    expiry: document.getElementById('med-expiry').value,
    reorderLevel: parseInt(document.getElementById('med-reorder').value,10) || 10,
    addedAt: now()
  });
  dbSet('pharmacyInventory', list);
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'medicine_add', name+(batch?' (batch '+batch+')':'')+' — qty '+qty);
  showToast('Medicine added', name+' added to your inventory.', 'success');
  renderCurrentView('ph-inventory');
}
function editMedicineModal(id){
  const list = db('pharmacyInventory')||[];
  const m = list.find(x=>x.id===id);
  if(!m) return;
  openModal(`
    <h2 style="margin-top:0;">Edit medicine</h2>
    <div class="form-group"><label>Medicine name</label><input class="form-control" id="em-name" value="${attr(m.name)}"></div>
    <div class="grid-2">
      <div class="form-group"><label>Generic / composition</label><input class="form-control" id="em-generic" value="${attr(m.generic)}"></div>
      <div class="form-group"><label>Manufacturer</label><input class="form-control" id="em-mfr" value="${attr(m.mfr)}"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Batch No.</label><input class="form-control" id="em-batch" value="${attr(m.batch)}"></div>
      <div class="form-group"><label>Container / rack location</label><input class="form-control" id="em-container" value="${attr(m.container)}" placeholder="e.g. Rack A3, Shelf 2, Box 14"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Quantity in stock</label><input type="number" min="0" class="form-control" id="em-qty" value="${m.qty}"></div>
      <div class="form-group"><label>Unit</label><select class="form-control" id="em-unit">${MED_UNITS.map(u=>`<option ${m.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>MRP per unit (₹, incl. GST)</label><input type="number" min="0" step="0.01" class="form-control" id="em-mrp" value="${m.mrp}"></div>
      <div class="form-group"><label>GST rate</label><select class="form-control" id="em-gst">${GST_RATES.map(r=>`<option value="${r}" ${m.gst===r?'selected':''}>${r}%</option>`).join('')}</select></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>HSN code</label><input class="form-control" id="em-hsn" value="${attr(m.hsn||'3004')}"></div>
      <div class="form-group"><label>Expiry date</label><input type="date" class="form-control" id="em-expiry" value="${m.expiry||''}"></div>
    </div>
    <div class="form-group"><label>Low-stock alert below</label><input type="number" min="0" class="form-control" id="em-reorder" value="${m.reorderLevel||10}"></div>
    <button class="btn btn-block" onclick="saveMedicineEdit('${id}')"><i class="fa-solid fa-floppy-disk"></i> Save changes</button>
  `);
}
function saveMedicineEdit(id){
  const list = db('pharmacyInventory')||[];
  const m = list.find(x=>x.id===id);
  if(!m) return;
  m.name = document.getElementById('em-name').value.trim() || m.name;
  m.generic = document.getElementById('em-generic').value.trim();
  m.mfr = document.getElementById('em-mfr').value.trim();
  m.batch = document.getElementById('em-batch').value.trim();
  m.container = document.getElementById('em-container').value.trim();
  m.qty = Math.max(0, parseInt(document.getElementById('em-qty').value,10)||0);
  m.unit = document.getElementById('em-unit').value;
  m.mrp = Math.max(0, parseFloat(document.getElementById('em-mrp').value)||0);
  m.gst = parseFloat(document.getElementById('em-gst').value);
  m.hsn = document.getElementById('em-hsn').value.trim() || '3004';
  m.expiry = document.getElementById('em-expiry').value;
  m.reorderLevel = Math.max(0, parseInt(document.getElementById('em-reorder').value,10)||0);
  dbSet('pharmacyInventory', list);
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'medicine_edit', m.name);
  closeModal();
  showToast('Updated', m.name+' details saved.', 'success');
  renderCurrentView('ph-inventory');
}
function deleteMedicineFromInventory(id){
  const list = db('pharmacyInventory')||[];
  const m = list.find(x=>x.id===id);
  if(!m) return;
  if(!confirm('Remove '+m.name+' (batch '+(m.batch||'—')+') from inventory? This cannot be undone.')) return;
  dbSet('pharmacyInventory', list.filter(x=>x.id!==id));
  audit('pharmacy:'+CURRENT_PHARMACY_ID, 'medicine_delete', m.name);
  showToast('Removed', m.name+' removed from inventory.', 'success');
  renderCurrentView('ph-inventory');
}
