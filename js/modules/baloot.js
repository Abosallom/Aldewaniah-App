/* ===========================================================
   Baloot calculator (حاسبة بلوت) — score sheet (النشرة).
   Layout mirrors the popular app: two totals with a dealer arrow
   between them, a central "احسب" button flanked by two big entry
   circles (لنا / لهم), a stats button, and تراجع / دق الولد /
   صكة جديدة controls, with the hand-by-hand sheet below.
   - Type a hand's points in a circle; after 2 digits focus jumps
     to the other circle. Press احسب to record the hand.
   - First team to the target (152) wins the صكة (tally kept).
   - State persists in localStorage. Open to everyone.
   =========================================================== */
(function () {
  const KEY = 'aldewaniah.baloot.v1';

  const def = () => ({
    usName: '', themName: '',
    target: 152,
    dealer: 'us',
    rounds: [],            // [{us, them}]
    wins: { us: 0, them: 0 },
    concluded: false
  });

  function load() {
    try { return Object.assign(def(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { return def(); }
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  const sum = (rounds, side) => rounds.reduce((t, r) => t + (Number(r[side]) || 0), 0);

  Sections.add({
    id: 'baloot',
    title: { ar: 'حاسبة بلوت', en: 'Baloot Calculator' },
    subtitle: { ar: 'احسب النشرة حتى ١٥٢', en: 'Score sheet to 152' },
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 3l6 1.5v13L9 18"/><path d="M9.5 11l1.2-2 1.2 2-1.2 2z" fill="currentColor" stroke="none"/></svg>',
    strings: {
      ar: {
        blt_title: 'حاسبة بلوت', blt_sub: 'النشرة — أول فريق يوصل ١٥٢ يكسب الصكة',
        blt_us: 'لنا', blt_them: 'لهم', blt_calc: 'احسب',
        blt_undo: 'تراجع', blt_new: 'صكة جديدة', blt_kaboot: 'دق الولد',
        blt_wins: 'الصكات', blt_won: 'كسب الصكة', blt_target: 'الهدف',
        blt_stats: 'الإحصائيات', blt_rename: 'تغيير الأسماء', blt_set_target: 'تغيير الهدف',
        blt_reset_stats: 'تصفير الإحصائيات', blt_flip: 'تبديل الموزّع',
        blt_name_us: 'اسم فريق «لنا»', blt_name_them: 'اسم فريق «لهم»',
        blt_who_kaboot: 'مين دقّ الولد؟', blt_close: 'إغلاق',
        blt_confirm_new: 'بدء صكة جديدة؟ ستُصفّر النقاط الحالية.',
        blt_confirm_reset: 'تصفير عدد الصكات للفريقين؟'
      },
      en: {
        blt_title: 'Baloot Calculator', blt_sub: 'Score sheet — first to 152 wins the round',
        blt_us: 'Us', blt_them: 'Them', blt_calc: 'Add',
        blt_undo: 'Undo', blt_new: 'New game', blt_kaboot: 'Kaboot',
        blt_wins: 'Games', blt_won: 'won the game', blt_target: 'Target',
        blt_stats: 'Stats', blt_rename: 'Rename teams', blt_set_target: 'Change target',
        blt_reset_stats: 'Reset stats', blt_flip: 'Switch dealer',
        blt_name_us: '“Us” team name', blt_name_them: '“Them” team name',
        blt_who_kaboot: 'Who took all?', blt_close: 'Close',
        blt_confirm_new: 'Start a new game? Current points will be cleared.',
        blt_confirm_reset: 'Reset both teams’ game counts?'
      }
    },

    render(view) {
      let s = load();
      let eUs = '', eThem = '';   // current-hand entry (transient)
      const nameOf = (side) => (side === 'us' ? (s.usName || I18n.t('blt_us')) : (s.themName || I18n.t('blt_them')));

      view.appendChild(UI.pageTitle(I18n.t('blt_title'), I18n.t('blt_sub')));
      const root = UI.el('div', { class: 'blt' });
      view.appendChild(root);
      try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}

      function arrowSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      }

      function paint() {
        save(s);
        root.innerHTML = '';
        const usT = sum(s.rounds, 'us'), themT = sum(s.rounds, 'them');
        const usLead = s.concluded && usT >= themT, themLead = s.concluded && themT > usT;

        // ---- totals + dealer arrow (us on the right in RTL) ----
        root.appendChild(UI.el('div', { class: 'blt-top' }, [
          side('us', usT, usLead),
          UI.el('button', { class: 'blt-arrow' + (s.dealer === 'them' ? ' them' : ''), title: I18n.t('blt_flip'),
            html: arrowSvg(), onclick: () => { s.dealer = s.dealer === 'us' ? 'them' : 'us'; paint(); } }),
          side('them', themT, themLead)
        ]));

        if (s.concluded) {
          const w = usT >= themT ? 'us' : 'them';
          root.appendChild(UI.el('div', { class: 'blt-banner' }, '🏆 ' + nameOf(w) + ' ' + I18n.t('blt_won')));
          root.appendChild(UI.el('button', { class: 'btn btn-green btn-block', style: 'margin:10px 0', onclick: newGame }, I18n.t('blt_new')));
        } else {
          // ---- circles + احسب ----
          const usIn = circle('us');
          const themIn = circle('them');
          const calc = UI.el('button', { class: 'blt-calc', onclick: commit }, I18n.t('blt_calc'));
          root.appendChild(UI.el('div', { class: 'blt-mid' }, [usIn.wrap, calc, themIn.wrap]));
          // stats button
          root.appendChild(UI.el('button', { class: 'blt-statsbtn', title: I18n.t('blt_stats'),
            html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v9l6 3"/><circle cx="12" cy="12" r="9"/></svg>', onclick: menu }));
          // controls (new game right, kaboot center, undo left)
          root.appendChild(UI.el('div', { class: 'blt-controls' }, [
            UI.el('button', { class: 'blt-ctrl newg', onclick: confirmNew }, I18n.t('blt_new')),
            UI.el('button', { class: 'blt-kaboot', onclick: kaboot }, I18n.t('blt_kaboot') + ' ♣'),
            UI.el('button', { class: 'blt-ctrl undo', disabled: s.rounds.length ? null : 'true', onclick: undo }, I18n.t('blt_undo'))
          ]));
          // focus the dealer's side first
          setTimeout(() => { (s.dealer === 'us' ? usIn.input : themIn.input).focus(); }, 30);
        }

        // ---- sheet ----
        const sheet = UI.el('div', { class: 'blt-sheet' });
        sheet.appendChild(UI.el('div', { class: 'blt-srow blt-shead' }, [
          UI.el('span', null, nameOf('us')), UI.el('span', null, nameOf('them'))
        ]));
        s.rounds.forEach((r) => sheet.appendChild(UI.el('div', { class: 'blt-srow' }, [
          UI.el('span', null, String(Number(r.us) || 0)), UI.el('span', null, String(Number(r.them) || 0))
        ])));
        root.appendChild(sheet);
      }

      function side(team, total, lead) {
        return UI.el('div', { class: 'blt-side' + (lead ? ' lead' : '') }, [
          UI.el('button', { class: 'blt-label', title: I18n.t('blt_rename'), onclick: () => rename(team) }, nameOf(team)),
          UI.el('div', { class: 'blt-num' }, String(total))
        ]);
      }

      function circle(team) {
        const input = UI.el('input', {
          class: 'blt-circle', type: 'tel', inputmode: 'numeric', maxlength: '3',
          value: team === 'us' ? eUs : eThem, placeholder: '0'
        });
        input.addEventListener('input', () => {
          const v = input.value.replace(/[^0-9]/g, '').slice(0, 3);
          input.value = v;
          if (team === 'us') eUs = v; else eThem = v;
          // after 2 digits, jump to the other circle
          if (v.length >= 2) {
            const other = root.querySelector(team === 'us' ? '.blt-circle-them' : '.blt-circle-us');
            if (other) other.focus();
          }
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
        const wrap = UI.el('div', { class: 'blt-circle-wrap' }, [input]);
        input.classList.add('blt-circle-' + team);
        return { wrap, input };
      }

      function commit() {
        const u = Math.max(0, parseInt(eUs, 10) || 0);
        const t = Math.max(0, parseInt(eThem, 10) || 0);
        if (u === 0 && t === 0) return;
        s.rounds.push({ us: u, them: t });
        eUs = ''; eThem = '';
        checkWin();
        paint();
      }

      function kaboot() {
        // one team takes everything → the other scores 0 this hand.
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
        const pick = (winner) => {
          close();
          if (winner === 'us') eThem = '0'; else eUs = '0';
          paint();
          setTimeout(() => { const el = root.querySelector('.blt-circle-' + winner); if (el) el.focus(); }, 30);
        };
        backdrop.appendChild(UI.el('div', { class: 'modal' }, [
          UI.el('h3', null, I18n.t('blt_who_kaboot')),
          UI.el('div', { class: 'blt-pick' }, [
            UI.el('button', { class: 'btn', onclick: () => pick('us') }, nameOf('us')),
            UI.el('button', { class: 'btn', onclick: () => pick('them') }, nameOf('them'))
          ])
        ]));
        document.body.appendChild(backdrop);
      }

      function checkWin() {
        const usT = sum(s.rounds, 'us'), themT = sum(s.rounds, 'them');
        if (!s.concluded && (usT >= s.target || themT >= s.target) && usT !== themT) {
          s.concluded = true;
          const w = usT > themT ? 'us' : 'them';
          s.wins[w] = (s.wins[w] || 0) + 1;
        }
      }

      function undo() {
        if (!s.rounds.length) return;
        if (s.concluded) {
          const usT = sum(s.rounds, 'us'), themT = sum(s.rounds, 'them');
          const w = usT > themT ? 'us' : 'them';
          s.wins[w] = Math.max(0, (s.wins[w] || 0) - 1);
          s.concluded = false;
        }
        s.rounds.pop();
        paint();
      }
      function newGame() {
        s.rounds = []; s.concluded = false; eUs = ''; eThem = '';
        s.dealer = s.dealer === 'us' ? 'them' : 'us';
        paint();
      }
      function confirmNew() {
        if (!s.rounds.length) { newGame(); return; }
        UI.confirm(I18n.t('blt_confirm_new'), newGame);
      }

      function rename(team) {
        UI.modal(team === 'us' ? I18n.t('blt_name_us') : I18n.t('blt_name_them'),
          [{ name: 'n', label: team === 'us' ? I18n.t('blt_us') : I18n.t('blt_them'), value: team === 'us' ? s.usName : s.themName }],
          (data) => { if (team === 'us') s.usName = (data.n || '').trim(); else s.themName = (data.n || '').trim(); paint(); });
      }

      function menu() {
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
        const item = (label, fn) => UI.el('button', { class: 'blt-menu-item', onclick: () => { close(); fn(); } }, label);
        backdrop.appendChild(UI.el('div', { class: 'modal' }, [
          UI.el('h3', null, I18n.t('blt_stats')),
          UI.el('div', { class: 'blt-winrow' }, [
            UI.el('span', null, nameOf('us') + ': '), UI.el('b', null, String(s.wins.us)),
            UI.el('span', { class: 'blt-stats-dash' }, '—'),
            UI.el('b', null, String(s.wins.them)), UI.el('span', null, ' :' + nameOf('them'))
          ]),
          item(I18n.t('blt_rename') + ' — ' + nameOf('us'), () => rename('us')),
          item(I18n.t('blt_rename') + ' — ' + nameOf('them'), () => rename('them')),
          item(I18n.t('blt_flip'), () => { s.dealer = s.dealer === 'us' ? 'them' : 'us'; paint(); }),
          item(I18n.t('blt_set_target') + ' (' + s.target + ')', setTarget),
          item(I18n.t('blt_reset_stats'), () => UI.confirm(I18n.t('blt_confirm_reset'), () => { s.wins = { us: 0, them: 0 }; paint(); }))
        ]));
        document.body.appendChild(backdrop);
      }

      function setTarget() {
        UI.modal(I18n.t('blt_set_target'), [{ name: 't', label: I18n.t('blt_target'), type: 'number', value: s.target }],
          (data) => { const t = parseInt(data.t, 10); if (t > 0) s.target = t; paint(); });
      }

      paint();
    }
  });
})();
