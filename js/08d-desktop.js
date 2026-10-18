/* 08d-desktop.js -- iPad / desktop extras: the right-hand pane's summary panel, right-click menus, the draggable
   divider between the list and the pane, and keyboard navigation of the main list.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html (after the screens it points at, before 09-boot.js).
   Nothing here changes a phone: every part is gated behind isWideSplitView(), a tablet-size test, or
   (hover:hover) and (pointer:fine), none of which a phone — even on its side — matches. */

/* ---------- screen tests ---------- */
// The same size test as the tablet block in index.html: tabs move under the header, keyboards are likely. A phone
// on its side is still under 600px tall, so it never matches.
function isTabletOrDesktop(){
  return !!(window.matchMedia && window.matchMedia('screen and (min-width: 700px) and (min-height: 600px)').matches);
}
// A mouse or trackpad as the main pointer. Touch screens (including an iPad used with fingers) don't match, so they
// keep the swipe / press-and-hold actions and never see a right-click menu.
function hasFinePointer(){
  return !!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches);
}

/* =====================================================================
   1. Right-pane summary panel
   On the wide split view the right-hand pane is empty until something is opened. Instead of a "Select something"
   prompt it shows a short summary for the tab you're on. It lives inside #overlay next to the sheet, and the CSS
   (index.html) shows it only while no sheet is open, so opening anything simply covers it — and the Today tab,
   which has its own full-width dashboard, never shows it.
   ===================================================================== */
function paneDashKind(){
  if(currentTab === 'rounds') return 'rounds';
  if(currentTab === 'jobs' || currentTab === 'quotes' || currentTab === 'marketing') return currentTab;
  return null;
}
function ensurePaneDash(){
  let el = document.getElementById('paneDash');
  if(!el){
    const ov = document.getElementById('overlay');
    if(!ov) return null;
    el = document.createElement('div');
    el.id = 'paneDash';
    el.className = 'pane-dash';
    ov.appendChild(el);
  }
  return el;
}
function pdStat(num, lbl, note, tone){
  return `<div class="stat${tone ? ' ' + tone : ''}"><div class="num">${num}</div><div class="lbl">${lbl}</div>${note ? `<div class="pd-note">${note}</div>` : ''}</div>`;
}
// One tappable row. title / sub must already be safe HTML (callers escape the pieces they build them from).
function pdRow(o){
  return `<button class="pd-row"${o.ctxKind ? ` data-ctx-kind="${o.ctxKind}" data-ctx-id="${escapeAttr(o.ctxId)}"` : ''} onclick="${o.click}">
    <div style="min-width:0;"><div class="t1">${o.title}</div>${o.sub ? `<div class="t2">${o.sub}</div>` : ''}</div>
    ${o.amt ? `<div class="pd-amt"${o.amtColor ? ` style="color:${o.amtColor};"` : ''}>${o.amt}</div>` : ''}
  </button>`;
}
function pdSumPrice(list){ return list.reduce((s, x) => s + Number(x.price || 0), 0); }

function paneDashRounds(){
  // Inside one round the panel is about that round; everywhere else it covers all of them.
  const scopeName = (currentTab === 'rounds' && currentRound) ? currentRound : null;
  const all = scopeName ? data.customers.filter(c => (c.round || 'Unassigned') === scopeName) : data.customers;
  if(!all.length){
    return `<h2 class="pd-title">Rounds</h2><div class="pd-empty">Add your first customer and a summary of your rounds will show here.</div>`;
  }
  const active = all.filter(c => !c.paused);
  const value = active.reduce((s, c) => s + Number(c.price || 0), 0);
  let owedTotal = 0, due = 0;
  const owing = [];
  active.forEach(c => {
    const s = custStatus(c);
    if(s.owed){ owedTotal += s.balance; owing.push({c, balance: s.balance}); }
    if(s.cleanBadge && s.cleanBadge.type === 'due') due++;
  });
  owing.sort((a, b) => b.balance - a.balance);
  const paused = all.length - active.length;
  const roundCount = Object.keys(groupByRound(all)).length;
  const top = owing.slice(0, 6).map(({c, balance}) => pdRow({
    click: `openCustomerDetail('${c.id}')`, ctxKind: 'customer', ctxId: c.id,
    title: escapeHtml(c.address || c.name || 'Customer'),
    sub: [c.address ? c.name : '', scopeName ? '' : (c.round || 'Unassigned'), `${daysSinceLastPayment(c)}d outstanding`].filter(Boolean).map(escapeHtml).join(' · '),
    amt: money(balance), amtColor: 'var(--red)'
  })).join('');
  return `<h2 class="pd-title">${scopeName ? escapeHtml(scopeName) : 'All rounds'}</h2>
    <div class="pd-sub">Pick a customer or round on the left to open it here</div>
    <div class="pd-stats">
      ${pdStat(active.length, 'Customers', paused ? `${paused} paused` : '')}
      ${pdStat(money(value), 'Round value', active.length ? `${money(value / active.length)} average` : '')}
      ${pdStat(money(owedTotal), 'Owed', owing.length ? `${owing.length} customer${owing.length === 1 ? '' : 's'}` : 'All paid up', owedTotal > 0.005 ? 'bad' : 'good')}
      ${pdStat(due, 'Due now', due ? 'waiting to be cleaned' : 'All up to date', due ? 'warn' : 'good')}
    </div>
    <div class="section-label" style="margin-top:0;">Most owed</div>
    ${top || `<div class="pd-empty">Nobody owes anything.</div>`}
    ${listTotalHtml(`${scopeName ? '' : `${roundCount} round${roundCount === 1 ? '' : 's'} · `}${active.length} customer${active.length === 1 ? '' : 's'} · ${roundValueOwedHtml(value, owedTotal)}`)}`;
}

