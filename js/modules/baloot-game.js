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

  /* ======================================================================
     STAGE 5 · CARD ARTWORK — cardSVG(rank, suit): one programmatic SVG
     deck (32 faces + a back), cached as data-URIs once per session.
       · number cards (7–10): REAL playing-card pip layouts, each pip a
         radial-shaded suit glyph; corner indices top-left + bottom-right.
       · courts J/Q/K: stylized GEOMETRIC Arabic-royal motifs (our own
         identity, not fake French courts) — J «الولد» crossed swords +
         turban, Q «البنت» ornate headdress + necklace, K «الشايب» crown +
         falcon — symmetric, gold/maroon/navy, mirrored top/bottom.
       · A: one large suit symbol inside a radiating gold filigree ring.
       · back: navy field, sadu zig-zag border bands, gold dallah drawn
         in SVG inside a gold ring (no external images → data-URI safe).
     Pure string builders (no DOM) so a node test can validate the XML.
     ====================================================================== */
  var ART = { gold: '#c9a453', goldD: '#8a6a25', maroon: '#722F37',
              navy: '#1A2744', cream: '#f3e6cf' };
  var SUIT_INK = {
    S: ['#3a4254', '#151a26'], C: ['#3a4254', '#151a26'],
    H: ['#cf4738', '#8c1f18'], D: ['#cf4738', '#8c1f18']
  };
  // suit glyphs drawn in a ±30 box centred on 0,0 (fill inherited from #sG)
  var SUIT_PATH = {
    H: '<path d="M0 27 C-26 6 -32 -12 -19 -23 C-9 -31 0 -23 0 -14 C0 -23 9 -31 19 -23 C32 -12 26 6 0 27 Z"/>',
    D: '<path d="M0 -29 C7 -18 13 -9 21 0 C13 9 7 18 0 29 C-7 18 -13 9 -21 0 C-13 -9 -7 -18 0 -29 Z"/>',
    S: '<path d="M0 -28 C22 -6 30 3 18 14 C10 20 3 16 1 11 C2 20 5 24 9 28 L-9 28 C-5 24 -2 20 -1 11 C-3 16 -10 20 -18 14 C-30 3 -22 -6 0 -28 Z"/>',
    C: '<circle cx="0" cy="-15" r="11.5"/><circle cx="-11" cy="4" r="11.5"/><circle cx="11" cy="4" r="11.5"/><path d="M0 0 C1 12 4 19 9 25 L-9 25 C-4 19 -1 12 0 0 Z"/>'
  };
  // authentic pip layouts on the 200×290 face; pips below centre flip 180°
  var PIP_XY = {
    '7': [[64, 82], [64, 145], [64, 208], [136, 82], [136, 145], [136, 208], [100, 113]],
    '8': [[64, 82], [64, 145], [64, 208], [136, 82], [136, 145], [136, 208], [100, 113], [100, 177]],
    '9': [[64, 78], [64, 123], [64, 167], [64, 212], [136, 78], [136, 123], [136, 167], [136, 212], [100, 145]],
    '10': [[64, 78], [64, 123], [64, 167], [64, 212], [136, 78], [136, 123], [136, 167], [136, 212], [100, 100], [100, 190]]
  };

  /** The geometric court figure for the TOP half (mirrored by cardSVG). */
  function courtFigure(rank) {
    var g = ART.gold, gd = ART.goldD, mr = ART.maroon, nv = ART.navy, cr = ART.cream;
    var f = '', i;
    if (rank === 'J') {                    // «الولد»: crossed swords + turban
      var sword = function (ang) {
        return '<g transform="translate(100 106) rotate(' + ang + ')">' +
          '<path d="M-3 -54 L0 -61 L3 -54 L3 9 L-3 9 Z" fill="' + nv + '" stroke="' + gd + '" stroke-width="0.6"/>' +
          '<rect x="-13" y="9" width="26" height="6" rx="3" fill="' + g + '"/>' +
          '<rect x="-3.5" y="15" width="7" height="15" rx="2.5" fill="' + mr + '"/>' +
          '<circle cx="0" cy="34" r="4" fill="' + g + '"/></g>';
      };
      f = sword(-32) + sword(32) +
        '<ellipse cx="100" cy="66" rx="24" ry="15" fill="' + mr + '" stroke="' + gd + '" stroke-width="0.8"/>' +
        '<path d="M76 66 Q100 79 124 66" stroke="' + g + '" stroke-width="3" fill="none"/>' +
        '<path d="M79 58 Q100 70 121 58" stroke="' + g + '" stroke-width="2" fill="none" opacity="0.85"/>' +
        '<circle cx="100" cy="55" r="3.4" fill="' + g + '"/>';
    } else if (rank === 'Q') {             // «البنت»: headdress + necklace
      var coins = '';
      for (i = 0; i < 7; i++) {
        coins += '<circle cx="' + (Math.round((74 + i * 52 / 6) * 10) / 10) + '" cy="94" r="2.6" fill="' + g + '"/>';
      }
      var gems = '';
      [[84, 130.5], [100, 134.5], [116, 130.5]].forEach(function (pt) {
        gems += '<rect x="-4.4" y="-4.4" width="8.8" height="8.8" fill="' + mr + '" stroke="' + g + '" stroke-width="1" transform="translate(' + pt[0] + ' ' + pt[1] + ') rotate(45)"/>';
      });
      f = '<path d="M100 48 L130 90 L70 90 Z" fill="' + mr + '" stroke="' + gd + '" stroke-width="0.8"/>' +
        '<path d="M78 84 L122 84" stroke="' + g + '" stroke-width="2.4"/>' +
        '<circle cx="100" cy="46" r="4" fill="' + g + '"/>' + coins +
        '<circle cx="100" cy="104" r="11" fill="' + cr + '" stroke="' + gd + '" stroke-width="0.8"/>' +
        '<path d="M74 121 Q100 141 126 121" fill="none" stroke="' + g + '" stroke-width="2.2"/>' + gems;
    } else {                               // «الشايب»: crown + falcon
      var dots = '';
      for (i = 0; i < 5; i++) dots += '<circle cx="' + (74 + i * 13) + '" cy="82.5" r="2.2" fill="' + cr + '"/>';
      f = '<circle cx="71" cy="49" r="3" fill="' + g + '"/><circle cx="100" cy="43" r="3.4" fill="' + g + '"/><circle cx="129" cy="49" r="3" fill="' + g + '"/>' +
        '<path d="M64 78 L71 52 L86 70 L100 46 L114 70 L129 52 L136 78 Z" fill="' + g + '" stroke="' + gd + '" stroke-width="1"/>' +
        '<rect x="64" y="78" width="72" height="9" rx="3" fill="' + mr + '" stroke="' + gd + '" stroke-width="0.7"/>' + dots +
        '<path d="M100 96 L58 112 L92 122 Z" fill="' + nv + '" stroke="' + gd + '" stroke-width="0.6"/>' +
        '<path d="M100 96 L142 112 L108 122 Z" fill="' + nv + '" stroke="' + gd + '" stroke-width="0.6"/>' +
        '<path d="M100 93 L110 114 L100 138 L90 114 Z" fill="' + nv + '" stroke="' + g + '" stroke-width="0.8"/>' +
        '<circle cx="100" cy="96" r="7" fill="' + nv + '"/>' +
        '<circle cx="97" cy="94" r="1.4" fill="' + g + '"/><circle cx="103" cy="94" r="1.4" fill="' + g + '"/>' +
        '<path d="M100 101 L103.5 106 L96.5 106 Z" fill="' + g + '"/>';
    }
    return f;
  }

  /** One complete card face as an SVG string. */
  function cardSVG(rank, suit) {
    var ink = SUIT_INK[suit];
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 290">';
    s += '<defs>' +
      '<linearGradient id="bgG" x1="0" y1="0" x2="0.55" y2="1">' +
        '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f5edda"/></linearGradient>' +
      '<radialGradient id="sG" cx="0.36" cy="0.3" r="1">' +
        '<stop offset="0" stop-color="' + ink[0] + '"/><stop offset="1" stop-color="' + ink[1] + '"/></radialGradient>' +
      '<g id="p" fill="url(#sG)">' + SUIT_PATH[suit] + '</g>' +
      '<g id="ix"><text x="25" y="43" text-anchor="middle" font-family="Georgia,serif" font-size="' +
        (rank === '10' ? 29 : 34) + '" font-weight="700" fill="url(#sG)">' + rank + '</text>' +
        '<use href="#p" transform="translate(25 63) scale(0.32)"/></g>' +
      '</defs>';
    // warm white body + thin double gold inner frame
    s += '<rect x="1" y="1" width="198" height="288" rx="17" fill="url(#bgG)" stroke="#d9cdb2" stroke-width="1.5"/>' +
         '<rect x="8" y="8" width="184" height="274" rx="12" fill="none" stroke="' + ART.gold + '" stroke-width="1.6" opacity="0.9"/>' +
         '<rect x="12" y="12" width="176" height="266" rx="9" fill="none" stroke="' + ART.gold + '" stroke-width="0.6" opacity="0.5"/>' +
         '<use href="#ix"/><use href="#ix" transform="rotate(180 100 145)"/>';
    if (PIP_XY[rank]) {
      PIP_XY[rank].forEach(function (xy) {
        s += '<use href="#p" transform="translate(' + xy[0] + ' ' + xy[1] + ') scale(0.52)' +
             (xy[1] > 146 ? ' rotate(180)' : '') + '"/>';
      });
    } else if (rank === 'A') {
      s += '<g stroke="' + ART.gold + '" fill="none">' +
           '<circle cx="100" cy="145" r="64" stroke-width="1.4" stroke-dasharray="3 5"/>' +
           '<circle cx="100" cy="145" r="72" stroke-width="0.8" opacity="0.55"/></g>';
      for (var i = 0; i < 12; i++) {
        s += '<path d="M100 66 C104 72 104 78 100 83 C96 78 96 72 100 66 Z" fill="' + ART.gold +
             '" opacity="0.9" transform="rotate(' + (i * 30) + ' 100 145)"/>';
      }
      s += '<use href="#p" transform="translate(100 145) scale(1.7)"/>';
    } else {
      s += '<rect x="32" y="38" width="136" height="214" rx="10" fill="#fbf5e6" stroke="' + ART.gold + '" stroke-width="1.4"/>' +
           '<line x1="38" y1="145" x2="162" y2="145" stroke="' + ART.gold + '" stroke-width="0.8" opacity="0.6"/>' +
           '<g id="ct">' + courtFigure(rank) +
             '<use href="#p" transform="translate(51 59) scale(0.28)"/></g>' +
           '<use href="#ct" transform="rotate(180 100 145)"/>';
    }
    return s + '</svg>';
  }

  /** The card back: navy + sadu zig-zag bands + gold dallah in a ring. */
  function cardBackSVG() {
    var g = '#C2A050', x, y;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 290">' +
      '<defs><linearGradient id="nB" x1="0" y1="0" x2="0.6" y2="1">' +
      '<stop offset="0" stop-color="#22304f"/><stop offset="1" stop-color="#111a2e"/></linearGradient></defs>' +
      '<rect x="1" y="1" width="198" height="288" rx="17" fill="url(#nB)" stroke="#e8dfc8" stroke-width="2"/>' +
      '<rect x="9" y="9" width="182" height="272" rx="12" fill="none" stroke="' + g + '" stroke-width="1.2" opacity="0.9"/>';
    for (x = 16; x < 184; x += 14) {                       // sadu bands: top + bottom
      s += '<path d="M' + x + ' 30 L' + (x + 7) + ' 17 L' + (x + 14) + ' 30 Z" fill="' + g + '" opacity="0.9"/>' +
           '<path d="M' + x + ' 260 L' + (x + 7) + ' 273 L' + (x + 14) + ' 260 Z" fill="' + g + '" opacity="0.9"/>';
    }
    for (y = 44; y < 246; y += 14) {                       // sadu bands: sides
      s += '<path d="M30 ' + y + ' L17 ' + (y + 7) + ' L30 ' + (y + 14) + ' Z" fill="' + g + '" opacity="0.9"/>' +
           '<path d="M170 ' + y + ' L183 ' + (y + 7) + ' L170 ' + (y + 14) + ' Z" fill="' + g + '" opacity="0.9"/>';
    }
    s += '<line x1="16" y1="34" x2="184" y2="34" stroke="' + g + '" stroke-width="1" opacity="0.5"/>' +
         '<line x1="16" y1="256" x2="184" y2="256" stroke="' + g + '" stroke-width="1" opacity="0.5"/>' +
         '<circle cx="100" cy="145" r="52" fill="none" stroke="' + g + '" stroke-width="2"/>' +
         '<circle cx="100" cy="145" r="57" fill="none" stroke="' + g + '" stroke-width="0.8" opacity="0.6"/>' +
         // dallah silhouette: finial, lid, neck, body, spout, handle, base
         '<g fill="' + g + '" stroke="#8a6a25" stroke-width="0.8">' +
         '<circle cx="100" cy="103" r="4"/>' +
         '<path d="M91 121 Q100 107 109 121 Z"/>' +
         '<path d="M93 121 L107 121 L105 133 L95 133 Z"/>' +
         '<path d="M95 133 C80 138 76 152 80 165 C84 178 91 184 100 184 C109 184 116 178 120 165 C124 152 120 138 105 133 Z"/>' +
         '<path d="M83 142 C72 134 67 124 72 119 C76 116 81 126 90 137 Z"/>' +
         '<path d="M118 140 C132 144 132 164 120 168 L117 162 C125 159 125 148 115 146 Z"/>' +
         '<path d="M88 184 L112 184 L115 190 L85 190 Z"/></g>';
    return s + '</svg>';
  }

  var _artCache = {};
  function svgURI(svg) {
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")';
  }
  function cardFaceURI(card) {
    if (!_artCache[card]) _artCache[card] = svgURI(cardSVG(rankOf(card), suitOf(card)));
    return _artCache[card];
  }
  function cardBackURI() {
    if (!_artCache.__back) _artCache.__back = svgURI(cardBackSVG());
    return _artCache.__back;
  }

  /* ======================================================================
     STAGE 5 · SFX — tiny synthesized WebAudio effects, NO audio files.
     The AudioContext is created/resumed only after a user gesture (a
     capture-phase pointerdown). The mute toggle in the game HUD persists
     in localStorage 'aldewaniah.balootGame.sound'.
     ====================================================================== */
  var Sfx = (function () {
    var KEY = 'aldewaniah.balootGame.sound';
    var on = true, ctx = null, noiseBuf = null;
    try { if (typeof localStorage !== 'undefined') on = localStorage.getItem(KEY) !== '0'; } catch (e) {}
    function ensure() {
      if (!ctx) {
        try {
          var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
          if (AC) ctx = new AC();
        } catch (e) {}
      }
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    }
    try { // unlock on the first (and every) tap — iOS re-suspends on background
      if (typeof document !== 'undefined') {
        document.addEventListener('pointerdown', ensure, { capture: true, passive: true });
      }
    } catch (e) {}
    function env(gn, t0, a, peak, d) {
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(peak, t0 + a);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    }
    function tone(o) {
      if (!on || !ctx || ctx.state !== 'running') return;
      try {
        var t0 = ctx.currentTime + (o.at || 0), d = o.d || 0.2;
        var os = ctx.createOscillator(), gn = ctx.createGain();
        os.type = o.type || 'sine';
        os.frequency.setValueAtTime(o.f, t0);
        if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
        env(gn, t0, o.a || 0.008, o.v || 0.12, d);
        os.connect(gn); gn.connect(ctx.destination);
        os.start(t0); os.stop(t0 + d + 0.05);
      } catch (e) {}
    }
    function noise(o) {
      if (!on || !ctx || ctx.state !== 'running') return;
      try {
        if (!noiseBuf) {
          noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
          var data = noiseBuf.getChannelData(0);
          for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        var t0 = ctx.currentTime + (o.at || 0), d = o.d || 0.15;
        var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        var fl = ctx.createBiquadFilter(); fl.type = o.ft || 'bandpass';
        fl.frequency.setValueAtTime(o.f || 1800, t0);
        if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
        fl.Q.value = o.q || 1;
        var gn = ctx.createGain(); env(gn, t0, o.a || 0.01, o.v || 0.1, d);
        src.connect(fl); fl.connect(gn); gn.connect(ctx.destination);
        src.start(t0); src.stop(t0 + d + 0.05);
      } catch (e) {}
    }
    return {
      enabled: function () { return on; },
      toggle: function () {
        on = !on;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
        if (on) ensure();
        return on;
      },
      slide: function () { noise({ f: 2400, f2: 700, d: 0.12, v: 0.08 }); },                    // card swish
      place: function () { tone({ f: 190, f2: 120, d: 0.09, v: 0.14 }); noise({ f: 900, d: 0.04, v: 0.05, ft: 'lowpass' }); }, // soft thock
      tick: function (at) { noise({ f: 3200, d: 0.03, v: 0.04, at: at || 0, ft: 'highpass' }); }, // deal tick
      sweep: function () { noise({ f: 500, f2: 2600, d: 0.32, v: 0.09, q: 0.8 }); },            // trick whoosh
      chime: function () { tone({ f: 660, d: 0.18, v: 0.07, type: 'triangle' }); tone({ f: 880, d: 0.26, v: 0.07, at: 0.09, type: 'triangle' }); }, // your turn
      drum: function () { tone({ f: 150, f2: 55, d: 0.28, v: 0.3 }); noise({ f: 300, d: 0.08, v: 0.12, ft: 'lowpass' }); },   // دبل hit
      win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone({ f: f, d: 0.3, v: 0.1, at: i * 0.12, type: 'triangle' }); }); },
      lose: function () { tone({ f: 220, f2: 130, d: 0.5, v: 0.1, type: 'sawtooth' }); }
    };
  })();

  /* ======================================================================
     STAGE 5 · MOTION — a tiny FLIP layer (transform/opacity only).
     Callers batch their getBoundingClientRect READS first, then hand the
     rects to flipFly which only WRITES (Web Animations API).
     ====================================================================== */
  var REDUCED = false;
  try {
    REDUCED = !!(typeof window !== 'undefined' && window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {}

  /** FLIP: element sits at its FINAL spot; animate FROM `from` to rest,
      with a small arc + overshoot settle. opts.to = precomputed rect. */
  function flipFly(el, from, opts) {
    opts = opts || {};
    if (REDUCED || !el || !el.animate || !from) return;
    var to = opts.to || el.getBoundingClientRect();
    if (!to.width) return;
    var dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    var dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    var sc = Math.max(0.3, Math.min(1.8, from.width / to.width));
    el.animate([
      { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sc.toFixed(3) +
        ') rotate(' + (opts.rot || 0) + 'deg)', opacity: 0.55 },
      { transform: 'translate(' + (dx * -0.045).toFixed(1) + 'px,' + (dy * -0.045 - (opts.arc || 10)).toFixed(1) +
        'px) scale(1.05) rotate(0deg)', opacity: 1, offset: 0.72 },
      { transform: 'none', opacity: 1 }
    ], { duration: opts.dur || 400, delay: opts.delay || 0,
         easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'backwards' });
  }

  /** Count a score number up/down smoothly (round-end «numbers count up»). */
  function countUp(el, from, to) {
    if (REDUCED || typeof requestAnimationFrame !== 'function' || from === to) {
      el.textContent = String(to); return;
    }
    var t0 = null, dur = 650;
    function step(t) {
      if (t0 == null) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
      else el.textContent = String(to);
    }
    requestAnimationFrame(step);
  }

  // exposed for the /tmp node smoke test (harmless in the browser)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { newDeck: newDeck, shuffle: shuffle, legalMoves: legalMoves,
      winnerOf: winnerOf, scoreRound: scoreRound, findProjects: findProjects,
      botBidChoice: botBidChoice, botPlayChoice: botPlayChoice, suitOf: suitOf,
      cardSVG: cardSVG, cardBackSVG: cardBackSVG };
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
        bg_double: 'دبل', bg_triple: 'ثري', bg_kawra: 'أربع', bg_qahwa: 'قهوة',
        bg_double_q: 'الدبل — ترفع الرهان؟',
        bg_coffee: 'قهوة! هذه الجولة تحسم اللعبة كاملة',
        // STAGE 3
        bg_ask1: 'أول؟', bg_ask2: 'ثاني؟', bg_ask_dbl: 'الدبل؟',
        bg_bought: 'شريت!', bg_timeout_pass: 'انتهى الوقت ⏱',
        bg_bot_seat: 'روبوت',
        // STAGE 4 — شكل «كملنا»
        bg_session: 'جلسة', bg_qaydha: 'قيدها', bg_emotes: 'تعابير',
        bg_close: 'إغلاق', bg_hist_empty: 'ما انقيدت جولات بعد',
        bg_no_proj_yet: 'ما فيه مشاريع معلنة',
        bg_declared_proj: 'أعلن مشروع',
        bg_hidden_until2: 'تنكشف المشاريع مع بداية اللعبة الثانية',
        bg_round_col: 'الجولة',
        // STAGE 5 — الإخراج الكامل
        bg_sound: 'الصوت'
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
        bg_double: 'Double', bg_triple: 'Three (×3)', bg_kawra: 'Four (×4)', bg_qahwa: 'Qahwa',
        bg_double_q: 'Doubling — raise the stakes?',
        bg_coffee: 'Qahwa! This deal decides the whole game',
        // STAGE 3
        bg_ask1: 'Awwal?', bg_ask2: 'Thani?', bg_ask_dbl: 'Double?',
        bg_bought: 'Bought!', bg_timeout_pass: 'Time is up ⏱',
        bg_bot_seat: 'Bot',
        // STAGE 4 — Kamelna look & feel
        bg_session: 'Session', bg_qaydha: 'Score it', bg_emotes: 'Emotes',
        bg_close: 'Close', bg_hist_empty: 'No rounds recorded yet',
        bg_no_proj_yet: 'No projects declared',
        bg_declared_proj: 'declared a project',
        bg_hidden_until2: 'Projects are revealed on trick 2',
        bg_round_col: 'Round',
        // STAGE 5 — full-screen game feel
        bg_sound: 'Sound'
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
        autoNextKey: '', autoNextTimer: null, autoNextInt: null, // roundEnd auto-advance
        // STAGE 4: Kamelna look & feel
        modal: null,                          // 'scores' | 'projects' | 'emotes'
        saySig: '', sayShow: null, sayTimer: null, // تعابير speech bubbles
        lastEmoteAt: 0, ringInt: null,        // emote throttle + timer countdown
        // STAGE 5: full-screen stage + motion + sound bookkeeping
        ov: null, ovBody: null, hashClose: null, // the fixed game overlay
        playFrom: null,                       // FLIP origin rect of my tapped card
        pendingFly: null,                     // table cards awaiting a FLIP-in
        prevHandLen: 0, handRound: -1,        // deal-in reveal tracking
        shownUs: null, shownThem: null,       // HUD score count-up
        sfxMult: null, sfxPhase: null         // sound-cue edge detection
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
          clearTimeout(st.sayTimer); clearInterval(st.ringInt); // STAGE 4
          if (st.dealOv) { try { st.dealOv.remove(); } catch (e) {} st.dealOv = null; }
          // STAGE 5: tear down the full-screen stage overlay + scroll lock
          if (st.hashClose) {
            try { window.removeEventListener('hashchange', st.hashClose); } catch (e) {}
            st.hashClose = null;
          }
          if (st.ov) { try { st.ov.remove(); } catch (e) {} st.ov = null; st.ovBody = null; }
          try { document.body.classList.remove('bg-lock'); } catch (e) {}
        }
      };

      /* ---------------- tiny helpers ---------------- */
      /** STAGE 5: where the game paints — the full-screen stage when a
          table is open, the section page otherwise. */
      function stage() { return st.ovBody || root; }

      /** STAGE 5: mount the full-screen game overlay (position:fixed over
          the whole app, header and bottom nav included — like opening a
          real game app). The app underneath stays mounted; navigating
          away (hashchange) simply removes the overlay + subscriptions,
          and localStorage lets the player rejoin the table later. */
      function openStage() {
        if (st.ov) return;
        var ov = UI.el('div', { class: 'bg-stage' });
        var body = UI.el('div', { class: 'bg-stagebody' });
        ov.appendChild(body);
        document.body.appendChild(ov);
        document.body.classList.add('bg-lock'); // body scroll locked
        st.ov = ov; st.ovBody = body;
        st.hashClose = function () { session.close(); };
        window.addEventListener('hashchange', st.hashClose);
      }

      function toast(msg) {
        try {
          var t = UI.el('div', { class: 'bg-toast' }, msg);
          (st.ov || root).appendChild(t);
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

      /* ================= card DOM (STAGE 5: programmatic SVG deck) =========
         One div per card; the whole face is a cached data-URI SVG from
         cardSVG() — corner indices, true pip layouts, geometric Arabic-
         royal courts. isRed/SUIT_CHAR stay for text labels elsewhere. */
      function cardEl(card, cls) {
        var el = UI.el('div', { class: 'bg-pcard' + (cls ? ' ' + cls : '') });
        el.style.backgroundImage = cardFaceURI(card);
        return el;
      }

      /* ================= STAGE 4 · تعابير (emotes) =================
         A FIXED phrase list only — no free text ever reaches Firestore
         or the DOM (rendered as text nodes, validated on read AND write).
         The canonical list is Arabic (Kamelna vocabulary, like بس/حكم),
         shared by every client so last-write-wins validation matches. */
      var EMOTES = ['ابشر بابعوض', 'الله يعينك', 'عطنا ونشوف', 'ياساتر!',
                    'ما شاء الله عليك', 'خذها وانقلع', 'صبر صبر', 'وين المشاريع؟'];

      async function sendEmote(text) {
        var seat = mySeat();
        if (seat < 0 || EMOTES.indexOf(text) < 0) return;   // seated members, fixed list only
        var now = Date.now();
        if (now - (st.lastEmoteAt || 0) < 2500) return;     // gentle local throttle
        st.lastEmoteAt = now;
        try {
          // plain last-write-wins field — no transaction needed
          await st.ref.update({ say: { seat: seat, text: text, ts: now }, updatedAt: ts() });
        } catch (e) {}
      }

      /** Show a 3s speech bubble over the speaker's seat whenever a NEW
          say lands. Guards: fixed-list check, stale-on-rejoin check. */
      function maybeSay() {
        var p = st.pub;
        if (!p || !p.say || p.say.seat == null) return;     // old tables: no field
        var sig = p.say.seat + '|' + p.say.text + '|' + (p.say.ts || 0);
        if (st.saySig === sig) return;
        st.saySig = sig;
        if (Math.abs(Date.now() - (p.say.ts || 0)) > 15000) return; // stale echo on rejoin
        if (EMOTES.indexOf(p.say.text) < 0) return;         // render fixed phrases ONLY
        st.sayShow = { seat: p.say.seat, text: p.say.text, until: Date.now() + 3000 };
        clearTimeout(st.sayTimer);
        st.sayTimer = setTimeout(function () { st.sayShow = null; paint(); }, 3050);
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
        // STAGE 5: the whole table (lobby AND game) lives in the
        // full-screen stage; the section page keeps only a resume card.
        openStage();
        stage().innerHTML = '';
        stage().appendChild(UI.el('p', { class: 'bg-stageload' }, I18n.t('bg_loading')));
        root.innerHTML = '';
        root.appendChild(UI.el('div', { class: 'card' }, [
          UI.el('button', { class: 'btn btn-green btn-block', onclick: function () { openTable(code); } },
            I18n.t('bg_resume') + ' · ' + code)
        ]));

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
            maybeSay();        // STAGE 4: تعابير speech bubbles
            soundCues();       // STAGE 5: دبل drum / win / lose cues
            paint();
            dealAnimations();  // STAGE 3: needs the freshly painted felt
          } catch (e) { /* defensive: never let a paint error kill the stream */ }
        }, function () { toast(I18n.t('bg_err')); });
      }

      /** STAGE 5: sound cues driven by public-state EDGES (never repeats
          on repaints; skips the first snapshot after a rejoin). */
      function soundCues() {
        var p = st.pub; if (!p) return;
        var m = (p.mult === 'coffee') ? 9 : (p.mult || 1);
        if (st.sfxMult != null && m > st.sfxMult) Sfx.drum();   // دبل/ثري/أربع/قهوة
        st.sfxMult = m;
        if (p.phase !== st.sfxPhase) {
          var prev = st.sfxPhase; st.sfxPhase = p.phase;
          if (p.phase === 'gameEnd' && prev && prev !== 'gameEnd') {
            var t0 = (p.totals && p.totals.t0) || 0, t1 = (p.totals && p.totals.t1) || 0;
            var winKey = t0 > t1 ? 't0' : 't1';
            if (mySeat() >= 0 && winKey !== myTeamKey()) Sfx.lose();
            else Sfx.win();
          }
        }
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
            try { sweepAnim(win.seat); } catch (e) {}
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
              // STAGE 4: append this deal's line to the «قيدها» score sheet.
              // Old in-flight tables simply start their history here.
              var hist = (p.history || []).slice();
              hist.push({
                m: p.mode, tr: p.trump || null, b: p.buyer,
                mult: (p.mult === 'coffee') ? 'coffee' : (p.mult || 1),
                bnt: rs.bnt,
                pj: { t0: (rs.projPts.t0 || 0) + (rs.balootPts.t0 || 0),
                      t1: (rs.projPts.t1 || 0) + (rs.balootPts.t1 || 0) },
                pts: rs.pts, kb: rs.kaboot || null, kh: !!rs.khosran
              });
              upd.history = hist.slice(-60);   // plenty for a 152 game, tiny doc
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
          // STAGE 5: gentle chime the moment a turn becomes MINE
          if (act >= 0 && controlsSeat(act) && (p.table || []).length < 4) Sfx.chime();
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
                var b = stage().querySelector('.bg-nextbtn');
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
          var felt = stage().querySelector('.bg-felt'); if (!felt) return;
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
          // STAGE 5: transform-only flight with an arc + spin + stagger
          // (WAAPI; falls back to an instant layout for reduced motion)
          var x0 = rect.left + rect.width * from[0] - 20;
          var y0 = rect.top + rect.height * from[1] - 29;
          plan.forEach(function (s, i) {
            var c = UI.el('div', { class: 'bg-dealcard' });
            c.style.backgroundImage = cardBackURI();
            c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
            ov.appendChild(c);
            var to = POS[relPos(s)];
            var dx = rect.width * (to[0] - from[0]);
            var dy = rect.height * (to[1] - from[1]);
            var rot = Math.random() * 50 - 25;
            if (c.animate && !REDUCED) {
              c.animate([
                { transform: 'translate(0px,0px) rotate(0deg)', opacity: 0.95 },
                { transform: 'translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.5 - 34).toFixed(1) +
                  'px) rotate(' + (rot * 0.6).toFixed(1) + 'deg)', offset: 0.55, opacity: 1 },
                { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)', opacity: 0.9 }
              ], { duration: 380, delay: i * 55, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
              Sfx.tick(i * 0.055);
            } else {
              c.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
            }
          });
          setTimeout(function () {
            try { ov.remove(); } catch (e) {}
            if (st.dealOv === ov) st.dealOv = null;
          }, plan.length * 55 + 700);
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
              totals: { t0: 0, t1: 0 }, phase: 'dealing', history: [], // STAGE 4: fresh قيدها
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
      /* STAGE 5: the table lobby also lives inside the full-screen stage
         (scrollable variant) — opening a table takes over the screen. */
      function paintLobby(p) {
        openStage();
        st.ov.className = 'bg-stage bg-stage-lobby';
        var m = stage();
        m.innerHTML = '';
        m.appendChild(UI.el('div', { class: 'bg-lobbybar' }, [
          UI.el('button', { class: 'bg-hudbtn', onclick: exitView }, I18n.t('bg_exit'))
        ]));
        m.appendChild(UI.el('div', { class: 'bg-codecard' }, [
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
        m.appendChild(felt);

        var filled = (p.seats || []).filter(Boolean).length;
        if (isHost()) {
          var tgl = UI.el('label', { class: 'bg-practice' }, [
            UI.el('input', { type: 'checkbox', onchange: togglePractice }),
            UI.el('span', null, I18n.t('bg_practice')),
            UI.el('small', null, I18n.t('bg_practice_hint'))
          ]);
          if (p.practice) tgl.querySelector('input').checked = true;
          m.appendChild(tgl);

          var canStart = p.practice ? mySeat() >= 0 : filled === 4;
          var startBtn = UI.el('button', { class: 'btn btn-green btn-block', onclick: startGame },
            canStart ? I18n.t('bg_start') : I18n.t('bg_need4'));
          if (!canStart) startBtn.setAttribute('disabled', 'true');
          m.appendChild(startBtn);
        } else {
          m.appendChild(UI.el('p', { class: 'muted', style: 'text-align:center' },
            mySeat() >= 0 ? I18n.t('bg_need4') : (filled === 4 ? I18n.t('bg_full') : I18n.t('bg_sit'))));
        }

        var row = UI.el('div', { class: 'bg-lobby-actions' }, [
          UI.el('button', { class: 'btn btn-ghost', onclick: leaveSeat }, I18n.t('bg_leave_seat')),
          isHost() ? UI.el('button', { class: 'btn btn-ghost bg-danger', onclick: function () {
            UI.confirm(I18n.t('bg_end_confirm'), endTable);
          } }, I18n.t('bg_end_table')) : null
        ]);
        m.appendChild(row);
      }

      /* ---------------- in-game paint ---------------- */
      /* STAGE 5: full-screen stage column — HUD on top, the sadu rug
         filling the middle edge-to-edge, bid bar docked right above the
         big hand fan, dark action bar at the bottom (Kamelna frame). */
      function paintGame(p) {
        clearInterval(st.ringInt);                     // STAGE 4: countdown rebuilt below
        openStage();
        st.ov.className = 'bg-stage';
        var m = stage();
        m.innerHTML = '';
        m.appendChild(topBar(p));

        var board = UI.el('div', { class: 'bg-board' });
        var felt = UI.el('div', { class: 'bg-felt' });
        for (var i = 0; i < 4; i++) felt.appendChild(seatChip(p, i));
        felt.appendChild(centerArea(p));
        board.appendChild(felt);
        m.appendChild(board);

        // STAGE 4: Kamelna-style INLINE bid/دبل bar docked above the hand
        // (replaces the old covering bottom-sheet — same logic & guards)
        if (p.phase === 'bidding' && p.turn >= 0 && controlsSeat(p.turn)) m.appendChild(bidSheet(p));
        if (p.phase === 'doubling' && p.doubleTurn != null && controlsSeat(p.doubleTurn)) {
          m.appendChild(doubleSheet(p));               // STAGE 2: دبل chain
        }

        m.appendChild(handArea(p));
        m.appendChild(actionBar(p));                   // STAGE 4: قيدها/المشاريع/تعابير

        var reveal = projectOverlay(p);                // STAGE 2: trick-2 showdown
        if (reveal) m.appendChild(reveal);
        if (st.modal === 'scores') m.appendChild(scoreSheetModal(p));       // STAGE 4
        else if (st.modal === 'projects') m.appendChild(projectsModal(p));  // STAGE 4
        else if (st.modal === 'emotes') m.appendChild(emoteModal(p));       // STAGE 4
        if (p.phase === 'roundEnd') m.appendChild(roundEndModal(p));
        if (p.phase === 'gameEnd') m.appendChild(gameEndModal(p));

        runTableAnims();                               // STAGE 5: FLIP the new trick cards
      }

      /* STAGE 5: the floating game HUD — dark chips like Kamelna's top
         row: خروج/إنهاء · 🔊 · mode/دبل chips · the لنا/لهم score unit
         with «جلسة <code>» under it (tap = copy). Scores count up. */
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

        var usB = UI.el('b', { class: 'us' }, String(us));
        var themB = UI.el('b', { class: 'them' }, String(them));
        if (st.shownUs != null && st.shownUs !== us) countUp(usB, st.shownUs, us);
        if (st.shownThem != null && st.shownThem !== them) countUp(themB, st.shownThem, them);
        st.shownUs = us; st.shownThem = them;

        return UI.el('div', { class: 'bg-hud' }, [
          UI.el('button', { class: 'bg-hudbtn', onclick: exitView }, I18n.t('bg_exit')),
          isHost() ? UI.el('button', { class: 'bg-hudbtn danger', onclick: function () {
            UI.confirm(I18n.t('bg_end_confirm'), endTable);
          } }, I18n.t('bg_end_table')) : null,
          UI.el('button', { class: 'bg-hudbtn', title: I18n.t('bg_sound'), onclick: function () {
            Sfx.toggle(); paint();
          } }, Sfx.enabled() ? '🔊' : '🔇'),
          UI.el('span', { class: 'bg-hudgrow' }),
          modeChip,
          multChip,
          UI.el('button', { class: 'bg-hudscore', onclick: copyCode }, [
            UI.el('span', { class: 'bg-hudrow' }, [
              UI.el('small', null, I18n.t('bg_us')), usB,
              UI.el('span', { class: 'bg-hudsep' }),
              UI.el('small', null, I18n.t('bg_them')), themB
            ]),
            UI.el('span', { class: 'bg-hudsess' }, I18n.t('bg_session') + ' ' + st.code)
          ])
        ]);
      }

      /* STAGE 4: tight fan of mini card backs (max 8) shown by each seat —
         pure CSS card backs (navy + gold frame + the app's dallah emblem). */
      function fanEl(n) {
        n = Math.min(8, Math.max(1, n | 0));
        var f = UI.el('div', { class: 'bg-fan' });
        var spread = 12, start = -((n - 1) * spread) / 2;
        for (var k = 0; k < n; k++) {
          var c = UI.el('div', { class: 'bg-fancard' });
          c.style.backgroundImage = cardBackURI();     // STAGE 5: SVG back
          c.style.transform = 'rotate(' + (start + k * spread) + 'deg)';
          f.appendChild(c);
        }
        return f;
      }

      /** Seconds left on the current turn (for the ring's countdown number). */
      function ringSecs() {
        return Math.max(0, Math.ceil((TURN_MS - (Date.now() - (st.turnStartAt || Date.now()))) / 1000));
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
        var avKids = [];
        // STAGE 4: fanned card backs by every other seat (Kamelna look) —
        // driven live by handCounts, capped at 8.
        if (i !== viewSeat() && p.handCounts && p.handCounts[i] > 0 &&
            (p.phase === 'bidding' || p.phase === 'dealRest' ||
             p.phase === 'doubling' || p.phase === 'playing')) {
          avKids.push(fanEl(p.handCounts[i]));
        }
        avKids.push(av);
        if (isTurn && !isBotSeat(i) &&
            (p.phase === 'bidding' || p.phase === 'playing' || p.phase === 'doubling')) {
          var elapsed = Math.max(0, (Date.now() - (st.turnStartAt || Date.now())) / 1000);
          var ring = UI.el('div', { class: 'bg-ring' });
          ring.innerHTML =
            '<svg viewBox="0 0 54 54"><circle class="track" cx="27" cy="27" r="24"/>' +
            '<circle class="left" cx="27" cy="27" r="24" style="animation-delay:-' +
            elapsed.toFixed(2) + 's"/></svg>';
          avKids.push(ring);
          // STAGE 4: remaining-seconds NUMBER inside the ring (Kamelna timer)
          var num = UI.el('div', { class: 'bg-ringnum' }, String(ringSecs()));
          avKids.push(num);
          clearInterval(st.ringInt);
          st.ringInt = setInterval(function () {
            var s = ringSecs();
            num.textContent = String(s);
            if (s <= 0) clearInterval(st.ringInt);
          }, 500);
        }
        // STAGE 4: تعابير speech bubble (fixed-list text, rendered as a text node)
        if (st.sayShow && st.sayShow.seat === i && Date.now() < st.sayShow.until) {
          avKids.push(UI.el('div', { class: 'bg-say' }, st.sayShow.text));
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
        // (STAGE 4: the old «🂠 n» count chip is replaced by the card-back fan)
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
        // trick cards, positioned toward each seat. STAGE 5: each card sits
        // inside a POSITIONING slot (the slot owns the CSS transform, the
        // card animates freely) and new cards FLIP-fly in from their seat —
        // or, for MY card, from the exact fan card I tapped.
        var cards = (p.table || []).map(function (t) { return t.card; });
        var sig = cards.join(',');
        var animFrom = 0;
        if (st.prevSig && sig.indexOf(st.prevSig) === 0 && sig !== st.prevSig) animFrom = st.prevCount;
        else if (sig === st.prevSig) animFrom = cards.length; // repaint: no re-animation
        st.prevSig = sig; st.prevCount = cards.length;
        st.pendingFly = [];
        (p.table || []).forEach(function (t, idx) {
          var pos = relPos(t.seat);
          var card = cardEl(t.card);
          var slot = UI.el('div', { class: 'bg-tslot bg-t-' + pos }, [card]);
          if (idx >= animFrom) st.pendingFly.push({ el: card, seat: t.seat, card: t.card });
          c.appendChild(slot);
        });
        if (p.phase === 'playing' && p.turn >= 0 && !(p.table || []).length) {
          c.appendChild(UI.el('div', { class: 'bg-turnhint soft' },
            controlsSeat(p.turn) ? I18n.t('bg_your_turn') : I18n.t('bg_turn_of') + ' ' + seatName(p.turn)));
        }
        return c;
      }

      /** STAGE 5: FLIP the freshly painted trick cards (batched reads →
          batched writes, transform/opacity only). */
      function runTableAnims() {
        var list = st.pendingFly; st.pendingFly = null;
        if (!list || !list.length || REDUCED) return;
        requestAnimationFrame(function () {
          var jobs = [];
          list.forEach(function (it) {                 // READ phase
            if (!it.el.isConnected || !it.el.animate) return;
            var from = null, rot = 0;
            if (st.playFrom && st.playFrom.card === it.card && (Date.now() - st.playFrom.t) < 1800) {
              from = st.playFrom.rect; st.playFrom = null;   // my tapped card lifts & arcs over
            } else {
              var seatEl = stage().querySelector('.bg-seat.bg-pos-' + relPos(it.seat) + ' .bg-avwrap');
              if (seatEl) { from = seatEl.getBoundingClientRect(); rot = 14; }
            }
            if (from) jobs.push({ el: it.el, from: from, to: it.el.getBoundingClientRect(), rot: rot });
          });
          jobs.forEach(function (j) {                  // WRITE phase
            flipFly(j.el, j.from, { to: j.to, rot: j.rot, arc: 16, dur: 400 });
          });
          if (jobs.length) Sfx.place();
        });
      }

      /** STAGE 5: trick sweep — the 4 cards gather, rotate toward the
          winner and shrink-fly to their pile (WAAPI; class fallback). */
      function sweepAnim(winSeat) {
        var c = stage().querySelector('.bg-center'); if (!c) return;
        var cardsEls = Array.prototype.slice.call(c.querySelectorAll('.bg-tslot .bg-pcard'));
        if (!cardsEls.length) return;
        Sfx.sweep();
        var pos = relPos(winSeat);
        if (REDUCED || !cardsEls[0].animate) { c.classList.add('bg-sweep-' + pos); return; }
        var tgt = stage().querySelector('.bg-seat.bg-pos-' + pos + ' .bg-avwrap');
        if (!tgt) { c.classList.add('bg-sweep-' + pos); return; }
        var tr = tgt.getBoundingClientRect();                       // READ phase
        var reads = cardsEls.map(function (el) { return el.getBoundingClientRect(); });
        cardsEls.forEach(function (el, i) {                         // WRITE phase
          var r = reads[i];
          var dx = (tr.left + tr.width / 2) - (r.left + r.width / 2);
          var dy = (tr.top + tr.height / 2) - (r.top + r.height / 2);
          el.animate([
            { transform: 'none', opacity: 1 },
            { transform: 'translate(' + (dx * 0.12).toFixed(1) + 'px,' + (dy * 0.12).toFixed(1) +
              'px) rotate(' + (i * 7 - 10) + 'deg) scale(0.95)', offset: 0.4, opacity: 1 },
            { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) +
              'px) rotate(' + (i * 16 - 24) + 'deg) scale(0.3)', opacity: 0 }
          ], { duration: 560, easing: 'cubic-bezier(.45,.05,.7,.4)', fill: 'forwards' });
        });
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
        // STAGE 5: big ARCHED fan (Kamelna proportions) — each card sits in
        // a slot that owns the arc rotation (the card itself stays free for
        // the lift/flip animations). New deals flip-reveal with a stagger.
        var fan = UI.el('div', { class: 'bg-hand' });
        var n = hand.length, mid = (n - 1) / 2;
        if (st.handRound !== p.roundNo) { st.handRound = p.roundNo; st.prevHandLen = 0; }
        var newDeal = n > st.prevHandLen;
        st.prevHandLen = n;
        hand.forEach(function (card, i) {
          var ok = canAct && legal.indexOf(card) >= 0;
          var el = cardEl(card, ok ? 'playable' : (canAct ? 'dim' : ''));
          if (ok) el.onclick = function () {
            el.onclick = null;
            // FLIP origin: the exact card I tapped, measured pre-repaint
            st.playFrom = { card: card, rect: el.getBoundingClientRect(), t: Date.now() };
            Sfx.slide();
            playCard(act, card);
          };
          if (newDeal && !REDUCED) {
            el.classList.add('bg-deal-in');
            el.style.animationDelay = (i * 45) + 'ms';
          }
          var slot = UI.el('div', { class: 'bg-handslot' }, [el]);
          var rot = (mid - i) * (n > 6 ? 3.2 : 4.2);          // RTL: first card sits right
          var lift = Math.pow(Math.abs(i - mid), 2) * (n > 6 ? 1.35 : 2.2);
          slot.style.transform = 'rotate(' + rot.toFixed(2) + 'deg) translateY(' + lift.toFixed(1) + 'px)';
          slot.style.zIndex = String(10 + i);
          fan.appendChild(slot);
        });
        wrap.appendChild(fan);
        return wrap;
      }

      /* STAGE 4: Kamelna-style INLINE bid bar (docked above the hand):
         صن / حكم / أشكل / بس (+ suit picker in round 2). Same doBid logic. */
      function bidSheet(p) {
        var act = p.turn;
        var r = p.bidRound || 1;
        var key = act + '|' + r + '|' + (p.roundNo || 0);
        if (st.suitPickKey !== key) { st.suitPick = false; st.suitPickKey = key; }

        var body = UI.el('div', { class: 'bg-bidbar-in' });

        if (st.suitPick) {
          body.appendChild(UI.el('div', { class: 'bg-bidq' }, I18n.t('bg_pick_suit')));
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
          // The bar only carries the dealer's question + the answers.
          body.appendChild(UI.el('div', { class: 'bg-bidq' },
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
        return UI.el('div', { class: 'bg-bidbar' }, [body]);
      }

      /* STAGE 2: display name of a project type. */
      function projLabel(type) {
        return I18n.t({ sira: 'bg_proj_sira', fifty: 'bg_proj_50', hundred: 'bg_proj_100',
                        fourhundred: 'bg_proj_400', baloot: 'bg_proj_baloot' }[type] || 'bg_project');
      }

      /* STAGE 2/4 inline bar for the دبل chain — Kamelna wording:
         دبل(×2) → ثري(×3) → أربع(×4) → قهوة. Engine keys unchanged. */
      function doubleSheet(p) {
        var cur = (typeof p.mult === 'number') ? p.mult : 1;
        var nextKey = { 1: 'bg_double', 2: 'bg_triple', 3: 'bg_kawra', 4: 'bg_qahwa' }[cur] || 'bg_double';
        var body = UI.el('div', { class: 'bg-bidbar-in' });
        body.appendChild(UI.el('div', { class: 'bg-bidq' }, I18n.t('bg_ask_dbl')));
        body.appendChild(UI.el('div', { class: 'bg-bidrow' }, [
          UI.el('button', { class: 'bg-bid dbl', onclick: function () { doDouble('raise'); } }, [
            UI.el('span', null, I18n.t(nextKey)),
            UI.el('b', null, cur >= 4 ? '☕' : '×' + (cur + 1))
          ]),
          UI.el('button', { class: 'bg-bid pass', onclick: function () { doDouble('pass'); } }, I18n.t('bg_pass'))
        ]));
        return UI.el('div', { class: 'bg-bidbar' }, [body]);
      }

      /* ================= STAGE 4 · bottom action bar + modals ================= */
      /* Kamelna's dark bar under the hand: «قيدها» (score sheet) ·
         «المشاريع» (this round's projects) · «تعابير» (emote picker) +
         the local player's name chip. Spectators get no emote button. */
      function actionBar(p) {
        var me = mySeat();
        var kids = [
          UI.el('button', { class: 'bg-abtn', onclick: function () { st.modal = 'scores'; paint(); } },
            I18n.t('bg_qaydha')),
          UI.el('button', { class: 'bg-abtn', onclick: function () { st.modal = 'projects'; paint(); } },
            I18n.t('bg_projects'))
        ];
        if (me >= 0) {
          kids.push(UI.el('button', { class: 'bg-abtn gold', onclick: function () { st.modal = 'emotes'; paint(); } },
            I18n.t('bg_emotes')));
        }
        kids.push(UI.el('span', { class: 'bg-mechip' }, [
          UI.el('span', { class: 'bg-meav' }, UI.initials(me >= 0 ? seatName(me) : (myName || '؟'))),
          UI.el('span', { class: 'bg-mename' }, me >= 0 ? seatName(me) : (myName || ''))
        ]));
        return UI.el('div', { class: 'bg-actionbar' }, kids);
      }

      function closeModal() { st.modal = null; paint(); }
      function modalShell(title, bodyKids) {
        var inner = UI.el('div', { class: 'bg-modal', onclick: function (e) { e.stopPropagation(); } },
          [UI.el('h3', null, title)].concat(bodyKids).concat([
            UI.el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:10px', onclick: closeModal },
              I18n.t('bg_close'))
          ]));
        return UI.el('div', { class: 'bg-modalbd', onclick: closeModal }, [inner]);
      }

      /* «قيدها» — the score sheet: one line per finished deal (بنط,
         مشاريع, دبل multiplier, نقاط per team) + the running النشرة. */
      function scoreSheetModal(p) {
        var hist = p.history || [];   // guarded: old tables have no history yet
        var usK = myTeamKey(), thK = themTeamKey();
        var kids = [];
        if (!hist.length) {
          kids.push(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bg_hist_empty')));
        } else {
          kids.push(UI.el('div', { class: 'bg-histrow head' }, [
            UI.el('div', { class: 'h1' }, I18n.t('bg_round_col')),
            UI.el('span', { class: 'pts' }, I18n.t('bg_us')),
            UI.el('span', { class: 'pts' }, I18n.t('bg_them'))
          ]));
          hist.forEach(function (h, idx) {
            var modeTxt = h.m === 'sun' ? I18n.t('bg_sun')
                        : h.m === 'ashkal' ? I18n.t('bg_ashkal')
                        : (I18n.t('bg_hokum') + ' ' + (h.tr ? SUIT_CHAR[h.tr] : ''));
            var multTxt = h.mult === 'coffee' ? ' · ☕' : ((h.mult || 1) >= 2 ? ' · ×' + h.mult : '');
            var sub = I18n.t('bg_abnat') + ' ' +
              ((h.bnt && h.bnt[usK]) || 0) + '/' + ((h.bnt && h.bnt[thK]) || 0);
            if (h.pj && ((h.pj.t0 || 0) + (h.pj.t1 || 0)) > 0) {
              sub += ' · ' + I18n.t('bg_projects') + ' ' + (h.pj[usK] || 0) + '/' + (h.pj[thK] || 0);
            }
            if (h.kb) sub += ' · ' + I18n.t('bg_kaboot');
            if (h.kh) sub += ' · ' + I18n.t('bg_khosran').split('!')[0];
            kids.push(UI.el('div', { class: 'bg-histrow' }, [
              UI.el('div', { class: 'h1' }, [
                UI.el('b', null, (idx + 1) + ' · ' + modeTxt + multTxt),
                UI.el('small', null, sub)
              ]),
              UI.el('span', { class: 'pts us' }, '+' + ((h.pts && h.pts[usK]) || 0)),
              UI.el('span', { class: 'pts them' }, '+' + ((h.pts && h.pts[thK]) || 0))
            ]));
          });
          kids.push(UI.el('div', { class: 'bg-histrow total' }, [
            UI.el('div', { class: 'h1' }, [UI.el('b', null, I18n.t('bg_totals'))]),
            UI.el('span', { class: 'pts us' }, String((p.totals && p.totals[usK]) || 0)),
            UI.el('span', { class: 'pts them' }, String((p.totals && p.totals[thK]) || 0))
          ]));
        }
        return modalShell(I18n.t('bg_qaydha'), kids);
      }

      /* «المشاريع» — this round's declarations. Before the trick-2 reveal
         only WHO declared is public (cards stay hidden — same rule as the
         showdown overlay); from trick 2 on, the full resolved list shows. */
      function projectsModal(p) {
        var kids = [];
        var tw = p.tricksWon || {};
        var collected = ((tw.t0 || []).length) + ((tw.t1 || []).length);
        var declaredSeats = Object.keys(p.declared || {});
        if (!declaredSeats.length) {
          kids.push(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bg_no_proj_yet')));
        } else if (p.phase === 'playing' && collected < 4) {
          declaredSeats.forEach(function (sKey) {
            kids.push(UI.el('div', { class: 'bg-histrow' }, [
              UI.el('div', { class: 'h1' }, [
                UI.el('b', null, seatName(+sKey) + ' — ' + I18n.t('bg_declared_proj'))
              ])
            ]));
          });
          kids.push(UI.el('p', { class: 'bg-projhint' }, I18n.t('bg_hidden_until2')));
        } else {
          var pr = resolveProjects(p.projects, p.mode);
          if (!pr.items.length) {
            kids.push(UI.el('p', { class: 'muted', style: 'text-align:center' }, I18n.t('bg_no_proj_yet')));
          }
          pr.items.forEach(function (it) {
            var mini = UI.el('div', { class: 'bg-projcards' });
            (it.cards || []).forEach(function (c) { mini.appendChild(cardEl(c, 'mini')); });
            kids.push(UI.el('div', { class: 'bg-projrow' + (it.cancelled ? ' cancelled' : '') }, [
              UI.el('div', { class: 'bg-projwho' }, [
                UI.el('b', null, seatName(it.seat)),
                UI.el('span', null, projLabel(it.type) + ' · ' +
                  (it.cancelled ? I18n.t('bg_proj_cancelled') : '+' + projectValue(it.type, p.mode)))
              ]),
              mini
            ]));
          });
        }
        return modalShell(I18n.t('bg_projects'), kids);
      }

      /* «تعابير» — the 8 preset Kamelna-style phrases, nothing else. */
      function emoteModal() {
        var grid = UI.el('div', { class: 'bg-emotegrid' });
        EMOTES.forEach(function (t) {
          grid.appendChild(UI.el('button', { class: 'bg-emote', onclick: function () {
            sendEmote(t); closeModal();
          } }, t));
        });
        return modalShell(I18n.t('bg_emotes'), [grid]);
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
