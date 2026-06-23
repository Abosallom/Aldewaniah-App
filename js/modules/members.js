/* ===========================================================
   Feature module: Members directory
   =========================================================== */
(function () {
  const COLLECTION = 'members';

  App.registerModule({
    id: 'members',
    title: { ar: 'الأعضاء', en: 'Members' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.5a3 3 0 010 5.6M16.5 14c2.5.3 4 2.2 4 5"/></svg>',
    strings: {
      ar: {
        mem_title: 'الأعضاء', mem_sub: 'دليل أعضاء الديوانية من الأصدقاء والأقارب',
        mem_add: 'إضافة عضو', mem_name: 'الاسم', mem_phone: 'رقم الجوال',
        mem_role: 'الصفة', mem_search: 'بحث بالاسم...', mem_empty: 'لا يوجد أعضاء بعد — أضف عضواً'
      },
      en: {
        mem_title: 'Members', mem_sub: 'Directory of Dewaniah friends and relatives',
        mem_add: 'Add member', mem_name: 'Name', mem_phone: 'Mobile',
        mem_role: 'Role', mem_search: 'Search by name...', mem_empty: 'No members yet — add one'
      }
    },

    async render(view) {
      view.appendChild(UI.pageTitle(I18n.t('mem_title'), I18n.t('mem_sub')));
      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [
        UI.el('button', { class: 'btn btn-block', onclick: openForm }, '+ ' + I18n.t('mem_add'))
      ]));

      const search = UI.el('input', { class: 'field', placeholder: I18n.t('mem_search'),
        style: 'width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:14px;font:inherit' });
      search.oninput = () => paint(search.value.trim().toLowerCase());
      view.appendChild(search);

      const listEl = UI.el('div');
      view.appendChild(listEl);
      await paint('');

      async function paint(q) {
        let rows = await Store.list(COLLECTION);
        rows = rows.sort((a, b) => I18n.pick(a.name).localeCompare(I18n.pick(b.name)));
        if (q) rows = rows.filter((r) => I18n.pick(r.name).toLowerCase().includes(q));
        listEl.innerHTML = '';
        if (!rows.length) { listEl.appendChild(UI.empty(I18n.t('mem_empty'))); return; }
        rows.forEach((r) => listEl.appendChild(card(r)));
      }

      function card(r) {
        const name = I18n.pick(r.name);
        const phone = r.phone
          ? UI.el('a', { class: 'card-meta', href: 'tel:' + r.phone, style: 'text-decoration:none' }, '📞 ' + r.phone)
          : UI.el('span', { class: 'card-meta muted' }, '—');
        const del = UI.el('button', { style: 'border:none;background:none;color:var(--brand-red);cursor:pointer;font-size:1.2rem',
          onclick: () => UI.confirm(null, async () => { await Store.remove(COLLECTION, r.id); paint(search.value.trim().toLowerCase()); }) }, '×');
        return UI.el('div', { class: 'card' }, [
          UI.el('div', { class: 'flex-between' }, [
            UI.el('div', { class: 'row' }, [
              UI.el('div', { class: 'avatar' }, UI.initials(name)),
              UI.el('div', null, [
                UI.el('div', { class: 'card-title', style: 'margin:0' }, name),
                r.role ? UI.el('span', { class: 'chip' }, I18n.pick(r.role)) : null
              ])
            ]),
            del
          ]),
          UI.el('div', { style: 'margin-top:10px' }, [phone])
        ]);
      }

      function openForm() {
        UI.modal(I18n.t('mem_add'), [
          { name: 'name', label: I18n.t('mem_name'), required: true },
          { name: 'phone', label: I18n.t('mem_phone'), type: 'tel' },
          { name: 'role', label: I18n.t('mem_role') }
        ], async (data) => {
          await Store.add(COLLECTION, { name: data.name, phone: data.phone, role: data.role });
          paint('');
        });
      }
    }
  });
})();
