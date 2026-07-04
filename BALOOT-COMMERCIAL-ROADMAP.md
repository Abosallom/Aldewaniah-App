# بلوت أونلاين → منتج تجاري باشتراكات
### Commercial roadmap — first step toward public release (2026-07-04)

Written from three seats at the same table: **the Baloot player** (what must feel right),
**the software engineer** (what must be rebuilt to charge money for it), and
**the businessman** (how it makes money in Saudi, legally and profitably).
Baseline reference: the Kamelna deep-research report (features, economy, user pains).

---

## 1 · The player's verdict — what "engine level" means

The current game (v85) has a **provably correct rules brain** (the AI playtest recomputed
4 rounds of scoring by hand — perfect, including خسران, rounding, and duplicate-project
cancellation) and now-protected human turns. What separates a club toy from a game people
pay for is the next list, in order:

1. **My turn is sacred** — fixed in v85 (20s server-timed, no auto-pass). Must never regress.
2. **Opponents that respect me** — current bots follow the rules but over-buy and waste 10s.
   A commercial bot needs hand evaluation (بنط counting, partner signals, trump management).
   The engine is pure JS — a proper bot is an upgrade, not a rewrite.
3. **The drama layer** — القيد والقطع (cut & accuse) and سوا are WHY Kamelna feels "real".
   These only matter with humans and are our biggest missing gameplay features.
4. **أكة declaration + مقفل/مفتوح doubling variants** — the last rule-depth gaps.
5. **Recovery** — network blip melts a صكة today into watchdog recoveries; a paying player
   expects seamless rejoin (Kamelna's #1 complaint is drops — beating them here wins hearts).

## 2 · The engineer's verdict — the honest architecture line

**What we have:** client-authoritative Firestore tables. Every client writes game state;
rules are enforced by the players' own devices. For a trusted diwaniya: perfect. For
strangers paying subscriptions: **unshippable** — any member can read hands from dev-tools
and forge moves. This is THE line between club feature and commercial product.

**The move — a real playing engine (server-authoritative):**
- Extract the existing pure rules engine (deal/legalMoves/winnerOf/scoreRound/findProjects —
  already unit-tested, already dependency-free) into a shared module.
- Host it in **Cloudflare Durable Objects** (one object per table): holds hands privately,
  validates every move, pushes state over WebSockets. Fits the existing zero-server stack
  (we already run 2 Workers), costs pennies, ~50ms from KSA.
- Clients become pure renderers (the v85 UI survives almost unchanged — it already renders
  from state snapshots).
- Firebase stays for identity (phone OTP) + profiles; the engine verifies Firebase ID tokens
  (same pattern our media worker uses today).
- This kills in one stroke: cheating, write-races, host-dependency, reconnect fragility
  (state lives on the server; rejoin = resubscribe).

**Sizing (realistic):** engine extraction + DO room server ≈ 2-3 weeks equivalent; client
rewiring ≈ 1-2 weeks; matchmaking/lobby ≈ 1 week. This is the single biggest work item and
the true "first step" — everything commercial stands on it.

## 3 · The businessman's verdict — money, rules, and the wedge

**Market:** Kamelna proves the market (1M+ Android installs, 146k App Store ratings, 40-100k
SAR tournament prizes, subscriptions at 12.99 SAR/week). Their users' loudest pains — paywall
aggression, 30s ads, disconnects, no dark theme — are our positioning gifts.

**The wedge (don't fight Kamelna head-on):** *"بلوت الديوانية"* — private-first Baloot.
Kamelna is a noisy public hall; we sell **your own diwaniya online**: your group, your table,
your rules, no ads, no strangers. The whole Aldewaniah app (chat, check-ins, calendar, gifts)
is the moat — Kamelna has nothing like the club layer.

**Revenue model (Saudi-legal, store-compliant):**
- **Club subscription** (the host pays, members free): e.g. 29-49 SAR/month per diwaniya —
  unlimited tables, voice/emotes, cosmetics, tournament nights. One payer per group = easy sell.
- Individual tier later (9.99 SAR/month) once matchmaking exists.
- **Payments:** web/PWA via **Moyasar or Tap** (mada/Apple Pay, ~2.x% fees, no Apple cut).
  IMPORTANT store rule: digital subscriptions sold **inside the iOS app must use Apple IAP**
  (15-30% cut) — the standard play is web-purchase + app-login (Netflix model), which Apple
  allows if the app never links to the external purchase page.
- **Hard legal lines:** no real-money prizes tied to game outcomes (gambling exposure in KSA),
  PDPL compliance for player data, VAT registration once revenue is real. Cosmetics and
  subscriptions: clean. Kamelna-style cash tournaments need licensing advice — park it.

**What we deliberately do NOT copy:** golden-cards casino economy, rewarded ads, pay-to-play
ranked gates. Our brand is the anti-paywall Baloot.

## 4 · The phased plan

| Phase | Goal | Content | Gate to next |
|---|---|---|---|
| **0 — Club polish** (now → 2 wks) | The diwaniya loves it | v85 fixes verified by replays; smarter bot v1; أكة + مقفل; reconnect polish; sounds/haptics via the native build | Group plays weekly without Claude fixing anything |
| **1 — The Engine** | Server-authoritative | Rules engine → Durable Object rooms; clients as renderers; seamless rejoin; anti-cheat by construction | 100 bot-vs-bot games server-side, zero desyncs |
| **2 — Product** | Sellable | Accounts+profiles across clubs; club creation self-serve (white-label tech already exists); Moyasar subscriptions; قيد/قطع + سوا; cosmetics (table skins, card backs, bid voices) | 3 pilot diwaniyas paying |
| **3 — Launch** | Public | App Store standalone app ("بلوت الديوانية"), TestFlight beta with real groups, web landing + pricing, support flow | Retention + payment data says scale |

**First concrete step (Phase 1 kickoff):** extract `baloot-engine.js` from the game module
(the pure functions + a table-state reducer) with its existing test suite. Everything else
hangs off that. Say the word and I start it.

## 5 · Risks, named honestly

- **Apple 4.3/spam risk** for a second Baloot app — mitigate with genuinely distinct club-first
  product design and the Aldewaniah brand.
- **Kamelna's network effects** (always-full tables) — we don't need them: our tables come
  pre-filled with your friends; bots cover empty seats.
- **Trade dress** — keep our sadu-maroon identity distinct from their sand look (already done).
- **Solo-founder ops** — subscriptions mean support; start with club model (few payers, known
  people) before individual consumers.
