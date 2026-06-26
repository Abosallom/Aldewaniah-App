/* ===========================================================
   App core — module registry + router + UI helpers.

   ADDING A NEW FEATURE (the whole point of this architecture):
   1. Create js/modules/yourfeature.js
   2. Inside it call:
        App.registerModule({
          id: 'yourfeature',
          icon: '<svg.../>',                 // bottom-nav icon
          title: { ar: 'العنوان', en: 'Title' },
          render(view) { ... }               // paint into the <main> element
        });
   3. Add <script src="js/modules/yourfeature.js"></script> to index.html
   That's it — it appears in the nav and routing automatically.
   =========================================================== */
(function () {
  const modules = [];
  const navBadges = {};
  let current = null;

  const App = {
    /** Feature modules call this to plug themselves in. */
    registerModule(mod) {
      if (!mod || !mod.id) throw new Error('Module needs an id');
      if (mod.strings) I18n.extend(mod.strings);
      modules.push(mod);
    },

    modules() { return modules.slice(); },

    /** Navigate to a module by id (updates the hash). */
    go(id) {
      if (location.hash !== '#' + id) { location.hash = id; }
      else { this._render(id); }
    },

    /** Re-render the current view (e.g. after login state changes). */
    refresh() { if (current) this._render(current); },

    /** Show a small count badge on a nav tab (e.g., pending join requests). */
    setNavBadge(id, n) { navBadges[id] = n; this._paintNav(); },

    _render(id) {
      let mod = modules.find((m) => m.id === id) || modules[0];
      if (!mod) return;
      if (mod.adminOnly && !(window.Auth && Auth.isStaff && Auth.isStaff())) mod = modules[0];
      if (mod.memberOnly && !(window.Auth && Auth.isMember && Auth.isMember())) mod = modules[0];
      current = mod.id;
      const view = document.getElementById('view');
      view.innerHTML = '';
      view.className = 'view fade-in';
      // force reflow so the animation replays on each navigation
      void view.offsetWidth;
      view.classList.add('fade-in');
      mod.render(view);
      this._paintNav();
    },

    _paintNav() {
      const nav = document.getElementById('nav');
      nav.innerHTML = '';
      modules
        .filter((m) => !(m.adminOnly && !(window.Auth && Auth.isStaff && Auth.isStaff())))
        .filter((m) => !(m.memberOnly && !(window.Auth && Auth.isMember && Auth.isMember())))
        .forEach((m) => {
        const btn = document.createElement('button');
        btn.className = 'nav-item' + (m.id === current ? ' active' : '');
        btn.innerHTML = `${m.icon}<span>${I18n.pick(m.title)}</span>`;
        if (navBadges[m.id] > 0) {
          const b = document.createElement('span');
          b.className = 'nav-badge';
          b.textContent = navBadges[m.id] > 9 ? '9+' : String(navBadges[m.id]);
          btn.appendChild(b);
        }
        btn.onclick = () => App.go(m.id);
        nav.appendChild(btn);
      });
    },

    start() {
      I18n.apply();
      // language toggle
      const toggle = document.getElementById('langToggle');
      if (toggle) toggle.onclick = () => I18n.toggle();
      I18n.onChange(() => { this._render(current || (modules[0] && modules[0].id)); });

      window.addEventListener('hashchange', () => {
        this._render(location.hash.slice(1));
      });

      const initial = location.hash.slice(1) || (modules[0] && modules[0].id);
      this._render(initial);
    }
  };

  /* ----------------- shared UI helpers (used by modules) -------- */
  const UI = {
    /** Tiny hyperscript: el('div', {class:'x', onclick:fn}, [children|text]) */
    el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach((k) => {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node[k.toLowerCase()] = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
      [].concat(children || []).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
      return node;
    },

    pageTitle(text, sub) {
      const frag = document.createDocumentFragment();
      frag.appendChild(UI.el('h1', { class: 'page-title' }, text));
      if (sub) frag.appendChild(UI.el('p', { class: 'page-sub' }, sub));
      return frag;
    },

    empty(text) {
      return UI.el('div', { class: 'empty', html:
        `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M8 13h8M9 9h.01M15 9h.01"/></svg>
         <div>${text || I18n.t('empty_generic')}</div>` });
    },

    initials(name) {
      return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    },

    /** Open a modal with a built form. fields: [{name,label,type,required,options}] */
    modal(titleText, fields, onSubmit) {
      const backdrop = UI.el('div', { class: 'modal-backdrop' });
      const close = () => backdrop.remove();
      backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

      const form = UI.el('form');
      fields.forEach((f) => {
        const wrap = UI.el('div', { class: 'field' });
        wrap.appendChild(UI.el('label', null, f.label + (f.required ? ' *' : '')));
        let input;
        if (f.type === 'textarea') input = UI.el('textarea', { name: f.name });
        else if (f.type === 'select') {
          input = UI.el('select', { name: f.name });
          (f.options || []).forEach((o) => input.appendChild(UI.el('option', { value: o.value }, o.label)));
        } else input = UI.el('input', { name: f.name, type: f.type || 'text' });
        if (f.required) input.required = true;
        if (f.value != null) input.value = f.value;
        wrap.appendChild(input);
        form.appendChild(wrap);
      });

      const actions = UI.el('div', { class: 'flex-between', style: 'margin-top:8px;gap:10px' }, [
        UI.el('button', { type: 'button', class: 'btn btn-ghost', onclick: close }, I18n.t('cancel')),
        UI.el('button', { type: 'submit', class: 'btn' }, I18n.t('save'))
      ]);
      actions.style.justifyContent = 'flex-end';
      form.appendChild(actions);

      form.onsubmit = (e) => {
        e.preventDefault();
        const data = {};
        new FormData(form).forEach((v, k) => { data[k] = v; });
        Promise.resolve(onSubmit(data)).then(() => close());
      };

      const modal = UI.el('div', { class: 'modal' }, [UI.el('h3', null, titleText), form]);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      const first = form.querySelector('input,textarea,select');
      if (first) first.focus();
    },

    confirm(text, onYes) {
      if (window.confirm(text || I18n.t('confirmDelete'))) onYes();
    },

    /** Locale-aware date formatting. */
    fmtDate(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return d.toLocaleDateString(I18n.lang === 'ar' ? 'ar' : 'en-GB',
        { year: 'numeric', month: 'short', day: 'numeric' });
    }
  };

  window.App = App;
  window.UI = UI;
})();
