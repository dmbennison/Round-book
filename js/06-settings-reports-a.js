/* 06-settings-reports-a.js -- Settings, dark mode/colour scheme/text size, and the first half of the print/export reports.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- settings / dark mode / colour scheme ---------- */
/* Each colour scheme has its own personality, not just a different header: its own accent, a "glow" colour
   for the soft light behind the glass, and a full set of page / card / text colours for light AND dark mode.
   The light-mode surfaces deliberately differ in temperature — cool blue-white (Ocean), neutral stone (Slate),
   warm sand (Rust), green-gold parchment (Forest), lilac-white (Plum), pure white (High contrast).
     navy     = header / tab bar / dark chrome (white text sits on it)
     blue     = the accent: fills (buttons, tiles) AND text/icons that carry meaning, so in LIGHT mode it is
                dark enough to pass WCAG AA (4.5:1) against both the page and the card colour
     blueDark = the accent in DARK mode, lightened so it passes AA against the dark page and cards
     glow     = third colour in the soft background light
     light/dark: bg (page), surface (cards), ink (text), muted (secondary text, AA), line (borders)
   Every pairing was checked with a contrast calculator: ink >= 7:1, muted and accent >= 4.5:1, white on
   navy >= 7:1. If you change a value, re-check it (e.g. webaim.org/resources/contrastchecker). */
