# Aldewaniah App — Project Documentation

_Last updated: 25 June 2026._ A complete reference for the Aldewaniah (الديوانية) app — the code (offline) and every hosted service it depends on (online). Written so anyone (or a future session) can pick the project up and keep building.

> **Secrets are intentionally NOT in this file.** Anything sensitive (the Cloudflare Worker signing secret, the test-login OTP code, billing details) lives only in the Firebase / Cloudflare consoles. This doc tells you *where* each lives, not the value.

---

## 1. What the app is

A bilingual (Arabic RTL / English) **Progressive Web App (PWA)** for the Aldewaniah group (friends + relatives). It is **one codebase that is both the website and the installable app**, mirroring the original aldewaniah.com.

- **Live URL (share this one):** https://app.aldewaniah.com — shows no "github".
- **Tech:** plain HTML + CSS + vanilla JavaScript. No build step, no framework. Hosted as static files on GitHub Pages.
- **Works offline** (service worker caches the app shell) and can be **added to the home screen**.

### Theme (brand colours, from aldewaniah.com)
- Cream `#F5F0E6` · Navy `#1A2744` · Maroon `#722F37` · Gold `#C2A050` · Ink `#1D1E20`
- Fonts: **Tajawal** (Arabic) / **DM Sans** (English). Defined as CSS variables at the top of `css/styles.css`.

---

## 2. Features (what's built)

| Area | What it does | Who can use it |
|---|---|---|
| **Home** | Signed-out → welcome + "Sign in" button. Signed-in → **Check-in page**: tap to mark attendance today; live list of who's here today; undo. | Everyone (check-in = members) |
| **Tournaments (البطولات)** | 4 Ramadan Baloot editions, each embeds its live bracket (Challonge / BracketHQ). | Everyone |
| **Sections (الأقسام)** | A container tab holding sub-features (cards). | Everyone |
| → **Gallery (مكتبة الصور)** | Members upload photos/videos; full-screen swipe viewer; uploader/admin can delete. Media stored on **Cloudflare R2** (not Google). | Members only |
| → **Baloot calculator (حاسبة بلوت)** | Score sheet to 152: two totals + dealer arrow, central احسب button, two entry circles (2 digits auto-jumps to the other), دق الولد, صكات tally, undo, new game, stats. Saved locally. | Everyone |
| → **Buzzer (البازر)** | Local **peer-to-peer** quiz buzzer over the same WiFi (WebRTC). Host makes a room code; members/guests join by name; host arms rounds + plays; order by host clock. | Everyone (guests via anonymous sign-in) |
| **Admin / staff panel (الإدارة)** | Approve/decline join requests; add/edit/remove members; set roles & permissions; full **check-in log** (all days). | Admin + Co-Admins (scoped) |
| **Member login** | Phone number + SMS OTP (Firebase). New users request to join → admin approves. Stays logged in across restarts. | — |

**Roles:** `Admin` (everything) · `Co-Admin` (only the permissions the admin grants — currently "approve join requests") · `Member`. Co-Admins see the admin tab with only their permitted section.

---

## 3. Offline — the codebase

### 3.1 Where the code lives
- **Local folder:** `/Users/aziz/Claude/Projects/Aldewaniah App`
- **GitHub repo:** `Abosallom/Aldewaniah-App` (public), branch `main`, served by **GitHub Pages** from the repo root.

### 3.2 File / folder structure
```
Aldewaniah App/
├─ index.html              ← loads all scripts; <script> order = nav order
├─ manifest.json           ← PWA manifest (name, icons, theme)
├─ sw.js                   ← service worker (offline cache). BUMP CACHE ON EVERY DEPLOY.
├─ css/styles.css          ← all styles + theme variables (:root)
├─ assets/icon.svg         ← app/brand icon
├─ js/
│  ├─ firebase-config.js   ← public Firebase web config + databaseURL + default country code
│  ├─ i18n.js              ← AR/EN strings engine + RTL handling
│  ├─ store.js             ← localStorage data layer (swappable)
│  ├─ content.js           ← editable content (tournaments, contact email)
│  ├─ app.js              ← module registry + hash router + UI helpers (UI.el, UI.modal, …)
│  ├─ auth.js              ← member login (phone OTP), roles/permissions, anonymous sign-in
│  └─ modules/
│     ├─ home.js           ← sign-in / check-in page
│     ├─ tournaments.js    ← bracket embeds
│     ├─ sections.js       ← Sections tab + sub-section registry (window.Sections)
│     ├─ gallery.js        ← gallery (R2-backed)  [sub-section]
│     ├─ baloot.js         ← Baloot calculator    [sub-section]
│     ├─ buzzer.js         ← WebRTC buzzer         [sub-section]
│     ├─ contact.js        ← Contact (NOT loaded anymore; kept for reference)
│     └─ admin.js          ← admin/staff panel
└─ worker/
   └─ aldewaniah-media-worker.js  ← source of the Cloudflare Worker (R2 gallery API)
```

