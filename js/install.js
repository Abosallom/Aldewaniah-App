/* ===========================================================
   Install prompt — shows a dismissible banner to anyone who
   opens the app in a BROWSER (not already installed to the home
   screen), with a one-tap install on Android (beforeinstallprompt)
   and a step-by-step guide for iPhone (Safari has no auto-prompt).
   =========================================================== */
(function () {
  // Already running as an installed app? Then never show the banner.
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (standalone) return;

  const DISMISS_KEY = 'aldewaniah.installDismissed';
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  function dismissedRecently() {
    try { const t = +localStorage.getItem(DISMISS_KEY) || 0; return Date.now() - t < WEEK; }
    catch (e) { return false; }
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  I18n.extend({
    ar: {
      inst_msg: 'ثبّت «الديوانية» على شاشتك الرئيسية',
      inst_install: 'تثبيت', inst_how: 'طريقة التثبيت', inst_close: 'إغلاق',
      inst_guide_title: 'كيف تثبّت التطبيق؟',
      inst_ios_h: 'على آيفون / آيباد (Safari)',
      inst_ios_1: 'اضغط زر المشاركة في شريط المتصفح',
      inst_ios_2: 'اختر «إضافة إلى الشاشة الرئيسية»',
      inst_ios_3: 'اضغط «إضافة»',
      inst_and_h: 'على أندرويد (Chrome)',
      inst_and_1: 'افتح قائمة المتصفح (⋮)',
      inst_and_2: 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»',
      inst_and_3: 'أكّد التثبيت'
    },
    en: {
      inst_msg: 'Install “Al Dewaniah” on your home screen',
      inst_install: 'Install', inst_how: 'How to install', inst_close: 'Close',
      inst_guide_title: 'How to install the app',
      inst_ios_h: 'On iPhone / iPad (Safari)',
      inst_ios_1: 'Tap the Share button in the browser bar',
      inst_ios_2: 'Choose “Add to Home Screen”',
      inst_ios_3: 'Tap “Add”',
      inst_and_h: 'On Android (Chrome)',
      inst_and_1: 'Open the browser menu (⋮)',
      inst_and_2: 'Choose “Install app” or “Add to Home screen”',
      inst_and_3: 'Confirm install'
    }
  });

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; render(); });
  window.addEventListener('appinstalled', () => { try { localStorage.setItem(DISMISS_KEY, Date.now()); } catch (x) {} remove(); });

  function remove() { const b = document.getElementById('installBar'); if (b) b.remove(); }

  function render() {
    remove();
    if (dismissedRecently()) return;
    const primary = deferredPrompt
      ? UI.el('button', { class: 'install-go', onclick: doInstall }, I18n.t('inst_install'))
      : UI.el('button', { class: 'install-go', onclick: guide }, I18n.t('inst_how'));
    const bar = UI.el('div', { id: 'installBar', class: 'install-bar' }, [
      UI.el('span', { class: 'install-ic', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>' }),
      UI.el('span', { class: 'install-text' }, I18n.t('inst_msg')),
      primary,
      UI.el('button', { class: 'install-x', title: I18n.t('inst_close'), onclick: close }, '×')
    ]);
    document.body.appendChild(bar);
  }

  async function doInstall() {
    if (!deferredPrompt) { guide(); return; }
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) {}
    deferredPrompt = null;
    remove();
  }

  function close() { try { localStorage.setItem(DISMISS_KEY, Date.now()); } catch (e) {} remove(); }

  function guide() {
    const backdrop = UI.el('div', { class: 'modal-backdrop' });
    const shut = () => backdrop.remove();
    backdrop.onclick = (e) => { if (e.target === backdrop) shut(); };
    const steps = (h, a) => UI.el('div', { class: 'install-steps' }, [
      UI.el('h4', { class: 'install-steps-h' }, h),
      UI.el('ol', null, a.map((s) => UI.el('li', null, s)))
    ]);
    const ios = steps(I18n.t('inst_ios_h'), [I18n.t('inst_ios_1'), I18n.t('inst_ios_2'), I18n.t('inst_ios_3')]);
    const and = steps(I18n.t('inst_and_h'), [I18n.t('inst_and_1'), I18n.t('inst_and_2'), I18n.t('inst_and_3')]);
    const box = UI.el('div', { class: 'modal' }, [
      UI.el('h3', null, I18n.t('inst_guide_title')),
      isIOS ? ios : and,
      isIOS ? and : ios,
      UI.el('button', { class: 'btn btn-block', style: 'margin-top:10px', onclick: shut }, I18n.t('inst_close'))
    ]);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
  }

  if (window.I18n && I18n.onChange) I18n.onChange(render);
  // initial paint (and again shortly after, in case beforeinstallprompt is slow)
  render();
  setTimeout(render, 1200);

  // Shareable install link: opening the app with ?install=1 (or #install)
  // immediately triggers the native install prompt (Android) or the guide (iOS).
  function autoOpen() {
    const wants = /[?&]install=1\b/.test(location.search) || /(^|[#&])install\b/.test(location.hash);
    if (!wants) return;
    setTimeout(() => { if (deferredPrompt) doInstall(); else guide(); }, 900);
  }
  autoOpen();
})();
