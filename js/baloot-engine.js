/* ===========================================================
   بلوت — BalootEngine
   A PURE, DETERMINISTIC, UI-FREE, NETWORK-FREE rules engine.
   Single source of truth for ALL Baloot rules (Kamelna style).

   NO DOM. NO Firestore. NO timers. NO globals besides the one
   window.BalootEngine export. Every function returns (terminating
   by construction — no unbounded loops). State is plain-JSON
   serializable so a Cloudflare Durable Object can run this SAME
   file server-side.

   The scoring / projects / legalMoves / winner math is COPIED
   VERBATIM from js/modules/baloot-game.js (expert hand-verified —
   NOT "improved"). Only the AI (chooseBid / chooseCard) and the
   phase state-machine (createGame / legalMoves / applyMove) are new.

   State shape (a superset of the Firestore `pub` doc so the existing
   stage 4-8 renderer can read it directly):
     seed        deterministic RNG seed (number)
     rng         current RNG cursor (number)  — advanced by shuffle
     aiLevel     'normal' | 'strong'  (default 'strong')
     phase       'bidding'|'doubling'|'playing'|'roundEnd'|'gameEnd'
     dealer      seat 0..3
     turn        seat whose bid/card it is (-1 during doubling/sweep)
     flip        the الشراء card (string) — visible all auction
     bidRound    1 | 2
     bids        [{s,a,r,suit?}]
     pendHokum   {s,suit} | null
     mode        'sun'|'hokum'|'ashkal' | null
     trump       suit letter | null
     buyer       seat | null
     buyRound    1 | 2 | null
     doubleTurn  seat | null   ·  doubleLeft [seats]
     mult        1|2|3|4|'coffee'   ·  multBy seat|null
     hands       [ [cards]×4 ]   — FULL hands (engine knows all)
     handCounts  [n,n,n,n]
     table       [{seat,card}]   current trick
     tricksWon   {t0:[cards], t1:[cards]}
     lastTrickWinner seat|null
     projects    {'0':[..],'1':[..]}  ·  declared {seat:true}
     roundScores rs | null  (last scoreRound output + extras)
     totals      {t0,t1}
     roundNo     n
     history     [ per-deal lines ]  (قيدها)
     winner      't0'|'t1'|null   (set at gameEnd)
   =========================================================== */
