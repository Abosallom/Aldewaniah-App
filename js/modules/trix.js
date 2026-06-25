/* ===========================================================
   Trix calculator (حاسبة تركس) — guided kingdom flow.

   Flow:
   1) Roll the dice → picks who starts (kingdom owner).
   2) The owner plays his 5 contracts, choosing one of the
      REMAINING contracts each hand (can't repeat within his
      kingdom).
   3) Then the next player (to the right) plays his kingdom, and
      so on → 4 kingdoms × 5 contracts = 20 rounds total.

   Scoring (Gulf values):
   - شايب الهاص (King ♥): taker −75 (×2 = −150 if doubled)
   - بنات (Queens): each queen −25 (×2 = −50 if doubled), 4 total
   - الديمن (Diamonds): −10 each (×13)
   - لطوش (Tricks): −15 each (×13)
   - تركس (Trix ladder): 1st +200, 2nd +150, 3rd +100, 4th +50
   Saved locally. Open to everyone.
   =========================================================== */
(function () {
  const KEY = 'aldewaniah.trix.v2';
  const TRIX_PTS = [200, 150, 100, 50];
  const CT = [
    { id: 'king', t: 'tx_king' }, { id: 'queens', t: 'tx_queens' }, { id: 'diamonds', t: 'tx_diamonds' },
    { id: 'tricks', t: 'tx_tricks' }, { id: 'trix', t: 'tx_trix' }
  ];

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.players) return s; } catch (e) {}
    return { players: ['لاعب ١', 'لاعب ٢', 'لاعب ٣', 'لاعب ٤'], starter: null, rounds: [] };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  Sections.add({
    id: 'trix',
    title: { ar: 'حاسبة تركس', en: 'Trix Calculator' },
    subtitle: { ar: 'احسب نقاط لعبة تركس بالممالك', en: 'Trix kingdoms score sheet' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="12" height="16" rx="2"/><rect x="8" y="5" width="12" height="16" rx="2" fill="#fffdf8"/><path d="M14 9l-2 3 2 3 2-3z" fill="currentColor" stroke="none"/></svg>',
    strings: {
      ar: {
        tx_title: 'حاسبة تركس', tx_sub: 'ارمِ النرد، ثم كل لاعب يلعب ممالكه (٥ مشاريع)',
        tx_king: 'شايب الهاص', tx_queens: 'بنات', tx_diamonds: 'الديمن', tx_tricks: 'لطوش', tx_trix: 'تركس',
        tx_who_king: 'من أخذ شايب الهاص؟', tx_count_d: 'كم ديمن أخذ كل لاعب؟', tx_count_t: 'كم لطشة أخذ كل لاعب؟',
        tx_trix_order: 'ترتيب الخروج (١=الأول)', tx_double: 'دبل (مضاعف)',
        tx_queen: 'البنت', tx_taker: 'من أخذها؟',
        tx_add: 'إضافة', tx_cancel: 'إلغاء',
        tx_undo: 'تراجع', tx_new: 'لعبة جديدة', tx_confirm_new: 'بدء لعبة جديدة؟ ستُمسح النتائج.',
        tx_rename: 'اسم اللاعب',
        tx_roll: 'ارمِ النرد لاختيار من يبدأ', tx_roll_btn: '🎲 ارمِ النرد', tx_starts: 'يبدأ',
        tx_kingdom: 'مملكة', tx_turn_pick: 'اختر مشروعاً', tx_of: 'من', tx_round: 'المشروع',
        tx_gameover: 'انتهت اللعبة 🎉', tx_winner: 'الفائز',
        tx_legend: 'شايب −٧٥ • بنت −٢٥ • ديمن −١٠ • لطشة −١٥ • تركس +٢٠٠/١٥٠/١٠٠/٥٠ (الدبل ×٢)'
      },
      en: {
        tx_title: 'Trix Calculator', tx_sub: 'Roll the dice, then each player plays their 5 contracts',
        tx_king: 'King ♥', tx_queens: 'Queens', tx_diamonds: 'Diamonds', tx_tricks: 'Tricks', tx_trix: 'Trix',
        tx_who_king: 'Who took the King of Hearts?', tx_count_d: 'Diamonds taken by each player', tx_count_t: 'Tricks taken by each player',
        tx_trix_order: 'Finishing order (1 = first)', tx_double: 'Double',
        tx_queen: 'Queen', tx_taker: 'Who took it?',
        tx_add: 'Add', tx_cancel: 'Cancel',
        tx_undo: 'Undo', tx_new: 'New game', tx_confirm_new: 'Start a new game? Scores will be cleared.',
        tx_rename: 'Player name',
        tx_roll: 'Roll the dice to choose who starts', tx_roll_btn: '🎲 Roll dice', tx_starts: 'starts',
        tx_kingdom: 'Kingdom', tx_turn_pick: 'choose a contract', tx_of: 'of', tx_round: 'Contract',
        tx_gameover: 'Game over 🎉', tx_winner: 'Winner',
        tx_legend: 'King −75 • Queen −25 • Diamond −10 • Trick −15 • Trix +200/150/100/50 (Double ×2)'
      }
    },

    render(view) {
      const s = load();
      view.appendChild(UI.pageTitle(I18n.t('tx_title'), I18n.t('tx_sub')));
      const root = UI.el('div', { class: 'trix' });
      view.appendChild(root);

      const board = UI.el('div', { class: 'trix-board' });
      const flow = UI.el('div', { class: 'trix-flow' });
      const actions = UI.el('div', { class: 'blt-actions', style: 'grid-template-columns:1fr 1fr' });
      const rounds = UI.el('div', { class: 'trix-rounds' });
      root.appendChild(board);
      root.appendChild(UI.el('div', { class: 'trix-legend' }, I18n.t('tx_legend')));
      root.appendChild(flow);
      root.appendChild(actions);
      root.appendChild(rounds);

      // derive kingdom state from rounds + starter
      function state() {
        const n = s.rounds.length;
        const kingdomIndex = Math.floor(n / 5);
        const within = n % 5;
        const owner = s.starter == null ? null : (s.starter + kingdomIndex) % 4;
        const used = s.rounds.slice(kingdomIndex * 5).map((r) => r.contract);
        return { n, kingdomIndex, within, owner, used, over: n >= 20 };
      }
      function totals() { const t = [0, 0, 0, 0]; s.rounds.forEach((r) => r.deltas.forEach((d, i) => t[i] += d)); return t; }

      function paint() {
        save(s);
        const st = state();
        const t = totals();
        const max = Math.max.apply(null, t);
        // board
        board.innerHTML = '';
        s.players.forEach((p, i) => {
          const isOwner = st.owner === i && !st.over;
          board.appendChild(UI.el('div', { class: 'trix-col' + (s.rounds.length && t[i] === max ? ' lead' : '') + (isOwner ? ' owner' : '') }, [
            UI.el('button', { class: 'trix-name', onclick: () => rename(i) }, p + (isOwner ? ' 👑' : '')),
            UI.el('div', { class: 'trix-total ' + (t[i] < 0 ? 'neg' : (t[i] > 0 ? 'pos' : '')) }, String(t[i]))
          ]));
        });
        // flow
        flow.innerHTML = '';
        if (s.starter == null) {
          flow.appendChild(UI.el('p', { class: 'trix-flowmsg' }, I18n.t('tx_roll')));
          flow.appendChild(UI.el('button', { class: 'btn btn-green btn-block', onclick: rollDice }, I18n.t('tx_roll_btn')));
        } else if (st.over) {
          const order = t.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
          flow.appendChild(UI.el('div', { class: 'trix-gameover' }, I18n.t('tx_gameover')));
          flow.appendChild(UI.el('div', { class: 'rl-winner' }, '🏆 ' + I18n.t('tx_winner') + ': ' + s.players[order[0].i] + ' (' + order[0].v + ')'));
        } else {
          flow.appendChild(UI.el('div', { class: 'trix-turn' }, [
            UI.el('span', { class: 'trix-king' }, '👑 ' + I18n.t('tx_kingdom') + ' ' + (st.kingdomIndex + 1) + '/4'),
            UI.el('b', null, s.players[st.owner]),
            UI.el('span', { class: 'muted' }, '— ' + I18n.t('tx_turn_pick') + ' (' + (st.within + 1) + ' ' + I18n.t('tx_of') + ' 5)')
          ]));
          const grid = UI.el('div', { class: 'trix-contracts' });
          CT.forEach((c) => {
            const usedUp = st.used.includes(c.id);
            grid.appendChild(UI.el('button', { class: 'trix-ct' + (usedUp ? ' used' : ''), disabled: usedUp ? 'true' : null,
              onclick: () => openContract(c.id, st.owner) }, I18n.t(c.t)));
          });
          flow.appendChild(grid);
        }
        // actions
        actions.innerHTML = '';
        actions.appendChild(UI.el('button', { class: 'blt-act', disabled: s.rounds.length ? null : 'true', onclick: undo }, [UI.el('span', null, '↶ ' + I18n.t('tx_undo'))]));
        actions.appendChild(UI.el('button', { class: 'blt-act', onclick: confirmNew }, [UI.el('span', null, '🔄 ' + I18n.t('tx_new'))]));
        // rounds
        rounds.innerHTML = '';
        rounds.appendChild(UI.el('div', { class: 'trix-rhead' }, [UI.el('span', null, I18n.t('tx_round') || 'المشروع')].concat(s.players.map((p) => UI.el('span', null, p)))));
        s.rounds.slice().reverse().forEach((r) => rounds.appendChild(UI.el('div', { class: 'trix-rrow' }, [
          UI.el('span', { class: 'trix-rc' }, I18n.t(r.label) + ' · ' + s.players[r.owner]),
          ...r.deltas.map((d) => UI.el('span', null, (d > 0 ? '+' : '') + d))
        ])));
      }

      function rollDice() {
        // quick visual cycle then settle
        let ticks = 0; const btn = flow.querySelector('button');
        const iv = setInterval(() => {
          ticks++;
          if (btn) btn.textContent = '🎲 ' + s.players[Math.floor(Math.random() * 4)];
          if (ticks > 10) {
            clearInterval(iv);
            s.starter = Math.floor(Math.random() * 4);
            save(s);
            flow.innerHTML = '';
            flow.appendChild(UI.el('div', { class: 'trix-rolled' }, '🎲 ' + s.players[s.starter] + ' ' + I18n.t('tx_starts')));
            setTimeout(paint, 900);
          }
        }, 110);
      }

      function rename(i) {
        UI.modal(I18n.t('tx_rename'), [{ name: 'n', label: I18n.t('tx_rename'), value: s.players[i] }], (data) => {
          if ((data.n || '').trim()) s.players[i] = data.n.trim(); paint();
        });
      }
      function undo() { if (s.rounds.length) { s.rounds.pop(); paint(); } }
      function confirmNew() { if (!s.rounds.length && s.starter == null) return; UI.confirm(I18n.t('tx_confirm_new'), () => { s.rounds = []; s.starter = null; paint(); }); }
      function addRound(id, label, deltas, owner) { s.rounds.push({ owner, contract: id, label, deltas }); paint(); }

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
        return { inp, row: UI.el('div', { class: 'trix-mgrid' }, [UI.el('span', null, label), inp]) };
      }
      function playerSelect() {
        const sl = UI.el('select');
        s.players.forEach((p, i) => sl.appendChild(UI.el('option', { value: String(i) }, p)));
        return sl;
      }

      function openContract(id, owner) {
        if (id === 'king') {
          const sel = playerSelect();
          const dbl = UI.el('input', { type: 'checkbox' });
          modal(I18n.t('tx_who_king'), [
            UI.el('div', { class: 'trix-mgrid' }, [UI.el('span', null, I18n.t('tx_taker')), sel]),
            UI.el('label', { class: 'trix-mgrid', style: 'cursor:pointer' }, [UI.el('span', null, I18n.t('tx_double')), dbl])
          ], () => {
            const idx = parseInt(sel.value, 10) || 0; const d = [0, 0, 0, 0]; d[idx] = dbl.checked ? -150 : -75;
            addRound(id, 'tx_king', d, owner);
          });
        } else if (id === 'queens') {
          // 4 queens, each: who took it + doubled?
          const rows = [1, 2, 3, 4].map((q) => {
            const sel = playerSelect(); const dbl = UI.el('input', { type: 'checkbox' });
            return { sel, dbl, row: UI.el('div', { class: 'trix-qrow' }, [
              UI.el('span', { class: 'trix-qlbl' }, I18n.t('tx_queen') + ' ' + q),
              sel,
              UI.el('label', { class: 'trix-dbl' }, [dbl, UI.el('span', null, I18n.t('tx_double'))])
            ]) };
          });
          modal(I18n.t('tx_queens'), rows.map((r) => r.row), () => {
            const d = [0, 0, 0, 0];
            rows.forEach((r) => { const i = parseInt(r.sel.value, 10) || 0; d[i] += r.dbl.checked ? -50 : -25; });
            addRound(id, 'tx_queens', d, owner);
          });
        } else if (id === 'diamonds' || id === 'tricks') {
          const cfg = id === 'diamonds' ? { max: 13, mult: -10, q: 'tx_count_d', total: 13, label: 'tx_diamonds' }
            : { max: 13, mult: -15, q: 'tx_count_t', total: 13, label: 'tx_tricks' };
          const rows = s.players.map((p) => numRow(p, cfg.max));
          const sum = UI.el('div', { class: 'trix-msum' });
          const upd = () => { const tot = rows.reduce((a, x) => a + (parseInt(x.inp.value, 10) || 0), 0); sum.textContent = tot + ' / ' + cfg.total; sum.style.color = tot === cfg.total ? '#2e7d5b' : 'var(--maroon)'; };
          rows.forEach((x) => x.inp.addEventListener('input', upd)); upd();
          modal(I18n.t(cfg.q), rows.map((x) => x.row).concat([sum]), () => {
            const deltas = rows.map((x) => (Math.max(0, parseInt(x.inp.value, 10) || 0)) * cfg.mult);
            addRound(id, cfg.label, deltas, owner);
          });
        } else if (id === 'trix') {
          const sels = s.players.map((p, i) => {
            const sl = UI.el('select'); [1, 2, 3, 4].forEach((nn) => sl.appendChild(UI.el('option', { value: String(nn) }, String(nn))));
            sl.value = String(i + 1);
            return { sl, row: UI.el('div', { class: 'trix-mgrid' }, [UI.el('span', null, p), sl]) };
          });
          modal(I18n.t('tx_trix_order'), sels.map((x) => x.row), () => {
            const deltas = sels.map((x) => TRIX_PTS[(parseInt(x.sl.value, 10) || 1) - 1] || 0);
            addRound('trix', 'tx_trix', deltas, owner);
          });
        }
      }

      paint();
    }
  });
})();
