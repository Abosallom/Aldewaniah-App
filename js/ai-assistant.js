/* ===========================================================
   AI Assistant (مساعد الديوانية) — a members-only support chat.
   A floating button on every screen opens a panel that talks to
   the Cloudflare Workers AI worker. Members can also send an
   app-improvement suggestion straight to the admin.
   =========================================================== */
(function () {
  const AI_WORKER = 'https://aldewaniah-ai.mulhaqdb.workers.dev';

  I18n.extend({
    ar: {
      ai_title: 'مساعد الديوانية', ai_sub: 'اسألني عن التطبيق أو أي شيء',
      ai_ph: 'اكتب سؤالك…', ai_send: 'إرسال', ai_hi: 'حياك الله! كيف أقدر أساعدك؟',
      ai_err: 'تعذّر الوصول للمساعد، حاول لاحقًا', ai_thinking: 'يكتب…',
      ai_suggest: '💡 اقتراح للمشرف', ai_suggest_ph: 'اكتب اقتراحك لتحسين التطبيق…',
      ai_suggest_sent: 'تم إرسال اقتراحك للمشرف، شكرًا لك ✅', ai_suggest_send: 'إرسال الاقتراح',
      ai_cancel: 'إلغاء'
    },
    en: {
      ai_title: 'Dewaniah Assistant', ai_sub: 'Ask me about the app or anything',
      ai_ph: 'Type your question…', ai_send: 'Send', ai_hi: 'Hi! How can I help you?',
      ai_err: "Couldn't reach the assistant, try later", ai_thinking: 'typing…',
      ai_suggest: '💡 Suggest to admin', ai_suggest_ph: 'Write your improvement idea…',
      ai_suggest_sent: 'Your suggestion was sent to the admin, thank you ✅', ai_suggest_send: 'Send suggestion',
      ai_cancel: 'Cancel'
    }
  });

  let fab = null, history = [];

  function isMember() { return !!(window.Auth && Auth.isMember && Auth.isMember()); }

  function ensureFab() {
    if (!fab) {
      fab = UI.el('button', { class: 'ai-fab', 'aria-label': 'AI', title: 'مساعد الديوانية', onclick: openPanel,
        html: '<img src="assets/icon-192.png" alt="">' });
      document.body.appendChild(fab);
    }
    // Hide on the Chat tab (group AND private sub-routes like #chat/priv/...)
    // so it never overlaps the chat/DM send button.
    const onChat = (location.hash || '').replace('#', '').split('?')[0].split('/')[0] === 'chat';
    fab.style.display = (isMember() && !onChat) ? 'flex' : 'none';
  }

  function openPanel() {
    const backdrop = UI.el('div', { class: 'ai-backdrop' });
    const close = () => backdrop.remove();
    backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

    const msgs = UI.el('div', { class: 'ai-msgs' });
    const input = UI.el('input', { class: 'ai-input', type: 'text', placeholder: I18n.t('ai_ph'), maxlength: '500' });
    const sendBtn = UI.el('button', { class: 'btn btn-green ai-send', onclick: send }, I18n.t('ai_send'));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

    const header = UI.el('div', { class: 'ai-head' }, [
      UI.el('div', null, [
        UI.el('div', { class: 'ai-h-title' }, I18n.t('ai_title')),
        UI.el('div', { class: 'ai-h-sub' }, I18n.t('ai_sub'))
      ]),
      UI.el('button', { class: 'ai-close', onclick: close, 'aria-label': 'close' }, '×')
    ]);
    const suggestBtn = UI.el('button', { class: 'ai-suggest', onclick: () => openSuggest() }, I18n.t('ai_suggest'));
    const panel = UI.el('div', { class: 'ai-panel' }, [
      header, msgs, suggestBtn,
      UI.el('div', { class: 'ai-bar' }, [input, sendBtn])
    ]);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    // greet + replay any history
    if (!history.length) addBubble(msgs, 'bot', I18n.t('ai_hi'));
    else history.forEach((m) => addBubble(msgs, m.role === 'user' ? 'user' : 'bot', m.content));
    setTimeout(() => input.focus(), 60);

    function addBubble(container, who, text) {
      const b = UI.el('div', { class: 'ai-row ' + who }, [UI.el('div', { class: 'ai-msg' }, text)]);
      container.appendChild(b); container.scrollTop = container.scrollHeight;
      return b;
    }

    async function send() {
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      addBubble(msgs, 'user', text);
      history.push({ role: 'user', content: text });
      const typing = addBubble(msgs, 'bot typing', I18n.t('ai_thinking'));
      sendBtn.disabled = true;
      try {
        const tk = await firebase.auth().currentUser.getIdToken();
        const res = await fetch(AI_WORKER + '/chat', {
          method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history })
        });
        const j = await res.json().catch(() => ({}));
        typing.remove();
        const reply = (res.ok && j.reply) ? j.reply : I18n.t('ai_err');
        addBubble(msgs, 'bot', reply);
        if (res.ok && j.reply) history.push({ role: 'assistant', content: j.reply });
      } catch (e) {
        typing.remove(); addBubble(msgs, 'bot', I18n.t('ai_err'));
      }
      sendBtn.disabled = false; input.focus();
    }

    function openSuggest() {
      const sb = UI.el('div', { class: 'modal-backdrop' });
      const sclose = () => sb.remove();
      sb.onclick = (e) => { if (e.target === sb) sclose(); };
      const ta = UI.el('textarea', { class: 'fld', placeholder: I18n.t('ai_suggest_ph'), maxlength: '500' });
      const err = UI.el('p', { class: 'auth-err' });
      const ok = UI.el('button', { class: 'btn', onclick: saveSuggest }, I18n.t('ai_suggest_send'));
      const box = UI.el('div', { class: 'modal' }, [
        UI.el('h3', null, I18n.t('ai_suggest')),
        UI.el('div', { class: 'field' }, [ta]), err,
        UI.el('div', { class: 'flex-between', style: 'justify-content:flex-end;gap:10px' }, [
          UI.el('button', { class: 'btn btn-ghost', onclick: sclose }, I18n.t('ai_cancel')), ok
        ])
      ]);
      sb.appendChild(box); document.body.appendChild(sb);
      setTimeout(() => ta.focus(), 60);
      async function saveSuggest() {
        const text = (ta.value || '').trim();
        if (!text) { ta.focus(); return; }
        ok.disabled = true; ok.textContent = '…';
        try {
          const db = Auth.getDb();
          await db.collection('suggestions').add({
            text: text,
            name: ((Auth.member && Auth.member()) || {}).name || '',
            phone: (Auth.phone && Auth.phone()) || '',
            at: firebase.firestore.FieldValue.serverTimestamp()
          });
          sclose();
          addBubble(msgs, 'bot', I18n.t('ai_suggest_sent'));
        } catch (e) { err.textContent = e.message || 'Error'; ok.disabled = false; ok.textContent = I18n.t('ai_suggest_send'); }
      }
    }
  }

  function init() {
    ensureFab();
    try {
      if (window.firebase && firebase.auth) firebase.auth().onAuthStateChanged(() => {
        [400, 1500, 3000].forEach((d) => setTimeout(ensureFab, d));
      });
    } catch (e) {}
    window.addEventListener('hashchange', ensureFab);
    if (window.I18n && I18n.onChange) I18n.onChange(ensureFab);
  }

  window.AIAssistant = { refresh: ensureFab };
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
