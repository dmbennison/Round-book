/* 08-backup-import.js -- Backup/restore/export and importing customers from a spreadsheet.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- first-run onboarding ----------
   Shown once, before anything else, on a genuinely fresh install (no
   customers yet, and this hasn't been dismissed before). Splits straight
   away into two paths: an existing user goes straight to Backup & restore
   to bring their data back; a new user gets a short 2-step setup instead. */
function maybeShowFirstRun(){
  if(data.customers.length > 0) return false;
  if(localStorage.getItem('roundBookOnboardingSeen')) return false;
  openWelcomeSheet();
  return true;
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
    <button onclick="openPhotoGallery()" style="display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:var(--blue-dim); color:var(--blue-deep); border:1px solid var(--box-border); border-radius:12px; padding:13px 14px; font-weight:800; margin-bottom:10px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px; height:20px; flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
      <span style="flex:1;">Photo gallery — every customer's photos</span>
      <span style="opacity:0.6;">›</span>
    </button>
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

// Bullet list used by the guide sections below.
function helpList(items){
  return `<ul style="margin:0 2px 14px; padding-left:20px; color:var(--ink); font-size:0.8438rem; line-height:1.6;">${items.map(i => `<li style="margin-bottom:6px;">${i}</li>`).join('')}</ul>`;
}

// Single source of truth for help content — the full User Guide is these sections one after
// another, and the "?" icon dotted around the app opens just the one relevant section plus a
// link through to the full guide, so the two never drift out of sync with each other.
const FOCUSED_HELP = {
  today: {
    title: 'Today',
    body: () => [
      helpP('Today is your home screen. The big card at the top shows how many customers are due today, what they’re worth, and how much you’ve cleaned and been paid so far. If more than one round has customers due, tap a round’s chip to see just that round.'),
      helpList([
        '<b>Text before visit</b> – customers you haven’t texted yet who like a heads-up.',
        '<b>Mileage</b> – tap to log your start reading in the morning, tap again for your end reading in the evening.',
        '<b>Jobs</b> – only appears on days when a one-off job is booked.',
        '<b>Customers owing</b> – how much is outstanding, split into 0–14, 14–30 and 30+ days.',
        '<b>Fuel prices map</b> – opens a live map of nearby fuel prices. Tap <b>Locate</b> on the map.'
      ]),
      helpP('Tap any tile to open its full list. A yellow number on the <b>Quotes</b> tab means quotes need following up. The Getting started card helps with first-time setup; dismiss it with the ✕, or restart setup any time from the ⓘ button.'),
      helpP('On an iPad held sideways, the list stays on the left and whatever you open appears on the right.')
    ]
  },
  work: {
    title: 'Work',
    body: () => [
      helpP('Work has two buttons: <b>Rounds</b> and <b>One-off jobs</b>. Tap <b>Statistics</b> to see your customer count, round value, average price per customer and average price by property type.')
    ]
  },
  rounds: {
    title: 'Rounds',
    body: () => [
      helpP('Open <b>Rounds</b> from the Work tab. Use the switch at the top – <b>Rounds / Due / Text first / Owed</b> – or open a single round to see its customers.'),
      helpP('<b>Swipe a customer’s card</b>:'),
      helpList([
        '<b>Halfway right</b> – cleaned.',
        '<b>All the way right</b> – cleaned and paid.',
        '<b>Left</b> – paid.',
        'An <b>Undo</b> button appears for a few seconds afterwards.',
        'After a clean, a “Windows cleaned today” text opens ready to send. You can turn this off in Settings.'
      ]),
      helpP('<b>Press and hold</b> a card for a quick info box – price, last cleaned, last paid, how long they usually take to pay – handy at the door. The green phone button calls and the blue compass button gives directions.'),
      helpP('<b>What the cards show.</b> In the <b>Due</b> view cards show only cleaning information. In the <b>Owed</b> view they show only payment information. Other views show everything. Badges you may see:'),
      helpList([
        '<b>Couldn’t clean</b> – you couldn’t get to them last time.',
        '<b>Chase</b> – two or more payment reminders have gone unanswered.',
        '<b>Next due</b> – when they’re next due a clean.',
        '<b>Low by £X</b> – their price is well below the average for their property type.',
        '<b>📈 Review</b> – it’s been 12+ months since their last price rise.',
        '<b>🏦 Bank / 💷 Cash</b> – how they usually pay.'
      ]),
      helpP('<b>8 and 12 week customers</b> fall due on the same day as the 4-weekly customers in their round (and visit day), so you’re never making a separate trip. Their date is moved to the nearest round visit, never more than two weeks either way.'),
      helpP('<b>Chasing payments.</b> The Owed view lists the longest-overdue customers first (filter by 0–14, 14–30 or 30+ days). Tap <b>✉️ Chase</b> on a card to text them, or <b>Remind all</b> to go down the list. The first reminder is friendly; every one after that is firmer automatically. You can edit both wordings in Settings → Message templates.'),
      helpP('<b>Text first customers.</b> If someone likes a heads-up, tap their <b>Text first</b> badge to text them – it turns into a green <b>Texted</b> tick so you don’t send twice. <b>Text all</b> skips anyone already texted.'),
      helpP('<b>A round’s ⋯ menu</b> has:'),
      helpList([
        '<b>Show map</b> – numbered stops. Drag a pin to correct an address; it then stays where you put it.',
        '<b>Start round</b> – directions to every stop.',
        '<b>Print</b>, <b>Defer</b> (push everyone back a day, a week, four weeks or to a date) and <b>Apply price uplift</b> (a % or £ increase for the whole round).'
      ]),
      helpP('<b>Reorder</b> sets your visiting order: drag the ⠿ handle or use the arrows. <b>Suggest a route order</b> shows a shorter route and only applies it if you tap <b>Use this order</b>. Reorder, the map and directions follow whichever filter (Day, All, Due, Owed) you have on.'),
      helpP('Customers imported from a spreadsheet have no price history. Open the customer → Price history → <b>Set last price review date</b> to fix the “Review” reminder.')
    ]
  },
  jobs: {
    title: 'One-off jobs',
    body: () => [
      helpP('For anything outside your regular rounds. Swipe <b>right</b> when it’s done and <b>left</b> when it’s paid (Undo appears for a few seconds).'),
      helpList([
        'Type a <b>discount %</b> next to the price – it’s applied to that job’s invoice and receipt.',
        'If the address matches a customer, the job links to them automatically and shows their Cash or Bank badge.',
        'A finished job can be turned into a quote, invoiced, or sent as a PDF.',
        'Payment reminders can be sent once a job is marked done.',
        'The printer icon prints every job with its status and value.'
      ])
    ]
  },
  customer: {
    title: 'Customers',
    body: () => [
      helpP('Tap a customer to open them. The top shows their round, price, how often they’re cleaned, what they owe and any notes. Below are <b>Actions</b>, <b>History</b> and <b>Photos</b> – tap each to open it.'),
      helpList([
        '<b>Add a clean / Add a payment</b> – pick the date and amount. Tap any entry in History to edit or remove it, or to send a receipt.',
        '<b>Defer</b> – push their next clean back.',
        '<b>Couldn’t clean</b> – use when you couldn’t get to them (locked gate, nobody in, weather). They move to the next round visit (four weeks at most) and their card shows a 🚫 badge until they’re next cleaned.',
        '<b>Get a quote for this customer</b> – starts a quote with their details filled in.',
        '<b>Pays by</b> – Bank or Cash, set when you add or edit a customer. It shows as a small badge on their card. Texts to cash customers leave out your bank details.',
        '<b>Text before I arrive</b> – flags customers who like a heads-up text.',
        '<b>Don’t send marketing texts</b> – leaves them out of every campaign (calls, quotes and reminders are unaffected).',
        'You can also record property type, extras and “fronts only”.'
      ]),
      helpP('Every text opens a preview you can edit before sending. <b>Messages</b> under History lists what you’ve sent. If you try to close the edit screen with unsaved changes, you’ll be asked whether to save first.')
    ]
  },
  photos: {
    title: 'Photos',
    body: () => [
      helpP('Add photos from a customer’s Photos section. Tap one to open it. <b>Pinch</b> or <b>double-tap</b> to zoom, drag to move around, and swipe left or right to see the next photo. All photos are also in the <b>Photo gallery</b>, under the ⓘ button at the top.'),
      helpP('<b>Annotate</b> – circle, draw an arrow, draw freehand or add text to point something out. Choose <b>✋ Move</b> to drag an annotation into place, then <b>🗑 Delete selected</b> to remove it. <b>Undo</b> steps back through everything you’ve done. Annotated photos are saved as a new photo; the original is kept.'),
      helpP('<b>Before & after photo</b> – tap <b>Make a before & after photo</b> (needs two photos of the customer). Pick the Before and After, then choose:'),
      helpList([
        '<b>Landscape</b> – before on the left, after on the right.',
        '<b>Portrait</b> – before on top, after underneath, in the tall shape suited to social media.'
      ]),
      helpP('Both are labelled BEFORE and AFTER (you can change the words). <b>Crop to fill</b> trims each photo to fit; <b>Show whole photos</b> keeps everything. Then <b>Save to photos</b> or <b>Share</b>.'),
      helpP('<b>Send with an offer</b> – for example, a photo of blocked gutters with an offer to clear them. Choose the offer, add a price if you like, check the wording and tap <b>Send</b>. Your share sheet opens with the photo and message – pick Messages or WhatsApp. Some apps leave the text out, so it’s also copied for you to paste. Change the offer wording in Settings → Message templates.')
    ]
  },
  quotes: {
    title: 'Quotes',
    body: () => [
      helpP('A quote is a list of items, each with a description and price, plus an optional discount. The total is the price used everywhere else.'),
      helpList([
        '<b>Open a quote</b> to send it, print it or share it as a PDF, follow it up, or turn it into a customer or one-off job. The pencil edits it.',
        '<b>Swipe right</b> to accept, <b>left</b> to decline. Accepted quotes become a job or customer – an existing customer is linked automatically.',
        'A quote that’s still pending after 7 days counts in the <b>yellow number</b> on the Quotes tab. Each follow-up text is a little softer than the last and waits longer before the next.',
        'A printed quote looks like an invoice but is clearly marked as a quote, with nothing due.'
      ])
    ]
  },
  marketing: {
    title: 'Marketing',
    body: () => [
      helpP('Marketing is a list of campaigns (messages to send to groups of customers). Tap one to edit its name and message and to see who it’s been sent to. Tap <b>+ Add a campaign</b> to make another.'),
      helpList([
        '<b>Send group text</b> – tick the rounds to include (or paused and lapsed customers). You can narrow it by property type, extras or fronts-only, and skip anyone already interested, booked or texted recently.',
        'Then tap <b>Send</b> for each customer in turn – it opens Messages or WhatsApp ready to go.',
        'The app can’t see replies, so afterwards record what happened and set a follow-up date if you want one.',
        'Customers marked “Don’t send marketing texts” are always left out.'
      ])
    ]
  },
  reports: {
    title: 'Reports',
    body: () => [
      helpP('Tap the printer icon for a list of reports. Every report, invoice, quote and receipt opens in a preview first, laid out on A4 pages. Scroll it, and pinch (or use − and +) to zoom. The buttons along the bottom are <b>Print</b>, <b>Share PDF</b> and <b>Share doc</b> (an editable Word file).'),
      helpRow('Round cleaning dates', 'List or calendar of recent cleans (4-weekly customers only)'),
      helpRow('Earnings report', 'Totals by week, month and year'),
      helpRow('Daily work done', 'Value completed, day by day'),
      helpRow('Monthly schedule', 'Calendar of rounds and jobs due'),
      helpRow('One-off jobs', 'Every job, status and value'),
      helpRow('Property types', 'Houses and average price by type'),
      helpRow('Mileage', 'Daily, weekly, monthly and tax-year totals, with the mileage allowance'),
      helpRow('Price review due', 'Customers 12+ months since a price rise, or priced below average'),
      helpRow('Upsell opportunities', 'Extras worth offering: fronts-only, conservatory, garage door, gutters')
    ]
  },
  backup: {
    title: 'Backup and restore',
    body: () => [
      helpP('Your data lives on this device only, so back it up regularly from the <b>Backup</b> icon. A pop-up reminds you if a change hasn’t been backed up for 24 hours.'),
      helpList([
        '<b>Export backup</b> – save a full backup file. Keep a copy somewhere safe such as iCloud Drive; the app can’t do that by itself.',
        '<b>Restore</b> – bring everything back from a backup file.',
        '<b>Safety copies</b> – made automatically about once a day and before any restore. The latest 10 are kept, so you can roll back after a mistake. They don’t include photos and won’t help if the phone is lost.',
        '<b>Excel, CSV and contacts exports</b> – for spreadsheets or moving to another app.',
        '<b>Export for accounting software</b> – a list of payments received for a date range that FreeAgent, Xero and QuickBooks can import.',
        '<b>Import customers</b> – bring in a list from a spreadsheet.'
      ])
    ]
  },
  sync: {
    title: 'Using two devices',
    body: () => [
      helpP('To keep a phone and iPad in step, open <b>Backup → Sync</b>. There are two ways:'),
      helpP('<b>Live sync</b> (automatic). Changes go across within a minute or so while the app is open, through a small private mailbox on your own free Cloudflare account. Everything is scrambled with your passphrase before it leaves the device.'),
      helpList([
        'On the first device tap <b>Set up live sync</b> and choose a passphrase.',
        'On the second device tap <b>Join live sync</b> and enter the same passphrase.',
        'A small line under the date shows when it last synced. Open the app to catch up – it can’t sync while closed. Changes made offline go across when you’re back online.',
        '<b>Turn off</b> stops it on that device; <b>Delete the cloud copy</b> also clears the mailbox.',
        'If you restore a backup, live sync stops and asks what to do, so the restore can’t undo work on your other device.'
      ]),
      helpP('<b>Sync by file</b> (no internet account). On one device tap <b>Send to other device</b>, choose a passphrase, and AirDrop the file across. On the other tap <b>Receive from other device</b>, pick the file and enter the same passphrase. You’ll see a summary first, and a safety copy is made. Do this in whichever direction you last made changes.'),
      helpP('Either way, a change made on one device and a different change on the other are both kept. If both changed the same detail, one version is kept and you’re told.')
    ]
  },
  settings: {
    title: 'Settings',
    body: () => [
      helpList([
        '<b>Appearance</b> – text size, light, dark or automatic, and colour scheme.',
        '<b>Messaging app</b> – Messages or WhatsApp.',
        '<b>Swipe to text</b> – switches the “Windows cleaned today” text after a clean on or off.',
        '<b>Business details</b> – your name, company and bank details, used in invoices and texts.',
        '<b>Message templates</b> – the wording of every text. Use <b>{name}</b>, <b>{amount}</b>, <b>{company}</b> and <b>{yourname}</b> to fill in details automatically.',
        '<b>Mileage rates</b> – change the allowance rates for a tax year.'
      ])
    ]
  },
  reminders: {
    title: 'Reminders and banners',
    body: () => [
      helpP('Banners across the top of the app remind you about job anniversaries, marketing follow-ups that are due, and imported customers waiting to be reviewed – dismiss them with the ✕. Quotes needing follow-up show as a yellow number on the Quotes tab, and jobs due today as a tile on Today.')
    ]
  }
};
const FOCUSED_HELP_ORDER = ['today','work','rounds','jobs','customer','photos','quotes','marketing','reports','backup','sync','settings','reminders'];

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

    ${helpP('Round Book keeps track of your customers, rounds, cleans, payments, one-off jobs and quotes. Everything is stored privately on this device and it works without a signal.')}

    ${helpH('Getting around')}
    ${helpList([
      'Four tabs along the top: <b>Today</b>, <b>Work</b> (Rounds and One-off jobs), <b>Quotes</b> and <b>Marketing</b>. Each remembers where you were; tap the tab you’re on to go back to the top.',
      'The blue <b>+</b> button adds whatever suits the screen you’re on – a customer, job, quote or campaign.',
      'Header icons: <b>Search</b> (finds customers, jobs, quotes and rounds), <b>ⓘ</b> (photo gallery and this guide), <b>Reports</b>, <b>Backup</b> and <b>Settings</b>.',
      'A <b>?</b> next to a screen’s title opens help for just that screen.'
    ])}

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

  // Whether the phone has agreed to keep this app's data from being cleared automatically.
  let persistLine = '';
  try{
    if(navigator.storage && navigator.storage.persisted){
      const persisted = await navigator.storage.persisted();
      persistLine = persisted
        ? `<p style="color:var(--green); font-size:0.7812rem; font-weight:700; margin:-10px 2px 16px;">🔒 Your phone has agreed to protect this data from automatic clean-ups</p>`
        : `<p style="color:var(--amber); font-size:0.7812rem; font-weight:700; line-height:1.5; margin:-10px 2px 16px;">⚠️ Your phone hasn't promised to protect this data if it runs low on space, so keeping a backup in iCloud Drive or Google Drive matters</p>`;
    }
  }catch(e){}
  let safetyCount = 0;
  try{ safetyCount = (await listSafetyCopies()).length; }catch(e){}

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Backup &amp; restore</h2>
      ${helpIconBtn('backup', () => openBackup())}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 4px;">
      Everything is stored only on this phone, in this browser. Nothing is sent anywhere. Export a backup regularly — when the share sheet appears, choose <b>Save to Files → iCloud Drive</b> (or <b>Drive</b>, if you have Google Drive) rather than just saving to this phone, in case the app data is ever cleared.
    </p>
    <p style="color:${backupReminderDue()?'var(--amber)':'var(--ink-muted)'}; font-size:0.7812rem; font-weight:700; margin:0 2px 16px;">${lastText}</p>
    ${persistLine}
    ${storageWarning}
    <button class="backup-btn" onclick="exportData()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
      <div><div class="t1">Export backup</div><div class="t2">${count} customer${count===1?'':'s'} · saves a .json file — choose iCloud Drive or Google Drive when prompted</div></div>
    </button>
    <button class="backup-btn" onclick="openSyncSheet()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
      <div><div class="t1">Sync with another device</div><div class="t2">Encrypted file via AirDrop — merges changes both ways</div></div>
    </button>
    <button class="backup-btn" onclick="openSafetyCopies()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <div><div class="t1">Safety copies</div><div class="t2">${safetyCount} kept automatically on this phone · roll back after a mistake</div></div>
    </button>
    <button class="backup-btn" onclick="exportExcel()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>
      <div><div class="t1">Export as Excel</div><div class="t2">One sheet per round · .xlsx file</div></div>
    </button>
    <button class="backup-btn" onclick="exportCustomersCSV()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 9h16M4 14h16M10 4v16"/></svg>
      <div><div class="t1">Export customers (CSV)</div><div class="t2">Name, address, round, price, frequency, dates and more — for moving to another app</div></div>
    </button>
    <button class="backup-btn" onclick="exportContacts()">
      ${ADD_CONTACT_ICON}
      <div><div class="t1">Export contacts</div><div class="t2">Every customer with a phone, email, or address · .vcf file</div></div>
    </button>
    <button class="backup-btn" onclick="openAccountingExport()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
      <div><div class="t1">Export for accounting software</div><div class="t2">Payments received as a CSV — for FreeAgent, Xero, or QuickBooks</div></div>
    </button>
    <button class="backup-btn" onclick="document.getElementById('importFile').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
      <div><div class="t1">Restore from backup</div><div class="t2">Replaces current data with a backup file</div></div>
    </button>
    <button class="backup-btn" onclick="document.getElementById('importSpreadsheetFile').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/><path d="M14 14l3 3 3-3" transform="translate(0,-2)"/></svg>
      <div><div class="t1">Import customers from spreadsheet</div><div class="t2">.csv or .xlsx — match columns yourself, then added to a "needs review" round</div></div>
    </button>
  `);
}
async function openSafetyCopies(){
  let copies = [];
  try{ copies = await listSafetyCopies(); }catch(e){}
  const rows = copies.map(c => {
    const d = new Date(c.at);
    const when = d.toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'}) + ' · ' + d.toLocaleTimeString('en-GB',{hour:'2-digit', minute:'2-digit'});
    const counts = `${c.customers} customer${c.customers===1?'':'s'} · ${c.jobs} job${c.jobs===1?'':'s'} · ${c.quotes} quote${c.quotes===1?'':'s'}`;
    return `<div style="display:flex; align-items:center; gap:10px; background:var(--card-surface); border-radius:12px; padding:12px 14px; margin-bottom:10px;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:0.875rem; color:var(--ink);">${when}</div>
        <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${counts}</div>
        <div style="font-size:0.6875rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.reason || 'Automatic')}</div>
      </div>
      <button class="btn" style="flex-shrink:0; border:none; background:var(--blue-dim); color:var(--blue-deep, var(--blue)); padding:8px 12px;" onclick="confirmRestoreSafetyCopy(${c.at})">Restore</button>
    </div>`;
  }).join('');
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Safety copies</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 14px;">
      Round Book keeps a copy of your customers, jobs, quotes and settings automatically about once a day, and just before you restore a backup. The latest ${SAFETY_KEEP} are kept. They stay on this phone, so they protect against a mistake or a bad import — not against losing the phone. For that, keep exporting backups to iCloud Drive or Google Drive. Photos aren't part of safety copies.
    </p>
    ${rows || '<p style="color:var(--ink-muted); font-size:0.875rem; margin:0 2px;">No safety copies yet — the first is taken next time you open the app.</p>'}
  `, () => openBackup());
}
function confirmRestoreSafetyCopy(at){
  appConfirm('Replace everything on this phone with this safety copy? What\'s here now is saved as a safety copy first, so you can switch back.', {title:'Restore safety copy', confirmLabel:'Restore', onConfirm: () => restoreSafetyCopy(at)});
}
async function exportData(){
  requestPersistentStorage(); // a tap is a good moment to ask; harmless if already granted


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
  // Local date + time, so every backup gets its own name (todayISO() is the UTC date
  // and gave identical names for several backups in one day).
  const _n = new Date(), _p = v => String(v).padStart(2,'0');
  const backupStamp = `${_n.getFullYear()}-${_p(_n.getMonth()+1)}-${_p(_n.getDate())}-${_p(_n.getHours())}${_p(_n.getMinutes())}`;
  const filename = `round-book-backup-${backupStamp}.json`;

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
        // File only — no title/text. Some Android share targets turn a shared
        // title into a separate little .txt file saved alongside the backup.
        await navigator.share({files:[file]});
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
      appAlert('That file could not be read as a Round Book backup.', {title:'Import backup'});
      return;
    }
    appConfirm(`Import ${parsed.customers.length} customers? This will replace all data currently on this phone.`, {title:'Import backup', confirmLabel:'Import', onConfirm: async () => {
      try{
        toast('Restoring backup…');
        await takeSafetyCopy('Before restoring a backup file');
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
        syncForgetBase(); // restored data may be older than what the other device has seen
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
        appAlert('That file could not be read as a Round Book backup.', {title:'Import backup'});
      }
    }});
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ---------- import customers from spreadsheet ---------- */
// Parsed rows/headers held between picking a file and confirming the column
// mapping (see openImportColumnMapping) — nothing is actually imported until
// the user confirms.
let pendingImportRows = null;
let pendingImportHeaders = null;
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
      if(!rows.length){ appAlert('That spreadsheet looks empty — no rows found on the first sheet.', {title:'Import customers'}); e.target.value=''; return; }
      const headers = Object.keys(rows[0]);
      pendingImportRows = rows;
      pendingImportHeaders = headers;
      openImportColumnMapping(guessColumnMap(headers));
    }catch(err){
      appAlert('That file could not be read. Make sure it\'s a .csv or .xlsx spreadsheet with a header row.', {title:'Import customers'});
    }
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file);
});

