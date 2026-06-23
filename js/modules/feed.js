/* ===========================================================
   Feature module: Announcements / Updates feed
   =========================================================== */
(function () {
  const COLLECTION = 'feed';

  App.registerModule({
    id: 'feed',
    title: { ar: 'المستجدات', en: 'Updates' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h10"/></svg>',
    strings: {
      ar: {
        feed_title: 'المستجدات', feed_sub: 'آخر الأخبار والإعلانات في الديوانية',
        feed_add: 'إضافة إعلان', feed_author: 'الكاتب', feed_titleField: 'العنوان',
        feed_body: 'النص', feed_empty: 'لا توجد إعلانات بعد — أضف أول إعلان'
      },
      en: {
        feed_title: 'Updates', feed_sub: 'Latest news and announcements in the Dewaniah',
        feed_add: 'Add announcement', feed_author: 'Author', feed_titleField: 'Title',
        feed_body: 'Message', feed_empty: 'No announcements yet — add the first one'
      }
    },

    async render(view) {
      view.appendChild(UI.pageTitle(I18n.t('feed_title'), I18n.t('feed_sub')));

      const addBtn = UI.el('div', { class: 'add-fab-wrap' }, [
        UI.el('button', { class: 'btn btn-block', onclick: openForm }, '+ ' + I18n.t('feed_add'))
      ]);
      view.appendChild(addBtn);

      const listEl = UI.el('div');
      view.appendChild(listEl);

      await paint();

      async function paint() {
        const rows = await Store.list(COLLECTION);
        listEl.innerHTML = '';
        if (!rows.length) { listEl.appendChild(UI.empty(I18n.t('feed_empty'))); return; }
        rows.forEach((r) => listEl.appendChild(card(r)));
      }

      function card(r) {
        const head = UI.el('div', { class: 'flex-between' }, [
          UI.el('h3', { class: 'card-title' }, I18n.pick(r.title)),
          UI.el('button', { class: 'btn-ghost', style: 'border:none;color:var(--brand-red);padding:4px 8px;cursor:pointer',
            onclick: () => UI.confirm(null, async () => { await Store.remove(COLLECTION, r.id); paint(); }) }, '×')
        ]);
        return UI.el('div', { class: 'card' }, [
          head,
          UI.el('div', { class: 'card-meta' }, `${I18n.pick(r.author) || '—'} · ${UI.fmtDate(r.createdAt)}`),
          UI.el('p', { class: 'card-body' }, I18n.pick(r.body))
        ]);
      }

      function openForm() {
        UI.modal(I18n.t('feed_add'), [
          { name: 'title', label: I18n.t('feed_titleField'), required: true },
          { name: 'author', label: I18n.t('feed_author') },
          { name: 'body', label: I18n.t('feed_body'), type: 'textarea', required: true }
        ], async (data) => {
          await Store.add(COLLECTION, { title: data.title, author: data.author, body: data.body });
          paint();
        });
      }
    }
  });

  // Sample content (only on first run)
  Store.seedIfEmpty(COLLECTION, [
    { title: { ar: 'حياكم الله في تطبيق الديوانية', en: 'Welcome to the Al Dewaniah app' },
      author: { ar: 'الإدارة', en: 'Admin' },
      body: { ar: 'هذا أول إعلان في التطبيق. شاركوا الأخبار والمناسبات هنا.', en: 'This is the first announcement. Share news and events here.' } }
  ]);
})();
