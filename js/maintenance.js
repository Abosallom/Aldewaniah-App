/* ===========================================================
   Maintenance / pause mode.
   The admin can pause the whole app (from the Admin tab): a
   full-screen page with a custom message (and an optional
   countdown) is shown to everyone. Admins bypass it so they can
   turn it back on. State lives in Firestore doc config/app:
     { paused: bool, message: string, until: timestamp|null }
   It updates in real time for all open clients.
   =========================================================== */
(function () {
  if (!window.firebase) return;
  I18n.extend({
    ar: { mnt_default: 'التطبيق متوقف مؤقتًا للصيانة. نعود قريبًا بإذن الله 🌿', mnt_until: 'يعود العمل بعد' },
    en: { mnt_default: "The app is paused for maintenance. We'll be back soon 🌿", mnt_until: 'Back in' }
  });

  let el = null, last = null, until = 0, lift = null, pend = null;

  function isAdmin() { return !!(window.Auth && Auth.isAdmin && Auth.isAdmin()); }

  // True while a phone member is signing in but we don't yet know whether they
  // are the admin. We must NOT flash the pause page in this window — the admin
  // keeps full access and should never even glimpse it.
  function authResolving() {
    try {
      const u = firebase.auth().currentUser;
      return !!(u && u.phoneNumber && !u.isAnonymous &&
                (!window.Auth || !Auth.status || Auth.status() === null));
    } catch (e) { return false; }
  }

  function evaluate() {
    const paused = !!(last && last.paused === true);
    until = (last && last.until && last.until.toMillis) ? last.until.toMillis() : 0;
    const within = !until || until > Date.now();
    if (pend) { clearTimeout(pend); pend = null; }
    if (paused && within) {
      if (isAdmin()) {
        hide();                       // admin keeps using the app while it's paused
      } else if (authResolving()) {
        hide();                       // wait until we know if this is the admin
        pend = setTimeout(evaluate, 350);
      } else {
        render();                     // everyone else sees the pause page
      }
    } else {
      hide();
    }
    if (lift) { clearTimeout(lift); lift = null; }
    if (paused && until && until > Date.now()) {
      lift = setTimeout(evaluate, Math.min(60000, Math.max(1000, until - Date.now() + 300)));
    }
  }

  function render() {
    if (!el) { el = UI.el('div', { id: 'maintenance', class: 'mnt' }); document.body.appendChild(el); }
    el.innerHTML = '';
    el.appendChild(UI.el('img', { class: 'mnt-logo', src: 'assets/icon-192.png', alt: '' }));
    el.appendChild(UI.el('div', { class: 'mnt-msg' }, (last && last.message) || I18n.t('mnt_default')));
    if (until && until > Date.now()) { const c = UI.el('div', { class: 'mnt-count' }); el.appendChild(c); countdown(c); }
    el.style.display = 'flex';
  }

  function countdown(c) {
    (function upd() {
      if (!el || el.style.display === 'none') return;
      const ms = until - Date.now();
      if (ms <= 0) { evaluate(); return; }
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      c.textContent = I18n.t('mnt_until') + ' ' + (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      setTimeout(upd, 1000);
    })();
  }

  function hide() { if (el) el.style.display = 'none'; }

  function start() {
    let db; try { db = firebase.firestore(); } catch (e) { return; }
    db.collection('config').doc('app').onSnapshot(
      (snap) => { last = snap.exists ? snap.data() : null; evaluate(); },
      () => {}
    );
  }

  function init() {
    start();
    // re-check when auth resolves (admins bypass the pause)
    try { firebase.auth().onAuthStateChanged(() => { setTimeout(evaluate, 800); }); } catch (e) {}
    if (window.I18n && I18n.onChange) I18n.onChange(evaluate);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