### 3.3 Architecture (how it fits together)
- **Module registry + router** (`app.js`): each top-nav feature calls `App.registerModule({ id, title, icon, render, adminOnly? })`. The bottom nav and hash routing are built automatically. Nav order = order of `<script>` tags in `index.html`.
- **Sub-sections** (`sections.js`): defines `window.Sections.add({ id, title, subtitle, icon, memberOnly?, strings, render })`. **`sections.js` must load before** `gallery.js` / `baloot.js` / `buzzer.js`. They render into the view with a back button (no deep routing).
- **i18n** (`i18n.js`): `I18n.t('key')`, `I18n.pick({ar,en})`, `I18n.extend({...})`, `I18n.toggle()`. RTL is automatic for Arabic.
- **UI helpers** (`app.js`): `UI.el(tag, attrs, children)` (tiny hyperscript), `UI.modal(title, fields, onSubmit)`, `UI.confirm`, `UI.pageTitle`, `UI.initials`, `UI.fmtDate`.
- **Auth** (`auth.js`): `Auth.isMember()`, `Auth.isAdmin()`, `Auth.can(perm)`, `Auth.isStaff()`, `Auth.role()`, `Auth.member()`, `Auth.phone()`, `Auth.getDb()`, `Auth.openLogin()`, `Auth.logout()`.

