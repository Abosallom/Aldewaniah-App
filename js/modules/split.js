/* ===========================================================
   قطّة (Expense splitter) — a Sections sub-section, members only.
   Anyone creates a "قطّة": a shared cost split over N people.
   Members tap "دفعت نصيبي" to mark their share paid; the card
   shows the per-person share and how many have paid. Real-time
   (Firestore collection `splits`). Creator or admin can delete.
   =========================================================== */
(function () {
  if (!window.Sections) return;
  let unsub = null;

  function money(n) {
    n = Math.round((Number(n) || 0) * 100) / 100;
    return (Number.isInteger(n) ? n : n.toFixed(2)) + ' ' + (I18n.lang === 'ar' ? 'ريال' : 'SAR');
  }

  Sections.add({
    id: 'split',
    memberOnly: true,
    title: { ar: 'قطّة', en: 'Split (Kitty)' },
    subtitle: { ar: 'تقسيم مصروف على الأعضاء', en: 'Split a shared cost' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    strings: {
      ar: {
        sp_title: 'قطّة', sp_sub: 'تقسيم مصروف مشترك على الأعضاء', sp_locked: 'هذا القسم للأعضاء فقط',
        sp_new: 'قطّة جديدة', sp_name: 'الوصف (مثال: عشاء الخميس)', sp_total: 'المبلغ الكلي',
        sp_people: 'عدد المشاركين', sp_create: 'إنشاء', sp_share: 'نصيب الفرد', sp_paid: 'دفعوا',
        sp_of: 'من', sp_remaining: 'المتبقّي', sp_ipaid: 'دفعت نصيبي', sp_unpaid: 'تراجع عن الدفع',
        sp_empty: 'لا توجد قطّات حاليًا — أنشئ واحدة', sp_del: 'حذف هذه القطّة؟', sp_by: 'أنشأها'
      },
      en: {
        sp_title: 'Split (Kitty)', sp_sub: 'Split a shared cost among members', sp_locked: 'Members only',
        sp_new: 'New split', sp_name: 'Description (e.g. Thursday dinner)', sp_total: 'Total amount',
        sp_people: 'Number of people', sp_create: 'Create', sp_share: 'Per person', sp_paid: 'paid',
        sp_of: 'of', sp_remaining: 'Remaining', sp_ipaid: 'I paid my share', sp_unpaid: 'Undo payment',
        sp_empty: 'No splits yet — create one', sp_del: 'Delete this split?', sp_by: 'by'
      }
    },

    render(view) {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      view.appendChild(UI.pageTitle(I18n.t('sp_title'), I18n.t('sp_sub')));
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('sp_locked')));
        return;
      }
      const db = Auth.getDb();
      const me = (Auth.phone && Auth.phone()) || '';
      const myName = ((Auth.member && Auth.member()) || {}).name || '';
      const admin = !!(Auth.isAdmin && Auth.isAdmin());

      /* ---- create form ---- */
      const name = UI.el('input', { class: 'fld', type: 'text', placeholder: I18n.t('sp_name'), maxlength: '60' });
      const total = UI.el('input', { class: 'fld', type: 'number', inputmode: 'decimal', min: '0', placeholder: I18n.t('sp_total') });
      const people = UI.el('input', { class: 'fld', type: 'number', inputmode: 'numeric', min: '1', value: '', placeholder: I18n.t('sp_people') });
      const createBtn = UI.el('button', { class: 'btn btn-block', onclick: create }, I18n.t('sp_create'));
      view.appendChild(UI.el('div', { class: 'card sp-form' }, [
        UI.el('div', { class: 'sp-title2' }, I18n.t('sp_new')),
        name, total, people, createBtn
      ]));

      const listWrap = UI.el('div', { class: 'sp-list' });
      view.appendChild(listWrap);
      listWrap.innerHTML = '<div class="muted" style="text-align:center;padding:12px">…</div>';

      async function create() {
        const t = (name.value || '').trim();
        const amt = Number(total.value) || 0;
        const n = Math.max(1, Math.floor(Number(people.value) || 0));
        if (!t || amt <= 0 || n < 1) { name.focus(); return; }
        createBtn.disabled = true;
        try {
          await db.collection('splits').add({
            title: t, total: amt, count: n, paid: [],
            by: me, byName: myName, phone: me,
            at: firebase.firestore.FieldValue.serverTimestamp()
          });
          name.value = ''; total.value = ''; people.value = '';
        } catch (e) { alert(e.message || 'Error'); }
        createBtn.disabled = false;
      }

      function hasPaid(d) { return (d.paid || []).some((p) => p && p.phone === me); }

      async function togglePaid(id) {
        const ref = db.collection('splits').doc(id);
        try {
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const d = snap.data();
            const wasPaid = (d.paid || []).some((p) => p && p.phone === me);
            const paid = (d.paid || []).filter((p) => p && p.phone !== me); // drop my old entry
            if (!wasPaid) paid.push({ name: myName, phone: me });           // toggle on
            tx.update(ref, { paid: paid });
          });
        } catch (e) { alert(e.message || 'Error'); }
      }

      async function del(id) {
        try { await db.collection('splits').doc(id).delete(); } catch (e) { alert(e.message || 'Error'); }
      }

      function card(id, d) {
        const share = d.count > 0 ? d.total / d.count : 0;
        const paidCount = (d.paid || []).length;
        const remaining = Math.max(0, (d.count - paidCount)) * share;
        const mine = hasPaid(d);
        const canDel = admin || d.phone === me;

        const head = UI.el('div', { class: 'sp-head' }, [
          UI.el('div', { class: 'sp-name' }, d.title || '—'),
          canDel ? UI.el('button', { class: 'sp-x', title: I18n.t('sp_del'),
            onclick: () => UI.confirm(I18n.t('sp_del'), () => del(id)) }, '×') : null
        ]);
        const stats = UI.el('div', { class: 'sp-stats' }, [
          UI.el('div', { class: 'sp-stat' }, [UI.el('b', null, money(d.total)), UI.el('span', null, I18n.t('sp_total'))]),
          UI.el('div', { class: 'sp-stat' }, [UI.el('b', null, money(share)), UI.el('span', null, I18n.t('sp_share'))]),
          UI.el('div', { class: 'sp-stat' }, [UI.el('b', null, paidCount + ' ' + I18n.t('sp_of') + ' ' + d.count), UI.el('span', null, I18n.t('sp_paid'))]),
          UI.el('div', { class: 'sp-stat' }, [UI.el('b', null, money(remaining)), UI.el('span', null, I18n.t('sp_remaining'))])
        ]);
        const names = (d.paid || []).map((p) => p && p.name).filter(Boolean);
        const who = names.length ? UI.el('div', { class: 'sp-who' }, '✓ ' + names.join('، ')) : null;
        const payBtn = UI.el('button', { class: 'btn ' + (mine ? 'btn-ghost' : 'btn-green') + ' sp-pay',
          onclick: () => togglePaid(id) }, I18n.t(mine ? 'sp_unpaid' : 'sp_ipaid'));
        const by = UI.el('div', { class: 'sp-by' }, I18n.t('sp_by') + ' ' + (d.byName || '—'));
        return UI.el('div', { class: 'card sp-card' }, [head, stats, who, payBtn, by]);
      }

      try {
        unsub = db.collection('splits').orderBy('at', 'desc').limit(50).onSnapshot((snap) => {
          const docs = []; snap.forEach((x) => docs.push({ id: x.id, d: x.data() }));
          listWrap.innerHTML = '';
          if (!docs.length) { listWrap.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:12px' }, I18n.t('sp_empty'))); return; }
          docs.forEach((x) => listWrap.appendChild(card(x.id, x.d)));
        }, () => { listWrap.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
      } catch (e) {}
    }
  });
})();
