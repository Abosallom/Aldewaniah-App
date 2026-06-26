/* ===========================================================
   Chat (الدردشة) — real-time members' group chat (Firestore).
   Members only. A top-level bottom-nav tab.
   =========================================================== */
(function () {
  let unsub = null;

  App.registerModule({
    id: 'chat',
    memberOnly: true,
    title: { ar: 'الدردشة', en: 'Chat' },
    subtitle: { ar: 'دردشة الأعضاء', en: 'Members group chat' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v11H8l-4 3z"/></svg>',
    strings: {
      ar: { ch_title: 'الدردشة', ch_sub: 'دردشة بين الأعضاء', ch_ph: 'اكتب رسالة…', ch_send: 'إرسال',
        ch_empty: 'لا توجد رسائل بعد — ابدأ المحادثة', ch_locked: 'الدردشة للأعضاء فقط' },
      en: { ch_title: 'Chat', ch_sub: 'Members group chat', ch_ph: 'Type a message…', ch_send: 'Send',
        ch_empty: 'No messages yet — say hi', ch_locked: 'Chat is for members only' }
    },

    render(view) {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      view.appendChild(UI.pageTitle(I18n.t('ch_title'), I18n.t('ch_sub')));
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('ch_locked')));
        return;
      }
      const db = Auth.getDb();
      const me = (Auth.phone && Auth.phone()) || '';
      const myName = ((Auth.member && Auth.member()) || {}).name || '';

      const list = UI.el('div', { class: 'chat-list' });
      const input = UI.el('input', { class: 'chat-input', type: 'text', placeholder: I18n.t('ch_ph'), maxlength: '500' });
      const sendBtn = UI.el('button', { class: 'btn btn-green chat-send', onclick: send }, I18n.t('ch_send'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      view.appendChild(list);
      view.appendChild(UI.el('div', { class: 'chat-bar' }, [input, sendBtn]));

      list.innerHTML = '<div class="muted" style="text-align:center;padding:14px">…</div>';
      try {
        unsub = db.collection('messages').orderBy('at', 'desc').limit(120).onSnapshot((snap) => {
          const msgs = []; snap.forEach((d) => msgs.push(d.data())); msgs.reverse();
          list.innerHTML = '';
          if (!msgs.length) { list.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:14px' }, I18n.t('ch_empty'))); return; }
          msgs.forEach((m) => {
            const mine = m.phone === me;
            const t = m.at && m.at.toDate ? m.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
            list.appendChild(UI.el('div', { class: 'chat-row ' + (mine ? 'mine' : 'theirs') }, [
              UI.el('div', { class: 'chat-bubble' }, [
                mine ? null : UI.el('div', { class: 'chat-name' }, m.name || '—'),
                UI.el('div', { class: 'chat-text' }, m.text || ''),
                UI.el('div', { class: 'chat-time' }, t)
              ])
            ]));
          });
          list.scrollTop = list.scrollHeight;
        }, () => { list.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
      } catch (e) {}

      async function send() {
        const text = (input.value || '').trim();
        if (!text) return;
        input.value = '';
        try {
          await db.collection('messages').add({ text: text, name: myName, phone: me, at: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (e) { input.value = text; }
      }
    }
  });
})();
