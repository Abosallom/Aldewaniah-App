/* ===========================================================
   FCM background service worker — shows push notifications when
   the app/tab is closed. Separate from sw.js (the app-shell
   cache); FCM registers this one under its own scope.
   =========================================================== */
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCtPQtuEsFymPAQRvRvhX_UWb_6CU5D6iU",
  authDomain: "aldewaniah-45158.firebaseapp.com",
  projectId: "aldewaniah-45158",
  storageBucket: "aldewaniah-45158.firebasestorage.app",
  messagingSenderId: "1002479285436",
  appId: "1:1002479285436:web:841e3da933cc94943cccb9"
});

// Messages carrying a `notification` payload are displayed
// automatically by the browser using the webpush options set by
// the push worker (icon, rtl, tag, click link).
firebase.messaging();
