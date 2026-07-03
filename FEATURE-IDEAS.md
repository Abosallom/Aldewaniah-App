# Aldewaniah — feature ideas (2026-07-03)

Everything below fits the existing architecture (a new file in `js/modules/`, Firestore
collection + rules block, no paid servers). Ranked inside each group by impact vs effort.

## 🎮 Entertainment (members-only games)

1. **Private online Baloot (بلوت أونلاين)** — the flagship. A real 4-player Baloot table
   exclusive to members: create a table, 3 friends join (like the buzzer's room-code flow),
   play صن/حكم rounds with real cards. Turn-based state lives in Firestore (a `tables`
   collection; each move is a small write — well within free quota), so it works from
   anywhere, not just same-WiFi. The existing Baloot calculator becomes the built-in
   scorekeeper, and spectators (باقي الشلة) can watch live. This is the biggest build
   (card rules engine: bidding, projects/مشاريع, tricks) — roughly 4–6 sessions of work,
   done in stages: playable basic صن first, then حكم, then مشاريع.
2. **Trivia night (ليلة الأسئلة)** — builds on the existing buzzer: host picks a category,
   questions appear on everyone's phone, buzzer decides who answers, points tracked.
   Medium effort, very "diwaniya night" friendly.
3. **Tournament predictions (توقعات البطولة)** — before each Ramadan tournament, members
   predict winners; live leaderboard of who reads the bracket best. Small effort.
4. **"من صاحب الصورة؟"** — guessing game from old gallery photos. Small effort.
5. **Jackaroo scoreboard** (like the Baloot/Trix calculators) — small effort; a full
   online Jackaroo board is a later, bigger project.

## 🛠 Functional

1. **Push notifications** — the one big missing native piece: chat/DM/announcement alerts
   when the app is closed. Needs Firebase Cloud Messaging + a tiny Cloudflare Worker as
   sender + the Capacitor push plugin. Highest daily-use value now that DMs exist; medium
   effort. (Also strengthens the "real app" story with Apple.)
2. **Night scheduler + RSVP (جدولة الديوانية)** — extend the calendar: admin proposes the
   next gathering, members tap حاضر/معتذر, auto-reminder day-of; attendance links to the
   existing check-in. Small–medium effort.
3. **Duty rotation (العزيمة على من؟)** — rotating roster for who hosts/brings dinner or
   coffee, with history so nobody "forgets" their turn. Small effort.
4. **Group fund (صندوق الشلة)** — admin-managed ledger of contributions/expenses, each
   member sees their balance; pairs with the existing قطّة splitter. Small–medium effort.
5. **Yearly wrapped (حصاد السنة)** — fun stats card: attendance king, most messages, most
   tournament wins — shareable image. Small effort, great for group identity.
6. **Event albums** — group gallery photos by event/night instead of one long grid. Small.

## Suggested order
1. Push notifications (functional backbone — everything else benefits)
2. Online Baloot stage 1 (the flagship people will open the app for)
3. Night scheduler + RSVP
4. Trivia night → predictions → wrapped

All of these slot into الأقسام as members-only sub-sections, same plug-in pattern as today.
