/* ===========================================================
   Chat (الدردشة) — real-time members' group chat (Firestore).
   Members only. A top-level bottom-nav tab.
   - smooth incremental rendering (appends new messages, keeps scroll)
   - photo attachments (resized client-side, stored as data URL)
   - per-member new-message notifications toggle (see chat-notify.js)
   =========================================================== */
(function () {
  let unsub = null;
  const WORKER = 'https://aldewaniah-media.mulhaqdb.workers.dev';
  async function authToken() {
    try { const u = firebase.auth().currentUser; return u ? await u.getIdToken() : null; } catch (e) { return null; }
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
        ch_notif_on: '🔔 تنبيهات الدردشة مفعّلة', ch_notif_off: '🔕 تفعيل تنبيهات الدردشة',
        ch_del: 'حذف', ch_del_confirm: 'حذف هذه الرسالة؟' },
      en: { ch_title: 'Chat', ch_sub: 'Members group chat', ch_ph: 'Type a message…', ch_send: 'Send',
        ch_empty: 'No messages yet — say hi', ch_locked: 'Chat is for members only',
        ch_photo: 'Attach photo', ch_sending: 'Sending…', ch_img: 'Photo',
        ch_notif_on: '🔔 Chat alerts on', ch_notif_off: '🔕 Turn on chat alerts',
        ch_del: 'Delete', ch_del_confirm: 'Delete this message?' }
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
        // Resize, then upload to R2 (store only the key in the message — keeps Firestore light).
        UI.resizeImage(f, 1100, 0.72, async (data) => {
          if (!data) { photoBtn.classList.remove('busy'); return; }
          try {
            const blob = await (await fetch(data)).blob();
            const tk = await authToken();
            const res = await fetch(WORKER + '/upload?dir=chat', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + tk, 'X-File-Type': 'image/jpeg', 'X-File-Name': 'chat.jpg' },
              body: blob
            });
            if (!res.ok) throw new Error('upload failed');
            const out = await res.json();
            if (out && out.key) sendMsg({ imageKey: out.key });
          } catch (e) { alert((e && e.message) || 'Error'); }
          photoBtn.classList.remove('busy');
        });
      };
      const input = UI.el('input', { class: 'chat-input', type: 'text', placeholder: I18n.t('ch_ph'), maxlength: '500' });
      const sendBtn = UI.el('button', { class: 'btn btn-green chat-send', onclick: () => sendText() }, I18n.t('ch_send'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });

      view.appendChild(list);
      view.appendChild(UI.el('div', { class: 'chat-bar' }, [photoBtn, file, input, sendBtn]));

      list.innerHTML = '<div class="muted" style="text-align:center;padding:14px">…</div>';
      let renderedKeys = [], firstPaint = true;
      const signedUrls = {}; // R2 key -> short-lived signed URL (for chat photos)
      async function signKeys(keys) {
        const need = (keys || []).filter((k) => k && !signedUrls[k]);
        if (!need.length) return;
        try {
          const tk = await authToken();
          const res = await fetch(WORKER + '/sign', {
            method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: need })
          });
          if (res.ok) { const j = await res.json(); Object.assign(signedUrls, j.urls || {}); }
        } catch (e) {}
      }

      function timeOf(m) {
        return m.at && m.at.toDate
          ? m.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
          : '';
      }
      function rowEl(id, m, animate) {
        const mine = m.phone === me;
        // New messages store an R2 key (imageKey); old ones may have an inline base64 image.
        const imgSrc = m.imageKey ? signedUrls[m.imageKey] : (m.image || null);
        const bubbleKids = [mine ? null : UI.el('div', { class: 'chat-name' }, m.name || '—')];
        if (imgSrc) {
          bubbleKids.push(UI.el('img', { class: 'chat-img', src: imgSrc, alt: '', onclick: () => lightbox(imgSrc) }));
        }
        if (m.text) bubbleKids.push(UI.el('div', { class: 'chat-text' }, m.text));
        bubbleKids.push(UI.el('div', { class: 'chat-time' }, timeOf(m)));
        const kids = [UI.el('div', { class: 'chat-bubble' + (imgSrc && !m.text ? ' img-only' : '') }, bubbleKids)];
        // Only admins can delete messages.
        if (window.Auth && Auth.isAdmin && Auth.isAdmin()) {
          kids.push(UI.el('button', { class: 'chat-del', title: I18n.t('ch_del'),
            onclick: () => UI.confirm(I18n.t('ch_del_confirm'), () => delMsg(id)) }, '×'));
        }
        return UI.el('div', { class: 'chat-row ' + (mine ? 'mine' : 'theirs') + (animate ? ' pop' : '') }, kids);
      }
      async function delMsg(id) {
        try { await db.collection('messages').doc(id).delete(); } catch (e) { alert(e.message || 'Error'); }
      }
      function nearBottom() { return (list.scrollHeight - list.scrollTop - list.clientHeight) < 90; }
      function toBottom(smooth) { list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

      try {
        unsub = db.collection('messages').orderBy('at', 'desc').limit(150).onSnapshot(async (snap) => {
          const docs = []; snap.forEach((d) => docs.push({ id: d.id, m: d.data() })); docs.reverse();
          const keys = docs.map((d) => d.id);
          // Make sure photo URLs are signed before we render them.
          await signKeys(docs.filter((d) => d.m.imageKey).map((d) => d.m.imageKey));

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
            tail.forEach((d) => list.appendChild(rowEl(d.id, d.m, true)));
            if (wasNear || mineIncoming) toBottom(true);
          } else {
            list.innerHTML = '';
            docs.forEach((d) => list.appendChild(rowEl(d.id, d.m, false)));
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
