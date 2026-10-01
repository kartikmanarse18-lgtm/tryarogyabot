/* ============================================================
   QUICK-ACCESS DRAWER (v2) — one button, opens every section as a
   grid so it's all visible at once instead of another thing to
   scroll through. Reuses the same SIDENAV.patient list (and the
   same Women's Health gender filter) so this never drifts out of
   sync with the real nav as sections get added or renamed.
   ============================================================ */
function quickDrawer(activeId){
  return `<button class="quick-drawer-trigger" onclick="openQuickDrawer('${activeId}')"><i class="fa-solid fa-grip"></i> Quick access — jump to any section</button>
  <div class="quick-drawer-overlay hidden" id="quick-drawer-overlay" onclick="if(event.target===this) closeQuickDrawer();">
    <div class="quick-drawer-sheet">
      <div class="quick-drawer-sheet-head">
        <h3>Jump to a section</h3>
        <button class="quick-drawer-close" onclick="closeQuickDrawer()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="quick-drawer-grid" id="quick-drawer-grid"></div>
    </div>
  </div>`;
}
function openQuickDrawer(activeId){
  const gender = (db('profile')||{}).gender;
  let items = SIDENAV.patient;
  if(gender!=='Female') items = items.filter(item=>item.id!=='p-women');
  const grid = document.getElementById('quick-drawer-grid');
  if(grid){
    grid.innerHTML = items.map(item=>
      `<button class="quick-tile${item.id===activeId?' active':''}" onclick="closeQuickDrawer(); ${SIDENAV_HANDOFFS[item.id] || `renderCurrentView('${item.id}')`}"><i class="fa-solid ${item.icon}"></i><span>${item.label.replace(/&amp;/g,'&')}</span></button>`
    ).join('');
  }
  const overlay = document.getElementById('quick-drawer-overlay');
  if(overlay) overlay.classList.remove('hidden');
}
function closeQuickDrawer(){
  const overlay = document.getElementById('quick-drawer-overlay');
  if(overlay) overlay.classList.add('hidden');
}
