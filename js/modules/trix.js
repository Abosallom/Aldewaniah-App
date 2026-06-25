/* ===========================================================
   Trix calculator (حاسبة لعبة تركس) — score tracker for the
   4-player Trix card game. Pick a contract each hand, enter the
   result, and totals are computed automatically.

   Scoring (common Gulf values):
   - ملك الكبة (King of Hearts): taker −75
   - البنات (Queens): −25 each (×4)
   - الديناري (Diamonds): −10 each (×13)
   - اللطوش (Tricks): −15 each (×13)
   - تركس (Trix ladder): 1st +200, 2nd +150, 3rd +100, 4th +50
   Highest total wins. Saved locally. Open to everyone.
   =========================================================== */
(function () {
  const KEY = 'aldewaniah.trix.v1';
  const TRIX_PTS = [200, 150, 100, 50];

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.players) return s; } catch (e) {}
    return { players: ['لاعب ١', 'لاعب ٢', 'لاعب ٣', 'لاعب ٤'], rounds: [] };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  Sections.add({
    id: 'trix',
    title: { ar: 'حاسبة تركس', en: 'Trix Calculator' },
    subtitle: { ar: 'احسب نقاط لعبة تركس', en: 'Trix card-game score sheet' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="12" height="16" rx="2"/><rect x="8" y="5" width="12" height="16" rx="2" fill="#fffdf8"/><path d="M14 9l-2 3 2 3 2-3z" fill="currentColor" stroke="none"/></svg>',
    strings: {
      ar: {
        tx_title: 'حاسبة تركس', tx_sub: 'اختر المشروع وأدخل النتيجة وتُحسب النقاط تلقائياً',
        tx_king: 'شايب الهاص', tx_queens: 'بنات', tx_diamonds: 'الديمن', tx_tricks: 'لطوش', tx_trix: 'تركس',
        tx_who_king: 'من أخذ شايب الهاص؟', tx_count_q: 'كم بنت أخذ كل لاعب؟', tx_count_d: 'كم ديمن أخذ كل لاعب؟',
        tx_count_t: 'كم لطشة أخذ كل لاعب؟', tx_trix_order: 'ترتيب الخروج (١=الأول)',
        tx_add: 'إضافة', tx_cancel: 'إلغاء', tx_round: 'المشروع',
        tx_undo: 'تراجع', tx_new: 'لعبة جديدة', tx_confirm_new: 'بدء لعبة جديدة؟ ستُمسح النتائج.',
        tx_rename: 'اسم اللاعب', tx_total: 'كم المجموع؟',
        tx_legend: 'شايب −٧٥ • بنت −٢٥ • ديمن −١٠ • لطشة −١٥ • تركس +٢٠٠/١٥٠/١٠٠/٥٠'
      },
      en: {
        tx_title: 'Trix Calculator', tx_sub: 'Pick a contract, enter the result, points auto-calc',
        tx_king: 'King ♥', tx_queens: 'Queens', tx_diamonds: 'Diamonds', tx_tricks: 'Tricks', tx_trix: 'Trix',
        tx_who_king: 'Who took the King of Hearts?', tx_count_q: 'Queens taken by each player', tx_count_d: 'Diamonds taken by each player',
        tx_count_t: 'Tricks taken by each player', tx_trix_order: 'Finishing order (1 = first)',
        tx_add: 'Add', tx_cancel: 'Cancel', tx_round: 'Contract',
        tx_undo: 'Undo', tx_new: 'New game', tx_confirm_new: 'Start a new game? Scores will be cleared.',
        tx_rename: 'Player name', tx_total: 'total?',
        tx_legend: 'King −75 • Queen −25 • Diamond −10 • Trick −15 • Trix +200/150/100/50'
      }
    },

    render(view) {
      const s = load();
      view.appendChild(UI.pageTitle(I18n.t('tx_title'), I18n.t('tx_sub')));
      const root = UI.el('div', { class: 'trix' });
      view.appendChild(root);

      const board = UI.el('div', { class: 'trix-board' });
      const contracts = UI.el('div', { class: 'trix-contracts' });
      const rounds = UI.el('div', { class: 'trix-rounds' });
      const actions = UI.el('div', { class: 'blt-actions', style: 'grid-template-columns:1fr 1fr' });
      root.appendChild(board);
      root.appendChild(UI.el('div', { class: 'trix-legend' }, I18n.t('tx_legend')));
      root.appendChild(contracts);
      root.appendChild(actions);
      root.appendChild(rounds);

      const CT = [
        { id: 'king', t: 'tx_king' }, { id: 'queens', t: 'tx_queens' }, { id: 'diamonds', t: 'tx_diamonds' },
        { id: 'tricks', t: 'tx_tricks' }, { id: 'trix', t: 'tx_trix' }
      ];

      function totals() {
        const t = [0, 0, 0, 0];
        s.rounds.forEach((r) => r.deltas.forEach((d, i) => t[i] += d));
        return t;
      }

      function paint() {
        save(s);
        const t = totals();
        const max = Math.max.apply(null, t);
        board.innerHTML = '';
        s.players.forEach((p, i) => {
          const col = UI.el('div', { class: 'trix-col' + (s.rounds.length && t[i] === max ? ' lead' : '') }, [
            UI.el('button', { class: 'trix-name', onclick: () => rename(i) }, p),
            UI.el('div', { class: 'trix-total ' + (t[i] < 0 ? 'neg' : (t[i] > 0 ? 'pos' : '')) }, String(t[i]))
          ]);
          board.appendChild(col);
        });
        contracts.innerHTML = '';
        CT.forEach((c) => contracts.appendChild(UI.el('button', { class: 'trix-ct', onclick: () => openContract(c.id) }, I18n.t(c.t))));
        actions.innerHTML = '';
        actions.appendChild(UI.el('button', { class: 'blt-act', disabled: s.rounds.length ? null : 'true', onclick: undo },
          [UI.el('span', null, '↶ ' + I18n.t('tx_undo'))]));
        actions.appendChild(UI.el('button', { class: 'blt-act', onclick: confirmNew }, [UI.el('span', null, '🔄 ' + I18n.t('tx_new'))]));
        // rounds
        rounds.innerHTML = '';
        rounds.appendChild(UI.el('div', { class: 'trix-rhead' }, [
          UI.el('span', null, I18n.t('tx_round')),
          ...s.players.map((p) => UI.el('span', null, p))
        ]));
        s.rounds.slice().reverse().forEach((r) => rounds.appendChild(UI.el('div', { class: 'trix-rrow' }, [
          UI.el('span', { class: 'trix-rc' }, I18n.t(r.label)),
          ...r.deltas.map((d) => UI.el('span', null, (d > 0 ? '+' : '') + d))
        ])));
      }

      function rename(i) {
        UI.modal(I18n.t('tx_rename'), [{ name: 'n', label: I18n.t('tx_rename'), value: s.players[i] }], (data) => {
          if ((data.n || '').trim()) s.players[i] = data.n.trim(); paint();
        });
      }
      function undo() { if (s.rounds.length) { s.rounds.pop(); paint(); } }
      function confirmNew() { if (!s.rounds.length) return; UI.confirm(I18n.t('tx_confirm_new'), () => { s.rounds = []; paint(); }); }

      function addRound(id, label, deltas) { s.rounds.push({ contract: id, label, deltas }); paint(); }

      // ----- contract entry modals -----
      function modal(title, contentEls, onConfirm) {
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
        const box = UI.el('div', { class: 'modal' }, [UI.el('h3', null, title)].concat(contentEls).concat([
          UI.el('div', { class: 'flex-between', style: 'justify-content:flex-end;gap:10px;margin-top:10px' }, [
            UI.el('button', { class: 'btn btn-ghost', onclick: close }, I18n.t('tx_cancel')),
            UI.el('button', { class: 'btn', onclick: () => { if (onConfirm() !== false) close(); } }, I18n.t('tx_add'))
          ])
        ]));
        backdrop.appendChild(box); document.body.appendChild(backdrop);
      }

      function numRow(label, max) {
        const inp = UI.el('input', { type: 'number', inputmode: 'numeric', min: '0', max: String(max), value: '0' });
        return { row: UI.el('div', { class: 'trix-mgrid' }, [UI.el('span', null, label), inp]), inp };
      }

      function openContract(id) {
        if (id === 'king') {
          const radios = s.players.map((p, i) => {
            const r = UI.el('input', { type: 'radio', name: 'king', value: String(i) });
            if (i === 0) r.checked = true;
            return { p, r, row: UI.el('label', { class: 'trix-mgrid', style: 'cursor:pointer' }, [UI.el('span', null, p), r]) };
          });
          modal(I18n.t('tx_who_king'), radios.map((x) => x.row), () => {
            const idx = radios.findIndex((x) => x.r.checked);
            const d = [0, 0, 0, 0]; d[idx] = -75; addRound(id, 'tx_king', d);
          });
        } else if (id === 'queens' || id === 'diamonds' || id === 'tricks') {
          const cfg = id === 'queens' ? { max: 4, mult: -25, q: 'tx_count_q', total: 4 }
            : id === 'diamonds' ? { max: 13, mult: -10, q: 'tx_count_d', total: 13 }
              : { max: 13, mult: -15, q: 'tx_count_t', total: 13 };
          const rows = s.players.map((p) => numRow(p, cfg.max));
          const sum = UI.el('div', { class: 'trix-msum' });
          const upd = () => { const tot = rows.reduce((a, x) => a + (parseInt(x.inp.value, 10) || 0), 0); sum.textContent = tot + ' / ' + cfg.total; sum.style.color = tot === cfg.total ? '#2e7d5b' : 'var(--maroon)'; };
          rows.forEach((x) => x.inp.addEventListener('input', upd)); upd();
          modal(I18n.t(cfg.q), rows.map((x) => x.row).concat([sum]), () => {
            const deltas = rows.map((x) => (Math.max(0, parseInt(x.inp.value, 10) || 0)) * cfg.mult);
            const label = id === 'queens' ? 'tx_queens' : (id === 'diamonds' ? 'tx_diamonds' : 'tx_tricks');
            addRound(id, label, deltas);
          });
        } else if (id === 'trix') {
          const sels = s.players.map((p) => {
            const sl = UI.el('select');
            [1, 2, 3, 4].forEach((n) => sl.appendChild(UI.el('option', { value: String(n) }, String(n))));
            return { p, sl, row: UI.el('div', { class: 'trix-mgrid' }, [UI.el('span', null, p), sl]) };
          });
          sels.forEach((x, i) => x.sl.value = String(i + 1));
          modal(I18n.t('tx_trix_order'), sels.map((x) => x.row), () => {
            const deltas = sels.map((x) => TRIX_PTS[(parseInt(x.sl.value, 10) || 1) - 1] || 0);
            addRound('trix', 'tx_trix', deltas);
          });
        }
      }

      paint();
    }
  });
})();
