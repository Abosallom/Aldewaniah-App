# Aldewaniah App — V2 Architecture (rebuild, July 2026)

This is the full architecture for the V2 rebuild: what the components are, how they connect, why each decision was made, and the implementation plan. Constraints are unchanged from V1: **no paid servers, no build step, non-technical owner, bilingual Arabic-RTL/English, one codebase = website + installable app + iOS native shell.**

---

## 1. Goals and constraints (the "why" behind everything)

| Constraint | Consequence |
|---|---|
| Owner is non-technical, deploys via GitHub Desktop push | Static files only; no bundler, no npm for the web app; plain JS you can read and edit |
| Zero fixed cost | GitHub Pages (free hosting) + Firebase free/Blaze-pennies (auth+DB) + Cloudflare free tier (R2 media, Workers AI) |
| Private group (invite-only, admin-approved) | Every data read/write gated server-side by "approved member" Firestore rules |
| Same code = web + PWA + iOS app | Capacitor shell wraps the same static files; feature-detect the native shell at runtime |
| App Store approval | Native-feeling UI, in-app account deletion, UGC report/block, privacy/terms pages, working reviewer demo account, and **no "install this website" artifacts inside the native app** |
| Member privacy (V2 hardening) | Phone numbers must not be readable by other members anywhere — identity moves to Firebase **UID** in all member-readable documents |

## 2. High-level architecture

```
                      ┌────────────────────────────────────────────┐
                      │  Static app (GitHub Pages, app.aldewaniah.com) │
                      │  index.html + css + js  (no build step)     │
                      └──────┬─────────────┬────────────┬──────────┘
                             │             │            │
              Firebase Auth  │   Firestore │            │  Cloudflare
              (phone OTP +   │   (all app  │            │  Workers
              linked email)  │    data)    │            │
                             ▼             ▼            ▼
                      ┌──────────┐  ┌───────────┐  ┌──────────────────────┐
                      │ Identity │  │ members,  │  │ aldewaniah-media      │
                      │ + tokens │  │ dms, msgs,│  │  → R2 bucket (photos, │
                      └──────────┘  │ polls, …  │  │    voice, video)      │
                                    └───────────┘  ├──────────────────────┤
                                                   │ aldewaniah-ai         │
                                                   │  → Workers AI (LLM)   │
                                                   └──────────────────────┘
        Same static files, three delivery channels:
        1. Browser (website)   2. PWA (service worker, add-to-home)   3. Capacitor iOS shell (App Store)
```

**Why this shape:** the app is a *client-only* architecture. There is no app server to maintain or pay for. Authorization lives in two places only: Firestore security rules (data) and the two Workers (media + AI), both of which validate the caller's Firebase ID token server-side. The client is untrusted by design.

## 3. Component inventory and how they connect

### 3.1 Core runtime (load order matters — no modules/bundler)
- `js/i18n.js` — string table + `{app}` interpolation; every module registers its own strings.
- `js/content.js` — editable content (tournaments, contact email).
- `js/app.js` — **module registry + hash router + UI helpers** (`App.registerModule`, `UI.el` hyperscript that renders text as text-nodes → XSS-safe by construction).
- `js/moderation.js` — local block list + Firestore `reports` writer (App Store UGC requirement). V2: blocks by **uid or phone** (legacy).
- `js/auth.js` — phone-OTP login, optional linked email/password (default inside the native shell where reCAPTCHA is unreliable), member resolution (`members/{phone}`), roles (admin/co-admin perms), account panel with **account deletion**.
- `js/boot.js` — **new in V2**: App.start(), splash dismissal, service-worker registration + auto-update. Extracted from inline `<script>` so the CSP can drop `'unsafe-inline'` for scripts.
- `js/native.js` — **new in V2**: Capacitor shell detection. Adds `html.native`, suppresses web-only UI (install banner, SW auto-update loop) inside the App Store build. This is the single point where "website" and "native app" behavior diverge.
- `js/install.js`, `js/notify.js`, `js/chat-notify.js`, `js/ai-assistant.js`, `js/maintenance.js` — install prompt (web only), admin join alerts, chat notifications, members-only AI assistant (Workers AI), admin pause-mode overlay.

