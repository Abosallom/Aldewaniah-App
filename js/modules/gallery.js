/* ===========================================================
   Feature module: Gallery (مكتبة الصور) — members only.
   Photos/videos are stored on the group's own Cloudflare R2
   bucket via a Worker (js: worker/aldewaniah-media-worker.js).
   Members upload + view in a full-screen swipeable viewer
   (arrows / swipe / keyboard). Uploader or admin can delete.
   Access is enforced by the Worker (Firebase token + member
   check) — the bucket itself is private.
   =========================================================== */
(function () {
  const WORKER = 'https://aldewaniah-media.mulhaqdb.workers.dev';
  const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

  async function authToken() {
    try {
      const u = firebase.auth().currentUser;
      return u ? await u.getIdToken() : null;
    } catch (e) { return null; }
  }
  const isVideo = (t) => (t || '').indexOf('video') === 0;

  Sections.add({
    id: 'gallery',
    title: { ar: 'مكتبة الصور', en: 'Gallery' },
    subtitle: { ar: 'صور ومقاطع المجموعة', en: 'Group photos & clips' },
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

      let items = [];

      // ---- Upload control ----
      const fileInput = UI.el('input', { type: 'file', accept: 'image/*,video/*', style: 'display:none' });
      const upBtn = UI.el('button', { class: 'btn btn-block', onclick: () => fileInput.click() }, '⬆  ' + I18n.t('gal_upload'));
      const progress = UI.el('p', { class: 'muted', style: 'text-align:center;margin:8px 0 0' });
      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [upBtn, fileInput, progress]));

      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) { alert(I18n.t('gal_too_big')); fileInput.value = ''; return; }
        const tk = await authToken();
        if (!tk) { progress.textContent = I18n.t('gal_err'); return; }
        upBtn.disabled = true;

        const xhr = new XMLHttpRequest();
        xhr.open('POST', WORKER + '/upload');
        xhr.setRequestHeader('Authorization', 'Bearer ' + tk);
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
        xhr.setRequestHeader('X-File-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) progress.textContent = I18n.t('gal_uploading') + ' ' + Math.round((e.loaded / e.total) * 100) + '%';
        };
        xhr.onload = () => {
          progress.textContent = ''; upBtn.disabled = false; fileInput.value = '';
          if (xhr.status >= 200 && xhr.status < 300) load();
          else progress.textContent = I18n.t('gal_err');
        };
        xhr.onerror = () => { progress.textContent = I18n.t('gal_err'); upBtn.disabled = false; fileInput.value = ''; };
        xhr.send(file);
      };

      const grid = UI.el('div', { class: 'gal-grid' });
      view.appendChild(grid);
      await load();

      async function load() {
        grid.innerHTML = '<div class="muted" style="text-align:center;grid-column:1/-1">…</div>';
        items = [];
        try {
          const tk = await authToken();
          const res = await fetch(WORKER + '/list', { cache: 'no-store', headers: { Authorization: 'Bearer ' + tk } });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          items = (data.items || []);
        } catch (e) {
          grid.innerHTML = '';
          grid.appendChild(UI.el('p', { class: 'auth-err', style: 'grid-column:1/-1' }, e.message || 'Error'));
          return;
        }
        grid.innerHTML = '';
        if (!items.length) { grid.appendChild(UI.el('div', { style: 'grid-column:1/-1' }, [UI.empty(I18n.t('gal_empty'))])); return; }
        items.forEach((it, i) => grid.appendChild(card(it, i)));
      }

      function card(it, i) {
        let media;
        if (isVideo(it.type)) {
          media = UI.el('div', { class: 'gal-media-wrap', onclick: () => openViewer(i) }, [
            UI.el('video', { src: it.url + '#t=0.1', muted: 'true', playsinline: 'true', preload: 'metadata', class: 'gal-media' }),
            UI.el('div', { class: 'gal-play', html: '<svg viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.45)"/><path d="M10 8l6 4-6 4z" fill="#fff"/></svg>' })
          ]);
        } else {
          media = UI.el('img', { src: it.url, loading: 'lazy', class: 'gal-media', onclick: () => openViewer(i) });
        }
        const canDel = (Auth.isAdmin && Auth.isAdmin()) || it.byPhone === Auth.phone();
        const cap = UI.el('div', { class: 'gal-cap' }, [
          UI.el('span', { class: 'card-meta' }, it.by ? (I18n.t('gal_by') + ' ' + it.by) : ''),
          canDel ? UI.el('button', { class: 'gal-del', title: I18n.t('gal_del_confirm'),
            onclick: (e) => { e.stopPropagation(); UI.confirm(I18n.t('gal_del_confirm'), () => del(it)); } }, '×') : null
        ]);
        return UI.el('div', { class: 'gal-item' }, [media, cap]);
      }

      async function del(it) {
        try {
          const tk = await authToken();
          await fetch(WORKER + '/delete', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: it.key })
          });
        } catch (e) {}
        load();
      }

      // ---- Full-screen swipeable viewer ----
      function openViewer(startIndex) {
        let idx = startIndex;
        const stage = UI.el('div', { class: 'gal-stage' });
        const prev = UI.el('button', { class: 'gal-nav gal-prev', onclick: (e) => { e.stopPropagation(); go(-1); } }, '‹');
        const next = UI.el('button', { class: 'gal-nav gal-next', onclick: (e) => { e.stopPropagation(); go(1); } }, '›');
        const closeBtn = UI.el('button', { class: 'gal-close', onclick: close }, '×');
        const counter = UI.el('div', { class: 'gal-counter' });
        const bd = UI.el('div', { class: 'gal-viewer' }, [stage, prev, next, closeBtn, counter]);
        bd.onclick = (e) => { if (e.target === bd || e.target === stage) close(); };

        function paint() {
          stage.innerHTML = '';
          const it = items[idx];
          stage.appendChild(isVideo(it.type)
            ? UI.el('video', { src: it.url, controls: 'true', autoplay: 'true', playsinline: 'true', class: 'gal-stage-media' })
            : UI.el('img', { src: it.url, class: 'gal-stage-media' }));
          prev.style.visibility = idx > 0 ? 'visible' : 'hidden';
          next.style.visibility = idx < items.length - 1 ? 'visible' : 'hidden';
          counter.textContent = (idx + 1) + ' / ' + items.length;
        }
        function go(d) { const n = idx + d; if (n >= 0 && n < items.length) { idx = n; paint(); } }
        function onKey(e) {
          if (e.key === 'Escape') close();
          else if (e.key === 'ArrowRight') go(1);
          else if (e.key === 'ArrowLeft') go(-1);
        }
        function close() { document.removeEventListener('keydown', onKey); bd.remove(); }

        let sx = 0, sy = 0;
        bd.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        bd.addEventListener('touchend', (e) => {
          const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx > 0 ? -1 : 1);
        }, { passive: true });

        document.addEventListener('keydown', onKey);
        paint();
        document.body.appendChild(bd);
      }
    }
  });
})();
