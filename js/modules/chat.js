/* ===========================================================
   Chat (الدردشة) — real-time members' group chat (Firestore).
   Members only. A top-level bottom-nav tab.
   - smooth incremental rendering (appends new messages, keeps scroll)
   - photo attachments (resized client-side, stored as data URL)
   - per-member new-message notifications toggle (see chat-notify.js)
   =========================================================== */
(function () {
  let unsub = null;

  /* shrink a picked image to a sane size before storing it in Firestore */
  function resizeImg(file, max, cb) {
    try {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        try { cb(c.toDataURL('image/jpeg', 0.72)); } catch (e) { cb(null); }
      };
      img.onerror = () => cb(null);
      img.src = url;
    } catch (e) { cb(null); }
  }

  function lightbox(src) {
    const bd = UI.el('div', { class: 'lb-backdrop', onclick: () => bd.remove() },
      [UI.el('img', { class: 'lb-img', src: src })]);
    document.body.appendChild(bd);
  }

  App.registerModule({
    id: 'chat',
    memberOnly: true,
    title: { ar: 'الدردشة', en: 'Chat' },
    subtitle: { ar: 'دردشة الأعضاء', en: 'Members group chat' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v11H8l-4 3z"/></svg>',
    strings: {
      ar: { ch_title: 'الدردشة', ch_sub: 'دردشة بين الأعضاء', ch_ph: 'اكتب رسالة…', ch_send: 'إرسال',
        ch_empty: 'لا توجد رسائل بعد — ابدأ المحادثة', ch_locked: 'الدردشة للأعضاء فقط',
        ch_photo: 'إرفاق صورة', ch_sending: 'جارٍ الإرسال…', ch_img: 'صورة',
        ch_notif_on: '🔔 تنبيهات الدردشة مفعّلة', ch_notif_off: '🔕 تفعيل تنبيهات الدردشة' },
      en: { ch_title: 'Chat', ch_sub: 'Members group chat', ch_ph: 'Type a message…', ch_send: 'Send',
        ch_empty: 'No messages yet — say hi', ch_locked: 'Chat is for members only',
        ch_photo: 'Attach photo', ch_sending: 'Sending…', ch_img: 'Photo',
        ch_notif_on: '🔔 Chat alerts on', ch_notif_off: '🔕 Turn on chat alerts' }
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

      /* notifications toggle (only if supported) */
      if (window.ChatNotify && window.Notification) {
        const bell = UI.el('button', { class: 'chat-bell', onclick: () => {
          ChatNotify.toggle((on) => { bell.textContent = I18n.t(on ? 'ch_notif_on' : 'ch_notif_off'); bell.classList.toggle('on', on); });
        } }, I18n.t(ChatNotify.enabled() ? 'ch_notif_on' : 'ch_notif_off'));
        if (ChatNotify.enabled()) bell.classList.add('on');
        view.appendChild(UI.el('div', { class: 'chat-top' }, [bell]));
      }

      const list = UI.el('div', { class: 'chat-list' });

      /* input row: photo button + text field + send */
      const file = UI.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      const photoBtn = UI.el('button', { class: 'chat-photo', title: I18n.t('ch_photo'), onclick: () => file.click(),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-4 4-2-2-4 4"/></svg>' });
      file.onchange = () => {
        const f = file.files && file.files[0]; file.value = '';
        if (!f) return;
        photoBtn.classList.add('busy');
        resizeImg(f, 1100, (data) => {
          photoBtn.classList.remove('busy');
          if (data) sendMsg({ image: data });
        });
      };
      const input = UI.el('input', { class: 'chat-input', type: 'text', placeholder: I18n.t('ch_ph'), maxlength: '500' });
      const sendBtn = UI.el('button', { class: 'btn btn-green chat-send', onclick: () => sendText() }, I18n.t('ch_send'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });

      view.appendChild(list);
      view.appendChild(UI.el('div', { class: 'chat-bar' }, [photoBtn, file, input, sendBtn]));

      list.innerHTML = '<div class="muted" style="text-align:center;padding:14px">…</div>';
      let renderedKeys = [], firstPaint = true;

      function timeOf(m) {
        return m.at && m.at.toDate
          ? m.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
          : '';
      }
      function rowEl(m, animate) {
        const mine = m.phone === me;
        const bubbleKids = [mine ? null : UI.el('div', { class: 'chat-name' }, m.name || '—')];
        if (m.image) {
          bubbleKids.push(UI.el('img', { class: 'chat-img', src: m.image, alt: '', onclick: () => lightbox(m.image) }));
        }
        if (m.text) bubbleKids.push(UI.el('div', { class: 'chat-text' }, m.text));
        bubbleKids.push(UI.el('div', { class: 'chat-time' }, timeOf(m)));
        return UI.el('div', { class: 'chat-row ' + (mine ? 'mine' : 'theirs') + (animate ? ' pop' : '') },
          [UI.el('div', { class: 'chat-bubble' + (m.image && !m.text ? ' img-only' : '') }, bubbleKids)]);
      }
      function nearBottom() { return (list.scrollHeight - list.scrollTop - list.clientHeight) < 90; }
      function toBottom(smooth) { list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

      try {
        unsub = db.collection('messages').orderBy('at', 'desc').limit(150).onSnapshot((snap) => {
          const docs = []; snap.forEach((d) => docs.push({ id: d.id, m: d.data() })); docs.reverse();
          const keys = docs.map((d) => d.id);

          if (!docs.length) {
            list.innerHTML = '';
            list.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:14px' }, I18n.t('ch_empty')));
            renderedKeys = []; return;
          }

          // is the previous render a prefix of the new list? -> just append the new tail
          let prefix = renderedKeys.length > 0 && renderedKeys.length < keys.length;
          for (let i = 0; prefix && i < renderedKeys.length; i++) if (renderedKeys[i] !== keys[i]) prefix = false;

          const wasNear = nearBottom();
          if (prefix) {
            const tail = docs.slice(renderedKeys.length);
            const mineIncoming = tail.some((d) => d.m.phone === me);
            tail.forEach((d) => list.appendChild(rowEl(d.m, true)));
            if (wasNear || mineIncoming) toBottom(true);
          } else {
            list.innerHTML = '';
            docs.forEach((d) => list.appendChild(rowEl(d.m, false)));
            toBottom(false);
          }
          renderedKeys = keys;
          firstPaint = false;
        }, () => { list.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
      } catch (e) {}

      function sendText() {
        const text = (input.value || '').trim();
        if (!text) return;
        input.value = ''; input.focus();
        sendMsg({ text: text });
      }
      async function sendMsg(payload) {
        const doc = Object.assign({ text: '', name: myName, phone: me, at: firebase.firestore.FieldValue.serverTimestamp() }, payload);
        try { await db.collection('messages').add(doc); }
        catch (e) { if (payload.text) { input.value = payload.text; } }
      }
    }
  });
})();