function paneDashJobs(){
  const jobs = data.oneOffJobs || [];
  if(!jobs.length) return `<h2 class="pd-title">One-off jobs</h2><div class="pd-empty">Tap the blue + button to add a job and its summary will show here.</div>`;
  const today = todayISO();
  // Monday to Sunday, the same week the earnings reports use (mondayOfWeek is in 07-reports-b.js).
  const wkStart = mondayOfWeek(today), wkEnd = addDaysISO(wkStart, 6);
  const inWeek = d => !!d && d >= wkStart && d <= wkEnd;
  const doneWk = jobs.filter(j => j.done && inWeek(j.date));
  const paidWk = jobs.filter(j => j.paid && inWeek(j.paidDate));
  const toDo = jobs.filter(j => !j.done).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const unpaid = jobs.filter(j => j.done && !j.paid).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const row = (j, withAge) => pdRow({
    click: `openJobForm(data.oneOffJobs.find(x=>x.id==='${j.id}'))`, ctxKind: 'job', ctxId: j.id,
    title: escapeHtml(j.address || j.name || 'Job'),
    sub: [fmtDate(j.date), withAge && j.date ? `${Math.max(0, daysBetween(j.date, today))}d ago` : ''].filter(Boolean).map(escapeHtml).join(' · '),
    amt: money(j.price)
  });
  return `<h2 class="pd-title">One-off jobs</h2>
    <div class="pd-sub">This week (${fmtDate(wkStart)} – ${fmtDate(wkEnd)}) and what's still outstanding</div>
    <div class="pd-stats">
      ${pdStat(doneWk.length, 'Done this week', money(pdSumPrice(doneWk)), doneWk.length ? 'good' : '')}
      ${pdStat(paidWk.length, 'Paid this week', money(pdSumPrice(paidWk)), paidWk.length ? 'good' : '')}
      ${pdStat(toDo.length, 'Still to do', money(pdSumPrice(toDo)), toDo.length ? 'warn' : '')}
      ${pdStat(unpaid.length, 'Awaiting payment', money(pdSumPrice(unpaid)), unpaid.length ? 'bad' : 'good')}
    </div>
    <div class="section-label" style="margin-top:0;">Done, not yet paid</div>
    ${unpaid.length ? unpaid.slice(0, 5).map(j => row(j, true)).join('') : `<div class="pd-empty">Everything that's been done is paid for.</div>`}
    <div class="section-label">Next up</div>
    ${toDo.length ? toDo.slice(0, 5).map(j => row(j, false)).join('') : `<div class="pd-empty">No jobs waiting to be done.</div>`}`;
}

function paneDashQuotes(){
  const quotes = data.quotes || [];
  if(!quotes.length) return `<h2 class="pd-title">Quotes</h2><div class="pd-empty">Tap the blue + button to note down a quote and its summary will show here.</div>`;
  const today = todayISO();
  const by = st => quotes.filter(q => (q.status || 'pending') === st);
  const pending = by('pending'), converted = by('converted'), accepted = by('accepted'), declined = by('declined');
  const followUp = quotesNeedingFollowUp();
  // Oldest first: the ones that have waited longest are the ones to chase.
  const oldest = pending.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(0, 6);
  const rows = oldest.map(q => pdRow({
    click: `openQuoteDetail('${q.id}')`, ctxKind: 'quote', ctxId: q.id,
    title: escapeHtml(q.address || q.name || 'Quote'),
    sub: [fmtDate(q.date), q.date ? `${Math.max(0, daysBetween(q.date, today))}d since quoted` : '', quoteNeedsFollowUp(q, today) ? '⏰ follow up' : ''].filter(Boolean).map(escapeHtml).join(' · '),
    amt: money(q.price)
  })).join('');
  return `<h2 class="pd-title">Quotes</h2>
    <div class="pd-sub">Pick a quote on the left to open it here</div>
    <div class="pd-stats">
      ${pdStat(pending.length, 'Pending', money(pdSumPrice(pending)), pending.length ? 'warn' : '')}
      ${pdStat(converted.length, 'Converted', money(pdSumPrice(converted)), converted.length ? 'good' : '')}
      ${pdStat(accepted.length, 'Accepted', accepted.length ? money(pdSumPrice(accepted)) : '')}
      ${pdStat(declined.length, 'Declined', declined.length ? money(pdSumPrice(declined)) : '')}
      ${pdStat(followUp.length, 'Need following up', followUp.length ? 'pending a week or more' : 'Nothing overdue', followUp.length ? 'bad' : 'good')}
    </div>
    <div class="section-label" style="margin-top:0;">Oldest pending</div>
    ${rows || `<div class="pd-empty">No quotes are waiting for an answer.</div>`}`;
}

function paneDashMarketing(){
  const tracked = marketingTrackedCustomers();
  if(!tracked.length) return `<h2 class="pd-title">Marketing</h2><div class="pd-empty">Once you've sent a campaign text, the replies that need action will show here.</div>`;
  // Same idea as the top group on a campaign's own page: they've replied, and there's something left to do about it.
  const needs = tracked.filter(c => (c.marketingStatus || 'awaiting') !== 'awaiting' && c.marketingNextAction && c.marketingNextAction !== 'none' && !c.marketingActionDone)
    .sort((a, b) => (a.marketingFollowUpDate || '9999').localeCompare(b.marketingFollowUpDate || '9999'));
  const awaiting = tracked.filter(c => (c.marketingStatus || 'awaiting') === 'awaiting');
  const booked = tracked.filter(c => c.marketingStatus === 'booked');
  const dueNow = marketingFollowUpsDue();
  const rows = needs.slice(0, 8).map(c => {
    const st = MARKETING_STATUS_OPTIONS[c.marketingStatus] || MARKETING_STATUS_OPTIONS.awaiting;
    const act = MARKETING_ACTION_OPTIONS[c.marketingNextAction] || '';
    return pdRow({
      click: `openMarketingResponseEditor('${c.id}')`, ctxKind: 'customer', ctxId: c.id,
      title: escapeHtml(c.address || c.name || 'Customer'),
      sub: [st.label, act, c.marketingFollowUpDate ? `by ${fmtDate(c.marketingFollowUpDate)}` : ''].filter(Boolean).map(escapeHtml).join(' · ')
    });
  }).join('');
  return `<h2 class="pd-title">Marketing</h2>
    <div class="pd-sub">Pick a campaign on the left to open it here</div>
    <div class="pd-stats">
      ${pdStat(needs.length, 'Need action', dueNow.length ? `${dueNow.length} due now` : 'None due yet', needs.length ? 'warn' : 'good')}
      ${pdStat(awaiting.length, 'Awaiting a reply')}
      ${pdStat(booked.length, 'Booked in', '', booked.length ? 'good' : '')}
      ${pdStat(tracked.length, 'Texts sent')}
    </div>
    <div class="section-label" style="margin-top:0;">Replies needing action</div>
    ${rows || `<div class="pd-empty">No replies are waiting on you.</div>`}`;
}

