/* 01-data.js -- Data storage (IndexedDB + localStorage fallback), save/load, migrations, date/format helpers, and shared app state variables.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- storage ---------- */
const STORE_KEY = 'roundBookData_v1';
const APP_VERSION = 100;
function formatVersion(v){ return '1.' + v; }
// User-facing changelog shown in the About screen's "Version history".
// MAINTENANCE: every time APP_VERSION is bumped, PREPEND a new {version, changes}
// entry here (newest first) describing what changed, in plain terms a user would
// understand — not technical/implementation detail. The screen only ever displays
// the most recent 10 entries (oldest ones can be left in the array or trimmed,
// either is fine, since the display always slices to 10).
const VERSION_HISTORY = [
  {version: 100, changes: ['Fixed buttons like Show map, Reorder, and the ⋮ menu showing a stray box/border around them (a side effect of last update\'s border cleanup)', 'The Today hero now lists which rounds have anyone due — tap one to jump straight to that round\'s Due list, and the hero stays focused on that round (its own due count, plus a live cleaned-today count) until you pick another round or a new day starts', 'Added a Paid total under the Clean total on the Today hero', 'Today\'s Mileage tile: Start and Finish now sit side by side, and the total is aligned higher on the tile']},
  {version: 99, changes: ['Softened the outline icons on buttons like Show map and Reorder — no longer stark white in dark mode', 'Redesigned the Today\'s Mileage tile to always show the title with small Start/Finish readings underneath and the day\'s total on the right, instead of switching between a car icon and a number']},
  {version: 98, changes: ['Customer cards now flag a "💷 Low" badge if their price is 15%+ below their round\'s average (rounds need 4+ active customers before this shows), and the Price review report has a second table listing everyone below their round\'s average, biggest gap first', 'Quote follow-up texts now get progressively softer wording each time (checking in, then no pressure) and automatically become due again sooner after each chase, rather than staying on a fixed weekly reminder forever', 'Added an Upsell opportunities report — fronts-only customers who could add backs, conservatories with no roof clean, detached/semi-detached houses with no garage door clean, and long-standing customers with no add-ons at all']},
  {version: 97, changes: ['Added an Auto option alongside Light and Dark under Settings > Appearance, which follows your phone\'s system setting automatically', 'Removed the black/white outline from buttons, Today tiles, stat boxes, and the round-view switcher — they now use a themed background instead, so they stay visible (especially in dark mode) without a hard border, and follow your chosen colour scheme']},
  {version: 96, changes: ['Cards (customers, rounds, backup screen) now use a softer themed border and shadow instead of the black/white outline, and follow your colour scheme in dark mode instead of all looking the same dark grey']},
  {version: 95, changes: ['Owed list and "Remind all" now sort by how long a balance has been outstanding, not just its size, so the most overdue customer comes first', 'Payment reminders now automatically switch to a firmer follow-up wording from the second reminder onwards — edit both under Settings > Message templates', 'Added a {daysoverdue} option for the payment reminder wording', 'One-off jobs now get the same red "⚠ Chase" badge as customers once 2+ payment reminders have gone unpaid']},
  {version: 94, changes: ['Fixed the card background shown while swiping — dragging right now actually shows the green "cleaned" colour instead of always showing blue "paid"', 'Swipe actions (cleaned, paid, job done, quote accepted, etc.) can now be undone for a few seconds via an Undo button', 'Payment reminders on one-off jobs can no longer be sent until the job is marked done', 'Added a discount percentage field next to price on one-off jobs, applied automatically to that job\'s invoice and receipt', 'The backup reminder is now a pop-up instead of a dismissible banner, and reliably reappears next time the app is opened if you dismiss it without backing up', 'All confirmation pop-ups in the app (delete, reset, import, etc.) now use the same on-screen style, for consistency and reliability on iPhone', 'Today tab: reordered tiles so text before visit and mileage come first, removed the separate Marketing tile (marketing follow-ups still surface as a banner when due), and added an overdue count under the Text before visit and Quotes tiles']},
  {version: 93, changes: ['Swiping a customer card right now has two stops: halfway marks cleaned, all the way across marks cleaned AND paid in one go', 'Added a universal search to the header, available on every tab -- searches customers, one-off jobs, quotes, and rounds together, replacing the old Rounds-only search', 'Send group text in Marketing can now also be narrowed by property type, add-ons (conservatory/extension/garage door), and fronts-only']},
  {version: 92, changes: ['Show map now gives every address a pin, even one that fails to find automatically (shown as an approximate grey pin near the others)', 'Pins on the map can now be dragged to correct their position — dragging locks that location so it is never re-fetched by a later map or route request, only by dragging it again']},
  {version: 91, changes: ['Added a mileage tracker to the Today tab -- tap to log a start-of-day reading, tap again at the end of the day for an end reading, tap once more to see/edit/clear the total', 'Added a Mileage report -- daily, weekly, monthly and UK tax-year-to-date (6 Apr) totals']},
  {version: 90, changes: ['No user-visible changes -- the app itself has just been split from one very large JavaScript file into 9 smaller ones by feature area, to make it easier to find and edit code going forward']},
  {version: 89, changes: ['Today large Due button now shows the running value of work actually completed today, on the right', 'Round names on Rounds > Due now tap straight through to that round, pre-filtered to Due']},
  {version: 88, changes: ['Work tab now remembers which round and view you were in when you step away to another tab (e.g. to quote someone) and resumes there instead of going back to the hub every time — tap Work again once you are back in it to return to the hub on purpose']},
  {version: 87, changes: ['Payment reminders tile on Today now shows the total amount owed', 'Show map and Suggest a route order now re-check every address location each time, instead of trusting a previously cached one', 'Moved Suggest a route order from the round menu into the Reorder screen', 'Address lookup now checks the postcode first via a dedicated UK postcode service, which should fix pins landing hundreds of miles from the right place']},
  {version: 86, changes: ['Removed the weather card from Today, plus the separate quote follow-up and one-off jobs reminder banners, since Today already covers both', 'Rounds and One-off jobs are now under a single new Work tab, opening to two square buttons with the overall customer/value figures moved underneath them', 'Marketing is now a list of campaigns — tap one to see its editable text, its sent texts, and a Send group text button, or add a new campaign at the bottom', 'Rewrote the user guide to be shorter and to match the current app']},
  {version: 85, changes: ['Added a "Show map" button at the top of each round — numbered pins for every stop in your current visiting order, with a route line between them (a real road route where available, straight lines as a fallback)']},
  {version: 84, changes: ['Today is now the home tab you land on, showing just the headline numbers (due today, value today, text before visit, jobs today, payment reminders, quotes needing follow-up, marketing actions, and the weather) — tap any of them to go straight to the full screen for it', 'Added a "Text first" view under Rounds, grouped by round with a Text all button, replacing the old Today popup version of the same list', 'Removed the separate Today button now that it is the home tab']},
  {version: 83, changes: ['Fronts-only properties now count as half a house in average-price-by-property-type figures (summary boxes and the Property Types report), so a handful of cheaper fronts-only jobs no longer drags the average down as if they were full cleans', 'The Today screen now groups "Text before you arrive" by round, with a "Text all" button that opens a tap-to-send queue for everyone in it', 'Property type (and fronts-only) now shows on the customer card']},
  {version: 82, changes: ['Today button is now the same size as the Add button and lines up next to it', 'The "Due for a clean" list on the Today screen now shows one card per round instead of every customer — tap a round to jump straight to it']},
  {version: 81, changes: ['Property type summary is now square boxes matching the round summary stats above it, with short labels (Det, Semi, Terr, Bung, Flat, NA)', 'Weather now refreshes itself every 30 minutes while the app stays open, instead of only on load', 'Added a Today button (next to Add) — a one-screen briefing of who is due for a clean, who needs a text before you arrive, one-off jobs dated today, quotes overdue for a follow-up, and marketing follow-ups that have come due']},
  {version: 80, changes: ['Added a "Flat" property type', 'Rounds overview and each round\'s own summary now show average price by property type underneath the Customers / Round value / Avg per customer figures', 'Weather now starts with the time it was last updated (HH:MM)']},
  {version: 79, changes: ['Backup reminder now triggers 48 hours after any un-backed-up change, instead of a fixed 7-day gap regardless of whether anything actually changed', 'Photos can now be annotated — circle, arrow, and freehand draw tools, in a choice of colours — saved as a new photo alongside the original from the "Annotate" button in the photo viewer']},
  {version: 78, changes: ['Fixed the ✕ button still not working in one specific case — saving from the "unsaved changes" prompt when closing a customer\'s edit screen could leave the next screen\'s ✕ silently broken', 'Added a "Property types" report — houses and average price by property type, with a total and a breakdown for each round']},
  {version: 77, changes: ['Converting a quote to a one-off job now automatically links it to an existing customer if the address matches, so it shows up in that customer\'s history', 'Added property type (detached/semi-detached/terraced/bungalow), add-ons (conservatory, extension, garage door, or other), and a "fronts only" tick box — recorded on customers, quotes and one-off jobs, and carried across automatically when a quote becomes a job or customer']},
  {version: 76, changes: ['Fixed the ✕ button not working after saving changes on a customer\'s edit screen — saving could leave the unsaved-changes prompt stuck showing on the next close attempt', 'Moved the weather info to its own line so it has room to show in full underneath the top buttons, which sit slightly higher now']},
  {version: 75, changes: ['"Suggest a route order" now tries real road-based routing first (via free OSRM/Valhalla services), only falling back to the straight-line estimate if neither is reachable — the suggestion screen says which one was actually used']},
  {version: 74, changes: ['Fixed the ✕ button not working when editing a customer with unsaved changes — the save/discard prompt now uses the app\'s own screen instead of the phone\'s native pop-up, which could fail silently on some devices', 'Added a "✓ Text sent" flag once the windows-cleaned-today text has actually been sent, so it\'s clear at a glance who\'s been told — tap it again any time to resend']},
  {version: 73, changes: ['The price/owed round value format now also shows on an individual round\'s own screen, not just the Rounds tab overview']},
  {version: 72, changes: ['Round totals (on each round card, and at the top of the Rounds tab) now show as price/owed — the plain round value, followed by what\'s currently outstanding in red, instead of one blended figure', 'Added wind speed to the weather banner', 'Editing a customer now asks whether to save if you close the screen with unsaved changes, however you close it']},
  {version: 71, changes: ['Added round optimisation and route planning, from the ⋯ menu on any round: "Start round" opens Google Maps with every stop already queued up in one go, and "Suggest a route order" works out a shorter visiting order to review before applying (using a free address lookup the first time, then remembered after that)']},
  {version: 70, changes: ['Fixed the payment reference added to bank details in messages — now shows just the house number and road, not the whole address, for anyone who\'s stored a fuller address with town/postcode']},
  {version: 69, changes: ['Payment reminders and "windows cleaned today" texts now include the customer\'s address as a payment reference alongside your bank details, so it\'s easy to see who a bank transfer\'s from once it lands in your account']},
  {version: 68, changes: ['Round value now adds on anything currently owed and subtracts anything currently in credit, rather than just adding up normal prices — a truer picture of what a round is actually worth right now. Credit only ever cancels out one clean\'s worth per customer, so someone who\'s paid several months ahead doesn\'t make a round look emptier than it is']},
  {version: 67, changes: ['Each round on the Rounds tab now shows its value (price per clean, added up) alongside the customer count — paused customers are left out of both, but anyone owing or in credit is still counted at their normal price']},
  {version: 66, changes: ['Added a "Don\'t send marketing texts to this customer" tick box on a customer\'s own screen — they\'re then always excluded from group marketing sends, on every campaign', 'Fixed a bug where switching campaigns on the group send screen didn\'t update the message text at the bottom']},
  {version: 65, changes: ['Marketing texts now support several named campaigns (general offer, ask for a referral, win back lapsed customers, seasonal reminder, or your own) instead of one fixed message — manage them from the Marketing tab', 'Group sends can now skip anyone already Interested/Booked in, or anyone texted recently, and can target paused/lapsed customers as their own group', 'A follow-up call or text can be given a target date, with a reminder banner once it\'s due', 'The Marketing tab shows which campaign each response belongs to, filter chips once more than one is in use, and a quick sent/responded/booked count', 'Added an optional "Referred by" note on a customer\'s own screen']},
  {version: 64, changes: ['All customer/job/quote data now lives in the same storage as photos, so the only real limit is your phone\'s own free space rather than a tight ~5-10MB pool', 'Removed the two storage bars on the Backup screen — a warning only appears there if storage is actually getting close to full']},
  {version: 63, changes: ['Fixed a bug where a single problem photo could silently drop every photo from a backup, or disable photo storage for the rest of the session — backups and restores now handle each photo on its own, and tell you if any couldn\'t be included or recovered']},
  {version: 62, changes: ['Photo gallery now also includes standalone one-off jobs (ones not linked to a customer) that have their own photos']},
  {version: 61, changes: ['Adding a new quote now keeps you on its screen afterwards, so you can send it by text or email straight away', 'Marketing response cards now show a ✓ once a pending action (like sending a quote) has been done', 'Fixed the ✕ button on a marketing response not closing the screen', 'Sending a PDF invoice or receipt via WhatsApp now jumps straight to that customer\'s own chat', 'Photos can now be swiped left/right to browse through the rest, instead of one at a time', 'Added a Photo gallery (photo icon on the Rounds tab) — every customer with photos, listed by address']},
  {version: 60, changes: ['Marketing moved to its own tab, next to Quotes', 'Group marketing texts can now be sent to several rounds at once, not just one', 'Response entries needing action are now sorted to the top, above ones still awaiting a reply', 'Anyone unresponded to for 30 days quietly drops off the list — nothing about them is deleted, and a fresh text brings them straight back']},
  {version: 59, changes: ['Marketing responses now has its own search box', 'Added Call, Text, and Quote buttons directly on each marketing response entry']},
  {version: 58, changes: ['Added Marketing responses — tracks who\'s been sent a marketing text, with a response status and a next action you set yourself, reachable via a new megaphone icon on the Rounds tab']},
  {version: 57, changes: ['The backup reminder banner\'s "Back up" button now saves the backup file straight away, in one tap, instead of taking you to the Backup screen first']},
  {version: 56, changes: ['Search results now highlight the matching text as you type', 'Deleting a customer, job, or quote now shows a persistent "Undo" banner instead of a toast that disappears in a few seconds — stays until you act on it or dismiss it']},
  {version: 55, changes: ['Account numbers now show on every report that lists a customer address, not just invoices and receipts', 'Added a search icon to the Rounds tab — searches name, address, phone, email, notes, round, and account number, with results shown as a tappable list']},
  {version: 54, changes: ['Every customer now has a unique account number, shown on their screen and on printed invoices/receipts — editable if you\'d rather set your own', 'Photos from a customer\'s linked one-off jobs now show up in that customer\'s own Photos section too']},
  {version: 53, changes: ['The directions and call buttons are now always blue and green, whichever colour scheme is chosen', 'The black outline around boxes and buttons now switches to white in dark mode, so it stays visible', 'Fixed the storage screen not showing gigabytes for larger figures']},
  {version: 52, changes: ['Photo storage now shows a real progress bar with your phone\'s actual available space, matching the customer data bar', 'Removed the explanatory text under both storage bars, keeping just the numbers', 'Photos are now saved at higher size and quality, since there\'s much more storage room available now']},
  {version: 51, changes: ['Photos now stored separately from your customer/job records, with far more room — a growing photo library can no longer risk running out of storage', 'Existing photos are automatically moved over the first time this version runs', 'Backup exports still include everything, including photos, in one file']},
  {version: 50, changes: ['Fixed the Time field on a one-off job appearing tiny instead of matching the Date field']},
  {version: 49, changes: ['One-off jobs can now have an optional time as well as a date', 'Added this version history to the About screen']},
  {version: 48, changes: ['Added "Defer due date 4 weeks" for a customer, as a short-term alternative to Pause — the exact date can be edited', 'Added "Defer whole round 4 weeks" to push back everyone in a round at once']},
  {version: 47, changes: ['The totals at the bottom of a round\'s Due view now only count what\'s actually left to clean', 'Fixed a missing gap above the Messages button on the customer screen']},
  {version: 46, changes: ['Moved the One-off jobs report to its own tab', 'Added a new Quotes report', 'Added a help icon to the Rounds, One-off jobs, and Quotes tabs']},
  {version: 45, changes: ['Moved Windows due / Money owed / Full round lists reports to a new printer icon on the Rounds tab']},
  {version: 44, changes: ['Made the Customers / Round value / Avg per customer numbers bigger']},
  {version: 43, changes: ['Fixed Add to Contacts not offering a way to actually add the contact', 'A customer marked cleaned now stays visible in the Due view until the end of the day']},
  {version: 42, changes: ['Fixed Add to Contacts doing nothing when tapped']},
  {version: 41, changes: ['Added "Add to Contacts" for a customer or job, plus a bulk export of everyone from Backup & Restore']},
  {version: 40, changes: ['Added a tap-to-call button', 'Added a warning flag for customers chased for payment 2+ times with no payment', 'Added a message log showing what\'s actually been sent to a customer or job']}
];
const DIRECTIONS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>';
const CALL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
const ADD_CONTACT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>';

