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
        adm_title: 'لوحة الإدارة', adm_sub: 'إدارة الأعضاء وطلبات الانضمام', adm_version: 'نسخة التطبيق:',
        adm_requests: 'طلبات الانضمام', adm_no_requests: 'لا توجد طلبات حالياً',
        adm_members: 'الأعضاء', adm_no_members: 'لا يوجد أعضاء',
        adm_sort: 'الترتيب:', adm_sort_added: 'حسب الإضافة', adm_sort_name: 'حسب الاسم', adm_sort_role: 'حسب الدور', adm_dir: 'تصاعدي/تنازلي',
        adm_geo: 'موقع تسجيل الحضور', adm_geo_enable: 'اشتراط الموقع', adm_geo_on: 'مطلوب (داخل النطاق فقط)', adm_geo_off: 'غير مطلوب',
        adm_geo_radius: 'نطاق المسافة (متر)', adm_geo_label: 'اسم المكان (اختياري)', adm_geo_center: 'مركز الموقع',
        adm_geo_sethere: 'استخدام موقعي الحالي', adm_geo_nocenter: 'لم يُحدّد بعد', adm_geo_needcenter: 'حدّد مركز الموقع أولاً',
        adm_geo_paste: 'ألصق إحداثيات أو رابط خرائط جوجل', adm_geo_openmap: 'افتح في الخرائط للتأكد',
        adm_geo_save: 'حفظ موقع الحضور', adm_geo_saved: 'تم حفظ موقع الحضور ✓',
        adm_approve: 'قبول', adm_decline: 'رفض', adm_add: 'إضافة عضو',
        adm_edit: 'تعديل', adm_delete: 'حذف', adm_admin_badge: 'مشرف', adm_coadmin_badge: 'مشرف مساعد',
        adm_name: 'الاسم', adm_phone: 'رقم الجوال',
        adm_role: 'الدور', adm_role_member: 'عضو', adm_role_coadmin: 'مشرف مساعد', adm_role_admin: 'مشرف',
        adm_perm_requests: 'السماح بالموافقة على طلبات الانضمام',
        adm_confirm_decline: 'رفض هذا الطلب؟', adm_confirm_delete: 'حذف هذا العضو؟',
        adm_self: 'أنت',
        adm_log: 'سجل الحضور', adm_log_none: 'لا يوجد حضور مسجّل بعد', adm_log_cancelled: 'ألغى الحضور', adm_today: 'اليوم',
        adm_suggest: 'اقتراحات الأعضاء', adm_suggest_none: 'لا توجد اقتراحات بعد', adm_suggest_del: 'حذف الاقتراح؟',
        adm_reports: 'البلاغات', adm_reports_none: 'لا توجد بلاغات', adm_reports_del: 'حذف هذا البلاغ؟', adm_reports_by: 'من',
        adm_mnt: 'الإيقاف المؤقت (الصيانة)', adm_mnt_state: 'الحالة', adm_mnt_run: 'يعمل', adm_mnt_pause: 'موقوف',
        adm_mnt_msg: 'الرسالة المعروضة للأعضاء', adm_mnt_msg_ph: 'مثال: التطبيق متوقف مؤقتًا، نعود قريبًا',
        adm_mnt_dur: 'المدة', adm_mnt_indef: 'حتى أوقفه يدويًا', adm_mnt_save: 'حفظ',
        adm_mnt_on_now: 'التطبيق متوقف حاليًا ⛔', adm_mnt_off_now: 'التطبيق يعمل ✓',
        adm_mnt_15: '١٥ دقيقة', adm_mnt_60: 'ساعة', adm_mnt_180: '٣ ساعات', adm_mnt_360: '٦ ساعات', adm_mnt_1440: 'يوم كامل',
        adm_gift: 'أكواد الهدايا', adm_gift_import: 'استيراد أكواد', adm_gift_import_ph: 'ألصق الأكواد هنا — كود في كل سطر',
        adm_gift_import_btn: 'إضافة الأكواد', adm_gift_imported: 'تمت إضافة {n} كود ✓', adm_gift_dup: '({d} مكرر تم تجاهله)',
        adm_gift_none: 'لا توجد أكواد بعد — ألصق الأكواد ثم اضغط إضافة',
        adm_gift_distribute: '🎁 توزيع كود لكل عضو (رسالة خاصة)', adm_gift_dist_confirm: 'سيُرسَل كود واحد لكل عضو معتمد (عدا حساب المراجعة) برسالة خاصة رسمية. متابعة؟',
        adm_gift_dist_done: 'تم: أُرسل {s} · مخصص بدون رسالة {p} · تخطّي {k}', adm_gift_notenough: 'الأكواد المتاحة أقل من عدد الأعضاء! المتاح: {a}، المطلوب: {n}',
        adm_gift_available: 'متاح', adm_gift_assigned: 'أُرسل إلى', adm_gift_assigned_nodm: 'مخصص لـ (بدون رسالة — انسخه له)',
        adm_gift_give: 'إعطاء لعضو', adm_gift_pick: 'اختر العضو', adm_gift_copy: 'نسخ', adm_gift_copied: 'نُسخ ✓',
        adm_gift_del: 'حذف هذا الكود؟', adm_gift_working: 'جارٍ التوزيع…',
        adm_gift_msg_head: 'طِرا لمدة شهر — Tira 1 month code', adm_gift_msg_body: '🎁 هديتك من الديوانية — كود الاشتراك:',
        adm_gift_resend: 'إعادة إرسال برسالة محدّثة', adm_gift_resend_confirm: 'سيتم حذف رسالة الهدية القديمة من محادثة كل عضو وإرسال نفس الكود برسالة جديدة. متابعة؟',
        adm_gift_resent: 'تمت إعادة الإرسال لـ {n} عضو ✓'
      },
      en: {
        adm_title: 'Admin panel', adm_sub: 'Manage members and join requests', adm_version: 'App version:',
        adm_requests: 'Join requests', adm_no_requests: 'No requests right now',
        adm_members: 'Members', adm_no_members: 'No members',
        adm_sort: 'Sort:', adm_sort_added: 'By date added', adm_sort_name: 'By name', adm_sort_role: 'By role', adm_dir: 'Ascending/Descending',
        adm_geo: 'Check-in location', adm_geo_enable: 'Require location', adm_geo_on: 'Required (within area only)', adm_geo_off: 'Not required',
        adm_geo_radius: 'Radius (metres)', adm_geo_label: 'Place name (optional)', adm_geo_center: 'Centre point',
        adm_geo_sethere: 'Use my current location', adm_geo_nocenter: 'Not set yet', adm_geo_needcenter: 'Set the centre point first',
        adm_geo_paste: 'Paste coordinates or a Google Maps link', adm_geo_openmap: 'Open in Maps to verify',
        adm_geo_save: 'Save check-in location', adm_geo_saved: 'Check-in location saved ✓',
        adm_approve: 'Approve', adm_decline: 'Decline', adm_add: 'Add member',
        adm_edit: 'Edit', adm_delete: 'Delete', adm_admin_badge: 'Admin', adm_coadmin_badge: 'Co-Admin',
        adm_name: 'Name', adm_phone: 'Mobile number',
        adm_role: 'Role', adm_role_member: 'Member', adm_role_coadmin: 'Co-Admin', adm_role_admin: 'Admin',
        adm_perm_requests: 'Can approve join requests',
        adm_confirm_decline: 'Decline this request?', adm_confirm_delete: 'Delete this member?',
        adm_self: 'You',
        adm_log: 'Check-in log', adm_log_none: 'No check-ins recorded yet', adm_log_cancelled: 'Cancelled', adm_today: 'Today',
        adm_suggest: 'Member suggestions', adm_suggest_none: 'No suggestions yet', adm_suggest_del: 'Delete this suggestion?',
        adm_reports: 'Reports', adm_reports_none: 'No reports', adm_reports_del: 'Delete this report?', adm_reports_by: 'by',
        adm_mnt: 'Maintenance / pause', adm_mnt_state: 'State', adm_mnt_run: 'Running', adm_mnt_pause: 'Paused',
        adm_mnt_msg: 'Message shown to members', adm_mnt_msg_ph: 'e.g. The app is paused, back soon',
        adm_mnt_dur: 'Duration', adm_mnt_indef: 'Until I turn it off', adm_mnt_save: 'Save',
        adm_mnt_on_now: 'The app is paused ⛔', adm_mnt_off_now: 'The app is running ✓',
        adm_mnt_15: '15 minutes', adm_mnt_60: '1 hour', adm_mnt_180: '3 hours', adm_mnt_360: '6 hours', adm_mnt_1440: '1 day',
        adm_gift: 'Gift codes', adm_gift_import: 'Import codes', adm_gift_import_ph: 'Paste codes here — one per line',
        adm_gift_import_btn: 'Add codes', adm_gift_imported: 'Added {n} codes ✓', adm_gift_dup: '({d} duplicates ignored)',
        adm_gift_none: 'No codes yet — paste codes then tap Add',
        adm_gift_distribute: '🎁 Send a code to every member (private DM)', adm_gift_dist_confirm: 'One code will be DM-ed to every approved member (except the review account). Continue?',
        adm_gift_dist_done: 'Done: sent {s} · assigned without DM {p} · skipped {k}', adm_gift_notenough: 'Not enough available codes! Available: {a}, needed: {n}',
        adm_gift_available: 'Available', adm_gift_assigned: 'Sent to', adm_gift_assigned_nodm: 'Assigned to (no DM — copy it for them)',
        adm_gift_give: 'Give to member', adm_gift_pick: 'Pick the member', adm_gift_copy: 'Copy', adm_gift_copied: 'Copied ✓',
        adm_gift_del: 'Delete this code?', adm_gift_working: 'Distributing…',
        adm_gift_msg_head: 'طِرا لمدة شهر — Tira 1 month code', adm_gift_msg_body: '🎁 Your gift from Aldewaniah — subscription code:',
        adm_gift_resend: 'Resend with updated message', adm_gift_resend_confirm: 'The old gift message will be removed from each member\'s chat and the same code re-sent with the new wording. Continue?',
        adm_gift_resent: 'Re-sent to {n} members ✓'
      }
    },

    async render(view) {
      if (!(window.Auth && Auth.isStaff && Auth.isStaff())) { App.go('home'); return; }
      const db = Auth.getDb();
      const isAdmin = Auth.isAdmin();
      const canRequests = Auth.can('requests');

      // ---- member sorting (chosen via the dropdown) ----
      let sortMode = 'added';
      let sortDir = 1;          // 1 = ascending, -1 = descending
      let lastApproved = [];
      const byAdded = (a, b) => {
        const ta = (a.createdAt && a.createdAt.seconds) || 0, tb = (b.createdAt && b.createdAt.seconds) || 0;
        return ta !== tb ? ta - tb : (a.name || '').localeCompare(b.name || '');
      };
      const roleRank = (m) => (m.admin === true ? 0 : ((m.perms && Object.values(m.perms).some(Boolean)) ? 1 : 2));
      function comparatorFor(mode) {
        if (mode === 'name') return (a, b) => (a.name || '').localeCompare(b.name || '');
        if (mode === 'role') return (a, b) => (roleRank(a) - roleRank(b)) || (a.name || '').localeCompare(b.name || '');
        return byAdded;
      }
      function paintMembers() {
        if (!memWrap) return;
        memWrap.innerHTML = '';
        if (!lastApproved.length) { memWrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_no_members'))); return; }
        const cmp = comparatorFor(sortMode);
        lastApproved.slice().sort((a, b) => sortDir * cmp(a, b)).forEach((m) => memWrap.appendChild(memberCard(m)));
      }
      view.appendChild(UI.pageTitle(I18n.t('adm_title'), I18n.t('adm_sub')));

      // app version (read from the active service-worker cache, e.g. "v53")
      const verEl = UI.el('div', { class: 'adm-version' }, I18n.t('adm_version') + ' …');
      view.appendChild(verEl);
      (async () => {
        let v = window.APP_VERSION || '';
        try {
          const keys = await caches.keys();
          const k = keys.find((x) => /aldewaniah-v\d+/.test(x));
          if (k) v = (k.match(/aldewaniah-(v\d+)/) || [])[1] || v;
        } catch (e) {}
        verEl.textContent = I18n.t('adm_version') + ' ' + (v || '—');
      })();

      // enable browser notifications for new requests
      if (canRequests && window.Notification && Notification.permission !== 'granted') {
        const nb = UI.el('button', { class: 'btn btn-block', style: 'margin-bottom:10px', onclick: () => {
          try { Notification.requestPermission().then(() => { nb.remove(); }); } catch (e) {}
        } }, I18n.t('ntf_enable'));
        view.appendChild(nb);
      }

      // ---- Maintenance / pause (admin only) ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_mnt')));
        const mntWrap = UI.el('div');
        view.appendChild(mntWrap);
        loadMaintenance(mntWrap);
      }

      // ---- Check-in location / geofence (admin only) ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_geo')));
        const geoWrap = UI.el('div');
        view.appendChild(geoWrap);
        loadGeo(geoWrap);
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
        const sortSel = UI.el('select', { class: 'fld', onchange: () => { sortMode = sortSel.value; paintMembers(); } }, [
          UI.el('option', { value: 'added' }, I18n.t('adm_sort_added')),
          UI.el('option', { value: 'name' }, I18n.t('adm_sort_name')),
          UI.el('option', { value: 'role' }, I18n.t('adm_sort_role'))
        ]);
        sortSel.value = sortMode;
        const dirBtn = UI.el('button', { class: 'btn btn-ghost adm-dir', title: I18n.t('adm_dir'),
          onclick: () => { sortDir = -sortDir; dirBtn.textContent = sortDir === 1 ? '↑' : '↓'; paintMembers(); } }, '↑');
        view.appendChild(UI.el('div', { class: 'adm-sortrow' }, [UI.el('label', null, I18n.t('adm_sort')), sortSel, dirBtn]));
        memWrap = UI.el('div');
        view.appendChild(memWrap);
      }

      await load();

      // ---- Member suggestions (admin only) — from the AI assistant ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_suggest')));
        const sugWrap = UI.el('div');
        view.appendChild(sugWrap);
        loadSuggestions(sugWrap);
      }

      // ---- Reports (admin only) — reported content / users ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_reports')));
        const repWrap = UI.el('div');
        view.appendChild(repWrap);
        loadReports(repWrap);
      }

      // ---- Gift codes (admin only) — subscriptions gifted to members ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_gift')));
        const giftWrap = UI.el('div');
        view.appendChild(giftWrap);
        loadGifts(giftWrap);
      }

      // ---- Check-in log (admin only) ----
      if (isAdmin) {
        view.appendChild(UI.el('h2', { class: 'section-head' }, I18n.t('adm_log')));
        const logWrap = UI.el('div');
        view.appendChild(logWrap);
        loadLog(logWrap);
      }

      async function loadSuggestions(wrap) {
        wrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        let rows = [];
        try {
          const snap = await db.collection('suggestions').orderBy('at', 'desc').limit(100).get();
          snap.forEach((d) => rows.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) { wrap.innerHTML = '<div class="auth-err">' + (e.message || 'Error') + '</div>'; return; }
        wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_suggest_none'))); return; }
        rows.forEach((s) => {
          const when = s.at && s.at.toDate ? s.at.toDate().toLocaleDateString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          wrap.appendChild(UI.el('div', { class: 'card' }, [
            UI.el('div', { class: 'flex-between' }, [
              UI.el('div', { class: 'card-meta' }, (s.name || '—') + (when ? ' · ' + when : '')),
              UI.el('button', { style: 'border:none;background:none;color:var(--maroon);cursor:pointer;font-size:1.2rem',
                onclick: () => UI.confirm(I18n.t('adm_suggest_del'), async () => { await db.collection('suggestions').doc(s.id).delete(); loadSuggestions(wrap); }) }, '×')
            ]),
            UI.el('div', { style: 'margin-top:4px;line-height:1.6' }, s.text || '')
          ]));
        });
      }

      async function loadReports(wrap) {
        wrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        let rows = [];
        try {
          const snap = await db.collection('reports').orderBy('at', 'desc').limit(100).get();
          snap.forEach((d) => rows.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) { wrap.innerHTML = '<div class="auth-err">' + (e.message || 'Error') + '</div>'; return; }
        wrap.innerHTML = '';
        if (!rows.length) { wrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_reports_none'))); return; }
        rows.forEach((r) => {
          const when = r.at && r.at.toDate ? r.at.toDate().toLocaleDateString(I18n.lang === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          const what = (r.kind === 'profile' ? '👤 ' : '💬 ') + (r.targetName || '—');
          wrap.appendChild(UI.el('div', { class: 'card' }, [
            UI.el('div', { class: 'flex-between' }, [
              UI.el('div', { class: 'card-title', style: 'margin:0' }, what),
              UI.el('button', { style: 'border:none;background:none;color:var(--maroon);cursor:pointer;font-size:1.2rem',
                onclick: () => UI.confirm(I18n.t('adm_reports_del'), async () => { await db.collection('reports').doc(r.id).delete(); loadReports(wrap); }) }, '×')
            ]),
            UI.el('div', { class: 'card-meta' }, I18n.t('adm_reports_by') + ' ' + (r.by || '—') + (when ? ' · ' + when : '')),
            r.reason ? UI.el('div', { style: 'margin-top:4px;line-height:1.6' }, r.reason) : null
          ]));
        });
      }

      /* ---- Gift codes: import, DM-distribute to members, manage leftovers.
         Codes live in the Firestore `giftcodes` collection (ADMIN-ONLY by
         rules — they are never in the app code or the public repo).
         "Distribute" sends each approved member (except the App Review
         demo account) ONE code in an official private message. Leftover
         codes stay here so the admin can give them to new joiners. ---- */
      const REVIEWER_PHONE = '+966555555555';
      function giftMsgText(code) {
        // Exact gift wording chosen by Aziz (2026-07-04), bilingual:
        return 'اشتراك طِرا لمدة شهر مقدمة من تطبيق طِرا بقيادة إبراهيم الحامد\n'
             + 'A month subscription for Tira App, powered by Ebrahim Alhamed\n\n'
             + '🎁 كود الاشتراك / Your code:\n' + code;
      }
      // Send an official admin DM (same data model as js/modules/dm.js)
      async function sendGiftDM(toUid, toName, text) {
        const me = Auth.uid(); const myName = ((Auth.member && Auth.member()) || {}).name || '';
        const tid = me < toUid ? me + '_' + toUid : toUid + '_' + me;
        const tRef = db.collection('dms').doc(tid);
        await tRef.set({
          members: [me, toUid].sort(),
          names: { [me]: myName, [toUid]: toName || '' },
          admins: { [me]: true },
          last: { text: text.split('\n')[0], at: firebase.firestore.FieldValue.serverTimestamp(), uid: me },
          unread: { [toUid]: firebase.firestore.FieldValue.increment(1) }
        }, { merge: true });
        await tRef.collection('msgs').add({
          text: text, uid: me, name: myName, admin: true,
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (window.Push) Push.notify({ kind: 'dm', toUid: toUid, title: '✉️ ' + myName, body: text.split('\n')[0] });
      }
      async function uidForPhone(phone) {
        try { const d = await db.collection('uidmap').doc(phone).get(); return d.exists ? (d.data() || {}).uid : null; }
        catch (e) { return null; }
      }

      async function loadGifts(wrap) {
        wrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        let rows = [];
        try {
          const snap = await db.collection('giftcodes').orderBy('at', 'asc').get();
          snap.forEach((d) => rows.push(Object.assign({ id: d.id }, d.data())));
        } catch (e) { wrap.innerHTML = '<div class="auth-err">' + (e.message || 'Error') + '</div>'; return; }
        wrap.innerHTML = '';

        /* import box */
        const ta = UI.el('textarea', { class: 'fld', rows: '3', placeholder: I18n.t('adm_gift_import_ph'),
          style: 'font-family:ui-monospace,Menlo,monospace;direction:ltr;text-align:left' });
        const impMsg = UI.el('div', { class: 'muted', style: 'font-size:.85rem;margin-top:4px' });
        const impBtn = UI.el('button', { class: 'btn', onclick: async () => {
          const existing = {}; rows.forEach((r) => { existing[r.code] = 1; });
          const codes = (ta.value || '').split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 6);
          let added = 0, dup = 0;
          impBtn.disabled = true;
          for (const c of codes) {
            if (existing[c]) { dup++; continue; }
            existing[c] = 1;
            try {
              await db.collection('giftcodes').add({ code: c, label: I18n.t('adm_gift_msg_head'),
                status: 'available', at: firebase.firestore.FieldValue.serverTimestamp() });
              added++;
            } catch (e) {}
          }
          impBtn.disabled = false; ta.value = '';
          impMsg.textContent = I18n.t('adm_gift_imported').replace('{n}', added) +
            (dup ? ' ' + I18n.t('adm_gift_dup').replace('{d}', dup) : '');
          loadGifts(wrap);
        } }, I18n.t('adm_gift_import_btn'));
        wrap.appendChild(UI.el('div', { class: 'card' }, [
          UI.el('div', { class: 'card-title', style: 'margin:0 0 6px' }, I18n.t('adm_gift_import')),
          ta, UI.el('div', { style: 'margin-top:8px' }, [impBtn]), impMsg
        ]));

        const avail = rows.filter((r) => r.status === 'available');

        /* distribute to all members */
        if (avail.length) {
          const distMsg = UI.el('div', { class: 'muted', style: 'font-size:.85rem;text-align:center;margin:6px 0' });
          const distBtn = UI.el('button', { class: 'btn btn-block btn-green', onclick: async () => {
            if (!window.confirm(I18n.t('adm_gift_dist_confirm'))) return;
            distBtn.disabled = true; distMsg.textContent = I18n.t('adm_gift_working');
            try {
              const ms = await db.collection('members').get();
              const targets = [];
              const givenPhones = {}; rows.forEach((r) => { if (r.toPhone) givenPhones[r.toPhone] = 1; });
              ms.forEach((d) => {
                const m = d.data() || {};
                const ok = (m.status === 'approved' || m.approved === true);
                if (!ok) return;
                if (d.id === REVIEWER_PHONE) return;        // never the App Review demo account
                if (givenPhones[d.id]) return;              // already got a code before
                targets.push({ phone: d.id, name: m.name || '' });
              });
              const pool = rows.filter((r) => r.status === 'available');
              if (pool.length < targets.length) {
                distMsg.textContent = I18n.t('adm_gift_notenough').replace('{a}', pool.length).replace('{n}', targets.length);
                distBtn.disabled = false; return;
              }
              let sent = 0, pend = 0, skip = 0, i = 0;
              for (const t of targets) {
                const codeDoc = pool[i++];
                const uid = await uidForPhone(t.phone);
                try {
                  if (uid) {
                    await sendGiftDM(uid, t.name, giftMsgText(codeDoc.code));
                    await db.collection('giftcodes').doc(codeDoc.id).update({
                      status: 'assigned', toName: t.name, toPhone: t.phone, toUid: uid, sentDM: true,
                      assignedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    sent++;
                  } else {
                    // member never signed in since uidmap existed → no DM possible;
                    // still reserve the code for them, admin copies it manually
                    await db.collection('giftcodes').doc(codeDoc.id).update({
                      status: 'assigned', toName: t.name, toPhone: t.phone, sentDM: false,
                      assignedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    pend++;
                  }
                } catch (e) { skip++; i--; }
                distMsg.textContent = I18n.t('adm_gift_working') + ' ' + (sent + pend + skip) + '/' + targets.length;
              }
              distMsg.textContent = I18n.t('adm_gift_dist_done').replace('{s}', sent).replace('{p}', pend).replace('{k}', skip);
            } catch (e) { distMsg.textContent = e.message || 'Error'; }
            distBtn.disabled = false;
            loadGifts(wrap);
          } }, I18n.t('adm_gift_distribute') + ' (' + avail.length + ')');
          wrap.appendChild(distBtn);
          wrap.appendChild(distMsg);
        }

        /* resend already-delivered codes with the UPDATED gift wording:
           removes the old gift message from each member's private chat,
           then sends a fresh official DM with the same code + new text */
        const delivered = rows.filter((r) => r.status === 'assigned' && r.sentDM && r.toUid);
        if (delivered.length) {
          const rsMsg = UI.el('div', { class: 'muted', style: 'font-size:.85rem;text-align:center;margin:6px 0' });
          const rsBtn = UI.el('button', { class: 'btn btn-block', onclick: async () => {
            if (!window.confirm(I18n.t('adm_gift_resend_confirm'))) return;
            rsBtn.disabled = true;
            const me = Auth.uid();
            let done = 0, fail = 0;
            for (const r of delivered) {
              try {
                const tid = me < r.toUid ? me + '_' + r.toUid : r.toUid + '_' + me;
                // delete the previously sent gift message(s) in this thread
                try {
                  const snap = await db.collection('dms').doc(tid).collection('msgs')
                    .orderBy('at', 'desc').limit(60).get();
                  for (const d of snap.docs) {
                    const t = (d.data() || {}).text || '';
                    if (t.indexOf('Tira 1 month code') >= 0 || t.indexOf('Tira App') >= 0) {
                      await d.ref.delete();
                    }
                  }
                } catch (e) {}
                await sendGiftDM(r.toUid, r.toName, giftMsgText(r.code));
                await db.collection('giftcodes').doc(r.id).update({
                  resentAt: firebase.firestore.FieldValue.serverTimestamp() });
                done++;
              } catch (e) { fail++; }
              rsMsg.textContent = I18n.t('adm_gift_working') + ' ' + (done + fail) + '/' + delivered.length;
            }
            rsMsg.textContent = I18n.t('adm_gift_resent').replace('{n}', done) + (fail ? ' · ✗ ' + fail : '');
            rsBtn.disabled = false;
          } }, '🔁 ' + I18n.t('adm_gift_resend') + ' (' + delivered.length + ')');
          wrap.appendChild(rsBtn);
          wrap.appendChild(rsMsg);
        }

        if (!rows.length) { wrap.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('adm_gift_none'))); return; }

        /* code list — the whole code block is ONE BIG tap-to-copy button
           (thumb-friendly on phones; shows "نُسخ ✓" feedback in place) */
        rows.slice().reverse().forEach((r) => {
          const isAvail = r.status === 'available';
          const codeBtn = UI.el('button', { class: 'gift-code' + (isAvail ? '' : ' used'), type: 'button' }, [
            UI.el('span', { class: 'gift-code-txt' }, r.code),
            UI.el('span', { class: 'gift-code-hint' }, '📋 ' + I18n.t('adm_gift_copy'))
          ]);
          codeBtn.onclick = () => {
            const done = () => {
              codeBtn.classList.add('copied');
              codeBtn.lastChild.textContent = '✓ ' + I18n.t('adm_gift_copied');
              setTimeout(() => { codeBtn.classList.remove('copied'); codeBtn.lastChild.textContent = '📋 ' + I18n.t('adm_gift_copy'); }, 1600);
            };
            try { navigator.clipboard.writeText(r.code).then(done).catch(() => {
              // fallback for older mobile browsers
              const ta2 = document.createElement('textarea'); ta2.value = r.code; document.body.appendChild(ta2);
              ta2.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta2.remove();
            }); } catch (e) {}
          };
          const kids = [
            codeBtn,
            UI.el('div', { class: 'flex-between', style: 'margin-top:6px;align-items:center' }, [
              UI.el('div', { class: 'card-meta', style: 'margin:0' },
                isAvail ? ('✅ ' + I18n.t('adm_gift_available'))
                        : ((r.sentDM ? '📨 ' + I18n.t('adm_gift_assigned') : '⚠️ ' + I18n.t('adm_gift_assigned_nodm')) + ' ' + (r.toName || r.toPhone || '—'))),
              isAvail ? UI.el('div', null, [
                UI.el('button', { class: 'btn btn-ghost', style: 'padding:8px 14px;font-size:.85rem',
                  onclick: () => giveTo(r) }, '🎁 ' + I18n.t('adm_gift_give')),
                UI.el('button', { style: 'border:none;background:none;color:var(--maroon);cursor:pointer;font-size:1.3rem;padding:8px;margin-inline-start:2px',
                  onclick: () => UI.confirm(I18n.t('adm_gift_del'), async () => { await db.collection('giftcodes').doc(r.id).delete(); loadGifts(wrap); }) }, '×')
              ]) : null
            ])
          ];
          wrap.appendChild(UI.el('div', { class: 'card' }, kids));
        });

        /* give one code to a chosen member (e.g. a new joiner) */
        async function giveTo(codeDoc) {
          let members = [];
          try {
            const ms = await db.collection('members').get();
            ms.forEach((d) => { const m = d.data() || {};
              if ((m.status === 'approved' || m.approved === true) && d.id !== REVIEWER_PHONE)
                members.push({ phone: d.id, name: m.name || d.id });
            });
          } catch (e) { return; }
          members.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
          const bd = UI.el('div', { class: 'modal-backdrop' });
          bd.onclick = (e) => { if (e.target === bd) bd.remove(); };
          const list = UI.el('div', { class: 'dm-pick' });
          members.forEach((t) => list.appendChild(UI.el('button', { class: 'dm-pick-row', onclick: async () => {
            bd.remove();
            const uid = await uidForPhone(t.phone);
            try {
              if (uid) await sendGiftDM(uid, t.name, giftMsgText(codeDoc.code));
              await db.collection('giftcodes').doc(codeDoc.id).update({
                status: 'assigned', toName: t.name, toPhone: t.phone, toUid: uid || null, sentDM: !!uid,
                assignedAt: firebase.firestore.FieldValue.serverTimestamp() });
            } catch (e) { alert(e.message || 'Error'); }
            loadGifts(wrap);
          } }, [UI.el('span', { class: 'avatar dm-av' }, UI.initials(t.name)), UI.el('span', { class: 'dm-pick-name' }, t.name)])));
          bd.appendChild(UI.el('div', { class: 'modal dm-pick-modal' }, [
            UI.el('h3', { style: 'margin:0 0 8px' }, I18n.t('adm_gift_pick')), list]));
          document.body.appendChild(bd);
        }
      }

      async function loadMaintenance(wrap) {
        wrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        let cur = {};
        try { const d = await db.collection('config').doc('app').get(); if (d.exists) cur = d.data() || {}; } catch (e) {}
        wrap.innerHTML = '';

        const status = UI.el('div', { class: cur.paused ? 'card chip-red' : 'card', style: 'text-align:center;font-weight:800;margin-bottom:10px;color:' + (cur.paused ? 'var(--maroon)' : 'var(--navy)') },
          cur.paused ? I18n.t('adm_mnt_on_now') : I18n.t('adm_mnt_off_now'));

        const stateSel = UI.el('select', { class: 'fld' });
        [['run', I18n.t('adm_mnt_run')], ['pause', I18n.t('adm_mnt_pause')]].forEach(([v, l]) => stateSel.appendChild(UI.el('option', { value: v }, l)));
        stateSel.value = cur.paused ? 'pause' : 'run';

        const msg = UI.el('textarea', { class: 'fld', maxlength: '200', placeholder: I18n.t('adm_mnt_msg_ph') }); msg.value = cur.message || '';

        const dur = UI.el('select', { class: 'fld' });
        [['0', I18n.t('adm_mnt_indef')], ['15', I18n.t('adm_mnt_15')], ['60', I18n.t('adm_mnt_60')], ['180', I18n.t('adm_mnt_180')], ['360', I18n.t('adm_mnt_360')], ['1440', I18n.t('adm_mnt_1440')]]
          .forEach(([v, l]) => dur.appendChild(UI.el('option', { value: v }, l)));

        const err = UI.el('p', { class: 'auth-err' });
        const ok = UI.el('p', { class: 'auth-ok' });
        const save = UI.el('button', { class: 'btn btn-block' }, I18n.t('adm_mnt_save'));
        save.onclick = async () => {
          err.textContent = ''; ok.textContent = '';
          save.disabled = true; save.textContent = '…';
          try {
            const paused = stateSel.value === 'pause';
            const mins = Number(dur.value) || 0;
            const until = (paused && mins > 0) ? firebase.firestore.Timestamp.fromDate(new Date(Date.now() + mins * 60000)) : null;
            await db.collection('config').doc('app').set({
              paused: paused, message: (msg.value || '').trim(), until: until,
              by: ((Auth.member && Auth.member()) || {}).name || '', at: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            ok.textContent = paused ? I18n.t('adm_mnt_on_now') : I18n.t('adm_mnt_off_now');
            status.textContent = ok.textContent;
          } catch (e) { err.textContent = e.message || 'Error'; }
          save.disabled = false; save.textContent = I18n.t('adm_mnt_save');
        };

        wrap.appendChild(status);
        wrap.appendChild(UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('adm_mnt_state')), stateSel]));
        wrap.appendChild(UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('adm_mnt_msg')), msg]));
        wrap.appendChild(UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('adm_mnt_dur')), dur]));
        wrap.appendChild(err); wrap.appendChild(ok); wrap.appendChild(save);
      }

      function adminPos() {
        return new Promise((res, rej) => { if (!navigator.geolocation) return rej(new Error('no geo')); navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000 }); });
      }
      async function loadGeo(wrap) {
        wrap.innerHTML = '<div class="muted" style="text-align:center;padding:10px">…</div>';
        let cur = {};
        try { const d = await db.collection('config').doc('checkin').get(); if (d.exists) cur = d.data() || {}; } catch (e) {}
        wrap.innerHTML = '';

        const enable = UI.el('select', { class: 'fld' }, [UI.el('option', { value: 'no' }, I18n.t('adm_geo_off')), UI.el('option', { value: 'yes' }, I18n.t('adm_geo_on'))]);
        enable.value = cur.enabled ? 'yes' : 'no';
        const radius = UI.el('input', { class: 'fld', type: 'number', inputmode: 'numeric', min: '20', value: String(cur.radius || 100) });
        const label = UI.el('input', { class: 'fld', type: 'text', maxlength: '40', value: cur.label || '', placeholder: I18n.t('adm_geo_label') });

        // The admin chooses the centre freely: type/paste coordinates, paste a
        // Google Maps link, or (optionally) use the current location.
        const latIn = UI.el('input', { class: 'fld', type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'lat', value: (cur.lat != null ? String(cur.lat) : '') });
        const lngIn = UI.el('input', { class: 'fld', type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'lng', value: (cur.lng != null ? String(cur.lng) : '') });
        const link = UI.el('input', { class: 'fld', type: 'text', placeholder: I18n.t('adm_geo_paste') });
        link.onchange = () => {
          const m = (link.value || '').match(/(-?\d{1,3}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})/);
          if (m) { latIn.value = m[1]; lngIn.value = m[2]; link.value = ''; updMap(); }
        };
        const here = UI.el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:4px' }, '📍 ' + I18n.t('adm_geo_sethere'));
        here.onclick = async () => {
          here.disabled = true; here.textContent = '…';
          try { const p = await adminPos(); latIn.value = p.coords.latitude.toFixed(6); lngIn.value = p.coords.longitude.toFixed(6); updMap(); }
          catch (e) { alert(I18n.t('home_loc_denied')); }
          here.disabled = false; here.textContent = '📍 ' + I18n.t('adm_geo_sethere');
        };
        const mapLink = UI.el('a', { class: 'muted', style: 'display:inline-block;font-size:.82rem;margin-top:6px', target: '_blank', rel: 'noopener' }, '🗺️ ' + I18n.t('adm_geo_openmap'));
        function updMap() { mapLink.href = 'https://www.google.com/maps?q=' + (latIn.value || 0) + ',' + (lngIn.value || 0); }
        updMap(); latIn.oninput = updMap; lngIn.oninput = updMap;

        const ok = UI.el('p', { class: 'auth-ok' });
        const err = UI.el('p', { class: 'auth-err' });
        const save = UI.el('button', { class: 'btn btn-block' }, I18n.t('adm_geo_save'));
        save.onclick = async () => {
          err.textContent = ''; ok.textContent = '';
          const lat = parseFloat(latIn.value), lng = parseFloat(lngIn.value);
          const hasCenter = isFinite(lat) && isFinite(lng);
          if (enable.value === 'yes' && !hasCenter) { err.textContent = I18n.t('adm_geo_needcenter'); return; }
          save.disabled = true; save.textContent = '…';
          try {
            await db.collection('config').doc('checkin').set({
              enabled: enable.value === 'yes', radius: Math.max(20, Number(radius.value) || 100),
              lat: hasCenter ? lat : null, lng: hasCenter ? lng : null,
              label: (label.value || '').trim(), by: ((Auth.member && Auth.member()) || {}).name || '',
              at: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            ok.textContent = I18n.t('adm_geo_saved');
          } catch (e) { err.textContent = e.message || 'Error'; }
          save.disabled = false; save.textContent = I18n.t('adm_geo_save');
        };

        wrap.appendChild(UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('adm_geo_enable')), enable]));
        wrap.appendChild(UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('adm_geo_radius')), radius]));
        wrap.appendChild(UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('adm_geo_label')), label]));
        wrap.appendChild(UI.el('div', { class: 'field' }, [
          UI.el('label', null, I18n.t('adm_geo_center')),
          UI.el('div', { class: 'cal-row2' }, [latIn, lngIn]),
          link, here, UI.el('div', null, [mapLink])
        ]));
        wrap.appendChild(err); wrap.appendChild(ok); wrap.appendChild(save);
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
          pending.sort(byAdded);
          pending.forEach((m) => reqWrap.appendChild(requestCard(m)));
        }
        if (memWrap) {
          lastApproved = approved;
          paintMembers();
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
                await db.collection('members').doc(m.phone).update({ status: 'approved' }); load();
              } }, I18n.t('adm_approve')),
              UI.el('button', { class: 'btn btn-ghost', style: 'padding:8px 14px;color:var(--maroon);border-color:var(--maroon)',
                onclick: () => UI.confirm(I18n.t('adm_confirm_decline'), async () => { await db.collection('members').doc(m.phone).delete(); load(); }) },
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
                onclick: () => UI.confirm(I18n.t('adm_confirm_delete'), async () => { await db.collection('members').doc(m.phone).delete(); load(); }) }, '×')
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
          const rec = { name: data.name, status: 'approved',
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
          // Push the new name straight to this member's directory card (instant),
          // using the private phone->uid map. (Falls back to the member's own
          // on-open sync if no map entry exists yet.)
          try {
            const map = await db.collection('uidmap').doc(m.phone).get();
            const uid = map.exists && map.data() && map.data().uid;
            if (uid) await db.collection('directory').doc(uid).set({ name: data.name }, { merge: true });
          } catch (e) {}
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
          const active = people.filter((r) => !r.removed).length;
          const box = UI.el('div', { class: 'checkin-list', style: 'margin-bottom:12px' });
          box.appendChild(UI.el('div', { class: 'checkin-h' }, fmtDay(day) + ' · ' + active));
          people.forEach((r) => box.appendChild(UI.el('div', { class: 'checkin-row' + (r.removed ? ' removed' : '') }, [
            UI.el('span', { class: 'avatar', style: 'width:34px;height:34px;font-size:.8rem' }, UI.initials(r.name)),
            UI.el('span', { class: 'checkin-name' }, r.name || '—'),
            r.removed ? UI.el('span', { class: 'chip chip-red' }, I18n.t('adm_log_cancelled')) : null,
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
