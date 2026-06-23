/* ===========================================================
   Feature module: Gallery (مكتبة الصور) — members-only.
   On the current site this is a password-protected area.
   For now it shows a "members only" state; once Firebase OTP
   login is added, this unlocks for signed-in members and the
   photos render from the members store.
   =========================================================== */
(function () {
  App.registerModule({
    id: 'gallery',
    title: { ar: 'مكتبة الصور', en: 'Gallery' },
    memberOnly: true,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5L5 19"/></svg>',
    strings: {
      ar: {
        gal_title: 'مكتبة الصور',
        gal_sub: 'صور الرحلات ومنوعات أخرى',
        gal_locked: 'هذا القسم للأعضاء فقط',
        gal_locked_sub: 'سيتم تفعيل الدخول برقم الجوال قريباً. عند الدخول كعضو ستظهر الصور هنا.',
        gal_empty: 'لا توجد صور بعد'
      },
      en: {
        gal_title: 'Photo Gallery',
        gal_sub: 'Trip photos and more',
        gal_locked: 'This section is for members only',
        gal_locked_sub: 'Phone-number login is coming soon. Once you sign in as a member, photos will appear here.',
        gal_empty: 'No photos yet'
      }
    },

    render(view) {
      view.appendChild(UI.pageTitle(I18n.t('gal_title'), I18n.t('gal_sub')));

      // Auth hook: when Firebase OTP login is added, Auth.isMember() gates this.
      const signedIn = window.Auth && Auth.isMember && Auth.isMember();
      if (!signedIn) {
        view.appendChild(UI.el('div', { class: 'locked' }, [
          UI.el('div', { class: 'locked-icon', html:
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>' }),
          UI.el('h3', { class: 'locked-title' }, I18n.t('gal_locked')),
          UI.el('p', { class: 'muted' }, I18n.t('gal_locked_sub'))
        ]));
        return;
      }

      // Signed in: render photos (placeholder until store/back end is wired)
      view.appendChild(UI.empty(I18n.t('gal_empty')));
    }
  });
})();
