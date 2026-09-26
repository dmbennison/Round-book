/* 08-backup-import.js -- Backup/restore/export and importing customers from a spreadsheet.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- first-run onboarding ----------
   Shown once, before anything else, on a genuinely fresh install (no
   customers yet, and this hasn't been dismissed before). Splits straight
   away into two paths: an existing user goes straight to Backup & restore
   to bring their data back; a new user gets a short 2-step setup instead. */
function maybeShowFirstRun(){
  if(data.customers.length > 0) return;
  if(localStorage.getItem('roundBookOnboardingSeen')) return;
  openWelcomeSheet();
}
function markOnboardingSeen(){ localStorage.setItem('roundBookOnboardingSeen', '1'); }

function openWelcomeSheet(){
  openSheet(`
    <div style="text-align:center; padding:8px 4px 4px;">
      <div style="font-size:2.5rem; margin-bottom:10px;">🪟</div>
      <h2 style="margin:0 0 8px;">Welcome to Round Book</h2>
      <p style="color:var(--ink-muted); font-size:0.875rem; line-height:1.6; margin:0 6px 22px;">A simple, offline window cleaning round tracker. Let's get you set up — are you new here, or moving over from an existing backup?</p>
    </div>
    <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="chooseNewUser()">✨ I'm new — set up my account</button>
    <button class="btn" style="width:100%; background:var(--blue-dim); color:var(--blue-deep);" onclick="chooseExistingUser()">📂 I'm an existing user — restore my backup</button>
  `);
}
function chooseExistingUser(){
  markOnboardingSeen();
  closeSheet();
  openBackup();
}
function chooseNewUser(){
  markOnboardingSeen();
  openOnboardingBusiness();
}
function openOnboardingBusiness(){
  openSheet(`
    <div class="sheet-head"><h2 style="flex:1; min-width:0;">Set up — your business</h2></div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px; line-height:1.5;">This fills in your texts, invoices, and reports automatically. You can change any of it later in Settings.</p>
    <label style="margin-top:0;">Company name</label>
    <input type="text" id="ob_company" value="${escapeAttr(data.settings.companyName||'')}" placeholder="e.g. Darren's Window Cleaning">
    <label>Your name</label>
    <input type="text" id="ob_yourname" value="${escapeAttr(data.settings.yourName||'')}" placeholder="e.g. Dave">
    <div class="section-label">How do you text customers?</div>
    <div class="seg-row">
      <button type="button" class="seg-btn ${data.settings.messagingApp!=='whatsapp'?'active':''}" onclick="setMessagingApp('sms'); openOnboardingBusiness();">💬 Text message</button>
      <button type="button" class="seg-btn ${data.settings.messagingApp==='whatsapp'?'active':''}" onclick="setMessagingApp('whatsapp'); openOnboardingBusiness();">🟢 WhatsApp</button>
    </div>
    <div class="form-actions" style="margin-top:20px;">
      <button class="btn-primary" onclick="saveOnboardingBusiness()">Continue</button>
    </div>
    <button class="btn-danger-text" onclick="openOnboardingFinish()">Skip this for now</button>
  `);
}
function saveOnboardingBusiness(){
  data.settings.companyName = document.getElementById('ob_company').value.trim();
  data.settings.yourName = document.getElementById('ob_yourname').value.trim();
  saveData();
  openOnboardingFinish();
}
function openOnboardingFinish(){
  openSheet(`
    <div style="text-align:center; padding:8px 4px 4px;">
      <div style="font-size:2.5rem; margin-bottom:10px;">🎉</div>
      <h2 style="margin:0 0 8px;">You're all set</h2>
      <p style="color:var(--ink-muted); font-size:0.875rem; line-height:1.6; margin:0 6px 22px;">Add customers one at a time, or bring in a whole round from a spreadsheet.</p>
    </div>
    <button class="backup-btn" onclick="closeSheet(); openCustomerForm();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
      <div><div class="t1">Add your first customer</div><div class="t2">Address, price, round, and how often they're due</div></div>
    </button>
    <button class="backup-btn" onclick="closeSheet(); document.getElementById('importSpreadsheetFile').click();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>
      <div><div class="t1">Import from a spreadsheet</div><div class="t2">.csv or .xlsx — bring in a whole round at once</div></div>
    </button>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:16px 2px 0; line-height:1.5;">Tap the <b>?</b> icon on any screen for help with that part of the app, any time.</p>
    <button class="btn" style="width:100%; background:var(--line); color:var(--ink-muted); margin-top:14px;" onclick="closeSheet()">I'll have a look around first</button>
  `);
}

/* ---------- getting-started checklist ----------
   A small, dismissible nudge on the Today tab for anyone who skipped parts
   of onboarding — reopens the relevant screen for whatever's still missing,
   from the same three things the welcome flow offers. Disappears for good
   once dismissed or once nothing's left outstanding. */
