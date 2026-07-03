/* ===========================================================
   Moderation helpers (App Store / Google Play UGC compliance).
   - Block users: stored locally; blocked members' chat messages
     are hidden for the person who blocked them.
   - Report content/users: written to the Firestore `reports`
     collection for the admin to review (and act on within 24h).
   =========================================================== */
(function () {
  const KEY = 'aldewaniah.blocked';
  function list() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }

  window.Moderation = {
    blocked() { return list(); },
    // id = the sender's uid (new content) or phone (legacy content)
    isBlocked(id) { return !!id && list().indexOf(id) >= 0; },
    block(id) { if (!id) return; const a = list(); if (a.indexOf(id) < 0) { a.push(id); save(a); } },
    unblock(id) { save(list().filter((p) => p !== id)); },
    toggle(id) { if (this.isBlocked(id)) this.unblock(id); else this.block(id); return this.isBlocked(id); },
    async report(kind, targetId, targetName, reason) {
      try {
        const db = window.Auth && Auth.getDb && Auth.getDb();
        if (!db) return false;
        await db.collection('reports').add({
          kind: kind || 'content', targetId: targetId || '', targetName: targetName || '',
          reason: reason || '', by: ((Auth.member && Auth.member()) || {}).name || '',
          phone: (Auth.phone && Auth.phone()) || '',
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
        return true;
      } catch (e) { return false; }
    }
  };
})();