// Escapes text for safe use inside a vCard field per the vCard 3.0 spec.
function vcardEscape(str){
  return String(str||'').replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
}
// Builds one vCard block for a customer or job. Generic across both since they
// share the same shape of contact info (name, phone, email, address, notes).
function buildVCard(item){
  const name = (item.name && item.name.trim()) || item.address || 'Customer';
  const lines = ['BEGIN:VCARD','VERSION:3.0', `FN:${vcardEscape(name)}`];
  if(item.phone) lines.push(`TEL;TYPE=CELL:${vcardEscape(item.phone)}`);
  if(item.email) lines.push(`EMAIL:${vcardEscape(item.email)}`);
  if(item.address) lines.push(`ADR;TYPE=HOME:;;${vcardEscape(item.address)};;;;`);
  const noteParts = [];
  if(item.round) noteParts.push(`Round Book: ${item.round}`);
  if(item.notes) noteParts.push(item.notes);
  if(noteParts.length) lines.push(`NOTE:${vcardEscape(noteParts.join(' — '))}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}
// Adds a single customer/job to the phone's Contacts app. Two things learned the
// hard way here: a raw `location.href = 'data:...'` navigation does nothing on
// several browsers (top-level navigation to data: URIs is blocked/unreliable), and
// routing through navigator.share() just opens the generic share sheet with no
// "Add to Contacts" option, since share targets don't get to register for that.
// Navigating to a blob: URL directly (no `download` attribute, so the browser
// isn't forced into a plain file-save) is what actually gets Safari/iOS to
// recognise the vCard content type and open its own native "Add Contact" screen.
function addToContacts(kind, id){
  const item = kind === 'job' ? data.oneOffJobs.find(x=>x.id===id) : data.customers.find(x=>x.id===id);
  if(!item){ return; }
  if(!item.phone && !item.email && !item.address){ toast('Nothing to add — no phone, email, or address saved'); return; }
  const vcard = buildVCard(item);
  const blob = new Blob([vcard], {type:'text/vcard'});
  const url = URL.createObjectURL(blob);
  window.location.href = url;
  // Give the browser time to actually open/parse the blob before it's released —
  // revoking too early can leave the "Add Contact" screen with nothing to show.
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
// Bulk export — every customer with a phone, email, or address, as one .vcf file
// containing multiple vCards (the format supports concatenating several blocks).
// Mirrors exportData()'s share-sheet-first, download-fallback pattern.
async function exportContacts(){
  const eligible = data.customers.filter(c => c.phone || c.email || c.address);
  if(!eligible.length){ toast('No customers with contact details to export'); return; }
  const vcardStr = eligible.map(buildVCard).join('\r\n');
  const filename = `round-book-contacts-${todayISO()}.vcf`;

  if(navigator.canShare){
    try{
      const file = new File([vcardStr], filename, {type:'text/vcard'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:'Round Book Contacts'});
        toast('Contacts shared');
        return;
      }
    }catch(e){
      if(e && e.name === 'AbortError') return;
    }
  }

  const blob = new Blob([vcardStr], {type:'text/vcard'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
  toast('Contacts file saved');
}
const DEFAULT_CLEAN_TEMPLATE = "Hi {name}, just a reminder I'll be round to clean your windows soon. Let me know if that's not convenient.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_PAY_TEMPLATE = "Hi {name}, a friendly reminder that your window cleaning payment of {amount} is outstanding.\n\n{bankdetails}Thanks,\n{yourname}\n{company}";
const DEFAULT_PAY_FOLLOWUP_TEMPLATE = "Hi {name}, following up again — your window cleaning payment of {amount} is now {daysoverdue} days overdue. Could you sort this when you get a chance?\n\n{bankdetails}Thanks,\n{yourname}\n{company}";
const DEFAULT_RECEIPT_TEMPLATE = "Hi {name}, thank you for your payment of {amount} received {date}.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_QUOTE_TEMPLATE = "Hi {name}, thanks for your enquiry. I'd quote {amount} for the following work: {work}\nLet me know if you'd like to go ahead.\nThanks,\n{yourname}\n{company}";
const DEFAULT_REPEAT_QUOTE_TEMPLATE = "Hi {name}, hope you're well! I cleaned your windows for you before and wondered if you'd like the same job done again? I'd quote {amount} for the following work: {work}\n\nJust let me know and I'll get you booked back in.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_QUOTE_FOLLOWUP_TEMPLATE = "Hi {name}, just checking you saw my last message — I quoted {amount} for {work}. Let me know if you'd like to go ahead.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_QUOTE_FOLLOWUP2_TEMPLATE = "Hi {name}, no worries if the timing's not right at the moment — just wanted to leave the door open. My quote of {amount} for {work} still stands whenever suits.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_MARKETING_TEMPLATE = "Hi {name}, just letting you know we also offer gutter clearing and fascia cleaning alongside your window clean — let me know if you'd like a quote.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_REFERRAL_TEMPLATE = "Hi {name}, hope you're happy with your window cleaning! If you know anyone nearby who'd like a regular clean too, we'd really appreciate a mention — just get them to say your name when they get in touch.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_WINBACK_TEMPLATE = "Hi {name}, it's been a while since we last cleaned your windows — just checking in to see if you'd like to start up again. Let me know and I'll get you back on the round.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_SEASONAL_TEMPLATE = "Hi {name}, with the seasons changing it's a good time to get your gutters cleared before they cause problems — let me know if you'd like a quote alongside your usual window clean.\n\nThanks,\n{yourname}\n{company}";
// Marketing "campaigns" — named, reusable templates picked at send time (see
// openGroupMarketingText). Seeded once in migrateData below, from then on fully
// user-editable (add/rename/edit/delete) from each campaign's own page in the
// Marketing tab. Deliberately separate from the single-template TEMPLATE_DEFS
// system used for reminders/receipts/quotes, since marketing is the one message
// type where running several different campaigns side by side is actually useful.
const DEFAULT_MARKETING_CAMPAIGNS = [
  { id: 'general', name: 'General offer', body: DEFAULT_MARKETING_TEMPLATE },
  { id: 'referral', name: 'Ask for a referral', body: DEFAULT_REFERRAL_TEMPLATE },
  { id: 'winback', name: "We've missed you", body: DEFAULT_WINBACK_TEMPLATE },
  { id: 'seasonal', name: 'Seasonal reminder', body: DEFAULT_SEASONAL_TEMPLATE }
];
const DEFAULT_CLEANED_TODAY_TEMPLATE = "Hi {name}, your windows have been cleaned today! The cost for this clean is {amount}.\n\n{bankdetails}Thanks,\n{yourname}\n{company}";
function migrateData(parsed){
  parsed.customers = parsed.customers || [];
  parsed.oneOffJobs = parsed.oneOffJobs || [];
  parsed.oneOffJobs.forEach(j=>{
    if(!j.photos) j.photos = [];
    if(j.remind24h == null) j.remind24h = false;
    if(j.customerId === undefined) j.customerId = null;
    if(j.time === undefined) j.time = '';
    if(j.paymentReminderSent == null) j.paymentReminderSent = false;
    if(j.paymentReminderSentDate === undefined) j.paymentReminderSentDate = null;
    if(j.paymentReminderCount == null) j.paymentReminderCount = 0;
    if(!j.messageLog) j.messageLog = [];
  });
  parsed.quotes = parsed.quotes || [];
  parsed.quotes.forEach(q=>{
    if(!q.status) q.status = 'pending';
    if(q.date === undefined) q.date = todayISO();
    if(q.followUpDays == null) q.followUpDays = 7;
    if(q.quoteFollowUpCount == null) q.quoteFollowUpCount = 0;
  });
  parsed.settings = parsed.settings || {};
  // Auto-upgrade template wording that still matches an earlier built-in default (i.e. the user
  // never customised it) so improvements to the default wording reach existing installs too.
  // Anything that doesn't match a known-old default is a real customisation and is left alone.
  const OLD_CLEAN_TEMPLATES = ["Hi {name}, just a reminder I'll be round to clean your windows soon. Let me know if that's not convenient. Thanks!"];
  const OLD_PAY_TEMPLATES = [
    "Hi {name}, a friendly reminder that your window cleaning payment of {amount} is outstanding. Thanks!",
    "Hi {name}, a friendly reminder that your window cleaning payment of {amount} is outstanding.\n\nThanks,\n{yourname}\n{company}"
  ];
  const OLD_RECEIPT_TEMPLATES = ["Hi {name}, thank you for your payment of {amount} received {date}. {company}"];
  const OLD_QUOTE_TEMPLATES = [
    "Hi {name}, thanks for asking about window cleaning. I'd quote {amount} for this job — let me know if you'd like to go ahead. {company}",
    "Hi {name}, thanks for asking about window cleaning. I'd quote {amount} for this job — let me know if you'd like to go ahead. Thanks, {yourname}",
    "Hi {name}, thanks for asking about window cleaning. I'd quote {amount} for this job — let me know if you'd like to go ahead.\n\nThanks,\n{yourname}\n{company}",
    "Hi {name}, thanks for asking about window cleaning. I'd quote {amount} for the following work: {work}\n\nLet me know if you'd like to go ahead.\n\nThanks,\n{yourname}\n{company}"
  ];
  const OLD_REPEAT_QUOTE_TEMPLATES = [
    "Hi {name}, great to clean for you again. For regular cleans I'd quote {amount} — let me know if you'd like to set up a round. Thanks, {yourname}",
    "Hi {name}, hope you're well! I cleaned your windows for you before and wondered if you'd like the same job done again? I'd quote {amount}, same as last time — just let me know and I'll get you booked back in.\n\nThanks,\n{yourname}\n{company}"
  ];
  const OLD_CLEANED_TODAY_TEMPLATES = ["Hi {name}, your windows have been cleaned today!\n\n{bankdetails}Thanks,\n{yourname}\n{company}"];
  if(!parsed.settings.cleanTemplate || OLD_CLEAN_TEMPLATES.includes(parsed.settings.cleanTemplate)) parsed.settings.cleanTemplate = DEFAULT_CLEAN_TEMPLATE;
  if(!parsed.settings.payTemplate || OLD_PAY_TEMPLATES.includes(parsed.settings.payTemplate)) parsed.settings.payTemplate = DEFAULT_PAY_TEMPLATE;
  if(!parsed.settings.payFollowUpTemplate) parsed.settings.payFollowUpTemplate = DEFAULT_PAY_FOLLOWUP_TEMPLATE;
  if(!parsed.settings.receiptTemplate || OLD_RECEIPT_TEMPLATES.includes(parsed.settings.receiptTemplate)) parsed.settings.receiptTemplate = DEFAULT_RECEIPT_TEMPLATE;
  if(!parsed.settings.quoteTemplate || OLD_QUOTE_TEMPLATES.includes(parsed.settings.quoteTemplate)) parsed.settings.quoteTemplate = DEFAULT_QUOTE_TEMPLATE;
  if(!parsed.settings.repeatQuoteTemplate || OLD_REPEAT_QUOTE_TEMPLATES.includes(parsed.settings.repeatQuoteTemplate)) parsed.settings.repeatQuoteTemplate = DEFAULT_REPEAT_QUOTE_TEMPLATE;
  if(!parsed.settings.quoteFollowUpTemplate) parsed.settings.quoteFollowUpTemplate = DEFAULT_QUOTE_FOLLOWUP_TEMPLATE;
  if(!parsed.settings.quoteFollowUp2Template) parsed.settings.quoteFollowUp2Template = DEFAULT_QUOTE_FOLLOWUP2_TEMPLATE;
  if(!parsed.settings.marketingTemplate) parsed.settings.marketingTemplate = DEFAULT_MARKETING_TEMPLATE;
  if(!Array.isArray(parsed.settings.marketingCampaigns) || !parsed.settings.marketingCampaigns.length){
    // First time running this version: seed the campaign list, carrying over
    // whatever custom wording was already saved as the single "marketingTemplate"
    // (pre-dating campaigns) into the "General offer" slot, so nobody's own
    // customisation is lost in the switch to multiple campaigns.
    parsed.settings.marketingCampaigns = DEFAULT_MARKETING_CAMPAIGNS.map(camp =>
      camp.id === 'general' ? Object.assign({}, camp, { body: parsed.settings.marketingTemplate }) : Object.assign({}, camp)
    );
  }
  if(!parsed.settings.cleanedTodayTemplate || OLD_CLEANED_TODAY_TEMPLATES.includes(parsed.settings.cleanedTodayTemplate)) parsed.settings.cleanedTodayTemplate = DEFAULT_CLEANED_TODAY_TEMPLATE;
  if(parsed.settings.messagingApp !== 'whatsapp') parsed.settings.messagingApp = 'sms';
  if(parsed.settings.companyName == null) parsed.settings.companyName = '';
  if(parsed.settings.companyAddress == null) parsed.settings.companyAddress = '';
  if(parsed.settings.companyPhone == null) parsed.settings.companyPhone = '';
  if(parsed.settings.logo == null) parsed.settings.logo = '';
  if(parsed.settings.bankPayeeName == null) parsed.settings.bankPayeeName = '';
  if(parsed.settings.bankAccountNumber == null) parsed.settings.bankAccountNumber = '';
  if(parsed.settings.bankSortCode == null) parsed.settings.bankSortCode = '';
  if(parsed.settings.nextAccountNumber == null) parsed.settings.nextAccountNumber = 1001;
  parsed.customers.forEach(c=>{
    if(c.pauseReason == null) c.pauseReason = '';
    if(c.pauseDate == null) c.pauseDate = '';
    if(c.textBeforeVisit == null) c.textBeforeVisit = false;
    if(c.frequencyWeeks == null){
      c.frequencyWeeks = c.frequencyDays ? Math.max(1, Math.round(c.frequencyDays/7)) : 4;
    }
    if(c.visitDay == null || c.visitDay < 1 || c.visitDay > 5){
      c.visitDay = 1;
    }
    if(!c.priceHistory){
      c.priceHistory = c.price != null ? [{date: todayISO(), price: c.price}] : [];
    }
    if(!c.photos){
      c.photos = [];
    }
    if(!c.cleanHistory){
      c.cleanHistory = [];
    } else if(c.cleanHistory.length && typeof c.cleanHistory[0] === 'string'){
      c.cleanHistory = c.cleanHistory.map(d => ({date: d, amount: c.price || 0}));
    }
    if(!c.paymentHistory) c.paymentHistory = [];
    if(c.paymentReminderSent == null) c.paymentReminderSent = false;
    if(c.paymentReminderSentDate === undefined) c.paymentReminderSentDate = null;
    if(c.deferUntil === undefined) c.deferUntil = null;
    if(c.paymentReminderCount == null) c.paymentReminderCount = 0;
    if(!c.messageLog) c.messageLog = [];
    if(!c.marketingStatus) c.marketingStatus = 'awaiting';
    if(!c.marketingNextAction) c.marketingNextAction = 'none';
    if(c.marketingActionDone == null) c.marketingActionDone = false;
    if(c.marketingCampaign == null) c.marketingCampaign = '';
    if(c.marketingFollowUpDate == null) c.marketingFollowUpDate = '';
    if(c.referredBy == null) c.referredBy = '';
    if(c.marketingOptOut == null) c.marketingOptOut = false;
    if(c.cleanedTodayTextSentDate == null) c.cleanedTodayTextSentDate = '';
    // Every customer gets a permanent, unique account number the first time this
    // runs for them — shown on invoices/receipts. Assigned once and never reused,
    // even if the customer is later deleted, so numbers stay meaningful.
    if(!c.accountNumber){
      c.accountNumber = String(parsed.settings.nextAccountNumber);
      parsed.settings.nextAccountNumber++;
    }
  });
  return parsed;
}
// Loads the main data object — normally from IndexedDB (idbLoadAppData), with a
// same-page fallback to a legacy localStorage copy for anyone upgrading from
// before this moved, or if IndexedDB itself is ever unavailable. Only ever
// called once, during startup (see initStorage below).
async function loadData(){
  try{
    const stored = await idbLoadAppData();
    if(stored) return migrateData(stored);
  }catch(e){}
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw) return migrateData(JSON.parse(raw));
  }catch(e){}
  return migrateData({ customers: [] });
}
// Persists the in-memory `data` object. Callers mutate `data` and call this
// synchronously right before re-rendering from that same already-mutated object,
// so the write itself can safely happen in the background without the caller
// waiting on it — same fire-and-forget pattern already used for photo saves.
// The 3 call sites that DO need to know whether the save actually succeeded
// (logo/photo uploads, which only navigate onward on success) `await` it instead.
async function saveData(){
  try{
    await idbSaveAppData(data);
    // Once IndexedDB genuinely holds the current data, drop any stale localStorage
    // fallback copy — otherwise it just sits there out of sync, eating into
    // localStorage's own much tighter quota for no reason.
    try{ localStorage.removeItem(STORE_KEY); }catch(e){}
    markPendingBackupChange();
    return true;
  }catch(e){
    // IndexedDB unavailable or the write itself failed — fall back to the old
    // localStorage save path so nothing is silently lost. Its own (much smaller)
    // quota can still in theory be hit here, hence the same warning as before.
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      markPendingBackupChange();
      return true;
    }catch(e2){
      // The screen that called saveData() almost always shows its own toast right
      // after this returns (e.g. "Saved", "Customer updated") — since they share
      // the same toast element, that call would instantly overwrite this warning
      // before anyone could read it, making a failed save look identical to a
      // successful one. The change stays visible for the rest of this session
      // (it's already applied to the in-memory `data` object) but silently
      // reverts on the next app reload, since it was never actually written to
      // storage. Delaying this warning by a beat means it always fires last and
      // wins, so it can never be hidden that way.
      setTimeout(() => toast('Storage is full — nothing was saved. Free up space, then try again.', 'Open Backup', () => openBackup()), 60);
      return false;
    }
  }
}
/* ---------- storage (IndexedDB) ----------
   Everything — customer/job/quote data AND photos — lives in IndexedDB, not
   localStorage. localStorage caps out around 5-10MB on most browsers (iOS Safari
   included), which a growing customer list plus photos could realistically hit;
   IndexedDB's limit is a share of the phone's actual free disk space instead, so
   in practice storage stops being a concern anyone needs to think about. A tiny
   localStorage copy of the main data is still kept as a same-page emergency
   fallback (see saveData/loadData) for the rare case IndexedDB itself is
   unavailable — everything else (photos, the normal save path) requires it. */
const PHOTO_DB_NAME = 'roundBookPhotos';
const PHOTO_STORE = 'photos';
const APP_DATA_STORE = 'appData';
const APP_DATA_KEY = 'main';
let photoDbPromise = null;
let photoStorageAvailable = true;
function openPhotoDb(){
  if(photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(PHOTO_DB_NAME, 2);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      // Guarded with contains() rather than assuming a fresh DB: this fires both for
      // a brand-new install (going straight to v2) and for an existing v1 database
      // upgrading (which already has PHOTO_STORE and must keep it untouched).
      if(!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      if(!db.objectStoreNames.contains(APP_DATA_STORE)) db.createObjectStore(APP_DATA_STORE);
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  photoDbPromise.catch(()=>{ photoStorageAvailable = false; });
  return photoDbPromise;
}
async function idbSavePhoto(id, blob){
  const db = await openPhotoDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(blob, id);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function idbGetPhoto(id){
  const db = await openPhotoDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = ()=>resolve(req.result || null);
    req.onerror = ()=>reject(req.error);
  });
}
async function idbDeletePhoto(id){
  const db = await openPhotoDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
// Whole-app data (customers, jobs, quotes, settings — everything in the `data`
// object) as a single record, stored directly via structured clone rather than a
// JSON string — IndexedDB handles plain objects/arrays natively, no
// stringify/parse step needed the way localStorage required.
async function idbSaveAppData(obj){
  const db = await openPhotoDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(APP_DATA_STORE, 'readwrite');
    tx.objectStore(APP_DATA_STORE).put(obj, APP_DATA_KEY);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}
async function idbLoadAppData(){
  const db = await openPhotoDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(APP_DATA_STORE, 'readonly');
    const req = tx.objectStore(APP_DATA_STORE).get(APP_DATA_KEY);
    req.onsuccess = ()=>resolve(req.result || null);
    req.onerror = ()=>reject(req.error);
  });
}
// Returns a Map<id, Blob> of every stored photo — used for startup preload, the
// storage-used figures, and bundling photos into a portable backup export.
async function idbGetAllPhotos(){
  const db = await openPhotoDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const store = tx.objectStore(PHOTO_STORE);
    const out = new Map();
    const req = store.openCursor();
    req.onsuccess = (e)=>{
      const cursor = e.target.result;
      if(cursor){ out.set(cursor.key, cursor.value); cursor.continue(); }
      else resolve(out);
    };
    req.onerror = ()=>reject(req.error);
  });
}
function blobToDataURL(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function dataURLToBlob(dataUrl){
  const res = await fetch(dataUrl);
  return res.blob();
}

// id -> object URL, resolved once per session. Every screen that shows a photo reads
// from this synchronously (populated ahead of time — see initStorage below) so
// none of the existing render code needs to become async just to show a thumbnail.
let photoUrlCache = new Map();

function cachePhotoBlob(id, blob){
  const existing = photoUrlCache.get(id);
  if(existing) URL.revokeObjectURL(existing);
  photoUrlCache.set(id, URL.createObjectURL(blob));
}
function uncachePhoto(id){
  const existing = photoUrlCache.get(id);
  if(existing){ URL.revokeObjectURL(existing); photoUrlCache.delete(id); }
}

// One-time migration: any photo still holding an old-style embedded `dataUrl` (from
// before photos moved to IndexedDB — this includes every photo already on the phone
// the first time this version runs, and any older backup file being restored) gets
// decoded, stored in IndexedDB, and stripped down to just {id, date}. Safe to call
// repeatedly — already-migrated photos are left untouched.
// Each photo is handled independently (own try/catch) rather than one shared
// Promise.all: a single corrupted/oversized photo failing must not take every other
// photo in the migration down with it, and must not disable IndexedDB storage for
// the rest of the session (photoStorageAvailable is reserved for when IndexedDB
// itself is genuinely unusable, checked once via openPhotoDb() below). Returns the
// number of photos that couldn't be migrated, so the caller can tell the user.
async function migrateLegacyPhotosToIndexedDB(targetData){
  const toMigrate = [];
  const collect = (list) => (list||[]).forEach(p => { if(p && p.dataUrl) toMigrate.push(p); });
  (targetData.customers||[]).forEach(c => collect(c.photos));
  (targetData.oneOffJobs||[]).forEach(j => collect(j.photos));
  if(!toMigrate.length) return 0;
  try{ await openPhotoDb(); }catch(e){ return toMigrate.length; } // IndexedDB itself unavailable — nothing to do
  let failed = 0;
  await Promise.all(toMigrate.map(async p => {
    try{
      const blob = await dataURLToBlob(p.dataUrl);
      await idbSavePhoto(p.id, blob);
      delete p.dataUrl;
    }catch(e){ failed++; } // this one photo stays embedded as dataUrl; everything else still migrates
  }));
  return failed;
}
// Decodes a bundled backup export's photo blobs (see exportData) back into
// IndexedDB. Older backups (pre-dating this change) don't have this — their photos
// are still embedded per-photo as `dataUrl` and are handled by the migration above
// instead, since migrateData() runs on every import too. Returns the number of
// photos that couldn't be restored (each handled independently, so one bad entry
// doesn't cost the rest of the backup its photos).
async function restoreBundledPhotoBlobs(targetData){
  if(!targetData._photoBlobs) return 0;
  const entries = Object.entries(targetData._photoBlobs);
  let failed = 0;
  await Promise.all(entries.map(async ([id, dataUrl]) => {
    try{ const blob = await dataURLToBlob(dataUrl); await idbSavePhoto(id, blob); }
    catch(e){ failed++; }
  }));
  delete targetData._photoBlobs;
  return failed;
}
// Loads every stored photo into photoUrlCache — run once at startup (after
// migration) so every subsequent render in the session can just read
// photoUrlCache.get(id) synchronously, same as everything else in this app.
async function preloadAllPhotoUrls(){
  try{
    const all = await idbGetAllPhotos();
    all.forEach((blob, id) => cachePhotoBlob(id, blob));
  }catch(e){ photoStorageAvailable = false; }
}
// Removes any IndexedDB photo blob no longer referenced by a customer or job — e.g.
// after a delete-customer/delete-job that wasn't undone. Deliberately NOT run
// immediately on delete, since both of those have an "Undo" toast that restores the
// record (including its photo ids) — running this at the next startup instead means
// Undo always still works, and nothing genuinely orphaned lingers for long.
async function cleanupOrphanedPhotos(){
  try{
    const referenced = new Set();
    (data.customers||[]).forEach(c => (c.photos||[]).forEach(p=>referenced.add(p.id)));
    (data.oneOffJobs||[]).forEach(j => (j.photos||[]).forEach(p=>referenced.add(p.id)));
    const all = await idbGetAllPhotos();
    const toRemove = [...all.keys()].filter(id => !referenced.has(id));
    if(!toRemove.length) return;
    await Promise.all(toRemove.map(id => idbDeletePhoto(id).then(()=> uncachePhoto(id))));
  }catch(e){}
}
// Loads everything the app needs before its first render: the main data object
// (itself in IndexedDB now, not localStorage — see loadData/saveData above) plus
// every photo, so no screen ever needs to go async just to show something already
// on the phone. Renders once this settles either way — see the boot call at the
// bottom of this file — rather than risking a stuck blank screen if IndexedDB is
// ever unavailable or slow.
async function initStorage(){
  data = await loadData();
  // seed a couple of example customers on very first run so the app isn't blank —
  // moved here (rather than run right after the old synchronous loadData() call)
  // now that loading data is itself an async step
  if(data.customers.length === 0 && !localStorage.getItem('roundBookSeeded')){
    localStorage.setItem('roundBookSeeded','1');
  }
  await migrateLegacyPhotosToIndexedDB(data);
  await saveData(); // persists the now-migrated data — completes the move off
                     // localStorage for anyone upgrading with existing data/photos
  await preloadAllPhotoUrls();
  await cleanupOrphanedPhotos();
}

let data = migrateData({ customers: [] }); // safe placeholder until initStorage() (called at the bottom of this file) loads the real thing

/* ---------- helpers ---------- */
function uid(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayISO(){ const d=new Date(); return d.toISOString().slice(0,10); }
function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso+'T00:00:00');
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}
// Formats a 24hr "HH:MM" input value (e.g. '14:30') as a friendly '2:30 PM'.
function fmtTime(t){
  if(!t) return '';
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  if(isNaN(h)) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}
function daysBetween(a,b){
  const d1=new Date(a+'T00:00:00'), d2=new Date(b+'T00:00:00');
  return Math.round((d2-d1)/86400000);
}
function lastOf(arr){ if(!arr||!arr.length) return null; return [...arr].sort().slice(-1)[0]; }
function lastDateOf(arr){ if(!arr||!arr.length) return null; return [...arr.map(e=>e.date)].sort().slice(-1)[0]; }
function money(n){ const v=Number(n||0); return '£'+v.toFixed(v%1?2:0); }
// One-off jobs can carry a discount percentage (next to price on the job form,
// default 0) which is applied when the job's total is shown on invoices and
// receipts — the job's own `price` stays the full undiscounted rate everywhere
// else (job lists, totals, etc).
function jobDiscountedTotal(j){
  const price = Number((j&&j.price)||0);
  const pct = Math.max(0, Math.min(100, Number((j&&j.discountPercent)||0)));
  return Math.round((price * (1 - pct/100)) * 100) / 100;
}
let pendingToastAction = null;
function toast(msg, actionLabel, actionFn){
  const t=document.getElementById('toast');
  clearTimeout(toast._t);
  pendingToastAction = actionFn || null;
  if(actionLabel && actionFn){
    t.innerHTML = `${escapeHtml(msg)}<button class="toast-undo-btn" onclick="runToastAction()">${escapeHtml(actionLabel)}</button>`;
    t.classList.add('show');
    toast._t = setTimeout(()=>{ t.classList.remove('show'); pendingToastAction=null; }, 5000);
  } else {
    t.textContent = msg;
    t.classList.add('show');
    toast._t = setTimeout(()=>t.classList.remove('show'), 1600);
  }
}
function runToastAction(){
  const fn = pendingToastAction;
  pendingToastAction = null;
  const t = document.getElementById('toast');
  clearTimeout(toast._t);
  t.classList.remove('show');
  if(fn) fn();
}

function freqDays(c){ return (c.frequencyWeeks || 4) * 7; }
function nextDueISO(c){
  const lastClean = lastDateOf(c.cleanHistory);
  if(!lastClean) return null;
  const d = new Date(lastClean+'T00:00:00');
  d.setDate(d.getDate() + freqDays(c));
  return d.toISOString().slice(0,10);
}
function custStatus(c){
  const lastClean = lastDateOf(c.cleanHistory);
  const lastPaid = lastOf((c.paymentHistory||[]).map(p=>p.date));
  const freq = freqDays(c);
  let cleanBadge = null;
  const deferred = c.deferUntil && c.deferUntil > todayISO();
  if(c.paused){
    cleanBadge = {type:'paused', text: c.pauseReason ? `Paused — ${c.pauseReason}` : 'Paused'};
  } else if(deferred){
    // A short, deliberate delay to the next clean — distinct from Pause, which is
    // for longer or indefinite breaks. Suppresses the "due" badge until the
    // deferred date, without touching cleanHistory or the normal cycle after that.
    cleanBadge = {type:'deferred', text: `Deferred to ${fmtDate(c.deferUntil)}`};
  } else if(lastClean){
    const due = daysBetween(lastClean, todayISO());
    if(due >= freq){
      const daysPast = due - freq;
      cleanBadge = {type:'due', text: daysPast===0 ? 'Due today' : `Due +${daysPast}`};
    }
  } else {
    cleanBadge = {type:'due', text:'Never cleaned'};
  }
  const totalCharged = (c.cleanHistory||[]).reduce((s,e)=>s+Number(e.amount||0), 0);
  const totalPaid = (c.paymentHistory||[]).reduce((s,p)=>s+Number(p.amount||0), 0);
  const balance = Math.round((totalCharged - totalPaid) * 100) / 100;
  const owed = balance > 0.005;
  const credit = balance < -0.005;
  return {cleanBadge, owed, credit, balance, lastClean, lastPaid};
}
// How many days since this customer's account last saw any payment — or, if
// they've never paid anything at all, since their first clean — used to sort
// and chase the Owed list by how long a balance has actually been outstanding,
// not just by its size. There's no per-invoice tracking (balance is just a
// running total), so "days since last payment" is the closest simple proxy.
function daysSinceLastPayment(c){
  if(!custStatus(c).owed) return 0;
  const cleanDates = (c.cleanHistory||[]).map(e=>e.date);
  const firstClean = cleanDates.length ? [...cleanDates].sort()[0] : null;
  const anchor = lastOf((c.paymentHistory||[]).map(p=>p.date)) || firstClean;
  return anchor ? daysBetween(anchor, todayISO()) : 0;
}
// "£value/£owed" — the format used everywhere a round's worth is shown: the
// plain price total for its active (non-paused) customers, followed by however
// much of that is currently outstanding, in red so it's clearly distinguished
// from the round's normal earning potential. Muted (not red) when nothing's
// owed, so a healthy round doesn't read as if something's wrong.
function roundValueOwedHtml(value, owed){
  const owedColor = owed > 0.005 ? 'var(--red)' : 'inherit';
  return `${money(value)}/<span style="color:${owedColor};">${money(owed)}</span>`;
}

/* ---------- state ---------- */
let currentTab = 'today';
let currentRound = null;
// Which round the Today tab is currently tracking, chosen by tapping one of
// the "due today" round chips on the hero — stays put across re-renders (even
// after the round's own due count drops to 0 as it gets worked) until either
// a different round is tapped or the date rolls over, at which point
// renderTodayHome() clears it back to the all-rounds view for the new day.
let todaySelectedRound = null;
let todaySelectedRoundDate = null;

let roundsViewMode = 'overview';
let reorderMode = false;
let roundFilterMode = 'all';
let roundDayFilter = 'all';
// Theme mode is 'light', 'dark', or 'auto' (follows the device's system setting).
// darkMode below is always the resolved boolean the rest of the app reads —
// migrated from the old boolean-only roundBookDark key so an existing install
// keeps whatever was explicitly chosen rather than jumping to auto.
let themeMode = localStorage.getItem('roundBookThemeMode') ||
  (localStorage.getItem('roundBookDark') !== null ? (localStorage.getItem('roundBookDark') === '1' ? 'dark' : 'light') : 'auto');
let darkMode = themeMode === 'auto'
  ? !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  : themeMode === 'dark';
let textSize = (()=>{ const v = parseInt(localStorage.getItem('roundBookTextSize'),10); return (Number.isFinite(v) && v>=15 && v<=24) ? v : 18; })();
let bannerDismissed = false;
let marketingFollowUpDismissed = false;
let jobAnniversaryDismissed = false;
let importReviewDismissed = false;
const IMPORT_HOLDING_ROUND = 'Needs review (imported)';
const BACKUP_REMINDER_DAYS = 7; // still used for the "last backup: X days ago" wording in the Backup screen
const BACKUP_REMINDER_HOURS = 48;

function daysSinceBackup(){
  const last = localStorage.getItem('roundBookLastBackup');
  if(!last) return Infinity;
  return daysBetween(last, todayISO());
}
// Marks the moment data first became un-backed-up. Called from saveData() on
// every successful save, but only starts the clock once — it doesn't reset on
// every subsequent change, or someone using the app daily (which is everyone)
// would never sit un-backed-up for 48 hours and the reminder would never fire.
function markPendingBackupChange(){
  if(!localStorage.getItem('roundBookPendingChangeAt')){
    localStorage.setItem('roundBookPendingChangeAt', String(Date.now()));
  }
}
function clearPendingBackupChange(){
  localStorage.removeItem('roundBookPendingChangeAt');
}
// The actual reminder trigger: true once there's been at least one change that
// still isn't reflected in any backup file, and it's been sitting that way for
// 48+ hours. No pending change (fully backed up) never triggers, no matter how
// many days go by with the app untouched.
function backupReminderDue(){
  const pending = localStorage.getItem('roundBookPendingChangeAt');
  if(!pending) return false;
  return (Date.now() - Number(pending)) >= BACKUP_REMINDER_HOURS * 3600000;
}
function dismissBackupBanner(){ bannerDismissed = true; removeBackupPopup(); }
function removeBackupPopup(){
  const el = document.getElementById('backupPopup');
  if(el) el.remove();
}
// Tracks the single most recent delete (customer, job, or quote) so it can be
// undone from a persistent banner, not just a toast that's easy to miss while busy
// out on a round. Overwritten by whatever's deleted next, and cleared once
// restored or dismissed. Kept in memory only (not saved to the backup file) —
// it's a short-lived safety net for this session, not a permanent record.
let lastAction = null;
function recordLastAction(kind, item, index, label){
  lastAction = { kind, item, index, label, at: Date.now() };
  renderLastActionBanner();
}
function undoLastAction(){
  if(!lastAction) return;
  const { kind, item, index } = lastAction;
  if(kind === 'customer') data.customers.splice(Math.min(index, data.customers.length), 0, item);
  else if(kind === 'job') data.oneOffJobs.splice(Math.min(index, data.oneOffJobs.length), 0, item);
  else if(kind === 'quote') data.quotes.splice(Math.min(index, data.quotes.length), 0, item);
  lastAction = null;
  saveData();
  renderLastActionBanner();
  render();
  toast('Restored');
}
function dismissLastAction(){
  lastAction = null;
  renderLastActionBanner();
}
function renderLastActionBanner(){
  const el = document.getElementById('lastActionBanner');
  if(!el) return;
  if(!lastAction){ el.innerHTML = ''; return; }
  el.innerHTML = `<div style="background:var(--red-dim); color:var(--red); border-radius:12px; padding:11px 14px; margin:0 14px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.8125rem; font-weight:700;">
    <span>🗑 Deleted ${escapeHtml(lastAction.label)}</span>
    <span style="display:flex; gap:8px; flex-shrink:0; align-items:center;">
      <button onclick="undoLastAction()" style="background:var(--red); color:#fff; border:none; border-radius:8px; padding:6px 10px; font-weight:800; font-size:0.7812rem;">Undo</button>
      <button onclick="dismissLastAction()" style="background:none; border:none; color:var(--red); font-weight:800; font-size:1rem; line-height:1; padding:0 2px;">✕</button>
    </span>
  </div>`;
}
// Backup reminder — a real popup (like the unsaved-changes prompt below), not just
// a dismissible strip: it's easy to swipe past a thin banner without registering it,
// and un-backed-up data is exactly the kind of thing worth interrupting for. "Not
// now" only dismisses it for this session (bannerDismissed is a plain in-memory
// flag, never persisted), so it reliably comes back the next time the app is opened
// as long as the underlying 48-hour condition still holds.
function renderBackupBanner(){
  const legacy = document.getElementById('backupBanner');
  if(legacy) legacy.innerHTML = ''; // no longer used as a banner; kept in the DOM harmlessly
  if(bannerDismissed || !data.customers.length || !backupReminderDue()){ removeBackupPopup(); return; }
  if(document.getElementById('backupPopup')) return; // already showing — don't recreate on every render()
  const el = document.createElement('div');
  el.id = 'backupPopup';
  el.style.cssText = 'position:fixed; inset:0; z-index:9998; display:flex; align-items:flex-end; justify-content:center;';
  el.innerHTML = `
    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);" onclick="dismissBackupBanner()"></div>
    <div style="position:relative; background:var(--bg); width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:20px; padding-bottom:calc(20px + env(safe-area-inset-bottom)); box-shadow:0 -4px 24px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 8px; font-size:1.0625rem; font-weight:800; color:var(--ink);">📦 Back up your data</h3>
      <p style="color:var(--ink-muted); font-size:0.875rem; margin:0 0 18px; line-height:1.5;">You've made changes that haven't been backed up in over 48 hours. If something happens to this phone before then, that work is gone for good.</p>
      <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="exportData(); dismissBackupBanner();">Back up now</button>
      <button class="btn btn-clean" style="width:100%; border:none;" onclick="dismissBackupBanner()">Not now</button>
    </div>
  `;
  document.body.appendChild(el);
}

/* ---------- app-styled confirm dialog ----------
   Replaces window.confirm() everywhere in the app. Native confirm() is unreliable
   inside an iOS home-screen PWA (there's no Safari chrome for it to anchor to, so
   it can fail to appear at all) — this is the same bottom-sheet prompt originally
   built for the customer-edit "Unsaved changes" warning, generalised so every
   confirmation in the app looks and behaves the same way. Async by nature: pass
   what should happen next as onConfirm/onCancel rather than reading a return value. */
let appConfirmState = null;
function appConfirm(message, opts){
  opts = opts || {};
  removeAppConfirm();
  const el = document.createElement('div');
  el.id = 'appConfirmPrompt';
  el.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:flex-end; justify-content:center;';
  const danger = opts.danger !== false;
  el.innerHTML = `
    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);" onclick="appConfirmCancel()"></div>
    <div style="position:relative; background:var(--bg); width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:20px; padding-bottom:calc(20px + env(safe-area-inset-bottom)); box-shadow:0 -4px 24px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 8px; font-size:1.0625rem; font-weight:800; color:var(--ink);">${escapeHtml(opts.title || 'Are you sure?')}</h3>
      <p style="color:var(--ink-muted); font-size:0.875rem; margin:0 0 18px; line-height:1.5;">${escapeHtml(message)}</p>
      <button class="btn" style="width:100%; margin-bottom:10px; border:none; ${danger ? 'background:var(--red-dim); color:var(--red);' : 'background:var(--blue); color:#fff;'}" onclick="appConfirmYes()">${escapeHtml(opts.confirmLabel || 'Confirm')}</button>
      <button class="btn btn-clean" style="width:100%; border:none;" onclick="appConfirmCancel()">${escapeHtml(opts.cancelLabel || 'Cancel')}</button>
    </div>
  `;
  document.body.appendChild(el);
  appConfirmState = {onConfirm: opts.onConfirm || null, onCancel: opts.onCancel || null};
}
function removeAppConfirm(){
  const el = document.getElementById('appConfirmPrompt');
  if(el) el.remove();
}
function appConfirmYes(){
  const st = appConfirmState; appConfirmState = null;
  removeAppConfirm();
  if(st && st.onConfirm) st.onConfirm();
}
function appConfirmCancel(){
  const st = appConfirmState; appConfirmState = null;
  removeAppConfirm();
  if(st && st.onCancel) st.onCancel();
}

