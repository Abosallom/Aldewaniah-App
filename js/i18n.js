/* ===========================================================
   i18n — bilingual Arabic (RTL) / English (LTR)
   Add a feature module's strings via I18n.extend({ ar:{}, en:{} })
   =========================================================== */
(function () {
  const STORE_KEY = 'aldewaniah.lang';

  const dict = {
    ar: {
      appName: 'الديوانية',
      nav_feed: 'المستجدات',
      nav_events: 'المناسبات',
      nav_members: 'الأعضاء',
      cancel: 'إلغاء',
      save: 'حفظ',
      add: 'إضافة',
      delete: 'حذف',
      confirmDelete: 'هل تريد الحذف؟',
      empty_generic: 'لا يوجد شيء هنا بعد'
    },
    en: {
      appName: 'Al Dewaniah',
      nav_feed: 'Updates',
      nav_events: 'Events',
      nav_members: 'Members',
      cancel: 'Cancel',
      save: 'Save',
      add: 'Add',
      delete: 'Delete',
      confirmDelete: 'Delete this item?',
      empty_generic: 'Nothing here yet'
    }
  };

  let lang = localStorage.getItem(STORE_KEY) || 'ar';
  const listeners = [];

  const I18n = {
    get lang() { return lang; },
    get dir() { return lang === 'ar' ? 'rtl' : 'ltr'; },

    /** Translate a key for the current language. */
    t(key) {
      return (dict[lang] && dict[lang][key]) || (dict.ar[key]) || key;
    },

    /** Pick a value from a {ar, en} object (used for user content/labels). */
    pick(obj) {
      if (obj == null) return '';
      if (typeof obj === 'string') return obj;
      return obj[lang] || obj.ar || obj.en || '';
    },

    /** Modules register their own strings here. */
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

    /** Update <html> attributes and any [data-i18n] nodes. */
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
