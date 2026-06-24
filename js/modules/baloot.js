/* ===========================================================
   Baloot calculator (حاسبة بلوت) — a running score sheet.
   - Two teams (لنا / لهم), tap a name to rename.
   - Enter each hand's points; running total races to a target (152).
   - First team to reach the target wins the صكة; صكات tally is kept.
   - Undo / Redo, dealer arrow, new-game, reset stats.
   - State persists in localStorage so it survives closing the app.
   Open to everyone (no login needed).
   =========================================================== */
(function () {
  const KEY = 'aldewaniah.baloot.v1';

  const def = () => ({
    usName: '', themName: '',
    target: 152,
    dealer: 'us',
    rounds: [],      // [{us, them}]
    redo: [],        // popped rounds for redo
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
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 3l6 1.5v13L9 18" fill="none"/><path d="M9.5 11l1.2-2 1.2 2-1.2 2z" fill="currentColor" stroke="none"/></svg>',
    strings: {
      ar: {
        blt_title: 'حاسبة بلوت', blt_sub: 'النشرة — أول فريق يوصل ١٥٢ يكسب الصكة',
        blt_us: 'لنا', blt_them: 'لهم', blt_dealer: 'الموزّع',
        blt_add: 'أضف الجولة', blt_us_pts: 'نقاط لنا', blt_them_pts: 'نقاط لهم',
        blt_undo: 'تراجع', blt_redo: 'إعادة', blt_new: 'صكة جديدة',
        blt_wins: 'الصكات', blt_won: 'كسب الصكة', blt_target: 'الهدف',
        blt_menu: 'خيارات', blt_rename: 'تغيير الأسماء', blt_set_target: 'تغيير الهدف',
        blt_reset_stats: 'تصفير الإحصائيات', blt_flip: 'تبديل الموزّع',
        blt_round: 'جولة', blt_no_rounds: 'لا توجد جولات بعد — أضف أول جولة',
        blt_name_us: 'اسم فريق «لنا»', blt_name_them: 'اسم فريق «لهم»',
        blt_confirm_new: 'بدء صكة جديدة؟ ستُصفّر النقاط الحالية.',
        blt_confirm_reset: 'تصفير عدد الصكات للفريقين؟'
      },
      en: {
        blt_title: 'Baloot Calculator', blt_sub: 'Score sheet — first to 152 wins the round',
        blt_us: 'Us', blt_them: 'Them', blt_dealer: 'Dealer',
        blt_add: 'Add hand', blt_us_pts: 'Us points', blt_them_pts: 'Them points',
        blt_undo: 'Undo', blt_redo: 'Redo', blt_new: 'New game',
        blt_wins: 'Games', blt_won: 'won the game', blt_target: 'Target',
        blt_menu: 'Options', blt_rename: 'Rename teams', blt_set_target: 'Change target',
        blt_reset_stats: 'Reset stats', blt_flip: 'Switch dealer',
        blt_round: 'Hand', blt_no_rounds: 'No hands yet — add the first one',
        blt_name_us: '“Us” team name', blt_name_them: '“Them” team name',
        blt_confirm_new: 'Start a new game? Current points will be cleared.',
        blt_confirm_reset: 'Reset both teams’ game counts?'
      }
    },

    render(view) {
      let s = load();
      const nameOf = (side) => (side === 'us' ? (s.usName || I18n.t('blt_us')) : (s.themName || I18n.t('blt_them')));

      view.appendChild(UI.pageTitle(I18n.t('blt_title'), I18n.t('blt_sub')));

      const root = UI.el('div', { class: 'blt' });
      view.appendChild(root);

      // keep the screen awake while on this view (best effort)
      try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}

      function paint() {
        save(s);
        root.innerHTML = '';
        const usT = sum(s.rounds, 'us'), themT = sum(s.rounds, 'them');
        const usWin = s.concluded && usT >= themT, themWin = s.concluded && themT > usT;

        // ---- scoreboard ----
        const board = UI.el('div', { class: 'blt-board' }, [
          teamPanel('us', usT, usWin),
          teamPanel('them', themT, themWin)
        ]);
        root.appendChild(board);

        // ---- stats line ----
        root.appendChild(UI.el('div', { class: 'blt-stats' }, [
          UI.el('span', null, I18n.t('blt_wins') + ': '),
          UI.el('b', null, nameOf('us') + ' ' + s.wins.us),
          UI.el('span', { class: 'blt-stats-dash' }, '—'),
          UI.el('b', null, nameOf('them') + ' ' + s.wins.them),
          UI.el('span', { class: 'blt-target-pill' }, I18n.t('blt_target') + ' ' + s.target)
        ]));

        // ---- win banner / entry ----
        if (s.concluded) {
          const winner = usT >= themT ? 'us' : 'them';
          root.appendChild(UI.el('div', { class: 'blt-banner' }, '🏆 ' + nameOf(winner) + ' ' + I18n.t('blt_won')));
          root.appendChild(UI.el('button', { class: 'btn btn-green btn-block', style: 'margin:10px 0', onclick: newGame }, I18n.t('blt_new')));
        } else {
          root.appendChild(entryRow());
        }

        // ---- action buttons ----
        root.appendChild(UI.el('div', { class: 'blt-actions' }, [
          UI.el('button', { class: 'blt-act', disabled: s.rounds.length ? null : 'true', onclick: undo },
            [ico('M9 14l-4-4 4-4M5 10h8a6 6 0 010 12h-1'), UI.el('span', null, I18n.t('blt_undo'))]),
          UI.el('button', { class: 'blt-act', disabled: s.redo.length ? null : 'true', onclick: redo },
            [ico('M15 14l4-4-4-4M19 10h-8a6 6 0 000 12h1'), UI.el('span', null, I18n.t('blt_redo'))]),
          UI.el('button', { class: 'blt-act', onclick: confirmNew },
            [ico('M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-14-3M4 15a8 8 0 0014 3'), UI.el('span', null, I18n.t('blt_new'))]),
          UI.el('button', { class: 'blt-act', onclick: menu },
            [ico('M12 6h.01M12 12h.01M12 18h.01'), UI.el('span', null, I18n.t('blt_menu'))])
        ]));

        // ---- rounds history ----
        const list = UI.el('div', { class: 'blt-rounds' });
        if (!s.rounds.length) {
          list.appendChild(UI.el('div', { class: 'blt-empty' }, I18n.t('blt_no_rounds')));
        } else {
          list.appendChild(UI.el('div', { class: 'blt-round blt-round-head' }, [
            UI.el('span', null, '#'),
            UI.el('span', null, nameOf('us')),
            UI.el('span', null, nameOf('them'))
          ]));
          let ru = 0, rt = 0;
          s.rounds.forEach((r, i) => {
            ru += Number(r.us) || 0; rt += Number(r.them) || 0;
            list.appendChild(UI.el('div', { class: 'blt-round' }, [
              UI.el('span', { class: 'blt-rn' }, String(i + 1)),
              UI.el('span', null, (Number(r.us) || 0) + ' '),
              UI.el('span', null, (Number(r.them) || 0) + ' ')
            ]));
          });
        }
        root.appendChild(list);
      }

      function teamPanel(side, total, isWin) {
        const isDealer = s.dealer === side;
        return UI.el('div', { class: 'blt-team' + (isWin ? ' lead' : '') }, [
          UI.el('button', { class: 'blt-name', title: I18n.t('blt_rename'), onclick: () => rename(side) }, [
            isDealer ? UI.el('span', { class: 'blt-dealer', title: I18n.t('blt_dealer') }, '🎯') : null,
            UI.el('span', null, nameOf(side))
          ]),
          UI.el('div', { class: 'blt-total' }, String(total))
        ]);
      }

      function entryRow() {
        const us = UI.el('input', { class: 'blt-in', type: 'number', inputmode: 'numeric', min: '0', placeholder: '0' });
        const them = UI.el('input', { class: 'blt-in', type: 'number', inputmode: 'numeric', min: '0', placeholder: '0' });
        const add = () => {
          const u = Math.max(0, parseInt(us.value, 10) || 0);
          const t = Math.max(0, parseInt(them.value, 10) || 0);
          if (u === 0 && t === 0) return;
          s.rounds.push({ us: u, them: t });
          s.redo = [];
          checkWin();
          paint();
        };
        const row = UI.el('div', { class: 'blt-entry' }, [
          UI.el('label', null, [UI.el('span', { class: 'blt-in-lbl' }, nameOf('us')), us]),
          UI.el('label', null, [UI.el('span', { class: 'blt-in-lbl' }, nameOf('them')), them]),
          UI.el('button', { class: 'btn btn-green blt-add', onclick: add }, I18n.t('blt_add'))
        ]);
        us.addEventListener('keydown', (e) => { if (e.key === 'Enter') them.focus(); });
        them.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
        return row;
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
        // if a conclusion happened on the last round, revert the win tally
        if (s.concluded) {
          const usT = sum(s.rounds, 'us'), themT = sum(s.rounds, 'them');
          const w = usT > themT ? 'us' : 'them';
          s.wins[w] = Math.max(0, (s.wins[w] || 0) - 1);
          s.concluded = false;
        }
        s.redo.push(s.rounds.pop());
        paint();
      }
      function redo() {
        if (!s.redo.length) return;
        s.rounds.push(s.redo.pop());
        checkWin();
        paint();
      }
      function newGame() {
        s.rounds = []; s.redo = []; s.concluded = false;
        s.dealer = s.dealer === 'us' ? 'them' : 'us';
        paint();
      }
      function confirmNew() { UI.confirm(I18n.t('blt_confirm_new'), newGame); }

      function rename(side) {
        UI.modal(side === 'us' ? I18n.t('blt_name_us') : I18n.t('blt_name_them'),
          [{ name: 'n', label: side === 'us' ? I18n.t('blt_us') : I18n.t('blt_them'), value: side === 'us' ? s.usName : s.themName }],
          (data) => {
            if (side === 'us') s.usName = (data.n || '').trim();
            else s.themName = (data.n || '').trim();
            paint();
          });
      }

      function menu() {
        const backdrop = UI.el('div', { class: 'modal-backdrop' });
        const close = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
        const item = (label, fn) => UI.el('button', { class: 'blt-menu-item', onclick: () => { close(); fn(); } }, label);
        const box = UI.el('div', { class: 'modal' }, [
          UI.el('h3', null, I18n.t('blt_menu')),
          item(I18n.t('blt_rename') + ' — ' + nameOf('us'), () => rename('us')),
          item(I18n.t('blt_rename') + ' — ' + nameOf('them'), () => rename('them')),
          item(I18n.t('blt_flip'), () => { s.dealer = s.dealer === 'us' ? 'them' : 'us'; paint(); }),
          item(I18n.t('blt_set_target'), setTarget),
          item(I18n.t('blt_reset_stats'), () => UI.confirm(I18n.t('blt_confirm_reset'), () => { s.wins = { us: 0, them: 0 }; paint(); }))
        ]);
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
      }

      function setTarget() {
        UI.modal(I18n.t('blt_set_target'), [{ name: 't', label: I18n.t('blt_target'), type: 'number', value: s.target }],
          (data) => { const t = parseInt(data.t, 10); if (t > 0) s.target = t; paint(); });
      }

      function ico(d) { return UI.el('span', { class: 'blt-ic', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="' + d + '"/></svg>' }); }

      paint();
    }
  });
})();