const IMPORT_FIELD_META = [
  {key:'address', label:'Address', required:true},
  {key:'name', label:'Name', required:false},
  {key:'phone', label:'Phone', required:false},
  {key:'email', label:'Email', required:false},
  {key:'round', label:'Round', required:false},
  {key:'price', label:'Price', required:false},
  {key:'frequency', label:'Frequency (weeks)', required:false}
];
// Shows the best-guess column mapping (see guessColumnMap) for confirmation —
// or correction — before anything is actually imported, rather than importing
// on the guess and only finding out afterwards that a column was matched wrong.
function openImportColumnMapping(map){
  const headers = pendingImportHeaders;
  const sample = pendingImportRows[0] || {};
  const previewFor = (key)=>{
    const col = map[key];
    return col && sample[col] !== undefined && sample[col] !== '' ? `e.g. "${escapeHtml(String(sample[col]))}"` : '';
  };
  const rowsHtml = IMPORT_FIELD_META.map(f=>`
    <label style="margin-top:14px;">${escapeHtml(f.label)}${f.required?' <span style="color:var(--red);">*</span>':''}</label>
    <select id="colmap_${f.key}" onchange="previewImportColumn('${f.key}')">
      <option value="">— Not mapped —</option>
      ${headers.map(h=>`<option value="${escapeAttr(h)}" ${h===map[f.key]?'selected':''}>${escapeHtml(h)}</option>`).join('')}
    </select>
    <div id="colmap_${f.key}_preview" style="font-size:0.75rem; color:var(--ink-muted); margin:4px 2px 0; min-height:1.2em;">${previewFor(f.key)}</div>
  `).join('');
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Match columns</h2>
      <button class="sheet-close" onclick="cancelSpreadsheetImport()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 4px; line-height:1.5;">${pendingImportRows.length} row${pendingImportRows.length===1?'':'s'} found. Columns are matched automatically below — check them and adjust any that aren't right, then import.</p>
    ${rowsHtml}
    <div class="form-actions" style="margin-top:20px;">
      <button class="btn-primary" onclick="confirmSpreadsheetImport()">Import</button>
    </div>
  `);
}
function previewImportColumn(key){
  const sel = document.getElementById(`colmap_${key}`);
  const preview = document.getElementById(`colmap_${key}_preview`);
  if(!sel || !preview || !pendingImportRows || !pendingImportRows.length) return;
  const val = sel.value;
  const sampleVal = val ? pendingImportRows[0][val] : '';
  preview.textContent = (val && sampleVal !== undefined && sampleVal !== '') ? `e.g. "${sampleVal}"` : '';
}
function cancelSpreadsheetImport(){
  pendingImportRows = null;
  pendingImportHeaders = null;
  closeSheet();
}
function confirmSpreadsheetImport(){
  if(!pendingImportRows){ closeSheet(); return; }
  const map = {};
  IMPORT_FIELD_META.forEach(f=>{
    const sel = document.getElementById(`colmap_${f.key}`);
    map[f.key] = sel && sel.value ? sel.value : null;
  });
  if(!map.address && !map.name){
    toast('Map at least an Address or a Name column before importing');
    return;
  }

  const rows = pendingImportRows;
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

  pendingImportRows = null;
  pendingImportHeaders = null;
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
      <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.6; margin:0 2px 18px;">They've been placed in a <b>"${escapeHtml(IMPORT_HOLDING_ROUND)}"</b> round rather than their real round. Open each one to check the details and assign it to the right round.</p>
      <button class="btn-primary" style="width:100%;" onclick="closeSheet(); setTab('rounds'); openRound(IMPORT_HOLDING_ROUND);">Review imported customers</button>
    `);
  } else {
    toast(skipped ? `All ${skipped} rows already exist — nothing imported` : 'Nothing to import');
  }
}