// Draws the panel for the current tab. Called after every render(), when a sheet closes (it may have changed the
// numbers) and when the window changes shape. While a sheet is open the CSS hides the panel, so there's nothing to
// draw — closeSheet() brings it up to date again.
function renderPaneDash(){
  const ov = document.getElementById('overlay');
  if(!ov) return;
  const kind = isWideSplitView() ? paneDashKind() : null;
  ov.classList.toggle('has-dash', !!kind); // tells the CSS to drop the plain "Select something" prompt
  if(!kind || ov.classList.contains('show')) return;
  const el = ensurePaneDash();
  if(!el) return;
  const build = { rounds: paneDashRounds, jobs: paneDashJobs, quotes: paneDashQuotes, marketing: paneDashMarketing }[kind];
  el.innerHTML = build();
}

/* =====================================================================
   2. Right-click menus (mouse / trackpad only)
   One menu, built per item, mirroring what swiping or pressing-and-holding a card does, plus the actions that live
   behind its detail screen. Items carry a hint of the keyboard shortcut that does the same (see section 4).
   ===================================================================== */
let ctxMenuEl = null, ctxTargetEl = null;
function closeContextMenu(){
  if(ctxMenuEl){ ctxMenuEl.remove(); ctxMenuEl = null; }
  if(ctxTargetEl){ ctxTargetEl.classList.remove('ctx-target'); ctxTargetEl = null; }
}
// items: {label, run, hint?, danger?} objects, or '-' for a divider. Opens at (x, y), flipping to stay on screen.
function openContextMenu(x, y, items, title, focusFirst){
  closeContextMenu();
  // Tidy the dividers so the menu never starts, ends or doubles up on one.
  const list = [];
  items.forEach(it => { if(it === '-'){ if(list.length && list[list.length - 1] !== '-') list.push('-'); } else if(it) list.push(it); });
  while(list.length && list[list.length - 1] === '-') list.pop();
  if(!list.length) return;
  const el = document.createElement('div');
  el.className = 'ctx-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = (title ? `<div class="ctx-title">${escapeHtml(title)}</div>` : '') + list.map((it, i) => it === '-'
    ? `<div class="ctx-sep" role="separator"></div>`
    : `<button type="button" role="menuitem" class="ctx-item${it.danger ? ' danger' : ''}" data-i="${i}"><span>${escapeHtml(it.label)}</span>${it.hint ? `<span class="ctx-hint">${escapeHtml(it.hint)}</span>` : ''}</button>`).join('');
  el.style.visibility = 'hidden';
  document.body.appendChild(el);
  const m = 8, w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let left = (x + w + m > vw) ? x - w : x;   // no room on the right: open to the left of the pointer
  let top = (y + h + m > vh) ? y - h : y;    // no room below: open upwards
  left = Math.max(m, Math.min(left, vw - w - m));
  top = Math.max(m, Math.min(top, vh - h - m));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.maxHeight = (vh - m * 2) + 'px';
  el.style.visibility = '';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.ctx-item');
    if(!b) return;
    const it = list[Number(b.dataset.i)];
    closeContextMenu();
    if(it && it.run){ try{ it.run(); }catch(err){ console.error(err); } }
  });
  el.addEventListener('keydown', (e) => {
    const btns = Array.from(el.querySelectorAll('.ctx-item'));
    const i = btns.indexOf(document.activeElement);
    if(e.key === 'ArrowDown'){ e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if(e.key === 'Home'){ e.preventDefault(); btns[0].focus(); }
    else if(e.key === 'End'){ e.preventDefault(); btns[btns.length - 1].focus(); }
    else if(e.key === 'Tab'){ closeContextMenu(); }
  });
  ctxMenuEl = el;
  if(focusFirst){ const first = el.querySelector('.ctx-item'); if(first) first.focus(); }
}
// Anything that moves the page out from under the menu, or clicks away from it, dismisses it.
document.addEventListener('pointerdown', (e) => { if(ctxMenuEl && !ctxMenuEl.contains(e.target)) closeContextMenu(); }, true);
document.addEventListener('scroll', (e) => { if(ctxMenuEl && !ctxMenuEl.contains(e.target)) closeContextMenu(); }, true);
window.addEventListener('resize', closeContextMenu);
window.addEventListener('blur', closeContextMenu);
// Capture phase, so Escape closes the menu and goes no further (it would otherwise also close a sheet or preview).
document.addEventListener('keydown', (e) => {
  if(ctxMenuEl && e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeContextMenu(); }
}, true);

