/* ===========================================================
   Chat notifications — available to EVERY member.
   A member can turn on alerts (from the Chat tab's bell button);
   then, while the app is open, any new message from someone else
   fires a system notification + vibrate — unless they're already
   looking at the Chat tab.

   window.ChatNotify.enabled()  -> bool
   window.ChatNotify.toggle(cb) -> flips the setting (asks permission)

   NOTE: like the admin alerts, this works whenever the app is
   running (foreground/background tab). Alerts when the app is fully
   closed would need Firebase Cloud Messaging + a Cloud Function.
   =========================================================== */
(function () {
  if (!window.firebase) return;
  const KEY = 'aldewaniah.chatNotif';

  function flag() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function granted() { return !!(window.Notification && Notification.permission === 'granted'); }

  const ChatNotify = {
    enabled() { return flag() && granted(); },
    toggle(cb) {
      if (this.enabled()) {                       // turn off
        try { localStorage.setItem(KEY, '0'); } catch (e) {}
        if (cb) cb(false); return;
      }
      const set = (ok) => {
        try { localStorage.setItem(KEY, ok ? '1' : '0'); } catch (e) {}
        // permission granted → also register this device for closed-app push
        if (ok && granted() && window.Push && Push.register) { try { Push.register(); } catch (e) {} }
        if (cb) cb(ok && granted());
      };
      try {
        if (!window.Notification) { set(false); return; }
        if (Notification.permission === 'granted') { set(true); return; }
        Notification.requestPermission().then((p) => set(p === 'granted')).catch(() => set(false));
      } catch (e) { set(false); }
    }
  };
  window.ChatNotify = ChatNotify;

  function onChatView() {
    try { return (location.hash || '').replace('#', '') === 'chat' && !document.hidden; } catch (e) { return false; }
  }
  function notify(name, m) {
    if (!ChatNotify.enabled() || onChatView()) return;
    try {
      const body = (m.text && m.text.trim()) ? m.text : (m.image ? '📷 صورة' : '…');
      const n = new Notification(name || I18n.t('ch_title') || 'الدردشة', {
        body: body, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: 'chat-msg'
      });
      n.onclick = () => { try { window.focus(); location.hash = 'chat'; n.close(); } catch (e) {} };
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([90, 50, 90]); } catch (e) {}
  }

  let unsub = null, firstLoad = true, myPhone = '', myUid = '';
  function start(phone, uid) {
    myPhone = phone || ''; myUid = uid || '';
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    firstLoad = true;
    let db; try { db = firebase.firestore(); } catch (e) { return; }
    unsub = db.collection('messages').orderBy('at', 'desc').limit(15).onSnapshot((snap) => {
      if (!firstLoad) {
        snap.docChanges().forEach((ch) => {
          if (ch.type !== 'added') return;
          const m = ch.doc.data() || {};
          if (m.uid && m.uid === myUid) return;             // not my own messages
          if (m.phone && m.phone === myPhone) return;       // (legacy messages)
          notify(m.name || '', m);
        });
      }
      firstLoad = false;
    }, () => { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } });
  }

  firebase.auth().onAuthStateChanged((user) => {
    if (user && user.phoneNumber) start(user.phoneNumber, user.uid);   // members only
    else { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } }
  });
})();
