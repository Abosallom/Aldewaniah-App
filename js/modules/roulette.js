/* ===========================================================
   Lucky Roulette (عجلة الحظ) — a decision spin-wheel.
   Add options, spin the wheel, it lands on a random one.
   Entries are saved locally. Works offline. Open to everyone.
   Inspired by the "Lucky Roulette" decision game.
   =========================================================== */
(function () {
  const KEY = 'aldewaniah.roulette.v1';
  const COLORS = ['#1A2744', '#722F37', '#C2A050', '#2e7d5b', '#34506e', '#a8863c'];
  const darkText = (hex) => !(hex === '#C2A050' || hex === '#a8863c'); // gold needs dark text

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.items) return s; } catch (e) {}
    return { items: ['أحمد', 'سعود', 'فهد', 'عبدالله'], removeWinner: false };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  const pt = (cx, cy, r, deg) => [cx + r * Math.cos((deg - 90) * Math.PI / 180), cy + r * Math.sin((deg - 90) * Math.PI / 180)];

  Sections.add({
    id: 'roulette',
    title: { ar: 'عجلة الحظ', en: 'Lucky Roulette' },
    subtitle: { ar: 'اكتب الخيارات ودوّر العجلة', en: 'Add options & spin the wheel' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>',
    strings: {
      ar: {
        rl_title: 'عجلة الحظ', rl_sub: 'اكتب الخيارات ودوّر العجلة لاختيار واحد',
        rl_spin: 'دوّر', rl_spinning: 'يدور…', rl_winner: 'الفائز',
        rl_add: 'أضف', rl_ph: 'اكتب خياراً…', rl_need: 'أضف خيارين على الأقل للّعب',
        rl_options: 'الخيارات', rl_remove_winner: 'احذف الفائز بعد الدوران', rl_again: 'دوّر مرة أخرى'
      },
      en: {
        rl_title: 'Lucky Roulette', rl_sub: 'Add options and spin to pick one',
        rl_spin: 'Spin', rl_spinning: 'Spinning…', rl_winner: 'Winner',
        rl_add: 'Add', rl_ph: 'Type an option…', rl_need: 'Add at least two options to play',
        rl_options: 'Options', rl_remove_winner: 'Remove winner after spin', rl_again: 'Spin again'
      }
    },

    render(view) {
      const s = load();
      let rotation = 0, spinning = false;
      view.appendChild(UI.pageTitle(I18n.t('rl_title'), I18n.t('rl_sub')));
      const root = UI.el('div', { class: 'rl' });
      view.appendChild(root);

      const wheelWrap = UI.el('div', { class: 'rl-wheelwrap' });
      const wheel = UI.el('div', { class: 'rl-wheel' });
      const pointer = UI.el('div', { class: 'rl-pointer' });
      const hub = UI.el('div', { class: 'rl-hub', html: '<img src="assets/icon-192.png" alt="">' });
      wheelWrap.appendChild(wheel); wheelWrap.appendChild(pointer); wheelWrap.appendChild(hub);
      wheel.onclick = spin;
      root.appendChild(wheelWrap);

      const winner = UI.el('div', { class: 'rl-winner', style: 'display:none' });
      root.appendChild(winner);

      const spinBtn = UI.el('button', { class: 'btn btn-green btn-block rl-spin', onclick: spin }, '🎯 ' + I18n.t('rl_spin'));
      root.appendChild(spinBtn);

      // editor
      const chips = UI.el('div', { class: 'rl-chips' });
      const input = UI.el('input', { type: 'text', placeholder: I18n.t('rl_ph'), maxlength: '24' });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
      const editor = UI.el('div', { class: 'rl-edit' }, [
        UI.el('h3', { class: 'card-title' }, I18n.t('rl_options')),
        UI.el('div', { class: 'rl-addrow' }, [input, UI.el('button', { class: 'btn', onclick: addItem }, I18n.t('rl_add'))]),
        chips,
        UI.el('label', { class: 'row', style: 'gap:8px;margin-top:10px;cursor:pointer' }, [
          (function () { const c = UI.el('input', { type: 'checkbox' }); c.checked = !!s.removeWinner; c.onchange = () => { s.removeWinner = c.checked; save(s); }; return c; })(),
          UI.el('span', null, I18n.t('rl_remove_winner'))
        ])
      ]);
      root.appendChild(editor);

      function addItem() {
        const v = (input.value || '').trim();
        if (!v) return;
        s.items.push(v); input.value = ''; save(s); paintChips(); buildWheel();
      }
      function removeItem(i) { s.items.splice(i, 1); save(s); paintChips(); buildWheel(); }
      function paintChips() {
        chips.innerHTML = '';
        s.items.forEach((it, i) => chips.appendChild(UI.el('span', { class: 'rl-chip' }, [
          UI.el('span', null, it),
          UI.el('button', { title: '×', onclick: () => removeItem(i) }, '×')
        ])));
      }

      function buildWheel() {
        const n = s.items.length;
        if (n < 2) { wheel.innerHTML = ''; wheelWrap.style.opacity = '.5'; return; }
        wheelWrap.style.opacity = '1';
        const seg = 360 / n, cx = 160, cy = 160, r = 158;
        let paths = '', labels = '';
        for (let i = 0; i < n; i++) {
          const a0 = i * seg, a1 = a0 + seg;
          const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
          const large = seg > 180 ? 1 : 0;
          const col = COLORS[i % COLORS.length];
          paths += `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${col}" stroke="#fffdf8" stroke-width="1.5"/>`;
          const mid = a0 + seg / 2;
          const [lx, ly] = pt(cx, cy, r * 0.62, mid);
          let rot = mid; if (mid > 90 && mid < 270) rot += 180;
          const txt = (s.items[i].length > 11 ? s.items[i].slice(0, 10) + '…' : s.items[i]);
          labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})" fill="${darkText(col) ? '#F5F0E6' : '#1A2744'}" font-size="15" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(txt)}</text>`;
        }
        wheel.innerHTML = `<svg viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg"><circle cx="160" cy="160" r="159" fill="#fffdf8"/>${paths}${labels}</svg>`;
      }
      function escapeHtml(t) { return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

      function spin() {
        const n = s.items.length;
        if (spinning || n < 2) return;
        spinning = true; winner.style.display = 'none';
        spinBtn.disabled = true; spinBtn.textContent = I18n.t('rl_spinning');
        const seg = 360 / n;
        const win = Math.floor(Math.random() * n);
        const center = win * seg + seg / 2;            // angle of winner center from top, clockwise
        const targetMod = (360 - center) % 360;
        const currentMod = ((rotation % 360) + 360) % 360;
        let delta = (targetMod - currentMod + 360) % 360;
        const jitter = (Math.random() - 0.5) * seg * 0.5;
        rotation += 5 * 360 + delta + jitter;
        wheel.style.transition = 'transform 4.6s cubic-bezier(0.16,1,0.3,1)';
        wheel.style.transform = 'rotate(' + rotation + 'deg)';
        setTimeout(() => {
          spinning = false; spinBtn.disabled = false; spinBtn.textContent = '🎯 ' + I18n.t('rl_again');
          winner.textContent = '🎉 ' + I18n.t('rl_winner') + ': ' + s.items[win];
          winner.style.display = 'block';
          try { if (navigator.vibrate) navigator.vibrate(80); } catch (e) {}
          if (s.removeWinner && s.items.length > 2) { s.items.splice(win, 1); save(s); paintChips(); buildWheel(); rotation = rotation % 360; wheel.style.transition = 'none'; wheel.style.transform = 'rotate(' + rotation + 'deg)'; }
        }, 4700);
      }

      paintChips();
      buildWheel();
    }
  });
})();
