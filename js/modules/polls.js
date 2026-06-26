/* ===========================================================
   التصويت (Polls) — a Sections sub-section, members only.
   Any member creates a poll (question + 2–5 options). Members
   vote for one option (can change). Results show as live bars.
   Votes are keyed by Firebase UID (no phone stored). Real-time
   (Firestore collection `polls`). Creator/admin can close/delete.
   =========================================================== */
(function () {
  if (!window.Sections) return;
  let unsub = null;

  Sections.add({
    id: 'polls',
    memberOnly: true,
    title: { ar: 'التصويت', en: 'Polls' },
    subtitle: { ar: 'استطلاعات وتصويت الأعضاء', en: 'Group votes & polls' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 20V10M12 20V4M17 20v-6"/></svg>',
    strings: {
      ar: {
        pl_title: 'التصويت', pl_sub: 'استطلاعات سريعة بين الأعضاء', pl_locked: 'هذا القسم للأعضاء فقط',
        pl_new: 'استطلاع جديد', pl_q: 'السؤال (مثال: وين نتعشّى؟)', pl_opt: 'خيار',
        pl_addopt: '+ إضافة خيار', pl_create: 'نشر الاستطلاع', pl_votes: 'صوت', pl_novotes: 'لا أصوات بعد',
        pl_empty: 'لا توجد استطلاعات — أنشئ واحدًا', pl_close: 'إغلاق', pl_closed: 'مغلق', pl_open: 'إعادة فتح',
        pl_del: 'حذف هذا الاستطلاع؟', pl_by: 'أنشأه', pl_need: 'اكتب السؤال وخيارين على الأقل'
      },
      en: {
        pl_title: 'Polls', pl_sub: 'Quick group votes', pl_locked: 'Members only',
        pl_new: 'New poll', pl_q: 'Question (e.g. Where to eat?)', pl_opt: 'Option',
        pl_addopt: '+ Add option', pl_create: 'Post poll', pl_votes: 'votes', pl_novotes: 'No votes yet',
        pl_empty: 'No polls yet — create one', pl_close: 'Close', pl_closed: 'Closed', pl_open: 'Reopen',
        pl_del: 'Delete this poll?', pl_by: 'by', pl_need: 'Add a question and at least two options'
      }
    },

    render(view) {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      view.appendChild(UI.pageTitle(I18n.t('pl_title'), I18n.t('pl_sub')));
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('pl_locked')));
        return;
      }
      const db = Auth.getDb();
      const me = (Auth.phone && Auth.phone()) || '';
      const myName = ((Auth.member && Auth.member()) || {}).name || '';
      const admin = !!(Auth.isAdmin && Auth.isAdmin());
      const uid = (function () { try { return firebase.auth().currentUser.uid; } catch (e) { return ''; } })();

      /* ---- create form (question + dynamic options) ---- */
      const q = UI.el('input', { class: 'fld', type: 'text', placeholder: I18n.t('pl_q'), maxlength: '100' });
      const opts = UI.el('div', { class: 'pl-opts' });
      function addOptInput(val) {
        if (opts.children.length >= 5) return;
        const i = UI.el('input', { class: 'fld pl-optin', type: 'text', maxlength: '50',
          placeholder: I18n.t('pl_opt') + ' ' + (opts.children.length + 1), value: val || '' });
        opts.appendChild(i);
      }
      addOptInput(); addOptInput();
      const addOptBtn = UI.el('button', { class: 'btn btn-ghost pl-addopt', onclick: () => addOptInput() }, I18n.t('pl_addopt'));
      const createBtn = UI.el('button', { class: 'btn btn-block', onclick: create }, I18n.t('pl_create'));
      view.appendChild(UI.el('div', { class: 'card pl-form' }, [
        UI.el('div', { class: 'sp-title2' }, I18n.t('pl_new')), q, opts, addOptBtn, createBtn
      ]));

      const listWrap = UI.el('div', { class: 'pl-list' });
      view.appendChild(listWrap);
      listWrap.innerHTML = '<div class="muted" style="text-align:center;padding:12px">…</div>';

      async function create() {
        const question = (q.value || '').trim();
        const options = [...opts.querySelectorAll('.pl-optin')].map((i) => (i.value || '').trim()).filter(Boolean);
        if (!question || options.length < 2) { alert(I18n.t('pl_need')); return; }
        createBtn.disabled = true;
        try {
          await db.collection('polls').add({
            q: question, options: options.slice(0, 5), votes: {}, closed: false,
            by: me, byName: myName, phone: me,
            at: firebase.firestore.FieldValue.serverTimestamp()
          });
          q.value = ''; opts.innerHTML = ''; addOptInput(); addOptInput();
        } catch (e) { alert(e.message || 'Error'); }
        createBtn.disabled = false;
      }

      async function vote(id, idx, closed) {
        if (closed || !uid) return;
        try { await db.collection('polls').doc(id).set({ votes: { [uid]: idx } }, { merge: true }); }
        catch (e) { alert(e.message || 'Error'); }
      }
      async function del(id) {
        try { await db.collection('polls').doc(id).delete(); } catch (e) { alert(e.message || 'Error'); }
      }
      async function toggleClose(id, closed) {
        try { await db.collection('polls').doc(id).update({ closed: !closed }); } catch (e) { alert(e.message || 'Error'); }
      }

      function card(id, d) {
        const votes = d.votes || {};
        const counts = (d.options || []).map(() => 0);
        let total = 0; let myChoice = -1;
        Object.keys(votes).forEach((k) => {
          const v = votes[k];
          if (typeof v === 'number' && v >= 0 && v < counts.length) { counts[v]++; total++; if (k === uid) myChoice = v; }
        });
        const canManage = admin || d.phone === me;

        const head = UI.el('div', { class: 'sp-head' }, [
          UI.el('div', { class: 'pl-q' }, (d.closed ? '🔒 ' : '') + (d.q || '—')),
          canManage ? UI.el('button', { class: 'sp-x', title: I18n.t('pl_del'),
            onclick: () => UI.confirm(I18n.t('pl_del'), () => del(id)) }, '×') : null
        ]);

        const optEls = (d.options || []).map((opt, i) => {
          const c = counts[i]; const pct = total ? Math.round((c / total) * 100) : 0;
          const chosen = myChoice === i;
          const bar = UI.el('div', { class: 'pl-bar' }, [UI.el('div', { class: 'pl-fill', style: 'width:' + pct + '%' })]);
          return UI.el('button', { class: 'pl-choice' + (chosen ? ' chosen' : '') + (d.closed ? ' locked' : ''),
            onclick: () => vote(id, i, d.closed) }, [
            bar,
            UI.el('span', { class: 'pl-otext' }, (chosen ? '✓ ' : '') + opt),
            UI.el('span', { class: 'pl-opct' }, pct + '%')
          ]);
        });

        const foot = UI.el('div', { class: 'pl-foot' }, [
          UI.el('span', { class: 'pl-count' }, total ? (total + ' ' + I18n.t('pl_votes')) : I18n.t('pl_novotes')),
          UI.el('span', { class: 'pl-by' }, I18n.t('pl_by') + ' ' + (d.byName || '—')),
          canManage ? UI.el('button', { class: 'pl-closebtn', onclick: () => toggleClose(id, d.closed) },
            I18n.t(d.closed ? 'pl_open' : 'pl_close')) : null
        ]);
        return UI.el('div', { class: 'card pl-card' }, [head, UI.el('div', { class: 'pl-choices' }, optEls), foot]);
      }

      try {
        unsub = db.collection('polls').orderBy('at', 'desc').limit(50).onSnapshot((snap) => {
          const docs = []; snap.forEach((x) => docs.push({ id: x.id, d: x.data() }));
          listWrap.innerHTML = '';
          if (!docs.length) { listWrap.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:12px' }, I18n.t('pl_empty'))); return; }
          docs.forEach((x) => listWrap.appendChild(card(x.id, x.d)));
        }, () => { listWrap.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
      } catch (e) {}
    }
  });
})();