// One row per customer (paused ones included, marked as such) with plain ISO
// dates and no currency symbols, so another app's importer can read it without
// guessing. The first columns use the same headings Round Book's own spreadsheet
// import recognises. The leading BOM makes Excel read £ and accents correctly.
async function exportCustomersCSV(){
  if(!data.customers.length){ toast('No customers to export yet'); return; }
  const headers = ['Account Number','Name','Address','Phone','Email','Round','Round Order','Visit Day','Price','Frequency (weeks)','Status','Pause Reason','Last Cleaned','Next Due','Deferred Until','Last Paid','Amount Owed','Property Type','Fronts Only','Conservatory','Extension','Garage Door','Other Add-ons','Notes','Referred By','Text Before Visit','Marketing Opt-out'];
  const yn = v => v ? 'Yes' : 'No';
  const rounds = groupByRound(data.customers);
  const lines = [headers.map(csvField).join(',')];
  let count = 0;
  Object.keys(rounds).sort((a,b)=>a.localeCompare(b)).forEach(rn => {
    sortByRoute(rounds[rn]).forEach((c, idx) => {
      const st = custStatus(c);
      lines.push([
        c.accountNumber || '', c.name || '', c.address || '', c.phone || '', c.email || '',
        rn, idx + 1, c.visitDay || 1,
        Number(c.price || 0).toFixed(2), c.frequencyWeeks || 4,
        c.paused ? 'Paused' : 'Active', c.pauseReason || '',
        st.lastClean || '', nextDueISO(c) || '', (c.deferUntil && c.deferUntil > todayISO()) ? c.deferUntil : '',
        st.lastPaid || '', (st.owed ? Number(st.balance) : 0).toFixed(2),
        c.propertyType || '', yn(c.frontsOnly), yn(c.addOnConservatory), yn(c.addOnExtension), yn(c.addOnGarageDoor), c.addOnOther || '',
        c.notes || '', c.referredBy || '', yn(c.textBeforeVisit), yn(c.marketingOptOut)
      ].map(csvField).join(','));
      count++;
    });
  });
  const csvStr = '\uFEFF' + lines.join('\r\n');
  if(await deliverTextFile(csvStr, `round-book-customers-${todayISO()}.csv`, 'text/csv', 'Round Book customers')){
    toast(`${count} customer${count===1?'':'s'} exported`);
  }
}
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