### 3.4 Adding a new feature (the whole point of the design)
1. Create `js/modules/yourfeature.js` and call `App.registerModule({...})` (top-nav) **or** `Sections.add({...})` (a card inside Sections).
2. Add `<script src="js/modules/yourfeature.js"></script>` to `index.html` (after `sections.js` if it's a sub-section).
3. Add the filename to the `ASSETS` array in `sw.js` and **bump the cache version**.

### 3.5 Adding a Co-Admin permission later
Three small edits: (a) add the key to `PERMS` in `auth.js`; (b) add a toggle field in the edit-member modal in `admin.js` and gate the relevant section with `Auth.can('yourperm')`; (c) add a matching check in the Firestore rules (mirror `canRequests()`).

---

## 4. Online — hosted services

### 4.1 GitHub + GitHub Pages (hosting)
- Repo `Abosallom/Aldewaniah-App`, public. Pages serves `main` branch root.
- A `CNAME` file in the repo holds `app.aldewaniah.com` (GitHub Pages custom domain).
- After a push, Pages rebuilds in ~1–3 minutes.

### 4.2 Domain + DNS (Cloudflare)
- Domain **aldewaniah.com** owned on Hostinger + Cloudflare. DNS is managed at **Cloudflare** (account **Mulhaqdb@gmail.com**, zone aldewaniah.com).
- **app.aldewaniah.com** → CNAME → `abosallom.github.io` (set to **DNS-only / grey cloud**).
- **apex aldewaniah.com** still serves the old Hostinger Website Builder site. (Could later be pointed at the app too.)

### 4.3 Firebase (project `aldewaniah-45158`, Google account az.alsaloom@gmail.com)
Console: https://console.firebase.google.com/project/aldewaniah-45158
- **Authentication:** Phone (SMS OTP) + **Anonymous** (for buzzer guests) + Email/Password. Authorized domain includes `app.aldewaniah.com`. SMS region policy = allow Saudi Arabia. A **test number** with a fixed code is registered for the owner (bypasses SMS/captcha/limits — value is in the console, not here).
- **Cloud Firestore** collections:
  - `members/{phoneE164}` = `{ name, status:'pending'|'approved', admin:bool, perms:{}, createdAt }` (legacy `approved:true` also honored). Co-Admin = `perms.requests:true`.
  - `gallery` — legacy metadata (gallery media now lives on R2; this may be unused going forward).
  - `checkins/{phoneDigits_YYYY-M-D}` = `{ phone, name, day, at }`.
- **Firestore rules (published):** helper fns `ph()`, `signedIn()`, `approved()`, `isAdmin()`, `canRequests()`. members: get own-or-admin; list if canRequests; create self-pending or admin; update/delete admin OR co-admin on pending docs. checkins: read if approved; create own; delete admin/owner. gallery: read approved; create own; delete admin/owner.
- **Realtime Database** (URL `https://aldewaniah-45158-default-rtdb.firebaseio.com`): used **only** as the WebRTC signaling handshake for the buzzer. Rules: `/buzz/$room` read/write if `auth != null`; everything else denied.
- **Cloud Storage:** still enabled but **no longer used** for the gallery (media moved to R2). Safe to ignore.
- **Billing:** Blaze (pay-as-you-go) with a small budget **alert** (no hard cap exists in GCP). Real SMS, RTDB, etc. stay within free tiers at family scale.

### 4.4 Cloudflare R2 + Worker (private gallery media)
Same Cloudflare account as DNS (**Mulhaqdb@gmail.com**, account id `d6aa72c20788a7032fe7ff92fe60fd9e`).
- **R2 bucket:** `aldewaniah-media` (private, Standard class, free tier 10 GB).
- **Worker:** `aldewaniah-media` → **https://aldewaniah-media.mulhaqdb.workers.dev**. Source in repo: `worker/aldewaniah-media-worker.js`.
  - Routes: `GET /health`, `GET /list` (auth), `POST /upload` (auth), `POST /delete` (auth), `GET /file?key&exp&sig` (HMAC-signed link used by `<img>`/`<video>`).
  - **Bindings (Cloudflare → Worker → Settings):** `BUCKET` (R2 → aldewaniah-media), `FIREBASE_PROJECT` (plain = `aldewaniah-45158`), `SIGN_SECRET` (secret — value only in console).
  - **Auth model:** the app sends the member's Firebase ID token; the Worker confirms membership by reading the member's Firestore doc *with that token*, so only approved members can upload/list/delete. Files are served via short-lived signed URLs so the bucket stays private.

### 4.5 Editing the Worker code (no CLI / credentials needed)
The dashboard editor is a cross-origin iframe, so you can't paste normally. Trick used: open Worker → Edit code; inject a button that copies the code via `navigator.clipboard.writeText` on a real click (pass the code in as base64 → `decodeURIComponent(escape(atob(b64)))`), click it, then click the editor → Cmd+A → Cmd+V → Deploy.

---

## 5. Deploy workflow (how changes go live)

Aziz is non-technical and learning; deploys go through **GitHub Desktop** (his auth):
1. Edit files in the local folder.
2. **Bump the cache version** in `sw.js` (e.g. `aldewaniah-v18` → `v19`) and add any new file to its `ASSETS` list. _This is what makes phones pick up the update._
3. Commit (done in the sandbox during sessions; or in GitHub Desktop).
4. In **GitHub Desktop** → **Push origin**.
5. Wait ~1–3 min for GitHub Pages, then **reload the app once** (twice if needed) to activate the new service worker.

**Current service worker cache version: `aldewaniah-v18`.**

Firebase rules, RTDB rules, R2, Worker, and auth providers are changed in their **web consoles**, not via the repo.

---

## 6. Known notes & gotchas
- **One reload after each deploy** is normal — the service worker serves the old cached version until it updates. The SW intentionally does **not** cache cross-origin calls (R2 Worker, Firebase, fonts) so live data is always fresh.
- **iPhone PWAs** can clear a web app's storage after ~7 days of *not opening it at all*, which forces a re-login. Apple rule; unavoidable.
- **Captcha sometimes appears at login** — that's Google's risk-based invisible reCAPTCHA; it can't be fully disabled on the web (only reduced with reCAPTCHA Enterprise).
- **Buzzer needs a WiFi that allows device-to-device** links (most home WiFi is fine; some guest/public networks block it → shows a "couldn't connect" notice).
- **auth.js ignores anonymous sign-ins** in its auth-state listener — otherwise guest buzzer sign-in would re-render and kick people out.
- **Buzzer identity** uses a per-tab `sessionStorage` id (not the Firebase uid, which is shared across tabs in one browser).

---

## 7. Accounts summary (logins live with Aziz)
- **GitHub:** account that owns `Abosallom/Aldewaniah-App`.
- **Firebase / Google:** `az.alsaloom@gmail.com` → project `aldewaniah-45158`.
- **Cloudflare:** `Mulhaqdb@gmail.com` → DNS (aldewaniah.com) + R2 + Worker + Realtime DB.
- **Hostinger:** owns the domain + the old apex website.

---

## 8. Open ideas / possible next steps
- Add more **Co-Admin permissions** (manage members, view check-in log, manage check-ins) — framework is ready.
- **Check-in enhancements:** history browsing by date for members, filter the admin log by member/date, notify when someone checks in.
- Point **apex aldewaniah.com** at the app (retire the Hostinger Builder site) if desired.
- **reCAPTCHA Enterprise** to reduce login captcha frequency.
- Buzzer extras: scoreboard/points, sound effects, lock-after-first-buzz mode.
- Tidy up: remove the now-unused Firebase Storage + `gallery` Firestore collection once confirmed not needed.

---

_This file is safe to keep privately or in the repo (it contains no secrets). To resume work, hand this document to a new session along with the goal._
