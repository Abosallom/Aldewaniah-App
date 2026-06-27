/* ===========================================================
   Feature module: Home
   - Signed out  → welcome + a prominent "Sign in" button.
   - Signed in   → a Check-in page (tap to mark attendance; shows
     who has checked in today). Designed to be extended later.
   =========================================================== */
(function () {
  const COLLECTION = 'checkins';
  // The "diwaniya day" runs 6:00 AM → 5:59 AM next day: check-ins reset at 6 AM.
  // (Shift the clock back 6 hours, then take the calendar date.)
  const todayKey = () => { const d = new Date(Date.now() - 6 * 3600 * 1000); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  // distance in metres between two lat/lng points (haversine)
  function distM(la1, lo1, la2, lo2) {
    const R = 6371000, r = (x) => x * Math.PI / 180;
    const dLa = r(la2 - la1), dLo = r(lo2 - lo1);
    const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function getPos() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }

  App.registerModule({
    id: 'home',
    title: { ar: 'الرئيسية', en: 'Home' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    strings: {
      ar: {
        home_welcome: 'حياك الله في الديوانية',
        home_signin_q: 'سجّل دخولك كعضو للمتابعة',
        home_signin: 'دخول الأعضاء',
        home_hi: 'أهلاً',
        home_checkin_title: 'تسجيل الحضور',
        home_checkin_sub: 'سجّل حضورك في الديوانية اليوم',
        home_checkin_btn: 'سجّل حضوري',
        home_checked: 'حاضر ✓',
        home_undo: 'إلغاء الحضور',
        home_today: 'الحاضرون اليوم',
        home_nobody: 'لا أحد سجّل حضوره بعد — كن أول الحاضرين',
        home_err: 'تعذّر الحفظ، حاول مرة أخرى',
        home_loc_req: 'يلزم وجودك في الموقع لتسجيل الحضور',
        home_loc_check: 'جارٍ تحديد موقعك…',
        home_loc_denied: 'تعذّر تحديد موقعك — فعّل خدمة الموقع وحاول مجددًا',
        home_loc_far: 'أنت خارج نطاق الديوانية، اقترب من الموقع لتسجيل الحضور'
      },
      en: {
        home_welcome: 'Welcome to Al Dewaniah',
        home_signin_q: 'Sign in as a member to continue',
        home_signin: 'Member sign in',
        home_hi: 'Hi',
        home_checkin_title: 'Check in',
        home_checkin_sub: 'Mark your attendance at the Dewaniah today',
        home_checkin_btn: 'Check me in',
        home_checked: 'Checked in ✓',
        home_undo: 'Undo check-in',
        home_today: 'Here today',
        home_nobody: 'No one has checked in yet — be the first',
        home_err: 'Could not save, please try again',
        home_loc_req: 'You must be at the location to check in',
        home_loc_check: 'Getting your location…',
        home_loc_denied: 'Could not get your location — enable location and try again',
        home_loc_far: "You're outside the Dewaniah area — get closer to check in"
      }
    },

    render(view) {
      const isMember = window.Auth && Auth.isMember && Auth.isMember();
      const hero = [UI.el('img', { class: 'hero-logo-full', src: 'assets/ALDEWANYAar.png', alt: I18n.t('appName') })];
      if (isMember) {
        hero.push(UI.el('h1', { class: 'hero-title' }, I18n.t('home_hi') + ' ' + I18n.pick((Auth.member() || {}).name || '')));
        hero.push(UI.el('p', { class: 'hero-tagline' }, I18n.t('home_checkin_sub')));
      }
      view.appendChild(UI.el('section', { class: 'hero' }, hero));

      if (!isMember) {
        view.appendChild(UI.el('div', { class: 'card', style: 'text-align:center' }, [
          UI.el('p', { class: 'muted', style: 'margin:0 0 12px' }, I18n.t('home_signin_q')),
          UI.el('button', { class: 'btn btn-green btn-block', onclick: () => { if (window.Auth && Auth.openLogin) Auth.openLogin(); } }, I18n.t('home_signin'))
        ]));
        return;
      }

      checkinPage(view);
    }
  });

  function checkinPage(view) {
    const db = Auth.getDb && Auth.getDb();
    const phone = (Auth.phone && Auth.phone()) || '';
    const name = ((Auth.member && Auth.member()) || {}).name || '';
    const day = todayKey();
    const docId = phone.replace(/[^0-9]/g, '') + '_' + day;

    const btnWrap = UI.el('div', { class: 'card', style: 'text-align:center' });
    view.appendChild(btnWrap);

    const listCard = UI.el('div', { class: 'checkin-list' });
    view.appendChild(listCard);

    let mineIn = false, geo = null, busy = false;

    function paintBtn() {
      btnWrap.innerHTML = '';
      btnWrap.appendChild(UI.el('h2', { class: 'section-head', style: 'margin-top:0' }, I18n.t('home_checkin_title')));
      if (geo && geo.enabled) {
        btnWrap.appendChild(UI.el('div', { class: 'muted', style: 'font-size:.85rem;margin:2px 0 12px' },
          '📍 ' + I18n.t('home_loc_req') + (geo.label ? ' — ' + geo.label : '') + ' · ' + (geo.radius || 100) + ' m'));
      }
      if (mineIn) {
        btnWrap.appendChild(UI.el('div', { class: 'checkin-done' }, I18n.t('home_checked')));
        btnWrap.appendChild(UI.el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:10px', onclick: undo }, I18n.t('home_undo')));
      } else if (busy) {
        btnWrap.appendChild(UI.el('button', { class: 'btn btn-green btn-block', disabled: 'disabled' }, '📍  ' + I18n.t('home_loc_check')));
      } else {
        btnWrap.appendChild(UI.el('button', { class: 'btn btn-green btn-block', onclick: checkin }, '✋  ' + I18n.t('home_checkin_btn')));
      }
    }

    async function checkin() {
      if (!db || busy) return;
      try {
        // Geofence: if the admin requires it, you must be within the radius.
        if (geo && geo.enabled && geo.lat != null && geo.lng != null) {
          busy = true; paintBtn();
          let pos;
          try { pos = await getPos(); }
          catch (e) { busy = false; paintBtn(); alert(I18n.t('home_loc_denied')); return; }
          const dist = distM(pos.coords.latitude, pos.coords.longitude, geo.lat, geo.lng);
          if (dist > (geo.radius || 100)) { busy = false; paintBtn(); alert(I18n.t('home_loc_far') + ' (~' + Math.round(dist) + ' m)'); return; }
        }
        await db.collection(COLLECTION).doc(docId).set({
          phone: phone, name: name, day: day,
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
        busy = false;
      } catch (e) { busy = false; paintBtn(); alert(I18n.t('home_err')); }
    }
    async function undo() {
      if (!db) return;
      // Keep a record (mark removed) instead of deleting, so the admin can see
      // who checked in and then cancelled. Re-checking in clears this.
      try { await db.collection(COLLECTION).doc(docId).set({ phone: phone, name: name, day: day, removed: true, removedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) {}
    }

    function paintList(rows) {
      listCard.innerHTML = '';
      listCard.appendChild(UI.el('div', { class: 'checkin-h' }, I18n.t('home_today') + ' · ' + rows.length));
      if (!rows.length) { listCard.appendChild(UI.el('div', { class: 'bz-empty' }, I18n.t('home_nobody'))); return; }
      rows.forEach((r) => listCard.appendChild(UI.el('div', { class: 'checkin-row' }, [
        UI.el('span', { class: 'avatar', style: 'width:34px;height:34px;font-size:.8rem' }, UI.initials(r.name)),
        UI.el('span', { class: 'checkin-name' }, r.name || '—'),
        UI.el('span', { class: 'checkin-time' }, r.at && r.at.toDate ? r.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '')
      ])));
    }

    paintBtn();
    paintList([]);

    // load the geofence config (admin-set centre + radius)
    if (db) { db.collection('config').doc('checkin').get().then((d) => { geo = d.exists ? d.data() : null; paintBtn(); }).catch(() => {}); }

    if (db) {
      // live list of today's check-ins
      db.collection(COLLECTION).where('day', '==', day).onSnapshot((snap) => {
        const rows = [];
        mineIn = false;
        snap.forEach((d) => { const v = d.data(); if (d.id === docId) mineIn = !v.removed; if (!v.removed) rows.push(v); });
        rows.sort((a, b) => ((a.at && a.at.seconds) || 0) - ((b.at && b.at.seconds) || 0));
        paintBtn();
        paintList(rows);
      }, () => {});
    }
  }
})();
