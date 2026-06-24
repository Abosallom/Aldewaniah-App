/* ===========================================================
   Buzzer (البازر) — local, peer-to-peer quiz buzzer.
   Players are on their own phones on the SAME WiFi. Firebase
   Realtime Database is used ONLY for the one-time WebRTC
   handshake; the actual buzz presses travel device-to-device
   (RTCDataChannel) so there is no cloud round-trip.

   Roles:
   - Host (مقدّم): creates a room, manages players, arms/resets
     each round, and also plays (has their own buzzer).
   - Player: joins by code + name (members prefill their name,
     guests just type one), then buzzes.

   Buzz order is decided by the HOST's receive time (single clock)
   → fair and instant on a local network.
   =========================================================== */
(function () {
  const RTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code4 = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

  let session = null; // active room session (so we can tear down on re-render)

  function ensureFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  }
  async function ensureAuth() {
    ensureFirebase();
    const auth = firebase.auth();
    if (auth.currentUser) return auth.currentUser;
    const cred = await auth.signInAnonymously();
    return cred.user;
  }
  // Per-tab identity (Firebase auth is shared across tabs in one browser, so we
  // can't use the uid to tell two participants apart — use a per-session id).
  function myId() {
    let id = sessionStorage.getItem('bz_id');
    if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); sessionStorage.setItem('bz_id', id); }
    return id;
  }
  function defaultName() {
    try { const m = window.Auth && Auth.isMember && Auth.isMember() && Auth.member(); return (m && m.name) || ''; } catch (e) { return ''; }
  }

  Sections.add({
    id: 'buzzer',
    title: { ar: 'البازر', en: 'Buzzer' },
    subtitle: { ar: 'تنافسوا بالضغط — على نفس الشبكة', en: 'Race to buzz — same WiFi' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="13" r="7"/><path d="M12 3v3M9 4h6M5.5 8L4 6.5M18.5 8L20 6.5"/></svg>',
    strings: {
      ar: {
        bz_title: 'البازر', bz_sub: 'لعبة الضغط — جميع اللاعبين على نفس شبكة الواي فاي',
        bz_name: 'اسمك', bz_name_ph: 'اكتب اسمك للانضمام',
        bz_create: 'أنشئ غرفة (مقدّم)', bz_join: 'انضم بغرفة', bz_code: 'رمز الغرفة',
        bz_join_btn: 'انضمام', bz_need_name: 'اكتب اسمك أولاً', bz_room: 'الغرفة',
        bz_host: 'المقدّم', bz_players: 'اللاعبون', bz_arm: 'ابدأ الجولة', bz_reset: 'إيقاف/تصفير',
        bz_round: 'الجولة', bz_results: 'الترتيب', bz_waiting: 'بانتظار بدء الجولة…',
        bz_press: 'اضغـط!', bz_armed: 'استعد… اضغط بسرعة!', bz_you: 'أنت',
        bz_first: 'الأول!', bz_buzzed: 'سجّلت ضغطتك', bz_leave: 'مغادرة',
        bz_connecting: 'جارٍ الاتصال…', bz_connected: 'متصل', bz_failed: 'تعذّر الاتصال (قد تمنع الشبكة الاتصال المباشر)',
        bz_no_room: 'لا توجد غرفة بهذا الرمز', bz_no_players: 'لا أحد انضم بعد',
        bz_share: 'شارك الرمز مع اللاعبين', bz_kick: 'إزالة', bz_offline: 'غير متصل', bz_ms: 'مللي ثانية'
      },
      en: {
        bz_title: 'Buzzer', bz_sub: 'Tap-to-buzz — all players on the same WiFi',
        bz_name: 'Your name', bz_name_ph: 'Type your name to join',
        bz_create: 'Create room (host)', bz_join: 'Join a room', bz_code: 'Room code',
        bz_join_btn: 'Join', bz_need_name: 'Enter your name first', bz_room: 'Room',
        bz_host: 'Host', bz_players: 'Players', bz_arm: 'Start round', bz_reset: 'Stop / reset',
        bz_round: 'Round', bz_results: 'Order', bz_waiting: 'Waiting for the round to start…',
        bz_press: 'BUZZ!', bz_armed: 'Get ready… buzz fast!', bz_you: 'You',
        bz_first: 'First!', bz_buzzed: 'Your buzz is in', bz_leave: 'Leave',
        bz_connecting: 'Connecting…', bz_connected: 'Connected', bz_failed: 'Couldn’t connect (the network may block direct device links)',
        bz_no_room: 'No room with that code', bz_no_players: 'No one has joined yet',
        bz_share: 'Share the code with players', bz_kick: 'Remove', bz_offline: 'offline', bz_ms: 'ms'
      }
    },

    render(view) {
      // tear down any previous session when re-entering
      if (session) { try { session.close(); } catch (e) {} session = null; }

      view.appendChild(UI.pageTitle(I18n.t('bz_title'), I18n.t('bz_sub')));
      const root = UI.el('div', { class: 'bz' });
      view.appendChild(root);
      lobby();

      function lobby() {
        if (session) { try { session.close(); } catch (e) {} session = null; }
        root.innerHTML = '';
        const name = UI.el('input', { class: 'fld', value: defaultName(), placeholder: I18n.t('bz_name_ph') });
        const codeIn = UI.el('input', { class: 'fld', maxlength: '4', placeholder: 'ABCD',
          style: 'text-transform:uppercase;letter-spacing:4px;text-align:center;font-weight:700' });
        const err = UI.el('p', { class: 'auth-err' });

        root.appendChild(UI.el('div', { class: 'card' }, [
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('bz_name')), name]),
          UI.el('button', { class: 'btn btn-green btn-block', style: 'margin-top:4px',
            onclick: () => { if (!name.value.trim()) { err.textContent = I18n.t('bz_need_name'); return; } startHost(name.value.trim()); } },
            I18n.t('bz_create')),
          err
        ]));

        root.appendChild(UI.el('div', { class: 'card' }, [
          UI.el('h3', { class: 'card-title' }, I18n.t('bz_join')),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('bz_code')), codeIn]),
          UI.el('button', { class: 'btn btn-block',
            onclick: () => {
              const c = (codeIn.value || '').toUpperCase().trim();
              if (!name.value.trim()) { err.textContent = I18n.t('bz_need_name'); return; }
              if (c.length !== 4) { err.textContent = I18n.t('bz_code'); return; }
              startPlayer(c, name.value.trim());
            } }, I18n.t('bz_join_btn'))
        ]));
      }

      /* ----------------------- HOST ----------------------- */
      async function startHost(hostName) {
        root.innerHTML = '';
        const status = UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bz_connecting'));
        root.appendChild(status);
        let me;
        try { me = await ensureAuth(); } catch (e) { status.textContent = e.message || 'auth error'; return; }

        ensureFirebase();
        const db = firebase.database();
        const code = code4();
        const roomRef = db.ref('buzz/' + code);
        const connsRef = roomRef.child('conns');
        const hostUid = myId();
        await roomRef.child('host').set({ name: hostName, uid: hostUid, at: firebase.database.ServerValue.TIMESTAMP });
        roomRef.onDisconnect().remove();

        const peers = {};            // id -> {pc, ch, name, open}
        let phase = 'idle', round = 0, armedAt = 0;
        const buzzes = {};           // id -> ms (relative to armedAt)
        const nameFor = (uid) => uid === hostUid ? hostName + ' (' + I18n.t('bz_host') + ')' : (peers[uid] && peers[uid].name) || '—';

        function broadcast(msg) {
          const data = JSON.stringify(msg);
          Object.values(peers).forEach((p) => { if (p.open && p.ch.readyState === 'open') { try { p.ch.send(data); } catch (e) {} } });
        }
        function stateMsg() { return { t: 'state', phase, round }; }
        function orderList() {
          return Object.keys(buzzes).sort((a, b) => buzzes[a] - buzzes[b]).map((uid) => ({ name: nameFor(uid), ms: buzzes[uid] }));
        }
        function broadcastResults() { broadcast({ t: 'results', order: orderList() }); }

        function arm() { phase = 'armed'; round++; Object.keys(buzzes).forEach((k) => delete buzzes[k]); armedAt = Date.now(); broadcast(stateMsg()); paint(); }
        function reset() { phase = 'idle'; Object.keys(buzzes).forEach((k) => delete buzzes[k]); broadcast(stateMsg()); paint(); }
        function handleBuzz(uid) {
          if (phase !== 'armed' || buzzes[uid] != null) return;
          buzzes[uid] = Math.max(0, Date.now() - armedAt);
          broadcastResults(); paint();
        }
        function hostBuzz() { handleBuzz(hostUid); }

        // new player connects (player is the caller / offerer)
        connsRef.on('child_added', async (snap) => {
          const uid = snap.key; const data = snap.val() || {};
          if (peers[uid] || !data.offer) return;
          const pc = new RTCPeerConnection(RTC);
          peers[uid] = { pc, ch: null, name: data.name || '—', open: false };
          pc.onicecandidate = (e) => { if (e.candidate) connsRef.child(uid).child('answerCandidates').push(e.candidate.toJSON()); };
          pc.ondatachannel = (e) => {
            const ch = e.channel; peers[uid].ch = ch;
            ch.onopen = () => { peers[uid].open = true; try { ch.send(JSON.stringify(stateMsg())); ch.send(JSON.stringify({ t: 'results', order: orderList() })); } catch (x) {} paint(); };
            ch.onclose = () => { peers[uid].open = false; paint(); };
            ch.onmessage = (m) => { let d; try { d = JSON.parse(m.data); } catch (x) { return; } if (d.t === 'hello') { peers[uid].name = d.name; paint(); } else if (d.t === 'buzz') handleBuzz(uid); };
          };
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
            connsRef.child(uid).child('answer').set({ type: ans.type, sdp: ans.sdp });
            connsRef.child(uid).child('offerCandidates').on('child_added', (s) => { pc.addIceCandidate(new RTCIceCandidate(s.val())).catch(() => {}); });
          } catch (e) {}
        });

        session = {
          close() {
            try { Object.values(peers).forEach((p) => p.pc && p.pc.close()); } catch (e) {}
            try { connsRef.off(); } catch (e) {}
            try { roomRef.onDisconnect().cancel(); roomRef.remove(); } catch (e) {}
          }
        };

        function paint() {
          root.innerHTML = '';
          // room code header
          root.appendChild(UI.el('div', { class: 'bz-codecard' }, [
            UI.el('div', { class: 'bz-code-label' }, I18n.t('bz_share')),
            UI.el('div', { class: 'bz-code' }, code),
            UI.el('div', { class: 'bz-round' }, I18n.t('bz_round') + ' ' + round)
          ]));
          // controls
          root.appendChild(UI.el('div', { class: 'bz-hostctrl' }, [
            UI.el('button', { class: 'btn btn-green', onclick: arm }, I18n.t('bz_arm')),
            UI.el('button', { class: 'btn btn-ghost', onclick: reset }, I18n.t('bz_reset'))
          ]));
          // host's own buzzer
          root.appendChild(hostBuzzer());
          // results
          root.appendChild(results(orderList(), hostUid));
          // players roster
          const list = UI.el('div', { class: 'bz-roster' });
          list.appendChild(UI.el('div', { class: 'bz-roster-h' }, I18n.t('bz_players')));
          const entries = Object.keys(peers);
          if (!entries.length) list.appendChild(UI.el('div', { class: 'bz-empty' }, I18n.t('bz_no_players')));
          entries.forEach((uid) => list.appendChild(UI.el('div', { class: 'bz-rosrow' }, [
            UI.el('span', null, (peers[uid].name || '—') + (peers[uid].open ? '' : ' · ' + I18n.t('bz_offline'))),
            UI.el('button', { class: 'bz-kick', onclick: () => { try { peers[uid].pc.close(); } catch (e) {} delete peers[uid]; delete buzzes[uid]; connsRef.child(uid).remove(); paint(); } }, '×')
          ])));
          root.appendChild(list);
          root.appendChild(leaveBtn());
        }

        function hostBuzzer() {
          const armed = phase === 'armed';
          const mine = buzzes[hostUid] != null;
          const pos = mine ? (orderList().findIndex((o) => o.name === nameFor(hostUid)) + 1) : 0;
          const b = UI.el('button', {
            class: 'bz-buzz' + (armed && !mine ? ' live' : '') + (mine ? ' done' : ''),
            disabled: armed && !mine ? null : 'true', onclick: hostBuzz
          }, mine ? (pos === 1 ? I18n.t('bz_first') : '#' + pos) : (armed ? I18n.t('bz_press') : I18n.t('bz_waiting')));
          return UI.el('div', { class: 'bz-buzz-wrap' }, [UI.el('div', { class: 'muted', style: 'text-align:center;margin-bottom:4px' }, I18n.t('bz_you')), b]);
        }

        function leaveBtn() {
          return UI.el('button', { class: 'bz-leave', onclick: () => { try { session.close(); } catch (e) {} session = null; lobby(); } }, I18n.t('bz_leave'));
        }

        paint();
      }

      /* ----------------------- PLAYER ----------------------- */
      async function startPlayer(code, myName) {
        root.innerHTML = '';
        const status = UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bz_connecting'));
        root.appendChild(status);
        let me;
        try { me = await ensureAuth(); } catch (e) { status.textContent = e.message || 'auth error'; return; }

        ensureFirebase();
        const db = firebase.database();
        const roomRef = db.ref('buzz/' + code);
        const hostSnap = await roomRef.child('host').get();
        if (!hostSnap.exists()) { status.textContent = I18n.t('bz_no_room'); root.appendChild(UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px', onclick: lobby }, I18n.t('bz_leave'))); return; }

        const myRef = roomRef.child('conns').child(myId());
        const pc = new RTCPeerConnection(RTC);
        const ch = pc.createDataChannel('buzz');
        let phase = 'idle', round = 0, order = [], connected = false, buzzed = false;

        ch.onopen = () => { connected = true; try { ch.send(JSON.stringify({ t: 'hello', name: myName })); } catch (e) {} paint(); };
        ch.onclose = () => { connected = false; paint(); };
        ch.onmessage = (m) => {
          let d; try { d = JSON.parse(m.data); } catch (e) { return; }
          if (d.t === 'state') { phase = d.phase; round = d.round; if (phase === 'armed') buzzed = false; paint(); }
          else if (d.t === 'results') { order = d.order || []; paint(); }
        };
        pc.onicecandidate = (e) => { if (e.candidate) myRef.child('offerCandidates').push(e.candidate.toJSON()); };
        pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { status.textContent = I18n.t('bz_failed'); } };

        try {
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
          await myRef.update({ name: myName, offer: { type: offer.type, sdp: offer.sdp } });
          myRef.onDisconnect().remove();
          myRef.child('answer').on('value', (s) => { const a = s.val(); if (a && !pc.currentRemoteDescription) pc.setRemoteDescription(new RTCSessionDescription(a)).catch(() => {}); });
          myRef.child('answerCandidates').on('child_added', (s) => { pc.addIceCandidate(new RTCIceCandidate(s.val())).catch(() => {}); });
        } catch (e) { status.textContent = e.message || 'connect error'; }

        // safety: if not connected within 12s, show failed hint
        const failTimer = setTimeout(() => { if (!connected) status.textContent = I18n.t('bz_failed'); }, 12000);

        session = {
          close() {
            clearTimeout(failTimer);
            try { pc.close(); } catch (e) {}
            try { myRef.off(); myRef.onDisconnect().cancel(); myRef.remove(); } catch (e) {}
          }
        };

        function buzz() { if (phase === 'armed' && !buzzed && ch.readyState === 'open') { buzzed = true; try { ch.send(JSON.stringify({ t: 'buzz' })); } catch (e) {} paint(); } }

        function paint() {
          root.innerHTML = '';
          root.appendChild(UI.el('div', { class: 'bz-codecard small' }, [
            UI.el('div', { class: 'bz-code' }, code),
            UI.el('div', { class: 'bz-round' }, (connected ? I18n.t('bz_connected') : I18n.t('bz_connecting')) + ' · ' + I18n.t('bz_round') + ' ' + round)
          ]));
          const armed = phase === 'armed';
          const myPos = buzzed ? (order.findIndex((o) => o.name === myName) + 1) : 0;
          const big = UI.el('button', {
            class: 'bz-buzz big' + (armed && !buzzed ? ' live' : '') + (buzzed ? ' done' : ''),
            disabled: (armed && !buzzed && connected) ? null : 'true', onclick: buzz
          }, buzzed ? (myPos === 1 ? I18n.t('bz_first') : (myPos ? '#' + myPos : I18n.t('bz_buzzed'))) : (armed ? I18n.t('bz_press') : I18n.t('bz_waiting')));
          root.appendChild(UI.el('div', { class: 'bz-buzz-wrap' }, [big]));
          root.appendChild(results(order, null, myName));
          root.appendChild(UI.el('button', { class: 'bz-leave', onclick: () => { try { session.close(); } catch (e) {} session = null; lobby(); } }, I18n.t('bz_leave')));
        }

        paint();
      }

      /* ----------------------- shared ----------------------- */
      function results(order, hostUid, myName) {
        const box = UI.el('div', { class: 'bz-results' });
        box.appendChild(UI.el('div', { class: 'bz-results-h' }, I18n.t('bz_results')));
        if (!order || !order.length) { box.appendChild(UI.el('div', { class: 'bz-empty' }, '—')); return box; }
        order.forEach((o, i) => {
          box.appendChild(UI.el('div', { class: 'bz-resrow' + (i === 0 ? ' first' : '') + (myName && o.name === myName ? ' me' : '') }, [
            UI.el('span', { class: 'bz-rank' }, String(i + 1)),
            UI.el('span', { class: 'bz-rname' }, o.name),
            UI.el('span', { class: 'bz-rms' }, (i === 0 ? '' : '+') + (i === 0 ? '0' : (o.ms - order[0].ms)) + ' ' + I18n.t('bz_ms'))
          ]));
        });
        return box;
      }
    }
  });
})();