function checklistItemsRemaining(){
  const items = [];
  if(!data.settings.companyName) items.push({label:'Add your business details', action:'openBusinessDetails()'});
  if(!data.customers.length) items.push({label:'Add your first customer', action:'openCustomerForm()'});
  if(daysSinceBackup() === Infinity) items.push({label:'Make your first backup', action:'openBackup()'});
  return items;
}
function renderGettingStartedCard(){
  if(localStorage.getItem('roundBookChecklistDismissed')) return '';
  const items = checklistItemsRemaining();
  if(!items.length) return '';
  return `<div style="background:var(--blue-dim); border-radius:14px; padding:14px 16px; margin-bottom:16px;">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
      <b style="color:var(--blue-deep); font-size:0.875rem;">Getting started</b>
      <button onclick="dismissGettingStarted()" style="background:none; border:none; color:var(--blue-deep); font-weight:800; font-size:1rem; line-height:1; padding:0 2px;">✕</button>
    </div>
    ${items.map(i=>`<button onclick="${i.action}" style="display:flex; align-items:center; gap:8px; width:100%; text-align:left; background:none; border:none; padding:6px 0; color:var(--blue-deep); font-size:0.8125rem; font-weight:700;">
      <span style="width:16px; height:16px; border:2px solid var(--blue-deep); border-radius:50%; flex-shrink:0;"></span> ${escapeHtml(i.label)}
    </button>`).join('')}
  </div>`;
}
function dismissGettingStarted(){
  localStorage.setItem('roundBookChecklistDismissed', '1');
  render();
}
function reopenGettingStarted(){
  localStorage.removeItem('roundBookChecklistDismissed');
  localStorage.removeItem('roundBookOnboardingSeen');
  closeSheet();
  openWelcomeSheet();
}

// Shares plain-English install instructions plus the app link, via the native
// share sheet where available (so it can go straight out over WhatsApp, text,
// email, etc.), falling back to copying the message to the clipboard.
async function shareRoundBook(){
  const url = 'https://dmbennison.github.io/Round-book/';
  const text = `Round Book — a simple window cleaning round tracker.\n\nTo install it on your phone:\n📱 iPhone: open this link in Safari, tap the Share icon, then "Add to Home Screen".\n🤖 Android: open this link in Chrome, tap the menu (⋮), then "Add to Home Screen" or "Install app".\n\n${url}`;
  if(navigator.share){
    try{
      await navigator.share({ title: 'Round Book', text });
      return;
    }catch(e){
      if(e && e.name === 'AbortError') return; // person cancelled the share sheet
    }
  }
  try{
    await navigator.clipboard.writeText(text);
    toast('Install instructions copied — paste them anywhere to share');
  }catch(e){
    toast('Could not share automatically — link: ' + url);
  }
}

function openInfo(){
  openSheet(`
    <div class="sheet-head">
      <h2>About Round Book</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink); font-size:0.875rem; line-height:1.6; margin:0 2px 16px;">
      Round Book is a simple, offline window cleaning round tracker — built to keep on top of customers, rounds, cleaning and payment dates, all stored privately on your own phone.
    </p>
    <button onclick="openHelp()" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--blue-dim); color:var(--blue-deep); border:1px solid var(--box-border); border-radius:12px; padding:13px 14px; font-weight:800; font-size:0.9375rem; margin-bottom:10px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span style="flex:1;">User guide — how everything works</span>
      <span style="opacity:0.6;">›</span>
    </button>
    <button onclick="reopenGettingStarted()" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--blue-dim); color:var(--blue-deep); border:1px solid var(--box-border); border-radius:12px; padding:13px 14px; font-weight:800; font-size:0.9375rem; margin-bottom:10px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px; flex-shrink:0;"><path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.2-6.3-4.5L5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>
      <span style="flex:1;">Getting started — run first-time setup again</span>
      <span style="opacity:0.6;">›</span>
    </button>
    <button onclick="shareRoundBook()" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--surface); border:1px solid var(--box-border); color:var(--ink); border-radius:12px; padding:13px 14px; font-weight:800; font-size:0.9375rem; margin-bottom:16px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px; flex-shrink:0;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      <span style="flex:1;">Share Round Book</span>
      <span style="opacity:0.6;">›</span>
    </button>
    <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.6; margin:0 2px 6px;">
      Created by <b style="color:var(--ink);">D M Bennison using Claude</b>.
    </p>
    <p style="color:var(--ink-muted); font-size:0.75rem; line-height:1.6; margin:0 2px 6px;">
      Version ${formatVersion(APP_VERSION)}
    </p>
    <button onclick="openVersionHistory()" style="background:none; border:none; padding:0; color:var(--blue); font-size:0.75rem; font-weight:700; margin:0 2px 18px; display:block;">What's changed recently →</button>
    <p style="color:var(--ink-muted); font-size:0.7812rem; line-height:1.6; margin:0 2px 10px;">
      Spotted a problem, got an idea for an improvement, or just want to say something about the app? Get in touch — feedback's always welcome.
    </p>
    <a href="mailto:dmbennison@gmail.com?subject=Round%20Book%20feedback" style="display:block; text-decoration:none; background:var(--blue-dim); color:var(--blue-deep); border-radius:12px; padding:12px; text-align:center; font-weight:800; font-size:0.875rem;">✉️ dmbennison@gmail.com</a>
  `);
}

