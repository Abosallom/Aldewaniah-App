/* ===========================================================
   Boot — starts the app, dismisses the splash, wires the header
   refresh button, and registers the service worker with silent
   auto-update. Extracted from inline <script> blocks so the CSP
   can drop 'unsafe-inline' for scripts (XSS defense-in-depth).
   Loads right after the feature modules (order matters: modules
   must be registered before App.start()).
   =========================================================== */
(function () {
  App.start();

  // Header refresh button (was an inline onclick)
  const rb = document.getElementById('appRefresh');
  if (rb) rb.addEventListener('click', function () { try { location.reload(); } catch (e) {} });

  // Reveal the app once it's booted (spin the logo briefly first)
  const s = document.getElementById('splash');
  if (s) {
    setTimeout(function () {
      s.classList.add('hide');
      setTimeout(function () { if (s && s.parentNode) s.parentNode.removeChild(s); }, 500);
    }, 650);
  }

  /* Auto-update: keep the app on the latest version without quitting/reopening.
     When a new version is deployed, the new service worker installs in the
     background; once ready we activate it and reload the page once. We also
     re-check for updates periodically and whenever the app regains focus.
     Skipped inside the native shell (it ships its own bundled copy). */
  const isNative = window.NativeShell && NativeShell.isNative();
  if ('serviceWorker' in navigator && !isNative) {
    let updating = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updating) window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        const promote = (worker) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            // A NEW version finished installing (controller exists = this is an
            // update, not the first install) -> activate it now.
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              updating = true;
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          updating = true; reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => promote(reg.installing));
        const check = () => { reg.update().catch(() => {}); };
        setInterval(check, 60000); // check for a new version every minute
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      }).catch(() => {});
    });
  }
})();
