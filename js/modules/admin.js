/* ===========================================================
   Feature module: Admin (admins only)
   - Approve / decline join requests (status 'pending')
   - Add / edit / delete members
   Visible only when Auth.isAdmin(). All writes are also enforced
   server-side by Firestore security rules.
   =========================================================== */
(function () {
  function normalizePhone(raw) {
    let p = (raw || '').replace(/[\s-()]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (!p.startsWith('+')) {
      if (p.startsWith('0')) p = p.slice(1);
      p = (window.DEFAULT_COUNTRY_CODE || '+966') + p;
    }
    return p;
  }

  App.registerModule({
    id: 'admin',
    adminOnly: true,
    title: { ar: 'الإدارة', en: 'Admin' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
    strings: {
      ar: {
        adm_title: 'لوحة الإدارة', adm_sub: 'إدارة الأعضاء وطلبات الانضمام',
        adm_requests: 'طلبات الانضمام', adm_no_requests: 'لا توجد طلبات حالياً',
        adm_members: 'الأعضاء', adm_no_members: 'لا يوجد أعضاء',
        adm_approve: 'قبول', adm_decline: 'رفض', adm_add: 'إضافة عضو',
        adm_edit: 'تعديل', adm_delete: 'حذف', adm_admin_badge: 'مشرف',
        adm_name: 'الاسم', adm_phone: 'رقم الجوال', adm_make_admin: 'صلاحية مشرف',
        adm_confirm_decline: 'رفض هذا الطلب؟', adm_confirm_delete: 'حذف هذا العضو؟',
        adm_self: 'أنت'
      },
      en: {
        adm_title: 'Admin panel', adm_sub: 'Manage members and join requests',
        adm_requests: 'Join requests', adm_no_requests: 'No requests right now',
        adm_members: 'Members', adm_no_members: 'No members',
        adm_approve: 'Approve', adm_decline: 'Decline', adm_add: 'Add member',
        adm_edit: 'Edit', adm_delete: 'Delete', adm_admin_badge: 'Admin',
        adm_name: 'Name', adm_phone: 'Mobile number', adm_make_admin: 'Admin rights',
        adm_confirm_decline: 'Decline this request?', adm_confirm_delete: 'Delete this member?',
        adm_self: 'You'
      }
    },

    async render(view) {
      if (!(window.Auth && Auth.isAdmin())) { App.go('home'); return; }
      const db = Auth.getDb();
      view.appendChild(UI.pageTitle(I18n.t('adm_title'), I18n.t('adm_sub')));

      view.appendChild(UI.el('div', { class: 'add-fab-wrap' }, [
        UI.el('button', { class: 'btn btn-block', onclick: openAdd }, '+ ' + I18n.t('adm_add'))
      ]));

      const reqWrap = UI.el('div');
      const memWrap = UI.el('div');
      view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_requests')));
      view.appendChild(reqWrap);
      view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_members')));
      view.appendChild(memWrap);

      await load();

      async function load() {
        reqWrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        memWrap.innerHTML = '';
        let pending = [], approved = [];
        try {
          const snap = await db.collection('members').get();
          snap.forEach((d) => {
            const m = Object.assign({ phone: d.id }, d.data());
            const st = m.status === 'approved' || m.approved === true ? 'approved' : (m.status || 'pending');
            if (st === 'approved') approved.push(m); else pending.push(m);
          });
        } catch (e) {
          reqWrap.innerHTML = '<div class="auth-err">' + (e.message || 'Error') + '</div>';
          return;
        }
        // requests
        reqWrap.innerHTML = '';
        if (!pending.length) reqWrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_no_requests')));
        pending.forEach((m) => reqWrap.appendChild(requestCard(m)));
        // members
        memWrap.innerHTML = '';
        if (!approved.length) memWrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_no_members')));
        approved.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        approved.forEach((m) => memWrap.appendChild(memberCard(m)));
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
                await db.collection('members').doc(m.phone).update({ status: 'approved' }); load();
              } }, I18n.t('adm_approve')),
              UI.el('button', { class: 'btn btn-ghost', style: 'padding:8px 14px;color:var(--maroon);border-color:var(--maroon)',
                onclick: () => UI.confirm(I18n.t('adm_confirm_decline'), async () => { await db.collection('members').doc(m.phone).delete(); load(); }) },
                I18n.t('adm_decline'))
            ])
          ])
        ]);
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
                m.admin ? UI.el('span', { class: 'chip' }, I18n.t('adm_admin_badge')) : null
              ])
            ]),
            UI.el('div', { class: 'row', style: 'gap:6px' }, [
              UI.el('button', { class: 'btn-ghost', style: 'border:none;cursor:pointer;color:var(--navy);padding:4px 8px',
                onclick: () => openEdit(m) }, I18n.t('adm_edit')),
              isSelf ? null : UI.el('button', { style: 'border:none;background:none;color:var(--maroon);cursor:pointer;font-size:1.2rem',
                onclick: () => UI.confirm(I18n.t('adm_confirm_delete'), async () => { await db.collection('members').doc(m.phone).delete(); load(); }) }, '×')
            ])
          ])
        ]);
      }

      function openAdd() {
        UI.modal(I18n.t('adm_add'), [
          { name: 'phone', label: I18n.t('adm_phone'), type: 'tel', required: true, value: window.DEFAULT_COUNTRY_CODE || '+966' },
          { name: 'name', label: I18n.t('adm_name'), required: true }
        ], async (data) => {
          const phone = normalizePhone(data.phone);
          await db.collection('members').doc(phone).set({
            name: data.name, status: 'approved', admin: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          load();
        });
      }

      function openEdit(m) {
        UI.modal(I18n.t('adm_edit'), [
          { name: 'name', label: I18n.t('adm_name'), required: true, value: m.name || '' },
          { name: 'admin', label: I18n.t('adm_make_admin'), type: 'select',
            value: m.admin ? 'yes' : 'no',
            options: [{ value: 'no', label: I18n.lang === 'ar' ? 'لا' : 'No' }, { value: 'yes', label: I18n.lang === 'ar' ? 'نعم' : 'Yes' }] }
        ], async (data) => {
          await db.collection('members').doc(m.phone).update({
            name: data.name, admin: data.admin === 'yes'
          });
          load();
        });
      }
    }
  });
})();
