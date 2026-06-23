/* ===========================================================
   Auth — member login via phone number + SMS OTP (Firebase).
   Only phone numbers present in the Firestore "members" collection
   (the "active directory") are allowed in. Login gates member-only
   areas via Auth.isMember().
   =========================================================== */
(function () {
  let fbAuth = null, db = null, confirmation = null, recaptcha = null;
  let _isMember = false, _member = null;

  I18n.extend({
    ar: {
      auth_login: 'دخول الأعضاء', auth_logout: 'خروج',
      auth_title: 'دخول الأعضاء', auth_phone: 'رقم الجوال', auth_send: 'إرسال الرمز',
      auth_code: 'رمز التحقق', auth_verify: 'تأكيد', auth_resend: 'إعادة الإرسال',
      auth_sent: 'أرسلنا رمز تحقق إلى جوالك',
      auth_denied: 'هذا الرقم غير مسجل ضمن أعضاء الديوانية',
      auth_bad_code: 'الرمز غير صحيح، حاول مرة أخرى',
      auth_welcome: 'حياك الله',
      auth_disabled: 'لم يتم إعداد تسجيل الدخول بعد'
    },
    en: {
      auth_login: 'Member login', auth_logout: 'Sign out',
      auth_title: 'Member login', auth_phone: 'Mobile number', auth_send: 'Send code',
      auth_code: 'Verification code', auth_verify: 'Verify', auth_resend: 'Resend',
      auth_sent: 'We sent a code to your phone',
      auth_denied: 'This number is not registered as an Al Dewaniah member',
      auth_bad_code: 'Incorrect code, please try again',
      auth_welcome: 'Welcome',
      auth_disabled: 'Login is not set up yet'
    }
  });

  function isConfigured() {
    const c = window.FIREBASE_CONFIG;
    return c && c.apiKey && c.apiKey.indexOf('PASTE') === -1;
  }

  function normalizePhone(raw) {
    let p = (raw || '').replace(/[\s-()]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (!p.startsWith('+')) {
      if (p.startsWith('0')) p = p.slice(1);
      p = (window.DEFAULT_COUNTRY_CODE || '+966') + p;
    }
    return p;
  }

  const Auth = {
    isMember() { return _isMember; },
    member() { return _member; },

    init() {
      if (!isConfigured() || !window.firebase) { this.renderBox(); return; }
      try {
        firebase.initializeApp(window.FIREBASE_CONFIG);
        fbAuth = firebase.auth();
        db = firebase.firestore();
        fbAuth.onAuthStateChanged(async (user) => {
          if (user && user.phoneNumber) {
            await verifyMembership(user.phoneNumber);
          } else {
            _isMember = false; _member = null;
          }
          Auth.renderBox();
          if (window.App && App.refresh) App.refresh();
        });
      } catch (e) { /* already initialized or config error */ }
      this.renderBox();
    },

    renderBox() {
      const box = document.getElementById('authBox');
      if (!box) return;
      box.innerHTML = '';
      if (_isMember) {
        const name = (_member && (_member.name || _member.phone)) || I18n.t('auth_welcome');
        box.appendChild(UI.el('button', { class: 'auth-btn', onclick: () => Auth.logout() },
          I18n.pick(name) + ' · ' + I18n.t('auth_logout')));
      } else {
        box.appendChild(UI.el('button', { class: 'auth-btn', onclick: () => Auth.openLogin() },
          I18n.t('auth_login')));
      }
    },

    logout() {
      if (fbAuth) fbAuth.signOut();
      _isMember = false; _member = null;
      this.renderBox();
      if (window.App && App.refresh) App.refresh();
    },

    openLogin() {
      if (!isConfigured()) { alert(I18n.t('auth_disabled')); return; }
      const backdrop = UI.el('div', { class: 'modal-backdrop' });
      const close = () => { backdrop.remove(); cleanupRecaptcha(); };
      backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
      const body = UI.el('div');
      const modal = UI.el('div', { class: 'modal' }, [
        UI.el('h3', null, I18n.t('auth_title')), body
      ]);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      phoneStep(body, close);
    }
  };

  function cleanupRecaptcha() {
    try { if (recaptcha) { recaptcha.clear(); recaptcha = null; } } catch (e) {}
  }

  function phoneStep(body, close) {
    body.innerHTML = '';
    const input = UI.el('input', { class: 'fld', type: 'tel',
      placeholder: I18n.t('auth_phone'), value: window.DEFAULT_COUNTRY_CODE || '+966' });
    const err = UI.el('p', { class: 'auth-err' });
    const btn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px' }, I18n.t('auth_send'));
    body.appendChild(UI.el('div', { class: 'field' }, [input]));
    body.appendChild(err);
    body.appendChild(btn);
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
      placeholder: I18n.t('auth_code') });
    const err = UI.el('p', { class: 'auth-err' });
    const btn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px' }, I18n.t('auth_verify'));
    body.appendChild(UI.el('div', { class: 'field' }, [input]));
    body.appendChild(err);
    body.appendChild(btn);
    btn.onclick = async () => {
      err.textContent = '';
      btn.disabled = true; btn.textContent = '…';
      try {
        const cred = await confirmation.confirm(input.value.trim());
        const ok = await verifyMembership(cred.user.phoneNumber);
        if (ok) {
          close(); Auth.renderBox();
          if (window.App && App.refresh) App.refresh();
        } else {
          err.textContent = I18n.t('auth_denied');
          await fbAuth.signOut();
          _isMember = false; _member = null;
          btn.disabled = false; btn.textContent = I18n.t('auth_verify');
        }
      } catch (e) {
        err.textContent = I18n.t('auth_bad_code');
        btn.disabled = false; btn.textContent = I18n.t('auth_verify');
      }
    };
  }

  async function verifyMembership(phone) {
    if (!db) return false;
    try {
      const doc = await db.collection('members').doc(phone).get();
      if (doc.exists && doc.data().approved !== false) {
        _isMember = true;
        _member = Object.assign({ phone }, doc.data());
        return true;
      }
    } catch (e) {}
    _isMember = false; _member = null;
    return false;
  }

  window.Auth = Auth;
  if (document.readyState !== 'loading') Auth.init();
  else document.addEventListener('DOMContentLoaded', () => Auth.init());
})();
