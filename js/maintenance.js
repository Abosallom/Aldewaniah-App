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
    ar: {
      mnt_default: 'التطبيق متوقف مؤقتًا للصيانة. نعود قريبًا بإذن الله 🌿', mnt_until: 'يعود العمل بعد',
      mnt_prayers: 'مواقيت الصلاة اليوم', mnt_qibla_btn: 'بوصلة القبلة',
      mnt_qibla: 'القبلة', mnt_enable: 'تفعيل البوصلة', mnt_from_north: 'من الشمال',
      mnt_aligned: 'أنت متجه نحو القبلة', mnt_hint: 'لُف بجهازك حتى يشير سهم الكعبة للأعلى',
      mnt_hint_north: 'وجّه أعلى الجهاز نحو الشمال ثم اتبع السهم'
    },
    en: {
      mnt_default: "The app is paused for maintenance. We'll be back soon 🌿", mnt_until: 'Back in',
      mnt_prayers: "Today's prayer times", mnt_qibla_btn: 'Qibla compass',
      mnt_qibla: 'Qibla', mnt_enable: 'Enable compass', mnt_from_north: 'from North',
      mnt_aligned: 'You are facing the Qibla', mnt_hint: 'Turn until the Kaaba arrow points straight up',
      mnt_hint_north: 'Point the top of the device North, then follow the arrow'
    }
  });

  let el = null, last = null, until = 0, lift = null, pend = null;
  let shownSig = null, tick = null, orientH = null, heading = null, wasAligned = false;

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
    // Don't rebuild (and reset the compass / re-fetch) if nothing changed.
    const sig = JSON.stringify({ m: (last && last.message) || '', u: until, l: I18n.lang });
    if (el.style.display !== 'none' && shownSig === sig) return;
    shownSig = sig;
    stopTick();

    const inner = UI.el('div', { class: 'mnt-inner' });
    inner.appendChild(UI.el('img', { class: 'mnt-logo', src: 'assets/icon-192.png', alt: '' }));
    inner.appendChild(UI.el('div', { class: 'mnt-msg' }, (last && last.message) || I18n.t('mnt_default')));
    if (until && until > Date.now()) { const c = UI.el('div', { class: 'mnt-count' }); inner.appendChild(c); countdown(c); }

    buildPrayers(inner);
    buildQibla(inner);

    el.innerHTML = '';
    el.appendChild(inner);
    el.style.display = 'flex';
  }

  // ---- Today's prayer times (reuses the Times section core) ----
  function buildPrayers(inner) {
    const PC = window.PrayerCore; if (!PC) return;
    const city = PC.getCity();
    const card = UI.el('div', { class: 'tm-pray mnt-card' });
    const wrap = UI.el('div', { class: 'mnt-extras' }, [
      UI.el('div', { class: 'mnt-sect' }, I18n.t('mnt_prayers') + ' · ' + I18n.pick(city)),
      card
    ]);
    inner.appendChild(wrap);

    const paint = (timings, tz) => {
      if (!timings) return;
      const nk = PC.nextKey(timings, tz);
      card.innerHTML = '';
      PC.PRAYERS.forEach((p) => {
        const row = UI.el('div', { class: 'tm-prow' + (p.k === nk ? ' next' : '') }, [
          UI.el('span', { class: 'tm-pname' }, I18n.pick(p)),
          UI.el('span', { class: 'tm-ptime' }, PC.to12(timings[p.k], I18n.lang === 'ar' ? 'ar' : 'en'))
        ]);
        card.appendChild(row);
      });
      // refresh the "next" highlight each minute while shown
      stopTick();
      tick = setInterval(() => {
        if (!el || el.style.display === 'none') { stopTick(); return; }
        const k = PC.nextKey(timings, tz);
        card.querySelectorAll('.tm-prow').forEach((r, i) => r.classList.toggle('next', PC.PRAYERS[i].k === k));
      }, 30000);
    };
    PC.loadTimings(city, (timings, tz) => paint(timings, tz));
  }

  // ---- Qibla compass (optional — revealed on tap) ----
  function buildQibla(inner) {
    const PC = window.PrayerCore; if (!PC) return;
    const city = PC.getCity();

    const rose = UI.el('div', { class: 'qibla-rose' }, [
      UI.el('span', { class: 'qibla-tick n' }, I18n.lang === 'ar' ? 'ش' : 'N'),
      UI.el('span', { class: 'qibla-tick e' }, I18n.lang === 'ar' ? 'ق' : 'E'),
      UI.el('span', { class: 'qibla-tick s' }, I18n.lang === 'ar' ? 'ج' : 'S'),
      UI.el('span', { class: 'qibla-tick w' }, I18n.lang === 'ar' ? 'غ' : 'W')
    ]);
    const needle = UI.el('div', { class: 'qibla-needle', html:
      '<svg viewBox="0 0 60 210" width="60" height="210"><polygon points="30,4 46,54 30,42 14,54" fill="#722F37"/><line x1="30" y1="42" x2="30" y2="150" stroke="#1A2744" stroke-width="3"/><g transform="translate(30,156)"><rect x="-15" y="-15" width="30" height="30" rx="3" fill="#1A2744"/><rect x="-15" y="-3" width="30" height="7" fill="#C2A050"/><rect x="-5" y="-15" width="10" height="11" fill="#C2A050"/></g></svg>' });
    const ahead = UI.el('div', { class: 'qibla-ahead' });
    const hub = UI.el('div', { class: 'qibla-hub' });
    const dial = UI.el('div', { class: 'qibla-dial' }, [rose, needle, ahead, hub]);
    const readout = UI.el('div', { class: 'qibla-readout' });
    const aligned = UI.el('div', { class: 'qibla-aligned' });
    const hint = UI.el('div', { class: 'tm-note', style: 'color:#5b6472' });
    const enableBtn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:8px', onclick: enableCompass }, '🧭 ' + I18n.t('mnt_enable'));
    const card = UI.el('div', { class: 'qibla-card mnt-card', style: 'display:none' }, [
      UI.el('h3', { class: 'card-title', style: 'text-align:center;margin:0 0 4px' }, I18n.t('mnt_qibla')),
      dial, readout, aligned, hint, enableBtn
    ]);

    const toggle = UI.el('button', { class: 'btn btn-block mnt-qbtn' }, '🧭 ' + I18n.t('mnt_qibla_btn'));
    toggle.onclick = () => {
      const open = card.style.display === 'none';
      card.style.display = open ? 'block' : 'none';
      if (open) { paintQibla(); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
    inner.appendChild(UI.el('div', { class: 'mnt-extras' }, [toggle, card]));

    function paintQibla() {
      const q = PC.qibla(city.lat, city.lon);
      const rel = heading == null ? q : (q - heading);
      needle.style.transform = 'translate(-50%,-50%) rotate(' + rel + 'deg)';
      rose.style.transform = 'rotate(' + (heading == null ? 0 : -heading) + 'deg)';
      let txt = I18n.t('mnt_qibla') + ' ' + Math.round(q) + '° ' + I18n.t('mnt_from_north');
      readout.textContent = txt;
      const isAligned = heading != null && Math.abs(PC.norm180(rel)) <= 7;
      dial.classList.toggle('aligned', isAligned);
      aligned.textContent = isAligned ? ('🕋 ' + I18n.t('mnt_aligned') + ' ✓') : '';
      hint.textContent = heading == null ? I18n.t('mnt_hint_north') : (isAligned ? '' : I18n.t('mnt_hint'));
      if (isAligned && !wasAligned) { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {} }
      wasAligned = isAligned;
    }
    function onOrient(e) {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
      if (h != null) { heading = h; paintQibla(); }
    }
    function startListening() {
      stopOrient(); orientH = onOrient;
      window.addEventListener('deviceorientationabsolute', orientH, true);
      window.addEventListener('deviceorientation', orientH, true);
      enableBtn.style.display = 'none';
    }
    function enableCompass() {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        DOE.requestPermission().then((s) => { if (s === 'granted') startListening(); }).catch(() => {});
      } else { startListening(); }
    }
  }

  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
  function stopOrient() {
    if (orientH) { try { window.removeEventListener('deviceorientationabsolute', orientH, true); window.removeEventListener('deviceorientation', orientH, true); } catch (e) {} orientH = null; }
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

  function hide() { if (el) el.style.display = 'none'; shownSig = null; heading = null; wasAligned = false; stopTick(); stopOrient(); }

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
