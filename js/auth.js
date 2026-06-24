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
  let _member = null;      // { phone, name, status, admin }

  I18n.extend({
    ar: {
      auth_login: 'دخول الأعضاء', auth_logout: 'خروج',
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
      auth_req_err: 'تعذّر إرسال الطلب، حاول مرة أخرى'
    },
    en: {
      auth_login: 'Member login', auth_logout: 'Sign out',
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
      auth_req_err: 'Could not send the request, please try again'
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
    status() { return _status; },
    member() { return _member; },
    getDb() { return db; },
    phone() { return (fbAuth && fbAuth.currentUser && fbAuth.currentUser.phoneNumber) || null; },

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
          if (user && user.phoneNumber) await resolve(user.phoneNumber);
          else reset();
          Auth.renderBox();
          if (window.App && App.refresh) App.refresh();
        });
      } catch (e) { /* already initialized */ }
      this.renderBox();
    },

    renderBox() {
      const box = document.getElementById('authBox');
      if (!box) return;
      box.innerHTML = '';
      if (_status === 'approved') {
        const name = (_member && (_member.name || _member.phone)) || I18n.t('auth_welcome');
        box.appendChild(UI.el('button', { class: 'auth-btn', onclick: () => Auth.logout() },
          I18n.pick(name) + ' · ' + I18n.t('auth_logout')));
      } else if (_status === 'pending') {
        box.appendChild(UI.el('button', { class: 'auth-btn auth-btn-pending', onclick: () => Auth.logout() },
          I18n.t('auth_pending') + ' · ' + I18n.t('auth_logout')));
      } else {
        box.appendChild(UI.el('button', { class: 'auth-btn', onclick: () => Auth.openLogin() },
          I18n.t('auth_login')));
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
      const modal = UI.el('div', { class: 'modal' }, [UI.el('h3', null, I18n.t('auth_title')), body]);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      phoneStep(body, close);
    }
  };

  function reset() { _status = null; _isAdmin = false; _member = null; }

  async function resolve(phone) {
    try {
      const doc = await db.collection('members').doc(phone).get();
      if (doc.exists) {
        const d = doc.data();
        const approved = d.status === 'approved' || d.approved === true;
        _status = approved ? 'approved' : (d.status || 'pending');
        _isAdmin = approved && d.admin === true;
        _member = Object.assign({ phone }, d);
        return _status;
      }
    } catch (e) {}
    reset();
    return null;
  }

  function cleanupRecaptcha() {
    try { if (recaptcha) { recaptcha.clear(); recaptcha = null; } } catch (e) {}
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
        cleanupRecaptcha();
        recaptcha = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
        confirmation = await fbAuth.signInWithPhoneNumber(phone, recaptcha);
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

  window.Auth = Auth;
  if (document.readyState !== 'loading') Auth.init();
  else document.addEventListener('DOMContentLoaded', () => Auth.init());
})();
