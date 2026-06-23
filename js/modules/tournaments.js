/* ===========================================================
   Feature module: Tournaments — Ramadan Baloot tournaments.
   Lists every tournament from content.js and shows its live
   bracket (embedded from Challonge / BracketHQ) so standings
   stay in sync with the bracket service.
   =========================================================== */
(function () {
  App.registerModule({
    id: 'tournaments',
    title: { ar: 'البطولات', en: 'Tournaments' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h12v3a6 6 0 01-12 0V4z"/><path d="M9 14h6M10 18h4M12 14v4"/><path d="M6 5H3v1a3 3 0 003 3M18 5h3v1a3 3 0 01-3 3"/></svg>',
    strings: {
      ar: {
        trn_title: 'لوحة الترتيب للبطولات',
        trn_sub: 'أختر الفئة اللي تبيها',
        trn_view: 'عرض الجدول',
        trn_empty: 'لا توجد بطولات بعد'
      },
      en: {
        trn_title: 'Tournament Standings',
        trn_sub: 'Choose the tournament you want',
        trn_view: 'View bracket',
        trn_empty: 'No tournaments yet'
      }
    },

    render(view) {
      view.appendChild(UI.pageTitle(I18n.t('trn_title'), I18n.t('trn_sub')));

      const list = (window.CONTENT && CONTENT.tournaments) || [];
      if (!list.length) { view.appendChild(UI.empty(I18n.t('trn_empty'))); return; }

      const grid = UI.el('div', { class: 'trn-grid' });
      list.forEach((t) => {
        const badge = UI.el('span', { class: 'chip' + (t.current ? '' : ' chip-blue') }, I18n.pick(t.status));
        const card = UI.el('button', { class: 'trn-card', onclick: () => openBracket(t) }, [
          UI.el('div', { class: 'trn-card-suits', html:
            '<span class="suit red">&#9829;</span><span class="suit">&#9824;</span><span class="suit red">&#9830;</span><span class="suit">&#9827;</span>' }),
          UI.el('div', { class: 'trn-card-name' }, I18n.pick(t.name)),
          badge,
          UI.el('span', { class: 'trn-card-cta' }, I18n.t('trn_view') + ' ←')
        ]);
        grid.appendChild(card);
      });
      view.appendChild(grid);

      function openBracket(t) {
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

        const head = UI.el('div', { class: 'flex-between', style: 'margin-bottom:10px' }, [
          UI.el('h3', { style: 'margin:0' }, I18n.pick(t.name)),
          UI.el('button', { class: 'btn btn-ghost', style: 'padding:6px 12px', onclick: close }, I18n.t('close'))
        ]);

        const frame = UI.el('iframe', {
          class: 'bracket-frame', src: t.embed, loading: 'lazy',
          allowfullscreen: 'true', frameborder: '0'
        });

        const modal = UI.el('div', { class: 'modal modal-wide' }, [head, frame]);
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
      }
    }
  });
})();