const THEMES = {
  // OCEAN — deep sea-blue header on a cool, near-neutral grey page with white cards. The only strong colours are the
  // header and a warm coral accent that stands out against the blue (the same recipe as Slate: neutral base, one contrasting accent).
  // `tint` and `orb` (both 0-1) scale how much accent colour washes into cards and the soft page glow; Slate keeps the full amount.
  ocean: { name:'Ocean', navy:'#164559', blue:'#B83E27', blueDark:'#FF8C74', glow:'#2F7A96', tint:0.45, orb:0.6,
    light:{ bg:'#EEF1F3', surface:'#FFFFFF', ink:'#14283A', muted:'#556B7C', line:'#D9DFE3' },
    dark: { bg:'#0F1418', surface:'#171E24', ink:'#EAF1F6', muted:'#93A8B9', line:'#2A343C' } },
  // SLATE — professional and neutral: true charcoal header, stone-grey pages, and one warm copper accent for contrast.
  // Almost no hue except the copper, so it reads as a tool, not a theme.
  slate: { name:'Slate', navy:'#2B2F34', blue:'#99531D', blueDark:'#E3995A', glow:'#8E9AA6',
    light:{ bg:'#ECECEA', surface:'#FAFAF8', ink:'#212427', muted:'#62656A', line:'#D6D6D2' },
    dark: { bg:'#101112', surface:'#1B1D1F', ink:'#ECEAE6', muted:'#A09D97', line:'#303234' } },
  // RUST — brown-terracotta header on a warm-grey page with cream cards, and a clear cobalt-blue accent that contrasts with the clay.
  rust: { name:'Rust', navy:'#5A2E1C', blue:'#1D5FA8', blueDark:'#7DB4F2', glow:'#8A5A44', tint:0.45, orb:0.6,
    light:{ bg:'#F1EEEA', surface:'#FFFCF8', ink:'#33201A', muted:'#6F5A50', line:'#E1DAD1' },
    dark: { bg:'#151210', surface:'#1F1B18', ink:'#F3E9DD', muted:'#B49C8A', line:'#38302B' } },
  // FOREST — deep pine header on a soft stone page with off-white cards, and a golden ochre accent against the green.
  forest: { name:'Forest', navy:'#14402C', blue:'#8A6508', blueDark:'#E8B94C', glow:'#3E7A57', tint:0.45, orb:0.6,
    light:{ bg:'#EEF0EA', surface:'#FBFCF8', ink:'#1C2B20', muted:'#576852', line:'#D9DDD0' },
    dark: { bg:'#0F1311', surface:'#181E1A', ink:'#E7EFE2', muted:'#94AA94', line:'#2B342D' } },
  // PLUM — aubergine header on a quiet grey-lilac page with white cards, and a teal accent that contrasts with the purple.
  plum: { name:'Plum', navy:'#3F1A47', blue:'#0F766E', blueDark:'#4FD1C5', glow:'#7A4A86', tint:0.45, orb:0.6,
    light:{ bg:'#F2EFF3', surface:'#FFFDFF', ink:'#2D1B33', muted:'#6A5871', line:'#E2DCE4' },
    dark: { bg:'#131014', surface:'#1C181F', ink:'#F1E8F4', muted:'#A891B1', line:'#302933' } },
  // HIGH CONTRAST — for outdoor and gloved use: pure black and white, hard borders, solid (non-glass) cards, no glow.
  // Light: black on white with a cobalt accent. Dark: white on black with a signal-yellow accent. See `flat` handling in applyTheme.
  contrast: { name:'High contrast', navy:'#000000', blue:'#0033CC', blueDark:'#FFD60A', glow:'#FFFFFF',
    light:{ bg:'#FFFFFF', surface:'#FFFFFF', ink:'#000000', muted:'#3A3A3A', line:'#6B6B6B' },
    dark: { bg:'#000000', surface:'#0C0C0C', ink:'#FFFFFF', muted:'#D2D2D2', line:'#8C8C8C' } }
};
let themeName = localStorage.getItem('roundBookTheme') || 'ocean';
if(!THEMES[themeName]) themeName = 'ocean'; // a scheme that no longer exists (e.g. the removed Ruby) falls back to Ocean

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
function hexToRgba(hex, alpha){
  const [r,g,b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyDarkMode(){
  darkMode = themeMode === 'auto'
    ? !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    : themeMode === 'dark';
  document.body.classList.toggle('dark', darkMode);
  applyTheme();
}
function setThemeMode(mode){
  themeMode = mode;
  localStorage.setItem('roundBookThemeMode', mode);
  applyDarkMode();
  refreshStatusStrip();
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
function rgbTriplet(hex){ return hexToRgb(hex).join(','); }
// WCAG relative luminance / contrast, so text on an accent-coloured fill can be black or white as needed.
function relLum(hex){
  const f = c => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const [r,g,b] = hexToRgb(hex);
  return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
}
function contrastRatio(a, b){
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la,lb)+0.05) / (Math.min(la,lb)+0.05);
}
// The glass slider's 0-100 as a multiplier on every glass opacity: 50 = 1 (the standard look), 0 = 0.2 (very clear), 100 = 2.1 (almost solid).
function glassMultiplier(){ return glassLevel <= 50 ? 0.2 + 0.8 * (glassLevel / 50) : 1 + 1.1 * ((glassLevel - 50) / 50); }
// iOS reads the status-bar colour from the strip when it is drawn and doesn't always notice a later colour change, so after a
// change of colour scheme the strip is taken out and put back, which makes it look again (see #statusStrip in index.html).
function refreshStatusStrip(){
  const el = document.getElementById('statusStrip');
  if(!el || getComputedStyle(el).display === 'none') return;
  const parent = el.parentNode, clone = el.cloneNode(false);
  el.remove();
  requestAnimationFrame(() => { parent.insertBefore(clone, parent.firstChild); });
}
function applyTheme(){
  const t = THEMES[themeName] || THEMES.ocean;
  const p = darkMode ? t.dark : t.light; // this scheme's page / card / text colours for the current mode
  const acc = (darkMode && t.blueDark) ? t.blueDark : t.blue; // the accent actually used in this mode
  // A scheme whose borders are strongly visible against its page (High contrast) is drawn "flat": opaque
  // cards, hard borders, no glass blur, no background glow.
  const flat = contrastRatio(p.line, p.bg) >= 3;
  // Set on the body element itself (not html/:root) so these inline values take
  // precedence over the static light/dark-mode CSS blocks, which declare --blue-dim,
  // --bg etc. directly on body/body.dark and would otherwise win over anything
  // inherited from an ancestor regardless of dark mode state.
  const root = document.body.style;
  const tint = (t.tint != null) ? t.tint : 1; // how strongly the accent washes into cards (1 = full)
  root.setProperty('--navy', t.navy);
  root.setProperty('--blue', acc);
  root.setProperty('--orb-glow', t.glow);
  // A darker shade of the scheme's navy, used for toasts and other high-emphasis chrome.
  root.setProperty('--navy-dark', mixHex(t.navy, '#000000', 0.28));
  // Accent used as text on the pale "dim" chips below: deepened in light mode, lightened in dark mode (AA both ways).
  root.setProperty('--blue-deep', darkMode ? mixHex(acc, '#FFFFFF', 0.35) : mixHex(acc, '#000000', 0.32));
  // Text on top of an accent-coloured fill (buttons, the + bubble, active chips): black or white, whichever reads better.
  root.setProperty('--on-accent', contrastRatio('#000000', acc) > contrastRatio('#FFFFFF', acc) ? '#000000' : '#FFFFFF');
  // The scheme's own page, card and text colours (this is what makes some schemes warm and some cool).
  root.setProperty('--bg', p.bg);
  root.setProperty('--surface', p.surface);
  root.setProperty('--ink', p.ink);
  root.setProperty('--ink-muted', p.muted);
  root.setProperty('--line', p.line);
  root.setProperty('--emphasis', darkMode ? p.ink : 'var(--navy)');
  // The pale tinted background used for chips, quick-action buttons, and banners — the accent mixed into
  // this scheme's own surface colour, so the tint carries the scheme's temperature too.
  root.setProperty('--blue-dim', mixHex(acc, p.surface, darkMode ? 0.82 : 0.86));
  // Liquid Glass: panels are translucent, tinted by the scheme's own surface colour, with a bright specular
  // top edge. These RGB triplets feed the --glass-fill / --sheet-fill rules in the stylesheet.
  root.setProperty('--glass-base', darkMode ? rgbTriplet(mixHex(p.surface, '#FFFFFF', 0.10)) : rgbTriplet(p.surface));
  root.setProperty('--glass-strong-base', darkMode ? rgbTriplet(mixHex(p.surface, '#000000', 0.15)) : rgbTriplet(p.surface));
  root.setProperty('--sheet-base', darkMode ? rgbTriplet(mixHex(p.surface, '#000000', 0.10)) : rgbTriplet(p.bg));
  root.setProperty('--field-edge', flat ? p.line : (darkMode ? 'rgba(255,255,255,0.14)' : hexToRgba(p.muted, 0.30)));
  root.setProperty('--glass-shadow', darkMode
    ? '0 12px 32px rgba(0,0,0,0.42), 0 2px 6px rgba(0,0,0,0.30)'
    : `0 10px 30px ${hexToRgba(t.navy, 0.16)}, 0 2px 6px ${hexToRgba(t.navy, 0.08)}`);
  // Cards (cust-card, round-card, backup-btn, cust-section): a translucent fill of the scheme's surface colour
  // (nudged toward the accent in dark mode so schemes stay distinct), a faint accent wash, and a soft shadow.
  const gk = flat ? 1 : glassMultiplier(); // the flat High contrast scheme has no glass to adjust
  const ga = a => Math.max(0.04, Math.min(0.98, a * gk));
  root.setProperty('--glass-k', String(gk));
  root.setProperty('--card-surface', flat ? p.surface : (darkMode ? hexToRgba(mixHex(p.surface, acc, 0.12 * tint), ga(0.58)) : hexToRgba(p.surface, ga(0.66))));
  root.setProperty('--card-tint', flat ? 'transparent' : (darkMode ? hexToRgba(acc, 0.10 * tint) : hexToRgba(acc, 0.07 * tint)));
  root.setProperty('--card-border', flat ? p.line : (darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.85)'));
  root.setProperty('--card-shadow', flat ? 'none' : (darkMode
    ? `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.05), 0 10px 28px ${hexToRgba(mixHex(t.navy, '#000000', 0.6), 0.50)}`
    : `inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), 0 8px 24px ${hexToRgba(t.navy, 0.12)}, 0 1px 3px rgba(0,0,0,0.06)`));
  // Flat scheme: solid fills (the stylesheet's fallbacks are glass), no blur, no background glow.
  const flatVars = {
    '--glass-fill': `rgb(${rgbTriplet(p.surface)})`, '--glass-fill-strong': `rgb(${rgbTriplet(p.surface)})`,
    '--sheet-fill': `rgb(${rgbTriplet(p.surface)})`, '--field-fill': `rgb(${rgbTriplet(p.bg)})`,
    '--glass-blur': 'none', '--orb-a': '0%', '--orb-b': '0%', '--orb-c': '0%'
  };
  Object.keys(flatVars).forEach(k => { if(flat) root.setProperty(k, flatVars[k]); else root.removeProperty(k); });
  // A scheme can soften the soft background glow (the accent-coloured light behind the page) with `orb`.
  if(!flat && t.orb != null){
    const orbBase = darkMode ? [30,20,14] : [34,22,16];
    ['--orb-a','--orb-b','--orb-c'].forEach((k,i) => root.setProperty(k, Math.round(orbBase[i] * t.orb) + '%'));
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t.navy);
}
function setTheme(name){
  if(!THEMES[name]) return;
  themeName = name;
  localStorage.setItem('roundBookTheme', name);
  applyTheme();
  refreshStatusStrip();
  openSettings();
}
function glassLabel(v){ v = Number(v); return v === 50 ? 'Standard' : (v < 50 ? 'Clearer' : 'More solid'); }
function previewGlass(v){
  glassLevel = Math.max(0, Math.min(100, parseInt(v,10) || 0));
  applyTheme();
  const label = document.getElementById('glassLabel');
  if(label) label.textContent = glassLabel(glassLevel);
}
function setGlass(v){
  previewGlass(v);
  localStorage.setItem('roundBookGlass', String(glassLevel));
  refreshStatusStrip();
}
function resetGlass(){ setGlass(50); openSettings(); }
function openSettings(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Settings</h2>
      ${helpIconBtn('settings', () => openSettings())}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div class="section-label" style="margin-top:0;">Appearance</div>
    <div class="seg-row">
      <button class="seg-btn ${themeMode==='light'?'active':''}" onclick="setThemeMode('light')">☀️ Light</button>
      <button class="seg-btn ${themeMode==='dark'?'active':''}" onclick="setThemeMode('dark')">🌙 Dark</button>
      <button class="seg-btn ${themeMode==='auto'?'active':''}" onclick="setThemeMode('auto')">🌓 Auto</button>
    </div>
    <div class="section-label">Text size</div>
    <div style="display:flex; align-items:center; gap:10px; margin:4px 2px 16px;">
      <span style="font-size:0.75rem; color:var(--ink-muted); flex-shrink:0;">A</span>
      <input type="range" min="15" max="24" step="1" value="${textSize}" oninput="previewTextSize(this.value)" onchange="setTextSize(this.value)" style="flex:1; accent-color:var(--blue);">
      <span style="font-size:1.375rem; color:var(--ink-muted); flex-shrink:0; line-height:1;">A</span>
      <span id="textSizeLabel" style="font-size:0.75rem; font-weight:800; color:var(--ink); min-width:34px; text-align:right; flex-shrink:0;">${textSize}px</span>
    </div>
    <div class="section-label">Glass transparency</div>
    <div style="display:flex; align-items:center; gap:10px; margin:4px 2px 4px;">
      <span style="font-size:0.75rem; color:var(--ink-muted); flex-shrink:0;">Clear</span>
      <input type="range" min="0" max="100" step="5" value="${glassLevel}" oninput="previewGlass(this.value)" onchange="setGlass(this.value)" style="flex:1; accent-color:var(--blue);" aria-label="Glass transparency">
      <span style="font-size:0.75rem; color:var(--ink-muted); flex-shrink:0;">Solid</span>
      <span id="glassLabel" style="font-size:0.75rem; font-weight:800; color:var(--ink); min-width:70px; text-align:right; flex-shrink:0;">${glassLabel(glassLevel)}</span>
    </div>
    <div style="margin:0 2px 16px;"><button onclick="resetGlass()" style="background:none; border:none; padding:2px 0; color:var(--blue-deep); font-weight:700; font-size:0.75rem; cursor:pointer;">Reset to standard</button></div>
    <div class="section-label">Colour scheme</div>
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px;">
      ${Object.keys(THEMES).map(key=>{
        const t = THEMES[key];
        const active = themeName===key;
        const pal = darkMode ? t.dark : t.light;
        return `<button onclick="setTheme('${key}')" style="display:flex; flex-direction:column; align-items:center; gap:7px; padding:10px 4px; border-radius:12px; border:2px solid ${active?t.blue:'var(--line)'}; background:${pal.bg};">
          <span style="display:flex; width:48px; height:26px; border-radius:13px; overflow:hidden; box-shadow:0 0 0 1px rgba(0,0,0,0.14);"><span style="flex:1; background:${t.navy};"></span><span style="flex:1; background:${t.blue};"></span><span style="flex:1; background:${pal.surface};"></span></span>
          <span style="font-size:0.7188rem; font-weight:700; color:${pal.ink};">${t.name}</span>
        </button>`;
      }).join('')}
    </div>
    <div class="section-label">Messaging app</div>
    <div class="seg-row">
      <button class="seg-btn ${data.settings.messagingApp!=='whatsapp'?'active':''}" onclick="setMessagingApp('sms')">💬 Text message</button>
      <button class="seg-btn ${data.settings.messagingApp==='whatsapp'?'active':''}" onclick="setMessagingApp('whatsapp')">🟢 WhatsApp</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:4px 2px 16px; line-height:1.5;">This is your default for messages sent straight to a customer's phone — cleaning and payment reminders, receipts, quotes, and group marketing texts. Anyone who isn't on WhatsApp (or prefers texts) can have their own choice under <b>Message by</b> when you edit them.</p>
    <div class="section-label">After swiping to mark cleaned</div>
    <div class="seg-row">
      <button class="seg-btn ${data.settings.autoCleanedText!==false?'active':''}" onclick="setAutoCleanedText(true)">Open the text</button>
      <button class="seg-btn ${data.settings.autoCleanedText===false?'active':''}" onclick="setAutoCleanedText(false)">Do nothing</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:4px 2px 16px; line-height:1.5;">When you swipe a customer <b>halfway</b> across to mark them cleaned, your messaging app opens with the “Windows cleaned today” text ready to send — you just press send. Swiping <b>all the way</b> (cleaned and paid) doesn’t send a text. Customers with no mobile number, or already texted today, are skipped.</p>
    <div class="section-label">Business details</div>
    <button class="backup-btn" onclick="openBusinessDetails()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1M9 13h1M14 9h1M14 13h1"/></svg>
      <div><div class="t1">Business details</div><div class="t2">Company info, logo, your name, and bank details</div></div>
    </button>
    <button class="backup-btn" onclick="openMessageTemplates()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div><div class="t1">Message templates</div><div class="t2">Wording for reminders, receipts, and quotes</div></div>
    </button>
    <div class="section-label">Mileage</div>
    <button class="backup-btn" onclick="openMileageRates()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <div><div class="t1">Mileage rates</div><div class="t2">HMRC pence-per-mile rates for each tax year</div></div>
    </button>
  `);
}

/* ---------- mileage rates ----------
   Per-tax-year HMRC mileage rates. Saved as data.settings.mileageRates[<start year>]
   = {high, low, threshold} (rates in pounds per mile). Every mileage figure for that
   tax year is worked out from whatever is saved here, so changing a rate re-prices
   the whole year's mileage, including entries already logged. */
function taxYearLabel(startYear){ startYear = Number(startYear); return `${startYear}/${String(startYear+1).slice(2)}`; }
function openMileageRates(year){
  const curYear = Number(taxYearStart(todayISO()).slice(0,4));
  year = Number(year) || curYear;
  const years = new Set([curYear, curYear-1, curYear+1, year]);
  (data.mileageLog||[]).forEach(e=>{ if(e.date) years.add(Number(taxYearStart(e.date).slice(0,4))); });
  Object.keys((data.settings.mileageRates)||{}).forEach(y=>years.add(Number(y)));
  const list = Array.from(years).sort((a,b)=>b-a);
  const r = mileageRatesForTaxYear(year+'-04-06');
  const p = v => String(Math.round(v*10000)/100);
  const isCustom = !!((data.settings.mileageRates||{})[String(year)]);
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Mileage rates</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 14px; line-height:1.5;">HMRC's approved mileage rates are set per tax year (6 April – 5 April). Whatever you save here applies to <b>all</b> the mileage in that tax year — including days you've already logged — in the mileage report. Other tax years aren't affected. The standard car/van rate is 45p for the first 10,000 miles, then 25p.</p>
    <div class="section-label" style="margin-top:0;">Tax year</div>
    <select id="mr_year" onchange="openMileageRates(this.value)">
      ${list.map(y=>`<option value="${y}" ${y===year?'selected':''}>${taxYearLabel(y)}${y===curYear?' (current)':''}${(data.settings.mileageRates||{})[String(y)]?' – custom':''}</option>`).join('')}
    </select>
    <label>Rate up to the mile threshold (pence per mile)</label>
    <input type="number" id="mr_high" inputmode="decimal" step="0.01" min="0" value="${p(r.high)}">
    <label>Rate after the threshold (pence per mile)</label>
    <input type="number" id="mr_low" inputmode="decimal" step="0.01" min="0" value="${p(r.low)}">
    <label>Mile threshold for the higher rate</label>
    <input type="number" id="mr_threshold" inputmode="numeric" step="1" min="0" value="${r.threshold}">
    <div class="form-actions">
      <button class="btn-primary" onclick="saveMileageRates(${year})">Save ${taxYearLabel(year)} rates</button>
    </div>
    ${isCustom ? `<button class="btn-danger-text" onclick="resetMileageRates(${year})">Reset ${taxYearLabel(year)} to HMRC standard</button>` : ''}
  `, () => openSettings());
}
function saveMileageRates(year){
  const high = parseFloat(document.getElementById('mr_high').value);
  const low = parseFloat(document.getElementById('mr_low').value);
  const threshold = parseFloat(document.getElementById('mr_threshold').value);
  if(isNaN(high) || isNaN(low) || isNaN(threshold) || high < 0 || low < 0 || threshold < 0){
    toast('Enter valid rates and a mile threshold'); return;
  }
  data.settings.mileageRates = data.settings.mileageRates || {};
  data.settings.mileageRates[String(year)] = { high: Math.round(high*100)/10000, low: Math.round(low*100)/10000, threshold: Math.round(threshold) };
  saveData();
  toast(`${taxYearLabel(year)} mileage rates saved`);
  openMileageRates(year);
}
function resetMileageRates(year){
  appConfirm(`Reset ${taxYearLabel(year)} to the HMRC standard rates? Any rates you've set for that year will be lost.`, {title:'Reset mileage rates', confirmLabel:'Reset', onConfirm: () => {
    if(data.settings.mileageRates) delete data.settings.mileageRates[String(year)];
    saveData();
    toast(`${taxYearLabel(year)} reset to HMRC standard`);
    openMileageRates(year);
  }});
}

// Each entry drives one row on the Message Templates screen and its edit dialog —
// add a template here and it gets a button, an editor, and reset support for free.
// Marketing text is deliberately NOT here — it now has several named campaigns
// rather than one fixed wording, managed from the Marketing tab instead.
const TEMPLATE_DEFS = [
  { key: 'cleanTemplate', label: 'Cleaning reminder', default: DEFAULT_CLEAN_TEMPLATE },
  { key: 'payTemplate', label: 'Payment reminder', default: DEFAULT_PAY_TEMPLATE },
  { key: 'payFollowUpTemplate', label: 'Payment reminder (2nd+ chase)', default: DEFAULT_PAY_FOLLOWUP_TEMPLATE },
  { key: 'upsellGutterTemplate', label: 'Photo offer — gutter clearing', default: DEFAULT_UPSELL_GUTTER_TEMPLATE },
  { key: 'upsellConservatoryTemplate', label: 'Photo offer — conservatory roof', default: DEFAULT_UPSELL_CONSERVATORY_TEMPLATE },
  { key: 'upsellFasciasTemplate', label: 'Photo offer — fascias & soffits', default: DEFAULT_UPSELL_FASCIAS_TEMPLATE },
  { key: 'upsellOtherTemplate', label: 'Photo offer — something else', default: DEFAULT_UPSELL_OTHER_TEMPLATE },
  { key: 'cleanedTodayTemplate', label: 'Windows cleaned today', default: DEFAULT_CLEANED_TODAY_TEMPLATE },
  { key: 'receiptTemplate', label: 'Receipt', default: DEFAULT_RECEIPT_TEMPLATE },
  { key: 'quoteTemplate', label: 'Quote (new enquiry)', default: DEFAULT_QUOTE_TEMPLATE },
  { key: 'repeatQuoteTemplate', label: 'Quote (repeat work)', default: DEFAULT_REPEAT_QUOTE_TEMPLATE },
  { key: 'quoteFollowUpTemplate', label: 'Quote follow-up (2nd)', default: DEFAULT_QUOTE_FOLLOWUP_TEMPLATE },
  { key: 'quoteFollowUp2Template', label: 'Quote follow-up (3rd+)', default: DEFAULT_QUOTE_FOLLOWUP2_TEMPLATE }
];

function openMessageTemplates(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Message templates</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 12px; line-height:1.5;">Tap a message to edit its wording. Use <b>{name}</b>, <b>{amount}</b>, <b>{date}</b> (receipts), <b>{work}</b> (quotes), <b>{daysoverdue}</b> (payment reminders), <b>{price}</b> (photo offers — becomes "for £X" if you enter a price), <b>{company}</b>, <b>{yourname}</b>, and <b>{bankdetails}</b> (only appears if you've added bank details under Business details). The payment reminder automatically switches to the "2nd+ chase" wording from the second reminder onwards for that customer or job, and quote follow-ups get progressively softer the same way.</p>
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
  appConfirm(`Reset "${def.label}" wording to default?`, {title:'Reset wording', confirmLabel:'Reset', onConfirm: () => {
    data.settings[key] = def.default;
    saveData();
    toast('Reset to default wording');
    openMessageTemplates();
  }});
}

function resetAllTemplates(){
  appConfirm("Reset all message wording to default? This replaces any custom wording you've set for every message.", {title:'Reset all wording', confirmLabel:'Reset all', onConfirm: () => {
    TEMPLATE_DEFS.forEach(def=>{ data.settings[def.key] = def.default; });
    saveData();
    openMessageTemplates();
    toast('Reset to default wording');
  }});
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
    return `<button class="backup-btn" data-ctx-kind="campaign" data-ctx-id="${escapeAttr(camp.id)}" onclick="openCampaignDetail('${camp.id}')">
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
      return `<div class="backup-btn" data-ctx-kind="customer" data-ctx-id="${c.id}" style="text-align:left; align-items:flex-start; cursor:pointer;" onclick="openMarketingResponseEditor('${c.id}')">
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
    c.marketingFollowUpDate = localISO(d);
  } else if(action === 'text_again'){
    const d = new Date(); d.setDate(d.getDate() + 3);
    c.marketingFollowUpDate = localISO(d);
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

let searchDay = null; // a date picked from the calendar button: shows everything recorded on that day (see dayActivityHtml)
function openUniversalSearch(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Search</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:14px;">
      <input type="text" id="search_input" placeholder="Customers, jobs, quotes, rounds, or a date..." oninput="searchTyped()" style="margin:0; flex:1; min-width:0;">
      <label class="day-pick" title="Pick a date to see everything that happened on it" aria-label="Search by date">
        📅<input type="date" id="search_date" onchange="searchPickDate(this.value)" style="position:absolute; inset:0; width:100%; height:100%; opacity:0; margin:0; padding:0; cursor:pointer;">
      </label>
    </div>
    <div id="search_results"></div>
  `, () => render());
  searchDay = null;
  renderUniversalSearchResults();
  setTimeout(() => { const el = document.getElementById('search_input'); if(el) el.focus(); }, 60);
}
/* ---------- forgiving search ----------
   A search finds what you meant, not just what you typed. Every word you type must be found somewhere in the record,
   in any order, and:
     - capitals, accents, apostrophes and punctuation don't matter ("St Mary's" = "st marys");
     - road-type shorthand is treated as the same word (Rd = Road, St = Street, Ave = Avenue, Cres = Crescent ...);
     - a name or address word with a typo still matches when it is close: one slip in a word of 4 to 7 letters, two in a
       longer one (swapped, missing, extra or wrong letters: "Fenwik" finds Fenwick, "Patal" finds Patel);
     - phone numbers can be typed with or without spaces.
   Typo-matching only applies to names, addresses and round names. Phone numbers, emails and notes must match exactly,
   so a long note can't throw up random look-alikes. Closer matches are listed first. */
const SRCH_SYN = { rd:'road', st:'street', saint:'street', ave:'avenue', av:'avenue', cres:'crescent', dr:'drive', ln:'lane',
  cl:'close', ct:'court', pl:'place', gdns:'gardens', gdn:'gardens', grn:'green', ter:'terrace', terr:'terrace', pk:'park',
  sq:'square', mt:'mount', nth:'north', sth:'south' };
function srchNorm(s){
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function srchTokens(s){ return srchNorm(s).split(' ').filter(Boolean).map(t => SRCH_SYN[t] || t); }
// Edit distance counting a swap of two neighbouring letters as one slip; gives up (returns max+1) past max.
function srchDist(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = [], cur = [];
  for(let j = 0; j <= b.length; j++) prev[j] = j;
  for(let i = 1; i <= a.length; i++){
    cur = [i];
    let rowMin = i;
    for(let j = 1; j <= b.length; j++){
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + cost);
      if(prev2 && i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) v = Math.min(v, prev2[j-2] + 1);
      cur[j] = v;
      if(v < rowMin) rowMin = v;
    }
    if(rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
// How well one typed word matches a record: 0 = a word starts with it, 0.4 = found inside a word, 1+ = a close spelling, null = no match.
function srchWordCost(qt, tokens, joined, allowTypos){
  if(joined.indexOf(qt) !== -1) return tokens.some(t => t.startsWith(qt)) ? 0 : 0.4;
  if(!allowTypos || qt.length < 4) return null;
  const maxD = qt.length >= 8 ? 2 : 1;
  let best = null;
  for(const t of tokens){
    let d = srchDist(qt, t, maxD);
    if(d > maxD && t.length > qt.length) d = srchDist(qt, t.slice(0, qt.length), maxD) + 0.5; // a typo'd start of a longer word, as you type
    if(d <= maxD + 0.5 && (best === null || d + 1 < best)) best = d + 1;
  }
  return best;
}
// typoFields: names, addresses, rounds. plainFields: phone, email, notes, account numbers (exact only).
// Returns a total cost (lower is closer), or null if any typed word isn't found.
function srchScore(qTokens, typoFields, plainFields){
  const typoTokens = typoFields.flatMap(srchTokens);
  const typoJoined = typoTokens.join(' ');
  const plainText = plainFields.map(srchNorm).filter(Boolean);
  const plainTokens = plainText.flatMap(t => t.split(' '));
  const plainJoined = plainText.join(' ') + ' ' + plainText.map(t => t.replace(/ /g, '')).join(' '); // phone numbers also without their spaces
  let total = 0;
  for(const qt of qTokens){
    const a = srchWordCost(qt, typoTokens, typoJoined, true);
    const b = srchWordCost(qt, plainTokens, plainJoined, false);
    const c = (a === null) ? b : (b === null ? a : Math.min(a, b));
    if(c === null) return null;
    total += c;
  }
  return total;
}
function srchRank(list, fieldsOf, qTokens, tieSort){
  const out = [];
  list.forEach(item => {
    const f = fieldsOf(item);
    const score = srchScore(qTokens, f[0], f[1]);
    if(score !== null) out.push({ item, score });
  });
  out.sort((x, y) => (x.score - y.score) || tieSort(x.item, y.item));
  return out;
}
// Wraps each typed word, wherever it is found exactly, in a highlight span (so results look properly predictive).
function highlightMatch(text, rawQuery){
  if(!text) return '';
  const lower = String(text).toLowerCase();
  const words = String(rawQuery || '').toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const ranges = [];
  words.forEach(w => { const i = lower.indexOf(w); if(i !== -1) ranges.push([i, i + w.length]); });
  if(!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach(r => { const last = merged[merged.length - 1]; if(last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); });
  let out = '', pos = 0;
  merged.forEach(([s, e]) => {
    out += escapeHtml(String(text).slice(pos, s))
      + '<mark style="background:var(--amber-dim); color:var(--ink); border-radius:3px; padding:0 1px;">' + escapeHtml(String(text).slice(s, e)) + '</mark>';
    pos = e;
  });
  return out + escapeHtml(String(text).slice(pos));
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
  const dayISO = searchDay || (raw ? parseTypedDate(raw) : null);
  if(dayISO){ resultsEl.innerHTML = dayActivityHtml(dayISO, !!searchDay); return; }
  if(!q){
    resultsEl.innerHTML = '<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">Start typing to search customers, jobs, quotes and rounds, or tap 📅 to pick a date and see everything that happened on it.</p>';
    return;
  }

  const qTokens = srchTokens(raw);
  if(!qTokens.length){
    resultsEl.innerHTML = `<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">Nothing matches "${escapeHtml(raw)}".</p>`;
    return;
  }
  const byAddr = (a, b) => (a.address||'').localeCompare(b.address||'');
  const newest = (a, b) => (b.date||'').localeCompare(a.date||'');
  const roundNames = [...new Set(data.customers.map(c=>c.round||'Unassigned'))];
  const roundRanked = srchRank(roundNames, rn => [[rn], []], qTokens, (a, b) => a.localeCompare(b));
  const custRanked = srchRank(data.customers, c => [[c.name, c.address, c.round], [c.phone, c.email, c.notes, c.accountNumber]], qTokens, byAddr);
  const jobRanked = srchRank(data.oneOffJobs||[], j => [[j.name, j.address], [j.phone, j.notes]], qTokens, newest);
  const quoteRanked = srchRank(data.quotes||[], qt => [[qt.name, qt.address], [qt.phone, qt.notes]], qTokens, newest);
  const roundMatches = roundRanked.map(r => r.item);
  const custMatches = custRanked.map(r => r.item);
  const jobMatches = jobRanked.map(r => r.item);
  const quoteMatches = quoteRanked.map(r => r.item);
  // When nothing matches exactly, say so, so a close spelling isn't mistaken for the real thing.
  const best = Math.min(...[roundRanked, custRanked, jobRanked, quoteRanked].map(l => l.length ? l[0].score : Infinity));
  const approxNote = (best >= 1 && best !== Infinity)
    ? `<p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 12px;">No exact match for "${escapeHtml(raw)}". Showing the closest.</p>` : '';

  if(!roundMatches.length && !custMatches.length && !jobMatches.length && !quoteMatches.length){
    resultsEl.innerHTML = `<p style="color:var(--ink-muted); font-size:0.8438rem; text-align:center; margin-top:24px;">Nothing matches "${escapeHtml(raw)}".</p>`;
    return;
  }

  let html = approxNote;
  let firstSection = !approxNote;
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
      return `<button class="backup-btn" data-ctx-kind="customer" data-ctx-id="${c.id}" onclick="searchResultTap('${c.id}')" style="margin-bottom:8px;">
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
    html += jobMatches.map(j=>`<button class="backup-btn" data-ctx-kind="job" data-ctx-id="${j.id}" onclick="openJobFromSearch('${j.id}')" style="margin-bottom:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
      <div style="flex:1; min-width:0;">
        <div class="t1">${highlightMatch(j.address||j.name||'Job', raw)}</div>
        <div class="t2">${fmtDate(j.date)} · ${money(j.price)}</div>
      </div>
    </button>`).join('');
  }
  if(quoteMatches.length){
    html += universalSearchSectionLabel('Quotes', firstSection); firstSection = false;
    html += quoteMatches.map(qt=>`<button class="backup-btn" data-ctx-kind="quote" data-ctx-id="${qt.id}" onclick="openQuoteFromSearch('${qt.id}')" style="margin-bottom:8px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <div style="flex:1; min-width:0;">
        <div class="t1">${highlightMatch(qt.address||qt.name||'Quote', raw)}</div>
        <div class="t2">${money(qt.price)} · ${qt.status||'pending'}</div>
      </div>
    </button>`).join('');
  }
  resultsEl.innerHTML = html;
}
/* ---------- search by date ----------
   Tap 📅 in the search box to pick a day from the calendar, or type one (14/10, 14/10/26, 14 oct, today, yesterday). The
   results are everything the app has recorded on that day: cleans and what they were worth, payments, one-off jobs,
   messages sent, quotes (dated or changed that day), photos added, mileage, price changes and the day's note. */
function searchTyped(){
  const el = document.getElementById('search_input');
  if(el && el.value.trim()) searchDay = null; // typing takes over from a picked date
  renderUniversalSearchResults();
}
function searchPickDate(iso){
  searchDay = iso || null;
  const el = document.getElementById('search_input');
  if(el) el.value = '';
  renderUniversalSearchResults();
}
function searchClearDay(){
  searchDay = null;
  const d = document.getElementById('search_date'); if(d) d.value = '';
  renderUniversalSearchResults();
}
// What someone typed as a date, as YYYY-MM-DD, or null if it isn't clearly one. Day first (UK). With no year it means the
// most recent one that isn't in the future.
function parseTypedDate(raw){
  const s = String(raw || '').trim().toLowerCase().replace(/,/g, '');
  if(!s) return null;
  const today = todayISO();
  if(s === 'today') return today;
  if(s === 'yesterday'){ const d = isoToDate(today); d.setDate(d.getDate() - 1); return localISO(d); }
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  let day, month, year, m;
  if((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/))){ day = +m[1]; month = +m[2]; year = m[3] ? +m[3] : null; }
  else if((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})(?:\s+(\d{4}))?$/)) && MONTHS.indexOf(m[2].slice(0,3)) !== -1 && /^[a-z]+$/.test(m[2])){ day = +m[1]; month = MONTHS.indexOf(m[2].slice(0,3)) + 1; year = m[3] ? +m[3] : null; }
  else if((m = s.match(/^([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/)) && MONTHS.indexOf(m[1].slice(0,3)) !== -1){ day = +m[2]; month = MONTHS.indexOf(m[1].slice(0,3)) + 1; year = m[3] ? +m[3] : null; }
  else return null;
  if(year !== null && year < 100) year += 2000;
  const nowY = +today.slice(0, 4);
  const build = y => { const d = new Date(y, month - 1, day); return (d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day) ? localISO(d) : null; };
  if(year !== null) return build(year);
  let iso = build(nowY);
  if(iso && iso > today) iso = build(nowY - 1);
  return iso;
}
function dayRowHtml(title, sub, right, onclick){
  return `<button class="day-row" ${onclick ? `onclick="${onclick}"` : 'style="cursor:default;"'}>
      <div class="dr-main"><div class="dr-t">${title}</div>${sub ? `<div class="dr-s">${sub}</div>` : ''}</div>
      ${right ? `<div class="dr-r">${right}</div>` : ''}
    </button>`;
}
function dayActivityHtml(iso, canClear){
  const cLabel = c => escapeHtml(c.address || c.name || 'Customer');
  const cSub = c => escapeHtml(c.address ? (c.name || c.round || '') : (c.round || ''));
  const cleans = [], pays = [], jobs = [], msgs = [], photos = [], quotes = [], prices = [];
  data.customers.forEach(c => {
    (c.cleanHistory || []).forEach(e => { if(e.date === iso) cleans.push({ c, amount: Number(e.amount || 0) }); });
    (c.paymentHistory || []).forEach(p => { if(p.date === iso) pays.push({ c, amount: Number(p.amount || 0) }); });
    (c.priceHistory || []).forEach(p => { if(p.date === iso) prices.push({ c, price: p.price }); });
    (c.messageLog || []).forEach(m => { if(m.date === iso) msgs.push({ label: cLabel(c), sub: MESSAGE_LOG_LABELS[m.kind] || m.kind, time: m.time, onclick: `searchResultTap('${c.id}')` }); });
    const n = (c.photos || []).filter(p => p.date === iso).length;
    if(n) photos.push({ label: cLabel(c), n, onclick: `searchResultTap('${c.id}')` });
  });
  (data.oneOffJobs || []).forEach(j => {
    const name = escapeHtml(j.address || j.name || 'Job');
    if(j.date === iso) jobs.push(j);
    (j.messageLog || []).forEach(m => { if(m.date === iso) msgs.push({ label: name, sub: MESSAGE_LOG_LABELS[m.kind] || m.kind, time: m.time, onclick: `openJobFromSearch('${j.id}')` }); });
    const n = (j.photos || []).filter(p => p.date === iso).length;
    if(n) photos.push({ label: name, n, onclick: `openJobFromSearch('${j.id}')` });
  });
  (data.quotes || []).forEach(qt => {
    const events = [];
    if(qt.date === iso) events.push('Quote dated this day (' + (QUOTE_STATUS_LABELS[qt.status] || qt.status || 'pending') + ')');
    (qt.statusLog || []).forEach(e => { if(e.date === iso) events.push('Marked ' + (QUOTE_STATUS_LABELS[e.to] || e.to).toLowerCase()); });
    if(events.length) quotes.push({ qt, events });
    (qt.messageLog || []).forEach(m => { if(m.date === iso) msgs.push({ label: escapeHtml(qt.address || qt.name || 'Quote'), sub: 'Quote ' + (MESSAGE_LOG_LABELS[m.kind] || m.kind), time: m.time, onclick: `openQuoteFromSearch('${qt.id}')` }); });
  });
  const mile = (data.mileageLog || []).find(e => e.date === iso);
  const note = (data.settings && data.settings.dayNotes && data.settings.dayNotes[iso]) || '';

  const charged = cleans.reduce((s, x) => s + x.amount, 0);
  const received = pays.reduce((s, x) => s + x.amount, 0);
  const any = cleans.length || pays.length || jobs.length || msgs.length || photos.length || quotes.length || prices.length || mile || note;
  let html = `<div style="display:flex; align-items:center; gap:10px; margin:0 2px 6px;">
      <div style="flex:1; min-width:0; font-weight:800; font-size:1.0625rem;">\ud83d\udcc5 ${escapeHtml(isoToDate(iso).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }))}</div>
      ${canClear ? '<button class="btn btn-clean" style="flex:none; padding:6px 12px; font-size:0.8125rem;" onclick="searchClearDay()">Clear</button>' : ''}
    </div>`;
  if(!any) return html + `<p style="color:var(--ink-muted); font-size:0.8438rem; margin:14px 2px;">${iso > todayISO() ? 'This date is in the future, so nothing has been recorded yet.' : 'Nothing was recorded on this date.'}</p>`;
  html += `<div style="color:var(--ink-muted); font-size:0.8125rem; font-weight:700; margin:0 2px 10px;">${cleans.length} cleaned${charged ? ' \u00b7 ' + money(charged) + ' charged' : ''}${received ? ' \u00b7 ' + money(received) + ' received' : ''}</div>`;
  let first = true;
  const section = (label, rows) => { if(!rows.length) return; html += universalSearchSectionLabel(label, first) + rows.join(''); first = false; };
  const byLabel = (a, b) => (a.c.address || a.c.name || '').localeCompare(b.c.address || b.c.name || '');
  section('\u2713 Cleaned (' + cleans.length + ')', cleans.sort(byLabel).map(x => dayRowHtml(cLabel(x.c), cSub(x.c), x.amount ? money(x.amount) : '', `searchResultTap('${x.c.id}')`)));
  section('\ud83d\udcb7 Payments (' + pays.length + ')', pays.sort(byLabel).map(x => dayRowHtml(cLabel(x.c), cSub(x.c), money(x.amount), `searchResultTap('${x.c.id}')`)));
  section('\ud83d\udd27 One-off jobs (' + jobs.length + ')', jobs.map(j => dayRowHtml(escapeHtml(j.address || j.name || 'Job'), escapeHtml((j.done ? 'Done' : 'Not done yet') + (j.paid ? ' \u00b7 paid' : '')), j.price ? money(j.price) : '', `openJobFromSearch('${j.id}')`)));
  section('\ud83d\udccb Quotes (' + quotes.length + ')', quotes.map(x => dayRowHtml(escapeHtml(x.qt.address || x.qt.name || 'Quote'), escapeHtml(x.events.join(' \u00b7 ')), '', `openQuoteFromSearch('${x.qt.id}')`)));
  const clock = t => t ? new Date(t).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '';
  section('\ud83d\udcac Messages sent (' + msgs.length + ')', msgs.sort((a, b) => (a.time || 0) - (b.time || 0)).map(m => dayRowHtml(m.label, escapeHtml(m.sub), clock(m.time), m.onclick)));
  section('\ud83d\udcf7 Photos added (' + photos.length + ')', photos.map(p => dayRowHtml(p.label, p.n + (p.n === 1 ? ' photo' : ' photos'), '', p.onclick)));
  section('\ud83d\udcb7 Price set or changed (' + prices.length + ')', prices.sort(byLabel).map(x => dayRowHtml(cLabel(x.c), cSub(x.c), x.price != null ? money(x.price) : '', `searchResultTap('${x.c.id}')`)));
  if(mile){
    const miles = (mile.end != null && mile.start != null) ? Math.max(0, Number(mile.end) - Number(mile.start)) : null;
    section('\ud83d\ude97 Mileage', [dayRowHtml('Start ' + (mile.start != null ? escapeHtml(String(mile.start)) : '\u2014') + ' \u00b7 End ' + (mile.end != null ? escapeHtml(String(mile.end)) : '\u2014'), '', miles != null ? miles + ' miles' : '', '')]);
  }
  if(note) section('\ud83d\udcdd Day note', [dayRowHtml(escapeHtml(note), '', '', '')]);
  return html;
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
// The gallery draws a page of customers at a time, so hundreds of photos aren't all loaded and decoded at once.
const GALLERY_PAGE = 25;
let galleryLimit = GALLERY_PAGE;
function openPhotoGallery(){
  galleryLimit = GALLERY_PAGE;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Photo gallery</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <input type="text" id="gallery_search_input" placeholder="Filter by address or name..." oninput="galleryLimit = GALLERY_PAGE; renderPhotoGallery()" style="margin-top:0; margin-bottom:14px;">
    <div id="gallery_results"></div>
  `, () => openMoreMenu());
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
  const totalEntries = entries.length;
  entries = entries.slice(0, galleryLimit);
  resultsEl.innerHTML = entries.map(({kind, id, address, name, list}) => `
    <div style="margin-bottom:20px;">
      <div class="t1" style="margin-bottom:8px;">${escapeHtml(address||name||'Customer')}${name && address ? `<span style="font-weight:500; color:var(--ink-muted);"> · ${escapeHtml(name)}</span>` : ''}${kind==='job' ? `<span style="font-weight:600; color:var(--ink-muted); font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.02em;"> · One-off job</span>` : ''}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${kind==='customer'
          ? list.map((entry,i) => `<img loading="lazy" decoding="async" src="${photoEntrySrc(entry)}" onclick="openPhotoViewerAt(buildCustomerPhotoList('${id}'), ${i}, () => openPhotoGalleryReturn(), 'gallery')" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`).join('')
          : list.map((entry,i) => `<img loading="lazy" decoding="async" src="${photoEntrySrc(entry)}" onclick="openPhotoViewerAt(buildJobPhotoList('${id}'), ${i}, () => openPhotoGalleryReturn(), 'gallery')" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`).join('')}
      </div>
    </div>
  `).join('') + (totalEntries > entries.length ? `<button class="btn" style="width:100%; margin-bottom:12px;" onclick="galleryLimit += GALLERY_PAGE; renderPhotoGallery()">Show more (${totalEntries - entries.length} more with photos)</button>` : '');
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