function ctxCustomerItems(id){
  const c = data.customers.find(x => x.id === id);
  if(!c) return null;
  const s = custStatus(c), mobile = isMobileNumber(c.phone);
  const items = [
    {label: 'Open', hint: '↵', run: () => openCustomerDetail(id)},
    {label: 'Quick info', run: () => openCustomerInfoBox(id)},
    '-',
    {label: 'Mark cleaned', hint: 'C', run: () => quickClean(id, false)}
  ];
  // The halfway swipe's version: also opens the "windows cleaned today" text (if that's switched on in Settings).
  if(mobile && data.settings.autoCleanedText !== false) items.push({label: 'Mark cleaned and send text', run: () => quickClean(id, true)});
  items.push(
    {label: 'Mark paid', hint: 'P', run: () => quickPaid(id)},
    {label: 'Mark cleaned and paid', hint: 'B', run: () => quickCleanAndPaid(id, false)},
    '-'
  );
  if(s.owed && mobile) items.push({label: 'Chase payment…', run: () => chaseCustomer(id)});
  if(c.phone) items.push({label: 'Call', run: () => callCustomer('customer', id)});
  if(c.address) items.push({label: 'Directions', run: () => openDirections('customer', id)});
  items.push({label: 'Defer…', run: () => openDeferSheet('customer', id)}, {label: 'Edit…', run: () => openCustomerForm(c)});
  return {title: c.address || c.name || 'Customer', items};
}
function ctxJobItems(id){
  const j = (data.oneOffJobs || []).find(x => x.id === id);
  if(!j) return null;
  const items = [
    {label: 'Open', hint: '↵', run: () => openJobForm(j)},
    '-',
    {label: j.done ? 'Mark not done' : 'Mark done', hint: 'C', run: () => toggleJobDone(id)},
    {label: j.paid ? 'Mark unpaid' : 'Mark paid', hint: 'P', run: () => toggleJobPaid(id)},
    '-'
  ];
  if(j.phone) items.push({label: 'Call', run: () => callCustomer('job', id)});
  if(j.address) items.push({label: 'Directions', run: () => openDirections('job', id)});
  items.push('-', {label: 'Delete job…', danger: true, run: () => deleteJob(id)});
  return {title: j.address || j.name || 'Job', items};
}
function ctxQuoteItems(id){
  const q = (data.quotes || []).find(x => x.id === id);
  if(!q) return null;
  const st = q.status || 'pending';
  const items = [{label: 'Open', hint: '↵', run: () => openQuoteDetail(id)}, '-'];
  // A converted quote is finished business: accepting or declining it would undo that, as swiping would.
  if(st !== 'converted'){
    if(st !== 'accepted') items.push({label: 'Mark accepted', hint: 'C', run: () => markQuoteAccepted(id)});
    if(st !== 'declined') items.push({label: 'Mark declined', hint: 'X', run: () => markQuoteDeclined(id)});
  }
  if(st === 'pending' && (isMobileNumber(q.phone) || q.email)) items.push({label: (q.quoteFollowUpCount || 0) > 0 ? 'Send follow-up…' : 'Send quote…', run: () => sendQuoteText(id)});
  items.push('-', {label: 'Delete quote…', danger: true, run: () => deleteQuote(id)});
  return {title: q.address || q.name || 'Quote', items};
}
function ctxRoundItems(rn){
  // Same set as the round's own ⋯ menu, plus opening it. (From a search result the round list isn't on screen, so
  // opening goes via the Rounds tab.)
  return {title: rn, items: [
    {label: 'Open round', hint: '↵', run: () => { if(currentTab !== 'rounds') setTab('rounds'); openRound(rn); }},
    '-',
    {label: 'Start round — directions', run: () => startRoundDirections(rn)},
    {label: 'Show map', run: () => showRoundMap(rn)},
    {label: 'Print this round', run: () => printSingleRound(rn)},
    '-',
    {label: 'Round note…', run: () => openRoundNoteSheet(rn)},
    {label: 'Defer…', run: () => openDeferSheet('round', rn)},
    {label: 'Apply price uplift…', run: () => openRoundUpliftSheet(rn)}
  ]};
}
function ctxCampaignItems(id){
  const list = (data.settings.marketingCampaigns && data.settings.marketingCampaigns.length) ? data.settings.marketingCampaigns : DEFAULT_MARKETING_CAMPAIGNS;
  const camp = list.find(c => c.id === id);
  if(!camp) return null;
  const items = [
    {label: 'Open', hint: '↵', run: () => openCampaignDetail(id)},
    {label: 'Send group text…', run: () => { marketingSelectedCampaignId = id; openGroupMarketingText(); }}
  ];
  if((data.settings.marketingCampaigns || []).length > 1) items.push('-', {label: 'Delete campaign…', danger: true, run: () => deleteMarketingCampaign(id)});
  return {title: camp.name, items};
}
function ctxMenuFor(kind, id){
  if(kind === 'customer') return ctxCustomerItems(id);
  if(kind === 'job') return ctxJobItems(id);
  if(kind === 'quote') return ctxQuoteItems(id);
  if(kind === 'round') return ctxRoundItems(id);
  if(kind === 'campaign') return ctxCampaignItems(id);
  return null;
}
// What was right-clicked? Cards carry data-kind / data-id; every other row and header carries data-ctx-kind / data-ctx-id.
function ctxTargetFrom(node){
  if(!node || !node.closest) return null;
  const card = node.closest('.cust-card[data-id][data-kind]');
  if(card) return {el: card, kind: card.dataset.kind, id: card.dataset.id};
  const row = node.closest('[data-ctx-kind]');
  if(row) return {el: row, kind: row.dataset.ctxKind, id: row.dataset.ctxId};
  return null;
}
function showContextMenuFor(target, x, y, focusFirst){
  const m = ctxMenuFor(target.kind, target.id);
  if(!m) return false;
  openContextMenu(x, y, m.items, m.title, focusFirst);
  if(ctxMenuEl){
    target.el.classList.add('ctx-target'); // marks which row the menu is about while it's open
    ctxTargetEl = target.el;
  }
  return true;
}
// Capture phase: this runs before the older touch-era handler on #main (09-boot.js), which then sees
// defaultPrevented and leaves it alone. On touch screens this returns at once, so Android's long-press still opens the info box.
document.addEventListener('contextmenu', (e) => {
  if(!hasFinePointer() || e.defaultPrevented) return;
  // Keep the browser's own menu where it's useful: text fields (copy / paste / spelling), links, and an open menu.
  if(e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], a[href], .ctx-menu')) return;
  const target = ctxTargetFrom(e.target);
  if(!target) return;
  if(showContextMenuFor(target, e.clientX, e.clientY, false)){
    e.preventDefault();
    if(target.el.closest('#main')) kbSelectEl(target.el, false); // a keyboard carries on from here
  }
}, true);

