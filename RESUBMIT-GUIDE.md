# Resubmit to the App Store — version 1.1 (build 2)

Everything in the code is done. These are the only steps left, in order.

## 1. Push the website update (2 minutes)
1. Open **GitHub Desktop** — you'll see the commit "V2: private DMs…" already made.
2. Click **Push origin**.
3. Wait ~5 minutes, then open https://app.aldewaniah.com — pull to refresh twice. You should see the Chat tab now has **المجموعة | الخاص** at the top.

## 2. Build the new iOS app in Xcode (10 minutes)
The web files are already synced into the iOS project and the version is already bumped to **1.1 (build 2)**.
1. Open **Xcode** → open `mobile/ios/App/App.xcworkspace` (the white icon).
2. Top bar device selector → **Any iOS Device (arm64)**.
3. Menu **Product → Archive**. (If keychain popups appear, click **Always Allow**.)
4. In the Organizer window: **Distribute App → App Store Connect → Upload** → keep defaults → Upload.
5. Wait for the email "build processed" (~10–30 min).

## 3. In App Store Connect (5 minutes)
1. Go to appstoreconnect.apple.com → **Aldewaniah** → the rejected 1.0 version.
2. Change the version number field to **1.1**.
3. In the **Build** section, remove the old build and select the new **1.1 (2)**.
4. Update the **"What's New"** / description if asked — you can write: "Private member-to-member messages, official admin messages, privacy improvements."
5. In **App Review Information → Notes**, replace the notes with the text below.
6. Reply in the **Resolution Center** thread (App Review page) with the reply below, then **Submit for Review**.

### App Review notes (paste this)
```
Aldewaniah is a PRIVATE, invite-only app for one specific social group
(a Gulf "diwaniya" — a weekly friends' majlis). Membership is approved
by the group admin, which is why sign-in is required for most features.

DEMO ACCOUNT (pre-approved member):
  Email: reviewer@aldewaniah.com
  Password: AppleSupport
Please use the EMAIL sign-in tab ("البريد الإلكتروني / Email").

Member features to review after signing in:
- Chat tab: group chat (photos, hold-to-record voice/video notes) and
  NEW in 1.1 — private 1-to-1 messages ("الخاص" tab), where messages
  from the group admin appear in a distinct official style.
- Home: attendance check-in (optionally geofenced by the admin).
- Sections (الأقسام): member directory, gallery, prayer times + Qibla
  compass, shared calendar, polls, expense splitting, Baloot & Trix
  score calculators, quiz buzzer, AI assistant.
- Account panel (tap your name, top right): link email, and DELETE
  ACCOUNT (in-app account deletion).
- UGC safeguards: every message/profile has Report (⚑) and Block (🚫);
  admins moderate within 24h. EULA: https://app.aldewaniah.com/terms.html
  Privacy: https://app.aldewaniah.com/privacy.html

The UI is Arabic-first (the group's language); tap "EN" in the header
for English.
```

### Resolution Center reply (adjust to match their exact objections)
```
Thank you for the review. We've addressed the concerns in the new
build 1.1 (2):

1. Native experience: version 1.1 removes all website-style elements
   from the app and adds a major app-native feature — private
   1-to-1 member messaging with official admin messages — alongside
   the existing native interactions (hold-to-record voice/video
   notes, offline support, haptics, full-screen chat).
2. The demo account (reviewer@aldewaniah.com / AppleSupport, email
   sign-in) is pre-approved and exercises every member feature.
3. In-app account deletion is available from the account panel
   (tap the member name in the header → حذف حسابي / Delete account).
4. This is a private club app for a single real-world social group;
   membership is intentionally invite-only and admin-approved.

Please let us know if anything else is needed.
```

## 4. After approval
Request **Unlisted App Distribution** (link-only, not searchable): the message form was already prepared at developer.apple.com/contact → Distribution → Other Distribution Questions → "Send us a message" — open it and click **Send message**.

---
**Note:** if Apple's rejection letter cited anything beyond the standard
web-wrapper/demo-account/deletion concerns, tell Claude the exact text and
the reply above will be tailored to quote and answer each cited guideline.