// Shows what's changed over the most recent versions — always capped to the last
// 10 entries in VERSION_HISTORY, however many are actually kept in that array.
function openVersionHistory(){
  const entries = VERSION_HISTORY.slice(0, 10);
  const rowsHtml = entries.map(v => `
    <div style="margin-bottom:16px;">
      <div style="font-size:0.8125rem; font-weight:800; color:var(--ink); margin-bottom:4px;">Version ${formatVersion(v.version)}</div>
      <ul style="margin:0; padding-left:18px; color:var(--ink-muted); font-size:0.8125rem; line-height:1.6;">
        ${v.changes.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>
    </div>
  `).join('') || '<p style="color:var(--ink-muted); font-size:0.8438rem;">No version history recorded yet.</p>';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Version history</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 16px;">Showing the last ${entries.length} version${entries.length===1?'':'s'}.</p>
    ${rowsHtml}
  `, () => openInfo());
}

function helpH(text){
  return `<div style="font-size:1.0625rem; font-weight:800; color:var(--ink); margin:26px 2px 10px; padding-top:16px; border-top:1px solid var(--line);">${text}</div>`;
}
function helpP(text){
  return `<p style="color:var(--ink); font-size:0.8438rem; line-height:1.6; margin:0 2px 12px;">${text}</p>`;
}
let helpReturnCallback = null;
// Same "?" help icon as helpIconBtn, but sized/styled for a main tab screen's own
// header row (next to that screen's print icon) rather than a sheet's header.
function mainScreenHelpBtn(topic, returnTo){
  return `<button class="btn-open" style="width:38px; height:38px; padding:0;" onclick="openFocusedHelp('${topic}', ${returnTo})" aria-label="Help">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  </button>`;
}
function helpIconBtn(topic, returnTo){
  helpReturnCallback = returnTo || null;
  return `<button class="sheet-close" style="flex-shrink:0; margin-right:6px;" onclick="openFocusedHelp('${topic}')" aria-label="Help for this screen">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  </button>`;
}
function helpRow(left, right){
  return `<div style="display:flex; justify-content:space-between; gap:12px; align-items:center; padding:10px 2px; border-bottom:1px solid var(--line);">
    <span style="font-size:0.8125rem; font-weight:700; color:var(--ink);">${left}</span>
    <span style="font-size:0.8125rem; color:var(--ink-muted); text-align:right;">${right}</span>
  </div>`;
}

// Single source of truth for help content — the full User Guide is these sections one after
// another, and the "?" icon dotted around the app opens just the one relevant section plus a
// link through to the full guide, so the two never drift out of sync with each other.
const FOCUSED_HELP = {
  today: {
    title: 'Today',
    body: () => [
      helpP('A "Getting started" card sits above the hero for anything left outstanding from first-time setup — business details, first customer, first backup — until everything\'s done or you dismiss it with the ✕. Re-run first-time setup any time from the "i" menu.'),
      helpP('Today is the home screen. The top hero card shows what\'s due today, its value, today\'s clean total and paid total, and — if more than one round has anyone due — a row of round chips underneath. Tap a chip to jump straight to that round\'s Due list; the hero then stays scoped to that round (its own due count, and a live "cleaned" count next to it as you work through it) until you pick a different round or a new day starts. Below the hero, five tiles: text before visit, mileage, jobs today, payment reminders, and quotes needing follow-up — in that order, mileage early since it\'s usually the first thing you\'d log. Tap any of them to go straight to the full screen for it.'),
      helpP('Text before visit and quotes needing follow-up show a small "X overdue" / "X well overdue" note underneath the count when there is one, so you can see at a glance if any are genuinely overdue rather than just due today or freshly past their follow-up window.'),
      helpP('The Mileage tile logs a start-of-day reading on first tap and an end-of-day reading on the next tap — both readings stay visible on the tile once logged, and the day\'s total appears once both are in. Tap again to view, edit, or clear it. See it broken down by day/week/month/tax-year-to-date in Reports.')
    ]
  },
  work: {
    title: 'Work',
    body: () => [
      helpP('Work has two buttons: Rounds and One-off jobs, with your customer count, round value, and average price by property type underneath.')
    ]
  },
  rounds: {
    title: 'Rounds',
    body: () => [
      helpP('Open Rounds from the Work tab. Use the Rounds / Due / Text first / Owed switch at the top, or open a single round to see its customers. Swipe a card halfway right to mark cleaned, all the way right to mark cleaned AND paid in one go, or left to mark paid alone — the background colour shows which action you\'re about to trigger as you drag. Every swipe action can be undone for a few seconds afterwards via the Undo button on the confirmation. Use Reorder to set your walking order — drag the ⠿ handle on each customer, or use the arrows.'),
      helpP('A round card shows its customer count and value as price/owed, with paused customers left out of both.'),
      helpP('A round\'s ⋯ menu has: Show map (numbered stops with a route line), Start round (directions for every stop), Print, Defer the whole round 4 weeks, Set whole round due date (pick an exact date for everyone at once), and Apply price uplift (a % or flat £ increase for every active customer in the round).'),
      helpP('Suggest a route order is inside Reorder — it works out a shorter visiting order using real road distances where possible, and shows it to you before changing anything (nothing\'s applied unless you tap "Use this order"). Both this and Show map re-check every address\'s location each time, unless it\'s been manually corrected (see below).'),
      helpP('On the map, every address gets a pin — one that couldn\'t be found automatically shows as a grey dashed pin near the others. Drag any pin to fix its spot; dragging locks it there, so it\'s never fetched again and won\'t be moved by a later map or route request.'),
      helpP('The photo icon on the Rounds screen opens the photo gallery.'),
      helpP('The Owed view (and "Remind all") sorts by how long a balance has actually been outstanding, not just its size, so the most overdue customer comes first. The payment reminder wording automatically gets firmer from the second reminder onward — edit both versions under Settings > Message templates.'),
      helpP('The small green phone button calls a customer; the small blue compass button opens directions to their address. A red "⚠ Chase" badge appears after 2+ unpaid payment reminders. A "💷 Low" badge appears if a customer\'s price is 15%+ below the average for their property type — their own round\'s average for that type once there are 4+ of them, otherwise the overall average for that type across every round.')
    ]
  },
  jobs: {
    title: 'One-off jobs',
    body: () => [
      helpP('For anything outside your regular rounds. Swipe right for done (undo appears for a few seconds after), left for paid. A completed job can be turned into a quote, invoiced, or sent as a PDF.'),
      helpP('Add a discount percentage right next to the price (0 by default) — it\'s applied automatically to that job\'s invoice total and receipt message, while the price itself stays the full rate everywhere else. A payment reminder can only be sent once a job is marked done, and a red "⚠ Chase" badge appears after 2+ unpaid reminders, same as on customers.'),
      helpP('If a job\'s address matches an existing customer, it links to them automatically and shows in their history.'),
      helpP('The small green phone button calls; the small blue compass button opens directions. The printer icon prints every job with status and value.')
    ]
  },
  customer: {
    title: 'Customers',
    body: () => [
      helpP('A customer\'s screen shows their round, price, frequency, balance, and notes at the top, with Actions, History, and Photos collapsing into their own sections.'),
      helpP('If you\'ve made changes and try to close the edit screen without saving, you\'ll be asked whether to save first.'),
      helpP('"Add a clean" and "Add a payment" open a quick pop-up for the date and amount. Tapping a history entry opens Edit, Remove, and (for payments) Send receipt.'),
      helpP('Every text (reminders, receipts, quotes) opens a preview you can edit first, and only offers to send to a mobile number. "Messages" under History lists everything actually sent.'),
      helpP('Tick "Text before I arrive" to flag a customer who needs a heads-up text. Tick "Don\'t send marketing texts" to opt them out of every campaign — this doesn\'t affect calls, quotes, or normal reminders.'),
      helpP('Property type, add-ons, and "fronts only" can be recorded here too — fronts-only counts as half a house in average-price figures.'),
      helpP('An active customer\'s due date can be pushed +4 weeks or set to an exact date, any time — not just once already deferred. "Apply price uplift" increases their price by a % or a flat £ amount in one step, recorded in their price history.')
    ]
  },
  quotes: {
    title: 'Quotes',
    body: () => [
      helpP('Swipe right to accept, left to decline. Accepted quotes convert into a job or customer — if the address matches an existing customer, it links automatically. Quotes left Pending past their follow-up window (7 days by default) are flagged on the Today tab. Each follow-up text sent gets a little softer in wording, and automatically pushes the next one further out, so an unanswered quote doesn\'t nag forever on a fixed weekly cycle.'),
      helpP('Start a quote from an existing customer\'s screen with "Get a quote for this customer" to pre-fill their details.')
    ]
  },
  marketing: {
    title: 'Marketing',
    body: () => [
      helpP('Marketing is a list of campaigns. Tap one to open its page: an editable name and message, a Send group text button, and the list of texts sent for that campaign. Tap "+ Add a campaign" to create another.'),
      helpP('Send group text can also be narrowed by property type, add-ons (conservatory/extension/garage door), and fronts-only — useful for a campaign aimed at, say, conservatory cleaning specifically.'),
      helpP('Send group text: tick which rounds (or paused/lapsed customers) to include, optionally skip anyone already Interested/Booked or texted recently, then tap Send for each customer in turn — it opens Messages/WhatsApp pre-filled, one at a time.'),
      helpP('Round Book can\'t see replies — check your own Messages/WhatsApp, then record what happened: a response and a next action, each with an optional follow-up date.'),
      helpP('Anyone opted out of marketing (set on their own customer screen) is always excluded, on every campaign.')
    ]
  },
  reports: {
    title: 'Reports',
    body: () => [
      helpP('Tap the printer icon for a list of reports. Choose <b>Print</b> (good for saving as a PDF too) or <b>Save as Word document</b> for an editable .docx. Both work offline.'),
      helpRow('Round cleaning dates', 'List or calendar, last 5 weeks'),
      helpRow('Earnings report', 'Totals by week/month/year'),
      helpRow('Daily work done', 'Value completed, day by day'),
      helpRow('Monthly schedule', 'Calendar of rounds and jobs due'),
      helpRow('One-off jobs', 'Every job, status and value'),
      helpRow('Property types', 'Houses and average price by type'),
      helpRow('Mileage', 'Daily, weekly, monthly, tax-year-to-date'),
      helpRow('Price review due', '12+ months since last increase; plus anyone priced below their property type\'s average'),
      helpRow('Upsell opportunities', 'Fronts-only, conservatory, garage door and gutter add-ons worth offering — print it, or use "Text upsell opportunities" above it to pick a marketing campaign and send straight to that list')
    ]
  },
  backup: {
    title: 'Backup and restore',
    body: () => [
      helpP('Everything lives only on this phone. Back up regularly from the Backup icon — export a full backup, export to Excel, export everyone as a contacts file, restore from a backup file, or import customers from a spreadsheet.'),
      helpP('A pop-up appears if a change hasn\'t been backed up for 48 hours. "Not now" only puts it off for this visit to the app — it reappears next time you open Round Book until you actually back up.')
    ]
  },
  settings: {
    title: 'Settings',
    body: () => [
      helpP('Appearance, text size, colour scheme, and messaging app (text or WhatsApp) live on the main Settings screen. Light/Dark/Auto picks whether the app follows your phone\'s system setting or a fixed choice. Business details and message templates each have their own screen, opened from a button here.')
    ]
  },
  reminders: {
    title: 'Reminders and banners',
    body: () => [
      helpP('Job anniversaries, marketing follow-ups due, and imported customers awaiting review appear as a dismissible banner across the top of the app. The backup reminder is a pop-up instead (see Backup and restore). Jobs due today and quotes needing follow-up are covered by the Today tab instead.')
    ]
  }
};
const FOCUSED_HELP_ORDER = ['today','work','rounds','jobs','quotes','marketing','customer','reminders','backup','reports','settings'];

function openFocusedHelp(topic, explicitReturnTo){
  const h = FOCUSED_HELP[topic];
  const returnTo = explicitReturnTo || helpReturnCallback;
  if(!h){ openHelp(returnTo); return; }
  openSheet(`
    <div class="sheet-head">
      <h2>${escapeHtml(h.title)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    ${h.body().join('')}
    <button onclick="openHelp(helpReturnCallback)" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--blue-dim); color:var(--blue-deep); border:1px solid var(--box-border); border-radius:12px; padding:12px 14px; font-weight:800; font-size:0.8438rem; margin-top:6px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span style="flex:1;">Full user guide</span>
      <span style="opacity:0.6;">›</span>
    </button>
  `, returnTo);
}

function openHelp(returnTo){
  openSheet(`
    <div class="sheet-head">
      <h2>User guide</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>

    ${helpP('Round Book is a simple, offline window cleaning round tracker. It keeps track of customers, rounds, cleaning and payment dates, one-off jobs, and quotes — all stored privately on your own phone.')}

    ${helpH('Getting around')}
    ${helpP('Four tabs: <b>Today</b> (your home screen), <b>Work</b> (Rounds and One-off jobs), <b>Quotes</b>, and <b>Marketing</b>. The blue + button adds something appropriate to whichever screen you\'re on. Header icons: <b>Search</b> (customers, jobs, quotes, and rounds, all in one place), <b>About</b>, <b>Reports</b>, <b>Backup</b>, <b>Settings</b>. Look for a <b>?</b> next to a screen\'s print icon for help on just that screen.')}

    ${FOCUSED_HELP_ORDER.map(key=>{
      const h = FOCUSED_HELP[key];
      return helpH(h.title) + h.body().join('');
    }).join('')}

    ${helpH('Feedback')}
    ${helpP('Spotted a problem or got an idea? Get in touch — feedback\'s always welcome.')}
    <a href="mailto:dmbennison@gmail.com?subject=Round%20Book%20feedback" style="display:block; text-decoration:none; background:var(--blue-dim); color:var(--blue-deep); border-radius:12px; padding:12px; text-align:center; font-weight:800; font-size:0.875rem; margin-bottom:4px;">✉️ dmbennison@gmail.com</a>
  `, returnTo);
}

// Browser-reported estimate of how much of the phone's storage this app is
// actually using, out of what it could use — covers everything now (customer/job
// data and photos both live in IndexedDB), so a single figure is meaningful.
// It's an estimate rather than a hard number (browsers deliberately don't
// guarantee precision here), but on modern iOS this reports a genuinely large
// quota since Apple bases it on a share of the phone's total free disk space.
async function getStorageEstimate(){
  try{
    if(navigator.storage && navigator.storage.estimate){
      const {usage, quota} = await navigator.storage.estimate();
      if(quota) return {usage, quota};
    }
  }catch(e){}
  return null;
}
function formatBytes(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  if(bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(1) + ' MB';
  return (bytes/(1024*1024*1024)).toFixed(1) + ' GB';
}

async function openBackup(){
  const count = data.customers.length;
  const days = daysSinceBackup();
  const lastText = days === Infinity ? "You haven't backed up yet" : days === 0 ? "Backed up today" : `Last backup: ${days} day${days===1?'':'s'} ago`;

  // Storage itself isn't worth showing day-to-day — everything lives in
  // IndexedDB now, and typical phone storage is large enough that nobody needs
  // to think about it. A warning only appears here once it's actually relevant
  // (getting close to full), rather than a running total nobody asked for.
  const estimate = await getStorageEstimate();
  let storageWarning = '';
  if(estimate){
    const pctUsed = Math.round((estimate.usage / estimate.quota) * 100);
    if(pctUsed >= 80){
      const isCritical = pctUsed >= 95;
      storageWarning = `<div style="background:${isCritical?'var(--red-dim)':'var(--amber-dim)'}; border-radius:12px; padding:12px 14px; margin-bottom:16px; font-size:0.8125rem; font-weight:700; color:${isCritical?'var(--red)':'var(--amber)'}; line-height:1.5;">
        ⚠️ Storage is ${pctUsed}% full (${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)} available on this phone). Back up now, and consider deleting some old photos to free up space.
      </div>`;
    }
  }

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Backup &amp; restore</h2>
      ${helpIconBtn('backup', () => openBackup())}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 4px;">
      Everything is stored only on this phone, in this browser. Nothing is sent anywhere. Export a backup regularly in case the app data is ever cleared.
    </p>
    <p style="color:${backupReminderDue()?'var(--amber)':'var(--ink-muted)'}; font-size:0.7812rem; font-weight:700; margin:0 2px 16px;">${lastText}</p>
    ${storageWarning}
    <button class="backup-btn" onclick="exportData()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
      <div><div class="t1">Export backup</div><div class="t2">${count} customer${count===1?'':'s'} · saves a .json file</div></div>
    </button>
    <button class="backup-btn" onclick="exportExcel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>
      <div><div class="t1">Export as Excel</div><div class="t2">One sheet per round · .xlsx file</div></div>
    </button>
    <button class="backup-btn" onclick="exportContacts()">
      ${ADD_CONTACT_ICON}
      <div><div class="t1">Export contacts</div><div class="t2">Every customer with a phone, email, or address · .vcf file</div></div>
    </button>
    <button class="backup-btn" onclick="document.getElementById('importFile').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
      <div><div class="t1">Restore from backup</div><div class="t2">Replaces current data with a backup file</div></div>
    </button>
    <button class="backup-btn" onclick="document.getElementById('importSpreadsheetFile').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/><path d="M14 14l3 3 3-3" transform="translate(0,-2)"/></svg>
      <div><div class="t1">Import customers from spreadsheet</div><div class="t2">.csv or .xlsx — added to a "needs review" round to check over</div></div>
    </button>
  `);
}
async function exportData(){
  toast('Preparing backup…');
  // Photos live in IndexedDB, not in `data` — bundle them into the export as base64
  // under `_photoBlobs` so a single backup file stays a complete, portable copy of
  // everything, exactly as it was before photos moved out of localStorage.
  const exportObj = JSON.parse(JSON.stringify(data)); // shallow-safe clone before mutating
  let failedPhotoCount = 0;
  if(photoStorageAvailable){
    const referenced = new Set();
    (exportObj.customers||[]).forEach(c => (c.photos||[]).forEach(p=>referenced.add(p.id)));
    (exportObj.oneOffJobs||[]).forEach(j => (j.photos||[]).forEach(p=>referenced.add(p.id)));
    const photoBlobs = {};
    // Each photo is read and encoded independently. This used to be one shared
    // try/catch around the whole Promise.all — a single photo failing to read or
    // convert threw before `_photoBlobs` was ever assigned, silently dropping every
    // photo from the backup with no warning. Now one bad photo just gets skipped
    // (and counted) while the rest of the backup, photos included, still goes out.
    await Promise.all([...referenced].map(async id => {
      try{
        const blob = await idbGetPhoto(id);
        if(blob) photoBlobs[id] = await blobToDataURL(blob);
      }catch(e){ failedPhotoCount++; }
    }));
    exportObj._photoBlobs = photoBlobs;
  }
  const jsonStr = JSON.stringify(exportObj, null, 2);
  const filename = `round-book-backup-${todayISO()}.json`;

  const markBackedUp = ()=>{
    localStorage.setItem('roundBookLastBackup', todayISO());
    clearPendingBackupChange();
    bannerDismissed = false;
    renderBackupBanner();
  };
  const backedUpToast = (defaultMsg) => toast(failedPhotoCount
    ? `Backup saved, but ${failedPhotoCount} photo${failedPhotoCount===1?'':'s'} couldn't be included`
    : defaultMsg);

  if(navigator.canShare){
    try{
      const file = new File([jsonStr], filename, {type:'application/json'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:'Round Book Backup'});
        markBackedUp();
        backedUpToast('Backup shared');
        return;
      }
    }catch(e){
      if(e && e.name === 'AbortError') return;
      // fall through to classic download on any other failure
    }
  }

  const blob = new Blob([jsonStr], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
  markBackedUp();
  backedUpToast('Backup saved');
}
document.getElementById('importFile').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(evt){
    let parsed;
    try{
      parsed = JSON.parse(evt.target.result);
      if(!parsed.customers || !Array.isArray(parsed.customers)) throw new Error('bad format');
    }catch(err){
      alert('That file could not be read as a Round Book backup.');
      return;
    }
    appConfirm(`Import ${parsed.customers.length} customers? This will replace all data currently on this phone.`, {title:'Import backup', confirmLabel:'Import', onConfirm: async () => {
      try{
        toast('Restoring backup…');
        const migrated = migrateData(parsed);
        // Handles both a backup from this version (photos bundled under
        // _photoBlobs) and an older backup from before photos moved to IndexedDB
        // (photos still embedded per-entry as dataUrl, same as any legacy data
        // already on the phone). Each returns how many photos it couldn't restore,
        // so the user finds out rather than silently ending up with none.
        const failedBundled = await restoreBundledPhotoBlobs(migrated);
        const failedLegacy = await migrateLegacyPhotosToIndexedDB(migrated);
        data = migrated;
        saveData();
        // Replacing all data outright — start the photo URL cache fresh rather
        // than trying to reconcile it against whatever was cached before.
        photoUrlCache.forEach(url => URL.revokeObjectURL(url));
        photoUrlCache = new Map();
        await preloadAllPhotoUrls();
        await cleanupOrphanedPhotos();
        closeSheet();
        render();
        const failedPhotos = failedBundled + failedLegacy;
        toast(failedPhotos
          ? `Backup restored, but ${failedPhotos} photo${failedPhotos===1?'':'s'} couldn't be recovered`
          : 'Backup restored');
      }catch(err){
        alert('That file could not be read as a Round Book backup.');
      }
    }});
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ---------- import customers from spreadsheet ---------- */
const IMPORT_COLUMN_SYNONYMS = {
  address:   ['address','addr','street','street address','property','location'],
  name:      ['name','customer','customer name','client','clientname','contact name'],
  phone:     ['phone','mobile','tel','telephone','contact','contact number','phone number'],
  email:     ['email','email address','e-mail'],
  round:     ['round','route','area','zone','round name'],
  price:     ['price','amount','cost','fee','value','rate','clean price'],
  frequency: ['frequency','freq','weeks','cycle','interval','frequency (weeks)']
};
function normalizeHeader(h){
  return String(h||'').toLowerCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim();
}
function guessColumnMap(headers){
  const norm = headers.map(normalizeHeader);
  const map = {};
  Object.keys(IMPORT_COLUMN_SYNONYMS).forEach(field=>{
    const synonyms = IMPORT_COLUMN_SYNONYMS[field];
    let found = null;
    // exact match first, then "contains"
    for(const syn of synonyms){
      const idx = norm.indexOf(syn);
      if(idx !== -1){ found = headers[idx]; break; }
    }
    if(!found){
      for(let i=0;i<norm.length;i++){
        if(synonyms.some(syn => norm[i].includes(syn))){ found = headers[i]; break; }
      }
    }
    map[field] = found;
  });
  return map;
}
document.getElementById('importSpreadsheetFile').addEventListener('change', function(e){
  const file = e.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined'){
    toast('Still loading — try again in a moment, or once you have signal');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(evt){
    try{
      const wb = XLSX.read(evt.target.result, {type:'array'});
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      if(!rows.length){ alert('That spreadsheet looks empty — no rows found on the first sheet.'); e.target.value=''; return; }
      const headers = Object.keys(rows[0]);
      const map = guessColumnMap(headers);
      if(!map.address && !map.name){
        alert("Couldn't find an address or name column in that spreadsheet. Make sure the first row has column headers like \"Address\" and \"Name\".");
        e.target.value = '';
        return;
      }

      const existingAddresses = new Set(data.customers.map(c => (c.address||'').trim().toLowerCase()).filter(Boolean));
      let imported = 0, skipped = 0;
      const roundCusts = data.customers.filter(x=>(x.round||'Unassigned')===IMPORT_HOLDING_ROUND);
      let nextOrder = roundCusts.reduce((m,x)=>Math.max(m, x.order!=null?x.order:-1), -1) + 1;

      rows.forEach(row=>{
        const address = map.address ? String(row[map.address]||'').trim() : '';
        const name = map.name ? String(row[map.name]||'').trim() : '';
        if(!address && !name) return; // blank row

        const normalized = address.toLowerCase();
        if(address && existingAddresses.has(normalized)){ skipped++; return; }

        const suggestedRound = map.round ? String(row[map.round]||'').trim() : '';
        const priceRaw = map.price ? parseFloat(String(row[map.price]).replace(/[^0-9.]/g,'')) : NaN;
        const freqRaw = map.frequency ? parseInt(String(row[map.frequency]).replace(/[^0-9]/g,''),10) : NaN;

        const notesParts = [];
        if(suggestedRound) notesParts.push(`Imported — suggested round: ${suggestedRound}`);
        else notesParts.push('Imported from spreadsheet');

        data.customers.push({
          id: uid(),
          name, address,
          phone: map.phone ? String(row[map.phone]||'').trim() : '',
          email: map.email ? String(row[map.email]||'').trim() : '',
          round: IMPORT_HOLDING_ROUND,
          order: nextOrder++,
          price: Number.isFinite(priceRaw) ? priceRaw : 0,
          frequencyWeeks: Number.isFinite(freqRaw) && freqRaw>0 ? freqRaw : 4,
          notes: notesParts.join(' · '),
          cleanHistory: [], paymentHistory: [], priceHistory: []
        });
        if(address) existingAddresses.add(normalized);
        imported++;
      });

      saveData();
      closeSheet();
      render();

      const summary = skipped
        ? `Imported ${imported} customer${imported===1?'':'s'} — ${skipped} skipped as likely duplicates`
        : `Imported ${imported} customer${imported===1?'':'s'}`;
      if(imported){
        openSheet(`
          <div class="sheet-head">
            <h2>Import complete</h2>
            <button class="sheet-close" onclick="closeSheet()">✕</button>
          </div>
          <p style="color:var(--ink); font-size:0.875rem; line-height:1.6; margin:0 2px 10px;">${escapeHtml(summary)}.</p>
          <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.6; margin:0 2px 18px;">They've been placed in a <b>"${escapeHtml(IMPORT_HOLDING_ROUND)}"</b> round rather than their real round, since columns were matched automatically and might not be perfect. Open each one to check the details and assign it to the right round.</p>
          <button class="btn-primary" style="width:100%;" onclick="closeSheet(); setTab('rounds'); openRound(IMPORT_HOLDING_ROUND);">Review imported customers</button>
        `);
      } else {
        toast(skipped ? `All ${skipped} rows already exist — nothing imported` : 'Nothing to import');
      }
    }catch(err){
      alert('That file could not be read. Make sure it\'s a .csv or .xlsx spreadsheet with a header row.');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
});

async function exportExcel(){
  if(typeof XLSX === 'undefined'){
    toast('Still loading — try again in a moment, or once you have signal');
    return;
  }
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  if(!roundNames.length){ toast('No customers to export yet'); return; }

  const wb = XLSX.utils.book_new();
  const usedNames = {};
  function safeSheetName(name){
    let base = (name||'Round').replace(/[\\\/:\*\?\[\]]/g,'').trim().slice(0,31) || 'Round';
    let final = base, i = 2;
    while(usedNames[final]){
      const suffix = ` (${i})`;
      final = base.slice(0, 31-suffix.length) + suffix;
      i++;
    }
    usedNames[final] = true;
    return final;
  }

  const summaryRows = roundNames.map(rn=>{
    const custs = rounds[rn].filter(c=>!c.paused);
    const total = custs.reduce((sum,c)=>sum+Number(c.price||0),0);
    const avg = custs.length ? total/custs.length : 0;
    return {
      'Round': rn,
      'Customers': custs.length,
      'Round Value': total,
      'Average / Customer': Math.round(avg * 100) / 100
    };
  });
  const activeOverall = data.customers.filter(c=>!c.paused);
  const overallCustomers = activeOverall.length;
  const overallValue = activeOverall.reduce((sum,c)=>sum+Number(c.price||0),0);
  summaryRows.push({
    'Round': 'TOTAL (all rounds)',
    'Customers': overallCustomers,
    'Round Value': overallValue,
    'Average / Customer': overallCustomers ? Math.round((overallValue/overallCustomers)*100)/100 : 0
  });
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  summaryWs['!cols'] = [{wch:22},{wch:12},{wch:14},{wch:18}];
  XLSX.utils.book_append_sheet(wb, summaryWs, safeSheetName('Summary'));

  roundNames.forEach(rn=>{
    const custs = sortByRoute(rounds[rn]);
    const rows = custs.map(c=>{
      const s = custStatus(c);
      return {
        'Address': c.address || '',
        'Name': c.name || '',
        'Phone': c.phone || '',
        'Email': c.email || '',
        'Price': Number(c.price || 0),
        'Frequency (weeks)': c.frequencyWeeks || 4,
        'Last Cleaned': s.lastClean ? fmtDate(s.lastClean) : '',
        'Next Due': (()=>{ const d=nextDueISO(c); return d ? fmtDate(d) : ''; })(),
        'Last Paid': s.lastPaid ? fmtDate(s.lastPaid) : '',
        'Amount Owed': s.owed ? s.balance : 0,
        'Notes': c.notes || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:26},{wch:18},{wch:14},{wch:22},{wch:8},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:24}];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(rn));
  });

  if((data.oneOffJobs||[]).length){
    const jobRows = data.oneOffJobs.map(j=>({
      'Date': j.date ? fmtDate(j.date) : '',
      'Address': j.address || '',
      'Name': j.name || '',
      'Phone': j.phone || '',
      'Price': Number(j.price || 0),
      'Done': j.done ? 'Yes' : 'No',
      'Paid': j.paid ? 'Yes' : 'No',
      'Notes': j.notes || ''
    }));
    const jobsWs = XLSX.utils.json_to_sheet(jobRows);
    jobsWs['!cols'] = [{wch:12},{wch:26},{wch:18},{wch:14},{wch:8},{wch:8},{wch:8},{wch:24}];
    XLSX.utils.book_append_sheet(wb, jobsWs, safeSheetName('One-off Jobs'));
  }

  const filename = `round-book-${todayISO()}.xlsx`;

  if(navigator.canShare){
    try{
      const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      const file = new File([wbout], filename, {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:'Round Book Export'});
        toast('Excel file shared');
        return;
      }
    }catch(e){
      if(e && e.name === 'AbortError') return;
      // fall through to classic download on any other failure
    }
  }

  XLSX.writeFile(wb, filename);
  toast('Excel file saved');
}