/* =====================================================================
   3. Draggable divider between the list and the right-hand pane
   --list-w (index.html) is the width of the list column; dragging sets it, within limits, and it's remembered the
   same way the schedule's zoom is. Only ever applied on the wide split view: elsewhere the stored width is ignored
   and the variable is cleared, so portrait / phones use the CSS values exactly as before.
   ===================================================================== */
const PANE_W_KEY = 'roundBookPaneWidth';
const PANE_W_MIN = 320;       // narrower than this and the cards' buttons and badges start to squash
const PANE_W_MAX = 900;
const PANE_LEAVE_FOR_PANE = 420; // the right-hand pane always keeps at least this much
function paneWidthLimits(){
  return { min: PANE_W_MIN, max: Math.max(PANE_W_MIN, Math.min(PANE_W_MAX, window.innerWidth - PANE_LEAVE_FOR_PANE)) };
}
function storedPaneWidth(){
  try{ const w = parseFloat(localStorage.getItem(PANE_W_KEY)); if(w >= PANE_W_MIN && w <= PANE_W_MAX) return w; }catch(e){}
  return null;
}
function savePaneWidth(w){
  try{ if(w == null) localStorage.removeItem(PANE_W_KEY); else localStorage.setItem(PANE_W_KEY, String(Math.round(w))); }catch(e){}
}
// Sets the width (or, with none given, the remembered one). Returns the width actually used, or null if the
// CSS default is in charge.
function applyPaneWidth(w){
  const root = document.documentElement.style;
  const divider = document.getElementById('paneDivider');
  if(!isWideSplitView()){ root.removeProperty('--list-w'); return null; }
  if(w == null) w = storedPaneWidth();
  if(w == null){ root.removeProperty('--list-w'); if(divider) divider.removeAttribute('aria-valuenow'); return null; }
  const { min, max } = paneWidthLimits();
  const used = Math.round(Math.max(min, Math.min(max, w)));
  root.setProperty('--list-w', used + 'px');
  if(divider){ divider.setAttribute('aria-valuemin', String(min)); divider.setAttribute('aria-valuemax', String(max)); divider.setAttribute('aria-valuenow', String(used)); }
  return used;
}
// Things inside the pane (the report preview, a map) fit themselves to their size when the window resizes.
function paneWidthChanged(){ window.dispatchEvent(new Event('resize')); }
function ensurePaneDivider(){
  let el = document.getElementById('paneDivider');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'paneDivider';
  el.className = 'pane-divider';
  el.setAttribute('role', 'separator');
  el.setAttribute('aria-orientation', 'vertical');
  el.setAttribute('aria-label', 'Resize the list and the pane beside it');
  el.setAttribute('title', 'Drag to resize · double-click to reset');
  el.tabIndex = 0;
  document.body.appendChild(el);
  let dragging = false, lastW = null;
  const finish = () => {
    if(!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    document.body.classList.remove('pane-resizing');
    if(lastW != null){ savePaneWidth(lastW); paneWidthChanged(); }
  };
  el.addEventListener('pointerdown', (e) => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; lastW = null;
    el.classList.add('dragging');
    document.body.classList.add('pane-resizing');
    try{ el.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if(!dragging) return;
    const used = applyPaneWidth(e.clientX); // the list starts at the left edge, so the pointer's x is the width
    if(used != null) lastW = used;
  });
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
  el.addEventListener('lostpointercapture', finish);
  // Keyboard: arrows nudge it (Shift for bigger steps), Enter or double-click puts it back to the default.
  const reset = () => { savePaneWidth(null); applyPaneWidth(); paneWidthChanged(); };
  el.addEventListener('dblclick', reset);
  el.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); reset(); return; }
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = el.getBoundingClientRect().left + el.offsetWidth / 2; // the boundary's current x
    const used = applyPaneWidth(cur + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 96 : 24));
    if(used != null){ savePaneWidth(used); paneWidthChanged(); }
  });
  return el;
}
function syncPaneLayout(){
  applyPaneWidth();
  renderPaneDash(); // coming into (or out of) the wide layout changes whether the pane shows its summary
}
ensurePaneDivider();
applyPaneWidth(); // on load, before the first render
window.addEventListener('resize', syncPaneLayout);
window.addEventListener('orientationchange', syncPaneLayout);

