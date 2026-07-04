/* ===========================================================
   Error logger — the app's "black box". Captures JS errors and
   unhandled promise rejections from every member's device into
   Firestore `errors` (admin-read-only) so the AI health monitor
   can see real problems as they happen. Sanitised, throttled,
   and deduped so it never spams or leaks data.
   =========================================================== */
(function () {
  var SENT = {};            // signature -> last-sent ms (dedupe window)
  var WINDOW = 5 * 60000;   // don't resend the same error within 5 min
  var count = 0, CAP = 40;  // per-session cap (safety)

  function sig(msg, src, line) { return (msg || '') + '|' + (src || '') + '|' + (line || ''); }

  function log(kind, message, source, line, col, stack) {
    try {
      if (count >= CAP) return;
      if (!(window.firebase && firebase.firestore && firebase.auth)) return;
      var user = firebase.auth().currentUser;
      if (!user || !user.phoneNumber) return;             // members only
      var s = sig(message, source, line);
      var now = Date.now();
      if (SENT[s] && now - SENT[s] < WINDOW) return;
      SENT[s] = now; count++;

      var member = (window.Auth && Auth.member && Auth.member()) || {};
      firebase.firestore().collection('errors').add({
        kind: kind,                                        // 'error' | 'promise' | 'manual'
        message: String(message || '').slice(0, 500),
        source: String(source || '').replace(location.origin, '').slice(0, 200),
        line: line || null,
        stack: String(stack || '').slice(0, 1200),
        page: (location.hash || '').slice(1) || 'home',
        version: (window.APP_VERSION || cacheVer() || ''),
        ua: (navigator.userAgent || '').slice(0, 200),
        by: member.name || '',
        uid: (Auth.uid && Auth.uid()) || '',
        at: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (e) {}
  }

  function cacheVer() {
    try { return (document.querySelector('meta[name="app-version"]') || {}).content || ''; } catch (e) { return ''; }
  }

  window.addEventListener('error', function (e) {
    // ignore benign cross-origin "Script error." with no detail
    if ((e.message === 'Script error.' || !e.message) && !e.error) return;
    log('error', e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var msg = (r && (r.message || r.code)) || String(r || 'unhandledrejection');
    // Firestore permission-denied on signed-out probes is expected noise — skip
    if (/permission|insufficient/i.test(msg) && !(window.Auth && Auth.isMember && Auth.isMember())) return;
    log('promise', msg, '', null, null, r && r.stack);
  });

  // let other code report a handled problem explicitly
  window.ErrLog = { report: function (msg, extra) { log('manual', msg, '', null, null, extra); } };
})();
