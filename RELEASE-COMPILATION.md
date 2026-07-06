# Aldewaniah — Release Compilation

**Everything built, ready for the next App Store update.**
Last updated: 2026-07-05 · Live web version: **v91** · iOS build in review: **1.1 (3)**

---

## 1. Current status at a glance

| Item | State |
|---|---|
| **iOS app** | Version **1.1, build 3** — *Waiting for Review* on the App Store. Manual release (won't go public until you release it). |
| **Live web app** (app.aldewaniah.com) | **v91** — fully deployed, matches the iOS bundle. |
| **What build 3 contains** | Everything through v91 (online Baloot game + engine, AI across the app, private messaging, gift codes, health monitoring). |
| **Release type** | 100% free · no in-app purchases · invite-only · unlisted (link-only) intended. |

> When Apple approves 1.1 (3), release it. The **next** update (which will be version **1.2**) can then be created — use the "What's New" text in section 2 below.

---

## 2. App Store "What's New" — ready to paste

Use this in the **What's New** field when you submit the next version (1.2). Both languages are provided; App Store Connect lets you set release notes per language.

### English

```
What's new in Aldewaniah:

• Baloot online — play the classic card game with a faithful "Kamelna"-style
  table, projects, doubling, and a full score sheet. Play solo against smart
  AI opponents or privately with fellow members.
• AI throughout the app — a helpful assistant plus an in-game Baloot coach,
  smart suggestions in polls, calendar, your profile, and messages.
• Private messages — one-to-one chats between members, with official messages
  from the group admin shown in a distinct style.
• Gift codes — the admin can send and manage members' subscription codes.
• Smoother, more responsive, and more reliable throughout.
```

### Arabic

```
جديد الديوانية:

• بلوت أونلاين — العبة الورق الشهيرة بأسلوب «كملنا» الأصيل: طاولة السدو،
  المشاريع، الدبل، وورقة النشرة. العب فرديًا ضد خصوم أذكياء أو بين الأعضاء.
• الذكاء الاصطناعي في كل التطبيق — مساعد ذكي و«مدرّب» داخل لعبة البلوت،
  واقتراحات ذكية في التصويت والتقويم والملف الشخصي والرسائل.
• الرسائل الخاصة — محادثات فردية بين الأعضاء، ورسائل الإدارة بشكل رسمي مميز.
• أكواد الهدايا — يرسل المشرف أكواد الاشتراكات ويديرها للأعضاء.
• أداء أسلس وأسرع وأكثر ثباتًا في كل مكان.
```

### App Review notes (already saved on the current submission — reuse for future ones)

- Private, invite-only app for one social group (a Gulf *diwaniya*). 100% free, no IAP.
- **Demo account** (use the EMAIL sign-in tab): `reviewer@aldewaniah.com` / `AppleSupport`
- The Baloot card game is **free, single-player vs AI or private among members — no gambling, no wagering, no real money, no purchases.**

---

## 3. Complete feature inventory (what the app does today)

**Members & access**
- Phone-OTP login (and linked email/password login for the wrapped iOS app).
- Admin-approved, invite-only membership; join requests; roles and co-admin permissions.
- In-app account deletion, privacy policy & terms, report content / block user.
- Phone numbers kept private (identity keyed by Firebase UID, not phone).

**Communication**
- Group chat with photos and hold-to-record voice/video notes.
- Private 1-to-1 messages between members; admin messages shown in an official style, with a per-message "as Admin / as member" choice.
- Browser/device push-notification groundwork (activation pending — see section 6).

**The gathering (diwaniya)**
- Attendance check-in, geofenced to an admin-set location and radius.
- Shared calendar, polls, and expense splitting (قطّة).
- Member directory and personal profiles.
- Prayer times + Qibla compass + Hijri calendar.
- Photo/video gallery on private, secure storage.

**Games & tools**
- **Baloot Online** — full Kamelna-style card game: sadu table, projects (سرا/خمسين/مية/أربعمية/بلوت), doubling chain (دبل/ثري/أربع/قهوة), Ashkal, النشرة score sheet, timers, emotes. A dedicated rules **engine** with a strong AI, plus an instant offline **solo mode**.
- Score calculators for Baloot and Trix, a buzzer, and a roulette.
- Tournaments / brackets.

**AI features**
- A reusable in-app AI assistant (backed by Cloudflare Workers AI, Llama 3.3 70B).
- In-game Baloot "coach" that suggests the best bid/card.
- Contextual AI helpers in polls (suggest options), calendar (suggest an event), profile (write a bio), and DMs (suggest a reply).

**Admin**
- Member management, gift-code import/distribution/withdrawal (with reasons), suggestions & bug reports inbox, an "App Health" panel (grouped errors + AI diagnosis), and a full updates log.

**Reliability & polish**
- App-wide "black box" that logs errors for the admin, with throttling and privacy filtering.
- Native-app feel (no text selection/zoom flashes), dynamic motion, offline app-shell caching, and silent auto-update to the newest version.

---

## 4. Full version history (v1 → v91)

| Ver | Date | What changed |
|---|---|---|
| v91 | 2026-07-05 | *(internal)* Updates-log corrected v80–v90; full feature/service validation; deploy migrated to GitHub Actions. |
| v90 | 2026-07-04 | AI health monitoring: error "black box" + admin App-Health panel (grouped errors + member bug reports + AI diagnosis) + daily automatic check. |
| v89 | 2026-07-04 | AI across the whole app: unified helper + in-game Baloot coach + smart suggestions in polls, calendar, profile & messages. |
| v88 | 2026-07-04 | Brand-new Baloot engine: precise rules + strong AI + instant offline solo mode. |
| v87 | 2026-07-04 | Authentic Kamelna Baloot: النشرة round-end sheet, horizontal player plates, "versus" splash at start. |
| v86 | 2026-07-04 | Suggestion / bug report to admin from Sections + app-wide dynamic motion. |
| v85 | 2026-07-04 | Baloot: freeze fixes, protected human turns, doubling & project declarations, clearer cards. |
| v84 | 2026-07-04 | Authentic native-app feel + sadu table in the Diwaniah brand colors. |
| v83 | 2026-07-04 | Baloot: Kamelna proportions — big hand fan, player avatars, ring timer, clear bid buttons. |
| v82 | 2026-07-04 | Gift codes: withdraw any sent code with a written reason + official notice to the member. |
| v81 | 2026-07-04 | Baloot: full-screen, premium card art, sound & motion. Gift codes: fixed disappearing + pull-back-all. |
| v80 | 2026-07-04 | Private messages: codes inside a message show as one-tap copy chips. |
| v79 | 2026-07-04 | Baloot full Kamelna look: sadu rug, opponents' card fans, inline bid bar, score sheet, projects, emotes, timer + updates log. |
| v78 | 2026-07-04 | Admin DMs: choose "as Admin or as member" on every send. |
| v77 | 2026-07-04 | Fix: every page opens from its top. |
| v76 | 2026-07-04 | Gift codes: one-tap resend with updated wording. |
| v74 | 2026-07-03 | Baloot: bots fill seats, animated 3+2 deal, flip card center-table, 20s timers. |
| v72 | 2026-07-03 | Admin gift codes: import + official-DM distribution. |
| v71 | 2026-07-03 | Baloot: projects, doubling chain & Ashkal. |
| v69 | 2026-07-03 | Baloot Online stage 1 + push-notification groundwork. |
| v67 | 2026-07-03 | Private member DMs (distinct admin style) + privacy/security hardening. |
| v65 | 2026-06-27 | In-app account deletion, privacy policy & terms, report/block. |
| v63 | 2026-06-27 | Geofenced check-in (admin-set radius). |
| v54 | 2026-06-27 | Chat: hold-to-record voice/video notes + media panel. |
| v52 | 2026-06-26 | Expense splitting, shared calendar, polls. |
| v47 | 2026-06-26 | Maintenance mode with prayer times & Qibla. |
| v46 | 2026-06-26 | Email login (in addition to phone). |
| v45 | 2026-06-26 | AI assistant for members + suggestions to admin. |
| v33 | 2026-06-26 | Group chat, profiles & member directory. |
| v22 | 2026-06-25 | Times: prayers, Qibla compass, Hijri calendar. |
| v20 | 2026-06-25 | Sections: Baloot calculator, buzzer, roulette, Trix calculator. |
| v10 | 2026-06-24 | Gallery on private secure storage. |
| v4  | 2026-06-24 | Member management, join requests & roles. |
| v1  | 2026-06-23 | Launch 🎉: home, tournaments & phone-OTP member login. |

---

## 5. Backend & infrastructure

| Service | Purpose | State |
|---|---|---|
| Firebase (project `aldewaniah-45158`) | Phone-OTP + email auth, Firestore database | ✅ Live; security rules cover every collection |
| Cloudflare Worker `aldewaniah-ai` | AI features (Workers AI, Llama 3.3 70B) | ✅ Live |
| Cloudflare Worker `aldewaniah-media` | Gallery media on R2 storage | ✅ Live |
| Cloudflare Worker `aldewaniah-push` | FCM push sender | ⚠️ **Pending** — needs your service-account key (see section 6) |
| GitHub Pages (app.aldewaniah.com) | Web hosting | ✅ Live; **migrated to GitHub Actions deploy** (reliable; the failure emails should stop) |

---

## 6. Action items for you (Aziz)

1. **After Apple approves 1.1 (3):** release it from App Store Connect (it's set to manual release).
2. **Request unlisted (link-only) distribution** so the app is invite/link-only: App Store Connect / developer contact → Distribution → Other Distribution Questions → send the message referencing App ID 6785237885 and `com.aldewaniah.app`.
3. **Activate push notifications** (5 minutes, one-time) — see `SETUP-PUSH.md`:
   - Firebase → Project settings → Service accounts → Generate new private key.
   - Paste the worker code into the `aldewaniah-push` Cloudflare worker and add the `SERVICE_ACCOUNT` secret + `FIREBASE_PROJECT` variable.
   - Then I can verify end-to-end delivery.
4. **For each future update:** the version number must go up (next is **1.2**), and the build number must go up too. Fill the "What's New" field from section 2.

---

## 7. Quick technical reference

- **App Store Connect app ID:** 6785237885 · **Bundle:** com.aldewaniah.app · **Apple Team:** 84U5WFJU67 (Abdulaziz Alsaloom)
- **Signing:** manual profile "Aldewaniah App Store" + Apple Distribution certificate.
- **Repo:** Abosallom/Aldewaniah-App · deploy = **GitHub Actions** (`.github/workflows/deploy.yml`).
- **How to ship a web update:** commit → push (GitHub Desktop) → the Actions workflow deploys automatically. The service-worker cache version (`aldewaniah-vNN` in `sw.js`) must be bumped each change.
- **How to ship an iOS update:** run `mobile/sync-web.sh` to copy the latest web files in, bump the build number in Xcode, Archive → Distribute → App Store Connect, then attach the build and submit in ASC.
- **Demo login for App Review:** `reviewer@aldewaniah.com` / `AppleSupport` (email tab).
