/* ===========================================================
   Feature module: Home
   - Signed out  → welcome + a prominent "Sign in" button.
   - Signed in   → a Check-in page (tap to mark attendance; shows
     who has checked in today). Designed to be extended later.
   =========================================================== */
(function () {
  const COLLECTION = 'checkins';
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

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
        home_err: 'تعذّر الحفظ، حاول مرة أخرى'
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
        home_err: 'Could not save, please try again'
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

    let mineIn = false;

    function paintBtn() {
      btnWrap.innerHTML = '';
      btnWrap.appendChild(UI.el('h2', { class: 'section-head', style: 'margin-top:0' }, I18n.t('home_checkin_title')));
      if (mineIn) {
        btnWrap.appendChild(UI.el('div', { class: 'checkin-done' }, I18n.t('home_checked')));
        btnWrap.appendChild(UI.el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:10px', onclick: undo }, I18n.t('home_undo')));
      } else {
        btnWrap.appendChild(UI.el('button', { class: 'btn btn-green btn-block', onclick: checkin }, '✋  ' + I18n.t('home_checkin_btn')));
      }
    }

    async function checkin() {
      if (!db) return;
      try {
        await db.collection(COLLECTION).doc(docId).set({
          phone: phone, name: name, day: day,
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) { alert(I18n.t('home_err')); }
    }
    async function undo() {
      if (!db) return;
      try { await db.collection(COLLECTION).doc(docId).delete(); } catch (e) {}
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

    if (db) {
      // live list of today's check-ins
      db.collection(COLLECTION).where('day', '==', day).onSnapshot((snap) => {
        const rows = [];
        mineIn = false;
        snap.forEach((d) => { const v = d.data(); rows.push(v); if (d.id === docId) mineIn = true; });
        rows.sort((a, b) => ((a.at && a.at.seconds) || 0) - ((b.at && b.at.seconds) || 0));
        paintBtn();
        paintList(rows);
      }, () => {});
    }
  }
})();
