/* ===========================================================
   الاقتراحات والبلاغات — members send SUGGESTIONS or FAILURE/BUG
   REPORTS straight to the admin. A Sections sub-section.
   Writes to the existing `suggestions` collection (admin-only
   read) with a `type` field: 'suggestion' | 'bug'.
   The admin panel lists them with a 💡/🐞 chip.
   =========================================================== */
(function () {
  if (!window.Sections) return;

  Sections.add({
    id: 'feedback',
    memberOnly: true,
    title: { ar: 'اقتراح أو بلاغ', en: 'Feedback' },
    subtitle: { ar: 'اقترح فكرة أو بلّغ عن عطل', en: 'Suggest an idea or report a problem' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3a6 6 0 0 1 3.5 10.9c-.6.5-1 1.2-1 2V17h-5v-1.1c0-.8-.4-1.5-1-2A6 6 0 0 1 12 3z"/><path d="M10 20h4"/></svg>',
    strings: {
      ar: {
        fb_title: 'اقتراح أو بلاغ عطل', fb_sub: 'رسالتك تصل للمشرف مباشرة',
        fb_type_sugg: '💡 اقتراح', fb_type_bug: '🐞 بلاغ عطل',
        fb_ph_sugg: 'اكتب فكرتك أو التحسين الذي تتمناه…',
        fb_ph_bug: 'صف المشكلة: ماذا كنت تفعل؟ ماذا حدث؟ في أي صفحة؟',
        fb_send: 'إرسال للمشرف', fb_sent: 'وصلت رسالتك للمشرف، شكرًا لك ✅',
        fb_err: 'تعذّر الإرسال، حاول مرة أخرى', fb_locked: 'هذا القسم للأعضاء فقط',
        fb_empty: 'اكتب رسالتك أولاً'
      },
      en: {
        fb_title: 'Suggestion or bug report', fb_sub: 'Goes straight to the admin',
        fb_type_sugg: '💡 Suggestion', fb_type_bug: '🐞 Bug report',
        fb_ph_sugg: 'Write your idea or the improvement you wish for…',
        fb_ph_bug: 'Describe the problem: what were you doing? what happened? which page?',
        fb_send: 'Send to admin', fb_sent: 'Delivered to the admin, thank you ✅',
        fb_err: 'Could not send, try again', fb_locked: 'Members only',
        fb_empty: 'Write your message first'
      }
    },

    render(view) {
      view.appendChild(UI.pageTitle(I18n.t('fb_title'), I18n.t('fb_sub')));
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('fb_locked')));
        return;
      }
      const db = Auth.getDb();
      let type = 'suggestion';

      const ta = UI.el('textarea', { class: 'fld', rows: '5', maxlength: '600', placeholder: I18n.t('fb_ph_sugg') });
      const mk = (t, key) => {
        const b = UI.el('button', { class: 'chat-seg-btn' + (t === type ? ' active' : ''), onclick: () => {
          type = t;
          [sB, bB].forEach((x) => x.classList.remove('active'));
          (t === 'suggestion' ? sB : bB).classList.add('active');
          ta.placeholder = I18n.t(t === 'suggestion' ? 'fb_ph_sugg' : 'fb_ph_bug');
        } }, I18n.t(key));
        return b;
      };
      const sB = mk('suggestion', 'fb_type_sugg');
      const bB = mk('bug', 'fb_type_bug');

      const msg = UI.el('div', { class: 'muted', style: 'text-align:center;margin-top:8px;font-size:.9rem' });
      const send = UI.el('button', { class: 'btn btn-block btn-green', style: 'margin-top:10px', onclick: async () => {
        const text = (ta.value || '').trim();
        if (!text) { msg.textContent = I18n.t('fb_empty'); return; }
        send.disabled = true;
        try {
          await db.collection('suggestions').add({
            text: text, type: type,
            name: ((Auth.member && Auth.member()) || {}).name || '',
            phone: (Auth.phone && Auth.phone()) || '',
            page: (location.hash || '').slice(1),
            at: firebase.firestore.FieldValue.serverTimestamp()
          });
          ta.value = '';
          msg.textContent = I18n.t('fb_sent');
        } catch (e) { msg.textContent = I18n.t('fb_err'); }
        send.disabled = false;
      } }, I18n.t('fb_send'));

      view.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'chat-seg', style: 'margin-bottom:10px' }, [sB, bB]),
        ta, send, msg
      ]));
    }
  });
})();