### 3.2 Feature modules (`js/modules/*.js`, plug-in pattern)
Top-level tabs: `home` (check-in w/ optional geofence), `tournaments`, `chat` (group + **private DMs**, V2), `sections` (container), `admin`.
Sections sub-modules: `profile` (UID-keyed phone-free directory), `gallery` (R2), `baloot`, `trix`, `buzzer` (WebRTC + RTDB signaling), `times` (prayer/Qibla), `roulette`, `split`, `calendar`, `polls`.
Adding a feature = 1 new file + 1 `<script>` line + (if it stores data) a rules block. That plug-in pattern is the core extensibility story and is retained unchanged.

### 3.3 Backend #1: Firebase (project `aldewaniah-45158`)
- **Auth:** phone OTP (SMS region: SA) + Email/Password linked to the same user. Native shell defaults to email login (WKWebView reCAPTCHA limitation).
- **Firestore collections and identity model (V2 — the key change):**

| Collection | Key | Member-readable? | Identity fields (V2) |
|---|---|---|---|
| `members` | phone E.164 | **admin-only list**; own doc get | name, status, admin, perms, createdAt |
| `uidmap` | phone → {uid} | admin-only read | (bridge for admin→directory pushes) |
| `directory` | **uid** | approved members | name, photo, saying, hobbies, bio — *no phone* |
| `messages` (group chat) | auto | approved members | **uid** + name (V2; was phone) |
| `dms/{tid}` + `dms/{tid}/msgs` | tid = sorted `uidA_uidB` | **participants only** | uid + name; `admin:true` flag styles official admin messages |
| `checkins` | **`{uid}_{day}`** (V2; was phone_day) | approved members | uid + name, day, removed |
| `splits`, `events`, `polls` | auto | approved members | **byUid** + byName (V2; phone removed) |
| `suggestions`, `reports` | auto | **admin-only read** | may keep phone (not member-visible) |
| `config/app`, `config/checkin` | fixed | public read / write admin | maintenance + geofence |
| `gallery` | (legacy, unused) | — | media moved to R2 |

**Why UID everywhere:** the audit (2026-07-03) found six member-readable collections carrying E.164 phones — any member could dump the group's phone book from dev-tools. UID is opaque, per-account, and already the key of `directory` and poll votes. Phones now exist only in admin-only surfaces (`members`, `uidmap`, `suggestions`, `reports`) and legacy docs.

- **Firestore rules:** now also versioned in-repo at `firestore.rules` (single source of truth; publish via console). Rules enforce: approved() gate on all reads; create only with `request.resource.data.uid == request.auth.uid`; deletes owner-or-admin; DMs restricted to `request.auth.uid in members` of the thread; legacy phone-keyed docs still deletable by owner via `ph()`.

### 3.4 Backend #2: Cloudflare Workers (account d6aa72c2…)
- **`aldewaniah-media`** → R2 bucket `aldewaniah-media` (private). Endpoints: `/upload?dir=chat|gallery` (auth, image/video/audio only, 100 MB), `/sign` (batch short-lived HMAC URLs), `/file?key&exp&sig` (serves media to `<img>/<video>/<audio>`), `/delete` (admin-only), `/list`. Auth model: client sends Firebase ID token → worker reads `members/{phone}` via Firestore REST *with that token* → Firestore itself validates signature and rules. No service-account key anywhere.
- **`aldewaniah-ai`** → Workers AI (`llama-3.3-70b-instruct-fp8-fast`), same token model, members only.
- CORS allowlist on both: `app.aldewaniah.com`, `abosallom.github.io`, `capacitor://localhost`, `https://localhost`, `http://localhost`.

### 3.5 Delivery channel #3: iOS native shell (`mobile/`)
Capacitor 6, appId `com.aldewaniah.app`. Manual signing ("Aldewaniah App Store" profile, Team 84U5WFJU67). ASC app id 6785237885. Reviewer demo account: `reviewer@aldewaniah.com` / email login (documented in review notes).