/* =====================================================================
   4. Keyboard navigation of the main list
   j / k or ↓ / ↑   move the highlight through the cards (rounds, customers, jobs, quotes, campaigns)
   Enter             open the highlighted one            m   its right-click menu
   c                 the right-swipe action: cleaned (customer), done (job), accepted (quote)
   p                 the left-swipe action: paid (customer, job)
   b                 cleaned and paid (customer)         x   declined (quote)
   Escape            close the open pane (wide split view) or, failing that, clear the highlight
   Like Ctrl/Cmd+K and / (09-boot.js) these are left alone while typing in a field, while a full-screen editor,
   preview or dialog is up, and — because arrow keys scroll a sheet — while a sheet is open. Anything that changes
   data shows the usual Undo toast, so a slip is one click to take back.
   ===================================================================== */
// The highlighted card is remembered by kind and id, not by element, because every change redraws the list.
// index and listKey let it cope when the card it was on has left the list (see kbApply).
let kbSel = null;
function kbItems(){
  return Array.from(document.querySelectorAll('#main .cust-card[data-id][data-kind], #main .round-card[data-ctx-kind], #main [data-ctx-kind="campaign"]'));
}
function kbKeyOf(el){ return (el.dataset.kind || el.dataset.ctxKind) + ':' + (el.dataset.id || el.dataset.ctxId); }
function kbListKey(){ return [currentTab, currentRound, roundsViewMode, roundFilterMode, roundDayFilter, reorderMode].join('|'); }
function kbCurrent(){
  if(!kbSel) return null;
  return kbItems().find(el => kbKeyOf(el) === kbSel.key) || null;
}
// Puts the highlight back on the remembered card after the list is redrawn. If that card has left the list (cleaned
// off the Due list, say) the card that slid up into its place gets it, so a run of C presses works down the list.
function kbApply(scroll){
  document.querySelectorAll('#main .kb-selected').forEach(e => e.classList.remove('kb-selected'));
  if(!kbSel) return null;
  const items = kbItems();
  let i = items.findIndex(el => kbKeyOf(el) === kbSel.key);
  if(i < 0){
    if(kbSel.listKey !== kbListKey() || !items.length){ kbSel = null; return null; } // a different list now: start afresh
    i = Math.min(kbSel.index, items.length - 1);
  }
  const el = items[i];
  kbSel = { key: kbKeyOf(el), index: i, listKey: kbListKey() };
  el.classList.add('kb-selected');
  if(scroll) el.scrollIntoView({ block: 'nearest' }); // CSS scroll-margin keeps it clear of the fixed header
  return el;
}
function kbSelectEl(el, scroll){
  const items = kbItems();
  const i = items.indexOf(el);
  if(i < 0) return;
  kbSel = { key: kbKeyOf(el), index: i, listKey: kbListKey() };
  kbApply(!!scroll);
}
function kbFirstOnScreen(items){
  const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0) + 8;
  const i = items.findIndex(el => el.getBoundingClientRect().bottom > top);
  return i < 0 ? 0 : i;
}
// Runs after every render() (see 02-today-rounds.js): refresh the pane's summary and keep the highlight in place.
function desktopAfterRender(){
  renderPaneDash();
  if(kbSel) kbApply(false);
}
document.addEventListener('keydown', (e) => {
  if(e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if(!isTabletOrDesktop()) return;
  const t = e.target, tag = t && t.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  const shown = (id) => { const el = document.getElementById(id); return !!el && el.classList.contains('show'); };
  if(shown('schedEditor') || shown('reportPreview') || document.getElementById('appConfirmPrompt') || document.getElementById('backupPopup') || ctxMenuEl) return;
  const key = e.key, lower = key.length === 1 ? key.toLowerCase() : key;
  const sheetOpen = shown('overlay');

  if(key === 'Escape'){
    if(sheetOpen){
      // In the split view the open sheet is just the pane beside the list, so Escape puts it away (a form with
      // unsaved changes still asks first — closeSheet runs its usual guard).
      if(isWideSplitView()){ e.preventDefault(); closeSheet(); }
    } else if(kbSel){
      e.preventDefault();
      kbSel = null;
      document.querySelectorAll('#main .kb-selected').forEach(el => el.classList.remove('kb-selected'));
    }
    return;
  }
  if(sheetOpen) return;

  const down = key === 'ArrowDown' || lower === 'j', up = key === 'ArrowUp' || lower === 'k';
  if(down || up){
    const items = kbItems();
    if(!items.length) return; // nothing to move through (the Today tab, say): arrows scroll as usual
    e.preventDefault();
    // A focused button (a tab just clicked, say) would otherwise swallow the Enter that follows.
    if(document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    let i = kbSel ? items.findIndex(el => kbKeyOf(el) === kbSel.key) : -1;
    if(i < 0) i = kbFirstOnScreen(items);
    else i = Math.max(0, Math.min(items.length - 1, i + (down ? 1 : -1)));
    kbSelectEl(items[i], true);
    return;
  }

  // Everything below acts on the highlighted card, and does nothing if there isn't one.
  const el = kbCurrent();
  if(!el || e.repeat || e.shiftKey) return;
  if(key === 'Enter' && t && t.closest && t.closest('button, a, summary, [role="button"]')) return; // that control's own Enter
  const kind = el.dataset.kind || el.dataset.ctxKind, id = el.dataset.id || el.dataset.ctxId;
  let handled = true;
  if(key === 'Enter'){
    (el.querySelector('.cust-top') || el).click(); // the same tap that opens it by touch
  } else if(lower === 'm'){
    const r = el.getBoundingClientRect();
    showContextMenuFor({el, kind, id}, r.left + 28, r.top + 28, true);
  } else if(lower === 'c'){
    if(kind === 'customer' && el.dataset.cleaned === '1') toast('Already cleaned today'); // a finished card on the Today list
    else if(kind === 'customer') quickClean(id, false); // no text: a desktop usually has no messaging app (the menu has "and send text")
    else if(kind === 'job') toggleJobDone(id);
    else if(kind === 'quote'){ const q = (data.quotes || []).find(x => x.id === id); if(q && q.status !== 'converted') markQuoteAccepted(id); }
    else handled = false;
  } else if(lower === 'p'){
    if(kind === 'customer') quickPaid(id);
    else if(kind === 'job') toggleJobPaid(id);
    else handled = false;
  } else if(lower === 'b'){
    if(kind === 'customer' && el.dataset.cleaned === '1') quickPaid(id);
    else if(kind === 'customer') quickCleanAndPaid(id, false); else handled = false;
  } else if(lower === 'x'){
    if(kind === 'quote'){ const q = (data.quotes || []).find(x => x.id === id); if(q && q.status !== 'converted') markQuoteDeclined(id); } else handled = false;
  } else handled = false;
  if(handled){
    e.preventDefault();
    if(!ctxMenuEl) kbApply(true); // the action redrew the list; keep the highlight on screen
  }
});
