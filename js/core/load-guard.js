/* ============================================================
   LOAD GUARD — loaded FIRST. If any script/stylesheet file fails to
   load (bad deploy, missing file, network drop), show a clear banner
   with a Reload button instead of leaving the app half-working.
   Also catches stray runtime errors so one bad handler can't white-screen.
   ============================================================ */
(function(){
  var failed = [];
  window.__fileFailed = function(el){
    var name = (el && (el.src || el.href) || 'unknown file').split('/').slice(-2).join('/');
    failed.push(name);
    var b = document.getElementById('__load-banner');
    if(!b){
      b = document.createElement('div'); b.id = '__load-banner';
      b.setAttribute('role','alert');
      b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#7f1d1d;color:#fff;font:600 14px system-ui,sans-serif;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
      document.body.appendChild(b);
    }
    b.innerHTML = '<span>Part of the app failed to load (' + failed.join(', ') + '). Check your connection.</span>' +
      '<button style="margin-left:auto;padding:6px 14px;border:0;border-radius:8px;font-weight:700;cursor:pointer" onclick="location.reload()">Reload</button>';
  };
  window.addEventListener('error', function(e){ console.error('[ArogyaBot] Uncaught:', e.message, e.filename + ':' + e.lineno); });
  window.addEventListener('unhandledrejection', function(e){ console.error('[ArogyaBot] Unhandled promise rejection:', e.reason); });
})();
