/* ===========================================================
   Feature module: Contact (اتصل بنا)
   =========================================================== */
(function () {
  App.registerModule({
    id: 'contact',
    title: { ar: 'اتصل بنا', en: 'Contact' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    strings: {
      ar: { con_title: 'اتصل بنا', con_sub: 'تواصل معنا في أي وقت', con_email: 'البريد الإلكتروني' },
      en: { con_title: 'Contact us', con_sub: 'Reach us anytime', con_email: 'Email' }
    },

    render(view) {
      view.appendChild(UI.pageTitle(I18n.t('con_title'), I18n.t('con_sub')));
      const email = (window.CONTENT && CONTENT.contact.email) || '';

      view.appendChild(UI.el('div', { class: 'card' }, [
        UI.el('div', { class: 'card-meta' }, I18n.t('con_email')),
        UI.el('a', { class: 'contact-email', href: 'mailto:' + email }, email)
      ]));

      view.appendChild(UI.el('footer', { class: 'site-footer' }, I18n.t('rights')));
    }
  });
})();
