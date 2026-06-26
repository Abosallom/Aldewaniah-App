/* ===========================================================
   Times (الأوقات) — live clock + Umm al-Qura (Hijri) & Gregorian
   date + prayer times + a dynamic Qibla (Kaaba) compass. City
   selectable.  Clock/date/Qibla work offline; prayer times via
   Aladhan API (method 4 = Umm Al-Qura), cached for offline.
   =========================================================== */
(function () {
  const CITY_KEY = 'aldewaniah.prayerCity';
  const cacheKey = (id) => 'aldewaniah.prayer.' + id;
  const KAABA = { lat: 21.4225, lon: 39.8262 };
  let timer = null, orientHandler = null;

  const CITIES = [
    { id: 'makkah', ar: 'مكة المكرمة', en: 'Makkah', city: 'Makkah', country: 'Saudi Arabia', lat: 21.3891, lon: 39.8579 },
    { id: 'madinah', ar: 'المدينة المنورة', en: 'Madinah', city: 'Medina', country: 'Saudi Arabia', lat: 24.4686, lon: 39.6142 },
    { id: 'riyadh', ar: 'الرياض', en: 'Riyadh', city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753 },
    { id: 'jeddah', ar: 'جدة', en: 'Jeddah', city: 'Jeddah', country: 'Saudi Arabia', lat: 21.4858, lon: 39.1925 },
    { id: 'dammam', ar: 'الدمام', en: 'Dammam', city: 'Dammam', country: 'Saudi Arabia', lat: 26.4207, lon: 50.0888 },
    { id: 'khobar', ar: 'الخبر', en: 'Khobar', city: 'Khobar', country: 'Saudi Arabia', lat: 26.2794, lon: 50.2083 },
    { id: 'buraidah', ar: 'بريدة', en: 'Buraidah', city: 'Buraidah', country: 'Saudi Arabia', lat: 26.3260, lon: 43.9750 },
    { id: 'taif', ar: 'الطائف', en: 'Taif', city: 'Taif', country: 'Saudi Arabia', lat: 21.2854, lon: 40.4243 },
    { id: 'abha', ar: 'أبها', en: 'Abha', city: 'Abha', country: 'Saudi Arabia', lat: 18.2169, lon: 42.5053 },
    { id: 'tabuk', ar: 'تبوك', en: 'Tabuk', city: 'Tabuk', country: 'Saudi Arabia', lat: 28.3838, lon: 36.5550 },
    { id: 'hail', ar: 'حائل', en: 'Hail', city: 'Hail', country: 'Saudi Arabia', lat: 27.5114, lon: 41.7208 },
    { id: 'kuwait', ar: 'الكويت', en: 'Kuwait City', city: 'Kuwait City', country: 'Kuwait', lat: 29.3759, lon: 47.9774 },
    { id: 'doha', ar: 'الدوحة', en: 'Doha', city: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.5310 },
    { id: 'manama', ar: 'المنامة', en: 'Manama', city: 'Manama', country: 'Bahrain', lat: 26.2285, lon: 50.5860 },
    { id: 'dubai', ar: 'دبي', en: 'Dubai', city: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708 }
  ];
  const PRAYERS = [
    { k: 'Fajr', ar: 'الفجر', en: 'Fajr' }, { k: 'Sunrise', ar: 'الشروق', en: 'Sunrise' },
    { k: 'Dhuhr', ar: 'الظهر', en: 'Dhuhr' }, { k: 'Asr', ar: 'العصر', en: 'Asr' },
    { k: 'Maghrib', ar: 'المغرب', en: 'Maghrib' }, { k: 'Isha', ar: 'العشاء', en: 'Isha' }
  ];

  function getCity() {
    let id; try { id = localStorage.getItem(CITY_KEY); } catch (e) {}
    return CITIES.find((c) => c.id === id) || CITIES[2];
  }
  const to12 = (hhmm, lang) => {
    const p = (hhmm || '').split(':'); let h = +p[0] || 0; const m = p[1] || '00';
    const ap = h < 12 ? (lang === 'ar' ? 'ص' : 'AM') : (lang === 'ar' ? 'م' : 'PM');
    let hh = h % 12; if (hh === 0) hh = 12; return hh + ':' + m + ' ' + ap;
  };
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  function qibla(lat, lon) {
    const f1 = rad(lat), f2 = rad(KAABA.lat), dL = rad(KAABA.lon - lon);
    const y = Math.sin(dL);
    const x = Math.cos(f1) * Math.tan(f2) - Math.sin(f1) * Math.cos(dL);
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  const norm180 = (a) => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };

  // ---- Shared core (so the maintenance/pause page can show prayer times + Qibla too) ----
  function tzNowMinutes(tz) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    return (+parts.find((p) => p.type === 'hour').value) * 60 + (+parts.find((p) => p.type === 'minute').value);
  }
  function nextKey(timings, tz) {
    if (!timings) return null;
    const m = (hhmm) => { const p = (hhmm || '0:0').split(':'); return (+p[0]) * 60 + (+p[1]); };
    const now = tzNowMinutes(tz);
    return ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].find((k) => m(timings[k]) > now) || 'Fajr';
  }
  function loadTimings(city, cb) {
    let timings = null, tz = 'Asia/Riyadh';
    try { const cached = JSON.parse(localStorage.getItem(cacheKey(city.id)) || 'null'); if (cached) { timings = cached.timings; tz = cached.tz || tz; } } catch (e) {}
    if (timings && cb) cb(timings, tz, true);
    const url = 'https://api.aladhan.com/v1/timingsByCity?city=' + encodeURIComponent(city.city) +
      '&country=' + encodeURIComponent(city.country) + '&method=4';
    fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((d) => {
      const t = d.data.timings, z = (d.data.meta && d.data.meta.timezone) || tz;
      try { localStorage.setItem(cacheKey(city.id), JSON.stringify({ timings: t, tz: z })); } catch (e) {}
      if (cb) cb(t, z, false);
    }).catch(() => { if (cb) cb(timings, tz, false, true); });
  }
  window.PrayerCore = { CITIES, PRAYERS, KAABA, getCity, to12, qibla, norm180, nextKey, loadTimings };

  Sections.add({
    id: 'times',
    title: { ar: 'الأوقات', en: 'Times' },
    subtitle: { ar: 'الوقت والتاريخ ومواقيت الصلاة والقبلة', en: 'Clock, date, prayer & Qibla' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    strings: {
      ar: {
        tm_title: 'الأوقات والمواقيت', tm_sub: 'الوقت والتاريخ الهجري ومواقيت الصلاة والقبلة',
        tm_city: 'المدينة', tm_loading: 'جارٍ تحميل المواقيت…',
        tm_err: 'تعذّر تحميل مواقيت الصلاة (تحقق من الاتصال)',
        tm_qibla: 'القبلة', tm_enable: 'تفعيل البوصلة',
        tm_from_north: 'من الشمال', tm_heading: 'اتجاهك',
        tm_hint: 'لُف بجهازك حتى يشير سهم الكعبة للأعلى', tm_hint_north: 'وجّه أعلى الجهاز نحو الشمال ثم اتبع السهم',
        tm_aligned: 'أنت متجه نحو القبلة'
      },
      en: {
        tm_title: 'Time & Prayer', tm_sub: 'Clock, Hijri date, prayer times & Qibla',
        tm_city: 'City', tm_loading: 'Loading times…',
        tm_err: 'Could not load prayer times (check connection)',
        tm_qibla: 'Qibla', tm_enable: 'Enable compass',
        tm_from_north: 'from North', tm_heading: 'Heading',
        tm_hint: 'Turn until the Kaaba arrow points straight up', tm_hint_north: 'Point the top of the device North, then follow the arrow',
        tm_aligned: 'You are facing the Qibla'
      }
    },

    render(view) {
      if (timer) { clearInterval(timer); timer = null; }
      if (orientHandler) { try { window.removeEventListener('deviceorientationabsolute', orientHandler); window.removeEventListener('deviceorientation', orientHandler); } catch (e) {} orientHandler = null; }

      view.appendChild(UI.pageTitle(I18n.t('tm_title'), I18n.t('tm_sub')));
      const root = UI.el('div', { class: 'tm' });
      view.appendChild(root);

      let tz = 'Asia/Riyadh', timings = null, heading = null, wasAligned = false;
      const lang = () => (I18n.lang === 'ar' ? 'ar' : 'en');

      const sel = UI.el('select');
      CITIES.forEach((c) => sel.appendChild(UI.el('option', { value: c.id }, I18n.pick(c))));
      sel.value = getCity().id;
      sel.onchange = () => { try { localStorage.setItem(CITY_KEY, sel.value); } catch (e) {} load(); paintQibla(); };
      root.appendChild(UI.el('div', { class: 'tm-cityrow' }, [UI.el('label', null, I18n.t('tm_city')), sel]));

      const clock = UI.el('div', { class: 'tm-clock' });
      const greg = UI.el('div', { class: 'tm-greg' });
      const hijri = UI.el('div', { class: 'tm-hijri' });
      root.appendChild(UI.el('div', { class: 'tm-clockcard' }, [clock, hijri, greg]));

      const pray = UI.el('div', { class: 'tm-pray' });
      root.appendChild(pray);

      // ---- Qibla compass (dynamic) ----
      const rose = UI.el('div', { class: 'qibla-rose' }, [
        UI.el('span', { class: 'qibla-tick n' }, I18n.lang === 'ar' ? 'ش' : 'N'),
        UI.el('span', { class: 'qibla-tick e' }, I18n.lang === 'ar' ? 'ق' : 'E'),
        UI.el('span', { class: 'qibla-tick s' }, I18n.lang === 'ar' ? 'ج' : 'S'),
        UI.el('span', { class: 'qibla-tick w' }, I18n.lang === 'ar' ? 'غ' : 'W')
      ]);
      const needle = UI.el('div', { class: 'qibla-needle', html:
        '<svg viewBox="0 0 60 210" width="60" height="210"><polygon points="30,4 46,54 30,42 14,54" fill="#722F37"/><line x1="30" y1="42" x2="30" y2="150" stroke="#1A2744" stroke-width="3"/><g transform="translate(30,156)"><rect x="-15" y="-15" width="30" height="30" rx="3" fill="#1A2744"/><rect x="-15" y="-3" width="30" height="7" fill="#C2A050"/><rect x="-5" y="-15" width="10" height="11" fill="#C2A050"/></g></svg>' });
      const ahead = UI.el('div', { class: 'qibla-ahead' });
      const hub = UI.el('div', { class: 'qibla-hub' });
      const dial = UI.el('div', { class: 'qibla-dial' }, [rose, needle, ahead, hub]);
      const readout = UI.el('div', { class: 'qibla-readout' });
      const aligned = UI.el('div', { class: 'qibla-aligned' });
      const hint = UI.el('div', { class: 'tm-note' });
      const enableBtn = UI.el('button', { class: 'btn btn-block', style: 'margin-top:8px', onclick: enableCompass }, '🧭 ' + I18n.t('tm_enable'));
      root.appendChild(UI.el('div', { class: 'qibla-card' }, [
        UI.el('h3', { class: 'card-title', style: 'text-align:center' }, I18n.t('tm_qibla')),
        dial, readout, aligned, hint, enableBtn
      ]));

      function paintQibla() {
        const c = getCity();
        const q = qibla(c.lat, c.lon);
        const rel = heading == null ? q : (q - heading);
        needle.style.transform = 'translate(-50%,-50%) rotate(' + rel + 'deg)';
        rose.style.transform = 'rotate(' + (heading == null ? 0 : -heading) + 'deg)';
        let txt = I18n.t('tm_qibla') + ' ' + Math.round(q) + '° ' + I18n.t('tm_from_north');
        if (heading != null) txt += '  •  ' + I18n.t('tm_heading') + ' ' + Math.round(((heading % 360) + 360) % 360) + '°';
        readout.textContent = txt;
        const isAligned = heading != null && Math.abs(norm180(rel)) <= 7;
        dial.classList.toggle('aligned', isAligned);
        aligned.textContent = isAligned ? ('🕋 ' + I18n.t('tm_aligned') + ' ✓') : '';
        hint.textContent = heading == null ? I18n.t('tm_hint_north') : (isAligned ? '' : I18n.t('tm_hint'));
        if (isAligned && !wasAligned) { try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {} }
        wasAligned = isAligned;
      }
      function onOrient(e) {
        let h = null;
        if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
        else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
        if (h != null) { heading = h; paintQibla(); }
      }
      function startListening() {
        orientHandler = onOrient;
        window.addEventListener('deviceorientationabsolute', orientHandler, true);
        window.addEventListener('deviceorientation', orientHandler, true);
        enableBtn.style.display = 'none';
      }
      function enableCompass() {
        const DOE = window.DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === 'function') {
          DOE.requestPermission().then((s) => { if (s === 'granted') startListening(); }).catch(() => {});
        } else { startListening(); }
      }

      function tick() {
        if (!document.body.contains(clock)) { clearInterval(timer); timer = null; return; }
        const now = new Date();
        try {
          clock.textContent = new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-SA' : 'en-GB',
            { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
          hijri.textContent = new Intl.DateTimeFormat((lang() === 'ar' ? 'ar-SA' : 'en-US') + '-u-ca-islamic-umalqura',
            { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', era: 'short' }).format(now);
          greg.textContent = new Intl.DateTimeFormat(lang() === 'ar' ? 'ar' : 'en-GB',
            { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
        } catch (e) { clock.textContent = now.toLocaleTimeString(); }
        if (timings) highlightNext();
      }

      function nowMinutesInTz() {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        return (+parts.find((p) => p.type === 'hour').value) * 60 + (+parts.find((p) => p.type === 'minute').value);
      }
      const mins = (hhmm) => { const p = (hhmm || '0:0').split(':'); return (+p[0]) * 60 + (+p[1]); };

      function paintPrayers() {
        pray.innerHTML = '';
        if (!timings) { pray.appendChild(UI.el('div', { class: 'tm-note' }, I18n.t('tm_loading'))); return; }
        PRAYERS.forEach((p) => pray.appendChild(UI.el('div', { class: 'tm-prow', 'data-k': p.k }, [
          UI.el('span', { class: 'tm-pname' }, I18n.pick(p)),
          UI.el('span', { class: 'tm-ptime' }, to12(timings[p.k], lang()))
        ])));
        highlightNext();
      }
      function highlightNext() {
        if (!timings) return;
        const now = nowMinutesInTz();
        const order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        const nextK = order.find((k) => mins(timings[k]) > now) || 'Fajr';
        pray.querySelectorAll('.tm-prow').forEach((el) => el.classList.toggle('next', el.getAttribute('data-k') === nextK));
      }

      async function load() {
        const c = getCity();
        try { const cached = JSON.parse(localStorage.getItem(cacheKey(c.id)) || 'null'); if (cached) { timings = cached.timings; tz = cached.tz || tz; } } catch (e) {}
        paintPrayers(); tick();
        try {
          const url = 'https://api.aladhan.com/v1/timingsByCity?city=' + encodeURIComponent(c.city) +
            '&country=' + encodeURIComponent(c.country) + '&method=4';
          const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
          const d = await r.json();
          timings = d.data.timings; tz = (d.data.meta && d.data.meta.timezone) || tz;
          try { localStorage.setItem(cacheKey(c.id), JSON.stringify({ timings, tz })); } catch (e) {}
          paintPrayers(); tick();
        } catch (e) { if (!timings) pray.innerHTML = '<div class="tm-note auth-err">' + I18n.t('tm_err') + '</div>'; }
      }

      paintQibla();
      load();
      timer = setInterval(tick, 1000);
    }
  });
})();
