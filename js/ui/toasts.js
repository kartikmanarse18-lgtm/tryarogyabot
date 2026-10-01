/* ============================================================
   TOASTS
   ============================================================ */
function showToast(title, body, type){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast-message ' + (type==='danger'?'danger':type==='success'?'success':'');
  el.innerHTML = `<i class="fa-solid ${iconForType(type)}"></i><div><strong>${title}</strong><div style="color:#cbd5e1;font-size:.8rem;margin-top:2px;">${body||''}</div></div>`;
  stack.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateX(100%)'; setTimeout(()=>el.remove(),300); }, 5200);
}