// On the wide split view the picked report's preview opens in the right-hand pane (see openReportPreview) instead
// of covering the whole screen. This is the smaller version of the "two columns" idea: the preview element and the
// pendingReport* / rp* globals stay single and global, and only where the preview is drawn changes (the same trick the
// sheets use). The Reports list stays underneath it and comes back when the preview is closed.
function openReports(){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Print reports</h2>
      ${helpIconBtn('reports', () => openReports())}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 16px;">
      Opens a preview you can zoom and scroll, with buttons to Print, Share PDF or Share doc — works offline too.
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
      <div><div class="t1">Price review due</div><div class="t2">12+ months since last price increase, by next clean; plus anyone priced below their property type's average</div></div>
    </button>
    <button class="backup-btn" onclick="printUpsellOpportunities()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>
      <div><div class="t1">Upsell opportunities</div><div class="t2">Fronts-only, conservatory, garage door and gutter add-ons worth offering</div></div>
    </button>
    <button class="backup-btn" onclick="printPropertyTypesReport()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></svg>
      <div><div class="t1">Property types</div><div class="t2">Houses and average price by property type, total and by round</div></div>
    </button>
    <button class="backup-btn" onclick="printMileageReport()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2M9 17h6M5 12h13"/></svg>
      <div><div class="t1">Mileage</div><div class="t2">Daily, weekly, monthly, tax-year-to-date totals, and mileage allowance</div></div>
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
let pendingReportOnPdfShared = null; // optional callback, e.g. to log a quote PDF send

// Letterhead for customer-facing documents (invoice, quote, receipt): the logo on the
// left with the company address and phone number to its RIGHT. With no logo, the company
// name leads the same text block. One .inv-letterhead wrapper so the Word export can
// recognise it and rebuild it as a borderless two-column table (see htmlToDocxElements).
function invoiceLetterheadHtml(){
  const company = data.settings.companyName || '';
  const companyAddress = data.settings.companyAddress || '';
  const companyPhone = data.settings.companyPhone || '';
  const hasLogo = !!data.settings.logo;
  const lines = [
    (!hasLogo && company) ? `<div style="font-size:15px; font-weight:800; color:#10344C; margin-bottom:2px;">${escapeHtml(company)}</div>` : '',
    companyAddress ? `<div>${escapeHtml(companyAddress).replace(/\n/g,'<br>')}</div>` : '',
    companyPhone ? `<div>${escapeHtml(companyPhone)}</div>` : ''
  ].filter(Boolean).join('');
  if(!hasLogo && !lines) return '';
  return `<div class="inv-letterhead" style="display:flex; align-items:center; gap:18px; margin-bottom:18px;">
    ${hasLogo ? `<img class="inv-logo" src="${data.settings.logo}" style="display:block; flex:none; max-height:60px; max-width:200px; object-fit:contain;">` : ''}
    ${lines ? `<div class="inv-lh-text" style="flex:1 1 auto; min-width:0; font-size:11px; color:#66798A; line-height:1.5; text-align:left;">${lines}</div>` : ''}
  </div>`;
}

let pendingReportAllowPdfShare = false;
let pendingReportReturnTo = null;

// The report exactly as it prints / goes into the PDF / shows in the preview.
function reportMarkupHtml(){
  const company = pendingReportHideCompany ? '' : (data.settings.companyName || '');
  // Customer-facing documents (invoice, quote, receipt) have their own letterhead and
  // details, so they skip the generic bold "Title — address" report header.
  return `
    ${pendingReportHideCompany ? '' : `<div class="rpt-header">
      <div>
        <h1>${pendingReportTitle}</h1>
        ${company ? `<div style="font-size:13px; color:#66798A; font-weight:700; margin-top:2px;">${escapeHtml(company)}</div>` : ''}
      </div>
      <div class="rpt-date">${reportDate()}</div>
    </div>`}
    ${pendingReportBody}
  `;
}

// Every report, invoice, quote and receipt goes through here. Instead of a menu of
// choices it opens the full-screen preview (see openReportPreview) with Print,
// Share PDF and Share doc buttons along the bottom.
function runPrint(titleHtml, bodyHtml, hideCompanyHeader, allowPdfShare, returnTo, phone, onPdfShared){
  pendingReportOnPdfShared = onPdfShared || null;
  pendingReportTitle = titleHtml;
  pendingReportBody = bodyHtml;
  pendingReportHideCompany = !!hideCompanyHeader;
  pendingReportPhone = phone || '';
  pendingReportAllowPdfShare = !!allowPdfShare;
  pendingReportReturnTo = returnTo || null;
  openReportPreview();
}

/* ---------- report preview ----------
   A full-screen (or, on the wide split view, right-hand-pane) "paper" view: the report on an A4-width white page that scrolls
   in both directions and zooms by pinching (two fingers), the +/- buttons, or
   Ctrl + mouse wheel on a computer. */
const RP_PAPER_W = 794;      // A4 at 96 dpi, matches the PDF layout
const RP_MIN = 0.3, RP_MAX = 4;
let rpScale = 1, rpAtFit = true, rpPinch = null, rpBound = false;

function rpEls(){
  return { root:document.getElementById('reportPreview'), sc:document.getElementById('rpScroll'),
           sizer:document.getElementById('rpSizer'), paper:document.getElementById('rpPaper'),
           lbl:document.getElementById('rpZoomLbl') };
}
// Sets the zoom, keeping the content under (fx, fy) — a point in the scroll box —
// where it is, so pinching zooms toward the fingers rather than the top-left corner.
function rpApply(scale, fx, fy, keepFit){
  const { sc, sizer, paper, lbl } = rpEls();
  scale = Math.max(RP_MIN, Math.min(RP_MAX, scale));
  const old = rpScale || 1;
  const oldLeft = sizer.offsetLeft, oldTop = sizer.offsetTop;
  const cx = (sc.scrollLeft + fx - oldLeft) / old, cy = (sc.scrollTop + fy - oldTop) / old;
  rpScale = scale;
  if(!keepFit) rpAtFit = false;
  paper.style.transform = `scale(${scale})`;
  sizer.style.width = (RP_PAPER_W * scale) + 'px';
  sizer.style.height = (paper.offsetHeight * scale) + 'px';
  sc.scrollLeft = cx * scale + sizer.offsetLeft - fx;
  sc.scrollTop = cy * scale + sizer.offsetTop - fy;
  lbl.textContent = Math.round(scale * 100) + '%';
}
function rpFit(){
  const { sc } = rpEls();
  const fit = Math.min(1.4, Math.max(RP_MIN, (sc.clientWidth - 24) / RP_PAPER_W));
  rpApply(fit, 0, 0, true);
  rpAtFit = true;
  sc.scrollLeft = 0; sc.scrollTop = 0;
}
function rpZoomBy(factor){
  const { sc } = rpEls();
  rpApply(rpScale * factor, sc.clientWidth/2, sc.clientHeight/2);
}
function rpDist(t){ return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
function rpBind(){
  if(rpBound) return;
  rpBound = true;
  const { sc } = rpEls();
  sc.addEventListener('touchstart', e => {
    if(e.touches.length === 2) rpPinch = { d: rpDist(e.touches), s: rpScale };
  }, {passive:true});
  sc.addEventListener('touchmove', e => {
    if(!rpPinch || e.touches.length !== 2) return;
    e.preventDefault();
    const r = sc.getBoundingClientRect();
    const mx = (e.touches[0].clientX + e.touches[1].clientX)/2 - r.left;
    const my = (e.touches[0].clientY + e.touches[1].clientY)/2 - r.top;
    rpApply(rpPinch.s * rpDist(e.touches) / rpPinch.d, mx, my);
  }, {passive:false});
  const endPinch = e => { if(!e.touches || e.touches.length < 2) rpPinch = null; };
  sc.addEventListener('touchend', endPinch, {passive:true});
  sc.addEventListener('touchcancel', endPinch, {passive:true});
  // iOS Safari's own page-zoom gesture must not fight ours.
  ['gesturestart','gesturechange'].forEach(n => sc.addEventListener(n, e => e.preventDefault()));
  sc.addEventListener('wheel', e => {
    if(!e.ctrlKey) return;
    e.preventDefault();
    const r = sc.getBoundingClientRect();
    rpApply(rpScale * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }, {passive:false});
  const refit = () => {
    if(!document.getElementById('reportPreview').classList.contains('show')) return;
    rpSyncPlacement(); // the window may have changed shape (pane <-> full screen) or the divider may have moved
    if(rpAtFit) rpFit(); else rpApply(rpScale, 0, 0);
  };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.getElementById('reportPreview').classList.contains('show')) closeReportPreview();
  });
}
/* ---------- A4 pagination ----------
   The report is poured into fixed A4 sheets (794 x 1123 px) rather than one long
   page. Content is measured in a hidden box the same width as a sheet's text area:
   blocks that don't fit move to the next sheet, long tables are split between rows
   (the header row repeats on each sheet), a heading is never left alone at the
   bottom of a sheet, and any element with the rpt-page-break class starts a new
   sheet. The same sheets feed the preview and the shared PDF. */
