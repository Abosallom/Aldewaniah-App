/* ===========================================================
   Chat (الدردشة) — real-time members' group chat (Firestore).
   Members only. A top-level bottom-nav tab.
   - native full-height screen, message grouping
   - WhatsApp-style press-and-HOLD voice & video notes
   - photos, plus a Media panel and an Attachments (voice) panel
   - per-member new-message notifications (see chat-notify.js)
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
  function sheetModal(title, bodyNode) {
    const bd = UI.el('div', { class: 'modal-backdrop' });
    bd.onclick = (e) => { if (e.target === bd) bd.remove(); };
    const modal = UI.el('div', { class: 'modal chat-att-modal' }, [
      UI.el('div', { class: 'flex-between', style: 'margin-bottom:8px' }, [
        UI.el('h3', { style: 'margin:0' }, title),
        UI.el('button', { class: 'ai-close', onclick: () => bd.remove(), 'aria-label': 'close' }, '×')
      ]),
      bodyNode
    ]);
    bd.appendChild(modal); document.body.appendChild(bd);
    return bd;
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
        ch_photo: 'صورة', ch_voice_msg: '🎤 رسالة صوتية', ch_video_msg: '🎥 فيديو',
        ch_slide_cancel: 'اسحب لأعلى للإلغاء ⬆', ch_rel_cancel: 'أفلت للإلغاء',
        ch_voice_unsup: 'التسجيل غير مدعوم على هذا الجهاز', ch_mic_denied: 'تعذّر الوصول للميكروفون/الكاميرا',
        ch_hold_hint: 'اضغط مطوّلاً 🎤 للصوت و 🎥 للفيديو',
        ch_attachments: 'المرفقات', ch_no_attach: 'لا توجد رسائل صوتية بعد', ch_media: 'الوسائط', ch_no_media: 'لا توجد وسائط بعد',
        ch_notif_on: '🔔 تنبيهات الدردشة مفعّلة', ch_notif_off: '🔕 تفعيل تنبيهات الدردشة',
        ch_del: 'حذف', ch_del_confirm: 'حذف هذه الرسالة؟' },
      en: { ch_title: 'Chat', ch_sub: 'Members group chat', ch_ph: 'Type a message…', ch_send: 'Send',
        ch_empty: 'No messages yet — say hi', ch_locked: 'Chat is for members only',
        ch_photo: 'Photo', ch_voice_msg: '🎤 Voice note', ch_video_msg: '🎥 Video',
        ch_slide_cancel: 'Slide up to cancel ⬆', ch_rel_cancel: 'Release to cancel',
        ch_voice_unsup: 'Recording is not supported on this device', ch_mic_denied: 'Could not access mic/camera',
        ch_hold_hint: 'Hold 🎤 for voice, 🎥 for video',
        ch_attachments: 'Attachments', ch_no_attach: 'No voice notes yet', ch_media: 'Media', ch_no_media: 'No media yet',
        ch_notif_on: '🔔 Chat alerts on', ch_notif_off: '🔕 Turn on chat alerts',
        ch_del: 'Delete', ch_del_confirm: 'Delete this message?' }
    },

    render(view) {
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.pageTitle(I18n.t('ch_title'), I18n.t('ch_sub')));
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('ch_locked')));
        return;
      }
      const db = Auth.getDb();
      const me = (Auth.phone && Auth.phone()) || '';
      const myName = ((Auth.member && Auth.member()) || {}).name || '';

      const screen = UI.el('div', { class: 'chat-screen' });
      view.appendChild(screen);

      /* head: notifications toggle + Media + Attachments panels */
      const headKids = [];
      if (window.ChatNotify && window.Notification) {
        const bell = UI.el('button', { class: 'chat-bell', onclick: () => {
          ChatNotify.toggle((on) => { bell.textContent = I18n.t(on ? 'ch_notif_on' : 'ch_notif_off'); bell.classList.toggle('on', on); });
        } }, I18n.t(ChatNotify.enabled() ? 'ch_notif_on' : 'ch_notif_off'));
        if (ChatNotify.enabled()) bell.classList.add('on');
        headKids.push(bell);
      }
      headKids.push(UI.el('button', { class: 'chat-bell', onclick: () => openAttachments('media') }, '🖼️ ' + I18n.t('ch_media')));
      headKids.push(UI.el('button', { class: 'chat-bell', onclick: () => openAttachments('attach') }, '📎 ' + I18n.t('ch_attachments')));
      screen.appendChild(UI.el('div', { class: 'chat-head' }, headKids));

      const list = UI.el('div', { class: 'chat-list' });

      /* hidden file inputs: photo (resized) + video capture (fallback if no MediaRecorder) */
      const photoFile = UI.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      const vidFallback = UI.el('input', { type: 'file', accept: 'video/*', capture: 'user', style: 'display:none' });
      photoFile.onchange = () => { const f = photoFile.files && photoFile.files[0]; photoFile.value = ''; if (f) sendPhoto(f); };
      vidFallback.onchange = () => { const f = vidFallback.files && vidFallback.files[0]; vidFallback.value = ''; if (f) sendVideoFile(f); };

      const photoBtn = UI.el('button', { class: 'chat-photo', title: I18n.t('ch_photo'), onclick: () => photoFile.click(),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-4 4-2-2-4 4"/></svg>' });
      const micBtn = UI.el('button', { class: 'chat-photo chat-hold', title: I18n.t('ch_voice_msg'),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>' });
      const vidBtn = UI.el('button', { class: 'chat-photo chat-hold', title: I18n.t('ch_video_msg'),
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10l5-3v10l-5-3"/></svg>' });
      const input = UI.el('input', { class: 'chat-input', type: 'text', placeholder: I18n.t('ch_ph'), maxlength: '500', enterkeyhint: 'send' });
      const sendBtn = UI.el('button', { class: 'btn btn-green chat-send', onclick: () => sendText() }, I18n.t('ch_send'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendText(); } });
      const normalBar = UI.el('div', { class: 'chat-bar' }, [photoBtn, micBtn, vidBtn, photoFile, vidFallback, input, sendBtn]);

      /* recording overlay (shown while holding) */
      const recDot = UI.el('span', { class: 'chat-rec-dot' });
      const recTime = UI.el('span', { class: 'chat-rec-time' }, '0:00');
      const recHint = UI.el('span', { class: 'chat-rec-hint' }, I18n.t('ch_slide_cancel'));
      const recPrev = UI.el('video', { class: 'chat-vidprev', muted: '', playsinline: '', style: 'display:none' });
      const recBar = UI.el('div', { class: 'chat-bar chat-recbar' }, [
        recDot, UI.el('div', { class: 'chat-rec-info' }, [recTime, recHint])
      ]);
      const recWrap = UI.el('div', { class: 'chat-recwrap', style: 'display:none' }, [recPrev, recBar]);

      screen.appendChild(list);
      screen.appendChild(normalBar);
      screen.appendChild(recWrap);
      screen.appendChild(UI.el('div', { class: 'chat-hint' }, I18n.t('ch_hold_hint')));

      list.innerHTML = '<div class="muted" style="text-align:center;padding:14px">…</div>';
      let renderedKeys = [], lastDocs = [];
      const signedUrls = {};
      let atBottom = true;
      list.addEventListener('scroll', () => { atBottom = nearBottom(); });

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
      function mediaKeysOf(m) { return [m.imageKey, m.audioKey, m.videoKey].filter(Boolean); }

      function timeOf(m) {
        return m.at && m.at.toDate
          ? m.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
          : '';
      }
      function sameWindow(a, b) {
        try {
          const ta = a.at && a.at.toMillis ? a.at.toMillis() : 0;
          const tb = b.at && b.at.toMillis ? b.at.toMillis() : 0;
          return (ta && tb) ? Math.abs(tb - ta) < 5 * 60000 : true;
        } catch (e) { return true; }
      }
      function pinIfBottom() { if (atBottom) list.scrollTop = list.scrollHeight; }

      function mediaNode(m) {
        if (m.imageKey || m.image) {
          const src = m.imageKey ? signedUrls[m.imageKey] : m.image;
          return UI.el('img', { class: 'chat-img', src: src, alt: '', onclick: () => lightbox(src), onload: pinIfBottom });
        }
        if (m.audioKey) return UI.el('audio', { class: 'chat-audio', src: signedUrls[m.audioKey], controls: '', preload: 'metadata' });
        if (m.videoKey) return UI.el('video', { class: 'chat-video', src: signedUrls[m.videoKey], controls: '', playsinline: '', preload: 'metadata', onloadeddata: pinIfBottom });
        return null;
      }

      function rowEl(id, m, prev, animate) {
        const mine = m.phone === me;
        const grouped = !!(prev && prev.phone === m.phone && sameWindow(prev, m));
        const media = mediaNode(m);
        const isMediaOnly = !!media && !m.text && !m.audioKey;
        const bubbleKids = [(!mine && !grouped) ? UI.el('div', { class: 'chat-name' }, m.name || '—') : null];
        if (media) bubbleKids.push(media);
        if (m.text) bubbleKids.push(UI.el('div', { class: 'chat-text' }, m.text));
        bubbleKids.push(UI.el('div', { class: 'chat-time' }, timeOf(m)));
        const kids = [UI.el('div', { class: 'chat-bubble' + (isMediaOnly ? ' img-only' : '') }, bubbleKids)];
        if (window.Auth && Auth.isAdmin && Auth.isAdmin()) {
          kids.push(UI.el('button', { class: 'chat-del', title: I18n.t('ch_del'),
            onclick: () => UI.confirm(I18n.t('ch_del_confirm'), () => delMsg(id)) }, '×'));
        }
        return UI.el('div', { class: 'chat-row ' + (mine ? 'mine' : 'theirs') + (grouped ? ' grouped' : '') + (animate ? ' pop' : '') }, kids);
      }
      async function delMsg(id) { try { await db.collection('messages').doc(id).delete(); } catch (e) { alert(e.message || 'Error'); } }
      function nearBottom() { return (list.scrollHeight - list.scrollTop - list.clientHeight) < 90; }
      function toBottom(smooth) { list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }

      try {
        unsub = db.collection('messages').orderBy('at', 'desc').limit(150).onSnapshot(async (snap) => {
          const docs = []; snap.forEach((d) => docs.push({ id: d.id, m: d.data() })); docs.reverse();
          lastDocs = docs;
          const keys = docs.map((d) => d.id);
          const allMedia = []; docs.forEach((d) => mediaKeysOf(d.m).forEach((k) => allMedia.push(k)));
          await signKeys(allMedia);

          if (!docs.length) {
            list.innerHTML = '';
            list.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:14px' }, I18n.t('ch_empty')));
            renderedKeys = []; return;
          }
          let prefix = renderedKeys.length > 0 && renderedKeys.length < keys.length;
          for (let i = 0; prefix && i < renderedKeys.length; i++) if (renderedKeys[i] !== keys[i]) prefix = false;

          const wasNear = atBottom;
          if (prefix) {
            const mineIncoming = docs.slice(renderedKeys.length).some((d) => d.m.phone === me);
            for (let i = renderedKeys.length; i < docs.length; i++) list.appendChild(rowEl(docs[i].id, docs[i].m, docs[i - 1] && docs[i - 1].m, true));
            if (wasNear || mineIncoming) toBottom(true);
          } else {
            list.innerHTML = '';
            docs.forEach((d, i) => list.appendChild(rowEl(d.id, d.m, docs[i - 1] && docs[i - 1].m, false)));
            toBottom(false);
          }
          renderedKeys = keys;
          atBottom = nearBottom();
        }, () => { list.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
      } catch (e) {}

      /* -------- uploads -------- */
      async function uploadBlob(blob, type, name) {
        const tk = await authToken();
        const res = await fetch(WORKER + '/upload?dir=chat', {
          method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'X-File-Type': type, 'X-File-Name': name }, body: blob
        });
        if (!res.ok) throw new Error('upload failed');
        const out = await res.json();
        return out && out.key;
      }
      function sendPhoto(f) {
        photoBtn.classList.add('busy');
        UI.resizeImage(f, 1100, 0.72, async (data) => {
          try { if (!data) throw new Error('image'); const blob = await (await fetch(data)).blob();
            const key = await uploadBlob(blob, 'image/jpeg', 'chat.jpg'); if (key) sendMsg({ imageKey: key }); }
          catch (e) { alert((e && e.message) || 'Error'); }
          photoBtn.classList.remove('busy');
        });
      }
      async function sendVideoFile(f) {
        vidBtn.classList.add('busy');
        try { const type = f.type || 'video/mp4'; const ext = (type.split('/')[1] || 'mp4').split(';')[0];
          const key = await uploadBlob(f, type, 'video.' + ext); if (key) sendMsg({ videoKey: key }); }
        catch (e) { alert((e && e.message) || 'Error'); }
        vidBtn.classList.remove('busy');
      }

      /* -------- press-and-HOLD recorder (voice + video), WhatsApp style -------- */
      const rec = { on: false, pending: false, aborted: false, cancel: false, kind: null, mr: null, stream: null, chunks: [], timer: null, sec: 0, startY: 0 };
      function fmt(s) { const m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0'); }
      function pickMime(kind) {
        const c = kind === 'video' ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm', 'audio/mp4', 'audio/aac'];
        if (window.MediaRecorder && MediaRecorder.isTypeSupported) for (const t of c) if (MediaRecorder.isTypeSupported(t)) return t;
        return '';
      }
      function setCancel(on) {
        if (rec.cancel === on) return;
        rec.cancel = on;
        recHint.textContent = I18n.t(on ? 'ch_rel_cancel' : 'ch_slide_cancel');
        recWrap.classList.toggle('cancel', on);
      }
      function showRec(kind, stream) {
        recTime.textContent = '0:00'; setCancel(false);
        if (kind === 'video') { recPrev.style.display = 'block'; recPrev.srcObject = stream; recPrev.play().catch(() => {}); }
        else { recPrev.style.display = 'none'; recPrev.srcObject = null; }
        recWrap.style.display = 'flex'; normalBar.style.display = 'none';
      }
      function hideRec() { recWrap.style.display = 'none'; normalBar.style.display = 'flex'; recPrev.srcObject = null; recPrev.style.display = 'none'; }

      async function beginRecord(kind) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
          if (kind === 'video') { vidFallback.click(); } else { alert(I18n.t('ch_voice_unsup')); } return;
        }
        rec.pending = true; rec.aborted = false; rec.cancel = false; rec.kind = kind; rec.chunks = []; rec.sec = 0;
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }); }
        catch (e) { rec.pending = false; if (kind === 'video') { vidFallback.click(); } else { alert(I18n.t('ch_mic_denied')); } return; }
        if (rec.aborted) { stream.getTracks().forEach((t) => t.stop()); rec.pending = false; return; } // released before ready
        rec.stream = stream;
        const mime = pickMime(kind);
        try { rec.mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
        catch (e) { rec.mr = new MediaRecorder(stream); }
        rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
        rec.mr.onstop = () => finishRecord();
        rec.mr.start();
        rec.on = true; rec.pending = false;
        showRec(kind, stream);
        rec.timer = setInterval(() => { rec.sec++; recTime.textContent = fmt(rec.sec); if (rec.sec >= 120) endRecord(); }, 1000);
      }
      function endRecord() {
        if (rec.pending) { rec.aborted = true; return; }       // stream still opening -> abort on arrival
        if (!rec.on) return;
        try { if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop(); } catch (e) {}
      }
      async function finishRecord() {
        rec.on = false; clearInterval(rec.timer); rec.timer = null;
        try { if (rec.stream) rec.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        hideRec();
        const tooShort = rec.sec < 1;                           // ignore accidental taps
        if (rec.cancel || tooShort || !rec.chunks.length) { rec.chunks = []; return; }
        const isVid = rec.kind === 'video';
        const type = (rec.mr && rec.mr.mimeType) || (isVid ? 'video/webm' : 'audio/webm');
        const blob = new Blob(rec.chunks, { type: type }); rec.chunks = [];
        const ext = isVid ? (type.indexOf('mp4') >= 0 ? 'mp4' : 'webm') : (type.indexOf('mp4') >= 0 ? 'm4a' : 'webm');
        try { const key = await uploadBlob(blob, type, (isVid ? 'video.' : 'voice.') + ext); if (key) sendMsg(isVid ? { videoKey: key } : { audioKey: key, dur: rec.sec }); }
        catch (e) { alert((e && e.message) || 'Error'); }
      }
      function bindHold(btn, kind) {
        btn.style.touchAction = 'none';
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (rec.on || rec.pending) return;
          try { btn.setPointerCapture(e.pointerId); } catch (x) {}
          rec.startY = e.clientY;
          btn.classList.add('holding');
          beginRecord(kind);
        });
        btn.addEventListener('pointermove', (e) => {
          if (!(rec.on || rec.pending)) return;
          setCancel((rec.startY - e.clientY) > 90);
        });
        const up = () => { btn.classList.remove('holding'); if (rec.on || rec.pending) endRecord(); };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', () => { btn.classList.remove('holding'); if (rec.on || rec.pending) { setCancel(true); endRecord(); } });
      }
      bindHold(micBtn, 'audio');
      bindHold(vidBtn, 'video');

      /* -------- attachments panel: 'media' (photos+videos) or 'attach' (voice) -------- */
      function openAttachments(kind) {
        const isMedia = kind === 'media';
        const items = lastDocs.filter((d) => { const m = d.m; return isMedia ? (m.imageKey || m.image || m.videoKey) : !!m.audioKey; }).slice().reverse();
        const body = UI.el('div', { class: 'chat-att-body' });
        if (!items.length) {
          body.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:20px;grid-column:1/-1' }, I18n.t(isMedia ? 'ch_no_media' : 'ch_no_attach')));
        } else {
          items.forEach(({ m }) => {
            let node;
            if (isMedia) {
              if (m.imageKey || m.image) { const src = m.imageKey ? signedUrls[m.imageKey] : m.image; node = UI.el('img', { class: 'chat-att-thumb', src: src, onclick: () => lightbox(src) }); }
              else if (m.videoKey) { node = UI.el('video', { class: 'chat-att-thumb', src: signedUrls[m.videoKey], controls: '', playsinline: '', preload: 'metadata' }); }
            } else {
              node = UI.el('div', { class: 'chat-att-audio' }, [
                UI.el('div', { class: 'chat-att-cap' }, I18n.t('ch_voice_msg') + ' · ' + (m.name || '—')),
                UI.el('audio', { src: signedUrls[m.audioKey], controls: '', preload: 'metadata', style: 'width:100%' })
              ]);
            }
            if (node) body.appendChild(node);
          });
        }
        sheetModal(I18n.t(isMedia ? 'ch_media' : 'ch_attachments'), body);
      }

      /* -------- send text -------- */
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
