/* ===========================================================
   Feature module: Events / Gatherings (with RSVP)
   =========================================================== */
(function () {
  const COLLECTION = 'events';

  App.registerModule({
    id: 'events',
    title: { ar: 'المناسبات', en: 'Events' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
    strings: {
      ar: {
        ev_title: 'المناسبات', ev_sub: 'لقاءات الديوانية والمناسبات القادمة',
        ev_add: 'إضافة مناسبة', ev_name: 'اسم المناسبة', ev_where: 'المكان',
        ev_when: 'التاريخ', ev_notes: 'ملاحظات', ev_going: 'سأحضر', ev_count: 'الحاضرون',
        ev_empty: 'لا توجد مناسبات قادمة — أضف مناسبة'
      },
      en: {
        ev_title: 'Events', ev_sub: 'Dewaniah meetups and upcoming gatherings',
        ev_add: 'Add event', ev_name: 'Event name', ev_where: 'Location',
        ev_when: 'Date', ev_notes: 'Notes', ev_going: "I'm going", ev_count: 'Attending',
        ev_empty: 'No upcoming events — add one'
      }
    },

    async render(view) {
      view.appendChild(UI.pageTitle(I18n.t('ev_title'), I18n.t('ev_sub')));
      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [
        UI.el('button', { class: 'btn btn-block btn-green', onclick: openForm }, '+ ' + I18n.t('ev_add'))
      ]));

      const listEl = UI.el('div');
      view.appendChild(listEl);
      await paint();

      async function paint() {
        const rows = (await Store.list(COLLECTION)).sort((a, b) => (a.when || '').localeCompare(b.when || ''));
        listEl.innerHTML = '';
        if (!rows.length) { listEl.appendChild(UI.empty(I18n.t('ev_empty'))); return; }
        rows.forEach((r) => listEl.appendChild(card(r)));
      }

      function card(r) {
        const going = (r.rsvps || []).length;
        const del = UI.el('button', { style: 'border:none;background:none;color:var(--brand-red);cursor:pointer;font-size:1.2rem',
          onclick: () => UI.confirm(null, async () => { await Store.remove(COLLECTION, r.id); paint(); }) }, '×');
        const rsvpBtn = UI.el('button', { class: 'btn', style: 'padding:8px 14px',
          onclick: async () => {
            const name = window.prompt(I18n.t('ev_going') + ':');
            if (!name) return;
            const rsvps = (r.rsvps || []).concat(name);
            await Store.update(COLLECTION, r.id, { rsvps });
            paint();
          } }, '✓ ' + I18n.t('ev_going'));

        return UI.el('div', { class: 'card' }, [
          UI.el('div', { class: 'flex-between' }, [
            UI.el('h3', { class: 'card-title' }, I18n.pick(r.name)), del
          ]),
          UI.el('div', { class: 'card-meta' }, `📅 ${formatWhen(r.when)}   📍 ${I18n.pick(r.where) || '—'}`),
          r.notes ? UI.el('p', { class: 'card-body' }, I18n.pick(r.notes)) : null,
          UI.el('div', { class: 'flex-between', style: 'margin-top:10px' }, [
            UI.el('span', { class: 'chip chip-blue' }, `${I18n.t('ev_count')}: ${going}`),
            rsvpBtn
          ])
        ]);
      }

      function formatWhen(w) { return w ? new Date(w).toLocaleString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

      function openForm() {
        UI.modal(I18n.t('ev_add'), [
          { name: 'name', label: I18n.t('ev_name'), required: true },
          { name: 'where', label: I18n.t('ev_where') },
          { name: 'when', label: I18n.t('ev_when'), type: 'datetime-local', required: true },
          { name: 'notes', label: I18n.t('ev_notes'), type: 'textarea' }
        ], async (data) => {
          await Store.add(COLLECTION, { name: data.name, where: data.where, when: data.when, notes: data.notes, rsvps: [] });
          paint();
        });
      }
    }
  });
})();
