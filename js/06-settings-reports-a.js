/* 06-settings-reports-a.js -- Settings, dark mode/colour scheme/text size, and the first half of the print/export reports.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- settings / dark mode / colour scheme ---------- */
const THEMES = {
  ocean:  {name:'Ocean',  navy:'#164559', blue:'#3FA9D6'},
  slate:  {name:'Slate',  navy:'#3A424C', blue:'#A6B4C2'},
  rust:   {name:'Rust',   navy:'#5A2A1C', blue:'#E0723A'},
  plum:   {name:'Plum',   navy:'#4A1F52', blue:'#C15FC0'},
  forest: {name:'Forest', navy:'#1E4A2E', blue:'#4FAE64'},
  ruby:   {name:'Ruby',    navy:'#661018', blue:'#FF3B4A'}
};
let themeName = localStorage.getItem('roundBookTheme') || 'ocean';

// Small colour-mixing helpers so every tinted surface in the app (not just
// the header) can be derived from the two colours a scheme actually defines.
function hexToRgb(hex){
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const num = parseInt(hex,16);
  return [(num>>16)&255, (num>>8)&255, num&255];
}
function mixHex(hexA, hexB, weight){
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const mixed = a.map((v,i)=> v + (b[i]-v)*weight);
  return '#' + mixed.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}

