/* ===========================================================
   Feature module: Gallery (مكتبة الصور) — members only.
   Signed-in members can upload photos/videos (to Firebase
   Storage) and view the shared album. Uploader or an admin
   can delete. Access enforced by Storage + Firestore rules.
   =========================================================== */
(function () {
  const COLLECTION = 'gallery';
  const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

  App.registerModule({
    id: 'gallery',
    title: { ar: 'مكتبة الصور', en: 'Gallery' },
    memberOnly: true,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5L5 19"/></svg>',
    strings: {
      ar: {
        gal_title: 'مكتبة الصور', gal_sub: 'صور ومقاطع من تجمعاتنا',
        gal_locked: 'هذا القسم للأعضاء فقط',
        gal_locked_sub: 'سجّل دخولك كعضو لعرض ورفع الصور والفيديو.',
        gal_empty: 'لا توجد صور بعد — كن أول من يرفع',
        gal_upload: 'رفع صورة أو فيديو', gal_uploading: 'جارٍ الرفع',
        gal_by: 'بواسطة', gal_del_confirm: 'حذف هذا الملف؟',
        gal_too_big: 'الملف كبير جداً (الحد 100 ميجابايت)',
        gal_err: 'تعذّر الرفع، حاول مرة أخرى'
      },
      en: {
        gal_title: 'Photo Gallery', gal_sub: 'Photos & clips from our gatherings',
        gal_locked: 'This section is for members only',
        gal_locked_sub: 'Sign in as a member to view and upload photos and videos.',
        gal_empty: 'No photos yet — be the first to upload',
        gal_upload: 'Upload photo or video', gal_uploading: 'Uploading',
        gal_by: 'by', gal_del_confirm: 'Delete this file?',
        gal_too_big: 'File too large (max 100MB)',
        gal_err: 'Upload failed, please try again'
      }
    },

    async render(view) {
      view.appendChild(UI.pageTitle(I18n.t('gal_title'), I18n.t('gal_sub')));

      const isMember = window.Auth && Auth.isMember && Auth.isMember();
      if (!isMember) {
        view.appendChild(UI.el('div', { class: 'locked' }, [
          UI.el('div', { class: 'locked-icon', html:
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>' }),
          UI.el('h3', { class: 'locked-title' }, I18n.t('gal_locked')),
          UI.el('p', { class: 'muted' }, I18n.t('gal_locked_sub'))
        ]));
        return;
      }

      const db = Auth.getDb();
      const storage = firebase.storage();

      // Upload control
      const fileInput = UI.el('input', { type: 'file', accept: 'image/*,video/*', style: 'display:none' });
      const upBtn = UI.el('button', { class: 'btn btn-block', onclick: () => fileInput.click() }, '⬆  ' + I18n.t('gal_upload'));
      const progress = UI.el('p', { class: 'muted', style: 'text-align:center;margin:8px 0 0' });
      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [upBtn, fileInput, progress]));

      fileInput.onchange = () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) { alert(I18n.t('gal_too_big')); fileInput.value = ''; return; }
        const type = (file.type || '').startsWith('video') ? 'video' : 'image';
        const safe = file.name.replace(/[^\w.\-]/g, '_');
        const path = 'gallery/' + Date.now() + '_' + safe;
        upBtn.disabled = true;
        const task = storage.ref().child(path).put(file, { contentType: file.type });
        task.on('state_changed',
          (s) => { progress.textContent = I18n.t('gal_uploading') + ' ' + Math.round((s.bytesTransferred / s.totalBytes) * 100) + '%'; },
          (e) => { progress.textContent = I18n.t('gal_err'); upBtn.disabled = false; fileInput.value = ''; },
          async () => {
            try {
              const url = await task.snapshot.ref.getDownloadURL();
              const m = (Auth.member && Auth.member()) || {};
              await db.collection(COLLECTION).add({
                url: url, path: path, type: type, name: file.name,
                by: m.name || '', byPhone: Auth.phone() || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
            } catch (e) { progress.textContent = I18n.t('gal_err'); }
            progress.textContent = ''; upBtn.disabled = false; fileInput.value = '';
            load();
          });
      };

      const grid = UI.el('div', { class: 'gal-grid' });
      view.appendChild(grid);
      await load();

      async function load() {
        grid.innerHTML = '<div class="muted" style="text-align:center;grid-column:1/-1">…</div>';
        let items = [];
        try {
          const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
          snap.forEach((d) => items.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) {
          grid.innerHTML = '';
          grid.appendChild(UI.el('p', { class: 'auth-err', style: 'grid-column:1/-1' }, e.message || 'Error'));
          return;
        }
        grid.innerHTML = '';
        if (!items.length) { grid.appendChild(UI.el('div', { style: 'grid-column:1/-1' }, [UI.empty(I18n.t('gal_empty'))])); return; }
        items.forEach((it) => grid.appendChild(card(it)));
      }

      function card(it) {
        const media = it.type === 'video'
          ? UI.el('video', { src: it.url, controls: 'true', preload: 'metadata', playsinline: 'true', class: 'gal-media' })
          : UI.el('img', { src: it.url, loading: 'lazy', class: 'gal-media', onclick: () => lightbox(it.url) });
        const canDel = (Auth.isAdmin && Auth.isAdmin()) || it.byPhone === Auth.phone();
        const cap = UI.el('div', { class: 'gal-cap' }, [
          UI.el('span', { class: 'card-meta' }, it.by ? (I18n.t('gal_by') + ' ' + I18n.pick(it.by)) : ''),
          canDel ? UI.el('button', { class: 'gal-del', title: I18n.t('gal_del_confirm'),
            onclick: () => UI.confirm(I18n.t('gal_del_confirm'), () => del(it)) }, '×') : null
        ]);
        return UI.el('div', { class: 'gal-item' }, [media, cap]);
      }

      async function del(it) {
        try { await db.collection(COLLECTION).doc(it.id).delete(); } catch (e) {}
        try { if (it.path) await firebase.storage().ref().child(it.path).delete(); } catch (e) {}
        load();
      }

      function lightbox(url) {
        const bd = UI.el('div', { class: 'modal-backdrop', onclick: () => bd.remove() });
        bd.appendChild(UI.el('img', { src: url, class: 'gal-lightbox' }));
        document.body.appendChild(bd);
      }
    }
  });
})();
