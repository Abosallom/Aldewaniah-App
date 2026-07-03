/* ===========================================================
   التقويم (Shared calendar) — a Sections sub-section, members only.
   A shared agenda: any member adds an event (title, date, optional
   time, note). Everyone sees upcoming events, soonest first.
   Real-time (Firestore collection `events`). Creator/admin delete.
   =========================================================== */
(function () {
  if (!window.Sections) return;
  let unsub = null;

  const todayStr = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  function prettyDate(s) {
    try {
      const d = new Date(s + 'T00:00:00');
      return new Intl.DateTimeFormat(I18n.lang === 'ar' ? 'ar' : 'en-GB',
        { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    } catch (e) { return s; }
  }

  Sections.add({
    id: 'calendar',
    memberOnly: true,
    title: { ar: 'التقويم', en: 'Calendar' },
    subtitle: { ar: 'مناسبات ومواعيد الأعضاء', en: 'Shared events & dates' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
    strings: {
      ar: {
        cal_title: 'التقويم', cal_sub: 'مناسبات ومواعيد الديوانية', cal_locked: 'هذا القسم للأعضاء فقط',
        cal_new: 'إضافة مناسبة', cal_name: 'العنوان (مثال: عشاء الديوانية)', cal_note: 'تفاصيل (اختياري)',
        cal_add: 'إضافة', cal_empty: 'لا توجد مناسبات قادمة', cal_today: 'اليوم', cal_del: 'حذف هذه المناسبة؟',
        cal_by: 'أضافها'
      },
      en: {
        cal_title: 'Calendar', cal_sub: 'Shared events & dates', cal_locked: 'Members only',
        cal_new: 'Add event', cal_name: 'Title (e.g. Dewaniah dinner)', cal_note: 'Details (optional)',
        cal_add: 'Add', cal_empty: 'No upcoming events', cal_today: 'Today', cal_del: 'Delete this event?',
        cal_by: 'by'
      }
    },

    render(view) {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      view.appendChild(UI.pageTitle(I18n.t('cal_title'), I18n.t('cal_sub')));
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('cal_locked')));
        return;
      }
      const db = Auth.getDb();
      const me = (Auth.phone && Auth.phone()) || '';           // legacy docs only
      const uid = (Auth.uid && Auth.uid()) || '';
      const myName = ((Auth.member && Auth.member()) || {}).name || '';
      const admin = !!(Auth.isAdmin && Auth.isAdmin());

      const title = UI.el('input', { class: 'fld', type: 'text', placeholder: I18n.t('cal_name'), maxlength: '70' });
      const date = UI.el('input', { class: 'fld', type: 'date', value: todayStr() });
      const time = UI.el('input', { class: 'fld', type: 'time' });
      const note = UI.el('input', { class: 'fld', type: 'text', placeholder: I18n.t('cal_note'), maxlength: '120' });
      const addBtn = UI.el('button', { class: 'btn btn-block', onclick: add }, I18n.t('cal_add'));
      view.appendChild(UI.el('div', { class: 'card cal-form' }, [
        UI.el('div', { class: 'sp-title2' }, I18n.t('cal_new')),
        title, UI.el('div', { class: 'cal-row2' }, [date, time]), note, addBtn
      ]));

      const listWrap = UI.el('div', { class: 'cal-list' });
      view.appendChild(listWrap);
      listWrap.innerHTML = '<div class="muted" style="text-align:center;padding:12px">…</div>';

      async function add() {
        const t = (title.value || '').trim();
        const d = date.value;
        if (!t || !d) { title.focus(); return; }
        addBtn.disabled = true;
        try {
          await db.collection('events').add({
            title: t, date: d, time: time.value || '', note: (note.value || '').trim(),
            byUid: uid, byName: myName,
            at: firebase.firestore.FieldValue.serverTimestamp()
          });
          title.value = ''; note.value = ''; time.value = '';
        } catch (e) { alert(e.message || 'Error'); }
        addBtn.disabled = false;
      }

      async function del(id) {
        try { await db.collection('events').doc(id).delete(); } catch (e) { alert(e.message || 'Error'); }
      }

      function row(id, d) {
        const canDel = admin || (d.byUid ? d.byUid === uid : d.phone === me);
        const isToday = d.date === todayStr();
        const day = UI.el('div', { class: 'cal-date' + (isToday ? ' today' : '') }, [
          UI.el('div', { class: 'cal-dnum' }, (d.date || '').slice(8, 10) || '—'),
          UI.el('div', { class: 'cal-dmon' }, isToday ? I18n.t('cal_today') : prettyDate(d.date).split(' ').slice(-1)[0])
        ]);
        const body = UI.el('div', { class: 'cal-body' }, [
          UI.el('div', { class: 'cal-name' }, d.title || '—'),
          UI.el('div', { class: 'cal-meta' }, prettyDate(d.date) + (d.time ? ' • ' + d.time : '')),
          d.note ? UI.el('div', { class: 'cal-note' }, d.note) : null,
          UI.el('div', { class: 'cal-by' }, I18n.t('cal_by') + ' ' + (d.byName || '—'))
        ]);
        const x = canDel ? UI.el('button', { class: 'sp-x', title: I18n.t('cal_del'),
          onclick: () => UI.confirm(I18n.t('cal_del'), () => del(id)) }, '×') : null;
        return UI.el('div', { class: 'card cal-item' }, [day, body, x]);
      }

      try {
        unsub = db.collection('events').orderBy('date').limit(200).onSnapshot((snap) => {
          const today = todayStr();
          const docs = [];
          snap.forEach((x) => { const d = x.data(); if ((d.date || '') >= today) docs.push({ id: x.id, d: d }); });
          listWrap.innerHTML = '';
          if (!docs.length) { listWrap.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:12px' }, I18n.t('cal_empty'))); return; }
          docs.forEach((x) => listWrap.appendChild(row(x.id, x.d)));
        }, () => { listWrap.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
      } catch (e) {}
    }
  });
})();
