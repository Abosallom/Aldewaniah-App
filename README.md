# الديوانية · Al Dewaniah

A bilingual (Arabic RTL / English) Progressive Web App that mirrors **aldewaniah.com** — one codebase for both the website and the installable app. Theme colors come from the site: cream `#F5F0E6`, navy `#1A2744`, maroon `#722F37`, gold `#C2A050`.

## Sections (mirrors the website)

- **Home** — welcome hero (`حياك الله في الديوانية`), tagline, and the "share your idea" form.
- **Tournaments** — the Ramadan Baloot tournaments. Each one embeds its **live** bracket from Challonge / BracketHQ, so standings stay in sync with the bracket service.
- **Gallery** — members-only photo area (locked until phone-number login is added).
- **Contact** — email and footer.

## Editing content (no coding needed)

Almost everything you'd change day-to-day lives in **`js/content.js`**:

- **Add / edit a tournament:** copy a block in `tournaments`, set the name and the bracket's embed URL (from Challonge or BracketHQ). It appears automatically with its own card.
- **Change the contact email:** edit `contact.email`.

## Running it

Static site, no build step. Open `index.html`, or serve the folder:

```
cd "Aldewaniah App"
python3 -m http.server 8080
```

Hosted free on GitHub Pages. To publish updates: in GitHub Desktop, **Commit to main** → **Push origin**. The live site refreshes about a minute later.

## Project structure

```
index.html            App shell + script load order
manifest.json         PWA metadata
sw.js                 Service worker (offline cache)
css/styles.css        Theme + layout
js/i18n.js            Bilingual strings + RTL/LTR
js/content.js         >>> EDIT THIS <<< tournaments, contact, form
js/store.js           Swappable local data layer (used later)
js/app.js             Core: module registry, router, UI helpers
js/modules/           One file per section: home, tournaments, gallery, contact
```

## Adding a new section

Create `js/modules/yourthing.js`, call `App.registerModule({ id, title:{ar,en}, icon, render(view){…} })`, then add a `<script>` line in `index.html` and the path to `ASSETS` in `sw.js`. It appears in the bottom navigation automatically.

## Coming next: member login (OTP) + active directory

Planned with **Firebase**: phone-number login via one-time SMS code, and an admin-managed allowlist ("active directory") of approved members. Login will gate member-only areas (starting with the Gallery). The `gallery.js` module already checks an `Auth.isMember()` hook, so wiring auth in won't disturb the public pages.
