/* ===========================================================
   Sections (الأقسام) — a container tab that groups sub-features
   (Gallery, Baloot calculator, …) behind one bottom-nav entry.

   Other files register a sub-section with:
     Sections.add({ id, title:{ar,en}, subtitle:{ar,en}, icon,
                    memberOnly?, strings?, render(view) });
   This file must load BEFORE those sub-section files.
   =========================================================== */
(function () {
  const subs = [];

  window.Sections = {
    add(s) {
      if (!s || !s.id) return;
      if (s.strings) I18n.extend(s.strings);
      subs.push(s);
    },
    list() { return subs.slice(); }
  };

  const lockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
  const backSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>';

  App.registerModule({
    id: 'sections',
    title: { ar: 'الأقسام', en: 'Sections' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    strings: {
      ar: { sec_title: 'الأقسام', sec_sub: 'كل أقسام الديوانية في مكان واحد', sec_back: 'رجوع', sec_members: 'للأعضاء' },
      en: { sec_title: 'Sections', sec_sub: 'Everything in one place', sec_back: 'Back', sec_members: 'Members' }
    },

    render(view) {
      grid(view);
    }
  });

  function isMember() { return !!(window.Auth && Auth.isMember && Auth.isMember()); }

  function grid(view) {
    view.appendChild(UI.pageTitle(I18n.t('sec_title'), I18n.t('sec_sub')));
    const wrap = UI.el('div', { class: 'sec-grid' });
    Sections.list().forEach((s) => {
      const locked = s.memberOnly && !isMember();
      const card = UI.el('button', { class: 'sec-card', onclick: () => open(view, s) }, [
        UI.el('div', { class: 'sec-icon', html: s.icon }),
        UI.el('div', { class: 'sec-name' }, I18n.pick(s.title)),
        s.subtitle ? UI.el('div', { class: 'sec-desc' }, I18n.pick(s.subtitle)) : null,
        locked ? UI.el('span', { class: 'sec-badge', html: lockSvg + '<span>' + I18n.t('sec_members') + '</span>' }) : null
      ]);
      wrap.appendChild(card);
    });
    view.appendChild(wrap);
  }

  function open(view, s) {
    view.innerHTML = '';
    view.appendChild(UI.el('button', { class: 'sec-back', onclick: () => { view.innerHTML = ''; grid(view); } },
      [UI.el('span', { class: 'sec-back-ic', html: backSvg }), I18n.t('sec_back')]));
    s.render(view);
  }
})();
