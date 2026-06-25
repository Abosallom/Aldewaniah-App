/* ===========================================================
   Join-request notifications (admins / co-admins with the
   'requests' permission). Listens in real time to pending
   members and:
   - shows a count badge on the الإدارة tab,
   - fires a system notification + vibrate when a NEW request
     arrives while the app is open (foreground or background tab).

   NOTE: this works whenever the app is running. Alerts when the
   app is fully closed require Firebase Cloud Messaging + a Cloud
   Function (not enabled here).
   =========================================================== */
(function () {
  if (!window.firebase) return;

  I18n.extend({
    ar: { ntf_title: 'طلب انضمام جديد', ntf_body: 'يطلب الانضمام إلى الديوانية', ntf_enable: '🔔 تفعيل تنبيهات الطلبات', ntf_on: 'التنبيهات مفعّلة ✓' },
    en: { ntf_title: 'New join request', ntf_body: 'wants to join Al Dewaniah', ntf_enable: '🔔 Enable request alerts', ntf_on: 'Alerts enabled ✓' }
  });

  let unsub = null, firstLoad = true;

  function notify(name) {
    try {
      if (window.Notification && Notification.permission === 'granted') {
        const n = new Notification(I18n.t('ntf_title'), {
          body: (name || '') + ' ' + I18n.t('ntf_body'),
          icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: 'join-' + name
        });
        n.onclick = () => { try { window.focus(); location.hash = 'admin'; n.close(); } catch (e) {} };
      }
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
  }

  function start() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    firstLoad = true;
    let db; try { db = firebase.firestore(); } catch (e) { return; }
    // Rules allow this query only for admins / co-admins (list if canRequests());
    // for everyone else it errors and we simply stop.
    unsub = db.collection('members').where('status', '==', 'pending')
      .onSnapshot((snap) => {
        if (window.App && App.setNavBadge) App.setNavBadge('admin', snap.size);
        if (!firstLoad) {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'added') { const d = ch.doc.data() || {}; notify(d.name || d.phone || ''); }
          });
        }
        firstLoad = false;
      }, () => { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } if (window.App && App.setNavBadge) App.setNavBadge('admin', 0); });
  }

  firebase.auth().onAuthStateChanged((user) => {
    if (user && user.phoneNumber) start();   // members only (anon guests skip)
    else { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } if (window.App && App.setNavBadge) App.setNavBadge('admin', 0); }
  });
})();
