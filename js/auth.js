/* ===========================================================
   Auth — member login via phone + SMS OTP (Firebase) with
   self-service join requests and an admin role.

   members/{phone(E.164)} = {
     name: string,
     status: 'pending' | 'approved',
     admin: boolean,
     createdAt: timestamp
   }
   - isMember()  -> status == 'approved'
   - isAdmin()   -> approved && admin == true
   New users verify their phone, enter a name, and a 'pending'
   request is created for an admin to approve/decline.
   =========================================================== */
(function () {
  let fbAuth = null, db = null, confirmation = null, recaptcha = null;
  let _status = null;      // null | 'pending' | 'approved'
  let _isAdmin = false;
  let _perms = {};         // co-admin permissions, e.g. { requests: true }
  let _member = null;      // { phone, name, status, admin, perms }

  // Permissions an admin can grant to a Co-Admin (extend this list later).
  const PERMS = ['requests'];

  I18n.extend({
    ar: {
      auth_login: 'دخول الأعضاء', auth_logout: 'خروج',
      auth_delete: '🗑️ حذف حسابي', auth_delete_confirm: 'سيتم حذف حسابك وملفك الشخصي وبيانات دخولك نهائيًا. هل أنت متأكد؟',
      auth_deleted: 'تم حذف حسابك. نأسف لمغادرتك 🌿', auth_delete_relogin: 'لأمان حسابك، سجّل الخروج ثم الدخول مرة أخرى وأعد المحاولة فورًا.',
      auth_privacy: 'سياسة الخصوصية', auth_terms: 'شروط الاستخدام',
      auth_title: 'دخول الأعضاء', auth_phone: 'رقم الجوال', auth_send: 'إرسال الرمز',
      auth_code: 'رمز التحقق', auth_verify: 'تأكيد',
      auth_sent: 'أرسلنا رمز تحقق إلى جوالك',
      auth_bad_code: 'الرمز غير صحيح، حاول مرة أخرى',
      auth_welcome: 'حياك الله', auth_disabled: 'لم يتم إعداد تسجيل الدخول بعد',
      auth_name: 'الاسم', auth_name_q: 'أدخل اسمك لطلب الانضمام',
      auth_submit_req: 'إرسال طلب الانضمام',
      auth_req_sent: 'تم إرسال طلبك، بانتظار موافقة المشرف ✅',
      auth_pending: 'قيد المراجعة',
      auth_pending_full: 'طلب انضمامك قيد مراجعة المشرف',
      auth_req_err: 'تعذّر إرسال الطلب، حاول مرة أخرى',
      auth_mode_phone: 'بالجوال', auth_mode_email: 'بالبريد',
      auth_email: 'البريد الإلكتروني', auth_password: 'كلمة المرور',
      auth_signin: 'تسجيل الدخول', auth_forgot: 'نسيت كلمة المرور؟',
      auth_reset_sent: 'أرسلنا رابط إعادة التعيين إلى بريدك ✅',
      auth_email_bad: 'بريد أو كلمة مرور غير صحيحة (٦ أحرف على الأقل)',
      auth_email_net: 'تعذّر تسجيل الدخول (مشكلة اتصال). تأكّد من الإنترنت وحاول مجددًا.',
      auth_account: 'حسابي', auth_link_email: 'اربط بريدًا إلكترونيًا لتسجيل الدخول به لاحقًا:',
      auth_link_btn: 'ربط البريد', auth_linked_as: 'البريد المرتبط',
      auth_reset_pw: 'إعادة تعيين كلمة المرور', auth_no_email: 'لا يوجد بريد مرتبط بعد',
      auth_link_err: 'تعذّر ربط البريد، تأكد من صحته أو سجّل خروجًا ودخولًا ثم حاول'
    },
    en: {
      auth_login: 'Member login', auth_logout: 'Sign out',
      auth_delete: '🗑️ Delete my account', auth_delete_confirm: 'This permanently deletes your account, profile and login. Are you sure?',
      auth_deleted: 'Your account was deleted. Sorry to see you go 🌿', auth_delete_relogin: 'For security, sign out and sign in again, then retry deletion right away.',
      auth_privacy: 'Privacy Policy', auth_terms: 'Terms of Use',
      auth_title: 'Member login', auth_phone: 'Mobile number', auth_send: 'Send code',
      auth_code: 'Verification code', auth_verify: 'Verify',
      auth_sent: 'We sent a code to your phone',
      auth_bad_code: 'Incorrect code, please try again',
      auth_welcome: 'Welcome', auth_disabled: 'Login is not set up yet',
      auth_name: 'Name', auth_name_q: 'Enter your name to request to join',
      auth_submit_req: 'Send join request',
      auth_req_sent: 'Request sent — awaiting admin approval ✅',
      auth_pending: 'Pending',
      auth_pending_full: 'Your join request is awaiting admin approval',
      auth_req_err: 'Could not send the request, please try again',
      auth_mode_phone: 'Phone', auth_mode_email: 'Email',
      auth_email: 'Email', auth_password: 'Password',
      auth_signin: 'Sign in', auth_forgot: 'Forgot password?',
      auth_reset_sent: 'We sent a reset link to your email ✅',
      auth_email_bad: 'Wrong email or password (min 6 chars)',
      auth_email_net: 'Could not sign in (connection issue). Check your internet and try again.',
      auth_account: 'My account', auth_link_email: 'Link an email to sign in with later:',
      auth_link_btn: 'Link email', auth_linked_as: 'Linked email',
      auth_reset_pw: 'Reset password', auth_no_email: 'No email linked yet',
      auth_link_err: "Couldn't link email; check it, or sign out and back in, then retry"
    }
  });

  function isConfigured() {
    const c = window.FIREBASE_CONFIG;
    return c && c.apiKey && c.apiKey.indexOf('PASTE') === -1;
  }

  function normalizePhone(raw) {
    let p = (raw || '').replace(/[\s-()]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (p.startsWith('966')) p = '+' + p;
    if (!p.startsWith('+')) {
      if (p.startsWith('0')) p = p.slice(1);
      p = (window.DEFAULT_COUNTRY_CODE || '+966') + p;
    }
    return p;
  }

  const Auth = {
    isMember() { return _status === 'approved'; },
    isAdmin() { return _isAdmin; },
    /** True if the signed-in member may do `perm` (admins can do everything). */
    can(perm) { return _isAdmin || (_status === 'approved' && _perms[perm] === true); },
    /** Admin OR a co-admin with at least one permission (sees the admin tab). */
    isStaff() { return _isAdmin || (_status === 'approved' && PERMS.some((p) => _perms[p] === true)); },
    role() { return _isAdmin ? 'admin' : (this.isStaff() ? 'coadmin' : (_status === 'approved' ? 'member' : null)); },
    perms() { return Object.assign({}, _perms); },
    permKeys() { return PERMS.slice(); },
    status() { return _status; },
    member() { return _member; },
    getDb() { return db; },
    phone() { return (fbAuth && fbAuth.currentUser && fbAuth.currentUser.phoneNumber) || null; },
    /** Firebase UID of the signed-in user — the identity used in all
        member-readable documents (phones stay private/admin-only). */
    uid() { return (fbAuth && fbAuth.currentUser && fbAuth.currentUser.uid) || null; },

    init() {
      if (!isConfigured() || !window.firebase) { this.renderBox(); return; }
      try {
        firebase.initializeApp(window.FIREBASE_CONFIG);
        fbAuth = firebase.auth();
        // Keep members signed in across app restarts / home-screen launches.
        try { fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
        db = firebase.firestore();
        fbAuth.onAuthStateChanged(async (user) => {
          // Guests use anonymous sign-in for the local buzzer — that is NOT a
          // member login, so ignore it (don't reset member state or re-render,
          // which would kick them out of whatever screen they're on).
          if (user && user.isAnonymous) return;
          const phone = user ? await memberPhoneOf(user) : null;
          if (phone) await resolve(phone);
          else reset();
          Auth.renderBox();
          if (window.App && App.refresh) App.refresh();
        });
      } catch (e) { /* already initialized */ }
      this.renderBox();
    },

    renderBox() {
      const box = document.getElementById('authBox');
      // The animated Dynamic-Island-style login pill in the header.
      const island = document.getElementById('islandLogin');
      if (island && !island._wired) {
        island._wired = true;
        island.onclick = () => Auth.openLogin();
      }
      if (!box) return;
      box.innerHTML = '';
      if (_status === 'approved') {
        const name = (_member && (_member.name || _member.phone)) || I18n.t('auth_welcome');
        box.appendChild(UI.el('button', { class: 'auth-btn', onclick: () => Auth.openAccount() },
          I18n.pick(name)));
        if (island) island.hidden = true;
      } else if (_status === 'pending') {
        box.appendChild(UI.el('button', { class: 'auth-btn auth-btn-pending', onclick: () => Auth.logout() },
          I18n.t('auth_pending') + ' · ' + I18n.t('auth_logout')));
        if (island) island.hidden = true;
      } else {
        // Signed out: the animated island pill IS the login call-to-action,
        // so keep the header corner clear to avoid a duplicate button.
        if (island) island.hidden = false;
      }
    },

    logout() {
      if (fbAuth) fbAuth.signOut();
      reset();
      this.renderBox();
      if (window.App && App.refresh) App.refresh();
    },

    openLogin() {
      if (!isConfigured()) { alert(I18n.t('auth_disabled')); return; }
      const backdrop = UI.el('div', { class: 'modal-backdrop' });
      const close = () => { backdrop.remove(); cleanupRecaptcha(); };
      backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
      const body = UI.el('div');
      // Inside the native iOS/Android shell (Capacitor) SMS/reCAPTCHA is unreliable,
      // so default to email login there; the website keeps phone login as default.
      // Robust native detection: the Capacitor bridge OR the capacitor:// origin
      // (Native.isNative() covers both, so the iOS shell always defaults to the
      // reliable email login even if the bridge object isn't ready yet).
      const inApp = (window.Native && Native.isNative && Native.isNative())
        || !!(window.Capacitor && (typeof Capacitor.isNativePlatform === 'function' ? Capacitor.isNativePlatform() : Capacitor.isNativePlatform))
        || (location.protocol === 'capacitor:');
      const tabPhone = UI.el('button', { class: 'auth-tab' + (inApp ? '' : ' active') }, I18n.t('auth_mode_phone'));
      const tabEmail = UI.el('button', { class: 'auth-tab' + (inApp ? ' active' : '') }, I18n.t('auth_mode_email'));
      tabPhone.onclick = () => { tabPhone.classList.add('active'); tabEmail.classList.remove('active'); phoneStep(body, close); };
      tabEmail.onclick = () => { tabEmail.classList.add('active'); tabPhone.classList.remove('active'); emailStep(body, close); };
      const tabs = UI.el('div', { class: 'auth-tabs' }, [tabPhone, tabEmail]);
      const modal = UI.el('div', { class: 'modal' }, [UI.el('h3', null, I18n.t('auth_title')), tabs, body]);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      if (inApp) emailStep(body, close); else phoneStep(body, close);
    },

    /** A signed-in member's account panel: link an email, reset it, sign out. */
    openAccount() {
      if (_status !== 'approved') { return; }
      const backdrop = UI.el('div', { class: 'modal-backdrop' });
      const close = () => backdrop.remove();
      backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
      const body = UI.el('div');
      const modal = UI.el('div', { class: 'modal' }, [UI.el('h3', null, I18n.t('auth_account')), body]);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      renderAccount(body, close);
    }
  };

  function reset() { _status = null; _isAdmin = false; _perms = {}; _member = null; }

  // Email the admin when someone requests to join. Sent from the joining
  // user's browser via FormSubmit (no backend), so it arrives even when the
  // admin's app is closed. (First time, the admin must click FormSubmit's
  // one-time activation email.)
  function notifyJoin(name, phone) {
    try {
      const email = (window.CONTENT && CONTENT.contact && CONTENT.contact.email) || 'Aziz@aldewaniah.com';
      fetch('https://formsubmit.co/ajax/' + encodeURIComponent(email), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: 'طلب انضمام جديد — الديوانية',
          'الاسم': name,
          'الجوال': phone,
          'الرسالة': name + ' يطلب الانضمام إلى الديوانية. افتح صفحة الإدارة للموافقة أو الرفض.',
          _captcha: 'false', _template: 'table'
        })
      }).catch(function () {});
    } catch (e) {}
  }

  /**
   * The member key (E.164 phone) for a signed-in Firebase user.
   *
   * Members are keyed by phone, but the App Review demo account signs in with
   * EMAIL/PASSWORD (SMS + reCAPTCHA is unreliable inside the iOS WKWebView).
   * In a webview, `user.phoneNumber` is frequently NOT populated on the first
   * onAuthStateChanged tick even though a phone provider is linked — so we
   * recover the number from the linked provider data, then the ID-token claim,
   * then a profile reload. Without this, an email login authenticates but never
   * resolves to its member doc, and the app looks like "sign-in failed".
   */
  async function memberPhoneOf(user) {
    if (!user) return null;
    if (user.phoneNumber) return user.phoneNumber;
    try {
      const fromProvider = (user.providerData || [])
        .map(function (p) { return p && p.phoneNumber; }).filter(Boolean)[0];
      if (fromProvider) return fromProvider;
    } catch (e) {}
    try {
      const tok = await user.getIdTokenResult();
      if (tok && tok.claims && tok.claims.phone_number) return tok.claims.phone_number;
    } catch (e) {}
    try { await user.reload(); if (user.phoneNumber) return user.phoneNumber; } catch (e) {}
    try {
      const u2 = fbAuth && fbAuth.currentUser;
      if (u2 && u2.phoneNumber) return u2.phoneNumber;
    } catch (e) {}
    return null;
  }

  async function resolve(phone) {
    try {
      const doc = await db.collection('members').doc(phone).get();
      if (doc.exists) {
        const d = doc.data();
        const approved = d.status === 'approved' || d.approved === true;
        _status = approved ? 'approved' : (d.status || 'pending');
        _isAdmin = approved && d.admin === true;
        _perms = approved ? (d.perms || {}) : {};
        _member = Object.assign({ phone }, d);
        // record a private phone -> uid map so the admin can push directory edits
        // (e.g. a name change) to this member's UID-keyed directory entry instantly.
        if (approved) {
          try { const u = fbAuth.currentUser; if (u && u.uid) db.collection('uidmap').doc(phone).set({ uid: u.uid }, { merge: true }).catch(function () {}); } catch (e) {}
        }
        return _status;
      }
    } catch (e) {}
    reset();
    return null;
  }

  function cleanupRecaptcha() {
    try { if (recaptcha) { recaptcha.clear(); recaptcha = null; } } catch (e) {}
  }

  /**
   * The native Firebase Authentication plugin, ONLY when we're in the iOS/Android
   * shell AND the plugin is actually installed. In the native app, Google's
   * reCAPTCHA (which the web signInWithPhoneNumber requires) cannot run, so SMS
   * login is impossible via the web SDK. This plugin verifies the device via
   * Apple Push (APNs) / Play Integrity instead — no reCAPTCHA — then we finish
   * the sign-in on the web SDK with the phone credential so the rest of the app
   * (which uses the web SDK everywhere) sees the member as signed in.
   * Returns null on the website / anywhere the plugin isn't present → web path.
   */
  function nativePhoneAuthPlugin() {
    try {
      const isNative = (window.Native && Native.isNative && Native.isNative())
        || (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())
        || (location.protocol === 'capacitor:');
      const plugin = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.FirebaseAuthentication;
      return (isNative && plugin) ? plugin : null;
    } catch (e) { return null; }
  }

  /**
   * Start phone verification and return a { confirm(code) -> userCredential }
   * object, identical in shape to what web signInWithPhoneNumber returns — so
   * codeStep() works unchanged for BOTH the native and the web paths.
   */
  async function startPhoneVerification(phone) {
    const FA = nativePhoneAuthPlugin();
    if (FA) {
      // ---- Native path (APNs silent-push verification, no reCAPTCHA) ----
      return await new Promise(function (resolve, reject) {
        let sentHandle = null, failHandle = null;
        const cleanup = function () {
          try { if (sentHandle && sentHandle.remove) sentHandle.remove(); } catch (e) {}
          try { if (failHandle && failHandle.remove) failHandle.remove(); } catch (e) {}
        };
        FA.addListener('phoneCodeSent', function (event) {
          const verificationId = event && event.verificationId;
          cleanup();
          resolve({
            confirm: async function (code) {
              const credential = firebase.auth.PhoneAuthProvider.credential(verificationId, (code || '').trim());
              return await fbAuth.signInWithCredential(credential);
            }
          });
        }).then(function (h) { sentHandle = h; });
        FA.addListener('phoneVerificationFailed', function (event) {
          cleanup();
          reject(new Error((event && (event.message || event.code)) || 'verification failed'));
        }).then(function (h) { failHandle = h; });
        // skipNativeAuth keeps the plugin from signing into the *native* SDK;
        // we complete on the web SDK above so the app's session stays on one SDK.
        FA.signInWithPhoneNumber({ phoneNumber: phone }).catch(function (e) { cleanup(); reject(e); });
      });
    }
    // ---- Web path (unchanged): invisible reCAPTCHA ----
    cleanupRecaptcha();
    recaptcha = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
    return await fbAuth.signInWithPhoneNumber(phone, recaptcha);
  }

  function phoneStep(body, close) {
    body.innerHTML = '';
    const input = UI.el('input', { class: 'fld', type: 'tel', inputmode: 'numeric',
      placeholder: '05XXXXXXXX', value: '' });
    const err = UI.el('p', { class: 'auth-err' });
    const btn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px' }, I18n.t('auth_send'));
    body.appendChild(UI.el('div', { class: 'field' }, [input]));
    body.appendChild(err); body.appendChild(btn);
    btn.onclick = async () => {
      err.textContent = '';
      const phone = normalizePhone(input.value);
      btn.disabled = true; btn.textContent = '…';
      try {
        confirmation = await startPhoneVerification(phone);
        codeStep(body, close, phone);
      } catch (e) {
        err.textContent = e.message || 'Error';
        btn.disabled = false; btn.textContent = I18n.t('auth_send');
        cleanupRecaptcha();
      }
    };
  }

  function codeStep(body, close, phone) {
    body.innerHTML = '';
    body.appendChild(UI.el('p', { class: 'muted' }, I18n.t('auth_sent') + ' (' + phone + ')'));
    const input = UI.el('input', { class: 'fld', type: 'text', inputmode: 'numeric',
      autocomplete: 'one-time-code', name: 'otp', maxlength: '6', placeholder: I18n.t('auth_code') });
    const err = UI.el('p', { class: 'auth-err' });
    const btn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px' }, I18n.t('auth_verify'));
    body.appendChild(UI.el('div', { class: 'field' }, [input]));
    body.appendChild(err); body.appendChild(btn);
    // Android: auto-read the SMS code via the WebOTP API (best-effort; harmless if unsupported)
    if ('OTPCredential' in window) {
      try {
        const _ac = new AbortController();
        navigator.credentials.get({ otp: { transport: ['sms'] }, signal: _ac.signal })
          .then((otp) => { if (otp && otp.code) { input.value = otp.code; btn.click(); } })
          .catch(() => {});
      } catch (e) {}
    }
    btn.onclick = async () => {
      err.textContent = '';
      btn.disabled = true; btn.textContent = '…';
      try {
        const cred = await confirmation.confirm(input.value.trim());
        const status = await resolve(cred.user.phoneNumber);
        if (status === 'approved' || status === 'pending') {
          // already known member or pending request
          close(); Auth.renderBox();
          if (window.App && App.refresh) App.refresh();
        } else {
          // brand new -> ask for name, create a pending request
          nameStep(body, close, cred.user.phoneNumber);
        }
      } catch (e) {
        err.textContent = I18n.t('auth_bad_code');
        btn.disabled = false; btn.textContent = I18n.t('auth_verify');
      }
    };
  }

  function nameStep(body, close, phone) {
    body.innerHTML = '';
    body.appendChild(UI.el('p', { class: 'muted' }, I18n.t('auth_name_q')));
    const input = UI.el('input', { class: 'fld', type: 'text', placeholder: I18n.t('auth_name') });
    const err = UI.el('p', { class: 'auth-err' });
    const btn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px' }, I18n.t('auth_submit_req'));
    body.appendChild(UI.el('div', { class: 'field' }, [input]));
    body.appendChild(err); body.appendChild(btn);
    setTimeout(() => input.focus(), 50);
    btn.onclick = async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      btn.disabled = true; btn.textContent = '…';
      try {
        await db.collection('members').doc(phone).set({
          name: name, status: 'pending', admin: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _status = 'pending';
        _member = { phone, name, status: 'pending', admin: false };
        notifyJoin(name, phone);
        body.innerHTML = '';
        body.appendChild(UI.el('p', { class: 'auth-ok' }, I18n.t('auth_req_sent')));
        body.appendChild(UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px',
          onclick: () => { close(); Auth.renderBox(); if (window.App && App.refresh) App.refresh(); } },
          I18n.t('close')));
      } catch (e) {
        err.textContent = I18n.t('auth_req_err');
        btn.disabled = false; btn.textContent = I18n.t('auth_submit_req');
      }
    };
  }

  // Sign in with a linked email + password (alternative to phone OTP).
  function emailStep(body, close) {
    body.innerHTML = '';
    const email = UI.el('input', { class: 'fld', type: 'email', placeholder: I18n.t('auth_email'), autocomplete: 'email' });
    const pass = UI.el('input', { class: 'fld', type: 'password', placeholder: I18n.t('auth_password'), autocomplete: 'current-password' });
    const err = UI.el('p', { class: 'auth-err' });
    const ok = UI.el('p', { class: 'auth-ok' });
    const btn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px' }, I18n.t('auth_signin'));
    const forgot = UI.el('button', { class: 'auth-link', style: 'margin-top:10px' }, I18n.t('auth_forgot'));
    body.appendChild(UI.el('div', { class: 'field' }, [email]));
    body.appendChild(UI.el('div', { class: 'field' }, [pass]));
    body.appendChild(err); body.appendChild(ok); body.appendChild(btn); body.appendChild(forgot);
    btn.onclick = async () => {
      err.textContent = ''; ok.textContent = '';
      btn.disabled = true; btn.textContent = '…';
      try {
        await fbAuth.signInWithEmailAndPassword((email.value || '').trim(), pass.value || '');
        close(); // onAuthStateChanged resolves the member + refreshes the app
      } catch (e) {
        // Show a clearer message for a blocked/again-network case vs a real
        // wrong-password, so misconfigurations surface instead of hiding as
        // "wrong password".
        const code = (e && (e.code || e.message || '')) + '';
        err.textContent = /referer|network|blocked|api-key|operation-not-allowed/i.test(code)
          ? I18n.t('auth_email_net') : I18n.t('auth_email_bad');
        btn.disabled = false; btn.textContent = I18n.t('auth_signin');
      }
    };
    forgot.onclick = async () => {
      err.textContent = ''; ok.textContent = '';
      const em = (email.value || '').trim();
      if (!em) { email.focus(); return; }
      try { await fbAuth.sendPasswordResetEmail(em); ok.textContent = I18n.t('auth_reset_sent'); }
      catch (e) { err.textContent = I18n.t('auth_email_bad'); }
    };
  }

  // Account panel for a signed-in member: link/reset email, sign out.
  function renderAccount(body, close) {
    body.innerHTML = '';
    const user = fbAuth && fbAuth.currentUser;
    const name = (_member && _member.name) || '';
    body.appendChild(UI.el('p', { class: 'muted' }, I18n.t('auth_welcome') + (name ? ' ' + name : '')));
    const err = UI.el('p', { class: 'auth-err' });
    const ok = UI.el('p', { class: 'auth-ok' });
    const emailProvider = user && (user.providerData || []).find((p) => p.providerId === 'password');
    const linkedEmail = (emailProvider && emailProvider.email) || (user && user.email) || null;

    if (linkedEmail) {
      body.appendChild(UI.el('div', { class: 'field' }, [
        UI.el('label', null, I18n.t('auth_linked_as')),
        UI.el('div', { class: 'muted' }, linkedEmail)
      ]));
      const reset = UI.el('button', { class: 'btn btn-block', style: 'margin-top:4px' }, I18n.t('auth_reset_pw'));
      reset.onclick = async () => {
        err.textContent = ''; ok.textContent = '';
        try { await fbAuth.sendPasswordResetEmail(linkedEmail); ok.textContent = I18n.t('auth_reset_sent'); }
        catch (e) { err.textContent = e.message || 'Error'; }
      };
      body.appendChild(reset);
    } else {
      body.appendChild(UI.el('p', { class: 'muted', style: 'margin-top:4px' }, I18n.t('auth_link_email')));
      const email = UI.el('input', { class: 'fld', type: 'email', placeholder: I18n.t('auth_email'), autocomplete: 'email' });
      const pass = UI.el('input', { class: 'fld', type: 'password', placeholder: I18n.t('auth_password'), autocomplete: 'new-password' });
      body.appendChild(UI.el('div', { class: 'field' }, [email]));
      body.appendChild(UI.el('div', { class: 'field' }, [pass]));
      const link = UI.el('button', { class: 'btn btn-block' }, I18n.t('auth_link_btn'));
      link.onclick = async () => {
        err.textContent = ''; ok.textContent = '';
        const em = (email.value || '').trim(), pw = pass.value || '';
        if (!em || pw.length < 6) { err.textContent = I18n.t('auth_email_bad'); return; }
        link.disabled = true; link.textContent = '…';
        try {
          const cred = firebase.auth.EmailAuthProvider.credential(em, pw);
          await user.linkWithCredential(cred);
          renderAccount(body, close); // refresh -> now shows the linked email + reset
        } catch (e) { err.textContent = I18n.t('auth_link_err'); link.disabled = false; link.textContent = I18n.t('auth_link_btn'); }
      };
      body.appendChild(link);
    }
    body.appendChild(err); body.appendChild(ok);
    body.appendChild(UI.el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:14px',
      onclick: () => { close(); Auth.logout(); } }, I18n.t('auth_logout')));

    // Delete account + personal data (required by App Store / Google Play).
    const del = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px;background:var(--maroon);color:#fff' }, I18n.t('auth_delete'));
    del.onclick = async () => {
      err.textContent = ''; ok.textContent = '';
      if (!window.confirm(I18n.t('auth_delete_confirm'))) return;
      const u = fbAuth && fbAuth.currentUser;
      if (!u) { err.textContent = 'Error'; return; }
      const phone = u.phoneNumber || (_member && _member.phone) || '';
      del.disabled = true; del.textContent = '…';
      try {
        if (u.uid) { try { await db.collection('directory').doc(u.uid).delete(); } catch (e) {} }
        if (phone) {
          try { await db.collection('members').doc(phone).delete(); } catch (e) {}
          try { await db.collection('uidmap').doc(phone).delete(); } catch (e) {}
        }
        await u.delete();                 // remove the login itself
        close(); reset(); Auth.renderBox();
        if (window.App && App.refresh) App.refresh();
        alert(I18n.t('auth_deleted'));
      } catch (e) {
        if (e && e.code === 'auth/requires-recent-login') err.textContent = I18n.t('auth_delete_relogin');
        else err.textContent = e.message || 'Error';
        del.disabled = false; del.textContent = I18n.t('auth_delete');
      }
    };
    body.appendChild(del);

    body.appendChild(UI.el('div', { class: 'muted', style: 'margin-top:14px;text-align:center;font-size:.84rem' }, [
      UI.el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, I18n.t('auth_privacy')),
      '  ·  ',
      UI.el('a', { href: 'terms.html', target: '_blank', rel: 'noopener' }, I18n.t('auth_terms'))
    ]));
  }

  window.Auth = Auth;
  if (document.readyState !== 'loading') Auth.init();
  else document.addEventListener('DOMContentLoaded', () => Auth.init());
})();
