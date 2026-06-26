/* ===========================================================
   Profile (الأعضاء) — member directory + self profile.
   Each member sets a photo, display name, a saying, hobbies and
   a bio; everyone (members) can browse the directory.
   Photos are resized small client-side and stored in Firestore
   ('profiles' collection). Top-level tab (members only).
   =========================================================== */
(function () {
  const COLL = 'profiles';

  Sections.add({
    id: 'profile',
    memberOnly: true,
    title: { ar: 'الأعضاء', en: 'Members' },
    subtitle: { ar: 'دليل أعضاء الديوانية', en: 'Member directory' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15 19a4 4 0 016.5-3"/></svg>',
    strings: {
      ar: {
        pr_title: 'الأعضاء', pr_sub: 'تعرّف على أعضاء الديوانية', pr_mine: 'ملفي الشخصي',
        pr_edit: 'تعديل ملفي', pr_name: 'الاسم', pr_saying: 'مقولتك المفضلة', pr_hobbies: 'الهوايات',
        pr_bio: 'نبذة عنك', pr_photo: 'الصورة الشخصية', pr_save: 'حفظ', pr_cancel: 'إلغاء',
        pr_empty: 'لا توجد ملفات بعد — كن أول من يضيف ملفه', pr_you: 'أنت',
        pr_locked: 'الأعضاء للأعضاء المعتمدين فقط'
      },
      en: {
        pr_title: 'Members', pr_sub: 'Meet the Dewaniah members', pr_mine: 'My profile',
        pr_edit: 'Edit my profile', pr_name: 'Name', pr_saying: 'Favourite saying', pr_hobbies: 'Hobbies',
        pr_bio: 'About you', pr_photo: 'Profile photo', pr_save: 'Save', pr_cancel: 'Cancel',
        pr_empty: 'No profiles yet — be the first to add yours', pr_you: 'You',
        pr_locked: 'Members area is for approved members only'
      }
    },

    render(view) {
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.pageTitle(I18n.t('pr_title'), I18n.t('pr_sub')));
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('pr_locked')));
        return;
      }
      const db = Auth.getDb();
      const me = (Auth.phone && Auth.phone()) || '';
      view.appendChild(UI.pageTitle(I18n.t('pr_title'), I18n.t('pr_sub')));

      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [
        UI.el('button', { class: 'btn btn-block', onclick: () => editMine() }, '✏️  ' + I18n.t('pr_edit'))
      ]));

      const grid = UI.el('div', { class: 'prof-grid' });
      view.appendChild(grid);
      load();

      async function load() {
        grid.innerHTML = '<div class="muted" style="text-align:center;grid-column:1/-1">…</div>';
        const byId = {};
        // 1) the full roster — every approved member shows up by name
        try {
          const ms = await db.collection('members').where('status', '==', 'approved').get();
          ms.forEach((d) => { const m = d.data() || {}; byId[d.id] = { id: d.id, name: m.name || '' }; });
        } catch (e) { /* not permitted / offline — fall back to profiles only */ }
        // 2) profiles overlay the richer details (photo, saying, hobbies, bio)
        try {
          const ps = await db.collection(COLL).get();
          ps.forEach((d) => { byId[d.id] = Object.assign(byId[d.id] || { id: d.id }, d.data()); });
        } catch (e) {
          if (!Object.keys(byId).length) { grid.innerHTML = '<div class="auth-err" style="grid-column:1/-1">' + (e.message || 'Error') + '</div>'; return; }
        }
        const rows = Object.keys(byId).map((k) => byId[k]);
        grid.innerHTML = '';
        if (!rows.length) { grid.appendChild(UI.el('div', { style: 'grid-column:1/-1' }, [UI.empty(I18n.t('pr_empty'))])); return; }
        rows.sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : (a.name || '').localeCompare(b.name || '', 'ar')));
        rows.forEach((p) => grid.appendChild(card(p)));
      }

      function card(p) {
        const avatar = p.photo
          ? UI.el('img', { class: 'prof-photo', src: p.photo, alt: '' })
          : UI.el('div', { class: 'prof-photo prof-initials' }, UI.initials(p.name));
        return UI.el('div', { class: 'prof-card' }, [
          avatar,
          UI.el('div', { class: 'prof-name' }, (p.name || '—') + (p.id === me ? ' (' + I18n.t('pr_you') + ')' : '')),
          p.saying ? UI.el('div', { class: 'prof-saying' }, '“' + p.saying + '”') : null,
          p.hobbies ? UI.el('div', { class: 'prof-line' }, '🎯 ' + p.hobbies) : null,
          p.bio ? UI.el('div', { class: 'prof-bio' }, p.bio) : null
        ]);
      }

      function editMine() {
        const cur = {};
        db.collection(COLL).doc(me).get().then((d) => { if (d.exists) Object.assign(cur, d.data()); openForm(cur); }).catch(() => openForm(cur));
      }

      function openForm(cur) {
        let photoData = cur.photo || null;
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

        const preview = UI.el('div', { class: 'prof-photo prof-edit-photo' });
        function paintPreview() { preview.innerHTML = ''; if (photoData) preview.appendChild(UI.el('img', { class: 'prof-photo', src: photoData })); else preview.textContent = UI.initials(cur.name || (Auth.member() || {}).name || '?'); }
        paintPreview();
        const file = UI.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
        file.onchange = () => { const f = file.files && file.files[0]; if (f) UI.resizeImage(f, 220, 0.82, (d) => { if (d) { photoData = d; paintPreview(); } }); };
        const photoBtn = UI.el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => file.click() }, '📷 ' + I18n.t('pr_photo'));

        const name = UI.el('input', { class: 'fld', value: cur.name || (Auth.member() || {}).name || '', maxlength: '24' });
        const saying = UI.el('input', { class: 'fld', value: cur.saying || '', maxlength: '80' });
        const hobbies = UI.el('input', { class: 'fld', value: cur.hobbies || '', maxlength: '80' });
        const bio = UI.el('textarea', { class: 'fld', maxlength: '300' }); bio.value = cur.bio || '';

        const fieldsWrap = UI.el('div', null, [
          UI.el('div', { class: 'prof-photo-row' }, [preview, photoBtn, file]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_name')), name]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_saying')), saying]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_hobbies')), hobbies]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_bio')), bio])
        ]);
        const err = UI.el('p', { class: 'auth-err' });
        const saveBtn = UI.el('button', { class: 'btn', onclick: save }, I18n.t('pr_save'));
        const box = UI.el('div', { class: 'modal' }, [
          UI.el('h3', null, I18n.t('pr_mine')), fieldsWrap, err,
          UI.el('div', { class: 'flex-between', style: 'justify-content:flex-end;gap:10px;margin-top:6px' }, [
            UI.el('button', { class: 'btn btn-ghost', onclick: close }, I18n.t('pr_cancel')), saveBtn
          ])
        ]);
        backdrop.appendChild(box); document.body.appendChild(backdrop);

        async function save() {
          saveBtn.disabled = true; saveBtn.textContent = '…';
          try {
            await db.collection(COLL).doc(me).set({
              phone: me, name: (name.value || '').trim() || (Auth.member() || {}).name || '',
              saying: (saying.value || '').trim(), hobbies: (hobbies.value || '').trim(),
              bio: (bio.value || '').trim(), photo: photoData || '',
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            close(); load();
          } catch (e) { err.textContent = e.message || 'Error'; saveBtn.disabled = false; saveBtn.textContent = I18n.t('pr_save'); }
        }
      }
    }
  });
})();