const RP_PAGE_W = 794, RP_PAGE_H = 1123, RP_PAD_X = 32, RP_PAD_T = 32, RP_PAD_B = 44;
const RP_CONTENT_W = RP_PAGE_W - RP_PAD_X*2;
const RP_CONTENT_H = RP_PAGE_H - RP_PAD_T - RP_PAD_B;
const RP_FLOW_BELOW = 0.4; // a sheet filled less than this far counts as "just a heading" (see paginateReport)

async function paginateReport(){
  const stage = document.createElement('div');
  stage.style.cssText = `position:absolute; left:-99999px; top:0; width:${RP_CONTENT_W}px; visibility:hidden; pointer-events:none; color:#1C2B36; --bg:#ffffff; --surface:#ffffff; --ink:#1C2B36; --ink-muted:#66798A; --line:#E3E9EC; --card-surface:#ffffff; --card-border:transparent; --card-shadow:none;`;
  const src = document.createElement('div');
  src.innerHTML = reportMarkupHtml();
  const box = document.createElement('div');   // the sheet being filled
  const probe = document.createElement('div'); // for measuring a block on its own
  box.style.cssText = probe.style.cssText = `display:flow-root; width:${RP_CONTENT_W}px;`;
  stage.append(src, box, probe);
  document.body.appendChild(stage);
  try{
    await Promise.all([...src.querySelectorAll('img')].map(img => img.complete ? null :
      new Promise(res => { img.onload = img.onerror = res; setTimeout(res, 4000); })));

    const pages = [];
    let live = [], path = []; // wrapper clones on the current sheet / the source wrappers they copy
    const target = () => live.length ? live[live.length-1] : box;
    const fits = () => box.offsetHeight <= RP_CONTENT_H;
    const pageEmpty = () => box.textContent.trim() === '' && !box.querySelector('img');
    const isHeading = el => el.nodeType === 1 && (el.classList.contains('rpt-round-title') || /^H[1-6]$/.test(el.tagName));
    const rebuildWrappers = () => {
      live = [];
      let parent = box;
      path.forEach(n => { const w = n.cloneNode(false); parent.appendChild(w); live.push(w); parent = w; });
    };
    // Closes the current sheet and starts the next; a heading stranded at the foot
    // of the closed sheet travels with the content that follows it.
    function startPage(){
      let carry = null;
      const last = target().lastElementChild;
      if(last && isHeading(last)){
        target().removeChild(last);
        if(pageEmpty()){ target().appendChild(last); } else { carry = last; }
      }
      pages.push(box.innerHTML);
      box.innerHTML = '';
      rebuildWrappers();
      if(carry) target().appendChild(carry);
    }
    function splitTable(table){
      const rows = [...table.rows].filter(r => r.parentNode.tagName !== 'THEAD');
      const head = table.tHead;
      let tb, tbl;
      const fresh = () => {
        tbl = table.cloneNode(false);
        if(head) tbl.appendChild(head.cloneNode(true));
        tb = document.createElement('tbody');
        tbl.appendChild(tb);
        target().appendChild(tbl);
      };
      fresh();
      rows.forEach(r => {
        tb.appendChild(r);
        if(fits()) return;
        tb.removeChild(r);
        if(tb.children.length){ startPage(); fresh(); tb.appendChild(r); return; }
        // Not even one row fits under whatever is already on this sheet.
        target().removeChild(tbl);
        if(pageEmpty()){ target().appendChild(tbl); tb.appendChild(r); return; }
        startPage(); fresh(); tb.appendChild(r);
      });
    }
    function place(node){
      if(node.nodeType === 3){
        if(!node.textContent.trim()) return;
        const sp = document.createElement('span'); sp.textContent = node.textContent; node = sp;
      } else if(node.nodeType !== 1) return;
      if(node.classList.contains('rpt-page-break')){
        node.classList.remove('rpt-page-break');
        if(!pageEmpty()) startPage();
      }
      target().appendChild(node);
      if(fits()) return;
      target().removeChild(node);
      probe.appendChild(node);
      const h = probe.offsetHeight;
      probe.removeChild(node);
      // Fits on a sheet of its own, so normally it's moved over whole — except a table landing on a sheet that so
      // far holds only a heading or two. Moving it then strands that heading alone on a page of its own (a round
      // that is a little too long to sit under its title), so the table starts here and flows onto the next sheet.
      const flowsFromHere = node.tagName === 'TABLE' && !pageEmpty() && box.offsetHeight < RP_CONTENT_H * RP_FLOW_BELOW;
      if(h <= RP_CONTENT_H && !flowsFromHere){
        if(!pageEmpty()) startPage();
        target().appendChild(node);
        return;
      }
      if(node.tagName === 'TABLE'){ splitTable(node); return; }
      if(node.children.length){          // taller than a sheet: split it up child by child
        const w = node.cloneNode(false);
        target().appendChild(w); live.push(w); path.push(node);
        [...node.childNodes].forEach(place);
        live.pop(); path.pop();
        return;
      }
      if(!pageEmpty()) startPage();      // can't be split: give it a sheet to itself
      target().appendChild(node);
    }
    [...src.childNodes].forEach(place);
    if(box.innerHTML.trim() || !pages.length) pages.push(box.innerHTML);
    return pages;
  } finally {
    document.body.removeChild(stage);
  }
}
function reportSheetHtml(inner, i, n, flat){
  return `<div class="rp-sheet"${flat ? ' style="box-shadow:none;"' : ''}>${inner}${n > 1 ? `<div class="rp-sheet-foot">Page ${i+1} of ${n}</div>` : ''}</div>`;
}

