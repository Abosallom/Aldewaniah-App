# الديوانية — iOS App Store publishing guide

This wraps the existing web app (https://app.aldewaniah.com) into a native iOS app
using **Capacitor**, then submits it to the App Store. Everything here runs on your
**Mac** and needs your **Apple Developer account** to be active first.

The web app, Firebase, and the Cloudflare Workers stay exactly as they are — the iOS
app simply loads the same app inside a native shell and adds the native bits Apple
expects (camera, microphone, location, push).

---

## 0) Prerequisites (one time, on your Mac)
- **Apple Developer Program** membership (you applied — wait for approval).
- **Xcode** (from the Mac App Store) + open it once to install components.
- **CocoaPods**: `sudo gem install cocoapods`
- **Node.js** (you already have it for this project).

---

## 1) Build the iOS project (in the `mobile/` folder)
A ready Capacitor setup is in `mobile/`. In Terminal:

```bash
cd "Aldewaniah App/mobile"
npm install
npm run sync-web          # copies the web app into mobile/www
npx cap add ios           # creates the Xcode project (first time only)
npx cap sync ios
npx cap open ios          # opens Xcode
```

After any future web change, just run: `npm run sync-web && npx cap sync ios`.

---

## 2) Add the permission descriptions (Xcode → Info)
Apple **rejects** apps that use a capability without explaining why. In Xcode, open
the **App target → Info** tab and add these keys (or paste into `Info.plist`):

| Key | Suggested text |
|---|---|
| `NSCameraUsageDescription` | لالتقاط الصور والفيديو لمشاركتها في الدردشة. / To take photos and videos to share in chat. |
| `NSMicrophoneUsageDescription` | لتسجيل الرسائل الصوتية ومقاطع الفيديو. / To record voice and video notes. |
| `NSPhotoLibraryUsageDescription` | لاختيار صورة لملفك الشخصي أو المعرض. / To choose a photo for your profile or the gallery. |
| `NSLocationWhenInUseUsageDescription` | للتحقق من وجودك في الديوانية عند تسجيل الحضور فقط. / Only to verify you are at the Dewaniah when checking in. |

---

## 3) App identity & signing (Xcode)
- **Bundle Identifier:** `com.aldewaniah.app` (already set in `capacitor.config.json`).
- **Display name:** الديوانية
- Signing: select your **Team** (your Apple Developer account) → "Automatically manage signing."
- **App icon:** drop a 1024×1024 PNG into the asset catalog (use `assets/icon-512.png`
  upscaled, or generate a full set with `npx @capacitor/assets generate --ios`).

---

## 4) Known gotchas to handle BEFORE submitting (ask me to do these)
These are because the app talks to Firebase + Cloudflare from inside a web view:

1. **Cloudflare Worker CORS** — the media & AI Workers currently allow only
   `app.aldewaniah.com` + `abosallom.github.io`. Inside iOS the origin is
   `capacitor://localhost`, which would be blocked (photos / voice / video / AI would fail).
   **Fix:** add `capacitor://localhost` to `ALLOWED_ORIGINS` in both Workers and redeploy.
   *(Tell me when you start the build and I’ll do this.)*

2. **Phone (SMS) login inside the web view** — Firebase phone OTP relies on reCAPTCHA,
   which is unreliable inside a WKWebView. Two options:
   - Simple: tell members to use **email + password** login inside the iOS app
     (already supported, works in the web view).
   - Proper: add the native `@capacitor-firebase/authentication` plugin for phone OTP
     (more work). *(I can set this up when needed.)*

3. **Push notifications** — web notifications don’t work in the iOS web view. If you want
   real iOS push later, we add `@capacitor/push-notifications` + APNs. Not required to ship.

---

## 5) App Store Connect (create the listing)
At https://appstoreconnect.apple.com → **My Apps → +**:
- **Name:** الديوانية (Al Dewaniah) · **Bundle ID:** com.aldewaniah.app
- **Category:** Social Networking
- **Privacy Policy URL:** `https://app.aldewaniah.com/privacy.html`  ✅ (already live)
- **Support URL:** `https://app.aldewaniah.com`
- **Age rating:** answer the questionnaire (the app has unmoderated-by-default user chat →
  expect a 17+ or "infrequent/mild" depending on answers; report/block + admin moderation
  are already in the app, which is what Apple looks for).
- **Privacy “nutrition” labels — declare data collected & linked to the user:**
  - Contact Info: **Name, Phone number, Email** (app functionality).
  - User Content: **Photos/Videos, Audio, Messages** (app functionality).
  - Location: **Precise location** — used for **App Functionality only, NOT tracking**
    (check-in verification; not stored).
  - Identifiers: user ID.
  - "Used for tracking": **No.** "Data is not used for third-party advertising."
- **Screenshots:** at least 6.7" iPhone (1290×2796). Capture from the app (home,
  tournaments, chat, sections, members).
- **Export compliance:** uses standard HTTPS encryption → usually "exempt."

---

## 5b) Make it UNLISTED (download-by-link only, not searchable)
Apple supports **Unlisted App Distribution**: the app is on the App Store but does **not**
appear in search, charts, categories, or recommendations — it’s reachable **only via its
direct App Store link**, which you share with the group. This is the right fit for a private
diwaniya app.

How to get it:
1. First get the app **approved** for normal release (submit + pass review as in §7). The app
   does not have to be "Ready for Sale"; once it’s approved you can request unlisted.
2. Request unlisted distribution here: **https://developer.apple.com/contact/request/unlisted-app-distribution**
   (sign in with your developer account; give the app name + Apple ID number from App Store Connect).
3. Apple emails an **unlisted distribution link** (usually a few days). That link is the only
   way to find/install the app — share it with members; it won’t show up in search.

Notes:
- Unlisted apps still go through normal review (so §6 demo account still applies).
- Alternative for quick private sharing while you wait: **TestFlight** public link (up to 10,000
  testers) — but TestFlight builds expire every 90 days, so Unlisted is better for the long term.
- Keep the **age rating** honest; unlisted doesn’t change review standards.

---

## 6) ⭐ App Review notes — REQUIRED (or it WILL be rejected)
The app is **invite-only with admin approval**, so a reviewer can’t get in on their own.
In **App Review Information → Notes**, give them a working way in:

> This is a private group app. To review, please sign in with this demo account:
> Login method: **Email** → email: `<create a demo email/password member and put it here>`
> (Or phone test number `+966 5… …` with code `……` if you keep a Firebase test number.)
> After signing in you’ll see Home/Check-in, Tournaments, Chat, Sections, and Members.

Create one demo member (email login) in advance and approve it, so the reviewer has full access.

---

## 7) Build → Archive → Upload
In Xcode: select **Any iOS Device** → Product → **Archive** → **Distribute App → App Store
Connect → Upload**. Then in App Store Connect attach the build to the version and **Submit for Review**.

---

## Quick status
- ✅ In-app **account deletion**, **Privacy Policy + Terms**, **report/block + admin reports**, manifest, icons — all done & live.
- ⏳ Needs you: Apple account approval, then run §1–§3, give me the go to do §4.1 (Worker CORS), create the demo account for §6, fill §5, then §7.
