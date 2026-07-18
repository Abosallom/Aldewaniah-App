/* ===========================================================
   Members (الأعضاء) — member directory + self profile.
   A Sections sub-section (members only).

   Privacy: the directory lives in its own 'directory' collection
   keyed by the member's Firebase UID (NOT their phone number), so
   browsing the directory never exposes anyone's phone. Each member
   creates and edits their OWN entry (self-service, no admin step):
   they add a photo, display name, a saying, hobbies and a bio.
   =========================================================== */
(function () {
  const COLL = 'directory';
  // The App Review demo account (same constant as js/modules/admin.js's
  // gift-code exclusion) — never shown in the member-facing directory.
  const REVIEWER_PHONE = '+966555555555';

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
        pr_locked: 'الأعضاء للأعضاء المعتمدين فقط',
        pr_no_info: 'لم يضِف هذا العضو معلومات بعد', pr_close: 'إغلاق',
        pr_edit_one: 'تعديل', pr_delete: 'حذف', pr_del_confirm: 'حذف ملف هذا العضو؟',
        pr_report: 'إبلاغ', pr_reported: 'تم الإبلاغ، شكرًا لك ✅', pr_report_fail: 'تعذّر الإبلاغ، حاول لاحقًا',
        pr_msg: 'مراسلة', pr_ai_bio: 'اكتب نبذة',
        pr_role_admin: 'مشرف', pr_role_coadmin: 'مشرف مساعد'
      },
      en: {
        pr_title: 'Members', pr_sub: 'Meet the Dewaniah members', pr_mine: 'My profile',
        pr_edit: 'Edit my profile', pr_name: 'Name', pr_saying: 'Favourite saying', pr_hobbies: 'Hobbies',
        pr_bio: 'About you', pr_photo: 'Profile photo', pr_save: 'Save', pr_cancel: 'Cancel',
        pr_empty: 'No profiles yet — be the first to add yours', pr_you: 'You',
        pr_locked: 'Members area is for approved members only',
        pr_no_info: "This member hasn't added any info yet", pr_close: 'Close',
        pr_edit_one: 'Edit', pr_delete: 'Delete', pr_del_confirm: "Delete this member's profile?",
        pr_report: 'Report', pr_reported: 'Reported, thank you ✅', pr_report_fail: 'Could not report, try later',
        pr_msg: 'Message', pr_ai_bio: 'Write a bio',
        pr_role_admin: 'Admin', pr_role_coadmin: 'Co-Admin'
      }
    },

    render(view) {
      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.pageTitle(I18n.t('pr_title'), I18n.t('pr_sub')));
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('pr_locked')));
        return;
      }
      const db = Auth.getDb();
      const myUid = (firebase.auth().currentUser && firebase.auth().currentUser.uid) || null; // my directory key
      view.appendChild(UI.pageTitle(I18n.t('pr_title'), I18n.t('pr_sub')));

      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [
        UI.el('button', { class: 'btn btn-block', onclick: () => editMine() }, '✏️  ' + I18n.t('pr_edit'))
      ]));

      const grid = UI.el('div', { class: 'prof-grid' });
      view.appendChild(grid);
      ensureMine().then(load);

      // Make sure I have a directory entry, and keep my name in sync with the
      // admin-set name (members.name) unless I've chosen a custom display name.
      // This is how an admin rename shows up in the directory: the member's own
      // client copies the latest members.name into directory/{uid} on app open.
      async function ensureMine() {
        if (!myUid) return;
        const memberName = ((Auth.member && Auth.member()) || {}).name || '';
        const myRole = (Auth.role && Auth.role()) || 'member';
        const isReviewer = (Auth.phone && Auth.phone()) === REVIEWER_PHONE;
        try {
          const ref = db.collection(COLL).doc(myUid);
          if (isReviewer) {
            // The App Review demo account never appears in the member-facing
            // directory (it's not a real diwaniya member) — remove any entry.
            try { await ref.delete(); } catch (e) {}
            return;
          }
          const snap = await ref.get();
          if (!snap.exists) {
            const seed = { name: memberName, role: myRole, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
            // Migrate an admin-seeded placeholder (id == my phone, created before
            // I ever opened the app) into my real uid-keyed doc, then remove it.
            const myPhone = Auth.phone && Auth.phone();
            if (myPhone) {
              try {
                const ph = await db.collection(COLL).doc(myPhone).get();
                if (ph.exists) { await ph.ref.delete(); }
              } catch (e) {}
            }
            await ref.set(seed, { merge: true });
          } else {
            const d = snap.data() || {};
            const patch = {};
            // follow the admin name unless the member picked a custom one (nameSrc==='self')
            if (d.nameSrc !== 'self' && memberName && d.name !== memberName) patch.name = memberName;
            if (d.role !== myRole) patch.role = myRole;
            if (Object.keys(patch).length) await ref.set(patch, { merge: true });
          }
        } catch (e) { /* non-fatal */ }
      }

      async function load() {
        grid.innerHTML = '<div class="muted" style="text-align:center;grid-column:1/-1">…</div>';
        let rows = [];
        try {
          const snap = await db.collection(COLL).get();
          snap.forEach((d) => rows.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) { grid.innerHTML = '<div class="auth-err" style="grid-column:1/-1">' + (e.message || 'Error') + '</div>'; return; }
        grid.innerHTML = '';
        rows = rows.filter((p) => p.role !== 'reviewer'); // never show the App Review demo account
        if (!rows.length) { grid.appendChild(UI.el('div', { style: 'grid-column:1/-1' }, [UI.empty(I18n.t('pr_empty'))])); return; }
        rows.sort((a, b) => (a.id === myUid ? -1 : b.id === myUid ? 1 : (a.name || '').localeCompare(b.name || '', 'ar')));
        rows.forEach((p) => grid.appendChild(card(p)));
      }

      // Admin/Co-Admin badge (same look as the admin panel's memberCard); plain
      // members get none, matching admin.js's own badgeFor().
      function roleBadge(p) {
        if (p.role === 'admin') return UI.el('span', { class: 'chip' }, I18n.t('pr_role_admin'));
        if (p.role === 'coadmin') return UI.el('span', { class: 'chip chip-blue' }, I18n.t('pr_role_coadmin'));
        return null;
      }

      function card(p) {
        const avatar = p.photo
          ? UI.el('img', { class: 'prof-photo', src: p.photo, alt: '' })
          : UI.el('div', { class: 'prof-photo prof-initials' }, UI.initials(p.name));
        return UI.el('div', { class: 'prof-card', onclick: () => openBrief(p) }, [
          avatar,
          UI.el('div', { class: 'prof-name' }, (p.name || '—') + (p.id === myUid ? ' (' + I18n.t('pr_you') + ')' : '')),
          roleBadge(p),
          p.saying ? UI.el('div', { class: 'prof-saying' }, '“' + p.saying + '”') : null,
          p.hobbies ? UI.el('div', { class: 'prof-line' }, '🎯 ' + p.hobbies) : null,
          p.bio ? UI.el('div', { class: 'prof-bio' }, p.bio) : null
        ]);
      }

      // Tap a card -> full brief (members-only, same as the directory itself)
      function openBrief(p) {
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
        const isMe = p.id === myUid;
        const avatar = p.photo
          ? UI.el('img', { class: 'prof-brief-photo', src: p.photo, alt: '' })
          : UI.el('div', { class: 'prof-brief-photo prof-initials' }, UI.initials(p.name));
        const rows = [];
        if (p.saying) rows.push(UI.el('div', { class: 'prof-saying', style: 'font-size:1rem' }, '“' + p.saying + '”'));
        if (p.hobbies) rows.push(UI.el('div', { class: 'prof-brief-row' }, '🎯  ' + p.hobbies));
        if (p.bio) rows.push(UI.el('div', { class: 'prof-bio', style: 'font-size:.95rem;margin-top:6px' }, p.bio));
        if (!rows.length) rows.push(UI.el('p', { class: 'muted', style: 'text-align:center;margin-top:8px' }, I18n.t('pr_no_info')));
        const admin = isAdminUser();
        const actions = UI.el('div', { class: 'flex-between', style: 'justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap' }, [
          (!isMe && window.DM) ? UI.el('button', { class: 'btn btn-green', onclick: () => { close(); DM.open(p.id, p.name || ''); } }, '✉️  ' + I18n.t('pr_msg')) : null,
          (isMe || admin) ? UI.el('button', { class: 'btn btn-ghost', onclick: () => { close(); editEntry(p.id); } }, '✏️  ' + I18n.t(isMe ? 'pr_edit' : 'pr_edit_one')) : null,
          (admin && !isMe) ? UI.el('button', { class: 'btn btn-ghost', style: 'color:var(--maroon);border-color:var(--maroon)', onclick: () => { close(); UI.confirm(I18n.t('pr_del_confirm'), () => delEntry(p.id)); } }, '🗑️  ' + I18n.t('pr_delete')) : null,
          (!isMe) ? UI.el('button', { class: 'btn btn-ghost', onclick: () => { close(); reportProfile(p); } }, '⚑  ' + I18n.t('pr_report')) : null,
          UI.el('button', { class: 'btn', onclick: close }, I18n.t('pr_close'))
        ]);
        const box = UI.el('div', { class: 'modal prof-brief' }, [
          avatar,
          UI.el('div', { class: 'prof-brief-name' }, (p.name || '—') + (isMe ? ' (' + I18n.t('pr_you') + ')' : '')),
          roleBadge(p),
          UI.el('div', { class: 'prof-brief-body' }, rows),
          actions
        ]);
        backdrop.appendChild(box); document.body.appendChild(backdrop);
      }

      const isAdminUser = () => !!(window.Auth && Auth.isAdmin && Auth.isAdmin());
      function editMine() { editEntry(myUid); }
      function editEntry(uid) {
        if (!uid) return;
        const cur = {};
        db.collection(COLL).doc(uid).get().then((d) => { if (d.exists) Object.assign(cur, d.data()); openForm(cur, uid); }).catch(() => openForm(cur, uid));
      }
      async function delEntry(uid) {
        try { await db.collection(COLL).doc(uid).delete(); load(); } catch (e) { alert(e.message || 'Error'); }
      }
      async function reportProfile(p) {
        const okR = window.Moderation && await Moderation.report('profile', p.id, p.name, '');
        alert(I18n.t(okR ? 'pr_reported' : 'pr_report_fail'));
      }

      function openForm(cur, uid) {
        uid = uid || myUid;
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

        /* ---- AI: draft a short friendly bio from name/hobbies ---- */
        const bioErr = UI.el('div', { class: 'ai-mini-err' });
        let bioAiRow = null;
        if (window.AI && AI.available()) {
          const bioBtn = AI.button(
            () => {
              const nm = (name.value || '').trim();
              const hb = (hobbies.value || '').trim();
              const sy = (saying.value || '').trim();
              return 'اكتب نبذة قصيرة ودّية (جملتان كحد أقصى) لعضو ديوانية.'
                + (nm ? ' الاسم: ' + nm + '.' : '')
                + (hb ? ' الهوايات: ' + hb + '.' : '')
                + (sy ? ' مقولته: ' + sy + '.' : '');
            },
            (reply, btn) => {
              bioErr.textContent = '';
              if (reply == null) { bioErr.textContent = I18n.t('ai_none'); return; }
              const clean = String(reply).trim();
              if (clean) bio.value = clean.slice(0, 300);
              else bioErr.textContent = I18n.t('ai_none');
            },
            I18n.t('pr_ai_bio'),
            { system: 'أنت تكتب نبذة تعريفية قصيرة ودّية، جملتان كحد أقصى، بنفس اللغة، دون مبالغة.' }
          );
          bioAiRow = UI.el('div', { class: 'ai-mini-row', style: 'margin-top:6px' }, [bioBtn, bioErr]);
        }

        const fieldsWrap = UI.el('div', null, [
          UI.el('div', { class: 'prof-photo-row' }, [preview, photoBtn, file]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_name')), name]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_saying')), saying]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_hobbies')), hobbies]),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('pr_bio')), bio, bioAiRow])
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
          if (!uid) { err.textContent = 'Error'; return; }
          saveBtn.disabled = true; saveBtn.textContent = '…';
          try {
            const isSelf = (uid === myUid);
            const memberName = isSelf ? ((Auth.member() || {}).name || '') : '';
            const newName = (name.value || '').trim() || cur.name || memberName;
            // Self: a name different from the admin-set one is marked custom (won't be
            // overwritten by the admin-name sync). Admin editing another member = manual override.
            const custom = isSelf ? (!!newName && newName !== memberName) : true;
            await db.collection(COLL).doc(uid).set({
              name: newName,
              nameSrc: custom ? 'self' : firebase.firestore.FieldValue.delete(),
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
