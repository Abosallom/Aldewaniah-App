# Native phone (SMS) login in the iOS app — setup

**Why:** Inside the app, Google's reCAPTCHA (required by the web phone-login) can't run, so SMS login only works on the website. This makes SMS work **directly in the app** by verifying the device through Apple Push (APNs) instead of reCAPTCHA.

**What I already did (in code):**
- Added the `@capacitor-firebase/authentication` plugin to `mobile/package.json`.
- Configured it in `mobile/capacitor.config.json` (`skipNativeAuth: true`, phone provider).
- Rewrote the phone-login path in `js/auth.js` so that **in the app** it uses the native plugin (APNs, no reCAPTCHA) and finishes sign-in on the web SDK; **on the website** it's unchanged (reCAPTCHA). Feature-detected, so nothing breaks either way.

**What still needs doing** (needs your Apple/Firebase accounts + Mac + a real iPhone). Do these in order.

---

## 1. Register an iOS app in Firebase (gives `GoogleService-Info.plist`)

Firebase console → Project **aldewaniah-45158** → ⚙️ Project settings → **Your apps** → **Add app → iOS**.
- **Apple bundle ID:** `com.aldewaniah.app` (must match exactly)
- App nickname: `Aldewaniah iOS` (anything)
- Register → **Download `GoogleService-Info.plist`**.
- Put that file at: `mobile/ios/App/App/GoogleService-Info.plist`
  (You can skip the rest of Firebase's "add SDK" wizard — the plugin handles it.)

*(I can click through the registration with you in the console; you handle the file download/placement.)*

## 2. Create an APNs Auth Key (so Firebase can send the silent verification push)

Apple Developer → **Certificates, Identifiers & Profiles → Keys → +**.
- Name: `Aldewaniah APNs`
- Tick **Apple Push Notifications service (APNs)** → Continue → Register.
- **Download the `.p8` key file** (you can only download it ONCE — keep it safe). Note the **Key ID**.
- Also note your **Team ID**: `84U5WFJU67`.

> The `.p8` is a secret — please keep it yourself; I won't handle it.

## 3. Upload the APNs key to Firebase

Firebase console → ⚙️ Project settings → **Cloud Messaging** → under **Apple app configuration** → **APNs Authentication Key → Upload**.
- Upload the `.p8`, enter the **Key ID** and **Team ID** (`84U5WFJU67`). Save.

## 4. Confirm Phone sign-in is enabled

Firebase → Authentication → **Sign-in method** → **Phone** = Enabled. (It already is — the website SMS works.)

## 5. Install the plugin on your Mac

Open **Terminal**, then:
```
cd "/Users/aziz/Claude/Projects/Aldewaniah App/mobile"
npm run sync-web          # copies the latest web app (with the new auth.js) into www
npm install               # installs the new plugin
npx cap sync ios          # installs the native pod + wires the plugin
```

## 6. Xcode settings (one-time)

Open the project: `npx cap open ios` (or open `mobile/ios/App/App.xcworkspace`).
- Drag **`GoogleService-Info.plist`** into the **App** target (check "Copy items if needed", target = App).
- Select the **App** target → **Signing & Capabilities → + Capability**, add:
  - **Push Notifications**
  - **Background Modes** → tick **Remote notifications**
- In **`GoogleService-Info.plist`** find **`REVERSED_CLIENT_ID`** (a value like `com.googleusercontent.apps.XXXX`). Then target **App → Info → URL Types → +** and paste that value into **URL Schemes**.

## 7. Build to a REAL iPhone and test

- APNs (and therefore this login) **does not work in the Simulator** — use a physical iPhone.
- Bump the build number, then Product → Archive (or run to your device) and open the app.
- Login → **Phone** tab → enter a Saudi number → you should receive a real SMS and sign in. 🎉

---

## Notes
- **Existing members / the App Review demo** keep working — email login is unchanged, and I left email as the default tab in the app.
- **New members** can now sign up with their phone directly in the app (no need to use the website first).
- This needs a **new build + App Store resubmit** once tested. (The current build 1.1 (4) already in review does NOT include this — it's the login fix only.)
- Non-Saudi numbers are still blocked by the Firebase **SMS region policy** (Allow = Saudi Arabia only). Tell me if you want to allow other Gulf countries and I'll add them.
