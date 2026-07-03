/* ===========================================================
   Push notifications (FCM Web Push).
   - Registers this browser's FCM token in Firestore
     `fcmTokens/{uid}` = { uid, tokens:[...], updatedAt } once the
     member is approved AND has granted Notification permission
     (the ChatNotify bell toggle is the permission entry point).
   - window.Push.notify(payload) → asks the push worker to fan the
     notification out to the other members' devices (fire & forget;
     called by chat.js / dm.js after a message is sent).
   - Works on: Chrome/Android, desktop browsers, and iPhones with
     the app ADDED TO HOME SCREEN (iOS 16.4+). The native App Store
     shell will get APNs push in a later build (stage 2).
   =========================================================== */
(function () {
  const WORKER = 'https://aldewaniah-push.mulhaqdb.workers.dev';
  const VAPID = 'BFgMQ8ALE8LgrvwgjIC-zmumi7fdibcGDw7eFY2iRMcIW8nDIcx_R67xN8mOdiiVMxL40lYGQFlPi5Bj-LcaOFs';
  let registered = false;

  function supported() {
    try {
      return !!(window.firebase && firebase.messaging &&
        firebase.messaging.isSupported && firebase.messaging.isSupported() &&
        'serviceWorker' in navigator && 'Notification' in window) &&
        !(window.NativeShell && NativeShell.isNative());   // native shell = stage 2 (APNs)
    } catch (e) { return false; }
  }

  /* Save this browser's FCM token under the signed-in member. */
  async function register() {
    if (registered || !supported()) return;
    if (Notification.permission !== 'granted') return;
    const user = firebase.auth().currentUser;
    if (!user || !user.phoneNumber) return;
    try {
      // Dedicated SW for FCM (its own scope; doesn't touch the app-shell SW)
      const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js',
        { scope: '/firebase-cloud-messaging-push-scope' });
      const token = await firebase.messaging().getToken({
        vapidKey: VAPID, serviceWorkerRegistration: reg
      });
      if (!token) return;
      await firebase.firestore().collection('fcmTokens').doc(user.uid).set({
        uid: user.uid,
        tokens: firebase.firestore.FieldValue.arrayUnion(token),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      registered = true;
    } catch (e) {
      // invalid VAPID / unsupported browser / blocked — push simply stays off
      try { console.warn('push register failed:', e && e.message); } catch (x) {}
    }
  }

  /* Fan a notification out to other members (fire & forget). */
  async function notify(payload) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) return;
      const tk = await user.getIdToken();
      fetch(WORKER + '/notify', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  // Try on sign-in (covers members who already granted permission)…
  try {
    firebase.auth().onAuthStateChanged(function (user) {
      if (user && user.phoneNumber) setTimeout(register, 2500);
    });
  } catch (e) {}

  window.Push = { register: register, notify: notify, supported: supported };
})();
