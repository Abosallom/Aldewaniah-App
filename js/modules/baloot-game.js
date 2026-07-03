/* ===========================================================
   بلوت أونلاين (Baloot Online) — STAGE 1
   Real-time 4-player Baloot tables for members, following the
   famous Kamelna (كملنا) rules & feel:

   - 32 cards (7..A × 4 suits), fixed teams: seats 0&2 vs 1&3.
   - Deal 5 + flip one card (الشراء), two bidding rounds
     (حكم / صن / بس), then complete hands to 8.
   - صن: A,10,K,Q,J,9,8,7 · حكم trump: J,9,A,10,K,Q,8,7.
   - Follow suit; in حكم you must trump when void and overtrump
     when possible (partner-winning exemption, Kamelna style).
   - آخر أكلة +10 · نشرة to 152 · خسران · كبوت (44 صن / 25 حكم).
   - Stage 2 (مشاريع، دبل/تربل/قهوة، أشكل) intentionally absent.

   Data lives in Firestore:
     balootTables/{code}            public game state (see deal())
     balootTables/{code}/priv/{key} private hands — key = uid, or
                                    'seat0'..'seat3' in practice
                                    mode; 'deck' = undealt rest.
   The HOST's browser shuffles/deals; all moves go through
   db.runTransaction on the public doc (validates phase + turn)
   so double-taps / races can't corrupt the game. This is a
   trusted, invite-only group: rules gate access to approved
   members, game legality is enforced client-side.
   =========================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1) CARD ENGINE — pure functions, no Firestore, no DOM.
     A card is a compact string: rank + suit letter, e.g. 'AS' (ace of
     spades), '10H' (ten of hearts). Suits: S♠ H♥ D♦ C♣.
     ====================================================================== */
  var SUITS = ['S', 'H', 'D', 'C'];
  var RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' }; // ♠ ♥ ♦ ♣

  // strength orders (index = strength; last = strongest)
  var ORDER_SUN = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];       // صن + non-trump suits
  var ORDER_TRUMP = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];      // trump suit in حكم

  // بنط (abnat) values per card
  var PTS_SUN = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
  var PTS_TRUMP = { J: 20, '9': 14, A: 11, '10': 10, K: 4, Q: 3, '8': 0, '7': 0 };

  function suitOf(c) { return c.slice(-1); }
  function rankOf(c) { return c.slice(0, -1); }
  function isRed(c) { var s = suitOf(c); return s === 'H' || s === 'D'; }

  /** Fresh 32-card deck. */
  function newDeck() {
    var d = [];
    SUITS.forEach(function (s) { RANKS.forEach(function (r) { d.push(r + s); }); });
    return d;
  }

  /** Fisher–Yates shuffle (host's Math.random is fine for a friends game). */
  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** بنط value of one card given the round mode. */
  function cardPoints(card, mode, trump) {
    if (mode === 'hokum' && suitOf(card) === trump) return PTS_TRUMP[rankOf(card)];
    return PTS_SUN[rankOf(card)];
  }

  /** Sorting strength (display only): trump suit floats above everything. */
  function strength(card, mode, trump) {
    if (mode === 'hokum' && suitOf(card) === trump) return 100 + ORDER_TRUMP.indexOf(rankOf(card));
    return ORDER_SUN.indexOf(rankOf(card));
  }

  /** Sort a hand for display: group suits (♠♥♣♦), strongest first. */
  function sortHand(hand, mode, trump) {
    var suitPos = { S: 0, H: 1, C: 2, D: 3 };
    return hand.slice().sort(function (a, b) {
      var sa = suitOf(a), sb = suitOf(b);
      if (sa !== sb) return suitPos[sa] - suitPos[sb];
      return strength(b, mode, trump) - strength(a, mode, trump);
    });
  }

  /** Competitive value of a played card for deciding the trick winner:
      trump > led suit > everything else (a discard can never win). */
  function playVal(card, led, mode, trump) {
    var s = suitOf(card);
    if (mode === 'hokum' && s === trump) return 200 + ORDER_TRUMP.indexOf(rankOf(card));
    if (s === led) return 100 + ORDER_SUN.indexOf(rankOf(card));
    return 0;
  }

  /** Winner of a (possibly partial) trick. plays = [{seat, card}] in play order. */
  function winnerOf(plays, mode, trump) {
    var led = suitOf(plays[0].card);
    var best = plays[0];
    for (var i = 1; i < plays.length; i++) {
      if (playVal(plays[i].card, led, mode, trump) > playVal(best.card, led, mode, trump)) best = plays[i];
    }
    return best;
  }

  /** LEGAL MOVES — the heart of the rules (Kamelna style):
      · Always follow the led suit if you can.
      · صن: follow or discard freely, no other duties.
      · حكم extras:
        - Trump led → you must beat the highest trump on the table if you
          can (التعلية), unless your PARTNER is currently winning.
        - Void in led suit → you must play a trump (القص) — and overtrump
          any trump already played if you can — UNLESS your partner is
          currently winning the trick (then you are free, Kamelna rule).
        - If you must trump but can't overtrump, any trump is allowed.   */
  function legalMoves(hand, table, mode, trump, seat) {
    if (!table || !table.length) return hand.slice();          // leading: anything
    var led = suitOf(table[0].card);
    var win = winnerOf(table, mode, trump);
    var partnerWinning = (win.seat % 2) === (seat % 2);
    var follow = hand.filter(function (c) { return suitOf(c) === led; });

    if (mode !== 'hokum') return follow.length ? follow : hand.slice();   // صن

    // highest trump strength already on the table (-1 = none)
    var hiTrump = -1;
    table.forEach(function (p) {
      if (suitOf(p.card) === trump) {
        var v = ORDER_TRUMP.indexOf(rankOf(p.card));
        if (v > hiTrump) hiTrump = v;
      }
    });

    if (follow.length) {
      if (led === trump && !partnerWinning) {
        var over = follow.filter(function (c) { return ORDER_TRUMP.indexOf(rankOf(c)) > hiTrump; });
        if (over.length) return over;                          // must raise on trump lead
      }
      return follow;                                           // plain suit: any follow
    }

    // void in the led suit
    var myTrumps = hand.filter(function (c) { return suitOf(c) === trump; });
    if (!myTrumps.length) return hand.slice();                 // nothing to cut with
    if (partnerWinning) return hand.slice();                   // partner eating → free
    if (hiTrump >= 0) {
      var higher = myTrumps.filter(function (c) { return ORDER_TRUMP.indexOf(rankOf(c)) > hiTrump; });
      if (higher.length) return higher;                        // must OVERtrump if possible
    }
    return myTrumps;                                           // must trump
  }

  /** ROUND SCORING (Kamelna):
      أبناط totals: 130 in صن (120 cards + 10 آخر أكلة), 162 in حكم.
      Convert to نقاط: صن ×2/10 (total 26) · حكم /10 (total 16).
      Simplified Kamelna rounding: opponents = round(theirs), buyer =
      total − opponents (so .5 rounds up for the non-buying team).
      خسران: buyer ≤ opponents → buyer 0, opponents take the whole total.
      كبوت: a team with ZERO tricks → other team gets 44 (صن) / 25 (حكم). */
  function scoreRound(mode, trump, tricksWon, lastTrickTeam, buyerSeat) {
    var bTeam = buyerSeat % 2, oTeam = 1 - bTeam;
    var bnt = { t0: 0, t1: 0 };
    [0, 1].forEach(function (t) {
      (tricksWon['t' + t] || []).forEach(function (c) { bnt['t' + t] += cardPoints(c, mode, trump); });
    });
    bnt['t' + lastTrickTeam] += 10; // آخر أكلة

    var total = mode === 'sun' ? 26 : 16;
    var kabootVal = mode === 'sun' ? 44 : 25;
    var pts = { t0: 0, t1: 0 };
    var khosran = false, kaboot = null;

    if (!(tricksWon['t' + bTeam] || []).length) {              // buyers took nothing
      pts['t' + oTeam] = kabootVal; kaboot = 'opponents';
    } else if (!(tricksWon['t' + oTeam] || []).length) {       // buyers swept everything
      pts['t' + bTeam] = kabootVal; kaboot = 'buyer';
    } else {
      var oPts = mode === 'sun' ? Math.round(bnt['t' + oTeam] * 2 / 10)
                                : Math.round(bnt['t' + oTeam] / 10);
      var bPts = total - oPts;
      if (bPts <= oPts) { khosran = true; pts['t' + oTeam] = total; }
      else { pts['t' + bTeam] = bPts; pts['t' + oTeam] = oPts; }
    }
    return { bnt: bnt, pts: pts, khosran: khosran, kaboot: kaboot, buyerTeam: bTeam, total: total };
  }

  /* ======================================================================
     2) MODULE — lobby, table UI, Firestore sync.
     ====================================================================== */
  var LSKEY = 'aldewaniah.balootGame.table';
  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L lookalikes
  function code4() {
    var out = '';
    for (var i = 0; i < 4; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return out;
  }

  var session = null; // active table session (torn down on re-render)

  Sections.add({
    id: 'balootGame',
    memberOnly: true,
    title: { ar: 'بلوت أونلاين', en: 'Baloot Online' },
    subtitle: { ar: 'صالة بلوت خاصة بالأعضاء', en: 'Private Baloot tables' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="12" height="16" rx="2"/><path d="M15 5.5l4.3 1.2a2 2 0 011.4 2.4L18.2 18.6"/><path d="M9 8.6c-1.9 0-2.6 2.5-.5 3.6l.5.8.5-.8c2.1-1.1 1.4-3.6-.5-3.6z" fill="currentColor" stroke="none"/></svg>',
    strings: {
      ar: {
        bg_title: 'بلوت أونلاين', bg_sub: 'صالة بلوت خاصة بالأعضاء — قوانين كملنا',
        bg_beta: 'بيتا', bg_locked: 'هذا القسم للأعضاء فقط', bg_loading: 'جارٍ التحميل…',
        bg_create: 'إنشاء طاولة', bg_join: 'انضمام بالرمز', bg_code: 'رمز الطاولة',
        bg_join_btn: 'انضمام', bg_resume: 'العودة إلى طاولتك', bg_no_table: 'لا توجد طاولة بهذا الرمز',
        bg_table_ended: 'انتهت الطاولة', bg_err: 'حدث خطأ، حاول مرة أخرى', bg_copied: 'تم نسخ الرمز ✅',
        bg_share_code: 'شارك الرمز مع أصحابك', bg_practice: 'تجربة (لاعب واحد)',
        bg_practice_hint: 'تلعب مكان جميع المقاعد الفارغة لتجربة اللعبة بنفسك',
        bg_sit: 'اجلس هنا', bg_empty_seat: 'مقعد فارغ', bg_start: 'ابدأ اللعب',
        bg_need4: 'بانتظار اكتمال المقاعد (٤ لاعبين)', bg_leave_seat: 'مغادرة المقعد',
        bg_exit: 'خروج', bg_end_table: 'إنهاء الطاولة', bg_end_confirm: 'إنهاء الطاولة للجميع؟',
        bg_us: 'لنا', bg_them: 'لهم', bg_partner: 'معك', bg_dealer: 'موزّع', bg_you: 'أنت',
        bg_turn_of: 'الدور على', bg_your_turn: 'دورك!', bg_playing_as: 'تلعب مكان',
        bg_sun: 'صن', bg_hokum: 'حكم', bg_pass: 'بس', bg_pick_suit: 'اختر نوع الحكم',
        bg_back: 'رجوع', bg_flip: 'الشراء', bg_dealing: 'جارٍ توزيع الورق…',
        bg_redeal: 'ورق! الجميع قال بس — توزيع جديد', bg_bot: 'ضيف',
        bg_round_end: 'نتيجة الجولة', bg_abnat: 'الأبناط', bg_points: 'النقاط',
        bg_khosran: 'خسران! فريق المشتري ما غطّى الشراء', bg_kaboot: 'كبوت!',
        bg_buyer: 'المشتري', bg_next_round: 'الجولة التالية', bg_wait_host: 'بانتظار المضيف…',
        bg_we_won: 'لنا فزنا 🎉', bg_they_won: 'فزتم 👏', bg_new_game: 'لعبة جديدة',
        bg_totals: 'النشرة', bg_mode: 'النمط', bg_last_trick: 'آخر أكلة',
        bg_suit_S: 'سبيت', bg_suit_H: 'هاص', bg_suit_D: 'ديمن', bg_suit_C: 'كلفس',
        bg_spectator: 'تشاهد الطاولة (المقاعد ممتلئة)', bg_full: 'المقاعد ممتلئة'
      },
      en: {
        bg_title: 'Baloot Online', bg_sub: 'Private Baloot tables — Kamelna rules',
        bg_beta: 'Beta', bg_locked: 'Members only', bg_loading: 'Loading…',
        bg_create: 'Create table', bg_join: 'Join with a code', bg_code: 'Table code',
        bg_join_btn: 'Join', bg_resume: 'Return to your table', bg_no_table: 'No table with that code',
        bg_table_ended: 'The table was closed', bg_err: 'Something went wrong, try again', bg_copied: 'Code copied ✅',
        bg_share_code: 'Share the code with your friends', bg_practice: 'Practice (single player)',
        bg_practice_hint: 'You play every empty seat to test the game yourself',
        bg_sit: 'Sit here', bg_empty_seat: 'Empty seat', bg_start: 'Start game',
        bg_need4: 'Waiting for 4 players', bg_leave_seat: 'Leave seat',
        bg_exit: 'Exit', bg_end_table: 'Close table', bg_end_confirm: 'Close the table for everyone?',
        bg_us: 'Us', bg_them: 'Them', bg_partner: 'Partner', bg_dealer: 'Dealer', bg_you: 'You',
        bg_turn_of: 'Turn:', bg_your_turn: 'Your turn!', bg_playing_as: 'Playing as',
        bg_sun: 'Sun', bg_hokum: 'Hokum', bg_pass: 'Pass', bg_pick_suit: 'Pick the trump suit',
        bg_back: 'Back', bg_flip: 'The buy', bg_dealing: 'Dealing…',
        bg_redeal: 'Everyone passed — redealing', bg_bot: 'Guest',
        bg_round_end: 'Round result', bg_abnat: 'Abnat', bg_points: 'Points',
        bg_khosran: 'Khosran! The buying team fell short', bg_kaboot: 'Kaboot!',
        bg_buyer: 'Buyer', bg_next_round: 'Next round', bg_wait_host: 'Waiting for the host…',
        bg_we_won: 'We won 🎉', bg_they_won: 'They won 👏', bg_new_game: 'New game',
        bg_totals: 'Score', bg_mode: 'Mode', bg_last_trick: 'Last trick',
        bg_suit_S: 'Spades', bg_suit_H: 'Hearts', bg_suit_D: 'Diamonds', bg_suit_C: 'Clubs',
        bg_spectator: 'Watching (seats are full)', bg_full: 'Seats are full'
      }
    },

    render(view) {
      // tear down any previous table session (chat.js pattern)
      if (session) { try { session.close(); } catch (e) {} session = null; }

      var head = UI.el('div', { class: 'bg-head' }, [
        UI.el('h1', { class: 'page-title', style: 'margin:0' }, I18n.t('bg_title')),
        UI.el('span', { class: 'bg-beta' }, I18n.t('bg_beta'))
      ]);
      view.appendChild(head);
      view.appendChild(UI.el('p', { class: 'page-sub' }, I18n.t('bg_sub')));

      if (!(window.Auth && Auth.isMember && Auth.isMember())) {
        view.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bg_locked')));
        return;
      }

      var db = Auth.getDb();
      var myUid = Auth.uid();
      var myName = ((Auth.member && Auth.member()) || {}).name || '';
      var FV = firebase.firestore.FieldValue;
      var ts = function () { return FV.serverTimestamp(); };

      var root = UI.el('div', { class: 'bg-wrap' });
      view.appendChild(root);

      /* ---------------- per-table state ---------------- */
      var st = {
        code: null, ref: null, pub: null,
        hands: {},            // priv doc key -> [cards]
        privSubs: {},         // priv doc key -> unsubscribe
        pubUnsub: null,
        guard: '',            // host automation guard (deal/dealRest once)
        collectSig: null, collectTimer: null, sweepTimer: null,
        prevSig: '', prevCount: 0,   // trick animation bookkeeping
        lastActing: null, suitPick: false, suitPickKey: ''
      };

      session = {
        close: function () {
          try { if (st.pubUnsub) st.pubUnsub(); } catch (e) {}
          Object.keys(st.privSubs).forEach(function (k) { try { st.privSubs[k](); } catch (e) {} });
          st.privSubs = {};
          st.pubUnsub = null;
          clearTimeout(st.collectTimer); clearTimeout(st.sweepTimer);
        }
      };

      /* ---------------- tiny helpers ---------------- */
      function toast(msg) {
        try {
          var t = UI.el('div', { class: 'bg-toast' }, msg);
          root.appendChild(t);
          setTimeout(function () { try { t.remove(); } catch (e) {} }, 1900);
        } catch (e) {}
      }
      function isHost() { return !!(st.pub && st.pub.hostUid === myUid); }
      function mySeat() {
        var seats = (st.pub && st.pub.seats) || [];
        for (var i = 0; i < seats.length; i++) {
          if (seats[i] && seats[i].uid === myUid && !seats[i].virtual) return i;
        }
        return -1;
      }
      function controlsSeat(i) {
        var p = st.pub; if (!p || !p.seats || !p.seats[i]) return false;
        if (p.practice) return isHost() || p.seats[i].uid === myUid;
        return p.seats[i].uid === myUid;
      }
      function privKey(i) {
        var p = st.pub;
        if (p && p.practice) return 'seat' + i;
        return (p && p.seats && p.seats[i] && p.seats[i].uid) || ('seat' + i);
      }
      function privRef(i) { return st.ref.collection('priv').doc(privKey(i)); }
      function seatName(i) {
        var s = st.pub && st.pub.seats && st.pub.seats[i];
        return (s && s.name) || (I18n.t('bg_empty_seat'));
      }
      function viewSeat() { var m = mySeat(); return m >= 0 ? m : 0; }
      function relPos(seat) { // rotate so I'm at the bottom; play order runs counter-clockwise
        return ['b', 'r', 't', 'l'][(seat - viewSeat() + 4) % 4];
      }
      /** In practice mode the host acts for whoever's turn it is. */
      function actingSeat() {
        var p = st.pub, mine = mySeat();
        if (!p) return mine;
        if (p.practice && isHost()) {
          if ((p.phase === 'bidding' || p.phase === 'playing') && p.turn >= 0) return p.turn;
          if (st.lastActing != null) return st.lastActing;
          return mine >= 0 ? mine : 0;
        }
        return mine;
      }
      function myTeamKey() { return 't' + (viewSeat() % 2); }
      function themTeamKey() { return 't' + (1 - viewSeat() % 2); }

      /* ================= card DOM (pure CSS/SVG, no images) ================= */
      function cardEl(card, cls) {
        var s = suitOf(card), r = rankOf(card);
        return UI.el('div', { class: 'bg-pcard ' + (isRed(card) ? 'red' : 'black') + (cls ? ' ' + cls : '') }, [
          UI.el('span', { class: 'bg-pc-corner' }, [UI.el('b', null, r), UI.el('i', null, SUIT_CHAR[s])]),
          UI.el('span', { class: 'bg-pc-pip' }, SUIT_CHAR[s]),
          UI.el('span', { class: 'bg-pc-corner flip' }, [UI.el('b', null, r), UI.el('i', null, SUIT_CHAR[s])])
        ]);
      }

      /* ======================================================================
         LOBBY (no table yet)
         ====================================================================== */
      function lobby(note) {
        session.close();
        st.code = null; st.ref = null; st.pub = null; st.hands = {};
        root.innerHTML = '';
        if (note) root.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, note));

        var saved = null;
        try { saved = localStorage.getItem(LSKEY); } catch (e) {}
        if (saved) {
          root.appendChild(UI.el('div', { class: 'card' }, [
            UI.el('button', { class: 'btn btn-green btn-block', onclick: function () { openTable(saved); } },
              I18n.t('bg_resume') + ' · ' + saved)
          ]));
        }

        root.appendChild(UI.el('div', { class: 'card' }, [
          UI.el('button', { class: 'btn btn-green btn-block', onclick: createTable }, I18n.t('bg_create'))
        ]));

        var codeIn = UI.el('input', { class: 'fld', maxlength: '4', placeholder: 'K7RD',
          style: 'text-transform:uppercase;letter-spacing:5px;text-align:center;font-weight:700' });
        root.appendChild(UI.el('div', { class: 'card' }, [
          UI.el('h3', { class: 'card-title' }, I18n.t('bg_join')),
          UI.el('div', { class: 'field' }, [UI.el('label', null, I18n.t('bg_code')), codeIn]),
          UI.el('button', { class: 'btn btn-block', onclick: function () {
            var c = (codeIn.value || '').toUpperCase().trim();
            if (c.length !== 4) { toast(I18n.t('bg_code')); return; }
            joinTable(c);
          } }, I18n.t('bg_join_btn'))
        ]));
      }

      async function createTable() {
        try {
          var code = code4();
          for (var i = 0; i < 5; i++) {
            var snap = await db.collection('balootTables').doc(code).get();
            if (!snap.exists) break;
            code = code4();
          }
          await db.collection('balootTables').doc(code).set({
            code: code, hostUid: myUid, practice: false,
            createdAt: ts(), updatedAt: ts(),
            seats: [{ uid: myUid, name: myName }, null, null, null],
            phase: 'lobby', dealer: 0, turn: -1,
            flip: null, bidRound: 1, bids: [], pendHokum: null,
            mode: null, trump: null, buyer: null,
            table: [], tricksWon: { t0: [], t1: [] }, lastTrickWinner: null,
            roundScores: null, totals: { t0: 0, t1: 0 },
            handCounts: [0, 0, 0, 0], roundNo: 0
          });
          try { localStorage.setItem(LSKEY, code); } catch (e) {}
          openTable(code);
        } catch (e) { toast(I18n.t('bg_err')); }
      }

      async function joinTable(code) {
        try {
          var snap = await db.collection('balootTables').doc(code).get();
          if (!snap.exists) { toast(I18n.t('bg_no_table')); return; }
          try { localStorage.setItem(LSKEY, code); } catch (e) {}
          openTable(code);
        } catch (e) { toast(I18n.t('bg_err')); }
      }

      /* ======================================================================
         OPEN A TABLE — realtime subscriptions
         ====================================================================== */
      function openTable(code) {
        session.close();
        st.code = code;
        st.ref = db.collection('balootTables').doc(code);
        st.pub = null; st.hands = {}; st.privSubs = {}; st.guard = '';
        root.innerHTML = '';
        root.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bg_loading')));

        st.pubUnsub = st.ref.onSnapshot(function (doc) {
          try {
            if (!doc.exists) {
              try { localStorage.removeItem(LSKEY); } catch (e) {}
              lobby(I18n.t('bg_table_ended'));
              return;
            }
            st.pub = doc.data();
            if (st.pub.turn >= 0) st.lastActing = st.pub.turn;
            subscribePrivs();
            hostAutomation();
            scheduleCollect();
            paint();
          } catch (e) { /* defensive: never let a paint error kill the stream */ }
        }, function () { toast(I18n.t('bg_err')); });
      }

      /** Listen to the private hand docs I'm allowed to read. */
      function subscribePrivs() {
        var p = st.pub; if (!p) return;
        var want = [];
        if (p.practice) { want = ['seat0', 'seat1', 'seat2', 'seat3']; }
        else if (myUid) { want = [myUid]; }
        want.forEach(function (key) {
          if (st.privSubs[key]) return;
          st.privSubs[key] = st.ref.collection('priv').doc(key).onSnapshot(function (doc) {
            try {
              st.hands[key] = (doc.exists && (doc.data().cards || [])) || [];
              paint();
            } catch (e) {}
          }, function () {});
        });
      }

      /* ======================================================================
         HOST AUTOMATION — the host's browser is the "dealer machine":
         it completes the deal after a buy and redeals after 8 passes.
         Guarded so each step runs exactly once per roundNo.
         ====================================================================== */
      function hostAutomation() {
        var p = st.pub;
        if (!p || !isHost()) return;
        if (p.phase === 'dealRest' && st.guard !== 'rest' + p.roundNo) {
          st.guard = 'rest' + p.roundNo;
          dealRest().catch(function () { st.guard = ''; toast(I18n.t('bg_err')); });
        }
        if (p.phase === 'redeal' && st.guard !== 'deal' + (p.roundNo + 1)) {
          st.guard = 'deal' + (p.roundNo + 1);
          deal(p.dealer).catch(function () { st.guard = ''; toast(I18n.t('bg_err')); });
        }
      }

      /* ======================================================================
         DEALING (host only)
         ====================================================================== */
      /** Shuffle & deal 5 cards each + the flip; rest waits in priv/deck. */
      async function deal(dealer) {
        var p = st.pub;
        var deck = shuffle(newDeck());
        var batch = db.batch();
        for (var i = 0; i < 4; i++) {
          batch.set(privRef(i), { cards: deck.slice(i * 5, i * 5 + 5), uid: (p.seats[i] && p.seats[i].uid) || null, seat: i });
        }
        batch.set(st.ref.collection('priv').doc('deck'), { cards: deck.slice(21) });
        batch.update(st.ref, {
          phase: 'bidding', dealer: dealer, turn: (dealer + 1) % 4,
          flip: deck[20], bidRound: 1, bids: [], pendHokum: null,
          mode: null, trump: null, buyer: null,
          table: [], tricksWon: { t0: [], t1: [] }, lastTrickWinner: null,
          roundScores: null, handCounts: [5, 5, 5, 5],
          roundNo: (p.roundNo || 0) + 1, updatedAt: ts()
        });
        await batch.commit();
      }

      /** After the buy: buyer takes the flip + 2 more, others take 3 → all 8. */
      async function dealRest() {
        var p = st.pub;
        var deckSnap = await st.ref.collection('priv').doc('deck').get();
        var rest = (deckSnap.exists && (deckSnap.data().cards || [])) || [];
        if (rest.length !== 11) throw new Error('bad deck');
        var adds = {}, idx = 0;
        for (var k = 1; k <= 4; k++) {
          var seat = (p.dealer + k) % 4;
          var n = (seat === p.buyer) ? 2 : 3;
          adds[seat] = rest.slice(idx, idx + n);
          idx += n;
        }
        adds[p.buyer] = adds[p.buyer].concat([p.flip]);   // buyer takes the الشراء card
        var batch = db.batch();
        for (var i = 0; i < 4; i++) {
          batch.update(privRef(i), { cards: FV.arrayUnion.apply(FV, adds[i]) });
        }
        batch.set(st.ref.collection('priv').doc('deck'), { cards: [] });
        batch.update(st.ref, {
          phase: 'playing', turn: (p.dealer + 1) % 4,
          handCounts: [8, 8, 8, 8], table: [], updatedAt: ts()
        });
        await batch.commit();
      }

      /* ======================================================================
         BIDDING — transactional so only the seat whose turn it is can act.
         Round 1: حكم = flip suit · صن ends the auction instantly.
         Round 2: حكم = any other suit. 8 passes → ورق (redeal, dealer+1).
         ====================================================================== */
      async function doBid(action, chosenSuit) {
        var actSeat = st.pub && st.pub.turn;
        st.suitPick = false;
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'bidding' || p.turn !== actSeat) throw new Error('turn');
            var r = p.bidRound || 1;
            var bids = (p.bids || []).slice();
            var upd = { updatedAt: ts() };

            if (action === 'sun') {
              // صن always wins the auction (can't be outbid in stage 1)
              bids.push({ s: actSeat, a: 'sun', r: r });
              upd.mode = 'sun'; upd.trump = null; upd.buyer = actSeat;
              upd.pendHokum = null; upd.phase = 'dealRest'; upd.turn = -1;
            } else if (action === 'hokum') {
              if (p.pendHokum) throw new Error('taken');       // one pending حكم at a time
              var tSuit = (r === 1) ? suitOf(p.flip) : chosenSuit;
              if (r === 2 && (!tSuit || tSuit === suitOf(p.flip))) throw new Error('suit');
              bids.push({ s: actSeat, a: 'hokum', r: r, suit: tSuit });
              upd.pendHokum = { s: actSeat, suit: tSuit };
              advance(p, bids, upd, r);
            } else {
              bids.push({ s: actSeat, a: 'pass', r: r });
              advance(p, bids, upd, r);
            }
            upd.bids = bids;
            tx.update(st.ref, upd);
          });
        } catch (e) { /* someone beat us to it — snapshot will refresh the UI */ }

        // Once all 4 seats spoke in this round, resolve the auction.
        function advance(p, bids, upd, r) {
          var cnt = bids.filter(function (b) { return b.r === r; }).length;
          if (cnt >= 4) {
            var ph = (upd.pendHokum !== undefined) ? upd.pendHokum : p.pendHokum;
            if (ph) { // a حكم survived the round (nobody said صن over it)
              upd.mode = 'hokum'; upd.trump = ph.suit; upd.buyer = ph.s;
              upd.phase = 'dealRest'; upd.turn = -1; upd.pendHokum = null;
            } else if (r === 1) { // everyone passed → round 2, free-suit حكم
              upd.bidRound = 2; upd.turn = (p.dealer + 1) % 4; upd.pendHokum = null;
            } else { // 8 passes → ورق: advance dealer, host redeals
              upd.phase = 'redeal'; upd.dealer = (p.dealer + 1) % 4;
              upd.turn = -1; upd.pendHokum = null;
            }
          } else {
            upd.turn = (p.turn + 1) % 4;
          }
        }
      }

      /* ======================================================================
         PLAYING A CARD — transaction validates turn/phase/legality, then the
         player removes the card from their own priv hand doc.
         ====================================================================== */
      async function playCard(seat, card) {
        var key = privKey(seat);
        var hand = (st.hands[key] || []).slice();
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'playing' || p.turn !== seat) throw new Error('turn');
            var table = (p.table || []).slice();
            if (table.length >= 4) throw new Error('full');
            var legal = legalMoves(hand, table, p.mode, p.trump, seat);
            if (legal.indexOf(card) < 0) throw new Error('illegal');
            table.push({ seat: seat, card: card });
            var hc = (p.handCounts || [8, 8, 8, 8]).slice();
            hc[seat] = Math.max(0, hc[seat] - 1);
            tx.update(st.ref, {
              table: table, handCounts: hc,
              turn: table.length < 4 ? (seat + 1) % 4 : -1,   // -1 freezes input during the sweep
              updatedAt: ts()
            });
          });
          // optimistic local update + authoritative priv-doc update
          st.hands[key] = hand.filter(function (c) { return c !== card; });
          await st.ref.collection('priv').doc(key).update({ cards: FV.arrayRemove(card) });
        } catch (e) { /* stale turn / double tap — ignore, snapshot rules */ }
      }

      /* ======================================================================
         TRICK COLLECTION — after the 900ms pause, exactly one transaction
         moves the 4 cards to the winner's team pile (signature-checked so
         late timers can never collect the wrong trick). The 4th player's
         client fires first; host (then any seated player) is the backup.
         ====================================================================== */
      function scheduleCollect() {
        var p = st.pub;
        if (p && p.phase === 'playing' && (p.table || []).length === 4) {
          var sig = p.table.map(function (t) { return t.card; }).join(',');
          if (st.collectSig === sig) return;
          st.collectSig = sig;
          clearTimeout(st.collectTimer); clearTimeout(st.sweepTimer);

          // sweep animation toward the winner (everyone sees it locally)
          var win = winnerOf(p.table, p.mode, p.trump);
          st.sweepTimer = setTimeout(function () {
            try {
              var c = root.querySelector('.bg-center');
              if (c) c.classList.add('bg-sweep-' + relPos(win.seat));
            } catch (e) {}
          }, 620);

          var delay = -1;
          if (controlsSeat(p.table[3].seat)) delay = 900;
          else if (isHost()) delay = 1600;
          else if (mySeat() >= 0) delay = 2400;
          if (delay > 0) st.collectTimer = setTimeout(function () { collectTrick(sig); }, delay);
        } else {
          st.collectSig = null;
          clearTimeout(st.collectTimer);
        }
      }

      async function collectTrick(expectSig) {
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'playing') throw new Error('phase');
            var table = p.table || [];
            if (table.length !== 4) throw new Error('len');
            if (table.map(function (t) { return t.card; }).join(',') !== expectSig) throw new Error('sig');

            var win = winnerOf(table, p.mode, p.trump);
            var team = win.seat % 2;
            var tw = {
              t0: ((p.tricksWon && p.tricksWon.t0) || []).slice(),
              t1: ((p.tricksWon && p.tricksWon.t1) || []).slice()
            };
            table.forEach(function (t) { tw['t' + team].push(t.card); });

            var upd = { table: [], tricksWon: tw, lastTrickWinner: win.seat, updatedAt: ts() };
            var done = (p.handCounts || []).every(function (n) { return n === 0; });
            if (done) {
              // hand over → score it (آخر أكلة belongs to this trick's winner)
              var rs = scoreRound(p.mode, p.trump, tw, team, p.buyer);
              rs.mode = p.mode; rs.trump = p.trump; rs.buyer = p.buyer;
              var totals = {
                t0: ((p.totals && p.totals.t0) || 0) + rs.pts.t0,
                t1: ((p.totals && p.totals.t1) || 0) + rs.pts.t1
              };
              upd.roundScores = rs; upd.totals = totals; upd.turn = -1;
              // game over at 152+ (both over → higher wins; exact tie → keep playing)
              var over = Math.max(totals.t0, totals.t1) >= 152 && totals.t0 !== totals.t1;
              upd.phase = over ? 'gameEnd' : 'roundEnd';
            } else {
              upd.turn = win.seat; // winner leads the next trick
            }
            tx.update(st.ref, upd);
          });
        } catch (e) { /* someone else collected it first — fine */ }
      }

      /* ======================================================================
         LOBBY-PHASE ACTIONS (seats / practice / start / teardown)
         ====================================================================== */
      async function sit(i) {
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'lobby') throw new Error('phase');
            var seats = (p.seats || [null, null, null, null]).slice();
            if (seats[i]) throw new Error('taken');
            for (var k = 0; k < 4; k++) {
              if (seats[k] && seats[k].uid === myUid && !seats[k].virtual) seats[k] = null;
            }
            seats[i] = { uid: myUid, name: myName };
            tx.update(st.ref, { seats: seats, updatedAt: ts() });
          });
        } catch (e) {}
      }

      async function leaveSeat() {
        try {
          var p = st.pub;
          if (p && p.phase === 'lobby') {
            var seats = (p.seats || []).slice();
            for (var k = 0; k < 4; k++) {
              if (seats[k] && seats[k].uid === myUid && !seats[k].virtual) seats[k] = null;
            }
            await st.ref.update({ seats: seats, updatedAt: ts() });
          }
        } catch (e) {}
        try { localStorage.removeItem(LSKEY); } catch (e) {}
        lobby();
      }

      async function togglePractice() {
        try { await st.ref.update({ practice: !st.pub.practice, updatedAt: ts() }); } catch (e) {}
      }

      async function startGame() {
        var p = st.pub;
        if (!isHost() || p.phase !== 'lobby') return;
        try {
          var seats = (p.seats || []).slice();
          if (p.practice) {
            var n = 2;
            seats = seats.map(function (s) {
              return s || { uid: myUid, name: I18n.t('bg_bot') + ' ' + (n++), virtual: true };
            });
            await st.ref.update({ seats: seats, updatedAt: ts() });
            st.pub = Object.assign({}, p, { seats: seats }); // deal() needs the filled seats now
          } else if (seats.some(function (s) { return !s; })) {
            toast(I18n.t('bg_need4')); return;
          }
          await deal(st.pub.dealer || 0);
        } catch (e) { toast(I18n.t('bg_err')); }
      }

      async function nextRound() {
        if (!isHost()) return;
        try { await deal(((st.pub.dealer || 0) + 1) % 4); } catch (e) { toast(I18n.t('bg_err')); }
      }

      async function newGame() {
        if (!isHost()) return;
        try {
          await st.ref.update({ totals: { t0: 0, t1: 0 }, updatedAt: ts() });
          st.pub = Object.assign({}, st.pub, { totals: { t0: 0, t1: 0 } });
          await deal(((st.pub.dealer || 0) + 1) % 4);
        } catch (e) { toast(I18n.t('bg_err')); }
      }

      async function endTable() {
        try {
          var p = st.pub || {};
          var keys = { deck: true };
          if (p.practice) { keys.seat0 = keys.seat1 = keys.seat2 = keys.seat3 = true; }
          (p.seats || []).forEach(function (s) { if (s && s.uid) keys[s.uid] = true; });
          var batch = db.batch();
          Object.keys(keys).forEach(function (k) { batch.delete(st.ref.collection('priv').doc(k)); });
          batch.delete(st.ref);
          await batch.commit();
          try { localStorage.removeItem(LSKEY); } catch (e) {}
          lobby(I18n.t('bg_table_ended'));
        } catch (e) { toast(I18n.t('bg_err')); }
      }

      function exitView() { session.close(); lobby(); } // table stays alive; LS lets you rejoin

      function copyCode() {
        try {
          navigator.clipboard.writeText(st.code).then(function () { toast(I18n.t('bg_copied')); })
            .catch(function () {});
        } catch (e) {}
      }

      /* ======================================================================
         PAINT — one full re-render per snapshot (buzzer.js pattern)
         ====================================================================== */
      function paint() {
        if (!st.pub) return;
        var p = st.pub;
        if (p.phase === 'lobby') paintLobby(p);
        else paintGame(p);
      }

      /* ---------------- lobby phase: pick seats ---------------- */
      function paintLobby(p) {
        root.innerHTML = '';
        root.appendChild(UI.el('div', { class: 'bg-codecard' }, [
          UI.el('div', { class: 'bg-code-label' }, I18n.t('bg_share_code')),
          UI.el('button', { class: 'bg-code', onclick: copyCode }, st.code)
        ]));

        var felt = UI.el('div', { class: 'bg-felt bg-felt-lobby' });
        for (var i = 0; i < 4; i++) {
          (function (i) {
            var s = p.seats && p.seats[i];
            var mine = s && s.uid === myUid && !s.virtual;
            var chip;
            if (s) {
              chip = UI.el('div', { class: 'bg-seat bg-pos-' + relPos(i) + (mine ? ' me' : '') }, [
                UI.el('div', { class: 'bg-avatar' }, UI.initials(s.name)),
                UI.el('div', { class: 'bg-name' }, s.name + (mine ? ' · ' + I18n.t('bg_you') : '')),
                (i % 2 === viewSeat() % 2 && i !== viewSeat()) ? UI.el('div', { class: 'bg-tag' }, I18n.t('bg_partner')) : null
              ]);
            } else {
              chip = UI.el('button', { class: 'bg-seat bg-seat-empty bg-pos-' + relPos(i), onclick: function () { sit(i); } }, [
                UI.el('div', { class: 'bg-avatar empty' }, '+'),
                UI.el('div', { class: 'bg-name' }, I18n.t('bg_sit'))
              ]);
            }
            felt.appendChild(chip);
          })(i);
        }
        felt.appendChild(UI.el('div', { class: 'bg-lobby-mid' }, I18n.t('bg_title')));
        root.appendChild(felt);

        var filled = (p.seats || []).filter(Boolean).length;
        if (isHost()) {
          var tgl = UI.el('label', { class: 'bg-practice' }, [
            UI.el('input', { type: 'checkbox', onchange: togglePractice }),
            UI.el('span', null, I18n.t('bg_practice')),
            UI.el('small', null, I18n.t('bg_practice_hint'))
          ]);
          if (p.practice) tgl.querySelector('input').checked = true;
          root.appendChild(tgl);

          var canStart = p.practice ? mySeat() >= 0 : filled === 4;
          var startBtn = UI.el('button', { class: 'btn btn-green btn-block', onclick: startGame },
            canStart ? I18n.t('bg_start') : I18n.t('bg_need4'));
          if (!canStart) startBtn.setAttribute('disabled', 'true');
          root.appendChild(startBtn);
        } else {
          root.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' },
            mySeat() >= 0 ? I18n.t('bg_need4') : (filled === 4 ? I18n.t('bg_full') : I18n.t('bg_sit'))));
        }

        var row = UI.el('div', { class: 'bg-lobby-actions' }, [
          UI.el('button', { class: 'btn btn-ghost', onclick: leaveSeat }, I18n.t('bg_leave_seat')),
          isHost() ? UI.el('button', { class: 'btn btn-ghost bg-danger', onclick: function () {
            UI.confirm(I18n.t('bg_end_confirm'), endTable);
          } }, I18n.t('bg_end_table')) : null
        ]);
        root.appendChild(row);
      }

      /* ---------------- in-game paint ---------------- */
      function paintGame(p) {
        root.innerHTML = '';
        root.appendChild(topBar(p));

        var felt = UI.el('div', { class: 'bg-felt' });
        for (var i = 0; i < 4; i++) felt.appendChild(seatChip(p, i));
        felt.appendChild(centerArea(p));
        root.appendChild(felt);

        root.appendChild(handArea(p));

        if (p.phase === 'bidding' && p.turn >= 0 && controlsSeat(p.turn)) root.appendChild(bidSheet(p));
        if (p.phase === 'roundEnd') root.appendChild(roundEndModal(p));
        if (p.phase === 'gameEnd') root.appendChild(gameEndModal(p));
      }

      function topBar(p) {
        var us = (p.totals && p.totals[myTeamKey()]) || 0;
        var them = (p.totals && p.totals[themTeamKey()]) || 0;
        var modeChip;
        if (p.mode === 'sun') modeChip = UI.el('span', { class: 'bg-chip bg-chip-sun' }, '☀️ ' + I18n.t('bg_sun'));
        else if (p.mode === 'hokum') {
          modeChip = UI.el('span', { class: 'bg-chip bg-chip-hokum' + (p.trump === 'H' || p.trump === 'D' ? ' redsuit' : '') },
            I18n.t('bg_hokum') + ' ' + SUIT_CHAR[p.trump]);
        } else modeChip = UI.el('span', { class: 'bg-chip' }, I18n.t('bg_flip'));

        return UI.el('div', { class: 'bg-topbar' }, [
          UI.el('span', { class: 'bg-score' }, [
            UI.el('b', null, I18n.t('bg_us') + ' ' + us),
            UI.el('i', null, ' · '),
            UI.el('b', { class: 'them' }, I18n.t('bg_them') + ' ' + them)
          ]),
          modeChip,
          UI.el('button', { class: 'bg-chip bg-chip-code', onclick: copyCode }, st.code),
          UI.el('span', { class: 'bg-beta' }, I18n.t('bg_beta')),
          UI.el('span', { class: 'bg-topgrow' }),
          isHost() ? UI.el('button', { class: 'bg-chip bg-danger', onclick: function () {
            UI.confirm(I18n.t('bg_end_confirm'), endTable);
          } }, I18n.t('bg_end_table')) : null,
          UI.el('button', { class: 'bg-chip', onclick: exitView }, I18n.t('bg_exit'))
        ]);
      }

      function seatChip(p, i) {
        var s = p.seats && p.seats[i];
        var name = seatName(i);
        var isTurn = p.turn === i && (p.phase === 'bidding' || p.phase === 'playing');
        var partner = (i % 2 === viewSeat() % 2) && i !== viewSeat();
        var kids = [
          UI.el('div', { class: 'bg-avatar' }, UI.initials(name)),
          UI.el('div', { class: 'bg-name' }, name)
        ];
        if (partner) kids.push(UI.el('div', { class: 'bg-tag' }, I18n.t('bg_partner')));
        if (p.dealer === i) kids.push(UI.el('div', { class: 'bg-tag dealer' }, I18n.t('bg_dealer')));
        if (p.phase === 'playing' && i !== viewSeat() && p.handCounts) {
          kids.push(UI.el('div', { class: 'bg-count' }, '🂠 ' + (p.handCounts[i] || 0)));
        }
        if (p.phase === 'bidding') {
          var b = lastBid(p, i);
          if (b) kids.push(UI.el('div', { class: 'bg-bidlbl' }, b));
        }
        return UI.el('div', { class: 'bg-seat bg-pos-' + relPos(i) + (isTurn ? ' turn' : '') + (i === viewSeat() ? ' me' : '') }, kids);
      }

      function lastBid(p, seat) {
        var r = p.bidRound || 1;
        var mine = (p.bids || []).filter(function (b) { return b.r === r && b.s === seat; });
        var b = mine[mine.length - 1];
        if (!b) return '';
        if (b.a === 'pass') return I18n.t('bg_pass');
        if (b.a === 'sun') return I18n.t('bg_sun');
        return I18n.t('bg_hokum') + ' ' + SUIT_CHAR[b.suit];
      }

      function centerArea(p) {
        var c = UI.el('div', { class: 'bg-center' });
        if (p.phase === 'bidding' && p.flip) {
          c.appendChild(UI.el('div', { class: 'bg-flipwrap' }, [
            UI.el('div', { class: 'bg-fliplbl' }, I18n.t('bg_flip')),
            cardEl(p.flip, 'bg-flipcard')
          ]));
          if (p.turn >= 0) {
            c.appendChild(UI.el('div', { class: 'bg-turnhint' },
              controlsSeat(p.turn) ? I18n.t('bg_your_turn') : I18n.t('bg_turn_of') + ' ' + seatName(p.turn)));
          }
          return c;
        }
        if (p.phase === 'dealRest' || p.phase === 'redeal') {
          c.appendChild(UI.el('div', { class: 'bg-turnhint' },
            I18n.t(p.phase === 'redeal' ? 'bg_redeal' : 'bg_dealing')));
          return c;
        }
        // trick cards, positioned toward each seat; new cards slide in
        var cards = (p.table || []).map(function (t) { return t.card; });
        var sig = cards.join(',');
        var animFrom = 0;
        if (st.prevSig && sig.indexOf(st.prevSig) === 0 && sig !== st.prevSig) animFrom = st.prevCount;
        else if (sig === st.prevSig) animFrom = cards.length; // repaint: no re-animation
        st.prevSig = sig; st.prevCount = cards.length;
        (p.table || []).forEach(function (t, idx) {
          var pos = relPos(t.seat);
          var el = cardEl(t.card, 'bg-tcard bg-t-' + pos + (idx >= animFrom ? ' bg-in-' + pos : ''));
          c.appendChild(el);
        });
        if (p.phase === 'playing' && p.turn >= 0 && !(p.table || []).length) {
          c.appendChild(UI.el('div', { class: 'bg-turnhint soft' },
            controlsSeat(p.turn) ? I18n.t('bg_your_turn') : I18n.t('bg_turn_of') + ' ' + seatName(p.turn)));
        }
        return c;
      }

      /* Bottom hand fan — legal cards lift & play on tap; illegal ones dim. */
      function handArea(p) {
        var wrap = UI.el('div', { class: 'bg-handarea' });
        var act = actingSeat();
        if (act < 0) {
          wrap.appendChild(UI.el('div', { class: 'bg-banner' }, I18n.t('bg_spectator')));
          return wrap;
        }
        if (p.practice && isHost() && act !== mySeat()) {
          wrap.appendChild(UI.el('div', { class: 'bg-banner' },
            I18n.t('bg_playing_as') + ': ' + seatName(act)));
        }
        var hand = sortHand(st.hands[privKey(act)] || [], p.mode, p.trump);
        var canAct = p.phase === 'playing' && p.turn === act && controlsSeat(act);
        var legal = canAct ? legalMoves(hand, p.table || [], p.mode, p.trump, act) : [];
        var fan = UI.el('div', { class: 'bg-hand' });
        hand.forEach(function (card) {
          var ok = canAct && legal.indexOf(card) >= 0;
          var el = cardEl(card, ok ? 'playable' : (canAct ? 'dim' : ''));
          if (ok) el.onclick = function () { el.onclick = null; playCard(act, card); };
          fan.appendChild(el);
        });
        wrap.appendChild(fan);
        return wrap;
      }

      /* Kamelna-style bottom sheet: صن / حكم / بس (+ suit picker in round 2). */
      function bidSheet(p) {
        var act = p.turn;
        var r = p.bidRound || 1;
        var key = act + '|' + r + '|' + (p.roundNo || 0);
        if (st.suitPickKey !== key) { st.suitPick = false; st.suitPickKey = key; }

        var body = UI.el('div', { class: 'bg-sheet-body' });

        if (st.suitPick) {
          body.appendChild(UI.el('div', { class: 'bg-sheet-title' }, I18n.t('bg_pick_suit')));
          var row = UI.el('div', { class: 'bg-suitrow' });
          SUITS.filter(function (s) { return s !== suitOf(p.flip); }).forEach(function (s) {
            row.appendChild(UI.el('button', {
              class: 'bg-suitbtn' + (s === 'H' || s === 'D' ? ' redsuit' : ''),
              onclick: function () { doBid('hokum', s); }
            }, [UI.el('b', null, SUIT_CHAR[s]), UI.el('span', null, I18n.t('bg_suit_' + s))]));
          });
          body.appendChild(row);
          body.appendChild(UI.el('button', { class: 'bg-bid pass', onclick: function () { st.suitPick = false; paint(); } },
            I18n.t('bg_back')));
        } else {
          body.appendChild(UI.el('div', { class: 'bg-sheet-flip' }, [
            UI.el('div', { class: 'bg-fliplbl' }, I18n.t('bg_flip')),
            cardEl(p.flip, 'bg-flipcard big')
          ]));
          if (p.practice && isHost() && act !== mySeat()) {
            body.appendChild(UI.el('div', { class: 'bg-banner tight' },
              I18n.t('bg_playing_as') + ': ' + seatName(act)));
          }
          var hokumTaken = !!p.pendHokum;
          var hokumBtn = UI.el('button', { class: 'bg-bid hokum', onclick: function () {
            if (hokumTaken) return;
            if (r === 1) doBid('hokum', null);
            else { st.suitPick = true; paint(); }
          } }, [
            UI.el('span', null, I18n.t('bg_hokum')),
            r === 1 ? UI.el('b', { class: (suitOf(p.flip) === 'H' || suitOf(p.flip) === 'D') ? 'redsuit' : '' }, SUIT_CHAR[suitOf(p.flip)]) : UI.el('b', null, '?')
          ]);
          if (hokumTaken) hokumBtn.setAttribute('disabled', 'true');
          body.appendChild(UI.el('div', { class: 'bg-bidrow' }, [
            UI.el('button', { class: 'bg-bid sun', onclick: function () { doBid('sun'); } }, I18n.t('bg_sun')),
            hokumBtn,
            UI.el('button', { class: 'bg-bid pass', onclick: function () { doBid('pass'); } }, I18n.t('bg_pass'))
          ]));
        }
        return UI.el('div', { class: 'bg-sheet' }, [body]);
      }

      /* Round summary: أبناط → نقاط, خسران/كبوت callouts, running totals. */
      function roundEndModal(p) {
        var rs = p.roundScores || { bnt: { t0: 0, t1: 0 }, pts: { t0: 0, t1: 0 } };
        var usK = myTeamKey(), thK = themTeamKey();
        var buyerName = (rs.buyer != null) ? seatName(rs.buyer) : '';
        var modeTxt = rs.mode === 'sun' ? ('☀️ ' + I18n.t('bg_sun'))
                    : (I18n.t('bg_hokum') + ' ' + (rs.trump ? SUIT_CHAR[rs.trump] : ''));

        var rows = UI.el('div', { class: 'bg-restable' }, [
          resRow('', I18n.t('bg_us'), I18n.t('bg_them'), true),
          resRow(I18n.t('bg_abnat'), String(rs.bnt[usK] || 0), String(rs.bnt[thK] || 0)),
          resRow(I18n.t('bg_points'), String(rs.pts[usK] || 0), String(rs.pts[thK] || 0)),
          resRow(I18n.t('bg_totals'), String((p.totals && p.totals[usK]) || 0), String((p.totals && p.totals[thK]) || 0))
        ]);

        var callouts = [];
        if (rs.kaboot) callouts.push(UI.el('div', { class: 'bg-callout gold' }, I18n.t('bg_kaboot')));
        if (rs.khosran) callouts.push(UI.el('div', { class: 'bg-callout red' }, I18n.t('bg_khosran')));

        return UI.el('div', { class: 'bg-modalbd' }, [
          UI.el('div', { class: 'bg-modal' }, [
            UI.el('h3', null, I18n.t('bg_round_end')),
            UI.el('p', { class: 'bg-resmeta' }, modeTxt + ' · ' + I18n.t('bg_buyer') + ': ' + buyerName),
            rows
          ].concat(callouts).concat([
            isHost()
              ? UI.el('button', { class: 'btn btn-green btn-block', onclick: nextRound }, I18n.t('bg_next_round'))
              : UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bg_wait_host'))
          ]))
        ]);
      }

      function resRow(label, us, them, head) {
        return UI.el('div', { class: 'bg-resrow' + (head ? ' head' : '') }, [
          UI.el('span', { class: 'lbl' }, label),
          UI.el('span', null, us),
          UI.el('span', null, them)
        ]);
      }

      function gameEndModal(p) {
        var usK = myTeamKey();
        var winTeam = ((p.totals && p.totals.t0) || 0) > ((p.totals && p.totals.t1) || 0) ? 't0' : 't1';
        var weWon = winTeam === usK;
        return UI.el('div', { class: 'bg-modalbd' }, [
          UI.el('div', { class: 'bg-modal' }, [
            UI.el('div', { class: 'bg-winbanner' + (weWon ? ' us' : '') },
              weWon ? I18n.t('bg_we_won') : I18n.t('bg_they_won')),
            UI.el('p', { class: 'bg-resmeta' },
              I18n.t('bg_us') + ' ' + ((p.totals && p.totals[myTeamKey()]) || 0) + ' · ' +
              I18n.t('bg_them') + ' ' + ((p.totals && p.totals[themTeamKey()]) || 0)),
            isHost() ? UI.el('button', { class: 'btn btn-green btn-block', onclick: newGame }, I18n.t('bg_new_game')) : null,
            isHost() ? UI.el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:8px', onclick: function () {
              UI.confirm(I18n.t('bg_end_confirm'), endTable);
            } }, I18n.t('bg_end_table')) : UI.el('button', { class: 'btn btn-ghost btn-block', onclick: exitView }, I18n.t('bg_exit'))
          ])
        ]);
      }

      /* ---------------- entry: rejoin or fresh lobby ---------------- */
      var saved = null;
      try { saved = localStorage.getItem(LSKEY); } catch (e) {}
      if (saved) openTable(saved); else lobby();
    }
  });
})();
