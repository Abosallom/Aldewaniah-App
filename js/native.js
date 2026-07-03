/* ===========================================================
   Native shell detection (Capacitor iOS wrapper).
   The SAME static files serve three channels: website, PWA and
   the App Store app. This file is the single place where the
   native app diverges from the website:
   - html.native class (CSS hooks)
   - suppress web-only UI (install banner — an "install this
     website" prompt inside a native app reads as a repackaged
     website to App Review; Guideline 4.2)
   - skip the service-worker auto-update loop (the shell ships
     its own bundled copy of the app)
   Load this BEFORE install.js and boot.js.
   =========================================================== */
(function () {
  let native = false;
  try {
    native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  } catch (e) { native = false; }
  // Fallback: the capacitor:// scheme (iOS shell) even if the bridge is absent
  if (!native && location.protocol === 'capacitor:') native = true;

  if (native) document.documentElement.classList.add('native');

  window.NativeShell = {
    isNative() { return native; }
  };
})();
