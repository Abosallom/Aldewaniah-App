/* ===========================================================
   Feature module: Home — welcome hero + "share your idea" form
   Mirrors the aldewaniah.com landing page.
   =========================================================== */
(function () {
  App.registerModule({
    id: 'home',
    title: { ar: 'الرئيسية', en: 'Home' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    strings: {
      ar: {
        home_welcome: 'حياك الله في الديوانية',
        home_idea_q: 'عندك فكرة؟ شاركنا اياها',
        home_phone: 'رقم الجوال',
        home_msg: 'الطلب أو المقترح',
        home_thanks: 'شكراً لك! يفتح برنامج البريد لإرسال مقترحك.'
      },
      en: {
        home_welcome: 'Welcome to Al Dewaniah',
        home_idea_q: 'Got an idea? Share it with us',
        home_phone: 'Mobile number',
        home_msg: 'Request or suggestion',
        home_thanks: 'Thank you! Your email app will open to send the suggestion.'
      }
    },

    render(view) {
      // Hero
      const hero = UI.el('section', { class: 'hero' }, [
        UI.el('img', { class: 'hero-logo', src: 'assets/icon.svg', alt: I18n.t('appName') }),
        UI.el('h1', { class: 'hero-title' }, I18n.t('home_welcome')),
        UI.el('p', { class: 'hero-tagline' }, I18n.t('tagline'))
      ]);
      view.appendChild(hero);

      // Idea form
      const form = UI.el('form', { class: 'idea-form' });
      form.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('home_idea_q')));

      const phone = UI.el('input', { class: 'fld', type: 'tel', name: 'phone',
        placeholder: I18n.t('home_phone'), required: 'true' });
      const msg = UI.el('textarea', { class: 'fld', name: 'msg',
        placeholder: I18n.t('home_msg'), required: 'true' });
      const submit = UI.el('button', { class: 'btn btn-block', type: 'submit' }, I18n.t('send'));

      form.appendChild(UI.el('div', { class: 'field' }, [phone]));
      form.appendChild(UI.el('div', { class: 'field' }, [msg]));
      form.appendChild(submit);

      form.onsubmit = (e) => {
        e.preventDefault();
        const email = (window.CONTENT && CONTENT.contact.email) || '';
        const subject = encodeURIComponent('فكرة / مقترح للديوانية');
        const body = encodeURIComponent(`${I18n.t('home_phone')}: ${phone.value}\n\n${msg.value}`);
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        form.reset();
        alert(I18n.t('home_thanks'));
      };

      view.appendChild(form);
    }
  });
})();
