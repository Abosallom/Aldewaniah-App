# الديوانية · Al Dewaniah App

A bilingual (Arabic RTL / English LTR) Progressive Web App for the Aldewaniah group of friends and relatives. Built to be **extended easily** — new features and services plug in without touching existing code.

Theme colors are taken live from [aldewaniah.com](https://aldewaniah.com): cream `#F5F0E6`, navy `#1A2744`, maroon `#722F37`, gold `#C2A050`, ink `#1D1E20`.

## Running it

It's a static web app — no build step.

- **Quick look:** open `index.html` in a browser.
- **Proper way (enables install + offline):** serve the folder over HTTP, e.g.
  ```
  cd "Aldewaniah App"
  python3 -m http.server 8080
  ```
  then visit `http://localhost:8080`. On a phone, use "Add to Home Screen" to install it like an app.

## What's inside (v1)

- **Updates** — announcements / news feed for the group.
- **Events** — gatherings with date, location, and RSVP count.
- **Members** — directory with name, mobile (tap to call), and role, plus search.

Each member can switch the whole interface between Arabic and English with the toggle in the top bar. Data is saved on the device (localStorage) for now — see "Connecting a backend" to share data across members.

## Project structure

```
index.html            App shell + script load order
manifest.json         PWA metadata (name, icon, colors)
sw.js                 Service worker (offline cache)
assets/icon.svg       App icon (dallah — coffee pot)
css/styles.css        Theme + layout
js/i18n.js            Bilingual strings + RTL/LTR switching
js/store.js           Swappable data layer (localStorage today)
js/app.js             Core: module registry, router, UI helpers
js/modules/           One file per feature (feed, events, members)
```

## Adding a new feature (the important part)

Every feature is a self-contained module. To add one — say a "Suggestions box":

1. Create `js/modules/suggestions.js`:
   ```js
   (function () {
     App.registerModule({
       id: 'suggestions',
       title: { ar: 'المقترحات', en: 'Suggestions' },
       icon: '<svg viewBox="0 0 24 24" ...></svg>',   // bottom-nav icon
       strings: {
         ar: { sug_title: 'المقترحات' },
         en: { sug_title: 'Suggestions' }
       },
       render(view) {
         view.appendChild(UI.pageTitle(I18n.t('sug_title')));
         // ...build the screen using UI.* helpers and Store.*
       }
     });
   })();
   ```
2. Add one line to `index.html`:
   ```html
   <script src="js/modules/suggestions.js"></script>
   ```
3. Add it to the `ASSETS` list in `sw.js` so it caches offline.

The feature now appears automatically in the bottom navigation and routing. Nothing else changes.

### Helpers available to modules

- `UI.el(tag, attrs, children)` — build DOM nodes.
- `UI.pageTitle(text, subtitle)` — standard page header.
- `UI.modal(title, fields, onSubmit)` — pop a form (`fields: [{name,label,type,required,options}]`).
- `UI.empty(text)`, `UI.confirm(text, onYes)`, `UI.fmtDate(ts)`, `UI.initials(name)`.
- `I18n.t(key)`, `I18n.pick({ar,en})`, `I18n.lang`, `I18n.dir`.
- `Store.list / get / add / update / remove / subscribe / seedIfEmpty` (all async).

## Connecting a backend (to share data between members)

Right now data lives on each device. To sync it across everyone, replace the internals of `js/store.js` with a real service (Firebase, Supabase, or your own API) while keeping the **same 6 method names**: `list, get, add, update, remove, subscribe`. Because every feature only talks to `Store`, no module code needs to change.

Example sketch with Supabase:
```js
window.Store = {
  async list(c)         { const {data} = await sb.from(c).select('*').order('createdAt',{ascending:false}); return data; },
  async add(c, rec)     { const {data} = await sb.from(c).insert(rec).select().single(); return data; },
  async update(c,id,p)  { const {data} = await sb.from(c).update(p).eq('id',id).select().single(); return data; },
  async remove(c, id)   { await sb.from(c).delete().eq('id', id); },
  // ...get, subscribe
};
```

## Notes & possible next features

Ideas that drop in cleanly with the module pattern: Suggestions box (matching the website form), Photo album, Polls/voting, Contributions/dues tracker, Push notifications for events.