// Browsers that can't hand a file to a share sheet (most desktop browsers) just download it, so the buttons
// say what they'll do. PDF and Word are checked separately because browsers accept different file types.
// Called once each time the preview opens; each label is the plain text after the button's icon.
function rpLabelShareButtons(){
  const canShareFile = (name, type) => {
    try{ return !!(navigator.canShare && navigator.canShare({files:[new File(['x'], name, {type})]})); }
    catch(e){ return false; }
  };
  const label = (id, can, shareText, saveText) => {
    const b = document.getElementById(id), n = b && b.lastChild;
    if(n && n.nodeType === 3) n.nodeValue = can ? shareText : saveText;
  };
  label('rpBtnPdf', canShareFile('report.pdf', 'application/pdf'), 'Share PDF', 'Save PDF');
  label('rpBtnDoc', canShareFile('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'Share doc', 'Save doc');
}
let rpToken = 0;
// True while the preview is drawn in the right-hand pane of the wide split view rather than full screen. Only the
// full-screen preview locks the page behind it; in the pane the list on the left has to stay usable.
let rpInPane = false, rpScrollLocked = false;
// Puts the preview in (or out of) the pane to match the current screen, and the page lock to match. Called when it
// opens and again if the window changes shape while it's up (an iPad turned from landscape to portrait).
function rpSyncPlacement(){
  const root = document.getElementById('reportPreview');
  rpInPane = isWideSplitView();
  root.classList.toggle('in-pane', rpInPane);
  if(!rpInPane && !rpScrollLocked){ pageScrollLock('report', true); rpScrollLocked = true; }
  else if(rpInPane && rpScrollLocked){ pageScrollLock('report', false); rpScrollLocked = false; }
}
async function openReportPreview(){
  const { root, paper } = rpEls();
  rpBind();
  rpLabelShareButtons();
  const token = ++rpToken;
  document.getElementById('rpTitle').innerHTML = pendingReportTitle;
  paper.innerHTML = '<div class="rp-wait">Preparing preview…</div>';
  root.classList.add('show');
  rpSyncPlacement();
  rpScale = 1; rpAtFit = true;
  rpFit();
  let pages;
  try{ pages = await paginateReport(); }
  catch(e){ pages = [reportMarkupHtml()]; } // never leave the person without a preview
  if(token !== rpToken || !root.classList.contains('show')) return; // closed (or replaced) meanwhile
  paper.innerHTML = pages.map((p, i) => reportSheetHtml(p, i, pages.length)).join('');
  rpScale = 1; rpAtFit = true;
  rpFit();
}
// quiet: close without taking the person "back" to where the report was opened from — used when something else
// (a sheet opened from the list on the left) is taking over the pane, so it isn't pushed aside by the return.
function closeReportPreview(quiet){
  rpToken++;
  const { root, paper } = rpEls();
  if(rpScrollLocked){ pageScrollLock('report', false); rpScrollLocked = false; }
  rpInPane = false;
  root.classList.remove('show', 'in-pane');
  paper.innerHTML = '';
  const back = pendingReportReturnTo;
  pendingReportReturnTo = null;
  if(typeof liveUiFreed === 'function') liveUiFreed();
  if(quiet === true) return;
  // If whatever the report was opened from is still showing underneath, we're
  // already back there; otherwise take the person back to where they came from.
  if(back && !document.getElementById('overlay').classList.contains('show')){ try{ back(); }catch(e){} }
}
// A sheet opening over the pane (openSheet calls this) replaces the in-pane preview rather than hiding behind it.
// The full-screen preview on a phone is untouched: nothing there can open a sheet while it's up.
function rpDismissForSheet(){
  const root = document.getElementById('reportPreview');
  if(root && root.classList.contains('show') && root.classList.contains('in-pane')) closeReportPreview(true);
}
function rpSetBusy(id, busy){
  const b = document.getElementById(id);
  if(b){ b.style.opacity = busy ? '0.6' : ''; b.style.pointerEvents = busy ? 'none' : ''; }
}

function printPendingReport(){
  document.getElementById('printArea').innerHTML = reportMarkupHtml();
  window.print();
}

// Strips HTML and punctuation down to a safe, short filename stem.
function sanitizeFilename(str){
  const plain = (str||'Document').replace(/<[^>]*>/g,'');
  const clean = plain.replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'');
  return (clean || 'Document').slice(0,60);
}

// Builds the PDF from the same A4 sheets the preview shows: each sheet is rendered
// offscreen, rasterized, and placed on its own full A4 page.
async function generatePendingReportPdfBlob(){
  const pages = await paginateReport();
  const libsOk = (await Promise.all([loadLib('jspdf'), loadLib('html2canvas')])).every(Boolean);
  if(!libsOk){ toast(LIB_NEEDS_SIGNAL); throw new Error('PDF tools unavailable'); }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  for(let i = 0; i < pages.length; i++){
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed; left:-9999px; top:0; width:${RP_PAGE_W}px; height:${RP_PAGE_H}px; background:#ffffff;`;
    holder.innerHTML = reportSheetHtml(pages[i], i, pages.length, true);
    document.body.appendChild(holder);
    try{
      const imgs = [...holder.querySelectorAll('img')];
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res=>{ img.onload = img.onerror = res; })));
      const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', useCORS: true, width: RP_PAGE_W, height: RP_PAGE_H });
      if(i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
    } finally {
      document.body.removeChild(holder);
    }
  }
  return pdf.output('blob');
}

