/* ===========================================================
   i18n — bilingual Arabic (RTL, primary) / English (LTR)
   Modules add their own strings via I18n.extend({ ar:{}, en:{} })
   =========================================================== */
(function () {
  const STORE_KEY = 'aldewaniah.lang';

  const dict = {
    ar: {
      appName: 'الديوانية',
      tagline: 'شد حلة خويك لو بسروالك',
      nav_home: 'الرئيسية',
      nav_tournaments: 'البطولات',
      nav_gallery: 'مكتبة الصور',
      nav_contact: 'اتصل بنا',
      cancel: 'إلغاء',
      close: 'إغلاق',
      send: 'أرسل',
      rights: 'جميع الحقوق محفوظة للديوانية. 2026©'
    },
    en: {
      appName: 'Al Dewaniah',
      tagline: 'Gather your folks — come as you are',
      nav_home: 'Home',
      nav_tournaments: 'Tournaments',
      nav_gallery: 'Gallery',
      nav_contact: 'Contact',
      cancel: 'Cancel',
      close: 'Close',
      send: 'Send',
      rights: '© 2026 Al Dewaniah. All rights reserved.'
    }
  };

  let lang = localStorage.getItem(STORE_KEY) || 'ar';
  const listeners = [];

  const I18n = {
    get lang() { return lang; },
    get dir() { return lang === 'ar' ? 'rtl' : 'ltr'; },

    t(key) { return (dict[lang] && dict[lang][key]) || dict.ar[key] || key; },

    pick(obj) {
      if (obj == null) return '';
      if (typeof obj === 'string') return obj;
      return obj[lang] || obj.ar || obj.en || '';
    },

    extend(strings) {
      Object.keys(strings).forEach((lng) => {
        dict[lng] = Object.assign(dict[lng] || {}, strings[lng]);
      });
    },

    set(next) {
      lang = next;
      localStorage.setItem(STORE_KEY, lang);
      this.apply();
      listeners.forEach((fn) => fn(lang));
    },

    toggle() { this.set(lang === 'ar' ? 'en' : 'ar'); },
    onChange(fn) { listeners.push(fn); },

    apply() {
      document.documentElement.lang = lang;
      document.documentElement.dir = this.dir;
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = this.t(el.getAttribute('data-i18n'));
      });
      const toggle = document.getElementById('langToggle');
      if (toggle) toggle.textContent = lang === 'ar' ? 'EN' : 'ع';
    }
  };

  window.I18n = I18n;
})();
