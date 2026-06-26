/* ===========================================================
   Feature module: Admin / staff panel.
   - Admin (full): approve/decline join requests, add/edit/remove
     members, set roles (Member / Co-Admin / Admin) and Co-Admin
     permissions, and view the full check-in log.
   - Co-Admin: sees ONLY the sections their granted permissions
     allow (currently: approve join requests).
   Visible to Auth.isStaff(); every write is also enforced by
   Firestore security rules.
   =========================================================== */
(function () {
  function normalizePhone(raw) {
    let p = (raw || '').replace(/[\s-()]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (p.startsWith('966')) p = '+' + p;
    if (!p.startsWith('+')) {
      if (p.startsWith('0')) p = p.slice(1);
      p = (window.DEFAULT_COUNTRY_CODE || '+966') + p;
    }
    return p;
  }
  const yn = () => [{ value: 'no', label: I18n.lang === 'ar' ? 'لا' : 'No' }, { value: 'yes', label: I18n.lang === 'ar' ? 'نعم' : 'Yes' }];

  App.registerModule({
    id: 'admin',
    adminOnly: true, // app.js gates this with Auth.isStaff() (admin or co-admin)
    title: { ar: 'الإدارة', en: 'Admin' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
    strings: {
      ar: {
        adm_title: 'لوحة الإدارة', adm_sub: 'إدارة الأعضاء وطلبات الانضمام',
        adm_requests: 'طلبات الانضمام', adm_no_requests: 'لا توجد طلبات حالياً',
        adm_members: 'الأعضاء', adm_no_members: 'لا يوجد أعضاء',
        adm_approve: 'قبول', adm_decline: 'رفض', adm_add: 'إضافة عضو',
        adm_edit: 'تعديل', adm_delete: 'حذف', adm_admin_badge: 'مشرف', adm_coadmin_badge: 'مشرف مساعد',
        adm_name: 'الاسم', adm_phone: 'رقم الجوال',
        adm_role: 'الدور', adm_role_member: 'عضو', adm_role_coadmin: 'مشرف مساعد', adm_role_admin: 'مشرف',
        adm_perm_requests: 'السماح بالموافقة على طلبات الانضمام',
        adm_confirm_decline: 'رفض هذا الطلب؟', adm_confirm_delete: 'حذف هذا العضو؟',
        adm_self: 'أنت',
        adm_log: 'سجل الحضور', adm_log_none: 'لا يوجد حضور مسجّل بعد', adm_today: 'اليوم',
        adm_rebuild_dir: 'تحديث دليل الأعضاء', adm_rebuild_done: 'تم تحديث الدليل ✓'
      },
      en: {
        adm_title: 'Admin panel', adm_sub: 'Manage members and join requests',
        adm_requests: 'Join requests', adm_no_requests: 'No requests right now',
        adm_members: 'Members', adm_no_members: 'No members',
        adm_approve: 'Approve', adm_decline: 'Decline', adm_add: 'Add member',
        adm_edit: 'Edit', adm_delete: 'Delete', adm_admin_badge: 'Admin', adm_coadmin_badge: 'Co-Admin',
        adm_name: 'Name', adm_phone: 'Mobile number',
        adm_role: 'Role', adm_role_member: 'Member', adm_role_coadmin: 'Co-Admin', adm_role_admin: 'Admin',
        adm_perm_requests: 'Can approve join requests',
        adm_confirm_decline: 'Decline this request?', adm_confirm_delete: 'Delete this member?',
        adm_self: 'You',
        adm_log: 'Check-in log', adm_log_none: 'No check-ins recorded yet', adm_today: 'Today',
        adm_rebuild_dir: 'Rebuild members directory', adm_rebuild_done: 'Directory updated ✓'
      }
    },

    async render(view) {
      if (!(window.Auth && Auth.isStaff && Auth.isStaff())) { App.go('home'); return; }
      const db = Auth.getDb();
      const isAdmin = Auth.isAdmin();
      const canRequests = Auth.can('requests');
      view.appendChild(UI.pageTitle(I18n.t('adm_title'), I18n.t('adm_sub')));

      // enable browser notifications for new requests
      if (canRequests && window.Notification && Notification.permission !== 'granted') {
        const nb = UI.el('button', { class: 'btn btn-block', style: 'margin-bottom:10px', onclick: () => {
          try { Notification.requestPermission().then(() => { nb.remove(); }); } catch (e) {}
        } }, I18n.t('ntf_enable'));
        view.appendChild(nb);
      }

      // ---- Join requests (admin or co-admin with the permission) ----
      let reqWrap = null;
      if (canRequests) {
        reqWrap = UI.el('div');
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_requests')));
        view.appendChild(reqWrap);
      }

      // ---- Members management (admin only) ----
      let memWrap = null;
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_members')));
        view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [
          UI.el('button', { class: 'btn btn-block', onclick: openAdd }, '+ ' + I18n.t('adm_add'))
        ]));
        view.appendChild(UI.el('div', { class: 'add-fab-wrap', style: 'margin-top:-8px' }, [
          UI.el('button', { class: 'btn btn-ghost btn-block', onclick: (e) => rebuildDirectory(e.target) }, '🔄  ' + I18n.t('adm_rebuild_dir'))
        ]));
        memWrap = UI.el('div');
        view.appendChild(memWrap);
      }

      await load();

      // ---- Check-in log (admin only) ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_log')));
        const logWrap = UI.el('div');
        view.appendChild(logWrap);
        loadLog(logWrap);
      }

      // Create a phone-free directory entry (returns its id). Reuses an existing one if given.
      async function ensureDir(name, existingDirId) {
        if (existingDirId) return existingDirId;
        const ref = await db.collection('directory').add({
          name: name || '', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return ref.id;
      }
      async function removeDir(dirId) {
        if (!dirId) return;
        try { await db.collection('directory').doc(dirId).delete(); } catch (e) {}
      }
      // One-time backfill: give every approved member a directory entry.
      async function rebuildDirectory(btn) {
        const orig = btn.textContent; btn.disabled = true; btn.textContent = '…';
        try {
          const snap = await db.collection('members').get();
          const tasks = [];
          snap.forEach((d) => {
            const m = Object.assign({ phone: d.id }, d.data());
            const approved = m.status === 'approved' || m.approved === true;
            if (approved && !m.dirId) {
              tasks.push((async () => {
                const dirId = await ensureDir(m.name);
                await db.collection('members').doc(m.phone).update({ dirId });
              })());
            }
          });
          await Promise.all(tasks);
          btn.textContent = I18n.t('adm_rebuild_done');
          setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2200);
        } catch (e) { alert(e.message || 'Error'); btn.textContent = orig; btn.disabled = false; }
      }

      async function load() {
        if (reqWrap) reqWrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        if (memWrap) memWrap.innerHTML = '';
        let pending = [], approved = [];
        try {
          const snap = await db.collection('members').get();
          snap.forEach((d) => {
            const m = Object.assign({ phone: d.id }, d.data());
            const st = (m.status === 'approved' || m.approved === true) ? 'approved' : (m.status || 'pending');
            if (st === 'approved') approved.push(m); else pending.push(m);
          });
        } catch (e) {
          if (reqWrap) reqWrap.innerHTML = '<div class="auth-err">' + (e.message || 'Error') + '</div>';
          return;
        }
        if (reqWrap) {
          reqWrap.innerHTML = '';
          if (!pending.length) reqWrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_no_requests')));
          pending.forEach((m) => reqWrap.appendChild(requestCard(m)));
        }
        if (memWrap) {
          memWrap.innerHTML = '';
          if (!approved.length) memWrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_no_members')));
          approved.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          approved.forEach((m) => memWrap.appendChild(memberCard(m)));
        }
      }

      function requestCard(m) {
        return UI.el('div', { class: 'card' }, [
          UI.el('div', { class: 'flex-between' }, [
            UI.el('div', null, [
              UI.el('div', { class: 'card-title', style: 'margin:0' }, m.name || '—'),
              UI.el('div', { class: 'card-meta' }, m.phone)
            ]),
            UI.el('div', { class: 'row', style: 'gap:8px' }, [
              UI.el('button', { class: 'btn', style: 'padding:8px 14px', onclick: async () => {
                const dirId = await ensureDir(m.name, m.dirId);
                await db.collection('members').doc(m.phone).update({ status: 'approved', dirId }); load();
              } }, I18n.t('adm_approve')),
              UI.el('button', { class: 'btn btn-ghost', style: 'padding:8px 14px;color:var(--maroon);border-color:var(--maroon)',
                onclick: () => UI.confirm(I18n.t('adm_confirm_decline'), async () => { await removeDir(m.dirId); await db.collection('members').doc(m.phone).delete(); load(); }) },
                I18n.t('adm_decline'))
            ])
          ])
        ]);
      }

      function badgeFor(m) {
        if (m.admin === true) return UI.el('span', { class: 'chip' }, I18n.t('adm_admin_badge'));
        if (m.perms && Object.values(m.perms).some(Boolean)) return UI.el('span', { class: 'chip chip-blue' }, I18n.t('adm_coadmin_badge'));
        return null;
      }

      function memberCard(m) {
        const isSelf = Auth.phone() === m.phone;
        return UI.el('div', { class: 'card' }, [
          UI.el('div', { class: 'flex-between' }, [
            UI.el('div', { class: 'row' }, [
              UI.el('div', { class: 'avatar' }, UI.initials(m.name)),
              UI.el('div', null, [
                UI.el('div', { class: 'card-title', style: 'margin:0' },
                  (m.name || '—') + (isSelf ? ' (' + I18n.t('adm_self') + ')' : '')),
                UI.el('div', { class: 'card-meta' }, m.phone),
                badgeFor(m)
              ])
            ]),
            UI.el('div', { class: 'row', style: 'gap:6px' }, [
              UI.el('button', { class: 'btn-ghost', style: 'border:none;cursor:pointer;color:var(--navy);padding:4px 8px',
                onclick: () => openEdit(m) }, I18n.t('adm_edit')),
              isSelf ? null : UI.el('button', { style: 'border:none;background:none;color:var(--maroon);cursor:pointer;font-size:1.2rem',
                onclick: () => UI.confirm(I18n.t('adm_confirm_delete'), async () => { await removeDir(m.dirId); await db.collection('members').doc(m.phone).delete(); load(); }) }, '×')
            ])
          ])
        ]);
      }

      function openAdd() {
        UI.modal(I18n.t('adm_add'), [
          { name: 'phone', label: I18n.t('adm_phone') + ' (05XXXXXXXX)', type: 'tel', required: true, value: '' },
          { name: 'name', label: I18n.t('adm_name'), required: true },
          { name: 'role', label: I18n.t('adm_role'), type: 'select', value: 'member', options: [
            { value: 'member', label: I18n.t('adm_role_member') },
            { value: 'coadmin', label: I18n.t('adm_role_coadmin') },
            { value: 'admin', label: I18n.t('adm_role_admin') }
          ] },
          { name: 'p_requests', label: I18n.t('adm_perm_requests') + ' (' + I18n.t('adm_role_coadmin') + ')', type: 'select',
            value: 'no', options: yn() }
        ], async (data) => {
          const phone = normalizePhone(data.phone);
          const dirId = await ensureDir(data.name);
          const rec = { name: data.name, status: 'approved', dirId: dirId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp() };
          if (data.role === 'admin') { rec.admin = true; rec.perms = {}; }
          else if (data.role === 'coadmin') { rec.admin = false; rec.perms = { requests: data.p_requests === 'yes' }; }
          else { rec.admin = false; rec.perms = {}; }
          await db.collection('members').doc(phone).set(rec);
          load();
        });
      }

      function openEdit(m) {
        const curRole = m.admin === true ? 'admin' : ((m.perms && Object.values(m.perms).some(Boolean)) ? 'coadmin' : 'member');
        UI.modal(I18n.t('adm_edit'), [
          { name: 'name', label: I18n.t('adm_name'), required: true, value: m.name || '' },
          { name: 'role', label: I18n.t('adm_role'), type: 'select', value: curRole, options: [
            { value: 'member', label: I18n.t('adm_role_member') },
            { value: 'coadmin', label: I18n.t('adm_role_coadmin') },
            { value: 'admin', label: I18n.t('adm_role_admin') }
          ] },
          { name: 'p_requests', label: I18n.t('adm_perm_requests') + ' (' + I18n.t('adm_role_coadmin') + ')', type: 'select',
            value: (m.perms && m.perms.requests) ? 'yes' : 'no', options: yn() }
        ], async (data) => {
          const patch = { name: data.name };
          if (data.role === 'admin') { patch.admin = true; patch.perms = {}; }
          else if (data.role === 'coadmin') { patch.admin = false; patch.perms = { requests: data.p_requests === 'yes' }; }
          else { patch.admin = false; patch.perms = {}; }
          await db.collection('members').doc(m.phone).update(patch);
          if (m.dirId) { try { await db.collection('directory').doc(m.dirId).set({ name: data.name }, { merge: true }); } catch (e) {} }
          load();
        });
      }

      async function loadLog(wrap) {
        wrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        let rows = [];
        try {
          const snap = await db.collection('checkins').get();
          snap.forEach((d) => rows.push(d.data()));
        } catch (e) { wrap.innerHTML = '<div class="auth-err">' + (e.message || 'Error') + '</div>'; return; }
        wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_log_none'))); return; }
        // group by day
        const byDay = {};
        rows.forEach((r) => { (byDay[r.day] = byDay[r.day] || []).push(r); });
        const days = Object.keys(byDay).sort((a, b) => dayNum(b) - dayNum(a));
        days.forEach((day) => {
          const people = byDay[day].sort((a, b) => ((a.at && a.at.seconds) || 0) - ((b.at && b.at.seconds) || 0));
          const box = UI.el('div', { class: 'checkin-list', style: 'margin-bottom:12px' });
          box.appendChild(UI.el('div', { class: 'checkin-h' }, fmtDay(day) + ' · ' + people.length));
          people.forEach((r) => box.appendChild(UI.el('div', { class: 'checkin-row' }, [
            UI.el('span', { class: 'avatar', style: 'width:34px;height:34px;font-size:.8rem' }, UI.initials(r.name)),
            UI.el('span', { class: 'checkin-name' }, r.name || '—'),
            UI.el('span', { class: 'checkin-time' }, r.at && r.at.toDate ? r.at.toDate().toLocaleTimeString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : '')
          ])));
          wrap.appendChild(box);
        });
      }
      function dayNum(d) { const p = (d || '').split('-').map(Number); return (p[0] || 0) * 10000 + (p[1] || 0) * 100 + (p[2] || 0); }
      function fmtDay(d) {
        const p = (d || '').split('-').map(Number); if (p.length < 3) return d;
        const today = new Date(); if (p[0] === today.getFullYear() && p[1] === today.getMonth() + 1 && p[2] === today.getDate()) return I18n.t('adm_today');
        return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      }
    }
  });
})();
