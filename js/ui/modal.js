/* ============================================================
   GENERIC MODAL
   ============================================================ */
function openModal(html){
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal(){ document.getElementById('modal-overlay').classList.add('hidden'); if(typeof pharmacyPickerMap!=='undefined' && pharmacyPickerMap){ pharmacyPickerMap.remove(); pharmacyPickerMap=null; } }
