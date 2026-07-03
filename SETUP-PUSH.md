# Push notifications — activation (one paste step for Aziz)

Everything is coded and deployed except ONE secret that only you should handle.
Until it's done, the app works exactly as before (pushes just don't send).

## What's already done
- `js/push.js` + `firebase-messaging-sw.js` — each member's device registers itself
  when they turn on the 🔔 bell in the Chat tab (works on Android/desktop browsers
  and on iPhones that added the app to the Home Screen, iOS 16.4+).
- Chat + private messages automatically request a push to the right people.
- `worker/aldewaniah-push-worker.js` — the sender. Verifies the caller is an
  approved member, then delivers via Firebase Cloud Messaging.
- Firestore rules for `fcmTokens` published. VAPID web-push key generated.

## Your steps (5 minutes, once)
1. **Get the service-account key** (this is a SECRET — don't share it):
   Firebase console → ⚙️ Project settings → **Service accounts** →
   **Generate new private key** → a `.json` file downloads.
2. **Create the worker**: Cloudflare dashboard (Mulhaqdb@gmail.com) →
   Workers & Pages → Create → "Start with Hello World" → name it
   **aldewaniah-push** → Deploy. Then tell Claude "worker created" — Claude will
   paste the worker code from `worker/aldewaniah-push-worker.js` for you.
3. **Add the two variables**: worker → Settings → Variables and Secrets:
   - `FIREBASE_PROJECT` (Text) = `aldewaniah-45158`
   - `SERVICE_ACCOUNT` (**Secret**) = open the downloaded .json in TextEdit,
     select all, copy, paste the WHOLE thing as the value.
4. Tell Claude — it will verify `/health`, send a test push, and confirm
   end-to-end delivery.

## Native iOS app push (stage 2 — after Apple approves 1.1)
The App Store build needs APNs: an APNs key from the developer portal uploaded
to Firebase, the `@capacitor/push-notifications` plugin, and a new build (3).
Deliberately NOT done now so the in-review build stays untouched.
