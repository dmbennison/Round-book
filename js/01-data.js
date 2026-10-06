/* 01-data.js -- Data storage (IndexedDB + localStorage fallback), save/load, migrations, date/format helpers, and shared app state variables.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- storage ---------- */
const STORE_KEY = 'roundBookData_v1';
// APP_VERSION is a plain decimal number (e.g. 1.01, 1.02 ... 1.99, 2.00) —
// bump by 0.01 for every change. formatVersion always renders it to exactly
// two decimal places, so it's never shown as "1.1" or "1.100".
const APP_VERSION = 2.46;
function formatVersion(v){ return Number(v).toFixed(2); }
// User-facing changelog shown in the About screen's "Version history".
// MAINTENANCE: every time APP_VERSION is bumped, PREPEND a new {version, changes}
// entry (newest first) with ONE very short plain-English summary, then delete
// entries so only the latest ten remain.
const VERSION_HISTORY = [
  {version: 2.46, changes: ['Fuel prices on Today is now a one-tap link to the live price map (the embedded list showed out-of-date prices)']},
  {version: 2.45, changes: ['Annotations can be moved, selected, deleted and undone; new Before & after photo maker (landscape side by side, or portrait for social media) with labels']},
  {version: 2.44, changes: ['Fuel prices box: nearest stations first (cheapest-first was surfacing out-of-date prices), fresh load every time, link to the live list']},
  {version: 2.43, changes: ['Live sync: devices stay in step automatically through your own free Cloudflare mailbox (encrypted on-device first); sync status shown in the header']},
  {version: 2.42, changes: ['Pinch, double-tap and drag to zoom photos; send a photo with an offer text (gutter clearing, conservatory roof, fascias) from the photo viewer']},
  {version: 2.41, changes: ['Payment chase: friendly wording on the first only, firmer on every chase after; new Couldn\'t clean button defers a customer a full cycle and flags the card']},
  {version: 2.40, changes: ['Collapsed Fuel prices box on Today: free local diesel/petrol prices from CheckFuelPrices, loaded only when opened']},
  {version: 2.39, changes: ['Report preview and shared PDFs now laid out as separate A4 sheets with page numbers']},
  {version: 2.38, changes: ['Property type badge removed from customer cards; Due view shows only clean info and Owed view only payment info']},
  {version: 2.37, changes: ['Round stats in a Statistics dropdown; gallery moved under the info button; reports open in a zoomable preview with Print, Share PDF and Share doc']},
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

/* ---------- accounting software export ----------
   A plain 3-column CSV of payments received -- Date, Description, Amount --
   rather than any one platform's own file format. FreeAgent, Xero and
   QuickBooks all accept this shape as a generic bank statement/transaction
   import: their own import wizard is what maps these three columns and
   confirms the date format, the same way spreadsheet import into Round Book
   itself works (see openImportColumnMapping). One format that all three can
   read beats maintaining three separate exports. */
function csvField(v){
  const s = String(v==null?'':v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function csvDateUK(iso){
  const parts = iso.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}
function accountingExportRows(fromISO, toISO){
  const rows = [];
  data.customers.forEach(c=>{
    (c.paymentHistory||[]).forEach(p=>{
      if(!p.date || !(Number(p.amount) > 0)) return;
      if(fromISO && p.date < fromISO) return;
      if(toISO && p.date > toISO) return;
      rows.push({
        date: p.date,
        description: 'Window cleaning \u2014 ' + (c.name || c.address || 'Customer') + (c.accountNumber ? ' (Acct #' + c.accountNumber + ')' : ''),
        amount: Number(p.amount)
      });
    });
  });
  rows.sort((a,b)=> a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return rows;
}
function openAccountingExport(){
  const today = todayISO();
  const tyStart = taxYearStart(today);
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Export for accounting software</h2>
      <button class="sheet-close" onclick="closeSheet()">\u2715</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px; line-height:1.5;">
      A plain CSV of payments received \u2014 Date, Description, Amount. FreeAgent, Xero and QuickBooks all accept this for importing or matching bank transactions; their import screen is where you confirm these columns and the date format (DD/MM/YYYY here).
    </p>
    <label style="margin-top:0;">Date range</label>
    <select id="acct_range" onchange="toggleAcctCustomRange()">
      <option value="tytd">This tax year to date (from ${fmtDate(tyStart)})</option>
      <option value="lasty">Last tax year</option>
      <option value="all">All time</option>
      <option value="custom">Custom range</option>
    </select>
    <div id="acct_custom_range" style="display:none;">
      <label>From</label>
      <input type="date" id="acct_from" value="${tyStart}">
      <label>To</label>
      <input type="date" id="acct_to" value="${today}">
    </div>
    <div class="form-actions" style="margin-top:20px;">
      <button class="btn-primary" onclick="exportAccountingCSV()">Export CSV</button>
    </div>
  `, () => openBackup());
}
function toggleAcctCustomRange(){
  const v = document.getElementById('acct_range').value;
  document.getElementById('acct_custom_range').style.display = v==='custom' ? '' : 'none';
}
async function exportAccountingCSV(){
  const today = todayISO();
  const tyStart = taxYearStart(today);
  const range = document.getElementById('acct_range').value;
  let fromISO = null, toISO = null;
  if(range === 'tytd'){
    fromISO = tyStart; toISO = today;
  } else if(range === 'lasty'){
    const lastYEnd = new Date(tyStart+'T00:00:00'); lastYEnd.setDate(lastYEnd.getDate()-1);
    toISO = lastYEnd.toISOString().slice(0,10);
    fromISO = taxYearStart(toISO);
  } else if(range === 'custom'){
    fromISO = document.getElementById('acct_from').value || null;
    toISO = document.getElementById('acct_to').value || null;
  }
  // 'all' leaves both fromISO/toISO null

  const rows = accountingExportRows(fromISO, toISO);
  if(!rows.length){ toast('No payments found in that date range'); return; }

  const lines = ['Date,Description,Amount'].concat(rows.map(function(r){
    return [csvDateUK(r.date), csvField(r.description), r.amount.toFixed(2)].join(',');
  }));
  const csvStr = lines.join('\r\n');
  const filename = `round-book-accounting-${todayISO()}.csv`;
  if(await deliverTextFile(csvStr, filename, 'text/csv', 'Round Book Accounting Export')){
    toast(`${rows.length} payment${rows.length===1?'':'s'} exported`);
  }
}
// Hands a text file to the share sheet where the phone supports it, otherwise
// downloads it. Returns false only if the person cancelled the share sheet.
async function deliverTextFile(text, filename, mime, shareTitle){
  return deliverTextFiles([{text, filename, mime}], shareTitle);
}
// Several files at once (e.g. a sync file plus its photo files). Same rules: share
// sheet where the phone supports it, otherwise plain downloads.
async function deliverTextFiles(items, shareTitle){
  if(navigator.canShare){
    try{
      const files = items.map(it => new File([it.text], it.filename, {type:it.mime}));
      if(navigator.canShare({files})){
        await navigator.share({files, title:shareTitle});
        return true;
      }
    }catch(e){
      if(e && e.name === 'AbortError') return false;
    }
  }
  for(const it of items){
    const blob = new Blob([it.text], {type:it.mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = it.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    await new Promise(r=>setTimeout(r, 400));
  }
  return true;
}

const DEFAULT_CLEAN_TEMPLATE = "Hi {name}, just a reminder I'll be round to clean your windows soon. Let me know if that's not convenient.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_PAY_TEMPLATE = "Hi {name}, a friendly reminder that your window cleaning payment of {amount} is outstanding.\n\n{bankdetails}Thanks,\n{yourname}\n{company}";
const DEFAULT_PAY_FOLLOWUP_TEMPLATE = "Hi {name}, this is a further reminder — your window cleaning payment of {amount} is now {daysoverdue} days overdue and still unpaid. Please arrange payment today.\n\n{bankdetails}Thanks,\n{yourname}\n{company}";
const DEFAULT_RECEIPT_TEMPLATE = "Hi {name}, thank you for your payment of {amount} received {date}.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_QUOTE_TEMPLATE = "Hi {name}, thanks for your enquiry. I'd quote {amount} for the following work: {work}\nLet me know if you'd like to go ahead.\nThanks,\n{yourname}\n{company}";
const DEFAULT_REPEAT_QUOTE_TEMPLATE = "Hi {name}, hope you're well! I cleaned your windows for you before and wondered if you'd like the same job done again? I'd quote {amount} for the following work: {work}\n\nJust let me know and I'll get you booked back in.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_QUOTE_FOLLOWUP_TEMPLATE = "Hi {name}, just checking you saw my last message — I quoted {amount} for {work}. Let me know if you'd like to go ahead.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_QUOTE_FOLLOWUP2_TEMPLATE = "Hi {name}, no worries if the timing's not right at the moment — just wanted to leave the door open. My quote of {amount} for {work} still stands whenever suits.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_MARKETING_TEMPLATE = "Hi {name}, just letting you know we also offer gutter clearing and fascia cleaning alongside your window clean — let me know if you'd like a quote.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_REFERRAL_TEMPLATE = "Hi {name}, hope you're happy with your window cleaning! If you know anyone nearby who'd like a regular clean too, we'd really appreciate a mention — just get them to say your name when they get in touch.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_WINBACK_TEMPLATE = "Hi {name}, it's been a while since we last cleaned your windows — just checking in to see if you'd like to start up again. Let me know and I'll get you back on the round.\n\nThanks,\n{yourname}\n{company}";
// Photo + offer texts (sent from the photo viewer). {price} becomes " for £X" when a price
// is typed in, or disappears when it isn't.
const DEFAULT_UPSELL_GUTTER_TEMPLATE = "Hi {name}, while I was cleaning your windows I noticed your gutters are blocked (photo attached). I can clear them{price} if you'd like — just let me know and I'll fit it in.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_UPSELL_CONSERVATORY_TEMPLATE = "Hi {name}, while I was at your property I noticed your conservatory roof could do with a clean (photo attached). I can sort that{price} if you'd like — just let me know and I'll fit it in.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_UPSELL_FASCIAS_TEMPLATE = "Hi {name}, while I was at your property I noticed your fascias and soffits are looking grubby (photo attached). I can clean them{price} if you'd like — just let me know and I'll fit it in.\n\nThanks,\n{yourname}\n{company}";
const DEFAULT_UPSELL_OTHER_TEMPLATE = "Hi {name}, while I was at your property I noticed something I can help with (photo attached). I can sort it{price} if you'd like — just let me know and I'll fit it in.\n\nThanks,\n{yourname}\n{company}";
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
const DEFAULT_CLEANED_TODAY_TEMPLATE = "Hi {name}, your windows have been cleaned today! The amount now owing is {amount}.\n\n{bankdetails}Thanks,\n{yourname}\n{company}";
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
  const OLD_CLEANED_TODAY_TEMPLATES = ["Hi {name}, your windows have been cleaned today!\n\n{bankdetails}Thanks,\n{yourname}\n{company}", "Hi {name}, your windows have been cleaned today! The cost for this clean is {amount}.\n\n{bankdetails}Thanks,\n{yourname}\n{company}"];
  if(!parsed.settings.cleanTemplate || OLD_CLEAN_TEMPLATES.includes(parsed.settings.cleanTemplate)) parsed.settings.cleanTemplate = DEFAULT_CLEAN_TEMPLATE;
  if(!parsed.settings.payTemplate || OLD_PAY_TEMPLATES.includes(parsed.settings.payTemplate)) parsed.settings.payTemplate = DEFAULT_PAY_TEMPLATE;
  // Upgrade the earlier, gentler follow-up wording — but only if it was never customised.
  const OLD_PAY_FOLLOWUP_TEMPLATES = ["Hi {name}, following up again — your window cleaning payment of {amount} is now {daysoverdue} days overdue. Could you sort this when you get a chance?\n\n{bankdetails}Thanks,\n{yourname}\n{company}"];
  if(!parsed.settings.payFollowUpTemplate || OLD_PAY_FOLLOWUP_TEMPLATES.includes(parsed.settings.payFollowUpTemplate)) parsed.settings.payFollowUpTemplate = DEFAULT_PAY_FOLLOWUP_TEMPLATE;
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
  if(parsed.settings.autoCleanedText == null) parsed.settings.autoCleanedText = true; // swipe-clean opens the "cleaned" text
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
    if(c.couldntCleanDate === undefined) c.couldntCleanDate = null;
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
    // Photos that arrived in a sync file but aren't in a merged customer yet (the data
    // file may follow later) are protected for two weeks.
    let pending = {};
    try{ if(typeof syncMetaGet === 'function') pending = (await syncMetaGet()).pendingPhotos || {}; }catch(e){}
    const cutoff = Date.now() - 14*86400000;
    const all = await idbGetAllPhotos();
    const toRemove = [...all.keys()].filter(id => !referenced.has(id) && !(pending[id] && pending[id] > cutoff));
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
  // Built from local date parts — toISOString() converts to UTC, which in British
  // Summer Time shifted the result back a day.
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// The next-due date shared by the most customers in a round (their next-due
// date, not their price — see nextDueISO) — used to give a brand new
// customer with no clean history yet a sensible starting due date instead of
// showing up as due the moment they're added. Only looks at customers who've
// actually been cleaned at least once; ties go to whichever date comes first
// alphabetically (they're ISO dates, so that's also chronologically first).
function roundMajorityDueDate(roundName){
  const counts = {};
  data.customers.forEach(c=>{
    if(c.paused) return;
    if((c.round||'Unassigned') !== roundName) return;
    const due = nextDueISO(c);
    if(!due) return;
    counts[due] = (counts[due]||0) + 1;
  });
  let best = null, bestCount = 0;
  Object.keys(counts).sort().forEach(d=>{
    if(counts[d] > bestCount){ bestCount = counts[d]; best = d; }
  });
  return best;
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
// How long the customer's *current* balance has actually been outstanding —
// used to sort/chase the Owed list, the {daysoverdue} message placeholder,
// and the Today tab's 0–14/14–30/30+ day owed buckets. There's no
// per-invoice tracking (balance is just a running total), so this works out
// the anchor date properly instead of just using the last payment date:
// payments are allocated to the oldest charges first (FIFO, like a normal
// aged-debt report), and the first charge not fully covered by payments
// made so far is what the current balance is actually measured from. This
// matters because a customer who pays off their balance every visit, then
// gets cleaned again yesterday but hasn't paid for that one yet, should
// read as "1 day", not as however long ago their last payment happened to
// land.
function daysSinceLastPayment(c){
  if(!custStatus(c).owed) return 0;
  const charges = (c.cleanHistory||[]).map(e=>({date: e.date, amount: Number(e.amount||0)})).sort((a,b)=> a.date<b.date?-1 : a.date>b.date?1 : 0);
  let paymentsLeft = (c.paymentHistory||[]).reduce((s,p)=>s+Number(p.amount||0), 0);
  for(const charge of charges){
    if(paymentsLeft >= charge.amount - 0.005){
      paymentsLeft -= charge.amount;
    } else {
      return daysBetween(charge.date, todayISO());
    }
  }
  return 0;
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
// How long a balance has to have been outstanding to show in an Owed list —
// 'all', '0-14', '14-30', or '30+' (see daysSinceLastPayment for what "days"
// means without per-invoice tracking).
let owedAgeFilter = 'all';
// Set briefly after a press-and-hold opens the customer info box (see 09-boot.js)
// so the finger lifting doesn't tap the overlay and instantly close it.
let overlayIgnoreUntil = 0;
function setOwedAgeFilter(v){ owedAgeFilter = v; render(); }
function matchesOwedAgeFilter(c){
  if(owedAgeFilter === 'all') return true;
  const days = daysSinceLastPayment(c);
  if(owedAgeFilter === '0-14') return days < 14;
  if(owedAgeFilter === '14-30') return days >= 14 && days < 30;
  return days >= 30;
}
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
const BACKUP_REMINDER_HOURS = 24; // daily

function daysSinceBackup(){
  const last = localStorage.getItem('roundBookLastBackup');
  if(!last) return Infinity;
  return daysBetween(last, todayISO());
}
// Marks the moment data first became un-backed-up. Called from saveData() on
// every successful save, but only starts the clock once — it doesn't reset on
// every subsequent change, or someone using the app daily (which is everyone)
// would never sit un-backed-up for 24 hours and the reminder would never fire.
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
// 24+ hours. No pending change (fully backed up) never triggers, no matter how
// many days go by with the app untouched.
function backupReminderDue(){
  const pending = localStorage.getItem('roundBookPendingChangeAt');
  if(!pending) return false;
  return (Date.now() - Number(pending)) >= BACKUP_REMINDER_HOURS * 3600000;
}
/* ---------- persistent storage + automatic safety copies ----------
   A web app on iOS can't write to iCloud/Drive by itself in the background —
   the share sheet needs a tap — so true automatic off-phone backup isn't
   possible. What IS possible, and what this does:
   1. Ask the browser to mark this site's storage as "persistent" so it isn't
      cleared when the phone runs low on space.
   2. Keep rolling safety copies (data only, no photos) in a SEPARATE
      IndexedDB database, so a bad edit/import or a damaged main record can be
      rolled back. They live on the phone, so they do not replace exporting a
      backup to iCloud Drive / Google Drive. */
async function requestPersistentStorage(){
  let status = 'unsupported';
  try{
    if(navigator.storage && navigator.storage.persist){
      let already = false;
      if(navigator.storage.persisted) already = await navigator.storage.persisted();
      status = (already || await navigator.storage.persist()) ? 'granted' : 'denied';
    }
  }catch(e){}
  try{ localStorage.setItem('roundBookPersistStatus', status); }catch(e){}
  return status;
}
const SAFETY_DB_NAME = 'roundBookSafetyCopies';
const SAFETY_STORE = 'copies';
const SAFETY_KEEP = 10;
const SAFETY_EVERY_MS = 20 * 3600000; // roughly daily, without drifting later each day
let safetyDbPromise = null;
function openSafetyDb(){
  if(safetyDbPromise) return safetyDbPromise;
  safetyDbPromise = new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(SAFETY_DB_NAME, 1);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(SAFETY_STORE)) db.createObjectStore(SAFETY_STORE);
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  safetyDbPromise.catch(()=>{ safetyDbPromise = null; });
  return safetyDbPromise;
}
// Newest first.
async function listSafetyCopies(){
  const db = await openSafetyDb();
  return new Promise((resolve, reject)=>{
    const req = db.transaction(SAFETY_STORE, 'readonly').objectStore(SAFETY_STORE).getAll();
    req.onsuccess = ()=> resolve((req.result || []).sort((a,b)=> b.at - a.at));
    req.onerror = ()=> reject(req.error);
  });
}
async function takeSafetyCopy(reason){
  try{
    if(!data || !data.customers) return false;
    const jobs = (data.oneOffJobs||[]).length, quotes = (data.quotes||[]).length;
    // Never store an empty copy — it would only push a useful one out of the list.
    if(!data.customers.length && !jobs && !quotes) return false;
    const db = await openSafetyDb();
    const at = Date.now();
    const rec = {
      at, reason: reason || 'Automatic',
      customers: data.customers.length, jobs, quotes,
      data: JSON.parse(JSON.stringify(data))
    };
    await new Promise((resolve, reject)=>{
      const tx = db.transaction(SAFETY_STORE, 'readwrite');
      tx.objectStore(SAFETY_STORE).put(rec, at);
      tx.oncomplete = ()=>resolve();
      tx.onerror = ()=>reject(tx.error);
      tx.onabort = ()=>reject(tx.error);
    });
    try{ localStorage.setItem('roundBookLastSafetyCopy', String(at)); }catch(e){}
    const extra = (await listSafetyCopies()).slice(SAFETY_KEEP);
    if(extra.length){
      await new Promise((resolve)=>{
        const tx = db.transaction(SAFETY_STORE, 'readwrite');
        extra.forEach(c => tx.objectStore(SAFETY_STORE).delete(c.at));
        tx.oncomplete = ()=>resolve();
        tx.onerror = ()=>resolve();
        tx.onabort = ()=>resolve();
      });
    }
    return true;
  }catch(e){ return false; }
}
// Called when the app opens and whenever it comes back to the foreground.
function maybeAutoSafetyCopy(){
  let last = 0;
  try{ last = Number(localStorage.getItem('roundBookLastSafetyCopy')) || 0; }catch(e){}
  if(Date.now() - last >= SAFETY_EVERY_MS) takeSafetyCopy('Automatic');
}
async function restoreSafetyCopy(at){
  try{
    const db = await openSafetyDb();
    const rec = await new Promise((resolve, reject)=>{
      const req = db.transaction(SAFETY_STORE, 'readonly').objectStore(SAFETY_STORE).get(at);
      req.onsuccess = ()=>resolve(req.result || null);
      req.onerror = ()=>reject(req.error);
    });
    if(!rec) throw new Error('missing');
    // Keep what's on the phone right now as a safety copy too, so restoring is itself undoable.
    await takeSafetyCopy('Before restoring a safety copy');
    data = migrateData(JSON.parse(JSON.stringify(rec.data)));
    await saveData();
    syncForgetBase(); // this device has jumped back in time — the next sync must start afresh
    sheetOnClose = null;
    closeSheet();
    render();
    toast('Safety copy restored');
  }catch(e){
    toast('Couldn\'t restore that safety copy');
  }
}

function dismissBackupBanner(){ bannerDismissed = true; removeBackupPopup(); }
function removeBackupPopup(){
  const el = document.getElementById('backupPopup');
  if(el) el.remove();
}
// A new service worker taking over (see the controllerchange listener in
// 09-boot.js) means an update has already been downloaded and is ready —
// this just offers a one-tap reload rather than forcing one, so it never
// interrupts someone filling in a form or mid-sheet.
let updateBannerShown = false;
function showUpdateBanner(){
  if(updateBannerShown || document.getElementById('updatePopup')) return;
  updateBannerShown = true;
  const el = document.createElement('div');
  el.id = 'updatePopup';
  el.style.cssText = 'position:fixed; left:0; right:0; bottom:0; z-index:9999; display:flex; justify-content:center; padding:0 14px calc(14px + env(safe-area-inset-bottom));';
  el.innerHTML = `
    <div style="background:var(--navy); color:#fff; border-radius:14px; padding:12px 14px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 20px rgba(0,0,0,0.3); max-width:480px; width:100%;">
      <span style="font-size:1.25rem; flex-shrink:0;">🔄</span>
      <span style="flex:1; font-size:0.8125rem; font-weight:700; line-height:1.4;">A new version of Round Book is ready.</span>
      <button onclick="window.location.reload()" style="background:#fff; color:var(--navy); border:none; border-radius:8px; padding:8px 12px; font-weight:800; font-size:0.8125rem; flex-shrink:0;">Update</button>
    </div>`;
  document.body.appendChild(el);
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
// Backup reminder — a real popup (styled like the app's confirm dialog), not just
// a dismissible strip: it's easy to swipe past a thin banner without registering it,
// and un-backed-up data is exactly the kind of thing worth interrupting for. "Not
// now" only dismisses it for this session (bannerDismissed is a plain in-memory
// flag, never persisted), so it reliably comes back the next time the app is opened
// as long as the underlying 24-hour condition still holds.
function renderBackupBanner(){
  if(bannerDismissed || !data.customers.length || !backupReminderDue()){ removeBackupPopup(); return; }
  if(document.getElementById('backupPopup')) return; // already showing — don't recreate on every render()
  const el = document.createElement('div');
  el.id = 'backupPopup';
  el.style.cssText = 'position:fixed; inset:0; z-index:9998; display:flex; align-items:flex-end; justify-content:center;';
  el.innerHTML = `
    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);" onclick="dismissBackupBanner()"></div>
    <div style="position:relative; background:var(--bg); width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:20px; padding-bottom:calc(20px + env(safe-area-inset-bottom)); box-shadow:0 -4px 24px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 8px; font-size:1.0625rem; font-weight:800; color:var(--ink);">📦 Back up your data</h3>
      <p style="color:var(--ink-muted); font-size:0.875rem; margin:0 0 12px; line-height:1.5;">You've made changes that haven't been backed up in over 24 hours. If something happens to this phone, that work is gone for good.</p>
      <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 0 18px; line-height:1.5;">Tap Back up now, then choose <b>Save to Files → iCloud Drive</b> (or <b>Drive</b>, if you have Google Drive) in the share sheet, so the backup lives somewhere other than just this phone.</p>
      <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="exportData(); dismissBackupBanner();">Back up now</button>
      <button class="btn btn-clean" style="width:100%; border:none;" onclick="dismissBackupBanner()">Not now</button>
    </div>
  `;
  document.body.appendChild(el);
}

/* ---------- app-styled confirm dialog ----------
   The ONE dialog used for every confirmation, notice and quick text entry in the
   app (native confirm()/alert()/prompt() are unreliable inside an iOS home-screen
   PWA — there's no Safari chrome for them to anchor to, so they can fail to appear
   at all). Async by nature: pass what should happen next as onConfirm/onCancel
   rather than reading a return value.
   Options: title, confirmLabel, cancelLabel, danger (false = blue confirm button),
   altLabel + onAlt (an optional middle red button, e.g. "Discard changes"),
   hideCancel (a plain notice with just one button — see appAlert), and
   input {value, type: 'text'|'number'|'password', placeholder} (adds a text box; its value is passed to onConfirm). */
let appConfirmState = null;
function appConfirm(message, opts){
  opts = opts || {};
  removeAppConfirm();
  const el = document.createElement('div');
  el.id = 'appConfirmPrompt';
  el.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:flex-end; justify-content:center;';
  const danger = opts.danger !== false;
  const inputHtml = opts.input
    ? `<input id="appConfirmInput" type="${opts.input.type === 'number' ? 'number' : opts.input.type === 'password' ? 'password' : 'text'}" ${opts.input.type === 'number' ? 'inputmode="decimal" step="any" min="0"' : opts.input.type === 'password' ? 'autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false"' : ''} value="${escapeAttr(opts.input.value == null ? '' : opts.input.value)}" placeholder="${escapeAttr(opts.input.placeholder || '')}" style="width:100%; box-sizing:border-box; margin:0 0 18px;">`
    : '';
  const altHtml = opts.altLabel
    ? `<button class="btn" style="width:100%; margin-bottom:10px; border:none; background:var(--red-dim); color:var(--red);" onclick="appConfirmAlt()">${escapeHtml(opts.altLabel)}</button>`
    : '';
  const cancelHtml = opts.hideCancel
    ? ''
    : `<button class="btn btn-clean" style="width:100%; border:none;" onclick="appConfirmCancel()">${escapeHtml(opts.cancelLabel || 'Cancel')}</button>`;
  el.innerHTML = `
    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);" onclick="appConfirmCancel()"></div>
    <div style="position:relative; background:var(--bg); width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:20px; padding-bottom:calc(20px + env(safe-area-inset-bottom)); box-shadow:0 -4px 24px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 8px; font-size:1.0625rem; font-weight:800; color:var(--ink);">${escapeHtml(opts.title || 'Are you sure?')}</h3>
      <p style="color:var(--ink-muted); font-size:0.875rem; margin:0 0 ${opts.input ? '12px' : '18px'}; line-height:1.5;">${escapeHtml(message)}</p>
      ${inputHtml}
      <button class="btn" style="width:100%; margin-bottom:10px; border:none; ${danger ? 'background:var(--red-dim); color:var(--red);' : 'background:var(--blue); color:#fff;'}" onclick="appConfirmYes()">${escapeHtml(opts.confirmLabel || 'Confirm')}</button>
      ${altHtml}
      ${cancelHtml}
    </div>
  `;
  document.body.appendChild(el);
  appConfirmState = {onConfirm: opts.onConfirm || null, onCancel: opts.onCancel || null, onAlt: opts.onAlt || null, hasInput: !!opts.input};
  if(opts.input){ const inp = document.getElementById('appConfirmInput'); if(inp){ inp.focus(); inp.select(); } }
}
// A notice with a single OK button, in place of native alert().
function appAlert(message, opts){
  opts = opts || {};
  appConfirm(message, {title: opts.title || 'Notice', confirmLabel: opts.confirmLabel || 'OK', danger: false, hideCancel: true, onConfirm: opts.onConfirm});
}
function removeAppConfirm(){
  const el = document.getElementById('appConfirmPrompt');
  if(el) el.remove();
}
function appConfirmYes(){
  const st = appConfirmState; appConfirmState = null;
  const inp = st && st.hasInput ? document.getElementById('appConfirmInput') : null;
  const value = inp ? inp.value : undefined;
  removeAppConfirm();
  if(st && st.onConfirm) st.onConfirm(value);
}
function appConfirmAlt(){
  const st = appConfirmState; appConfirmState = null;
  removeAppConfirm();
  if(st && st.onAlt) st.onAlt();
}
function appConfirmCancel(){
  const st = appConfirmState; appConfirmState = null;
  removeAppConfirm();
  if(st && st.onCancel) st.onCancel();
}