(function (root) {
  'use strict';

  /* ======================================================================
     0) DETERMINISTIC RNG — mulberry32. Same seed → identical game.
     ====================================================================== */
  function rngFrom(seed) {
    // returns a stateful generator object {next(): [0,1)}
    var s = (seed >>> 0) || 1;
    return {
      state: s,
      next: function () {
        this.state |= 0; this.state = (this.state + 0x6D2B79F5) | 0;
        var t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
    };
  }

  /* ======================================================================
     1) CARD ENGINE — copied verbatim from baloot-game.js.
     ====================================================================== */
  var SUITS = ['S', 'H', 'D', 'C'];
  var RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var SUIT_CHAR = { S: '♠', H: '♥', D: '♦', C: '♣' };

  var ORDER_SUN = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
  var ORDER_TRUMP = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

  var PTS_SUN = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
  var PTS_TRUMP = { J: 20, '9': 14, A: 11, '10': 10, K: 4, Q: 3, '8': 0, '7': 0 };

  function suitOf(c) { return c.slice(-1); }
  function rankOf(c) { return c.slice(0, -1); }

  function newDeck() {
    var d = [];
    SUITS.forEach(function (s) { RANKS.forEach(function (r) { d.push(r + s); }); });
    return d;
  }

  /** Deterministic Fisher–Yates using a seeded generator. */
  function shuffleWith(a, gen) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(gen.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function cardPoints(card, mode, trump) {
    if (mode === 'hokum' && suitOf(card) === trump) return PTS_TRUMP[rankOf(card)];
    return PTS_SUN[rankOf(card)];
  }

  function strength(card, mode, trump) {
    if (mode === 'hokum' && suitOf(card) === trump) return 100 + ORDER_TRUMP.indexOf(rankOf(card));
    return ORDER_SUN.indexOf(rankOf(card));
  }

  function sortHand(hand, mode, trump) {
    var suitPos = { S: 0, H: 1, C: 2, D: 3 };
    return hand.slice().sort(function (a, b) {
      var sa = suitOf(a), sb = suitOf(b);
      if (sa !== sb) return suitPos[sa] - suitPos[sb];
      return strength(b, mode, trump) - strength(a, mode, trump);
    });
  }

  function playVal(card, led, mode, trump) {
    var s = suitOf(card);
    if (mode === 'hokum' && s === trump) return 200 + ORDER_TRUMP.indexOf(rankOf(card));
    if (s === led) return 100 + ORDER_SUN.indexOf(rankOf(card));
    return 0;
  }

  function winnerOf(plays, mode, trump) {
    var led = suitOf(plays[0].card);
    var best = plays[0];
    for (var i = 1; i < plays.length; i++) {
      if (playVal(plays[i].card, led, mode, trump) > playVal(best.card, led, mode, trump)) best = plays[i];
    }
    return best;
  }

  /** LEGAL MOVES for a card play — copied verbatim (Kamelna). */
  function legalCards(hand, table, mode, trump, seat) {
    if (!table || !table.length) return hand.slice();
    var led = suitOf(table[0].card);
    var win = winnerOf(table, mode, trump);
    var partnerWinning = (win.seat % 2) === (seat % 2);
    var follow = hand.filter(function (c) { return suitOf(c) === led; });

    if (mode !== 'hokum') return follow.length ? follow : hand.slice();

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
        if (over.length) return over;
      }
      return follow;
    }

    var myTrumps = hand.filter(function (c) { return suitOf(c) === trump; });
    if (!myTrumps.length) return hand.slice();
    if (partnerWinning) return hand.slice();
    if (hiTrump >= 0) {
      var higher = myTrumps.filter(function (c) { return ORDER_TRUMP.indexOf(rankOf(c)) > hiTrump; });
      if (higher.length) return higher;
    }
    return myTrumps;
  }

  /* ---------- المشاريع (projects / melds) — copied verbatim ---------- */
  var NAT = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var PROJ_CAT = { sira: 1, fifty: 2, hundred: 3, fourhundred: 4 };
  var PROJ_VAL_SUN = { sira: 4, fifty: 10, hundred: 20, fourhundred: 40 };
  var PROJ_VAL_HOKUM = { sira: 2, fifty: 5, hundred: 10, baloot: 2 };

  function projectValue(type, mode) {
    return (mode === 'hokum' ? PROJ_VAL_HOKUM : PROJ_VAL_SUN)[type] || 0;
  }

  function findProjects(hand, mode, trump) {
    var sunLike = mode !== 'hokum';
    var out = [];
    if (!sunLike && trump &&
        hand.indexOf('K' + trump) >= 0 && hand.indexOf('Q' + trump) >= 0) {
      out.push({ type: 'baloot', cards: ['K' + trump, 'Q' + trump], topRank: NAT.indexOf('K') });
    }
    var fourRanks = ['A', 'K', 'Q', 'J', '10'].filter(function (r) {
      return SUITS.every(function (s) { return hand.indexOf(r + s) >= 0; });
    });
    var best = null;
    var combos = 1 << fourRanks.length;
    for (var m = 0; m < combos; m++) {
      var items = [], used = {};
      fourRanks.forEach(function (r, i) {
        if (!(m & (1 << i))) return;
        var cards = SUITS.map(function (s) { return r + s; });
        cards.forEach(function (c) { used[c] = true; });
        items.push({ type: (r === 'A' && sunLike) ? 'fourhundred' : 'hundred',
                     cards: cards, topRank: NAT.indexOf(r) });
      });
      var rest = hand.filter(function (c) { return !used[c]; });
      items = items.concat(findSequences(rest));
      var val = 0;
      items.forEach(function (it) { val += projectValue(it.type, mode); });
      if (!best || val > best.val) best = { val: val, items: items };
    }
    return out.concat(best ? best.items : []);
  }

  function findSequences(cards) {
    var found = [];
    SUITS.forEach(function (s) {
      var idxs = cards.filter(function (c) { return suitOf(c) === s; })
                      .map(function (c) { return NAT.indexOf(rankOf(c)); })
                      .sort(function (a, b) { return a - b; });
      var run = [];
      for (var i = 0; i <= idxs.length; i++) {
        if (i < idxs.length && (run.length === 0 || idxs[i] === run[run.length - 1] + 1)) {
          run.push(idxs[i]);
          continue;
        }
        var guard = 0;
        while (run.length >= 3) {
          if (++guard > 8) break;
          var take = run.length >= 5 ? 5 : run.length;
          var part = run.splice(run.length - take, take);
          found.push({
            type: take === 5 ? 'hundred' : (take === 4 ? 'fifty' : 'sira'),
            cards: part.map(function (n) { return NAT[n] + s; }),
            topRank: part[part.length - 1]
          });
        }
        run = (i < idxs.length) ? [idxs[i]] : [];
      }
    });
    return found;
  }

  function resolveProjects(projMap, mode) {
    var res = { projPts: { t0: 0, t1: 0 }, balootPts: { t0: 0, t1: 0 }, winTeam: null, items: [] };
    if (!projMap) return res;
    var comparable = [];
    ['0', '1'].forEach(function (k) {
      (projMap[k] || []).forEach(function (it) {
        var item = { team: +k, seat: it.seat, type: it.type, cards: it.cards || [],
                     topRank: it.topRank || 0, ord: it.ord || 0, cancelled: false };
        res.items.push(item);
        if (it.type === 'baloot') res.balootPts['t' + k] += projectValue('baloot', mode);
        else comparable.push(item);
      });
    });
    if (comparable.length) {
      var best = comparable.slice().sort(function (a, b) {
        if (PROJ_CAT[b.type] !== PROJ_CAT[a.type]) return PROJ_CAT[b.type] - PROJ_CAT[a.type];
        if (b.topRank !== a.topRank) return b.topRank - a.topRank;
        return a.ord - b.ord;
      })[0];
      res.winTeam = best.team;
      comparable.forEach(function (it) {
        if (it.team === res.winTeam) res.projPts['t' + it.team] += projectValue(it.type, mode);
        else it.cancelled = true;
      });
    }
    return res;
  }

  /** ROUND SCORING — copied verbatim (expert hand-verified). */
  function scoreRound(mode, trump, tricksWon, lastTrickTeam, buyerSeat, ext) {
    ext = ext || {};
    var projPts = ext.projPts || { t0: 0, t1: 0 };
    var balootPts = ext.balootPts || { t0: 0, t1: 0 };
    var mult = ext.mult || 1;
    var sunLike = mode !== 'hokum';

    var bTeam = buyerSeat % 2, oTeam = 1 - bTeam;
    var bnt = { t0: 0, t1: 0 };
    [0, 1].forEach(function (t) {
      (tricksWon['t' + t] || []).forEach(function (c) { bnt['t' + t] += cardPoints(c, mode, trump); });
    });
    bnt['t' + lastTrickTeam] += 10;

    var total = sunLike ? 26 : 16;
    var kabootVal = sunLike ? 44 : 25;
    var pts = { t0: 0, t1: 0 };
    var khosran = false, kaboot = null;
    var projSum = projPts.t0 + projPts.t1;
    var winTeam, oPts = 0, bPts = 0;

    if (!(tricksWon['t' + bTeam] || []).length) {
      kaboot = 'opponents'; winTeam = oTeam;
    } else if (!(tricksWon['t' + oTeam] || []).length) {
      kaboot = 'buyer'; winTeam = bTeam;
    } else {
      oPts = sunLike ? Math.round(bnt['t' + oTeam] * 2 / 10)
                     : Math.round(bnt['t' + oTeam] / 10);
      bPts = total - oPts;
      if (bPts + projPts['t' + bTeam] + balootPts['t' + bTeam] <=
          oPts + projPts['t' + oTeam] + balootPts['t' + oTeam]) {
        khosran = true; winTeam = oTeam;
      } else winTeam = bTeam;
    }
    var loseTeam = 1 - winTeam;

    if (mult === 'coffee' || mult >= 2) {
      var m = (mult === 'coffee') ? 1 : mult;
      pts['t' + winTeam] = ((kaboot ? kabootVal : total) + projSum + balootPts['t' + winTeam]) * m;
      pts['t' + loseTeam] = balootPts['t' + loseTeam] * m;
    } else if (kaboot) {
      pts['t' + winTeam] = kabootVal + projSum + balootPts['t' + winTeam];
      pts['t' + loseTeam] = balootPts['t' + loseTeam];
    } else if (khosran) {
      pts['t' + oTeam] = total + projSum + balootPts['t' + oTeam];
      pts['t' + bTeam] = balootPts['t' + bTeam];
    } else {
      pts['t' + bTeam] = bPts + projPts['t' + bTeam] + balootPts['t' + bTeam];
      pts['t' + oTeam] = oPts + projPts['t' + oTeam] + balootPts['t' + oTeam];
    }
    return { bnt: bnt, pts: pts, khosran: khosran, kaboot: kaboot, buyerTeam: bTeam,
             total: total, winTeam: winTeam, mult: mult, coffee: mult === 'coffee',
             projPts: projPts, balootPts: balootPts };
  }

  /* ======================================================================
     2) HELPERS shared by the state machine + AI.
     ====================================================================== */
  var WIN_SCORE = 152;

  function cheapest(cards, mode, trump) {
    return cards.slice().sort(function (a, b) {
      var d = cardPoints(a, mode, trump) - cardPoints(b, mode, trump);
      if (d) return d;
      return strength(a, mode, trump) - strength(b, mode, trump);
    })[0];
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function suitCards(hand, s) { return hand.filter(function (c) { return suitOf(c) === s; }); }
  function hasRank(cs, rk) { return cs.some(function (c) { return rankOf(c) === rk; }); }

  /* ======================================================================
     3) createGame — deal a fresh round from a seed.
     ====================================================================== */
  function createGame(opts) {
    opts = opts || {};
    var seed = (opts.seed != null) ? (opts.seed >>> 0) : (Math.floor(Math.random() * 0xffffffff) >>> 0);
    var state = {
      seed: seed,
      rngState: seed || 1,
      aiLevel: opts.aiLevel === 'normal' ? 'normal' : 'strong',
      humanSeat: (opts.humanSeat != null) ? opts.humanSeat : 0,
      names: opts.names || null,
      phase: 'lobby',
      dealer: (opts.dealer != null) ? opts.dealer : 0,
      turn: -1,
      flip: null, bidRound: 1, bids: [], pendHokum: null,
      mode: null, trump: null, buyer: null, buyRound: null,
      doubleTurn: null, doubleLeft: [],
      mult: 1, multBy: null,
      hands: [[], [], [], []], handCounts: [0, 0, 0, 0],
      table: [], tricksWon: { t0: [], t1: [] }, lastTrickWinner: null,
      projects: {}, declared: {},
      roundScores: null, totals: { t0: 0, t1: 0 },
      roundNo: 0, history: [], winner: null
    };
    dealRound(state, state.dealer);
    return state;
  }

  /** (Re)deal a new round: 5 each + a flip. Advances the RNG cursor. */
  function dealRound(state, dealer) {
    var gen = rngFrom(state.rngState);
    var deck = shuffleWith(newDeck(), gen);
    state.rngState = gen.state >>> 0;   // persist RNG cursor for the NEXT deal
    state._deck = deck.slice(21);        // 11 undealt (the rest), private
    state.hands = [
      deck.slice(0, 5), deck.slice(5, 10), deck.slice(10, 15), deck.slice(15, 20)
    ];
    state.flip = deck[20];
    state.dealer = dealer;
    state.turn = (dealer + 1) % 4;
    state.phase = 'bidding';
    state.bidRound = 1; state.bids = []; state.pendHokum = null;
    state.mode = null; state.trump = null; state.buyer = null; state.buyRound = null;
    state.doubleTurn = null; state.doubleLeft = [];
    state.mult = 1; state.multBy = null;
    state.handCounts = [5, 5, 5, 5];
    state.table = []; state.tricksWon = { t0: [], t1: [] }; state.lastTrickWinner = null;
    state.projects = {}; state.declared = {};
    state.roundScores = null;
    state.roundNo = (state.roundNo || 0) + 1;
  }

  /** Complete every hand to 8 after the buy (verbatim rule from dealRest). */
  function completeDeal(state) {
    var p = state;
    var rest = (p._deck || []).slice();
    var flipSeat = (p.mode === 'ashkal' || (p.buyRound || 1) === 1) ? p.buyer : p.dealer;
    var idx = 0;
    for (var k = 1; k <= 4; k++) {
      var seat = (p.dealer + k) % 4;
      var n = (seat === flipSeat) ? 2 : 3;
      var add = rest.slice(idx, idx + n); idx += n;
      state.hands[seat] = state.hands[seat].concat(add);
    }
    state.hands[flipSeat] = state.hands[flipSeat].concat([p.flip]);
    state._deck = [];
    state.handCounts = [8, 8, 8, 8];
    state.table = [];
    if (p.mode === 'hokum') {
      var oppTeam = 1 - (p.buyer % 2), ask = [];
      for (var j = 1; j <= 4; j++) {
        var s2 = (p.dealer + j) % 4;
        if (s2 % 2 === oppTeam) ask.push(s2);
      }
      state.phase = 'doubling'; state.turn = -1;
      state.doubleTurn = ask[0]; state.doubleLeft = ask;
    } else {
      state.phase = 'playing'; state.turn = (p.dealer + 1) % 4;
    }
  }

  /* ======================================================================
     4) legalMoves(state, seat) — bids OR cards depending on phase.
     Returns an ARRAY of move objects.
       bidding:  {type:'bid', a:'sun'|'hokum'|'ashkal'|'pass', suit?}
       doubling: {type:'double', a:'raise'|'pass'}
       playing:  {type:'play', card}  and (trick 1) {type:'project'} once
     ====================================================================== */
  function legalMoves(state, seat) {
    var p = state;
    if (p.phase === 'bidding') {
      if (p.turn !== seat) return [];
      var r = p.bidRound || 1;
      var moves = [{ type: 'bid', a: 'sun' }];
      if (r === 2) moves.push({ type: 'bid', a: 'ashkal' });
      if (!p.pendHokum) {
        if (r === 1) {
          moves.push({ type: 'bid', a: 'hokum', suit: suitOf(p.flip) });
        } else {
          SUITS.forEach(function (s) {
            if (s !== suitOf(p.flip)) moves.push({ type: 'bid', a: 'hokum', suit: s });
          });
        }
      }
      moves.push({ type: 'bid', a: 'pass' });
      return moves;
    }
    if (p.phase === 'doubling') {
      if (p.doubleTurn !== seat) return [];
      var out = [{ type: 'double', a: 'pass' }];
      if (p.mult !== 'coffee') out.push({ type: 'double', a: 'raise' });
      return out;
    }
    if (p.phase === 'playing') {
      if (p.turn !== seat) {
        // a seat may still declare a project during trick 1 out of turn? No —
        // Kamelna declares on your own first card; the engine allows the
        // declare only when it is your turn AND you still hold 8 cards.
        return [];
      }
      var mv = [];
      // project (once, trick 1, before your first card, if you have one)
      if (canDeclare(state, seat)) mv.push({ type: 'project' });
      legalCards(state.hands[seat], state.table, p.mode, p.trump, seat).forEach(function (c) {
        mv.push({ type: 'play', card: c });
      });
      return mv;
    }
    return [];
  }

  function canDeclare(state, seat) {
    var p = state;
    if (p.phase !== 'playing') return false;
    if ((p.declared || {})[seat]) return false;
    if ((state.hands[seat] || []).length !== 8) return false;
    var tw = p.tricksWon || {};
    if (((tw.t0 || []).length + (tw.t1 || []).length) > 0) return false;
    return findProjects(state.hands[seat], p.mode, p.trump).length > 0;
  }

  /* ======================================================================
     5) applyMove(state, seat, move) — PURE. Validates, throws on illegal,
     returns a NEW state. Handles every phase + auto-advances the machine.
     ====================================================================== */
  function applyMove(state, seat, move) {
    if (!move || !move.type) throw new Error('bad move');
    var s = clone(state);
    // clone drops _deck? no — JSON keeps it. keep it.
    s._deck = (state._deck || []).slice();
    if (move.type === 'bid') applyBid(s, seat, move);
    else if (move.type === 'double') applyDouble(s, seat, move);
    else if (move.type === 'project') applyProject(s, seat);
    else if (move.type === 'play') applyPlay(s, seat, move);
    else throw new Error('unknown move type: ' + move.type);
    return s;
  }

  function assertLegal(state, seat, move) {
    var legal = legalMoves(state, seat);
    var ok = legal.some(function (m) {
      if (m.type !== move.type) return false;
      if (m.type === 'bid') return m.a === move.a && (m.a !== 'hokum' || m.suit === move.suit);
      if (m.type === 'double') return m.a === move.a;
      if (m.type === 'play') return m.card === move.card;
      if (m.type === 'project') return true;
      return false;
    });
    if (!ok) throw new Error('illegal move: seat ' + seat + ' ' + JSON.stringify(move) +
                             ' in phase ' + state.phase);
  }

  function applyBid(p, seat, move) {
    assertLegal(p, seat, move);
    var r = p.bidRound || 1;
    var action = move.a;
    if (action === 'sun' || action === 'ashkal') {
      p.bids.push({ s: seat, a: action, r: r });
      p.mode = action; p.trump = null; p.buyer = seat; p.buyRound = r;
      p.pendHokum = null; p.turn = -1;
      completeDeal(p);
      return;
    }
    if (action === 'hokum') {
      var tSuit = (r === 1) ? suitOf(p.flip) : move.suit;
      p.bids.push({ s: seat, a: 'hokum', r: r, suit: tSuit });
      p.pendHokum = { s: seat, suit: tSuit };
      advanceBid(p, r);
      return;
    }
    // pass
    p.bids.push({ s: seat, a: 'pass', r: r });
    advanceBid(p, r);
  }

  function advanceBid(p, r) {
    var cnt = p.bids.filter(function (b) { return b.r === r; }).length;
    if (cnt >= 4) {
      var ph = p.pendHokum;
      if (ph) {
        p.mode = 'hokum'; p.trump = ph.suit; p.buyer = ph.s; p.buyRound = r;
        p.pendHokum = null; p.turn = -1;
        completeDeal(p);
      } else if (r === 1) {
        p.bidRound = 2; p.turn = (p.dealer + 1) % 4; p.pendHokum = null;
      } else {
        // ورق: 8 passes → redeal, dealer advances
        var nd = (p.dealer + 1) % 4;
        dealRound(p, nd);
      }
    } else {
      p.turn = (p.turn + 1) % 4;
    }
  }

  function applyDouble(p, seat, move) {
    assertLegal(p, seat, move);
    if (move.a === 'raise') {
      var cur = p.mult || 1;
      var next = (cur === 'coffee') ? 'coffee' : (cur >= 4 ? 'coffee' : cur + 1);
      p.mult = next; p.multBy = seat;
      if (next === 'coffee') {
        p.phase = 'playing'; p.turn = (p.dealer + 1) % 4;
        p.doubleTurn = null; p.doubleLeft = [];
      } else {
        var team = 1 - (seat % 2), ask = [];
        for (var j = 1; j <= 4; j++) {
          var sq = (p.dealer + j) % 4;
          if (sq % 2 === team) ask.push(sq);
        }
        p.doubleTurn = ask[0]; p.doubleLeft = ask;
      }
    } else {
      var left = (p.doubleLeft || []).filter(function (s2) { return s2 !== seat; });
      if (left.length) { p.doubleTurn = left[0]; p.doubleLeft = left; }
      else {
        p.phase = 'playing'; p.turn = (p.dealer + 1) % 4;
        p.doubleTurn = null; p.doubleLeft = [];
      }
    }
  }

  function applyProject(p, seat) {
    assertLegal(p, seat, { type: 'project' });
    var found = findProjects(p.hands[seat], p.mode, p.trump);
    if (!found.length) return;
    var ord = (seat - ((p.dealer + 1) % 4) + 4) % 4;
    var teamKey = String(seat % 2);
    if (!p.projects[0]) p.projects[0] = (p.projects['0'] || []).slice();
    if (!p.projects[1]) p.projects[1] = (p.projects['1'] || []).slice();
    // normalize keys to string '0'/'1'
    p.projects = {
      '0': (p.projects['0'] || []).slice(),
      '1': (p.projects['1'] || []).slice()
    };
    found.forEach(function (it) {
      p.projects[teamKey].push({ seat: seat, type: it.type, cards: it.cards,
                                 topRank: it.topRank, ord: ord });
    });
    p.declared = Object.assign({}, p.declared || {});
    p.declared[seat] = true;
  }

  function applyPlay(p, seat, move) {
    assertLegal(p, seat, move);
    var card = move.card;
    // remove from hand
    var hand = p.hands[seat];
    var idx = hand.indexOf(card);
    if (idx < 0) throw new Error('card not in hand');
    hand.splice(idx, 1);
    p.handCounts[seat] = hand.length;
    p.table.push({ seat: seat, card: card });

    if (p.table.length < 4) {
      p.turn = (seat + 1) % 4;
      return;
    }
    // trick complete → resolve immediately (engine has no animation timers)
    resolveTrick(p);
  }

  function resolveTrick(p) {
    var win = winnerOf(p.table, p.mode, p.trump);
    var team = win.seat % 2;
    p.table.forEach(function (t) { p.tricksWon['t' + team].push(t.card); });
    p.lastTrickWinner = win.seat;
    var table = p.table;
    p.table = [];

    var done = p.handCounts.every(function (n) { return n === 0; });
    if (!done) {
      p.turn = win.seat;
      return;
    }
    // hand over → score it
    var pr = resolveProjects(p.projects, p.mode);
    var rs = scoreRound(p.mode, p.trump, p.tricksWon, team, p.buyer,
      { projPts: pr.projPts, balootPts: pr.balootPts, mult: p.mult || 1 });
    rs.mode = p.mode; rs.trump = p.trump; rs.buyer = p.buyer;
    rs.projItems = pr.items;
    var prev = { t0: p.totals.t0 || 0, t1: p.totals.t1 || 0 };
    if (rs.coffee) {
      rs.pts = { t0: 0, t1: 0 };
      rs.pts['t' + rs.winTeam] = Math.max(0, WIN_SCORE - prev['t' + rs.winTeam]);
    }
    var totals = { t0: prev.t0 + rs.pts.t0, t1: prev.t1 + rs.pts.t1 };
    p.roundScores = rs; p.totals = totals; p.turn = -1;

    var hist = (p.history || []).slice();
    hist.push({
      m: p.mode, tr: p.trump || null, b: p.buyer,
      mult: (p.mult === 'coffee') ? 'coffee' : (p.mult || 1),
      bnt: rs.bnt,
      pj: { t0: (rs.projPts.t0 || 0) + (rs.balootPts.t0 || 0),
            t1: (rs.projPts.t1 || 0) + (rs.balootPts.t1 || 0) },
      pts: rs.pts, kb: rs.kaboot || null, kh: !!rs.khosran
    });
    p.history = hist.slice(-60);

    var over = Math.max(totals.t0, totals.t1) >= WIN_SCORE && totals.t0 !== totals.t1;
    if (over) {
      p.phase = 'gameEnd';
      p.winner = totals.t0 > totals.t1 ? 't0' : 't1';
    } else {
      p.phase = 'roundEnd';
    }
  }

  /** Advance from roundEnd → the next deal (dealer rotates). Pure. */
  function nextRound(state) {
    if (state.phase !== 'roundEnd') return clone(state);
    var s = clone(state);
    s._deck = [];
    dealRound(s, ((s.dealer || 0) + 1) % 4);
    return s;
  }

  /* ======================================================================
     6) score(state) — the current per-team totals + last round summary.
     ====================================================================== */
  function score(state) {
    return {
      totals: clone(state.totals || { t0: 0, t1: 0 }),
      roundScores: state.roundScores ? clone(state.roundScores) : null,
      winner: state.winner || null
    };
  }

  /* ======================================================================
     7) AI — chooseBid(state, seat) and chooseCard(state, seat).
     Real Baloot skill. Difficulty via state.aiLevel ('normal'|'strong').
     Both ALWAYS return a member of legalMoves(state, seat).
     ====================================================================== */

  /* ---- 7a. hand-strength evaluation for bidding ---- */

  /** Trump strength of a candidate suit s, GIVEN the flip card will join my
      hand if I buy it (round 1). Returns a score + component flags. */
  function evalHokumSuit(hand, s, extra) {
    var cs = suitCards(hand, s);
    if (extra && suitOf(extra) === s) cs = cs.concat([extra]);
    var len = cs.length;
    var hasJ = hasRank(cs, 'J'), has9 = hasRank(cs, '9');
    var hasA = hasRank(cs, 'A'), has10 = hasRank(cs, '10'), hasK = hasRank(cs, 'K');
    // بنط in-suit (حكم scale) is a rough power proxy
    var pts = 0;
    cs.forEach(function (c) { pts += PTS_TRUMP[rankOf(c)]; });
    // top-trump control: J(=strongest) and 9 are the boss cards
    var top = (hasJ ? 3 : 0) + (has9 ? 2 : 0) + (hasA ? 1.3 : 0) + (has10 ? 0.8 : 0);
    // side aces (outside this trump suit) — real تحكّم that lets a حكم make it
    var sideAces = 0, sideMasters = 0;
    SUITS.forEach(function (o) {
      if (o === s) return;
      var oc = suitCards(hand, o);
      if (hasRank(oc, 'A')) { sideAces++; sideMasters++; }
      else if (hasRank(oc, '10') && hasRank(oc, 'K')) sideMasters++;
    });
    var score = len * 1.35 + top + pts / 12 + sideAces * 1.1 + sideMasters * 0.4;
    // qualifies as a real حكم suit only with GENUINE trump control: the J, or
    // the 9 backed by an A/10, or 4+ trumps with the ace. A long weak suit
    // (K-high, no J/9) is NOT a حكم — a skilled player passes it.
    var qualifies = (len >= 3 && (hasJ || (has9 && (hasA || has10)))) ||
                    (len >= 4 && hasA && (hasJ || has9 || has10 || hasK));
    return { score: score, len: len, hasJ: hasJ, has9: has9, hasA: hasA,
             has10: has10, sideAces: sideAces, qualifies: qualifies };
  }

  /** صن strength: aces & tens spread with support (K/Q behind them). */
  function evalSun(hand) {
    var aces = 0, tens = 0, kings = 0, guarded = 0, voidish = 0;
    SUITS.forEach(function (s) {
      var cs = suitCards(hand, s);
      var a = hasRank(cs, 'A'), t = hasRank(cs, '10'), k = hasRank(cs, 'K');
      if (a) aces++;
      if (t) tens++;
      if (k) kings++;
      // a 10 is only good if the A is with it or the suit is short/guarded
      if (a && (t || k)) guarded++;
      if (cs.length <= 1) voidish++;
    });
    // score: aces are king in صن; guarded tens add; scattered singleton 10s hurt
    var score = aces * 2.6 + tens * 1.1 + kings * 0.5 + guarded * 1.2 - voidish * 0.4;
    var control = aces + guarded;
    var qualifies = aces >= 2 && control >= 3 && aces + tens >= 3;
    return { score: score, aces: aces, tens: tens, control: control, qualifies: qualifies };
  }

  /** chooseBid — disciplined. Passes most weak hands. */
  function chooseBid(state, seat) {
    var p = state;
    var hand = p.hands[seat];
    var r = p.bidRound || 1;
    var strong = p.aiLevel !== 'normal';
    var flipS = suitOf(p.flip);
    var pass = { type: 'bid', a: 'pass' };

    var sun = evalSun(hand);

    if (r === 1) {
      var h1 = evalHokumSuit(hand, flipS, p.flip);
      // صن outranks a pending حكم and ends the auction — only take it with a
      // genuinely strong صن hand (multiple aces + control spread).
      var sunTake = strong ? (sun.qualifies && sun.score >= 6.8)
                           : (sun.aces >= 3);
      // حكم on the flip suit: need real trump control AND a decent overall
      // hand. A skilled player passes marginal حكم (the flip is only 1 card).
      var hokumTake = strong ? (h1.qualifies && h1.score >= 7.6 && !p.pendHokum)
                             : ((h1.hasJ || (h1.has9 && h1.hasA)) && !p.pendHokum);
      // Prefer the higher-value call if both qualify.
      if (sunTake && (!hokumTake || sun.score >= h1.score + 0.5)) return { type: 'bid', a: 'sun' };
      if (hokumTake) return { type: 'bid', a: 'hokum', suit: flipS };
      if (sunTake) return { type: 'bid', a: 'sun' };
      return pass;
    }

    // ROUND 2 — the flip suit is off the table for حكم; pick my best own suit.
    // Everyone passed round 1, so a marginal hand may compete, but a bad
    // round-2 buy is worse than ورق — stay disciplined.
    var best = null, bestScore = 0;
    SUITS.forEach(function (s) {
      if (s === flipS) return;
      var h = evalHokumSuit(hand, s, null);
      if (!h.qualifies) return;
      if (h.score > bestScore) { bestScore = h.score; best = { s: s, h: h }; }
    });
    var sunTake2 = strong ? (sun.qualifies && sun.score >= 6.0)
                          : (sun.aces >= 3);
    var hokumTake2 = best && (strong ? bestScore >= 7.0 : (best.h.hasJ || (best.h.has9 && best.h.hasA)))
                     && !p.pendHokum;
    // أشكل plays/scores like صن but the FLIP card joins the declarer — so a
    // borderline صن hand that could use one more control card prefers أشكل
    // (especially when the flip is an A/10). Take it over plain صن when my صن
    // is real but not overwhelming.
    if (sunTake2) {
      var flipHelps = PTS_SUN[rankOf(p.flip)] >= 10;               // flip is A/10
      var wantAshkal = strong && !hokumTake2 && sun.score < 9 && (flipHelps || sun.aces === 2);
      if (wantAshkal) return { type: 'bid', a: 'ashkal' };
      if (!hokumTake2 || sun.score >= bestScore + 0.5) return { type: 'bid', a: 'sun' };
    }
    if (hokumTake2) return { type: 'bid', a: 'hokum', suit: best.s };
    if (sunTake2) return { type: 'bid', a: 'sun' };
    return pass;
  }

  /* ---- 7b. doubling — only double when confident the buyer FAILS ---- */
  function chooseDouble(state, seat) {
    var p = state;
    var pass = { type: 'double', a: 'pass' };
    var raise = { type: 'double', a: 'raise' };
    if (p.mult === 'coffee') return pass;
    var hand = p.hands[seat];
    var iAmDefender = (seat % 2) !== (p.buyer % 2);
    var cur = p.mult || 1;

    // strong defensive holding vs a حكم buyer: high trumps + side aces
    var trump = p.trump;
    var myTrumps = suitCards(hand, trump);
    var trumpTop = (hasRank(myTrumps, 'J') ? 3 : 0) + (hasRank(myTrumps, '9') ? 2 : 0) +
                   (hasRank(myTrumps, 'A') ? 1 : 0);
    var aces = 0;
    SUITS.forEach(function (s) { if (s !== trump && hasRank(suitCards(hand, s), 'A')) aces++; });
    var defPower = trumpTop + aces * 1.1 + myTrumps.length * 0.6;

    if (iAmDefender) {
      // initial دبل (cur==1): confident the buyer is short → double.
      if (cur === 1) return defPower >= 4.5 ? raise : pass;
      // escalate to كورة (×4) only with a monster
      if (cur === 3) return defPower >= 6.5 ? raise : pass;
      return pass;
    }
    // buyer's team responding: تربل (×3) only with real strength backing the buy
    if (cur === 2) return defPower >= 3.2 ? raise : pass; // (I'm the buyer's partner)
    return pass;
  }

  /* ---- 7c. card play — the heart of the skill ---- */

  /** Which cards of a suit are still OUT (not in my hand, not played)? */
  function outstanding(state, seat, suit, mode, trump) {
    var seen = {};
    (state.hands[seat] || []).forEach(function (c) { if (suitOf(c) === suit) seen[c] = 1; });
    (state.table || []).forEach(function (t) { if (suitOf(t.card) === suit) seen[t.card] = 1; });
    ['t0', 't1'].forEach(function (k) {
      (state.tricksWon[k] || []).forEach(function (c) { if (suitOf(c) === suit) seen[c] = 1; });
    });
    var out = [];
    RANKS.forEach(function (rk) {
      var c = rk + suit;
      if (!seen[c]) out.push(c);
    });
    return out;
  }

  /** Is `card` currently the master (highest live) card of its suit? i.e. no
      outstanding card (in other hands) beats it in the given mode. */
  function isMaster(state, seat, card, mode, trump) {
    var s = suitOf(card);
    var out = outstanding(state, seat, s, mode, trump);
    var order = (mode === 'hokum' && s === trump) ? ORDER_TRUMP : ORDER_SUN;
    var myRank = order.indexOf(rankOf(card));
    return out.every(function (c) { return order.indexOf(rankOf(c)) < myRank; });
  }

  /** highest / lowest of a suit set by an order. */
  function topByOrder(cards, order) {
    return cards.slice().sort(function (a, b) {
      return order.indexOf(rankOf(b)) - order.indexOf(rankOf(a));
    })[0];
  }

  function chooseCard(state, seat) {
    var p = state;
    var strong = p.aiLevel !== 'normal';
    var hand = p.hands[seat];
    var mode = p.mode, trump = p.trump;
    var legal = legalCards(hand, p.table, mode, trump, seat);
    if (legal.length === 1) return { type: 'play', card: legal[0] };

    var buyer = p.buyer;
    var iBought = (seat % 2) === (buyer % 2);
    var table = p.table || [];

    if (!table.length) return { type: 'play', card: leadChoice(state, seat, legal, strong) };

    // FOLLOWING / DISCARDING
    var win = winnerOf(table, mode, trump);
    var partnerWinning = (win.seat % 2) === (seat % 2);
    var led = suitOf(table[0].card);
    var isLastToPlay = table.length === 3;

    if (partnerWinning) {
      // تعزيل: if partner's win is SAFE (they're last or already master),
      // dump my highest-value card onto it — but don't waste a card that
      // wins me a later trick. Simplest robust rule: if I'm last to play OR
      // partner is playing a master, throw my most valuable legal card
      // (feeding points). Else throw cheap.
      var partnerSafe = isLastToPlay || isMaster(state, seat, win.card, mode, trump);
      if (partnerSafe && strong) {
        // give points: pick the legal card with the MOST بنط, but avoid
        // handing over a trump boss (J/9 of trump) needlessly.
        var feed = legal.slice().sort(function (a, b) {
          return cardPoints(b, mode, trump) - cardPoints(a, mode, trump);
        });
        // don't feed a trump boss if a non-trump 10/A is available
        var nonBoss = feed.filter(function (c) {
          return !(mode === 'hokum' && suitOf(c) === trump &&
                   (rankOf(c) === 'J' || rankOf(c) === '9'));
        });
        var pick = (nonBoss.length ? nonBoss : feed)[0];
        return { type: 'play', card: pick };
      }
      return { type: 'play', card: cheapest(legal, mode, trump) };
    }

    // opponents currently winning → try to take it cheaply, else duck low
    var wv = playVal(win.card, led, mode, trump);
    var winners = legal.filter(function (c) { return playVal(c, led, mode, trump) > wv; });

    if (winners.length) {
      // second-hand-low / third-hand-high logic when strong:
      if (strong && !isLastToPlay) {
        // I'm 2nd or 3rd hand and can win. Win economically:
        //  - if the trick already holds points worth taking, take with the
        //    cheapest winner;
        //  - if it's a barren trick and I'd be spending a high card early,
        //    consider ducking (throw cheapest) to keep tenaces — but never
        //    duck as the last realistic guard. Heuristic: duck only if my
        //    cheapest winner is a "boss" I'd rather keep AND the pot is small.
        var potPts = table.reduce(function (a, t) { return a + cardPoints(t.card, mode, trump); }, 0);
        var cheapWin = cheapest(winners, mode, trump);
        var winIsPremium = cardPoints(cheapWin, mode, trump) >= 10 ||
          (mode === 'hokum' && suitOf(cheapWin) === trump &&
           (rankOf(cheapWin) === 'J' || rankOf(cheapWin) === '9'));
        if (winIsPremium && potPts < 6 && suitOf(cheapWin) === led) {
          // duck: keep the tenace, throw my cheapest non-winning card
          var duckPool = legal.filter(function (c) { return winners.indexOf(c) < 0; });
          if (duckPool.length) return { type: 'play', card: cheapest(duckPool, mode, trump) };
        }
        return { type: 'play', card: cheapWin };
      }
      // last to play, or normal level: win as cheaply as possible
      return { type: 'play', card: cheapest(winners, mode, trump) };
    }

    // can't win → discard the cheapest, but preserve future winners/tenaces.
    // Prefer throwing from a suit where my card can't become a master.
    if (strong) {
      var safe = legal.filter(function (c) {
        // don't discard a card that is currently a master of its suit
        return !isMaster(state, seat, c, mode, trump);
      });
      var pool = safe.length ? safe : legal;
      return { type: 'play', card: cheapest(pool, mode, trump) };
    }
    return { type: 'play', card: cheapest(legal, mode, trump) };
  }

  /** Leading a trick. Strong logic: draw trumps when you're the buying side
      with length; cash side-suit masters (aces); keep the J/9 of trump. */
  function leadChoice(state, seat, legal, strong) {
    var p = state;
    var mode = p.mode, trump = p.trump, buyer = p.buyer, hand = p.hands[seat];
    var iBought = (seat % 2) === (buyer % 2);

    if (!strong) {
      // legacy simple lead: trump boss if buying side in حكم, else strongest of longest suit
      if (mode === 'hokum' && iBought && legal.indexOf('J' + trump) >= 0) return 'J' + trump;
      return strongestOfLongest(legal, mode, trump);
    }

    if (mode === 'hokum') {
      var myTrumps = suitCards(hand, trump);
      var trumpsOut = outstanding(state, seat, trump, mode, trump);
      if (iBought) {
        // If I'm the buyer's side and I hold trump length + the boss, LEAD
        // trumps to draw the opponents' trumps (protect my side-suit winners).
        var haveBoss = myTrumps.indexOf('J' + trump) >= 0 || myTrumps.indexOf('9' + trump) >= 0;
        if (myTrumps.length >= 3 && haveBoss && trumpsOut.length > 0) {
          // lead a HIGH trump to force theirs out (but keep the very top if
          // I have both J and 9 — lead the 9/A, hold the J for later control)
          var order = ORDER_TRUMP;
          var sorted = myTrumps.slice().sort(function (a, b) { return order.indexOf(b) - order.indexOf(a); });
          // lead second-best boss to draw while keeping ultimate control
          var lead = sorted[0];
          if (sorted.length >= 2 && (rankOf(sorted[0]) === 'J')) lead = sorted[1];
          if (legal.indexOf(lead) >= 0) return lead;
        }
      }
      // otherwise cash a side-suit master ACE if I have one
      var aceLead = masterAceLead(state, seat, legal, mode, trump);
      if (aceLead) return aceLead;
      // else lead low from a side suit to keep trumps
      var sideLow = leadLowSide(legal, mode, trump);
      if (sideLow) return sideLow;
      return cheapest(legal, mode, trump);
    }

    // صن: lead from length, cash masters, keep tenaces.
    var aceLeadS = masterAceLead(state, seat, legal, mode, trump);
    if (aceLeadS) return aceLeadS;
    // lead low from my longest suit to develop it
    return leadFromLongest(state, seat, legal, mode, trump);
  }

  function masterAceLead(state, seat, legal, mode, trump) {
    // prefer an Ace (or master 10) that is the current top of its suit
    var cands = legal.filter(function (c) {
      if (mode === 'hokum' && suitOf(c) === trump) return false; // not the trump suit
      var rk = rankOf(c);
      return (rk === 'A' || rk === '10') && isMaster(state, seat, c, mode, trump);
    });
    if (!cands.length) return null;
    // cash the Ace of my LONGEST such suit first (more likely to run)
    cands.sort(function (a, b) {
      var la = suitCards(state.hands[seat], suitOf(a)).length;
      var lb = suitCards(state.hands[seat], suitOf(b)).length;
      if (lb !== la) return lb - la;
      return cardPoints(b, mode, trump) - cardPoints(a, mode, trump);
    });
    return cands[0];
  }

  function leadFromLongest(state, seat, legal, mode, trump) {
    var bySuit = {};
    legal.forEach(function (c) { (bySuit[suitOf(c)] = bySuit[suitOf(c)] || []).push(c); });
    var suits = Object.keys(bySuit).sort(function (a, b) { return bySuit[b].length - bySuit[a].length; });
    var pool = bySuit[suits[0]];
    // if the top of this suit is a master, lead it; else lead low to develop
    var order = ORDER_SUN;
    var top = topByOrder(pool, order);
    if (isMaster(state, seat, top, mode, trump)) return top;
    return cheapest(pool, mode, trump);
  }

  function leadLowSide(legal, mode, trump) {
    var side = legal.filter(function (c) { return !(mode === 'hokum' && suitOf(c) === trump); });
    if (!side.length) return null;
    return cheapest(side, mode, trump);
  }

  function strongestOfLongest(legal, mode, trump) {
    var bySuit = {};
    legal.forEach(function (c) { (bySuit[suitOf(c)] = bySuit[suitOf(c)] || []).push(c); });
    var suits = Object.keys(bySuit).sort(function (a, b) { return bySuit[b].length - bySuit[a].length; });
    var pick = bySuit[suits[0]];
    return pick.slice().sort(function (a, b) { return strength(b, mode, trump) - strength(a, mode, trump); })[0];
  }

  /* ---- 7d. one unified aiMove: pick the move for whatever phase ---- */
  function aiMove(state, seat) {
    var p = state;
    if (p.phase === 'bidding' && p.turn === seat) return chooseBid(state, seat);
    if (p.phase === 'doubling' && p.doubleTurn === seat) return chooseDouble(state, seat);
    if (p.phase === 'playing' && p.turn === seat) {
      // auto-declare projects first (once), before the first card
      if (canDeclare(state, seat)) return { type: 'project' };
      return chooseCard(state, seat);
    }
    return null;
  }

  /* ======================================================================
     8) EXPORT
     ====================================================================== */
  var API = {
    // lifecycle
    createGame: createGame,
    nextRound: nextRound,
    // rules
    legalMoves: legalMoves,
    applyMove: applyMove,
    score: score,
    // AI
    chooseBid: chooseBid,
    chooseDouble: chooseDouble,
    chooseCard: chooseCard,
    aiMove: aiMove,
    // pure helpers reused by the UI / tests
    findProjects: findProjects,
    resolveProjects: resolveProjects,
    projectValue: projectValue,
    scoreRound: scoreRound,
    winnerOf: winnerOf,
    legalCards: legalCards,
    sortHand: sortHand,
    cardPoints: cardPoints,
    suitOf: suitOf, rankOf: rankOf,
    newDeck: newDeck,
    SUITS: SUITS, RANKS: RANKS, SUIT_CHAR: SUIT_CHAR,
    WIN_SCORE: WIN_SCORE,
    _rngFrom: rngFrom, _shuffleWith: shuffleWith   // for deterministic tests
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.BalootEngine = API;
})(typeof window !== 'undefined' ? window : this);