**Update (2026-07-18):** `mobile/capacitor.config.json` now sets `server.url: "https://app.aldewaniah.com"` — the shipped iOS app is a thin native wrapper that loads the **live site directly**, not a bundled `www` copy synced at build time. Practical effect: a pure web/JS/CSS fix (like §8 below) goes out to the iOS app the moment it's live on the web — no new Xcode archive/App Store build needed. A new build is only required for changes to native config itself (permissions, plugins, entitlements, the Capacitor config).

**App Store strategy (the rejection fixes):**
1. **4.2 Minimum functionality** (web-wrapper concern): `js/native.js` removes every "website tell" inside the shell — install banners, add-to-home-screen guides, SW update reloads. The app already behaves natively (full-height chat, press-and-hold voice notes, haptic patterns, offline shell, glass UI). V2 adds **private DMs**, deepening app-only functionality. Review notes explicitly walk the reviewer through member-only features with the demo account.
2. **2.1 Completeness:** reviewer account is pre-approved with email login (phone OTP can't work in WKWebView) — stated first in the notes.
3. **5.1.1(v):** in-app account deletion lives in the account panel (two taps from the header) — screenshot + path in the notes.
4. **1.2 UGC:** report message / block user on every piece of member content + 24h moderation commitment in terms.html.
5. Version bumped (1.0 → 1.1, build 2) so a fresh binary carries the fixes.

## 4. Private messages (DM) — V2 feature design

**Requirements (Aziz, 2026-07-03):** any member can privately message any member; admin can privately message members; messages *from the admin* must look different from ordinary member DMs.

- **Thread id** = `min(uidA,uidB) + '_' + max(uidA,uidB)` → one deterministic thread per pair, no duplicate-thread races, no query needed to find an existing thread.
- **Thread doc** `dms/{tid}`: `{ members:[uidA,uidB], names:{uid:name}, last:{text,at,uid}, unread:{uid:n}, adminIn:bool }`. `unread` incremented transactionally by the sender for the recipient; zeroed by the reader on open.
- **Messages** `dms/{tid}/msgs/{auto}`: `{ text | imageKey, uid, name, admin:bool, at }`. `admin:true` is stamped when the sender is an admin **and verified in rules** (`isAdmin()`), so official styling can't be spoofed.
- **UI:** the Chat tab gets a segmented switch **المجموعة | الخاص**. Private view = thread list (unread badges, official ⭐ style on admin threads) + "رسالة جديدة" member picker fed from the phone-free `directory`. A thread opens the same native chat screen (text + photo). Admin bubbles render in the distinct "official" style (maroon/gold, الإدارة badge) — different from the navy member bubbles.
- **Entry points:** Chat → الخاص → member; and the member brief popup in the directory gets a **✉️ مراسلة** button.
- **Notifications:** the app-wide listener also watches the user's threads (`members array-contains uid`) and badges the Chat tab with total unread.
- **Privacy:** DMs are readable *only* by the two participants (rules-enforced). Admins cannot read others' DMs — deliberate: this is a majlis of friends, and admin DM power = messaging anyone, not surveillance. Moderation still works because recipients can report/block.

## 5. Security architecture (V2 posture)

- **XSS:** `UI.el` text-node rendering everywhere; no dynamic `innerHTML`.
- **CSP (V2 hardened):** inline scripts extracted to `js/boot.js` → `script-src` drops `'unsafe-inline'`; `img-src` narrowed from `https:` to the media worker origin. CSP now actually blocks injected-script exfiltration instead of just gesturing at it.
- **Server-side authz:** Firestore rules (in-repo copy: `firestore.rules`) + worker token re-validation. Client checks are UX only.
- **PII:** phones out of all member-readable docs (see §3.3). Residual: none known after V2 migration (old docs retain phone until they age out; new writes are clean).
- **Media:** private R2 + short-lived signed URLs; nosniff + attachment disposition; MIME allowlist on upload.
- **Known accepted risks:** GitHub Pages can't send security headers (no frame-ancestors — meta CSP can't express it); no rate limiting on uploads/AI (Cloudflare free tier option documented); maintenance mode is cosmetic UX, not access control.

## 6. Implementation plan (phased, each phase shippable)