// Shares a PDF Blob via the native share sheet (WhatsApp is one of the apps offered
// there on both Android and iOS) when the browser supports sharing files. Where it
// doesn't — mainly desktop browsers — the PDF is downloaded instead and WhatsApp opens
// so it can be attached by hand. Either way, if a customer/job phone number is known
// and WhatsApp is the chosen messaging app, we jump straight to that customer's own
// chat (rather than a blank WhatsApp Web screen) since the share sheet's own app/contact
// picker doesn't accept a phone number from the web — this is the closest practical
// equivalent, same as the addToContacts hand-off elsewhere in the app.
async function sharePdfBlob(blob, filename, phone, whatsappFallback){
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
  } else if(whatsappFallback){
    toast('PDF downloaded — attach it in WhatsApp');
    window.open('https://wa.me/', '_blank');
  } else {
    toast('PDF downloaded');
  }
  return true;
}

async function sendPendingReportPdf(){
  rpSetBusy('rpBtnPdf', true);
  toast('Preparing PDF…');
  try{
    const blob = await generatePendingReportPdfBlob();
    const onShared = pendingReportOnPdfShared;
    const shared = await sharePdfBlob(blob, sanitizeFilename(pendingReportTitle) + '.pdf', pendingReportPhone, pendingReportAllowPdfShare);
    if(shared && onShared){ try{ onShared(); }catch(e){} }
  }catch(e){
    toast('Could not create the PDF — try Print instead');
  }
  rpSetBusy('rpBtnPdf', false);
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

  // Builds a Word ImageRun from an <img> with a data: URL (null if it can't be embedded).
  const imageRunFor = (img) => {
    const src = img.getAttribute('src') || '';
    if(!src.startsWith('data:image')) return null;
    try{
      const base64 = src.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
      let w = 160, h = 160;
      if(img.classList.contains('inv-logo') && src.startsWith('data:image/png')){
        // Logos are PNGs from compressLogo() — read the natural size straight out of the
        // PNG IHDR chunk so the logo keeps its own aspect ratio instead of being forced square.
        const nw = ((bytes[16]<<24) | (bytes[17]<<16) | (bytes[18]<<8) | bytes[19]) >>> 0;
        const nh = ((bytes[20]<<24) | (bytes[21]<<16) | (bytes[22]<<8) | bytes[23]) >>> 0;
        if(nw > 0 && nh > 0){
          const maxW = 200, maxH = 90;
          const scale = Math.min(maxW/nw, maxH/nh, 1);
          w = Math.round(nw*scale); h = Math.round(nh*scale);
        }
      }
      return new ImageRun({ data: bytes, transformation: { width: w, height: h } });
    }catch(e){ return null; }
  };

  Array.from(root.children).forEach(node=>{
    const tag = node.tagName;
    const imgs = node.querySelectorAll ? node.querySelectorAll('img') : [];
    if(tag === 'DIV' && node.classList.contains('inv-letterhead')){
      // Logo on the left, address / phone on the right: a borderless two-column table.
      const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const noBorders = { top: none, bottom: none, left: none, right: none };
      const textNode = node.querySelector('.inv-lh-text');
      const textParas = textNode ? Array.from(textNode.children).map(line=>{
        const isName = /font-weight\s*:\s*(bold|[7-9]00)/i.test(line.getAttribute('style')||'');
        return new Paragraph({ children:[new TextRun({ text: textOf(line), bold: isName })] });
      }).filter(p=>p) : [];
      const imgEl = node.querySelector('img');
      const run = imgEl ? imageRunFor(imgEl) : null;
      if(run && textParas.length){
        elements.push(new Table({
          rows: [ new TableRow({ children: [
            new TableCell({ children:[ new Paragraph({ children:[run] }) ], width:{ size: 3400, type: WidthType.DXA }, borders: noBorders, verticalAlign: 'center' }),
            new TableCell({ children: textParas, width:{ size: PAGE_WIDTH_DXA - 3400, type: WidthType.DXA }, borders: noBorders, verticalAlign: 'center' })
          ] }) ],
          columnWidths: [3400, PAGE_WIDTH_DXA - 3400],
          width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
          borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
          layout: (TableLayoutType && TableLayoutType.FIXED) ? TableLayoutType.FIXED : undefined
        }));
      } else if(run){
        elements.push(new Paragraph({ children:[run] }));
      } else {
        textParas.forEach(p=>elements.push(p));
      }
      elements.push(new Paragraph({ text: '' }));
      return;
    }
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
        const run = imageRunFor(img);
        if(run) elements.push(new Paragraph({ children: [ run ] }));
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
    toast('Loading Word tools…');
    if(!(await loadLib('docx'))){ toast(LIB_NEEDS_SIGNAL); return; }
  }
  rpSetBusy('rpBtnDoc', true);
  try{
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
    const plainTitle = pendingReportTitle.replace(/<[^>]+>/g,'');
    const company = pendingReportHideCompany ? '' : (data.settings.companyName || '');

    // Customer-facing documents (invoice, quote, receipt) carry their own letterhead and
    // details, so they don't get the generic title / company / date lines on top.
    const headerChildren = [];
    if(!pendingReportHideCompany){
      headerChildren.push(new Paragraph({ text: plainTitle, heading: HeadingLevel.HEADING_1 }));
      if(company) headerChildren.push(new Paragraph({ children:[new TextRun({ text: company, italics:true })] }));
      headerChildren.push(new Paragraph({ children:[new TextRun({ text: reportDate(), color:'666666' })], spacing:{ after:300 } }));
    }

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
          toast('Word document shared');
          rpSetBusy('rpBtnDoc', false);
          return;
        }
      }catch(e){
        if(e && e.name === 'AbortError'){ rpSetBusy('rpBtnDoc', false); return; }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
    toast('Word document saved');
  }catch(e){
    toast('Could not create the Word document — try Print instead');
  }
  rpSetBusy('rpBtnDoc', false);
}