function applyDarkMode(){
  document.body.classList.toggle('dark', darkMode);
  applyTheme();
}
function setDarkMode(v){
  darkMode = v;
  localStorage.setItem('roundBookDark', v?'1':'0');
  applyDarkMode();
  openSettings();
}
function applyTextSize(){
  document.documentElement.style.fontSize = textSize + 'px';
}
function previewTextSize(v){
  const n = Math.max(15, Math.min(24, parseInt(v,10) || 18));
  document.documentElement.style.fontSize = n + 'px';
  const label = document.getElementById('textSizeLabel');
  if(label) label.textContent = n + 'px';
}
function setTextSize(v){
  const n = Math.max(15, Math.min(24, parseInt(v,10) || 18));
  textSize = n;
  localStorage.setItem('roundBookTextSize', String(n));
  applyTextSize();
  openSettings();
}
function applyTheme(){
  const t = THEMES[themeName] || THEMES.ocean;
  // Set on the body element itself (not html/:root) so these inline values take
  // precedence over the static light/dark-mode CSS blocks, which declare --blue-dim,
  // --bg etc. directly on body/body.dark and would otherwise win over anything
  // inherited from an ancestor regardless of dark mode state.
  const root = document.body.style;
  root.setProperty('--navy', t.navy);
  root.setProperty('--blue', t.blue);
  // A darker shade of the scheme's navy, used for toasts and other high-emphasis chrome.
  root.setProperty('--navy-dark', mixHex(t.navy, '#000000', 0.28));
  // A deepened version of the accent colour, used as readable text on the pale "dim" chips/buttons below.
  root.setProperty('--blue-deep', mixHex(t.blue, '#000000', 0.32));
  // The pale tinted background used for chips, quick-action buttons, and banners — mixed
  // toward white in light mode and toward the dark surface colour in dark mode, so every
  // scheme gets its own badge colour instead of everything defaulting to ocean-blue.
  root.setProperty('--blue-dim', darkMode ? mixHex(t.blue, '#0E1620', 0.82) : mixHex(t.blue, '#FFFFFF', 0.86));
  // A much paler tint than --blue-dim, used only for the subtle gradient fill on
  // cards (round-card, cust-card) — kept pale so the black outline (below) reads
  // as the card's main definition rather than the fill colour.
  root.setProperty('--card-tint', darkMode ? mixHex(t.blue, '#16212C', 0.92) : mixHex(t.blue, '#FFFFFF', 0.94));
  // A soft tint of the main screen background, so the page itself carries a hint of the
  // chosen scheme rather than staying neutral grey — card surfaces (--surface) stay
  // untinted so content still stands out clearly on top.
  root.setProperty('--bg', darkMode ? mixHex(t.blue, '#0E1620', 0.90) : mixHex(t.blue, '#F5F7F8', 0.92));
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t.navy);
}
function setTheme(name){
  if(!THEMES[name]) return;
  themeName = name;
  localStorage.setItem('roundBookTheme', name);
  applyTheme();
  openSettings();
}
function openSettings(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Settings</h2>
      ${helpIconBtn('settings', () => openSettings())}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div class="section-label" style="margin-top:0;">Appearance</div>
    <div class="seg-row">
      <button class="seg-btn ${!darkMode?'active':''}" onclick="setDarkMode(false)">☀️ Light</button>
      <button class="seg-btn ${darkMode?'active':''}" onclick="setDarkMode(true)">🌙 Dark</button>
    </div>
    <div class="section-label">Text size</div>
    <div style="display:flex; align-items:center; gap:10px; margin:4px 2px 16px;">
      <span style="font-size:0.75rem; color:var(--ink-muted); flex-shrink:0;">A</span>
      <input type="range" min="15" max="24" step="1" value="${textSize}" oninput="previewTextSize(this.value)" onchange="setTextSize(this.value)" style="flex:1; accent-color:var(--blue);">
      <span style="font-size:1.375rem; color:var(--ink-muted); flex-shrink:0; line-height:1;">A</span>
      <span id="textSizeLabel" style="font-size:0.75rem; font-weight:800; color:var(--ink); min-width:34px; text-align:right; flex-shrink:0;">${textSize}px</span>
    </div>
    <div class="section-label">Colour scheme</div>
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:16px;">
      ${Object.keys(THEMES).map(key=>{
        const t = THEMES[key];
        const active = themeName===key;
        return `<button onclick="setTheme('${key}')" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 4px; border-radius:12px; border:2px solid ${active?t.blue:'var(--line)'}; background:var(--surface);">
          <span style="width:26px; height:26px; border-radius:50%; background:${t.navy}; box-shadow: inset 0 0 0 4px ${t.blue};"></span>
          <span style="font-size:0.7188rem; font-weight:700; color:var(--ink);">${t.name}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="section-label">Messaging app</div>
    <div class="seg-row">
      <button class="seg-btn ${data.settings.messagingApp!=='whatsapp'?'active':''}" onclick="setMessagingApp('sms')">💬 Text message</button>
      <button class="seg-btn ${data.settings.messagingApp==='whatsapp'?'active':''}" onclick="setMessagingApp('whatsapp')">🟢 WhatsApp</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:4px 2px 16px; line-height:1.5;">Used whenever a message is sent straight to a customer's phone — cleaning and payment reminders, receipts, quotes, and group marketing texts.</p>
    <div class="section-label">Business details</div>
    <button class="backup-btn" onclick="openBusinessDetails()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1M9 13h1M14 9h1M14 13h1"/></svg>
      <div><div class="t1">Business details</div><div class="t2">Company info, logo, your name, and bank details</div></div>
    </button>
    <button class="backup-btn" onclick="openMessageTemplates()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div><div class="t1">Message templates</div><div class="t2">Wording for reminders, receipts, and quotes</div></div>
    </button>
  `);
}

// Each entry drives one row on the Message Templates screen and its edit dialog —
// add a template here and it gets a button, an editor, and reset support for free.
// Marketing text is deliberately NOT here — it now has several named campaigns
// rather than one fixed wording, managed from the Marketing tab instead.
const TEMPLATE_DEFS = [
  { key: 'cleanTemplate', label: 'Cleaning reminder', default: DEFAULT_CLEAN_TEMPLATE },
  { key: 'payTemplate', label: 'Payment reminder', default: DEFAULT_PAY_TEMPLATE },
  { key: 'cleanedTodayTemplate', label: 'Windows cleaned today', default: DEFAULT_CLEANED_TODAY_TEMPLATE },
  { key: 'receiptTemplate', label: 'Receipt', default: DEFAULT_RECEIPT_TEMPLATE },
  { key: 'quoteTemplate', label: 'Quote (new enquiry)', default: DEFAULT_QUOTE_TEMPLATE },
  { key: 'repeatQuoteTemplate', label: 'Quote (repeat work)', default: DEFAULT_REPEAT_QUOTE_TEMPLATE }
];

function openMessageTemplates(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Message templates</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 12px; line-height:1.5;">Tap a message to edit its wording. Use <b>{name}</b>, <b>{amount}</b>, <b>{date}</b> (receipts), <b>{work}</b> (quotes), <b>{company}</b>, <b>{yourname}</b>, and <b>{bankdetails}</b> (only appears if you've added bank details under Business details).</p>
    ${TEMPLATE_DEFS.map(def=>{
      const val = (data.settings[def.key] || def.default).replace(/\s+/g,' ').trim();
      return `<button class="backup-btn" onclick="openEditTemplate('${def.key}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <div style="flex:1; min-width:0;"><div class="t1">${escapeHtml(def.label)}</div><div class="t2" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(val)}</div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted); flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>
      </button>`;
    }).join('')}
    <button class="btn-danger-text" onclick="resetAllTemplates()">Reset all message wording to default</button>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:16px 2px 0; line-height:1.5;">Looking for marketing text wording? That's now managed as campaigns from the Marketing tab, since you can save more than one.</p>
  `, () => openSettings());
}

function openEditTemplate(key){
  const def = TEMPLATE_DEFS.find(d=>d.key===key);
  if(!def) return;
  const val = data.settings[key] || def.default;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(def.label)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Message</label>
    <textarea id="tpl_edit_text" rows="7">${escapeHtml(val)}</textarea>
    <div class="form-actions">
      <button class="btn-primary" onclick="saveEditedTemplate('${key}')">Save</button>
    </div>
    <button class="btn-danger-text" onclick="resetOneTemplate('${key}')">Reset this message to default</button>
  `, () => openMessageTemplates());
}

function saveEditedTemplate(key){
  const def = TEMPLATE_DEFS.find(d=>d.key===key);
  if(!def) return;
  data.settings[key] = document.getElementById('tpl_edit_text').value.trim() || def.default;
  saveData();
  toast('Saved');
  openMessageTemplates();
}

function resetOneTemplate(key){
  const def = TEMPLATE_DEFS.find(d=>d.key===key);
  if(!def) return;
  if(!confirm(`Reset "${def.label}" wording to default?`)) return;
  data.settings[key] = def.default;
  saveData();
  toast('Reset to default wording');
  openMessageTemplates();
}

function resetAllTemplates(){
  if(!confirm('Reset all message wording to default? This replaces any custom wording you\'ve set for every message.')) return;
  TEMPLATE_DEFS.forEach(def=>{ data.settings[def.key] = def.default; });
  saveData();
  openMessageTemplates();
  toast('Reset to default wording');
}

function openBusinessDetails(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Business details</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div class="section-label" style="margin-top:0;">Company name</div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">Shown on printed reports and invoices, and available as the <b>{company}</b> token in text messages.</p>
    <input type="text" id="companyNameInput" value="${escapeAttr(data.settings.companyName||'')}" placeholder="e.g. Darren's Window Cleaning">
    <div class="section-label">Company address <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">Shown under the logo on printed invoices.</p>
    <textarea id="companyAddressInput" rows="2" placeholder="e.g. 12 High Street, Manchester, M1 2AB">${escapeHtml(data.settings.companyAddress||'')}</textarea>
    <div class="section-label">Company phone <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">Also shown on printed invoices.</p>
    <input type="text" id="companyPhoneInput" value="${escapeAttr(data.settings.companyPhone||'')}" placeholder="e.g. 07700 900123" inputmode="tel">
    <div class="section-label">Company logo</div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">Shown at the top of printed invoices, in place of the company name.</p>
    ${data.settings.logo ? `
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
        <div style="background:#fff; border:1px solid var(--line); border-radius:10px; padding:6px; flex-shrink:0;">
          <img src="${data.settings.logo}" style="display:block; max-width:110px; max-height:64px; object-fit:contain;">
        </div>
        <button class="btn-danger-text" style="margin:0; font-size:0.75rem;" onclick="removeLogo()">Remove logo</button>
      </div>
    ` : ''}
    <button class="backup-btn" onclick="document.getElementById('logoFileInput').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
      <div><div class="t1">${data.settings.logo?'Replace logo':'Upload a logo'}</div><div class="t2">PNG or JPG, shown on invoices</div></div>
    </button>
    <input type="file" id="logoFileInput" accept="image/*" style="display:none;" onchange="handleLogoSelected(this)">
    <div class="section-label">Your name</div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">Used to sign off texts more personally — available as the <b>{yourname}</b> token.</p>
    <input type="text" id="yourNameInput" value="${escapeAttr(data.settings.yourName||'')}" placeholder="e.g. Dave">
    <div class="section-label">Bank details</div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">Added automatically to payment reminders and "windows cleaned today" texts via the <b>{bankdetails}</b> token, so customers can pay by bank transfer. Their address is included as a payment reference, so it's easy to see who a transfer's from once it lands in your bank. Left blank, that token just disappears.</p>
    <label style="margin-top:0;">Payee Name</label>
    <input type="text" id="bankPayeeInput" value="${escapeAttr(data.settings.bankPayeeName||'')}" placeholder="e.g. D Bennison">
    <label>Account Number</label>
    <input type="text" id="bankAccountInput" value="${escapeAttr(data.settings.bankAccountNumber||'')}" placeholder="e.g. 12345678" inputmode="numeric">
    <label>Sort Code</label>
    <input type="text" id="bankSortCodeInput" value="${escapeAttr(data.settings.bankSortCode||'')}" placeholder="e.g. 12-34-56" inputmode="numeric">
    <div class="form-actions">
      <button class="btn-primary" onclick="saveBusinessDetails()">Save business details</button>
    </div>
  `, () => openSettings());
}
function saveBusinessDetails(){
  data.settings.companyName = document.getElementById('companyNameInput').value.trim();
  data.settings.companyAddress = document.getElementById('companyAddressInput').value.trim();
  data.settings.companyPhone = document.getElementById('companyPhoneInput').value.trim();
  data.settings.yourName = document.getElementById('yourNameInput').value.trim();
  data.settings.bankPayeeName = document.getElementById('bankPayeeInput').value.trim();
  data.settings.bankAccountNumber = document.getElementById('bankAccountInput').value.trim();
  data.settings.bankSortCode = document.getElementById('bankSortCodeInput').value.trim();
  saveData();
  toast('Business details saved');
  openSettings();
}

/* ---------- reports ---------- */
// Small print menu specific to the Rounds tab overview — the reports here span
// every round at once (unlike "Print this round" on a single round's own screen,
// or the general Reports menu, which covers everything else).
// Search across every customer's name, address, phone, email, notes, round, and
// account number — results shown as a separate tappable list, not the normal
// swipeable round-card style (swipe-to-clean/paid only works on the Rounds screen
// itself, so a swipeable card here would look broken).
// Marketing response pipeline — everyone who's actually been sent a marketing
// text, with a manually-set status and next action. There's no way for the app to
// see real replies (they land in the phone's own Messages/WhatsApp app), so this
// exists purely as a place to record what happened after checking those yourself.
function marketingTrackedCustomers(){
  return data.customers.filter(c => (c.messageLog||[]).some(m=>m.kind==='marketing'));
}
// Tracks which campaign's detail screen is currently open (if any), so a
// deep action taken from within it — recording a response, sending the group
// text — returns to that same campaign rather than always landing back on
// the top-level campaign list.
let marketingDetailCampaignId = null;
function openMarketingResponses(){
  if(marketingDetailCampaignId) openCampaignDetail(marketingDetailCampaignId);
  else setTab('marketing');
}
function renderMarketing(main){
  marketingDetailCampaignId = null;
  const campaigns = (data.settings.marketingCampaigns && data.settings.marketingCampaigns.length) ? data.settings.marketingCampaigns : DEFAULT_MARKETING_CAMPAIGNS;
  let html = '';
  html += `<div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom:8px;">
    ${mainScreenHelpBtn('marketing', "()=>setTab('marketing')")}
  </div>`;
  html += `<div class="section-label" style="margin-top:0;">Campaigns</div>`;
  html += campaigns.map(camp=>{
    const sentCount = data.customers.filter(c=>c.marketingCampaign===camp.id).length;
    const preview = (camp.body||'').replace(/\s+/g,' ').trim();
    return `<button class="backup-btn" onclick="openCampaignDetail('${camp.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"/></svg>
      <div style="flex:1; min-width:0;">
        <div class="t1">${escapeHtml(camp.name)}</div>
        <div class="t2" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sentCount ? `${sentCount} sent · ` : ''}${escapeHtml(preview)}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted); flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>
    </button>`;
  }).join('');
  html += `<button class="btn btn-clean" style="width:100%; margin-top:8px;" onclick="addMarketingCampaign()">+ Add a campaign</button>`;
  main.innerHTML = html;
}
// A single campaign's own page: editable name/message, a "send group text"
// button pre-set to this campaign, and the list of texts sent for it (who
// responded, what's still outstanding) — everything for one campaign in one
// place, rather than spread across separate compose/manage/track screens.
function openCampaignDetail(id){
  const campaigns = (data.settings.marketingCampaigns && data.settings.marketingCampaigns.length) ? data.settings.marketingCampaigns : DEFAULT_MARKETING_CAMPAIGNS;
  const camp = campaigns.find(c=>c.id===id);
  if(!camp) return;
  marketingDetailCampaignId = id;
  const canDelete = (data.settings.marketingCampaigns||[]).length > 1;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(camp.name)}</h2>
      <button class="sheet-close" onclick="marketingDetailCampaignId=null; closeSheet();">✕</button>
    </div>
    <label style="margin-top:0;">Name</label>
    <input type="text" id="camp_name" value="${escapeAttr(camp.name)}" placeholder="e.g. Spring gutter offer">
    <label>Message <span style="text-transform:none; font-weight:500; opacity:0.7;">({name}, {company}, {yourname})</span></label>
    <textarea id="camp_body" rows="5">${escapeHtml(camp.body||'')}</textarea>
    <div class="form-actions">
      <button class="btn-primary" onclick="saveMarketingCampaign('${id}')">Save changes</button>
    </div>
    ${canDelete ? `<button class="btn-danger-text" onclick="deleteMarketingCampaign('${id}')">Delete this campaign</button>` : ''}
    <button class="btn-primary" style="width:100%; margin:18px 0 16px; display:flex; align-items:center; justify-content:center; gap:8px;" onclick="marketingSelectedCampaignId='${id}'; openGroupMarketingText();">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 11l18-5v12L3 13z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"/></svg>
      Send group text
    </button>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.5;">
      Round Book can't see actual text replies — check your Messages/WhatsApp app yourself, then record what happened below.
    </p>
    <input type="text" id="mkt_search_input" placeholder="Search these texts..." oninput="renderCampaignResponseRows('${id}')" style="margin-top:0; margin-bottom:10px;">
    <div id="mkt_stats"></div>
    <div id="mkt_response_rows"></div>
  `, () => { marketingDetailCampaignId=null; setTab('marketing'); });
  renderCampaignResponseRows(id);
}
function renderCampaignResponseRows(campaignId){
  const rowsEl = document.getElementById('mkt_response_rows');
  if(!rowsEl) return;
  const searchEl = document.getElementById('mkt_search_input');
  const raw = searchEl ? searchEl.value.trim() : '';
  const q = raw.toLowerCase();
  const today = todayISO();
  let tracked = marketingTrackedCustomers()
    .filter(c => c.marketingCampaign === campaignId)
    .map(c => {
      const lastSent = (c.messageLog||[]).filter(m=>m.kind==='marketing').sort((a,b)=>b.time-a.time)[0];
      return {c, lastSent: lastSent ? lastSent.date : null};
    })
    // Drops off the list on its own once a text has gone unanswered for a month —
    // doesn't touch the customer's own data, just stops surfacing a stale lead here.
    // A fresh marketing send resets the clock and brings them straight back.
    .filter(({c, lastSent}) => !(c.marketingStatus === 'awaiting' && lastSent && daysBetween(lastSent, today) >= 30));

  const statsEl = document.getElementById('mkt_stats');
  if(statsEl){
    const sentCount = tracked.length;
    const respondedCount = tracked.filter(({c}) => c.marketingStatus !== 'awaiting').length;
    const bookedCount = tracked.filter(({c}) => c.marketingStatus === 'booked').length;
    statsEl.innerHTML = sentCount ? `<p style="color:var(--ink-muted); font-size:0.75rem; font-weight:700; margin:0 2px 12px;">${sentCount} sent · ${respondedCount} responded · ${bookedCount} booked</p>` : '';
  }

  if(q){
    tracked = tracked.filter(({c})=>{
      const haystack = [c.name, c.address, c.phone, c.email, c.round, c.accountNumber].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }
  if(!tracked.length){
    rowsEl.innerHTML = `<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">${q ? `No results match "${escapeHtml(raw)}".` : "Nobody's been sent this campaign's text yet."}</p>`;
    return;
  }
  rowsEl.innerHTML = tracked
    .sort((a,b) => {
      // Priority order: (1) has a response AND needs action — the stuff to actually
      // do something about right now; (2) still awaiting a response; (3) resolved
      // with nothing left to do. Most recently texted first within each group.
      const tier = ({c}) => {
        if(c.marketingStatus !== 'awaiting' && c.marketingNextAction !== 'none') return 0;
        if(c.marketingStatus === 'awaiting') return 1;
        return 2;
      };
      const ta = tier(a), tb = tier(b);
      if(ta !== tb) return ta - tb;
      return (b.lastSent||'').localeCompare(a.lastSent||'');
    })
    .map(({c, lastSent}) => {
      const status = MARKETING_STATUS_OPTIONS[c.marketingStatus] || MARKETING_STATUS_OPTIONS.awaiting;
      const actionLabel = MARKETING_ACTION_OPTIONS[c.marketingNextAction] || MARKETING_ACTION_OPTIONS.none;
      const canText = isMobileNumber(c.phone);
      return `<div class="backup-btn" style="text-align:left; align-items:flex-start; cursor:pointer;" onclick="openMarketingResponseEditor('${c.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top:2px;"><path d="M3 11l18-5v12L3 13z"/><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6"/></svg>
        <div style="flex:1; min-width:0;">
          <div class="t1">${escapeHtml(c.address||c.name||'Customer')}</div>
          <div class="t2">Texted ${fmtDate(lastSent)}</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            <span class="badge ${status.color}">${status.label}</span>
            ${c.marketingNextAction !== 'none' ? (c.marketingActionDone ? `<span class="badge ok">✓ ${actionLabel}</span>` : `<span class="badge due">${actionLabel}${c.marketingFollowUpDate ? ` (${fmtDate(c.marketingFollowUpDate)})` : ''}</span>`) : ''}
          </div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            ${c.phone ? `<button onclick="event.stopPropagation(); callCustomer('customer','${c.id}')" class="call-btn" style="border-radius:8px; width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:800; display:flex; align-items:center; gap:6px;">${CALL_ICON.replace('viewBox="0 0 24 24"','viewBox="0 0 24 24" width="13" height="13"')} Call</button>` : ''}
            ${canText ? `<button onclick="event.stopPropagation(); quickTextFromMarketing('${c.id}')" style="border-radius:8px; width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:800; display:flex; align-items:center; gap:6px; background:var(--blue-dim); color:var(--blue-deep); border:none;">💬 Text</button>` : ''}
            <button onclick="event.stopPropagation(); quoteForCustomer('${c.id}', ()=>openMarketingResponses())" style="border-radius:8px; width:auto; height:32px; padding:0 12px; font-size:0.75rem; font-weight:800; display:flex; align-items:center; gap:6px; background:var(--amber-dim); color:var(--amber); border:none;">📝 Quote</button>
          </div>
        </div>
      </div>`;
    }).join('');
}
// Ad-hoc follow-up text (not the marketing template) straight from a response
// tile — opens a blank, editable message rather than a fixed script, since a
// follow-up after a real reply is personal, not a broadcast.
function quickTextFromMarketing(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !isMobileNumber(c.phone)){ toast('No mobile number saved for this customer'); return; }
  const afterSend = () => {
    c.marketingStatus = 'awaiting';
    c.marketingNextAction = 'none';
    c.marketingActionDone = false;
    c.marketingFollowUpDate = '';
    saveData();
    render();
  };
  openMessagePreview(`Text ${c.name||c.address||'customer'}`, c.phone, '', afterSend, () => openMarketingResponses(), {item: c, kind: 'marketing'});
}
function openMarketingResponseEditor(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const statusButtons = Object.entries(MARKETING_STATUS_OPTIONS).map(([key,opt])=>
    `<button class="seg-btn ${c.marketingStatus===key?'active':''}" onclick="setMarketingStatus('${id}','${key}')" style="flex:0 0 auto; padding:9px 14px;">${opt.label}</button>`
  ).join('');
  const actionButtons = Object.entries(MARKETING_ACTION_OPTIONS).map(([key,label])=>
    `<button class="seg-btn ${c.marketingNextAction===key?'active':''}" onclick="setMarketingAction('${id}','${key}')" style="flex:0 0 auto; padding:9px 14px;">${label}</button>`
  ).join('');
  const actionLabel = MARKETING_ACTION_OPTIONS[c.marketingNextAction] || MARKETING_ACTION_OPTIONS.none;
  // A target date only makes sense for the two actions that are genuinely a
  // "come back to this on a certain day" reminder — a quote already has its own
  // follow-up tracking, and "add to round" has no natural date of its own.
  const showFollowUpDate = c.marketingNextAction === 'call' || c.marketingNextAction === 'text_again';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(c.address||c.name||'Customer')}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Response</label>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px;">${statusButtons}</div>
    <label>Next action</label>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;">${actionButtons}</div>
    ${showFollowUpDate ? `
      <label>Follow up on</label>
      <input type="date" value="${escapeAttr(c.marketingFollowUpDate||'')}" onchange="setMarketingFollowUpDate('${id}', this.value)">
    ` : ''}
    ${c.marketingNextAction !== 'none' ? `
      <button class="btn" style="width:100%; margin-top:14px; ${c.marketingActionDone ? 'background:var(--green-dim); color:var(--green);' : 'background:var(--amber-dim); color:var(--amber);'}" onclick="toggleMarketingActionDone('${id}')">${c.marketingActionDone ? `✅ Done — ${actionLabel}` : `Mark "${actionLabel}" as done`}</button>
    ` : ''}
  `, () => openMarketingResponses());
}
function setMarketingStatus(id, status){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !MARKETING_STATUS_OPTIONS[status]) return;
  c.marketingStatus = status;
  saveData();
  openMarketingResponseEditor(id);
}
function setMarketingAction(id, action){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !MARKETING_ACTION_OPTIONS[action]) return;
  c.marketingNextAction = action;
  c.marketingActionDone = false; // a newly set (or re-set) action starts as not-yet-done
  // Suggest a sensible default follow-up date for the two action types that use
  // one — the user can still change it. Anything else (quote/add to round/none)
  // has no target date, since a quote already tracks its own follow-up.
  if(action === 'call'){
    const d = new Date(); d.setDate(d.getDate() + 2);
    c.marketingFollowUpDate = d.toISOString().slice(0,10);
  } else if(action === 'text_again'){
    const d = new Date(); d.setDate(d.getDate() + 3);
    c.marketingFollowUpDate = d.toISOString().slice(0,10);
  } else {
    c.marketingFollowUpDate = '';
  }
  saveData();
  openMarketingResponseEditor(id);
}
function setMarketingFollowUpDate(id, dateStr){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  c.marketingFollowUpDate = dateStr || '';
  saveData();
  renderMarketingFollowUpBanner();
}
function toggleMarketingActionDone(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c || c.marketingNextAction === 'none') return;
  c.marketingActionDone = !c.marketingActionDone;
  saveData();
  openMarketingResponseEditor(id);
  render();
}

function openUniversalSearch(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Search</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <input type="text" id="search_input" placeholder="Customers, jobs, quotes, rounds..." oninput="renderUniversalSearchResults()" style="margin-top:0; margin-bottom:14px;">
    <div id="search_results"></div>
  `, () => render());
  renderUniversalSearchResults();
  setTimeout(() => { const el = document.getElementById('search_input'); if(el) el.focus(); }, 60);
}
// Wraps the first matching occurrence of the search term in a highlight span —
// makes the live, as-you-type results feel properly predictive rather than just a
// plain filtered list.
function highlightMatch(text, rawQuery){
  if(!text) return '';
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(rawQuery);
  if(!escapedQuery) return escaped;
  const idx = escaped.toLowerCase().indexOf(escapedQuery.toLowerCase());
  if(idx === -1) return escaped;
  return escaped.slice(0,idx)
    + '<mark style="background:var(--amber-dim); color:var(--ink); border-radius:3px; padding:0 1px;">'
    + escaped.slice(idx, idx+escapedQuery.length)
    + '</mark>'
    + escaped.slice(idx+escapedQuery.length);
}
function universalSearchSectionLabel(text, first){
  return `<div class="section-label" style="margin-top:${first?'0':'16px'};">${text}</div>`;
}
function renderUniversalSearchResults(){
  const inputEl = document.getElementById('search_input');
  const resultsEl = document.getElementById('search_results');
  if(!inputEl || !resultsEl) return;
  const raw = inputEl.value.trim();
  const q = raw.toLowerCase();
  if(!q){
    resultsEl.innerHTML = '<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">Start typing to search customers, jobs, quotes, and rounds.</p>';
    return;
  }

  const roundNames = [...new Set(data.customers.map(c=>c.round||'Unassigned'))].sort((a,b)=>a.localeCompare(b));
  const roundMatches = roundNames.filter(rn=>rn.toLowerCase().includes(q));

  const custMatches = data.customers.filter(c=>{
    const haystack = [c.name, c.address, c.phone, c.email, c.notes, c.round, c.accountNumber].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  }).sort((a,b)=>(a.address||'').localeCompare(b.address||''));

  const jobMatches = (data.oneOffJobs||[]).filter(j=>{
    const haystack = [j.name, j.address, j.phone, j.notes].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const quoteMatches = (data.quotes||[]).filter(qt=>{
    const haystack = [qt.name, qt.address, qt.phone, qt.notes].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  if(!roundMatches.length && !custMatches.length && !jobMatches.length && !quoteMatches.length){
    resultsEl.innerHTML = `<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">Nothing matches "${escapeHtml(raw)}".</p>`;
    return;
  }

  let html = '';
  let firstSection = true;
  if(roundMatches.length){
    html += universalSearchSectionLabel('Rounds', firstSection); firstSection = false;
    html += roundMatches.map(rn=>`<button class="backup-btn" onclick="openRoundFromSearch('${escapeAttr(rn)}')" style="margin-bottom:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      <div style="flex:1; min-width:0;"><div class="t1">${highlightMatch(rn, raw)}</div></div>
    </button>`).join('');
  }
  if(custMatches.length){
    html += universalSearchSectionLabel('Customers', firstSection); firstSection = false;
    html += custMatches.map(c=>{
      const subtitle = [c.name, c.round||'Unassigned', c.accountNumber?`Acct #${c.accountNumber}`:''].filter(Boolean).join(' · ');
      return `<button class="backup-btn" onclick="searchResultTap('${c.id}')" style="margin-bottom:8px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div style="flex:1; min-width:0;">
          <div class="t1">${highlightMatch(c.address||c.name||'Customer', raw)}</div>
          <div class="t2">${highlightMatch(subtitle, raw)}</div>
        </div>
      </button>`;
    }).join('');
  }
  if(jobMatches.length){
    html += universalSearchSectionLabel('One-off jobs', firstSection); firstSection = false;
    html += jobMatches.map(j=>`<button class="backup-btn" onclick="openJobFromSearch('${j.id}')" style="margin-bottom:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
      <div style="flex:1; min-width:0;">
        <div class="t1">${highlightMatch(j.address||j.name||'Job', raw)}</div>
        <div class="t2">${fmtDate(j.date)} · ${money(j.price)}</div>
      </div>
    </button>`).join('');
  }
  if(quoteMatches.length){
    html += universalSearchSectionLabel('Quotes', firstSection); firstSection = false;
    html += quoteMatches.map(qt=>`<button class="backup-btn" onclick="openQuoteFromSearch('${qt.id}')" style="margin-bottom:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <div style="flex:1; min-width:0;">
        <div class="t1">${highlightMatch(qt.address||qt.name||'Quote', raw)}</div>
        <div class="t2">${money(qt.price)} · ${qt.status||'pending'}</div>
      </div>
    </button>`).join('');
  }
  resultsEl.innerHTML = html;
}
function searchResultTap(id){
  closeSheet();
  openCustomerDetail(id);
}
function openJobFromSearch(id){
  closeSheet();
  setTab('jobs');
  const j = (data.oneOffJobs||[]).find(x=>x.id===id);
  if(j) openJobForm(j);
}
function openQuoteFromSearch(id){
  closeSheet();
  setTab('quotes');
  const qt = (data.quotes||[]).find(x=>x.id===id);
  if(qt) openQuoteForm(qt);
}
function openRoundFromSearch(rn){
  closeSheet();
  setTab('rounds');
  openRound(rn);
}

// Photo gallery — every customer with at least one photo (their own, or from a
// linked one-off job), address first then a thumbnail grid, so photos can be
// browsed across the whole customer base rather than one customer at a time.
function openPhotoGallery(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Photo gallery</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <input type="text" id="gallery_search_input" placeholder="Filter by address or name..." oninput="renderPhotoGallery()" style="margin-top:0; margin-bottom:14px;">
    <div id="gallery_results"></div>
  `, () => setTab('rounds'));
  renderPhotoGallery();
}
function renderPhotoGallery(){
  const inputEl = document.getElementById('gallery_search_input');
  const resultsEl = document.getElementById('gallery_results');
  if(!resultsEl) return;
  const raw = inputEl ? inputEl.value.trim() : '';
  const q = raw.toLowerCase();
  let custEntries = data.customers
    .map(c => ({kind:'customer', id:c.id, address:c.address, name:c.name, list: buildCustomerPhotoList(c.id)}))
    .filter(({list}) => list.length);
  // One-off jobs not linked to a customer get their own gallery card — linked jobs'
  // photos already appear folded into that customer's own entry (buildCustomerPhotoList),
  // so including them again here would show the same photos twice.
  let jobEntries = (data.oneOffJobs||[])
    .filter(j => !j.customerId)
    .map(j => ({kind:'job', id:j.id, address:j.address, name:j.name, list: buildJobPhotoList(j.id)}))
    .filter(({list}) => list.length);
  let entries = [...custEntries, ...jobEntries];
  if(q){
    entries = entries.filter(({address, name}) => {
      const haystack = [name, address].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }
  entries.sort((a,b) => (a.address||a.name||'').localeCompare(b.address||b.name||''));
  if(!entries.length){
    resultsEl.innerHTML = `<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">${q ? `No matches for "${escapeHtml(raw)}".` : "No photos added yet — they'll show up here once you add some from a customer's or job's screen."}</p>`;
    return;
  }
  resultsEl.innerHTML = entries.map(({kind, id, address, name, list}) => `
    <div style="margin-bottom:20px;">
      <div class="t1" style="margin-bottom:8px;">${escapeHtml(address||name||'Customer')}${name && address ? `<span style="font-weight:500; color:var(--ink-muted);"> · ${escapeHtml(name)}</span>` : ''}${kind==='job' ? `<span style="font-weight:600; color:var(--ink-muted); font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.02em;"> · One-off job</span>` : ''}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${kind==='customer'
          ? list.map((entry,i) => `<img src="${photoEntrySrc(entry)}" onclick="openPhotoViewerAt(buildCustomerPhotoList('${id}'), ${i}, () => openPhotoGalleryReturn())" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`).join('')
          : list.map((entry,i) => `<img src="${photoEntrySrc(entry)}" onclick="openPhotoViewerAt(buildJobPhotoList('${id}'), ${i}, () => openPhotoGalleryReturn())" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`).join('')}
      </div>
    </div>
  `).join('');
}
// Reopens the gallery (preserving nothing fancier than a fresh, unfiltered list)
// after closing a photo that was opened from it — mirrors the pattern used for
// customer search results returning to the search screen.
function openPhotoGalleryReturn(){
  openPhotoGallery();
}

function openRoundReports(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Print</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <button class="backup-btn" onclick="printWindowsDue()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      <div><div class="t1">Windows due, by round</div><div class="t2">Who's due a clean right now</div></div>
    </button>
    <button class="backup-btn" onclick="printMoneyOwed()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h6M9 14h5"/></svg>
      <div><div class="t1">Money owed</div><div class="t2">Everyone cleaned but not yet paid</div></div>
    </button>
    <button class="backup-btn" onclick="printFullRounds()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>
      <div><div class="t1">Full round lists</div><div class="t2">Every customer, grouped by round</div></div>
    </button>
  `);
}

function openReports(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Print reports</h2>
      ${helpIconBtn('reports', () => openReports())}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 16px;">
      Generates a printer-friendly page. Use your phone's print option (Share → Print) to print it or save it as a PDF — works offline too.
    </p>
    <button class="backup-btn" onclick="printRoundsLastCleaned()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg>
      <div><div class="t1">Round cleaning dates — list</div><div class="t2">Every date each round was cleaned in the last 5 weeks</div></div>
    </button>
    <button class="backup-btn" onclick="printRoundsLastCleanedCalendar()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
      <div><div class="t1">Round cleaning dates — calendar</div><div class="t2">Same, laid out as a calendar of the last 5 weeks</div></div>
    </button>
    <button class="backup-btn" onclick="printEarnings()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h6M9 14h5"/></svg>
      <div><div class="t1">Earnings report</div><div class="t2">Totals by week, month and year</div></div>
    </button>
    <button class="backup-btn" onclick="printDailyWork()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/><path d="M8 15l2 2 4-5"/></svg>
      <div><div class="t1">Daily work done</div><div class="t2">Value of cleans and jobs completed, day by day</div></div>
    </button>
    <button class="backup-btn" onclick="printSchedule()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>
      <div><div class="t1">Monthly schedule</div><div class="t2">Calendar of rounds and one-off jobs due, day by day</div></div>
    </button>
    <button class="backup-btn" onclick="printPriceReview()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      <div><div class="t1">Price review due</div><div class="t2">12+ months since last price increase, by next clean</div></div>
    </button>
    <button class="backup-btn" onclick="printPropertyTypesReport()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></svg>
      <div><div class="t1">Property types</div><div class="t2">Houses and average price by property type, total and by round</div></div>
    </button>
    <button class="backup-btn" onclick="printMileageReport()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2M9 17h6M5 12h13"/></svg>
      <div><div class="t1">Mileage</div><div class="t2">Daily, weekly, monthly and tax-year-to-date totals</div></div>
    </button>
  `);
}

function listTotalHtml(text){
  return `<div style="text-align:right; font-weight:800; font-size:0.9375rem; color:var(--emphasis); padding:10px 4px 4px;">${text}</div>`;
}
function groupByRound(list){
  const rounds = {};
  list.forEach(c=>{
    const r = c.round || 'Unassigned';
    if(!rounds[r]) rounds[r] = [];
    rounds[r].push(c);
  });
  return rounds;
}
function reportDate(){
  return fmtDate(todayISO());
}
let pendingReportTitle = '';
let pendingReportBody = '';
let pendingReportHideCompany = false;
let pendingReportPhone = '';

function runPrint(titleHtml, bodyHtml, hideCompanyHeader, allowPdfShare, returnTo, phone){
  pendingReportTitle = titleHtml;
  pendingReportBody = bodyHtml;
  pendingReportHideCompany = !!hideCompanyHeader;
  pendingReportPhone = phone || '';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${titleHtml}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px; line-height:1.5;">How would you like this ${allowPdfShare?'document':'report'}?</p>
    <button class="backup-btn" onclick="printPendingReport()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      <div><div class="t1">Print</div><div class="t2">Opens your printer dialog</div></div>
    </button>
    ${allowPdfShare ? `<button class="backup-btn" id="pdfShareBtn" onclick="sendPendingReportPdf()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div><div class="t1">Send as PDF via WhatsApp</div><div class="t2">Shares a PDF copy</div></div>
    </button>` : ''}
    <button class="backup-btn" onclick="exportPendingReportDocx()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <div><div class="t1">Save as Word document</div><div class="t2">Downloads a .docx file</div></div>
    </button>
  `, returnTo);
}

function printPendingReport(){
  const company = pendingReportHideCompany ? '' : (data.settings.companyName || '');
  document.getElementById('printArea').innerHTML = `
    <div class="rpt-header">
      <div>
        <h1>${pendingReportTitle}</h1>
        ${company ? `<div style="font-size:13px; color:#66798A; font-weight:700; margin-top:2px;">${escapeHtml(company)}</div>` : ''}
      </div>
      <div class="rpt-date">${reportDate()}</div>
    </div>
    ${pendingReportBody}
  `;
  closeSheet();
  window.print();
}

// Strips HTML and punctuation down to a safe, short filename stem.
function sanitizeFilename(str){
  const plain = (str||'Document').replace(/<[^>]*>/g,'');
  const clean = plain.replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'');
  return (clean || 'Document').slice(0,60);
}

// Renders the pending report's title + body into an offscreen copy of the print
// layout (same markup printPendingReport uses), rasterizes it, and packs it into
// an A4 PDF — paginating automatically if the content runs longer than one page.
async function generatePendingReportPdfBlob(){
  const company = pendingReportHideCompany ? '' : (data.settings.companyName || '');
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed; left:-9999px; top:0; width:794px; background:#ffffff; padding:32px; color:#1C2B36;';
  container.innerHTML = `
    <div class="rpt-header">
      <div>
        <h1>${pendingReportTitle}</h1>
        ${company ? `<div style="font-size:13px; color:#66798A; font-weight:700; margin-top:2px;">${escapeHtml(company)}</div>` : ''}
      </div>
      <div class="rpt-date">${reportDate()}</div>
    </div>
    ${pendingReportBody}
  `;
  document.body.appendChild(container);
  try{
    const imgs = [...container.querySelectorAll('img')];
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res=>{ img.onload = img.onerror = res; })));
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const imgWidth = pageWidth - margin*2;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    const imgData = canvas.toDataURL('image/png');
    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - margin*2);
    while(heightLeft > 0){
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - margin*2);
    }
    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

// Shares a PDF Blob via the native share sheet (WhatsApp is one of the apps offered
// there on both Android and iOS) when the browser supports sharing files. Where it
// doesn't — mainly desktop browsers — the PDF is downloaded instead and WhatsApp opens
// so it can be attached by hand. Either way, if a customer/job phone number is known
// and WhatsApp is the chosen messaging app, we jump straight to that customer's own
// chat (rather than a blank WhatsApp Web screen) since the share sheet's own app/contact
// picker doesn't accept a phone number from the web — this is the closest practical
// equivalent, same as the addToContacts hand-off elsewhere in the app.
async function sharePdfBlob(blob, filename, phone){
  const canJumpToChat = phone && isMobileNumber(phone) && data.settings.messagingApp === 'whatsapp';
  const openCustomerChat = () => { window.location.href = `https://wa.me/${normalizePhoneForWhatsApp(phone)}`; };
  try{
    const file = new File([blob], filename, {type:'application/pdf'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title: filename});
      // The OS share sheet's own app/contact picker already handled attaching the
      // file — this just makes sure the customer's specific chat ends up open too,
      // in case the picker only got as far as WhatsApp's own contact list.
      if(canJumpToChat) setTimeout(openCustomerChat, 600);
      return true;
    }
  }catch(e){
    if(e && e.name === 'AbortError') return false; // user cancelled the share sheet
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
  if(canJumpToChat){
    toast('PDF downloaded — attach it in WhatsApp');
    openCustomerChat();
  } else {
    toast('PDF downloaded — attach it in WhatsApp');
    window.open('https://wa.me/', '_blank');
  }
  return true;
}

async function sendPendingReportPdf(){
  const btn = document.getElementById('pdfShareBtn');
  if(btn){ btn.style.opacity = '0.6'; btn.style.pointerEvents = 'none'; }
  toast('Preparing PDF…');
  try{
    const blob = await generatePendingReportPdfBlob();
    closeSheet();
    await sharePdfBlob(blob, sanitizeFilename(pendingReportTitle) + '.pdf', pendingReportPhone);
  }catch(e){
    toast('Could not create the PDF — try Print instead');
    if(btn){ btn.style.opacity = ''; btn.style.pointerEvents = ''; }
  }
}

function htmlToDocxElements(bodyHtml){
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ImageRun, TableLayoutType, AlignmentType, BorderStyle, Tab, TabStopType } = docx;
  const parsed = new DOMParser().parseFromString(`<div>${bodyHtml}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  const elements = [];
  const PAGE_WIDTH_DXA = 9026; // usable width for an A4 page with 1440-twip margins (must match the Document's page setup below)

  // Recursively pulls text out of a cell, inserting a separator wherever the
  // source HTML has a line break (e.g. "<td>123 Main St<br>John Smith</td>")
  // or a boundary between child elements/text nodes, so values don't get
  // smashed together the way plain textContent would.
  const textOf = (node) => {
    const parts = [];
    node.childNodes.forEach(child=>{
      if(child.nodeType === 3){
        const t = child.textContent;
        if(t && t.trim()) parts.push(t.trim());
      } else if(child.nodeType === 1){
        if(child.tagName === 'BR'){ parts.push('·'); return; }
        const t = textOf(child);
        if(t) parts.push(t);
      }
    });
    return parts.join(' ').replace(/\s+/g,' ').trim();
  };

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'D5DBDF' };
  const tableBorders = {
    top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder,
    insideHorizontal: cellBorder, insideVertical: cellBorder
  };
  const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

  Array.from(root.children).forEach(node=>{
    const tag = node.tagName;
    const imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
    if(tag === 'TABLE'){
      const trs = Array.from(node.querySelectorAll('tr'));

      // Some reports (e.g. the round cleaning dates list) ask for tab-separated text in the
      // Word export instead of a real table object, so the rows are plain, easily-editable
      // lines rather than table cells. A literal tab character inside run text isn't enough —
      // Word only treats it as a real tab stop when it's an explicit Tab() between runs.
      if(node.classList.contains('rpt-table-as-tabs')){
        trs.forEach(tr=>{
          const cellNodes = Array.from(tr.children);
          if(!cellNodes.length) return;
          const isHeaderRow = cellNodes.some(td => td.tagName === 'TH');
          const runChildren = [];
          cellNodes.forEach((td, i)=>{
            if(i > 0) runChildren.push(new Tab());
            runChildren.push(textOf(td));
          });
          elements.push(new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 2600 }, { type: TabStopType.LEFT, position: 5200 }],
            children: [ new TextRun({ children: runChildren, bold: isHeaderRow }) ]
          }));
        });
        elements.push(new Paragraph({ text: '' }));
        return;
      }

      let numCols = 0;
      trs.forEach(tr => {
        let span = 0;
        Array.from(tr.children).forEach(td => { span += Math.max(1, parseInt(td.getAttribute('colspan')||'1',10)); });
        numCols = Math.max(numCols, span);
      });

      if(numCols > 0){
        const baseWidth = Math.floor(PAGE_WIDTH_DXA / numCols);
        const columnWidths = Array(numCols).fill(baseWidth);
        columnWidths[numCols-1] += PAGE_WIDTH_DXA - (baseWidth * numCols); // give rounding remainder to the last column
        const rows = [];
        trs.forEach(tr=>{
          const cellNodes = Array.from(tr.children);
          if(!cellNodes.length) return;
          const isHeaderRow = cellNodes.some(td => td.tagName === 'TH');
          let colIndex = 0;
          const cells = cellNodes.map(td=>{
            const span = Math.max(1, parseInt(td.getAttribute('colspan')||'1',10));
            const widthDxa = columnWidths.slice(colIndex, colIndex+span).reduce((a,b)=>a+b,0);
            colIndex += span;
            const styleAttr = td.getAttribute('style') || '';
            const alignRight = /text-align\s*:\s*right/i.test(styleAttr);
            const isBold = td.tagName==='TH' || /font-weight\s*:\s*(bold|[7-9]00)/i.test(styleAttr);
            const cellConfig = {
              children: [new Paragraph({
                alignment: alignRight ? AlignmentType.RIGHT : undefined,
                children: [new TextRun({ text: textOf(td), bold: isBold })]
              })],
              width: { size: widthDxa, type: WidthType.DXA },
              margins: cellMargins
            };
            if(span > 1) cellConfig.columnSpan = span;
            if(isHeaderRow) cellConfig.shading = { fill: 'EFF3F5' };
            return new TableCell(cellConfig);
          });
          rows.push(new TableRow({ children: cells, cantSplit: true }));
        });
        if(rows.length){
          const tableConfig = {
            rows,
            columnWidths,
            width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
            borders: tableBorders
          };
          if(TableLayoutType && TableLayoutType.FIXED){ tableConfig.layout = TableLayoutType.FIXED; }
          elements.push(new Table(tableConfig));
          elements.push(new Paragraph({ text: '' }));
        }
      }
    } else if(imgs.length){
      imgs.forEach(img=>{
        const src = img.getAttribute('src') || '';
        if(!src.startsWith('data:image')) return;
        try{
          const base64 = src.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
          let w = 160, h = 160;
          if(img.classList.contains('inv-logo') && src.startsWith('data:image/png')){
            // Logos are PNGs from compressLogo() — read the natural size straight out of the
            // PNG IHDR chunk (big-endian uint32 width/height at fixed byte offsets) so the
            // logo keeps its own aspect ratio in the Word export instead of being forced square.
            const nw = ((bytes[16]<<24) | (bytes[17]<<16) | (bytes[18]<<8) | bytes[19]) >>> 0;
            const nh = ((bytes[20]<<24) | (bytes[21]<<16) | (bytes[22]<<8) | bytes[23]) >>> 0;
            if(nw > 0 && nh > 0){
              const maxW = 200, maxH = 90;
              const scale = Math.min(maxW/nw, maxH/nh, 1);
              w = Math.round(nw*scale); h = Math.round(nh*scale);
            }
          }
          elements.push(new Paragraph({ children: [ new ImageRun({ data: bytes, transformation: { width: w, height: h } }) ] }));
        }catch(e){ /* skip a photo that fails to embed rather than aborting the whole export */ }
      });
    } else if(tag === 'DIV' && node.classList.contains('rpt-round-title')){
      const t = textOf(node);
      if(t) elements.push(new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing:{ before:200, after:100 } }));
    } else if(tag === 'DIV' && node.classList.contains('rpt-total')){
      const t = textOf(node);
      if(t) elements.push(new Paragraph({ children:[new TextRun({ text: t, bold:true })], spacing:{ before:100, after:200 } }));
    } else if(tag === 'DIV' && node.classList.contains('rpt-empty-note')){
      const t = textOf(node);
      if(t) elements.push(new Paragraph({ children:[new TextRun({ text: t, italics:true })] }));
    } else {
      const t = textOf(node);
      if(t) elements.push(new Paragraph({ children:[new TextRun({ text: t })], spacing:{ after:120 } }));
    }
  });
  return elements;
}

async function exportPendingReportDocx(){
  if(typeof docx === 'undefined'){
    toast('Still loading — try again in a moment, or once you have signal');
    return;
  }
  try{
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
    const plainTitle = pendingReportTitle.replace(/<[^>]+>/g,'');
    const company = pendingReportHideCompany ? '' : (data.settings.companyName || '');

    const headerChildren = [ new Paragraph({ text: plainTitle, heading: HeadingLevel.HEADING_1 }) ];
    if(company) headerChildren.push(new Paragraph({ children:[new TextRun({ text: company, italics:true })] }));
    headerChildren.push(new Paragraph({ children:[new TextRun({ text: reportDate(), color:'666666' })], spacing:{ after:300 } }));

    const bodyChildren = htmlToDocxElements(pendingReportBody);

    const wordDoc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4, in twips (DXA)
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        children: [...headerChildren, ...bodyChildren]
      }]
    });

    const blob = await Packer.toBlob(wordDoc);
    const filename = `${plainTitle.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${todayISO()}.docx`;

    if(navigator.canShare){
      try{
        const file = new File([blob], filename, { type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        if(navigator.canShare({files:[file]})){
          await navigator.share({ files:[file], title: plainTitle });
          closeSheet();
          toast('Word document shared');
          return;
        }
      }catch(e){
        if(e && e.name === 'AbortError'){ closeSheet(); return; }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    closeSheet();
    toast('Word document saved');
  }catch(e){
    toast('Could not create the Word document — try Print instead');
  }
}