1. **Phase A — privacy migration (uid identity):** chat/messages, checkins, splits, events, polls, moderation → uid; new `firestore.rules`; publish rules; SW v67.
2. **Phase B — DMs:** `js/modules/dm.js` + chat segmented UI + directory "مراسلة" + styles + rules for `dms`; SW v68.
3. **Phase C — CSP + native shell fixes:** `js/boot.js`, `js/native.js`, index.html CSP, install.js guard, drop unused firebase-storage script; SW v69.
4. **Phase D — store resubmission:** `sync-web.sh` → Xcode archive (Aziz) → version 1.1 (2) → reply in Resolution Center with a fix list + updated notes.
5. **Phase E — verify:** `node --check` all files, live-deploy probe, signed-out Firestore probes (read/write denials), device pass on chat + DMs.

**Rollback:** every phase is a git commit; GitHub Pages serves the previous commit on revert; SW auto-update propagates rollbacks the same way it propagates releases.

## 7. What was deliberately NOT changed

- No framework/bundler (owner must be able to read every file).
- No Firebase Storage return (R2 is cheaper and Google-independent — owner's explicit choice).

## 8. 2026-07-18 — join-flow + directory bug fixes

**Reported symptoms:** new people couldn't join; members added by the admin didn't show up in the member directory; the admin's member list and the public directory disagreed; no admin/co-admin badges in the directory; the Apple review account showed up like a real member.

**Root cause #1 (the actual "can't join" bug):** `index.html` loads `js/auth.js` — which calls `firebase.initializeApp()`, but only after `DOMContentLoaded` — *before* `js/notify.js`, `js/chat-notify.js`, and `js/push.js`, which each call `firebase.auth()` at their own `<script>` parse time (i.e. *during* initial HTML parsing, while `document.readyState` is still `'loading'`, well before `DOMContentLoaded` fires). Every page load threw `Firebase: No Firebase App '[DEFAULT]' has been created`, permanently killing those modules' listeners for the rest of the page session — most importantly `notify.js`'s real-time admin badge/notification for new join requests. Join requests were actually being submitted and reaching `pending` status fine; the admin simply never found out one existed unless they happened to open the Admin tab and look. **Fix:** `js/auth.js` now calls `Auth.init()` immediately instead of deferring to `DOMContentLoaded` — `firebase.initializeApp()` has no DOM dependency, and `renderBox()`'s DOM queries already no-op safely if the elements aren't in the DOM yet (and get retried from the async `onAuthStateChanged` callback regardless).

**Root cause #2 (directory mismatch):** `members` (phone-keyed, admin-managed, gates login) and `directory` (uid-keyed, self-service — a member only gets a `directory` doc once *they themselves* open the Members section) are independent collections with no code path syncing them. An admin-approved or admin-added member who hasn't opened the app yet correctly has no `directory` entry — by design, just not a design anyone had told the admin about. **Fix:** admin actions (`approve`, `openAdd`, `openEdit` in `js/modules/admin.js`) now also seed/update a placeholder `directory` doc keyed by **phone** (`role`, `name`, `placeholder:true`). `js/modules/profile.js`'s `ensureMine()` migrates that placeholder into the member's real uid-keyed doc the first time they open the app (and deletes the placeholder — `firestore.rules`' `directory` delete rule now also allows `uid == ph()` for this self-cleanup). The public directory (`profile.js`) already just reads the whole `directory` collection, so placeholders show up immediately with no separate query.

**Role badges + reviewer exclusion:** the directory card/brief now render an Admin/Co-Admin badge (`roleBadge()` in `profile.js`, mirroring `admin.js`'s own `badgeFor()`); plain members show none. The App Review demo account (`REVIEWER_PHONE = '+966555555555'`, same constant already used for gift-code exclusion in `admin.js`) is tagged `role:'reviewer'` wherever a directory doc for it is created, and `profile.js` filters those out of the public list — it also proactively deletes its own directory doc if the currently signed-in user resolves to that phone.

SW bumped to v95.
- No push notifications yet (needs APNs + a sender — the only piece that genuinely wants a server; revisit if Apple demands more "native" justification).
- Group chat keeps its 150-message window (Firestore read economics).
- `whitelabel/` template unaffected; V2 changes should be ported there separately.
