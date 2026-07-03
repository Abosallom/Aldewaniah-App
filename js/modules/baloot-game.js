/* ===========================================================
   بلوت أونلاين (Baloot Online) — STAGE 1 + STAGE 2 + STAGE 3
   Real-time 4-player Baloot tables for members, following the
   famous Kamelna (كملنا) rules & feel:

   - 32 cards (7..A × 4 suits), fixed teams: seats 0&2 vs 1&3.
   - Deal 5 + flip one card (الشراء), two bidding rounds
     (حكم / صن / بس), then complete hands to 8.
   - صن: A,10,K,Q,J,9,8,7 · حكم trump: J,9,A,10,K,Q,8,7.
   - Follow suit; in حكم you must trump when void and overtrump
     when possible (partner-winning exemption, Kamelna style).
   - آخر أكلة +10 · نشرة to 152 · خسران · كبوت (44 صن / 25 حكم).

   STAGE 2 (this version):
   - المشاريع (projects): سرا/خمسين/مية/أربعمية/بلوت — declared
     with a «مشروع» tap during trick 1, revealed to everyone at
     trick 2; only the team with the STRONGEST project scores
     (بلوت is exempt and always counts for its owner).
   - الدبل (حكم only): دبل ×2 → تربل ×3 → كورة ×4 → قهوة (the
     deal decides the whole game). Doubled rounds are
     winner-takes-all.
   - أشكل: a round-2 bid that plays & scores exactly like صن,
     but the flipped card goes to the declarer (a round-2 صن
     sends it to the dealer instead — that's the whole point).

   STAGE 3 (this version) — «الإحساس» the Kamelna feel:
   - Faithful buy presentation: animated 3+2 deal from the dealer,
     the flipped مشترى stays face-up in the CENTER for the whole
     auction, the dealer "asks" «أول؟/ثاني؟» with a speech bubble
     on the current bidder, and on a buy the flip card flies to
     whoever receives it before the rest of the deal animates out.
   - روبوتات: empty seats become bots (سالم/فهد/ماجد 🤖). The old
     practice mode is replaced — the host plays ONLY their seat and
     the host's client drives the bots (like it already drives the
     deal). Old `practice:true` tables are read gracefully: their
     virtual seats are simply treated as bots.
   - Turn timers: 20s per human turn with a shrinking ring on the
     avatar; timeout auto-acts (بس / lowest legal card). Round-end
     auto-advances after 6s with a countdown on the host's button.

   ---- STAGE 3 RESEARCH NOTES (buy flow as Kamelna presents it) ----
   Sources checked 2026-07 (kammelna.com preferred where conflicting):
   · kammelna.com + FAQ (kammelna.com/Home/FAQ, kammelna.com/baloot/):
     Kamelna is 4 players / 32 cards to 152; it explicitly supports
     playing "لوحدك مع ثلاث لاعبين افتراضيين" (AI seats) or mixing
     humans + AI — that is the model for our bots.
   · rb3haa.com/قوانين-البلوت + sport360x.com/قوانين-البلوت +
     ar.wikipedia.org/wiki/بلوت + balootx.com/تعليم-بلوت:
     - Deal: 5 cards each (3 then 2), then ONE card is flipped
       FACE-UP IN THE MIDDLE OF THE TABLE (وسط الطاولة) — it stays
       visible to everyone for the whole auction.
     - The DEALER opens the auction saying «أول», asking each player
       starting from his right; a refusal is «بس» (also «وله» in some
       regions — we keep Kamelna's بس). If all four refuse the dealer
       says «ثاني» and asks again; in round 2 حكم may be any OTHER
       suit (and Kamelna adds أشكل). 8 refusals → «ورق», redeal with
       the deal passing on.
     - On a buy the buyer takes the flipped card («شريت»), then the
       rest is dealt: 3 cards to everyone, 2 to whoever received the
       flip (the flip is his 3rd) → everyone holds 8.
     - Round-1 حكم must be the flip's suit; صن outranks a pending
       حكم; round-2 صن sends the flip to the DEALER (أشكل keeps it).
       (All of this was already in the stage-1/2 engine — unchanged.)
   · Kamelna Google Play page (play.google.com …com.remalit.kammelna):
     fast automatic pacing — AI seats answer instantly, humans get a
     short visible turn timer. The exact seconds are not published;
     we use 20s per human turn (spec default) with auto-بس / lowest
     legal card on timeout.
   ------------------------------------------------------------------

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

  /* ---------- STAGE 2 · المشاريع (projects / melds) ----------
     Melds use the NATURAL card order (7,8,9,10,J,Q,K,A) — NOT the
     trick-strength order above. Types:
       سرا (sira)          3-card same-suit run
       خمسين (fifty)       4-card same-suit run
       مية (hundred)       5-card same-suit run, OR four-of-a-kind
                           of A/K/Q/J/10 (four 7s/8s/9s never count)
       أربعمية (fourhundred) four Aces — صن/أشكل only (in حكم four
                           aces are just a مية)
       بلوت (baloot)       K+Q of the trump suit — حكم only
     Each project is worth DIRECT نقاط added after the abnat→points
     conversion (this matches Kamelna's scoreboard):
       صن/أشكل:  سرا 4 · خمسين 10 · مية 20 · أربعمية 40
       حكم:      سرا 2 · خمسين 5  · مية 10 · بلوت 2            */
  var NAT = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];   // natural meld order
  var PROJ_CAT = { sira: 1, fifty: 2, hundred: 3, fourhundred: 4 }; // battle rank
  var PROJ_VAL_SUN = { sira: 4, fifty: 10, hundred: 20, fourhundred: 40 };
  var PROJ_VAL_HOKUM = { sira: 2, fifty: 5, hundred: 10, baloot: 2 };

  /** نقاط value of one project in the given mode (أشكل counts like صن). */
  function projectValue(type, mode) {
    return (mode === 'hokum' ? PROJ_VAL_HOKUM : PROJ_VAL_SUN)[type] || 0;
  }

  /** Find every project in a hand (call it on the FULL 8-card hand).
      Returns [{type, cards, topRank}] — topRank is the NAT index of the
      project's highest card, used for tie-breaks in the showdown.
      Each card is used by at most ONE project; when a four-of-a-kind and
      a run fight over a card we try every keep/break combination and take
      the allocation worth the most points (greedy best-value).
      House rule kept from Kamelna: بلوت does NOT use up its two cards —
      the same K/Q may also sit inside a run («بلوت سرا»). */
  function findProjects(hand, mode, trump) {
    var sunLike = mode !== 'hokum';
    var out = [];

    // بلوت: K+Q of the trump suit (حكم only) — exempt from the battle
    if (!sunLike && trump &&
        hand.indexOf('K' + trump) >= 0 && hand.indexOf('Q' + trump) >= 0) {
      out.push({ type: 'baloot', cards: ['K' + trump, 'Q' + trump], topRank: NAT.indexOf('K') });
    }

    // four-of-a-kind candidates (only A K Q J 10 qualify)
    var fourRanks = ['A', 'K', 'Q', 'J', '10'].filter(function (r) {
      return SUITS.every(function (s) { return hand.indexOf(r + s) >= 0; });
    });

    // 8 cards hold at most 2 fours → at most 4 combinations to try
    var best = null;
    var combos = 1 << fourRanks.length;
    for (var m = 0; m < combos; m++) {
      var items = [], used = {};
      fourRanks.forEach(function (r, i) {
        if (!(m & (1 << i))) return;
        var cards = SUITS.map(function (s) { return r + s; });
        cards.forEach(function (c) { used[c] = true; });
        // four Aces = أربعمية in صن/أشكل; everything else (and Aces in حكم) = مية
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

  /** Same-suit runs in NATURAL order. A long run is cut from the TOP:
      5 cards → مية, then whatever is left may still make a second
      project below it (e.g. a full 8-card suit = مية + سرا). */
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
        // run ended → cut it into projects, top first
        while (run.length >= 3) {
          var take = run.length >= 5 ? 5 : run.length;   // 5, 4 or 3
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

  /** STAGE 2 · trick-2 showdown. projMap = {'0': [...], '1': [...]}
      keyed by TEAM; each item = {seat, type, cards, topRank, ord}
      (ord = the declarer's position in play order, for tie-breaks).
      Only the team holding the single STRONGEST project keeps its
      projects — the other team's are cancelled. Strength: higher
      category first, then higher top card, then earlier declarer.
      بلوت is exempt: it always counts for its owner, never cancelled.
      Pure math on public data → every client computes the same result. */
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
        return a.ord - b.ord;              // earlier declarer in play order wins
      })[0];
      res.winTeam = best.team;
      comparable.forEach(function (it) {
        if (it.team === res.winTeam) res.projPts['t' + it.team] += projectValue(it.type, mode);
        else it.cancelled = true;
      });
    }
    return res;
  }

  /** ROUND SCORING (Kamelna):
      أبناط totals: 130 in صن/أشكل (120 cards + 10 آخر أكلة), 162 in حكم.
      Convert to نقاط: صن/أشكل ×2/10 (total 26) · حكم /10 (total 16).
      Simplified Kamelna rounding: opponents = round(theirs), buyer =
      total − opponents (so .5 rounds up for the non-buying team).
      خسران: buyer ≤ opponents → buyer 0, opponents take the whole total.
      كبوت: a team with ZERO tricks → other team gets 44 (صن) / 25 (حكم).
      STAGE 2 (all optional via `ext`, defaults reproduce stage 1 exactly):
      · ext.projPts   {t0,t1} surviving project نقاط (after the showdown)
      · ext.balootPts {t0,t1} بلوت نقاط — ALWAYS stays with its owner
      · ext.mult      1|2|3|4|'coffee' — the دبل chain (حكم only).
        mult ≥ 2 → winner-takes-all of the multiplied pot; قهوة is decided
        outside (the deal's winner jumps to 152 in collectTrick).
      خسران with projects: everything, projects included, goes to the
      opponents — EXCEPT بلوت which its owner keeps. */
  function scoreRound(mode, trump, tricksWon, lastTrickTeam, buyerSeat, ext) {
    ext = ext || {};
    var projPts = ext.projPts || { t0: 0, t1: 0 };
    var balootPts = ext.balootPts || { t0: 0, t1: 0 };
    var mult = ext.mult || 1;
    var sunLike = mode !== 'hokum';                 // أشكل scores exactly like صن

    var bTeam = buyerSeat % 2, oTeam = 1 - bTeam;
    var bnt = { t0: 0, t1: 0 };
    [0, 1].forEach(function (t) {
      (tricksWon['t' + t] || []).forEach(function (c) { bnt['t' + t] += cardPoints(c, mode, trump); });
    });
    bnt['t' + lastTrickTeam] += 10; // آخر أكلة

    var total = sunLike ? 26 : 16;
    var kabootVal = sunLike ? 44 : 25;
    var pts = { t0: 0, t1: 0 };
    var khosran = false, kaboot = null;
    var projSum = projPts.t0 + projPts.t1;   // after the showdown only ONE team has these
    var winTeam, oPts = 0, bPts = 0;

    // 1) who actually won this deal?
    if (!(tricksWon['t' + bTeam] || []).length) {            // buyers took nothing
      kaboot = 'opponents'; winTeam = oTeam;
    } else if (!(tricksWon['t' + oTeam] || []).length) {     // buyers swept everything
      kaboot = 'buyer'; winTeam = bTeam;
    } else {
      oPts = sunLike ? Math.round(bnt['t' + oTeam] * 2 / 10)
                     : Math.round(bnt['t' + oTeam] / 10);
      bPts = total - oPts;
      // the خسران check counts projects AND بلوت on both sides — the buyer
      // must beat everything on the table, melds included
      if (bPts + projPts['t' + bTeam] + balootPts['t' + bTeam] <=
          oPts + projPts['t' + oTeam] + balootPts['t' + oTeam]) {
        khosran = true; winTeam = oTeam;
      } else winTeam = bTeam;
    }
    var loseTeam = 1 - winTeam;

    // 2) hand out the نقاط
    if (mult === 'coffee' || mult >= 2) {
      // الدبل: winner-takes-all — the whole pot (كبوت value or the round
      // total) + ALL surviving projects + the winner's بلوت, everything
      // times the multiplier. The loser keeps only بلوت (multiplied too).
      var m = (mult === 'coffee') ? 1 : mult;  // قهوة jumps to 152 in collectTrick
      pts['t' + winTeam] = ((kaboot ? kabootVal : total) + projSum + balootPts['t' + winTeam]) * m;
      pts['t' + loseTeam] = balootPts['t' + loseTeam] * m;
    } else if (kaboot) {
      // كبوت: the sweeping team also collects surviving project points
      pts['t' + winTeam] = kabootVal + projSum + balootPts['t' + winTeam];
      pts['t' + loseTeam] = balootPts['t' + loseTeam];
    } else if (khosran) {
      // خسران: everything, projects included, goes to the opponents —
      // EXCEPT بلوت, which always stays with its owner
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
     STAGE 3 · BOT BRAIN — pure functions (no Firestore, no DOM) so they
     can be unit-tested. Bots only ever act through the same doBid /
     playCard transactions as humans, and botPlayChoice picks FROM
     legalMoves() — an illegal bot move is structurally impossible.
     ====================================================================== */

  /** Cheapest card: lowest بنط first, then weakest in trick strength
      (dumping a 7 before a Q, and never a J of trump by accident). */
  function cheapest(cards, mode, trump) {
    return cards.slice().sort(function (a, b) {
      var d = cardPoints(a, mode, trump) - cardPoints(b, mode, trump);
      if (d) return d;
      return strength(a, mode, trump) - strength(b, mode, trump);
    })[0];
  }

  /** Bidding heuristic (never دبل, never أشكل — bots keep it simple):
      · حكم candidate suit = J, or 9+A together (round 1: the flip suit,
        remembering the flip card itself joins the buyer's hand).
      · صن when the hand holds 3+ aces/tens spread over the hand.
      Returns {a:'sun'|'hokum'|'pass', suit} — round-2 حكم picks the best
      non-flip suit. Respects pendHokum (can't حكم over a pending حكم;
      صن legally beats it, so صن is still allowed). */
  function botBidChoice(hand, p) {
    var r = p.bidRound || 1;
    var flipS = suitOf(p.flip);
    function suitCards(s) { return hand.filter(function (c) { return suitOf(c) === s; }); }
    function has(cs, rk) { return cs.some(function (c) { return rankOf(c) === rk; }); }
    var acesTens = hand.filter(function (c) { var rk = rankOf(c); return rk === 'A' || rk === '10'; }).length;
    var sunOK = acesTens >= 3;

    if (r === 1) {
      // the flip card counts toward my trumps if I buy it
      var cs = suitCards(flipS).concat([p.flip]);
      var hokumOK = has(cs, 'J') || (has(cs, '9') && has(cs, 'A'));
      if (sunOK) return { a: 'sun' };                 // صن outranks a pending حكم
      if (hokumOK && !p.pendHokum) return { a: 'hokum', suit: null };
      return { a: 'pass' };
    }
    // round 2: صن first, else the strongest non-flip حكم suit
    if (sunOK) return { a: 'sun' };
    if (!p.pendHokum) {
      var best = null, bestScore = 0;
      SUITS.forEach(function (s) {
        if (s === flipS) return;
        var sc = suitCards(s);
        if (sc.length < 3) return;
        if (!(has(sc, 'J') || (has(sc, '9') && has(sc, 'A')))) return;
        var score = sc.length + (has(sc, 'J') ? 2 : 0) + (has(sc, '9') ? 1.5 : 0) + (has(sc, 'A') ? 1 : 0);
        if (score > bestScore) { bestScore = score; best = s; }
      });
      if (best) return { a: 'hokum', suit: best };
    }
    return { a: 'pass' };
  }

  /** Play heuristic — always a member of legalMoves():
      · leading: trump boss (J of trump) if my team bought in حكم,
        else the strongest card of my longest suit;
      · partner currently winning → throw the cheapest card;
      · else the cheapest card that currently WINS the trick, if any;
      · else the cheapest card full stop. */
  function botPlayChoice(hand, table, mode, trump, seat, buyer) {
    var legal = legalMoves(hand, table, mode, trump, seat);
    if (legal.length === 1) return legal[0];

    if (!table || !table.length) {                    // leading a trick
      if (mode === 'hokum' && buyer != null && (seat % 2) === (buyer % 2)) {
        if (legal.indexOf('J' + trump) >= 0) return 'J' + trump;
      }
      var bySuit = {};
      legal.forEach(function (c) { (bySuit[suitOf(c)] = bySuit[suitOf(c)] || []).push(c); });
      var suits = Object.keys(bySuit).sort(function (a, b) { return bySuit[b].length - bySuit[a].length; });
      var pick = bySuit[suits[0]];
      return pick.slice().sort(function (a, b) { return strength(b, mode, trump) - strength(a, mode, trump); })[0];
    }

    var win = winnerOf(table, mode, trump);
    if ((win.seat % 2) === (seat % 2)) return cheapest(legal, mode, trump);
    var led = suitOf(table[0].card);
    var wv = playVal(win.card, led, mode, trump);
    var winners = legal.filter(function (c) { return playVal(c, led, mode, trump) > wv; });
    if (winners.length) return cheapest(winners, mode, trump);
    return cheapest(legal, mode, trump);
  }

  // exposed for the /tmp node smoke test (harmless in the browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { newDeck: newDeck, shuffle: shuffle, legalMoves: legalMoves,
      winnerOf: winnerOf, scoreRound: scoreRound, findProjects: findProjects,
      botBidChoice: botBidChoice, botPlayChoice: botPlayChoice, suitOf: suitOf };
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
        bg_share_code: 'شارك الرمز مع أصحابك', bg_practice: 'أكمل بالروبوتات 🤖',
        bg_practice_hint: 'المقاعد الفارغة تلعب تلقائيًا — أنت تلعب مقعدك فقط',
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
        bg_spectator: 'تشاهد الطاولة (المقاعد ممتلئة)', bg_full: 'المقاعد ممتلئة',
        bg_ashkal: 'أشكل',
        bg_project: 'مشروع', bg_projects: 'المشاريع',
        bg_proj_cancelled: 'ملغي', bg_tap_close: 'اضغط للمتابعة',
        bg_proj_sira: 'سرا', bg_proj_50: 'خمسين', bg_proj_100: 'مية',
        bg_proj_400: 'أربعمية', bg_proj_baloot: 'بلوت',
        bg_double: 'دبل', bg_triple: 'تربل', bg_kawra: 'كورة', bg_qahwa: 'قهوة',
        bg_double_q: 'الدبل — ترفع الرهان؟',
        bg_coffee: 'قهوة! هذه الجولة تحسم اللعبة كاملة',
        // STAGE 3
        bg_ask1: 'أول؟', bg_ask2: 'ثاني؟', bg_ask_dbl: 'دبل؟',
        bg_bought: 'شريت!', bg_timeout_pass: 'انتهى الوقت ⏱',
        bg_bot_seat: 'روبوت'
      },
      en: {
        bg_title: 'Baloot Online', bg_sub: 'Private Baloot tables — Kamelna rules',
        bg_beta: 'Beta', bg_locked: 'Members only', bg_loading: 'Loading…',
        bg_create: 'Create table', bg_join: 'Join with a code', bg_code: 'Table code',
        bg_join_btn: 'Join', bg_resume: 'Return to your table', bg_no_table: 'No table with that code',
        bg_table_ended: 'The table was closed', bg_err: 'Something went wrong, try again', bg_copied: 'Code copied ✅',
        bg_share_code: 'Share the code with your friends', bg_practice: 'Fill with bots 🤖',
        bg_practice_hint: 'Empty seats play automatically — you play only your own seat',
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
        bg_spectator: 'Watching (seats are full)', bg_full: 'Seats are full',
        bg_ashkal: 'Ashkal',
        bg_project: 'Project', bg_projects: 'Projects',
        bg_proj_cancelled: 'Cancelled', bg_tap_close: 'Tap to continue',
        bg_proj_sira: 'Sira', bg_proj_50: 'Fifty', bg_proj_100: 'Hundred',
        bg_proj_400: 'Four hundred', bg_proj_baloot: 'Baloot',
        bg_double: 'Double', bg_triple: 'Triple', bg_kawra: 'Kawra', bg_qahwa: 'Qahwa',
        bg_double_q: 'Doubling — raise the stakes?',
        bg_coffee: 'Qahwa! This deal decides the whole game',
        // STAGE 3
        bg_ask1: 'Awwal?', bg_ask2: 'Thani?', bg_ask_dbl: 'Double?',
        bg_bought: 'Bought!', bg_timeout_pass: 'Time is up ⏱',
        bg_bot_seat: 'Bot'
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
        privRetryTimer: null, // re-attach timer for killed priv listeners
        collectSig: null, collectTimer: null, sweepTimer: null,
        prevSig: '', prevCount: 0,   // trick animation bookkeeping
        lastActing: null, suitPick: false, suitPickKey: '',
        projShownRound: 0, projTimerRound: 0, projTimer: null, // trick-2 reveal overlay
        // STAGE 3: pacing engine
        turnSig: '', turnStartAt: 0,          // current turn signature + local start time
        turnTimer: null, backupTimer: null,   // human timeout / host backup
        botTimer: null, botTries: 0,          // bot action scheduler
        dealAnimKey: '', restAnimKey: '', lastPhase: null, dealOv: null, // deal animation
        autoNextKey: '', autoNextTimer: null, autoNextInt: null // roundEnd auto-advance
      };

      session = {
        close: function () {
          try { if (st.pubUnsub) st.pubUnsub(); } catch (e) {}
          Object.keys(st.privSubs).forEach(function (k) { try { st.privSubs[k](); } catch (e) {} });
          st.privSubs = {};
          st.pubUnsub = null;
          clearTimeout(st.privRetryTimer);
          clearTimeout(st.collectTimer); clearTimeout(st.sweepTimer);
          clearTimeout(st.projTimer);
          clearTimeout(st.turnTimer); clearTimeout(st.backupTimer);
          clearTimeout(st.botTimer);
          clearTimeout(st.autoNextTimer); clearInterval(st.autoNextInt);
          if (st.dealOv) { try { st.dealOv.remove(); } catch (e) {} st.dealOv = null; }
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
      /** STAGE 3: a bot seat = a seat created with bot:true, OR a legacy
          practice-mode "virtual" seat (old tables upgrade gracefully —
          their virtual guests simply become bot-driven). */
      function isBotSeat(i) {
        var s = st.pub && st.pub.seats && st.pub.seats[i];
        return !!(s && (s.bot || s.virtual));
      }
      function hasBots() {
        var p = st.pub; if (!p || !p.seats) return false;
        return p.seats.some(function (s, i) { return isBotSeat(i); });
      }
      /** STAGE 3: humans control ONLY their own seat — bots are driven by
          the host's pacing engine, never through the UI. */
      function controlsSeat(i) {
        var p = st.pub; if (!p || !p.seats || !p.seats[i]) return false;
        if (isBotSeat(i)) return false;
        return p.seats[i].uid === myUid;
      }
      /** Priv doc key: bots (and every seat of a LEGACY practice table,
          which has practice:true but no bots map) live at 'seatN';
          humans live at their uid. `practice:true` is kept on bot tables
          purely so the existing rules keep 'seatN' host-readable. */
      function privKey(i) {
        var p = st.pub;
        if (isBotSeat(i)) return 'seat' + i;
        if (p && p.practice && !p.bots) return 'seat' + i; // legacy practice table
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
      /** STAGE 3: everyone (host included) acts only for their own seat —
          bots replaced the old "host plays every empty seat" practice. */
      function actingSeat() { return mySeat(); }
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
            mode: null, trump: null, buyer: null, buyRound: null,
            table: [], tricksWon: { t0: [], t1: [] }, lastTrickWinner: null,
            roundScores: null, totals: { t0: 0, t1: 0 },
            handCounts: [0, 0, 0, 0], roundNo: 0,
            // STAGE 2: projects keyed by team, the دبل chain, declaration flags
            projects: {}, declared: {}, mult: 1, doubleTurn: null, doubleLeft: []
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
            pacing();          // STAGE 3: bots + turn timers + auto-advance
            paint();
            dealAnimations();  // STAGE 3: needs the freshly painted felt
          } catch (e) { /* defensive: never let a paint error kill the stream */ }
        }, function () { toast(I18n.t('bg_err')); });
      }

      /** Listen to the private hand docs I'm allowed to read.
          IMPORTANT: in practice mode the seat0..seat3 listens are first
          attached from the LOCAL echo of the `practice:true` write, so the
          server can evaluate their rule (tbl().practice == true) before the
          flag commits → PERMISSION_DENIED. Firestore kills a denied listener
          permanently, so on error we must drop it and retry — otherwise the
          dead unsubscribe fn stays in st.privSubs and hands never load. */
      function subscribePrivs() {
        var p = st.pub; if (!p) return;
        var want = [];
        if (p.practice && !p.bots) {
          // LEGACY practice table: every hand lives at seat0..seat3
          want = isHost() ? ['seat0', 'seat1', 'seat2', 'seat3'] : (myUid ? [myUid] : []);
        } else {
          if (myUid) want = [myUid];
          // STAGE 3: the host also reads the bot hands (rule: practice==true)
          if (isHost()) {
            for (var bi = 0; bi < 4; bi++) if (isBotSeat(bi)) want.push('seat' + bi);
          }
        }
        want.forEach(function (key) {
          if (st.privSubs[key]) return;
          st.privSubs[key] = st.ref.collection('priv').doc(key).onSnapshot(function (doc) {
            try {
              st.hands[key] = (doc.exists && (doc.data().cards || [])) || [];
              paint();
            } catch (e) {}
          }, function () {
            // Listener terminated (permission race / transient error):
            // clean it out and re-attach shortly. One shared timer is
            // enough — subscribePrivs() re-adds every missing key.
            try { st.privSubs[key](); } catch (e) {}
            delete st.privSubs[key];
            delete st.hands[key];
            clearTimeout(st.privRetryTimer);
            st.privRetryTimer = setTimeout(function () {
              if (st.pub && st.ref) subscribePrivs();
            }, 1200);
          });
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
          // STAGE 3: wait for the flip card's flight to the buyer first
          setTimeout(function () {
            dealRest().catch(function () { st.guard = ''; toast(I18n.t('bg_err')); });
          }, 1050);
        }
        // ورق (all passed) or the roundEnd auto-advance both land here
        if ((p.phase === 'redeal' || p.phase === 'dealing') && st.guard !== 'deal' + (p.roundNo + 1)) {
          st.guard = 'deal' + (p.roundNo + 1);
          setTimeout(function () {
            deal(st.pub && st.pub.dealer != null ? st.pub.dealer : p.dealer)
              .catch(function () { st.guard = ''; toast(I18n.t('bg_err')); });
          }, p.phase === 'redeal' ? 900 : 250);
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
          mode: null, trump: null, buyer: null, buyRound: null,
          table: [], tricksWon: { t0: [], t1: [] }, lastTrickWinner: null,
          roundScores: null, handCounts: [5, 5, 5, 5],
          roundNo: (p.roundNo || 0) + 1, updatedAt: ts(),
          // STAGE 2: fresh round → no projects, no دبل, nobody declared
          projects: {}, declared: {}, mult: 1, doubleTurn: null, doubleLeft: []
        });
        await batch.commit();
      }

      /** After the buy: complete every hand to 8. WHO takes the flipped card
          (STAGE 2, standard rule — the flip's seat gets 2 extras, others 3):
          · a round-1 buy → the buyer, exactly as before;
          · أشكل → the declarer (that IS the whole point of أشكل);
          · any other round-2 buy (صن or free-suit حكم) → the DEALER.
          Then: حكم pauses at the doubling phase; صن/أشكل play right away. */
      async function dealRest() {
        var p = st.pub;
        var deckSnap = await st.ref.collection('priv').doc('deck').get();
        var rest = (deckSnap.exists && (deckSnap.data().cards || [])) || [];
        if (rest.length !== 11) throw new Error('bad deck');
        var flipSeat = (p.mode === 'ashkal' || (p.buyRound || 1) === 1) ? p.buyer : p.dealer;
        var adds = {}, idx = 0;
        for (var k = 1; k <= 4; k++) {
          var seat = (p.dealer + k) % 4;
          var n = (seat === flipSeat) ? 2 : 3;
          adds[seat] = rest.slice(idx, idx + n);
          idx += n;
        }
        adds[flipSeat] = adds[flipSeat].concat([p.flip]); // the الشراء card
        var batch = db.batch();
        for (var i = 0; i < 4; i++) {
          batch.update(privRef(i), { cards: FV.arrayUnion.apply(FV, adds[i]) });
        }
        batch.set(st.ref.collection('priv').doc('deck'), { cards: [] });
        var upd = { handCounts: [8, 8, 8, 8], table: [], updatedAt: ts() };
        if (p.mode === 'hokum') {
          // STAGE 2: before the first card the buyer's OPPONENTS may دبل.
          // Ask them in turn order starting from the dealer's right.
          var oppTeam = 1 - (p.buyer % 2), ask = [];
          for (var j = 1; j <= 4; j++) {
            var s2 = (p.dealer + j) % 4;
            if (s2 % 2 === oppTeam) ask.push(s2);
          }
          upd.phase = 'doubling'; upd.turn = -1;
          upd.doubleTurn = ask[0]; upd.doubleLeft = ask;
        } else {
          upd.phase = 'playing'; upd.turn = (p.dealer + 1) % 4;
        }
        batch.update(st.ref, upd);
        await batch.commit();
      }

      /* ======================================================================
         BIDDING — transactional so only the seat whose turn it is can act.
         Round 1: حكم = flip suit · صن ends the auction instantly.
         Round 2: حكم = any other suit. 8 passes → ورق (redeal, dealer+1).
         ====================================================================== */
      async function doBid(action, chosenSuit, tick) {
        var actSeat = st.pub && st.pub.turn;
        st.suitPick = false;
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'bidding' || p.turn !== actSeat) throw new Error('turn');
            if (tick && p.botTick === tick) throw new Error('tick'); // STAGE 3: two-tab guard
            var r = p.bidRound || 1;
            var bids = (p.bids || []).slice();
            var upd = { updatedAt: ts() };
            if (tick) upd.botTick = tick;

            if (action === 'sun' || action === 'ashkal') {
              // صن/أشكل end the auction on the spot — nothing outbids them,
              // and the first one spoken wins (they beat any pending حكم).
              // أشكل is a ROUND-2 bid that plays & scores exactly like صن;
              // the only difference is that the flipped card goes to the
              // declarer instead of the dealer (see dealRest).
              if (action === 'ashkal' && r !== 2) throw new Error('round');
              bids.push({ s: actSeat, a: action, r: r });
              upd.mode = action; upd.trump = null; upd.buyer = actSeat; upd.buyRound = r;
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
              upd.mode = 'hokum'; upd.trump = ph.suit; upd.buyer = ph.s; upd.buyRound = r;
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
      async function playCard(seat, card, tick) {
        var key = privKey(seat);
        var hand = (st.hands[key] || []).slice();
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'playing' || p.turn !== seat) throw new Error('turn');
            if (tick && p.botTick === tick) throw new Error('tick'); // STAGE 3: two-tab guard
            var table = (p.table || []).slice();
            if (table.length >= 4) throw new Error('full');
            var legal = legalMoves(hand, table, p.mode, p.trump, seat);
            if (legal.indexOf(card) < 0) throw new Error('illegal');
            table.push({ seat: seat, card: card });
            var hc = (p.handCounts || [8, 8, 8, 8]).slice();
            hc[seat] = Math.max(0, hc[seat] - 1);
            var upd = {
              table: table, handCounts: hc,
              turn: table.length < 4 ? (seat + 1) % 4 : -1,   // -1 freezes input during the sweep
              updatedAt: ts()
            };
            if (tick) upd.botTick = tick;
            tx.update(st.ref, upd);
          });
          // optimistic local update + authoritative priv-doc update
          st.hands[key] = hand.filter(function (c) { return c !== card; });
          await st.ref.collection('priv').doc(key).update({ cards: FV.arrayRemove(card) });
        } catch (e) { /* stale turn / double tap — ignore, snapshot rules */ }
      }

      /* ======================================================================
         STAGE 2 · الدبل (حكم only) — a bidding-style chain before play:
         the buyer's opponents may دبل (×2), then the buyer's team may
         تربل (×3), opponents كورة (×4), and finally the buyer's team may
         call قهوة — this one deal decides the whole game. بس passes; when
         both seats of the asking team pass, the chain stops and play begins.
         ====================================================================== */
      async function doDouble(action, tick) {
        var actSeat = st.pub && st.pub.doubleTurn;
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'doubling' || p.doubleTurn !== actSeat) throw new Error('turn');
            if (tick && p.botTick === tick) throw new Error('tick'); // STAGE 3: two-tab guard
            var upd = { updatedAt: ts() };
            if (tick) upd.botTick = tick;
            if (action === 'raise') {
              var cur = p.mult || 1;
              var next = cur >= 4 ? 'coffee' : cur + 1;   // 1→2→3→4→قهوة
              upd.mult = next;
              if (next === 'coffee') {
                // nothing can top قهوة → straight to the cards
                upd.phase = 'playing'; upd.turn = (p.dealer + 1) % 4;
                upd.doubleTurn = null; upd.doubleLeft = [];
              } else {
                // the OTHER team now gets a chance to raise back
                var team = 1 - (actSeat % 2), ask = [];
                for (var j = 1; j <= 4; j++) {
                  var s = (p.dealer + j) % 4;
                  if (s % 2 === team) ask.push(s);        // turn order from dealer+1
                }
                upd.doubleTurn = ask[0]; upd.doubleLeft = ask;
              }
            } else { // بس
              var left = (p.doubleLeft || []).filter(function (s2) { return s2 !== actSeat; });
              if (left.length) { upd.doubleTurn = left[0]; upd.doubleLeft = left; }
              else {
                upd.phase = 'playing'; upd.turn = (p.dealer + 1) % 4;
                upd.doubleTurn = null; upd.doubleLeft = [];
              }
            }
            tx.update(st.ref, upd);
          });
        } catch (e) { /* stale turn / double tap — snapshot repaints */ }
      }

      /* ======================================================================
         STAGE 2 · مشاريع — declaring during trick 1.
         Tapping «مشروع» computes the projects from the player's FULL 8-card
         hand (so playing a card later can't break them), stores them on the
         public doc keyed by team and flags the seat: everyone immediately
         sees a chip saying a project exists, but the UI keeps the cards
         hidden until the trick-2 showdown (projectOverlay).
         House-rule simplification: بلوت is auto-detected from the hand and
         declared with this same button (instead of announcing it while
         playing the K/Q) — it is auto-scored and never cancelled.
         ====================================================================== */
      async function declareProject(seat) {
        var hand = (st.hands[privKey(seat)] || []).slice();
        if (hand.length !== 8) return;                 // must act before my first card
        var found = findProjects(hand, st.pub && st.pub.mode, st.pub && st.pub.trump);
        if (!found.length) return;
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'playing') throw new Error('phase');
            var tw = p.tricksWon || {};
            if (((tw.t0 || []).length + (tw.t1 || []).length) > 0) throw new Error('late'); // trick 1 only
            if (p.declared && p.declared[seat]) throw new Error('dup');
            var ord = (seat - ((p.dealer + 1) % 4) + 4) % 4; // play-order position (tie-break)
            var teamKey = String(seat % 2);
            var projects = {
              0: ((p.projects || {})['0'] || []).slice(),
              1: ((p.projects || {})['1'] || []).slice()
            };
            found.forEach(function (it) {
              projects[teamKey].push({ seat: seat, type: it.type, cards: it.cards,
                                       topRank: it.topRank, ord: ord });
            });
            var declared = Object.assign({}, p.declared || {});
            declared[seat] = true;
            tx.update(st.ref, { projects: projects, declared: declared, updatedAt: ts() });
          });
        } catch (e) { /* too late / double tap — snapshot repaints */ }
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
          }, 550);

          var delay = -1;
          if (controlsSeat(p.table[3].seat)) delay = 800;
          else if (isHost()) delay = isBotSeat(p.table[3].seat) ? 850 : 1500; // host drives bot tricks
          else if (mySeat() >= 0) delay = 2200;
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
              // hand over → score it (آخر أكلة belongs to this trick's winner).
              // STAGE 2: fold in the projects showdown and the دبل multiplier
              // (with no projects and mult=1 this is exactly the stage-1 math).
              var pr = resolveProjects(p.projects, p.mode);
              var rs = scoreRound(p.mode, p.trump, tw, team, p.buyer,
                { projPts: pr.projPts, balootPts: pr.balootPts, mult: p.mult || 1 });
              rs.mode = p.mode; rs.trump = p.trump; rs.buyer = p.buyer;
              rs.projItems = pr.items; // per-project lines for the round summary
              var prev = {
                t0: (p.totals && p.totals.t0) || 0,
                t1: (p.totals && p.totals.t1) || 0
              };
              if (rs.coffee) {
                // قهوة: this single deal decides the whole game — the deal's
                // winner jumps straight to the 152 finish line.
                rs.pts = { t0: 0, t1: 0 };
                rs.pts['t' + rs.winTeam] = Math.max(0, 152 - prev['t' + rs.winTeam]);
              }
              var totals = { t0: prev.t0 + rs.pts.t0, t1: prev.t1 + rs.pts.t1 };
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
         STAGE 3 · PACING ENGINE — one signature per "turn state". When it
         changes, every client (re)schedules exactly one thing:
         · bot seat  → the HOST's client plays it after 700–1200ms (guarded
           by the transaction turn-check + a botTick marker, so a second
           host tab can never double-move);
         · my seat   → a 20s timeout that auto-acts (بس / lowest legal card);
         · other human, bidding/doubling → host backup timeout at 23s (the
           host cannot backup PLAYS — it can't read human hands by design).
         Also drives the 6s «التالية» auto-advance on the round summary.
         ====================================================================== */
      var TURN_MS = 20000; // Kamelna shows a short turn timer; exact length unpublished → 20s

      function turnSigOf(p) {
        if (!p) return '';
        if (p.phase === 'bidding') {
          return 'b|' + p.roundNo + '|' + (p.bidRound || 1) + '|' + p.turn + '|' + (p.bids || []).length;
        }
        if (p.phase === 'doubling') {
          return 'd|' + p.roundNo + '|' + p.doubleTurn + '|' + p.mult + '|' + (p.doubleLeft || []).length;
        }
        if (p.phase === 'playing') {
          var tw = p.tricksWon || {};
          return 'p|' + p.roundNo + '|' + p.turn + '|' + (p.table || []).length +
                 '|' + ((tw.t0 || []).length + (tw.t1 || []).length);
        }
        return p.phase + '|' + (p.roundNo || 0);
      }
      function actorOf(p) {
        if (!p) return -1;
        if (p.phase === 'doubling') return (p.doubleTurn != null) ? p.doubleTurn : -1;
        if (p.phase === 'bidding' || p.phase === 'playing') return (p.turn != null) ? p.turn : -1;
        return -1;
      }

      function pacing() {
        var p = st.pub; if (!p) return;
        var sig = turnSigOf(p);
        if (sig !== st.turnSig) {
          st.turnSig = sig; st.turnStartAt = Date.now(); st.botTries = 0;
          clearTimeout(st.turnTimer); clearTimeout(st.backupTimer); clearTimeout(st.botTimer);
          var act = actorOf(p);
          if (act >= 0 && (p.table || []).length < 4) {
            if (isBotSeat(act)) {
              if (isHost()) {
                st.botTimer = setTimeout(function () { botAct(sig); }, 700 + Math.floor(Math.random() * 500));
              }
            } else if (controlsSeat(act)) {
              st.turnTimer = setTimeout(function () { autoAct(sig, act); }, TURN_MS);
            } else if (isHost() && p.phase !== 'playing') {
              st.backupTimer = setTimeout(function () { autoAct(sig, act); }, TURN_MS + 3000);
            }
          }
        }
        // roundEnd summary: host auto-advances after 6s with a countdown
        if (p.phase === 'roundEnd' && isHost()) {
          if (st.autoNextKey !== 'n' + p.roundNo) {
            st.autoNextKey = 'n' + p.roundNo;
            clearTimeout(st.autoNextTimer); clearInterval(st.autoNextInt);
            var end = Date.now() + 6000;
            st.autoNextTimer = setTimeout(nextRound, 6050);
            st.autoNextInt = setInterval(function () {
              var s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
              try {
                var b = root.querySelector('.bg-nextbtn');
                if (b) b.textContent = I18n.t('bg_next_round') + ' · ' + s;
              } catch (e) {}
              if (s <= 0) clearInterval(st.autoNextInt);
            }, 300);
          }
        } else if (p.phase !== 'roundEnd' && st.autoNextKey) {
          st.autoNextKey = '';
          clearTimeout(st.autoNextTimer); clearInterval(st.autoNextInt);
        }
      }

      /** One bot action (host client only). Re-validates the turn signature,
          skips if another host tab already ticked this exact state, retries
          briefly if the bot's hand hasn't streamed in yet. */
      async function botAct(sig) {
        var p = st.pub;
        if (!p || !isHost() || turnSigOf(p) !== sig) return;
        if (p.botTick === sig) return;                    // second tab already moved
        var act = actorOf(p);
        if (act < 0 || !isBotSeat(act)) return;
        try {
          if (p.phase === 'doubling') { await doDouble('pass', sig); return; }  // bots never دبل
          var hand = st.hands[privKey(act)] || [];
          if (!hand.length) {                             // priv doc still loading
            if (st.botTries++ < 10) st.botTimer = setTimeout(function () { botAct(sig); }, 450);
            return;
          }
          if (p.phase === 'bidding') {
            var ch = botBidChoice(hand, p);
            await doBid(ch.a, ch.suit || null, sig);
          } else if (p.phase === 'playing') {
            // declare projects automatically before the bot's first card
            var tw = p.tricksWon || {};
            var isT1 = !((tw.t0 || []).length) && !((tw.t1 || []).length);
            if (isT1 && hand.length === 8 && !((p.declared || {})[act]) &&
                findProjects(hand, p.mode, p.trump).length) {
              await declareProject(act);
            }
            var card = botPlayChoice(hand, p.table || [], p.mode, p.trump, act, p.buyer);
            await playCard(act, card, sig);
          }
        } catch (e) { /* transaction turn-check lost a race — snapshot rules */ }
      }

      /** Turn-timer expiry: بس on bids/doubles, lowest legal card on plays. */
      async function autoAct(sig, seat) {
        var p = st.pub;
        if (!p || turnSigOf(p) !== sig) return;
        if (p.botTick === sig) return;
        try {
          if (controlsSeat(seat)) toast(I18n.t('bg_timeout_pass')); // it was MY turn
          if (p.phase === 'bidding') await doBid('pass', null, sig);
          else if (p.phase === 'doubling') await doDouble('pass', sig);
          else if (p.phase === 'playing' && controlsSeat(seat)) {
            var hand = st.hands[privKey(seat)] || [];
            if (!hand.length) return;
            var legal = legalMoves(hand, p.table || [], p.mode, p.trump, seat);
            await playCard(seat, cheapest(legal, p.mode, p.trump), sig);
          }
        } catch (e) {}
      }

      /* ======================================================================
         STAGE 3 · DEAL ANIMATION — card backs fly from the dealer's seat to
         each seat in Kamelna's 3-then-2 rhythm (and 3/3/3+2 after a buy).
         The overlay lives on document.body so snapshot repaints (which wipe
         `root`) can't kill it mid-flight.
         ====================================================================== */
      function runDealAnim(kind) {
        try {
          var p = st.pub; if (!p) return;
          var felt = root.querySelector('.bg-felt'); if (!felt) return;
          var rect = felt.getBoundingClientRect(); if (!rect.width) return;
          if (st.dealOv) { try { st.dealOv.remove(); } catch (e) {} }
          var ov = UI.el('div', { class: 'bg-dealov' });
          st.dealOv = ov;
          document.body.appendChild(ov);

          var POS = { b: [0.5, 0.88], t: [0.5, 0.12], l: [0.09, 0.5], r: [0.91, 0.5] };
          var from = POS[relPos(p.dealer)];
          var order = []; for (var k = 1; k <= 4; k++) order.push((p.dealer + k) % 4);
          var plan = [];
          if (kind === 'first') {                       // 3 to each, then 2 to each
            order.forEach(function (s) { plan.push(s, s, s); });
            order.forEach(function (s) { plan.push(s, s); });
          } else {                                      // rest: 3 each, 2 to the flip's seat
            var flipSeat = (p.mode === 'ashkal' || (p.buyRound || 1) === 1) ? p.buyer : p.dealer;
            order.forEach(function (s) {
              var n = (s === flipSeat) ? 2 : 3;
              for (var j = 0; j < n; j++) plan.push(s);
            });
          }
          plan.forEach(function (s, i) {
            var c = UI.el('div', { class: 'bg-dealcard' });
            c.style.left = (rect.left + rect.width * from[0] - 19) + 'px';
            c.style.top = (rect.top + rect.height * from[1] - 27) + 'px';
            c.style.transitionDelay = (i * 60) + 'ms';
            ov.appendChild(c);
          });
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            for (var i = 0; i < ov.children.length; i++) {
              var to = POS[relPos(plan[i])];
              ov.children[i].style.left = (rect.left + rect.width * to[0] - 19) + 'px';
              ov.children[i].style.top = (rect.top + rect.height * to[1] - 27) + 'px';
              ov.children[i].classList.add('go');
            }
          }); });
          setTimeout(function () {
            try { ov.remove(); } catch (e) {}
            if (st.dealOv === ov) st.dealOv = null;
          }, plan.length * 60 + 900);
        } catch (e) {}
      }

      /** Fire the right deal animation exactly once per phase transition
          (never on reload/rejoin — only when we SAW the previous phase). */
      function dealAnimations() {
        var p = st.pub; if (!p) return;
        var prev = st.lastPhase;
        st.lastPhase = p.roundNo + '|' + p.phase;
        if (p.phase === 'bidding' && (p.handCounts || [])[0] === 5 &&
            st.dealAnimKey !== 'f' + p.roundNo) {
          st.dealAnimKey = 'f' + p.roundNo;
          if (prev && prev !== st.lastPhase) runDealAnim('first');
          return;
        }
        if ((p.phase === 'doubling' || p.phase === 'playing') &&
            st.restAnimKey !== 'r' + p.roundNo && prev === p.roundNo + '|dealRest') {
          st.restAnimKey = 'r' + p.roundNo;
          runDealAnim('rest');
        }
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
            // STAGE 3: empty seats become bots. practice stays TRUE so the
            // existing priv rule keeps 'seatN' docs host-readable; the new
            // `bots` map is what tells the client this is the NEW scheme
            // (humans at uid docs, bots at seatN docs).
            if (mySeat() < 0) { toast(I18n.t('bg_sit')); return; }
            var names = ['سالم', 'فهد', 'ماجد'], ni = 0, bots = {};
            seats = seats.map(function (s, i) {
              if (s) return s;
              bots[i] = true;
              return { uid: null, name: (names[ni++] || I18n.t('bg_bot_seat')) + ' 🤖', bot: true };
            });
            await st.ref.update({ seats: seats, bots: bots, updatedAt: ts() });
            st.pub = Object.assign({}, p, { seats: seats, bots: bots }); // deal() needs them now
          } else if (seats.some(function (s) { return !s; })) {
            toast(I18n.t('bg_need4')); return;
          }
          await deal(st.pub.dealer || 0);
        } catch (e) { toast(I18n.t('bg_err')); }
      }

      /** STAGE 3: next round goes through a phase-checked transaction
          (roundEnd → dealing) so the 6s auto-advance and a manual tap
          can never double-deal; hostAutomation performs the actual deal. */
      async function nextRound() {
        if (!isHost()) return;
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'roundEnd') throw new Error('phase');
            tx.update(st.ref, { phase: 'dealing', dealer: ((p.dealer || 0) + 1) % 4, updatedAt: ts() });
          });
        } catch (e) { /* already advanced — fine */ }
      }

      async function newGame() {
        if (!isHost()) return;
        try {
          await db.runTransaction(async function (tx) {
            var snap = await tx.get(st.ref);
            var p = snap.data();
            if (!p || p.phase !== 'gameEnd') throw new Error('phase');
            tx.update(st.ref, {
              totals: { t0: 0, t1: 0 }, phase: 'dealing',
              dealer: ((p.dealer || 0) + 1) % 4, updatedAt: ts()
            });
          });
        } catch (e) { /* already restarted — fine */ }
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
        if (p.phase === 'doubling' && p.doubleTurn != null && controlsSeat(p.doubleTurn)) {
          root.appendChild(doubleSheet(p));            // STAGE 2: دبل chain
        }
        var reveal = projectOverlay(p);                // STAGE 2: trick-2 showdown
        if (reveal) root.appendChild(reveal);
        if (p.phase === 'roundEnd') root.appendChild(roundEndModal(p));
        if (p.phase === 'gameEnd') root.appendChild(gameEndModal(p));
      }

      function topBar(p) {
        var us = (p.totals && p.totals[myTeamKey()]) || 0;
        var them = (p.totals && p.totals[themTeamKey()]) || 0;
        var modeChip;
        if (p.mode === 'sun') modeChip = UI.el('span', { class: 'bg-chip bg-chip-sun' }, '☀️ ' + I18n.t('bg_sun'));
        else if (p.mode === 'ashkal') modeChip = UI.el('span', { class: 'bg-chip bg-chip-ashkal' }, I18n.t('bg_ashkal'));
        else if (p.mode === 'hokum') {
          modeChip = UI.el('span', { class: 'bg-chip bg-chip-hokum' + (p.trump === 'H' || p.trump === 'D' ? ' redsuit' : '') },
            I18n.t('bg_hokum') + ' ' + SUIT_CHAR[p.trump]);
        } else modeChip = UI.el('span', { class: 'bg-chip' }, I18n.t('bg_flip'));

        // STAGE 2: دبل chip — ×2 / ×3 / ×4 / ☕ next to the mode
        var multChip = null;
        if (p.mult === 'coffee') multChip = UI.el('span', { class: 'bg-chip bg-chip-mult' }, '☕ ' + I18n.t('bg_qahwa'));
        else if (p.mult >= 2) multChip = UI.el('span', { class: 'bg-chip bg-chip-mult' }, '×' + p.mult);

        return UI.el('div', { class: 'bg-topbar' }, [
          UI.el('span', { class: 'bg-score' }, [
            UI.el('b', null, I18n.t('bg_us') + ' ' + us),
            UI.el('i', null, ' · '),
            UI.el('b', { class: 'them' }, I18n.t('bg_them') + ' ' + them)
          ]),
          modeChip,
          multChip,
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
        var isTurn = (p.turn === i && (p.phase === 'bidding' || p.phase === 'playing')) ||
                     (p.phase === 'doubling' && p.doubleTurn === i); // STAGE 2
        var partner = (i % 2 === viewSeat() % 2) && i !== viewSeat();

        // STAGE 3: avatar wrapper carries the shrinking turn-timer ring
        var av = UI.el('div', { class: 'bg-avatar' + (isBotSeat(i) ? ' bot' : '') },
          isBotSeat(i) ? '🤖' : UI.initials(name));
        var avKids = [av];
        if (isTurn && !isBotSeat(i) &&
            (p.phase === 'bidding' || p.phase === 'playing' || p.phase === 'doubling')) {
          var elapsed = Math.max(0, (Date.now() - (st.turnStartAt || Date.now())) / 1000);
          var ring = UI.el('div', { class: 'bg-ring' });
          ring.innerHTML =
            '<svg viewBox="0 0 54 54"><circle class="track" cx="27" cy="27" r="24"/>' +
            '<circle class="left" cx="27" cy="27" r="24" style="animation-delay:-' +
            elapsed.toFixed(2) + 's"/></svg>';
          avKids.push(ring);
        }
        // STAGE 3: the dealer's question rides on the current bidder's seat
        if (p.phase === 'bidding' && p.turn === i) {
          avKids.push(UI.el('div', { class: 'bg-ask' },
            I18n.t((p.bidRound || 1) === 1 ? 'bg_ask1' : 'bg_ask2')));
        }
        if (p.phase === 'doubling' && p.doubleTurn === i) {
          avKids.push(UI.el('div', { class: 'bg-ask' }, I18n.t('bg_ask_dbl')));
        }
        var kids = [
          UI.el('div', { class: 'bg-avwrap' }, avKids),
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
        // STAGE 3: the winning buyer's chip while the flip card flies over
        if (p.phase === 'dealRest' && p.buyer === i) {
          kids.push(UI.el('div', { class: 'bg-bidlbl' }, I18n.t('bg_bought') + ' ' + lastBid(p, i)));
        }
        // STAGE 2: «مشروع» chip — everyone sees WHO declared, not WHAT
        if (p.phase === 'playing' && p.declared && p.declared[i]) {
          kids.push(UI.el('div', { class: 'bg-tag proj' }, I18n.t('bg_project')));
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
        if (b.a === 'ashkal') return I18n.t('bg_ashkal');
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
        if (p.phase === 'dealRest') {
          // STAGE 3: the مشترى flies from the middle to whoever receives it
          // (round-1 buyer / أشكل declarer / the dealer on a round-2 صن·حكم)
          var flipSeat = (p.mode === 'ashkal' || (p.buyRound || 1) === 1) ? p.buyer : p.dealer;
          if (p.flip && flipSeat != null) {
            c.appendChild(UI.el('div', { class: 'bg-flipwrap bg-fly-' + relPos(flipSeat) },
              [cardEl(p.flip, 'bg-flipcard')]));
          }
          c.appendChild(UI.el('div', { class: 'bg-turnhint soft' }, I18n.t('bg_dealing')));
          return c;
        }
        if (p.phase === 'redeal' || p.phase === 'dealing') {
          c.appendChild(UI.el('div', { class: 'bg-turnhint' },
            I18n.t(p.phase === 'redeal' ? 'bg_redeal' : 'bg_dealing')));
          return c;
        }
        if (p.phase === 'doubling') { // STAGE 2: whose دبل decision is it?
          c.appendChild(UI.el('div', { class: 'bg-turnhint' },
            (p.doubleTurn != null && controlsSeat(p.doubleTurn))
              ? I18n.t('bg_your_turn')
              : I18n.t('bg_turn_of') + ' ' + seatName(p.doubleTurn)));
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
        var hand = sortHand(st.hands[privKey(act)] || [], p.mode, p.trump);
        var canAct = p.phase === 'playing' && p.turn === act && controlsSeat(act);
        var legal = canAct ? legalMoves(hand, p.table || [], p.mode, p.trump, act) : [];
        // STAGE 2: «مشروع» pill — trick 1 only, on my turn, BEFORE I play my
        // card (hand still holds all 8), and only if there really is a project.
        if (canAct && hand.length === 8 && !((p.declared || {})[act])) {
          var tw1 = p.tricksWon || {};
          var isTrick1 = !((tw1.t0 || []).length) && !((tw1.t1 || []).length);
          if (isTrick1 && findProjects(hand, p.mode, p.trump).length) {
            var pill = UI.el('button', { class: 'bg-projpill', onclick: function () {
              pill.setAttribute('disabled', 'true');
              declareProject(act);
            } }, I18n.t('bg_project'));
            wrap.appendChild(pill);
          }
        }
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
          // STAGE 3: no flip card here — the مشترى stays visible on the felt.
          // The sheet only carries the dealer's question + the answers.
          body.appendChild(UI.el('div', { class: 'bg-sheet-title' },
            I18n.t(r === 1 ? 'bg_ask1' : 'bg_ask2')));
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
          var rowKids = [
            UI.el('button', { class: 'bg-bid sun', onclick: function () { doBid('sun'); } }, I18n.t('bg_sun'))
          ];
          if (r === 2) { // STAGE 2: أشكل — round 2 only, like صن but the flip is mine
            rowKids.push(UI.el('button', { class: 'bg-bid ashkal', onclick: function () { doBid('ashkal'); } },
              I18n.t('bg_ashkal')));
          }
          rowKids.push(hokumBtn);
          rowKids.push(UI.el('button', { class: 'bg-bid pass', onclick: function () { doBid('pass'); } }, I18n.t('bg_pass')));
          body.appendChild(UI.el('div', { class: 'bg-bidrow' }, rowKids));
        }
        return UI.el('div', { class: 'bg-sheet' }, [body]);
      }

      /* STAGE 2: display name of a project type. */
      function projLabel(type) {
        return I18n.t({ sira: 'bg_proj_sira', fifty: 'bg_proj_50', hundred: 'bg_proj_100',
                        fourhundred: 'bg_proj_400', baloot: 'bg_proj_baloot' }[type] || 'bg_project');
      }

      /* STAGE 2 bottom sheet for the دبل chain — same look as bidding.
         Only the NEXT step of the chain is offered: دبل → تربل → كورة → قهوة. */
      function doubleSheet(p) {
        var cur = (typeof p.mult === 'number') ? p.mult : 1;
        var nextKey = { 1: 'bg_double', 2: 'bg_triple', 3: 'bg_kawra', 4: 'bg_qahwa' }[cur] || 'bg_double';
        var body = UI.el('div', { class: 'bg-sheet-body' });
        body.appendChild(UI.el('div', { class: 'bg-sheet-title' }, I18n.t('bg_double_q')));
        body.appendChild(UI.el('div', { class: 'bg-bidrow' }, [
          UI.el('button', { class: 'bg-bid dbl', onclick: function () { doDouble('raise'); } }, [
            UI.el('span', null, I18n.t(nextKey)),
            UI.el('b', null, cur >= 4 ? '☕' : '×' + (cur + 1))
          ]),
          UI.el('button', { class: 'bg-bid pass', onclick: function () { doDouble('pass'); } }, I18n.t('bg_pass'))
        ]));
        return UI.el('div', { class: 'bg-sheet' }, [body]);
      }

      /* STAGE 2: trick-2 showdown overlay — as soon as the first card of
         trick 2 hits the felt, everyone sees the declared projects, which
         ones survived the comparison and which were cancelled. Pure math on
         public data → no extra Firestore writes needed. Tap (or 6.5s) to
         dismiss; shown once per round per client. */
      function projectOverlay(p) {
        if (p.phase !== 'playing') return null;
        var tw = p.tricksWon || {};
        var collected = ((tw.t0 || []).length) + ((tw.t1 || []).length);
        if (collected !== 4 || !(p.table || []).length) return null; // exactly: trick 2, card down
        if (st.projShownRound === p.roundNo) return null;            // already dismissed
        var pr = resolveProjects(p.projects, p.mode);
        if (!pr.items.length) return null;
        function dismiss() {
          st.projShownRound = p.roundNo;
          paint();
        }
        if (st.projTimerRound !== p.roundNo) {
          st.projTimerRound = p.roundNo;
          clearTimeout(st.projTimer);
          st.projTimer = setTimeout(function () {
            if (st.projShownRound !== p.roundNo) dismiss();
          }, 6500);
        }
        var rows = pr.items.map(function (it) {
          var mini = UI.el('div', { class: 'bg-projcards' });
          (it.cards || []).forEach(function (c) { mini.appendChild(cardEl(c, 'mini')); });
          return UI.el('div', { class: 'bg-projrow' + (it.cancelled ? ' cancelled' : '') }, [
            UI.el('div', { class: 'bg-projwho' }, [
              UI.el('b', null, seatName(it.seat)),
              UI.el('span', null, projLabel(it.type) + ' · ' +
                (it.cancelled ? I18n.t('bg_proj_cancelled') : '+' + projectValue(it.type, p.mode)))
            ]),
            mini
          ]);
        });
        return UI.el('div', { class: 'bg-modalbd bg-projbd', onclick: dismiss }, [
          UI.el('div', { class: 'bg-modal bg-projmodal' }, [
            UI.el('h3', null, I18n.t('bg_projects'))
          ].concat(rows).concat([
            UI.el('p', { class: 'bg-projhint' }, I18n.t('bg_tap_close'))
          ]))
        ]);
      }

      /* Round summary: أبناط → نقاط, خسران/كبوت callouts, running totals.
         STAGE 2 adds: a المشاريع row, one line per declared project, and a
         دبل/قهوة callout when the round was multiplied. */
      function roundEndModal(p) {
        var rs = p.roundScores || { bnt: { t0: 0, t1: 0 }, pts: { t0: 0, t1: 0 } };
        var usK = myTeamKey(), thK = themTeamKey();
        var buyerName = (rs.buyer != null) ? seatName(rs.buyer) : '';
        var modeTxt = rs.mode === 'sun' ? ('☀️ ' + I18n.t('bg_sun'))
                    : rs.mode === 'ashkal' ? I18n.t('bg_ashkal')
                    : (I18n.t('bg_hokum') + ' ' + (rs.trump ? SUIT_CHAR[rs.trump] : ''));

        var pj = rs.projPts || { t0: 0, t1: 0 };
        var bl = rs.balootPts || { t0: 0, t1: 0 };
        var hasProj = ((pj.t0 || 0) + (pj.t1 || 0) + (bl.t0 || 0) + (bl.t1 || 0)) > 0;

        var rowKids = [
          resRow('', I18n.t('bg_us'), I18n.t('bg_them'), true),
          resRow(I18n.t('bg_abnat'), String(rs.bnt[usK] || 0), String(rs.bnt[thK] || 0))
        ];
        if (hasProj) {
          rowKids.push(resRow(I18n.t('bg_projects'),
            String((pj[usK] || 0) + (bl[usK] || 0)),
            String((pj[thK] || 0) + (bl[thK] || 0))));
        }
        rowKids.push(resRow(I18n.t('bg_points'), String(rs.pts[usK] || 0), String(rs.pts[thK] || 0)));
        rowKids.push(resRow(I18n.t('bg_totals'), String((p.totals && p.totals[usK]) || 0), String((p.totals && p.totals[thK]) || 0)));
        var rows = UI.el('div', { class: 'bg-restable' }, rowKids);

        // one small line per declared project (cancelled ones struck out)
        var projLines = null;
        if (rs.projItems && rs.projItems.length) {
          projLines = UI.el('div', { class: 'bg-projlines' }, rs.projItems.map(function (it) {
            return UI.el('div', { class: it.cancelled ? 'cancelled' : '' },
              seatName(it.seat) + ' · ' + projLabel(it.type) + ' ' +
              (it.cancelled ? '(' + I18n.t('bg_proj_cancelled') + ')' : '+' + projectValue(it.type, rs.mode)));
          }));
        }

        var callouts = [];
        if (rs.coffee) callouts.push(UI.el('div', { class: 'bg-callout red' }, '☕ ' + I18n.t('bg_coffee')));
        else if (rs.mult >= 2) callouts.push(UI.el('div', { class: 'bg-callout red' },
          I18n.t({ 2: 'bg_double', 3: 'bg_triple', 4: 'bg_kawra' }[rs.mult] || 'bg_double') + ' ×' + rs.mult));
        if (rs.kaboot) callouts.push(UI.el('div', { class: 'bg-callout gold' }, I18n.t('bg_kaboot')));
        if (rs.khosran) callouts.push(UI.el('div', { class: 'bg-callout red' }, I18n.t('bg_khosran')));

        return UI.el('div', { class: 'bg-modalbd' }, [
          UI.el('div', { class: 'bg-modal' }, [
            UI.el('h3', null, I18n.t('bg_round_end')),
            UI.el('p', { class: 'bg-resmeta' }, modeTxt + ' · ' + I18n.t('bg_buyer') + ': ' + buyerName),
            rows,
            projLines
          ].concat(callouts).concat([
            isHost()
              ? UI.el('button', { class: 'btn btn-green btn-block bg-nextbtn', onclick: nextRound },
                  I18n.t('bg_next_round') + ' · 6')          // STAGE 3: 6s auto-advance
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
