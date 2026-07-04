/* ===========================================================
   Private messages (الخاص) — 1-to-1 DMs between members.
   Rendered inside the Chat tab (#chat/priv…), members only.

   - Any member can message any member (picker = phone-free directory).
   - Messages FROM AN ADMIN render in a distinct "official" style
     (maroon/gold + الإدارة badge) — different from member bubbles.
     The admin flag is verified by Firestore rules (can't be spoofed).
   - Thread id = the two UIDs sorted ("uidA_uidB") → exactly one
     thread per pair, no lookup query needed.
   - dms/{tid}: { members:[a,b], names:{uid:name}, admins:{uid:true},
                  last:{text,at,uid}, unread:{uid:n} }
     dms/{tid}/msgs: { text|imageKey, uid, name, admin?, at }
   - Privacy: rules restrict each thread to its two participants.
     No phone numbers anywhere.
   =========================================================== */
(function () {
  const WORKER = 'https://aldewaniah-media.mulhaqdb.workers.dev';
  let unsubList = null, unsubThread = null, unsubBadge = null;
  let badgeTotal = 0, badgeFirst = true;

  I18n.extend({
    ar: {
      dm_title: 'الرسائل الخاصة', dm_new: '✉️ رسالة جديدة', dm_pick: 'اختر عضوًا',
      dm_empty: 'لا توجد محادثات خاصة بعد', dm_nobody: 'لا يوجد أعضاء آخرون بعد',
      dm_ph: 'اكتب رسالة…', dm_send: 'إرسال', dm_back: 'رجوع', dm_you: 'أنت',
      dm_official: 'الإدارة', dm_photo: 'صورة', dm_msg_empty: 'ابدأ المحادثة 👋',
      dm_report: 'إبلاغ', dm_block: 'حظر هذا العضو', dm_cancel: 'إلغاء',
      dm_reported: 'تم الإبلاغ، شكرًا لك ✅', dm_report_fail: 'تعذّر الإبلاغ، حاول لاحقًا',
      dm_as_admin: 'إرسال كإدارة', dm_as_admin_on: 'كإدارة ✓',
      dm_send_as_q: 'إرسال الرسالة بصفة…', dm_send_admin: 'الإدارة (رسالة رسمية)', dm_send_member: '{name} (عضو)',
      dm_copy: 'انسخ', dm_copied: 'نُسخ'
    },
    en: {
      dm_title: 'Private messages', dm_new: '✉️ New message', dm_pick: 'Pick a member',
      dm_empty: 'No private chats yet', dm_nobody: 'No other members yet',
      dm_ph: 'Type a message…', dm_send: 'Send', dm_back: 'Back', dm_you: 'You',
      dm_official: 'Admin', dm_photo: 'Photo', dm_msg_empty: 'Say hi 👋',
      dm_report: 'Report', dm_block: 'Block this member', dm_cancel: 'Cancel',
      dm_reported: 'Reported, thank you ✅', dm_report_fail: 'Could not report, try later',
      dm_as_admin: 'Send as Admin', dm_as_admin_on: 'As Admin ✓',
      dm_send_as_q: 'Send this message as…', dm_send_admin: 'Admin (official message)', dm_send_member: '{name} (member)',
      dm_copy: 'Copy', dm_copied: 'Copied'
    }
  });

  const myUid = () => (window.Auth && Auth.uid && Auth.uid()) || '';
  const myName = () => ((window.Auth && Auth.member && Auth.member()) || {}).name || '';
  const isAdmin = () => !!(window.Auth && Auth.isAdmin && Auth.isAdmin());
  const db = () => Auth.getDb();
  const tidOf = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  const otherOf = (t) => (t.members || []).find((u) => u !== myUid()) || '';

  async function authToken() {
    try { const u = firebase.auth().currentUser; return u ? await u.getIdToken() : null; } catch (e) { return null; }
  }

  /* ---------- open (or create) a thread with a member ---------- */
  async function open(otherUid, otherName) {
    const me = myUid();
    if (!me || !otherUid || otherUid === me) return;
    const tid = tidOf(me, otherUid);
    try {
      const patch = {
        members: [me, otherUid].sort(),
        names: { [me]: myName(), [otherUid]: otherName || '' }
      };
      if (isAdmin()) patch.admins = { [me]: true };
      await db().collection('dms').doc(tid).set(patch, { merge: true });
    } catch (e) { /* thread may already exist without write perms issues */ }
    location.hash = 'chat/priv/' + tid;
  }

  /* ---------- unread badge on the Chat tab (app-wide) ---------- */
  function watchBadge(uid) {
    if (unsubBadge) { try { unsubBadge(); } catch (e) {} unsubBadge = null; }
    if (!uid) { badgeTotal = 0; paintBadge(); return; }
    badgeFirst = true;
    try {
      unsubBadge = firebase.firestore().collection('dms')
        .where('members', 'array-contains', uid)
        .onSnapshot((snap) => {
          let total = 0;
          const was = badgeTotal;
          snap.forEach((d) => {
            const t = d.data() || {};
            if (window.Moderation && Moderation.isBlocked(otherOf(t))) return;
            total += (t.unread && t.unread[uid]) || 0;
          });
          badgeTotal = total;
          paintBadge();
          // notify on NEW unread (not initial load, not while reading that view)
          if (!badgeFirst && total > was && window.ChatNotify && ChatNotify.enabled()
              && (location.hash || '').indexOf('#chat/priv') !== 0) {
            try {
              const n = new Notification(I18n.t('dm_title'), { body: '✉️', icon: 'assets/icon-192.png', tag: 'dm-msg' });
              n.onclick = () => { try { window.focus(); location.hash = 'chat/priv'; n.close(); } catch (e) {} };
              if (navigator.vibrate) navigator.vibrate([90, 50, 90]);
            } catch (e) {}
          }
          badgeFirst = false;
        }, () => {});
    } catch (e) {}
  }
  function paintBadge() {
    if (window.App && App.setNavBadge) App.setNavBadge('chat', badgeTotal);
    const seg = document.querySelector('.dm-seg-badge');
    if (seg) { seg.textContent = badgeTotal > 9 ? '9+' : String(badgeTotal); seg.style.display = badgeTotal > 0 ? '' : 'none'; }
  }

  /* ---------- views ---------- */
  function segBar(privActive) {
    return UI.el('div', { class: 'chat-seg' }, [
      UI.el('button', { class: 'chat-seg-btn' + (privActive ? '' : ' active'), onclick: () => { location.hash = 'chat'; } }, I18n.t('ch_seg_group')),
      UI.el('button', { class: 'chat-seg-btn' + (privActive ? ' active' : '') }, I18n.t('ch_seg_priv'))
    ]);
  }

  function render(view, sub) {
    if (unsubList) { try { unsubList(); } catch (e) {} unsubList = null; }
    if (unsubThread) { try { unsubThread(); } catch (e) {} unsubThread = null; }
    const parts = (sub || 'priv').split('/');
    if (parts[1]) renderThread(view, parts[1]);
    else renderList(view);
  }

  /* ----- thread list ----- */
  function renderList(view) {
    const me = myUid();
    const screen = UI.el('div', { class: 'chat-screen' });
    view.appendChild(screen);
    screen.appendChild(segBar(true));

    const newBtn = UI.el('button', { class: 'btn btn-block dm-new', onclick: pickMember }, I18n.t('dm_new'));
    screen.appendChild(newBtn);
    const listEl = UI.el('div', { class: 'dm-list' });
    screen.appendChild(listEl);
    listEl.innerHTML = '<div class="muted" style="text-align:center;padding:14px">…</div>';

    try {
      unsubList = db().collection('dms').where('members', 'array-contains', me).onSnapshot((snap) => {
        const rows = [];
        snap.forEach((d) => {
          const t = d.data() || {};
          const other = otherOf(t);
          if (window.Moderation && Moderation.isBlocked(other)) return;
          rows.push({ id: d.id, t: t, other: other });
        });
        rows.sort((a, b) => (((b.t.last && b.t.last.at && b.t.last.at.seconds) || 0) - ((a.t.last && a.t.last.at && a.t.last.at.seconds) || 0)));
        listEl.innerHTML = '';
        if (!rows.length) { listEl.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:18px' }, I18n.t('dm_empty'))); return; }
        rows.forEach((r) => listEl.appendChild(threadRow(r)));
      }, () => { listEl.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
    } catch (e) {}

    function threadRow(r) {
      const me2 = myUid();
      const name = (r.t.names && r.t.names[r.other]) || '—';
      const official = !!(r.t.admins && r.t.admins[r.other]);   // the OTHER side is an admin
      const unread = (r.t.unread && r.t.unread[me2]) || 0;
      const last = r.t.last || {};
      const lastTxt = (last.uid === me2 ? I18n.t('dm_you') + ': ' : '') + (last.text || '');
      const when = last.at && last.at.toDate
        ? last.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
      return UI.el('div', { class: 'dm-row' + (official ? ' official' : ''), onclick: () => { location.hash = 'chat/priv/' + r.id; } }, [
        UI.el('span', { class: 'avatar dm-av' + (official ? ' official' : '') }, official ? '★' : UI.initials(name)),
        UI.el('div', { class: 'dm-mid' }, [
          UI.el('div', { class: 'dm-name' }, name + (official ? ' · ' + I18n.t('dm_official') : '')),
          UI.el('div', { class: 'dm-last' }, lastTxt || '…')
        ]),
        UI.el('div', { class: 'dm-side' }, [
          UI.el('div', { class: 'dm-when' }, when),
          unread > 0 ? UI.el('span', { class: 'dm-badge' }, unread > 9 ? '9+' : String(unread)) : null
        ])
      ]);
    }

    async function pickMember() {
      const me2 = myUid();
      let rows = [];
      try {
        const snap = await db().collection('directory').get();
        snap.forEach((d) => { if (d.id !== me2) rows.push(Object.assign({ id: d.id }, d.data())); });
      } catch (e) {}
      rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
      const bd = UI.el('div', { class: 'modal-backdrop' });
      bd.onclick = (e) => { if (e.target === bd) bd.remove(); };
      const body = UI.el('div', { class: 'dm-pick' });
      if (!rows.length) body.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:14px' }, I18n.t('dm_nobody')));
      rows.forEach((p) => body.appendChild(UI.el('button', { class: 'dm-pick-row', onclick: () => { bd.remove(); open(p.id, p.name || ''); } }, [
        p.photo ? UI.el('img', { class: 'avatar dm-av', src: p.photo, alt: '' }) : UI.el('span', { class: 'avatar dm-av' }, UI.initials(p.name)),
        UI.el('span', { class: 'dm-pick-name' }, p.name || '—')
      ])));
      bd.appendChild(UI.el('div', { class: 'modal dm-pick-modal' }, [
        UI.el('div', { class: 'flex-between', style: 'margin-bottom:8px' }, [
          UI.el('h3', { style: 'margin:0' }, I18n.t('dm_pick')),
          UI.el('button', { class: 'ai-close', onclick: () => bd.remove(), 'aria-label': 'close' }, '×')
        ]), body
      ]));
      document.body.appendChild(bd);
    }
  }

  /* ----- one thread ----- */
  function renderThread(view, tid) {
    const me = myUid();
    if (!me || tid.split('_').indexOf(me) < 0) { location.hash = 'chat/priv'; return; }
    const other = tid.split('_').find((u) => u !== me) || '';
    const d = db();
    const tRef = d.collection('dms').doc(tid);
    const signedUrls = {};
    let atBottom = true, renderedKeys = [], otherName = '—', officialThread = false;

    const screen = UI.el('div', { class: 'chat-screen' });
    view.appendChild(screen);

    const nameEl = UI.el('span', { class: 'dm-head-name' }, '…');
    const head = UI.el('div', { class: 'chat-head dm-head' }, [
      UI.el('button', { class: 'chat-bell dm-backbtn', onclick: () => { location.hash = 'chat/priv'; } }, '‹ ' + I18n.t('dm_back')),
      nameEl,
      UI.el('button', { class: 'chat-bell', title: I18n.t('dm_report'), onclick: modSheet }, '⚑')
    ]);
    screen.appendChild(head);

    // Admins choose ON EVERY SEND: as الإدارة (official maroon/gold bubble)
    // or as themselves (normal member bubble). A small sheet asks each time.
    function askHow() {
      return new Promise((resolve) => {
        if (!isAdmin()) { resolve('member'); return; }
        const close = (val) => { bd.remove(); resolve(val); };
        const sheet = UI.el('div', { class: 'chat-sheet' }, [
          UI.el('div', { class: 'dm-ask-title' }, I18n.t('dm_send_as_q')),
          UI.el('button', { class: 'chat-sheet-it dm-ask-admin', onclick: () => close('admin') },
            '★  ' + I18n.t('dm_send_admin')),
          UI.el('button', { class: 'chat-sheet-it', onclick: () => close('member') },
            '👤  ' + I18n.t('dm_send_member').replace('{name}', myName())),
          UI.el('button', { class: 'chat-sheet-it cancel', onclick: () => close(null) }, I18n.t('dm_cancel'))
        ]);
        const bd = UI.el('div', { class: 'chat-sheet-bd', onclick: (e) => { if (e.target === bd) close(null); } }, [sheet]);
        document.body.appendChild(bd);
      });
    }

    const list = UI.el('div', { class: 'chat-list' });
    screen.appendChild(list);
    list.addEventListener('scroll', () => { atBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 90; });

    /* input bar: photo + text + send */
    const photoFile = UI.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    photoFile.onchange = () => { const f = photoFile.files && photoFile.files[0]; photoFile.value = ''; if (f) sendPhoto(f); };
    const photoBtn = UI.el('button', { class: 'chat-photo', title: I18n.t('dm_photo'), onclick: () => photoFile.click(),
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-4 4-2-2-4 4"/></svg>' });
    const input = UI.el('input', { class: 'chat-input', type: 'text', placeholder: I18n.t('dm_ph'), maxlength: '500', enterkeyhint: 'send' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendText(); } });
    const sendBtn = UI.el('button', { class: 'btn btn-green chat-send', onclick: sendText }, I18n.t('dm_send'));
    screen.appendChild(UI.el('div', { class: 'chat-bar' }, [photoBtn, photoFile, input, sendBtn]));

    list.innerHTML = '<div class="muted" style="text-align:center;padding:14px">…</div>';

    // thread meta (name, official) + mark read
    tRef.get().then((snap) => {
      const t = snap.exists ? (snap.data() || {}) : {};
      otherName = (t.names && t.names[other]) || '—';
      officialThread = !!(t.admins && t.admins[other]);
      // Header shows the PERSON's name only — "الإدارة" appears on the
      // individual official messages, not on the whole conversation.
      nameEl.textContent = otherName;
      markRead();
    }).catch(() => {});
    function markRead() { tRef.set({ unread: { [me]: 0 } }, { merge: true }).catch(() => {}); }

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

    /* Render message text, turning long code-like tokens (e.g. gift/
       subscription codes: 10-24 uppercase letters+digits) into big
       ONE-TAP COPY chips — copying from a text bubble on a phone is
       painful otherwise. Everything is text nodes (XSS-safe). */
    function textWithCopyChips(text) {
      const box = UI.el('div', { class: 'chat-text' });
      const re = /[A-Z0-9]{10,24}/g;
      let last = 0, match;
      while ((match = re.exec(text)) !== null) {
        if (match.index > last) box.appendChild(document.createTextNode(text.slice(last, match.index)));
        const code = match[0];
        const chip = UI.el('button', { class: 'dm-code-chip', type: 'button' }, [
          UI.el('span', { class: 'dm-code-txt' }, code),
          UI.el('span', { class: 'dm-code-hint' }, '📋 ' + I18n.t('dm_copy'))
        ]);
        chip.onclick = (ev) => {
          ev.stopPropagation();
          const ok = () => {
            chip.classList.add('copied');
            chip.lastChild.textContent = '✓ ' + I18n.t('dm_copied');
            setTimeout(() => { chip.classList.remove('copied'); chip.lastChild.textContent = '📋 ' + I18n.t('dm_copy'); }, 1600);
          };
          try { navigator.clipboard.writeText(code).then(ok).catch(() => {
            const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta);
            ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove();
          }); } catch (e) {}
        };
        box.appendChild(chip);
        last = match.index + code.length;
      }
      if (last < text.length) box.appendChild(document.createTextNode(text.slice(last)));
      return box;
    }

    function rowEl(m, prev, animate) {
      const mine = m.uid === me;
      const official = m.admin === true;                 // rules-verified admin stamp
      const grouped = !!(prev && prev.uid === m.uid);
      const kids = [];
      if (official && !grouped) kids.push(UI.el('div', { class: 'dm-official-tag' }, '★ ' + I18n.t('dm_official')));
      if (m.imageKey) {
        const src = signedUrls[m.imageKey];
        kids.push(UI.el('img', { class: 'chat-img', src: src, alt: '', onclick: () => {
          const bd = UI.el('div', { class: 'lb-backdrop', onclick: () => bd.remove() }, [UI.el('img', { class: 'lb-img', src: src })]);
          document.body.appendChild(bd);
        }, onload: () => { if (atBottom) list.scrollTop = list.scrollHeight; } }));
      }
      if (m.text) kids.push(textWithCopyChips(m.text));
      kids.push(UI.el('div', { class: 'chat-time' },
        m.at && m.at.toDate ? m.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : ''));
      const bubble = UI.el('div', { class: 'chat-bubble' + (official ? ' official' : '') }, kids);
      return UI.el('div', { class: 'chat-row ' + (mine ? 'mine' : 'theirs') + (grouped ? ' grouped' : '') + (animate ? ' pop' : '') }, [bubble]);
    }

    try {
      unsubThread = tRef.collection('msgs').orderBy('at', 'desc').limit(100).onSnapshot(async (snap) => {
        const docs = []; snap.forEach((x) => docs.push({ id: x.id, m: x.data() })); docs.reverse();
        await signKeys(docs.map((x) => x.m.imageKey).filter(Boolean));
        const keys = docs.map((x) => x.id);
        let prefix = renderedKeys.length > 0 && renderedKeys.length < keys.length;
        for (let i = 0; prefix && i < renderedKeys.length; i++) if (renderedKeys[i] !== keys[i]) prefix = false;
        if (!docs.length) {
          list.innerHTML = '';
          list.appendChild(UI.el('div', { class: 'muted', style: 'text-align:center;padding:14px' }, I18n.t('dm_msg_empty')));
          renderedKeys = [];
        } else if (prefix) {
          for (let i = renderedKeys.length; i < docs.length; i++) list.appendChild(rowEl(docs[i].m, docs[i - 1] && docs[i - 1].m, true));
          list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
          renderedKeys = keys;
        } else {
          list.innerHTML = '';
          docs.forEach((x, i) => list.appendChild(rowEl(x.m, docs[i - 1] && docs[i - 1].m, false)));
          list.scrollTop = list.scrollHeight;
          renderedKeys = keys;
        }
        markRead(); // reading the thread clears my unread counter
      }, () => { list.innerHTML = '<div class="auth-err" style="text-align:center">—</div>'; });
    } catch (e) {}

    async function sendMsg(payload, asAdmin) {
      const msg = Object.assign({ text: '', uid: me, name: myName(), at: firebase.firestore.FieldValue.serverTimestamp() }, payload);
      // Official style ONLY when the admin chose "كإدارة" for THIS message.
      if (isAdmin() && asAdmin) msg.admin = true;
      const meta = {
        members: [me, other].sort(),
        names: { [me]: myName() },
        last: { text: msg.text || '📷', at: firebase.firestore.FieldValue.serverTimestamp(), uid: me },
        unread: { [other]: firebase.firestore.FieldValue.increment(1) }
      };
      if (isAdmin() && asAdmin) meta.admins = { [me]: true };
      try {
        await tRef.collection('msgs').add(msg);
        await tRef.set(meta, { merge: true });
        // push notification to the other participant only (fire & forget)
        if (window.Push) Push.notify({ kind: 'dm', toUid: other,
          title: '✉️ رسالة خاصة — ' + myName(), body: msg.text || '📷 صورة' });
      } catch (e) { if (payload.text) input.value = payload.text; }
    }
    async function sendText() {
      const text = (input.value || '').trim();
      if (!text) return;
      const how = await askHow();               // admin picks كإدارة / كعضو
      if (!how) { input.focus(); return; }      // cancelled — keep the text
      input.value = ''; input.focus();
      sendMsg({ text: text }, how === 'admin');
    }
    async function sendPhoto(f) {
      const how = await askHow();
      if (!how) return;
      photoBtn.classList.add('busy');
      UI.resizeImage(f, 1100, 0.72, async (data) => {
        try {
          if (!data) throw new Error('image');
          const blob = await (await fetch(data)).blob();
          const tk = await authToken();
          const res = await fetch(WORKER + '/upload?dir=chat', {
            method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'X-File-Type': 'image/jpeg', 'X-File-Name': 'dm.jpg' }, body: blob
          });
          if (!res.ok) throw new Error('upload failed');
          const out = await res.json();
          if (out && out.key) sendMsg({ imageKey: out.key }, how === 'admin');
        } catch (e) { alert((e && e.message) || 'Error'); }
        photoBtn.classList.remove('busy');
      });
    }

    function modSheet() {
      const close = () => bd.remove();
      const it = (label, fn) => UI.el('button', { class: 'chat-sheet-it', onclick: () => { close(); fn(); } }, label);
      const sheet = UI.el('div', { class: 'chat-sheet' }, [
        it('⚑  ' + I18n.t('dm_report'), async () => {
          const ok = window.Moderation && await Moderation.report('dm', tid, otherName, '');
          alert(I18n.t(ok ? 'dm_reported' : 'dm_report_fail'));
        }),
        it('🚫  ' + I18n.t('dm_block'), () => {
          if (window.Moderation) { Moderation.block(other); location.hash = 'chat/priv'; }
        }),
        UI.el('button', { class: 'chat-sheet-it cancel', onclick: close }, I18n.t('dm_cancel'))
      ]);
      const bd = UI.el('div', { class: 'chat-sheet-bd', onclick: (e) => { if (e.target === bd) close(); } }, [sheet]);
      document.body.appendChild(bd);
    }
  }

  /* start/stop the badge watcher with auth state */
  try {
    firebase.auth().onAuthStateChanged((user) => {
      if (user && user.phoneNumber) watchBadge(user.uid);
      else watchBadge(null);
    });
  } catch (e) {}

  window.DM = { render: render, open: open, paintSegBadge: paintBadge };
})();
