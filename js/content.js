/* ===========================================================
   Site content — EDIT THIS FILE to change what the site shows.
   This is the single place for tournaments, contact info, and
   the idea-form target. No code knowledge needed for most edits.
   =========================================================== */
window.CONTENT = {

  // Contact details (shown on the Contact page + footer)
  contact: {
    email: 'Aziz@aldewaniah.com'
  },

  // Where the homepage "share your idea" form sends to.
  // 'mailto' opens the visitor's email app addressed to the email above.
  // Later this can be switched to a backend (Firebase) to collect ideas in-app.
  ideaForm: {
    mode: 'mailto'
  },

  // Ramadan Baloot tournaments — newest first.
  // To add a new tournament: copy a block, change the fields, and put the
  // bracket's embed URL (from Challonge or BracketHQ). It appears automatically.
  tournaments: [
    {
      id: '4th',
      name: { ar: 'البطولة الرمضانية الرابعة', en: '4th Ramadan Tournament' },
      status: { ar: 'منتهية', en: 'Finished' },
      embed: 'https://brackethq.com/b/k7x9c/embed/'
    },
    {
      id: '3rd',
      name: { ar: 'البطولة الرمضانية الثالثة', en: '3rd Ramadan Tournament' },
      status: { ar: 'منتهية', en: 'Finished' },
      embed: 'https://brackethq.com/b/jozjc/embed/'
    },
    {
      id: '2nd',
      name: { ar: 'البطولة الرمضانية الثانية', en: '2nd Ramadan Tournament' },
      status: { ar: 'منتهية', en: 'Finished' },
      embed: 'https://challonge.com/yv33tlw6/module'
    },
    {
      id: '1st',
      name: { ar: 'البطولة الرمضانية الأولى', en: '1st Ramadan Tournament' },
      status: { ar: 'منتهية', en: 'Finished' },
      embed: 'https://challonge.com/xu2eyp8h/module'
    }
  ]
};
