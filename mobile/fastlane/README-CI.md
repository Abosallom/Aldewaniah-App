# الديوانية — Mac-free TestFlight CI

This is the cloud alternative to the manual Xcode flow in
[`IOS-PUBLISH-GUIDE.md`](../../IOS-PUBLISH-GUIDE.md). GitHub Actions builds the
iOS app on a macOS runner and uploads it to **TestFlight** — you trigger it from
any machine (no Mac needed). It **never** submits for App Store review;
promoting a build to the public App Store stays the existing manual App Store
Connect action.

- Workflow: [`.github/workflows/ios-release.yml`](../../.github/workflows/ios-release.yml)
- Lane: `mobile/fastlane/Fastfile` (`fastlane beta`)
- Uploads to the TestFlight **internal** group **"Diwaniya Testers"** only.

The lane works from a fresh checkout even though `mobile/ios/` is not committed:
it runs `npx cap add ios`, then deterministically re-applies the three things a
pristine Capacitor template loses — the Info.plist permission strings, the real
1024×1024 app icon (from `mobile/ios-resources/AppIcon.appiconset/`, avoiding the
placeholder-icon rejection), and manual signing — before archiving.

---

## 1) Required GitHub repo secrets

Add these under **Settings → Secrets and variables → Actions → New repository
secret**. Names must match exactly.

| Secret | What it is / how to get it |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect → **Users and Access → Integrations → App Store Connect API** → **+** → name **"Fastlane CI"**, role **App Manager**. Copy the **Key ID** shown on that page. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | The **Issuer ID** shown at the top of that same Integrations page. |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | Download the `.p8` **once** (Apple only lets you download it once), then base64 it: `base64 -i AuthKey_XXXXXX.p8` — paste that output. |
| `BUILD_CERTIFICATE_BASE64` | base64 of a **`.p12`** containing a Distribution certificate + its private key. Apple's portal never lets you export an *existing* cert's private key (Keychain Access, Mac-only, is normally the only way) — so on Windows, generate a **new** Distribution cert + key entirely via OpenSSL instead (safe: Apple allows multiple active distribution certs, the already-published 1.2 build is unaffected). See "Generating a new distribution cert on Windows" below. |
| `P12_PASSWORD` | The password you choose during the `.p12` export step below. |
| `PROVISIONING_PROFILE_BASE64` | base64 of the **"Aldewaniah App Store"** `.mobileprovision`, re-downloaded from developer.apple.com **after** adding the new certificate to that profile (see below): `base64 -i AldewaniahAppStore.mobileprovision`. |

### Generating a new distribution cert on Windows (no Mac needed)

Run in **Git Bash** (not PowerShell — OpenSSL ships with Git for Windows):

```bash
openssl genrsa -out distribution.key 2048
MSYS_NO_PATHCONV=1 openssl req -new -key distribution.key -out distribution.csr \
  -subj "/emailAddress=you@example.com/CN=Your Name/C=SA"
```

Then at developer.apple.com → Certificates, Identifiers & Profiles → Certificates → **+** →
**Apple Distribution** → upload `distribution.csr` → download the resulting `.cer`.

Add that new certificate to the **"Aldewaniah App Store"** profile (Profiles → that profile →
Edit → check the new cert alongside/instead of the old one → Save → Download), then:

```bash
openssl x509 -inform DER -in distribution.cer -out distribution.pem -outform PEM
openssl pkcs12 -export -legacy -inkey distribution.key -in distribution.pem \
  -out distribution.p12 -passout pass:CHOOSE_A_PASSWORD
base64 -i distribution.p12   # -> BUILD_CERTIFICATE_BASE64
base64 -i AldewaniahAppStore.mobileprovision   # -> PROVISIONING_PROFILE_BASE64
```

(`-legacy` improves compatibility with Fastlane's `import_certificate` on some OpenSSL 3.x
builds; drop it if your OpenSSL doesn't recognize the flag.) Delete `distribution.key`,
`distribution.csr`, `.cer`, `.pem`, and `.p12` locally once the secrets are saved in GitHub —
nothing here needs to be committed to the repo.
| `KEYCHAIN_PASSWORD` | Any random string — it's just the password for a throwaway CI keychain that is deleted after every run. |

Authentication is via the ASC API key only (no Apple ID / 2FA on CI). The `.p8`
is never written to disk — it is passed as base64 env content. Only the `.p12`
and `.mobileprovision` touch disk, and only under the runner's temp dir, deleted
in the final `if: always()` step.

> **Gemfile.lock:** committed as `mobile/Gemfile` only for now. The first CI run
> generates `mobile/Gemfile.lock` via bundler; commit that file afterward so
> later builds pin the same Fastlane version.

---

## 2) How to trigger

- **GitHub UI:** Actions → **"iOS TestFlight release"** → **Run workflow**
  (optionally type a marketing version, e.g. `1.3`; leave blank to keep the
  current App Store version).
- **Tag:** `git tag ios-v1.3 && git push origin ios-v1.3`.

Either way, tag pushes and dispatches do **not** trigger the Pages deploy
(`deploy.yml` only runs on branch pushes to `main`).

---

## 3) When to actually trigger it

The shipped iOS app loads `https://app.aldewaniah.com` **live** (see
ARCHITECTURE-V2.md §3.5). So ordinary web/JS/CSS fixes ship to the iOS app the
moment they're live on the web via the normal Pages deploy — **no iOS build
needed**.

Run this workflow only when **native** things change:

- Info.plist permissions / usage descriptions,
- Capacitor plugins or the Capacitor version,
- entitlements,
- `mobile/capacitor.config.json`,
- the app icon,

or to **periodically refresh TestFlight** (internal builds expire after 90 days).

---

## 4) What it does / does not do

- **Does:** archive a signed Release build and upload it to the TestFlight
  internal group **"Diwaniya Testers"**. Build number is read straight from App
  Store Connect (max of the live build and the latest TestFlight build, +1), so a
  fresh checkout with no local history is always correct.
- **Does NOT:** submit for App Store review, and does not use external
  TestFlight distribution (which would trigger beta review). Publishing to the
  public App Store remains the manual App Store Connect flow.

---

## Note — reproducibility

Committing `mobile/ios/` to git would let CI reproduce the shipped app exactly;
the lane works either way (it adds the iOS project only if missing).
