/* 02-today-rounds.js -- Today home tab, route order suggestion, round map, main render() dispatcher, and the Work hub.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- Today briefing ----------
   One screen pulling together everything worth checking first thing: who's
   due for a clean (same definition as the Rounds > Due list), which of those
   need a text before you arrive, any one-off jobs actually dated today, quotes
   overdue for a follow-up, and marketing follow-ups that have come due. */
// Everyone marked "text before you arrive" who's also due for a clean today,
// grouped by round (round names sorted, customers within a round sorted by
// how overdue they are) — used by both the Today screen and the "Text all"
// bulk-send screen so the two stay in sync.
function textBeforeDueList(){
  const today = todayISO();
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  const byRound = {};
  let all = [];
  roundNames.forEach(rn=>{
    const list = rounds[rn].filter(c=>{
      if(c.paused || !c.textBeforeVisit) return false;
      const s = custStatus(c);
      return s.cleanBadge && s.cleanBadge.type==='due';
    }).sort((a,b)=>{
      const daysDueOf = x => { const lc = lastDateOf(x.cleanHistory); return lc ? daysBetween(lc, today) : 0; };
      return daysDueOf(b) - daysDueOf(a);
    });
    if(list.length){ byRound[rn] = list; all = all.concat(list); }
  });
  return {byRound, all};
}
// How many of the "text before visit" list are actually overdue rather than
// just due today. cleanBadge.type is 'due' for both cases (there's no separate
// 'overdue' badge type in the data model — see custStatus) — the distinction
// lives in the badge text ("Due today" vs "Due +N" / "Never cleaned").
function textBeforeOverdueCount(){
  return textBeforeDueList().all.filter(c=>{
    const s = custStatus(c);
    return s.cleanBadge && s.cleanBadge.type==='due' && s.cleanBadge.text !== 'Due today';
  }).length;
}

/* ---------- Today home tab ----------
   The app's landing screen: headline numbers only, each one tap away from the
   existing full screen that actually deals with it (Rounds > Due, Rounds >
   Text first, Rounds > Owed, Jobs, Quotes, Marketing) — kept as a dashboard
   rather than a repeat of those screens' own customer-by-customer lists. */
// Value of cleans and one-off jobs actually completed today — same figures
// as the Daily work done report, just for today specifically.
function valueOfWorkDoneToday(){
  const today = todayISO();
  let total = 0;
  data.customers.forEach(c=>{
    (c.cleanHistory||[]).forEach(e=>{ if(e.date === today) total += Number(e.amount||0); });
  });
  (data.oneOffJobs||[]).forEach(j=>{
    if(j.done && j.date === today) total += Number(j.price||0);
  });
  return total;
}
// Total actually paid in today, across customer payments and paid one-off
// jobs — job amounts go through jobDiscountedTotal so a discounted job's
// payment matches what its receipt/invoice actually said, not the full price.
function valueOfPaymentsReceivedToday(){
  const today = todayISO();
  let total = 0;
  data.customers.forEach(c=>{
    (c.paymentHistory||[]).forEach(p=>{ if(p.date === today) total += Number(p.amount||0); });
  });
  (data.oneOffJobs||[]).forEach(j=>{
    if(j.paid && j.paidDate === today) total += jobDiscountedTotal(j);
  });
  return total;
}
// How many of a single round's customers have been cleaned today — the
// progress figure shown next to the due count once that round is selected on
// the Today tab.
function cleanedTodayCountForRound(rn){
  const today = todayISO();
  return data.customers.filter(c=>(c.round||'Unassigned')===rn && (c.cleanHistory||[]).some(e=>e.date===today)).length;
}
function renderTodayHome(main){
  const today = todayISO();
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));

  // Reset the round the Today tab is tracking at the start of each new day —
  // the same in-memory state persists across re-renders within a day, but a
  // choice made yesterday shouldn't still be scoping today's numbers.
  if(todaySelectedRoundDate !== today){ todaySelectedRound = null; todaySelectedRoundDate = today; }

  let dueCustomers = [];
  const dueByRound = {};
  roundNames.forEach(rn=>{
    const dueCusts = rounds[rn].filter(c=>{
      const s = custStatus(c);
      return !c.paused && s.cleanBadge && s.cleanBadge.type==='due';
    });
    if(dueCusts.length) dueByRound[rn] = dueCusts;
    dueCustomers = dueCustomers.concat(dueCusts);
  });
  // Rounds with anyone due today, busiest first — the list on the hero you
  // pick a round to work from.
  const roundsWithDue = Object.keys(dueByRound).sort((a,b)=> dueByRound[b].length - dueByRound[a].length);

  // A selected round keeps showing (at 0 due) once fully cleaned rather than
  // disappearing from view — dueByRound only lists rounds with 1+ due, so a
  // fully-worked round just falls back to an empty array here, not a reset.
  const heroDueCusts = todaySelectedRound ? (dueByRound[todaySelectedRound]||[]) : dueCustomers;
  const heroDueValue = heroDueCusts.reduce((s,c)=>s+Number(c.price||0),0);
  const heroCleanedToday = todaySelectedRound ? cleanedTodayCountForRound(todaySelectedRound) : null;
  const doneToday = valueOfWorkDoneToday();
  const paidToday = valueOfPaymentsReceivedToday();

  const textBefore = textBeforeDueList();
  const textBeforeOverdue = textBeforeOverdueCount();
  const todaysJobs = (data.oneOffJobs||[]).filter(j=>!j.done && j.date===today);
  const owedCustomers = data.customers.filter(c=>custStatus(c).owed);
  const owedTotal = owedCustomers.reduce((s,c)=>s+custStatus(c).balance,0);
  const followUpQuotes = quotesNeedingFollowUp();
  const quotesWellOverdue = quotesWellOverdueCount();
  const mEntry = todayMileageEntry();
  const mStartText = (mEntry && mEntry.start!=null) ? mEntry.start : 'Tap to log';
  const mFinishText = (mEntry && mEntry.start!=null) ? ((mEntry.end!=null) ? mEntry.end : 'Tap to log') : '—';
  const mTotalText = (mEntry && mEntry.start!=null && mEntry.end!=null) ? (mEntry.end - mEntry.start).toFixed(1) : '—';

  main.innerHTML = `
    <div class="section-label" style="margin-top:0;">${fmtDate(today)}</div>
    <div class="today-hero">
      <div onclick="${todaySelectedRound ? `goToRoundDue('${escapeAttr(todaySelectedRound)}')` : `setTab('rounds'); setRoundsView('due');`}" style="cursor:pointer; display:flex; align-items:flex-start; justify-content:space-between; gap:14px;">
        <div>
          <div style="display:flex; align-items:baseline; gap:16px;">
            <div><div class="num">${heroDueCusts.length}</div><div class="lbl" style="margin-top:2px;">Due</div></div>
            ${heroCleanedToday!=null ? `<div><div class="num" style="font-size:1.75rem;">${heroCleanedToday}</div><div class="lbl" style="margin-top:2px;">Cleaned</div></div>` : ''}
          </div>
          <div class="lbl" style="margin-top:8px; ${todaySelectedRound ? 'color:#fff;' : ''}">${todaySelectedRound ? escapeHtml(todaySelectedRound) : 'Due today'}</div>
          <div class="value">${money(heroDueValue)} value today</div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div class="num" style="font-size:1.5rem;">${money(doneToday)}</div>
          <div class="lbl">Clean total</div>
          <div class="num" style="font-size:1.5rem; margin-top:10px;">${money(paidToday)}</div>
          <div class="lbl">Paid total</div>
        </div>
      </div>
      ${roundsWithDue.length ? `
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.15);">
          ${roundsWithDue.map(rn=>`<span onclick="event.stopPropagation(); selectTodayRound('${escapeAttr(rn)}')" style="cursor:pointer; padding:6px 12px; border-radius:20px; font-size:0.75rem; font-weight:800; white-space:nowrap; ${rn===todaySelectedRound ? 'background:#fff; color:var(--navy);' : 'background:rgba(255,255,255,0.15); color:#fff;'}">${escapeHtml(rn)} · ${dueByRound[rn].length}</span>`).join('')}
        </div>
      ` : ''}
    </div>
    <div class="today-grid">
      <div class="today-tile" onclick="setTab('rounds'); setRoundsView('text');">
        <div class="num">${textBefore.all.length}</div>
        <div class="lbl">Text before visit${textBeforeOverdue ? ` · ${textBeforeOverdue} overdue` : ''}</div>
      </div>
      <div class="today-tile" onclick="openMileageEntry();" style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
        <div style="min-width:0;">
          <div style="font-size:0.8125rem; font-weight:800; color:var(--ink);">Today's Mileage</div>
          <div style="display:flex; gap:12px; margin-top:5px;">
            <div style="font-size:0.6875rem; font-weight:700; color:var(--ink-muted);">Start - ${mStartText}</div>
            <div style="font-size:0.6875rem; font-weight:700; color:var(--ink-muted);">Finish - ${mFinishText}</div>
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div class="num" style="font-size:1.5rem;">${mTotalText}</div>
          <div class="lbl" style="margin-top:2px;">miles</div>
        </div>
      </div>
      <div class="today-tile" onclick="setTab('jobs');">
        <div class="num">${todaysJobs.length}</div>
        <div class="lbl">Jobs today</div>
      </div>
      <div class="today-tile" onclick="setTab('rounds'); setRoundsView('owed');">
        <div class="num">${owedCustomers.length}</div>
        <div class="lbl">Payment reminders${owedCustomers.length ? ` · ${money(owedTotal)}` : ''}</div>
      </div>
      <div class="today-tile" onclick="setTab('quotes');">
        <div class="num">${followUpQuotes.length}</div>
        <div class="lbl">Quotes needing follow-up${quotesWellOverdue ? ` · ${quotesWellOverdue} well overdue` : ''}</div>
      </div>
    </div>
  `;
}

/* ---------- mileage tracking ----------
   data.mileageLog: [{date, start, end}] — one entry per day. Tapping the
   Today tile the first time each day asks for the start reading, tapping it
   again asks for the end reading, and tapping it a third time (once both are
   in) opens a small summary with edit/clear options. */
function todayMileageEntry(){
  data.mileageLog = data.mileageLog || [];
  return data.mileageLog.find(e=>e.date===todayISO());
}
function mileageTileState(entry){
  entry = entry !== undefined ? entry : todayMileageEntry();
  if(!entry || entry.start==null) return 'start';
  if(entry.end==null) return 'end';
  return 'done';
}
function openMileageEntry(forceMode){
  const entry = todayMileageEntry();
  const state = mileageTileState(entry);
  if(!forceMode && state === 'done'){ openMileageSummary(); return; }
  const mode = forceMode || state;
  if(mode === 'end' && (!entry || entry.start==null)){ toast('Log a start reading first'); return; }
  // Suggests picking up where the last logged day left off, so most days it's
  // just confirming a number rather than typing the full odometer reading.
  const priorEntries = (data.mileageLog||[]).filter(e=>e.end!=null && e.date !== todayISO()).sort((a,b)=>b.date.localeCompare(a.date));
  const suggestedStart = mode==='start' && priorEntries.length ? priorEntries[0].end : '';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${mode==='start' ? 'Start of day mileage' : 'End of day mileage'}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Odometer reading now</label>
    <input type="number" id="mileage_input" inputmode="decimal" step="0.1" min="0" value="${mode==='start' ? suggestedStart : (entry && entry.end!=null ? entry.end : '')}" placeholder="e.g. 45210">
    ${mode==='end' ? `<p style="color:var(--ink-muted); font-size:0.75rem; margin:6px 2px 0; line-height:1.5;">Started today at ${entry.start}.</p>` : ''}
    <div class="form-actions">
      <button class="btn-primary" onclick="saveMileageEntry('${mode}')">Save</button>
    </div>
  `, () => setTab('today'));
}
function saveMileageEntry(mode){
  const raw = document.getElementById('mileage_input').value;
  const val = parseFloat(raw);
  if(raw === '' || isNaN(val) || val < 0){ toast('Enter a valid mileage reading'); return; }
  data.mileageLog = data.mileageLog || [];
  const today = todayISO();
  let entry = data.mileageLog.find(e=>e.date===today);
  if(!entry){ entry = {date:today, start:null, end:null}; data.mileageLog.push(entry); }
  if(mode === 'start'){
    entry.start = val;
    saveData();
    toast('Start mileage logged');
  } else {
    if(val < entry.start){ toast('End mileage should be more than the start reading'); return; }
    entry.end = val;
    saveData();
    toast(`${(val - entry.start).toFixed(1)} miles logged for today`);
  }
  closeSheet();
  render();
}
function openMileageSummary(){
  const entry = todayMileageEntry();
  if(!entry || entry.start==null || entry.end==null) return;
  const miles = entry.end - entry.start;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Today's mileage</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div class="summary-overall" style="margin-bottom:16px;">
      <div class="stat"><div class="num">${entry.start}</div><div class="lbl">Start</div></div>
      <div class="stat"><div class="num">${entry.end}</div><div class="lbl">End</div></div>
      <div class="stat"><div class="num">${miles.toFixed(1)}</div><div class="lbl">Miles</div></div>
    </div>
    <button class="btn-open" style="width:100%; margin-bottom:10px;" onclick="openMileageEntry('start')">Edit start reading</button>
    <button class="btn-open" style="width:100%; margin-bottom:14px;" onclick="openMileageEntry('end')">Edit end reading</button>
    <button class="btn-danger-text" onclick="clearTodayMileage()">Clear today's mileage</button>
  `, () => setTab('today'));
}
function clearTodayMileage(){
  appConfirm("Clear today's mileage entry?", {confirmLabel:'Clear', onConfirm: () => {
    const today = todayISO();
    data.mileageLog = (data.mileageLog||[]).filter(e=>e.date!==today);
    saveData();
    toast('Cleared');
    closeSheet();
    render();
  }});
}

function quoteNeedsFollowUp(q, today){
  today = today || todayISO();
  if(!q || q.status !== 'pending' || !q.date) return false;
  const followUpDays = q.followUpDays != null ? q.followUpDays : 7;
  // Each chase already sent (quoteFollowUpCount, bumped by sendQuoteText) widens
  // the window before the next one's due — so a quote just followed up on
  // doesn't immediately show as needing another one the very next day.
  const dueAfter = followUpDays * (1 + (q.quoteFollowUpCount||0));
  return daysBetween(q.date, today) >= dueAfter;
}
function quotesNeedingFollowUp(){
  const today = todayISO();
  return (data.quotes||[]).filter(q => quoteNeedsFollowUp(q, today));
}
// Among quotes already needing a follow-up, how many are well overdue — more
// than double their own follow-up window — worth calling out on the Today tile.
function quotesWellOverdueCount(){
  const today = todayISO();
  return quotesNeedingFollowUp().filter(q=>{
    const followUpDays = q.followUpDays != null ? q.followUpDays : 7;
    return daysBetween(q.date, today) >= followUpDays * 2;
  }).length;
}

// A pending marketing action (a call to make, a text to send again) is only
// "due" for the banner once it has a follow-up date that's arrived — an action
// with no date set (or already marked done) doesn't nag until one is actually due.
function marketingFollowUpsDue(){
  const today = todayISO();
  return data.customers.filter(c =>
    c.marketingNextAction !== 'none' && !c.marketingActionDone &&
    c.marketingFollowUpDate && c.marketingFollowUpDate <= today
  );
}
function dismissMarketingFollowUp(){ marketingFollowUpDismissed = true; renderMarketingFollowUpBanner(); }
function renderMarketingFollowUpBanner(){
  const el = document.getElementById('marketingFollowUpBanner');
  if(!el) return;
  if(marketingFollowUpDismissed){ el.innerHTML = ''; return; }
  const due = marketingFollowUpsDue();
  if(!due.length){ el.innerHTML = ''; return; }
  const first = due[0];
  const actionLabel = (MARKETING_ACTION_OPTIONS[first.marketingNextAction] || '').toLowerCase();
  const label = due.length === 1
    ? `📣 Follow up with ${first.address||first.name||'a customer'} — ${actionLabel}`
    : `📣 ${due.length} marketing follow-ups are due`;
  el.innerHTML = `<div style="background:var(--blue-dim); color:var(--blue-deep); border-radius:12px; padding:11px 14px; margin:0 14px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.8125rem; font-weight:700;">
    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label)}</span>
    <span style="display:flex; gap:8px; flex-shrink:0; align-items:center;">
      <button onclick="setTab('marketing'); dismissMarketingFollowUp();" style="background:var(--blue-deep); color:#fff; border:none; border-radius:8px; padding:6px 10px; font-weight:800; font-size:0.7812rem;">View</button>
      <button onclick="dismissMarketingFollowUp()" style="background:none; border:none; color:var(--blue-deep); font-weight:800; font-size:1rem; line-height:1; padding:0 2px;">✕</button>
    </span>
  </div>`;
}

function jobAnniversariesToday(){
  const today = todayISO();
  return (data.oneOffJobs||[]).map(j=>{
    const years = jobAnniversaryInfo(j, today);
    return years ? Object.assign({}, j, { anniversaryYears: years }) : null;
  }).filter(Boolean);
}
function dismissJobAnniversary(){ jobAnniversaryDismissed = true; renderJobAnniversaryBanner(); }
function renderJobAnniversaryBanner(){
  const el = document.getElementById('jobAnniversaryBanner');
  if(!el) return;
  if(jobAnniversaryDismissed){ el.innerHTML = ''; return; }
  const jobs = jobAnniversariesToday();
  if(!jobs.length){ el.innerHTML = ''; return; }
  const first = jobs[0];
  const yrLabel = y => `${y} year${y===1?'':'s'}`;
  const label = jobs.length === 1
    ? `🎉 ${yrLabel(first.anniversaryYears)} since the job at ${first.address||first.name||'this address'} — worth a follow-up?`
    : `🎉 ${jobs.length} one-off jobs are now 365+ days old — worth a follow-up?`;
  el.innerHTML = `<div style="background:var(--blue-dim); color:var(--blue-deep); border-radius:12px; padding:11px 14px; margin:0 14px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.8125rem; font-weight:700;">
    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label)}</span>
    <span style="display:flex; gap:8px; flex-shrink:0; align-items:center;">
      <button onclick="setTab('jobs'); dismissJobAnniversary();" style="background:var(--blue-deep); color:#fff; border:none; border-radius:8px; padding:6px 10px; font-weight:800; font-size:0.7812rem;">View</button>
      <button onclick="dismissJobAnniversary()" style="background:none; border:none; color:var(--blue-deep); font-weight:800; font-size:1rem; line-height:1; padding:0 2px;">✕</button>
    </span>
  </div>`;
}
function renderImportReviewBanner(){
  const el = document.getElementById('importReviewBanner');
  if(!el) return;
  if(importReviewDismissed){ el.innerHTML = ''; return; }
  const count = data.customers.filter(c => (c.round||'Unassigned') === IMPORT_HOLDING_ROUND).length;
  if(!count){ el.innerHTML = ''; return; }
  const label = `📥 ${count} imported customer${count===1?'':'s'} waiting to be checked and assigned to a round`;
  el.innerHTML = `<div style="background:var(--blue-dim); color:var(--blue-deep); border-radius:12px; padding:11px 14px; margin:0 14px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:0.8125rem; font-weight:700;">
    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label)}</span>
    <span style="display:flex; gap:8px; flex-shrink:0; align-items:center;">
      <button onclick="setTab('rounds'); openRound(IMPORT_HOLDING_ROUND); dismissImportReview();" style="background:var(--blue-deep); color:#fff; border:none; border-radius:8px; padding:6px 10px; font-weight:800; font-size:0.7812rem;">Review</button>
      <button onclick="dismissImportReview()" style="background:none; border:none; color:var(--blue-deep); font-weight:800; font-size:1rem; line-height:1; padding:0 2px;">✕</button>
    </span>
  </div>`;
}
function dismissImportReview(){ importReviewDismissed = true; renderImportReviewBanner(); }

function sortByRoute(custs){
  return custs.slice().sort((a,b)=>{
    const oa = a.order!=null ? a.order : 9999;
    const ob = b.order!=null ? b.order : 9999;
    return oa-ob || (a.address||'').localeCompare(b.address||'');
  });
}
function roundDaysUsed(custs){
  return Array.from(new Set(custs.map(c=>c.visitDay||1))).sort((a,b)=>a-b);
}
function cycleVisitDay(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const cur = c.visitDay || 1;
  c.visitDay = cur >= 5 ? 1 : cur + 1;
  saveData();
  render();
}
function setRoundDayFilter(day){ roundDayFilter = day; render(); }

// Remembers where you were inside Work (which round, which Due/Text/Owed
// view, which day) whenever you step away to another tab — e.g. to quote a
// walk-up customer — so tapping back into Work resumes there instead of
// dumping you back on the hub every time.
let lastWorkView = null;
function setTab(tab){
  if(tab === 'work'){
    if(currentTab === 'rounds' || currentTab === 'jobs'){
      // Already inside Work — tapping Work again means "take me to the hub",
      // the same way tapping an already-active tab elsewhere goes to its root.
      lastWorkView = null;
      currentTab = 'work'; currentRound = null; reorderMode = false; roundFilterMode = 'all'; roundDayFilter = 'all';
    } else if(lastWorkView){
      currentTab = lastWorkView.screen;
      currentRound = lastWorkView.round;
      roundsViewMode = lastWorkView.roundsViewMode;
      roundDayFilter = lastWorkView.roundDayFilter;
      reorderMode = false; roundFilterMode = lastWorkView.roundFilterMode || 'all';
    } else {
      currentTab = 'work'; currentRound = null; reorderMode = false; roundFilterMode = 'all'; roundDayFilter = 'all';
    }
  } else {
    if(currentTab === 'rounds' || currentTab === 'jobs'){
      lastWorkView = { screen: currentTab, round: currentRound, roundsViewMode, roundDayFilter, roundFilterMode };
    }
    currentTab = tab; currentRound = null; reorderMode = false; roundFilterMode = 'all'; roundDayFilter = 'all';
  }
  const activeTabKey = (currentTab === 'rounds' || currentTab === 'jobs') ? 'work' : currentTab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===activeTabKey));
  render();
  window.scrollTo(0, 0);
}
function setRoundsView(v){ roundsViewMode = v; render(); }
function toggleReorder(){ reorderMode = !reorderMode; render(); }
function moveInRound(id, direction){
  const rn = currentRound;
  const custs = sortByRoute(data.customers.filter(c=>(c.round||'Unassigned')===rn));
  const idx = custs.findIndex(c=>c.id===id);
  const swapIdx = direction==='up' ? idx-1 : idx+1;
  if(swapIdx<0 || swapIdx>=custs.length) return;
  const tmp = custs[idx]; custs[idx] = custs[swapIdx]; custs[swapIdx] = tmp;
  custs.forEach((c,i)=>{ c.order = i; });
  saveData(); render();
}

/* ---------- route order suggestion ----------
   A free, on-device alternative to a paid routing API: geocode each customer's
   address once (cached on the customer forever after — see c.lat/c.lng) via
   OpenStreetMap's free Nominatim service (the same one already used elsewhere
   for "use my current location"), then work out a good visiting order using
   straight-line distance between those points, entirely in JavaScript with no
   further network calls. This can't know about one-way streets, rivers, or
   which roads actually connect two addresses, so it's a good starting
   suggestion to review, not a guaranteed-shortest route. */

// Straight-line ("as the crow flies") distance between two points in km.
function haversineKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
// Looks up an address's coordinates via Nominatim. Returns {lat,lng} or null if
// nothing matched or the request failed. Restricted to Great Britain, matching
// the UK-specific assumptions already made elsewhere in the app (phone number
// handling, currency). Callers must space consecutive calls out themselves (see
// suggestRouteOrder) — Nominatim's fair-use policy caps free use at 1 request/sec.
// Matches a UK postcode anywhere in a free-text address string.
const UK_POSTCODE_REGEX = /\b([Gg][Ii][Rr] ?0[Aa]{2}|[A-Za-z][0-9]{1,2} ?[0-9][A-Za-z]{2}|[A-Za-z][A-Za-z][0-9]{1,2} ?[0-9][A-Za-z]{2}|[A-Za-z][0-9][A-Za-z] ?[0-9][A-Za-z]{2}|[A-Za-z][A-Za-z][0-9][A-Za-z] ?[0-9][A-Za-z]{2})\b/;
// api.postcodes.io is a free, unauthenticated UK postcode lookup backed by
// Ordnance Survey/ONS data — it pinpoints a postcode's own precise location,
// rather than matching free text against a place-name index the way Nominatim
// does. That free-text matching is what caused the very wrong (sometimes
// hundreds-of-miles-off) pins: a postcode is unambiguous, so preferring this
// whenever an address contains one fixes almost all of that.
async function geocodePostcode(postcode){
  try{
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g,''))}`);
    if(!res.ok) return null;
    const json = await res.json();
    if(json.status !== 200 || !json.result) return null;
    return { lat: json.result.latitude, lng: json.result.longitude };
  }catch(e){ return null; }
}
async function geocodeAddress(address){
  const postcodeMatch = (address||'').match(UK_POSTCODE_REGEX);
  if(postcodeMatch){
    const viaPostcode = await geocodePostcode(postcodeMatch[0]);
    if(viaPostcode) return viaPostcode;
    // Postcode present but not recognised (typo, or too new for the postcode
    // database) — fall through to the free-text search below instead.
  }
  try{
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&q=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if(!res.ok) return null;
    const results = await res.json();
    if(!results || !results.length) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  }catch(e){ return null; }
}
// Nearest-neighbour route starting from points[startIdx], refined with a 2-opt
// pass (repeatedly reversing a stretch of the route if doing so shortens it) —
// a cheap, well-known way to get a genuinely decent stop order for a modest
// number of points. Returns an array of indices into `points`, in visiting order.
function computeRouteOrder(points, startIdx){
  const n = points.length;
  if(n <= 1) return points.map((_,i)=>i);
  // Still respect the requested starting point even with nothing to optimise —
  // with exactly 2 stops there's only one possible order once you fix which one
  // comes first, but which one that is still matters (e.g. whichever's closer
  // to the current location).
  if(n === 2) return startIdx === 0 ? [0,1] : [1,0];
  const visited = new Array(n).fill(false);
  const order = [startIdx];
  visited[startIdx] = true;
  for(let step=1; step<n; step++){
    const last = points[order[order.length-1]];
    let bestIdx = -1, bestDist = Infinity;
    for(let i=0;i<n;i++){
      if(visited[i]) continue;
      const d = haversineKm(last.lat,last.lng,points[i].lat,points[i].lng);
      if(d < bestDist){ bestDist = d; bestIdx = i; }
    }
    order.push(bestIdx);
    visited[bestIdx] = true;
  }
  let improved = true, guard = 0;
  while(improved && guard < 40){
    improved = false; guard++;
    for(let i=1;i<order.length-2;i++){
      for(let j=i+1;j<order.length-1;j++){
        const before = haversineKm(points[order[i-1]].lat,points[order[i-1]].lng,points[order[i]].lat,points[order[i]].lng)
                      + haversineKm(points[order[j]].lat,points[order[j]].lng,points[order[j+1]].lat,points[order[j+1]].lng);
        const after = haversineKm(points[order[i-1]].lat,points[order[i-1]].lng,points[order[j]].lat,points[order[j]].lng)
                     + haversineKm(points[order[i]].lat,points[order[i]].lng,points[order[j+1]].lat,points[order[j+1]].lng);
        if(after + 1e-9 < before){
          let lo=i, hi=j;
          while(lo<hi){ const t=order[lo]; order[lo]=order[hi]; order[hi]=t; lo++; hi--; }
          improved = true;
        }
      }
    }
  }
  return order;
}
// Entry point from the round actions menu. Geocodes whatever isn't already
// cached (one request at a time, a beat apart), then previews a suggested
// order for review — nothing about the round actually changes until the user
// taps "Use this order".
// Real road-based route ordering via OSRM's public Trip service — solves the
// visiting-order problem itself using actual OpenStreetMap road data, so it's
// tried first as the most accurate free option available. Free public demo
// server (no API key), fair-use only — same policy shape as Nominatim above:
// reasonable personal-scale use, no uptime guarantee, may be withdrawn at any
// time. Points are reordered so the desired start is always sent first, since
// OSRM's `source=first` only pins whichever coordinate is literally first in
// the request — the response is then mapped back to the original indices.
// Returns an array of indices into `points` in visiting order, or null if the
// service couldn't be reached, timed out, or didn't return a usable answer.
async function getOsrmTripOrder(points, startIdx){
  try{
    const reordered = [startIdx, ...points.map((_,i)=>i).filter(i=>i!==startIdx)];
    const coordStr = reordered.map(i=>`${points[i].lng},${points[i].lat}`).join(';');
    const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?source=first&roundtrip=false&overview=false`;
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 8000);
    const res = await fetch(url, {signal: controller.signal});
    clearTimeout(timer);
    if(!res.ok) return null;
    const data = await res.json();
    if(data.code !== 'Ok' || !data.waypoints || !data.waypoints.length) return null;
    // Each returned waypoint corresponds, in order, to a coordinate we sent
    // (`reordered`); its own waypoint_index says where that stop falls in the
    // route OSRM worked out.
    const withRank = data.waypoints.map((wp,sentPos)=>({origIdx: reordered[sentPos], rank: wp.waypoint_index}));
    withRank.sort((a,b)=>a.rank-b.rank);
    return withRank.map(w=>w.origIdx);
  }catch(e){ return null; }
}
// Second choice if OSRM's demo server is unreachable — Valhalla's public demo
// server, also free and fair-use only, also hosted by the FOSSGIS project,
// offering an equivalent "work out the order for me" endpoint over real roads.
async function getValhallaTripOrder(points, startIdx){
  try{
    const reordered = [startIdx, ...points.map((_,i)=>i).filter(i=>i!==startIdx)];
    const locations = reordered.map(i=>({lat:points[i].lat, lon:points[i].lng}));
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), 8000);
    const res = await fetch('https://valhalla1.openstreetmap.de/optimized_route', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({locations, costing:'auto'}),
      signal: controller.signal
    });
    clearTimeout(timer);
    if(!res.ok) return null;
    const data = await res.json();
    const locs = data && data.trip && data.trip.locations;
    if(!locs || !locs.length) return null;
    // Valhalla returns locations already in the order it worked out, each
    // carrying the position it originally came from in our request.
    return locs.map(l => reordered[l.original_index]);
  }catch(e){ return null; }
}
async function suggestRouteOrder(rn){
  let custs = sortByRoute(data.customers.filter(c=>(c.round||'Unassigned')===rn && !c.paused));
  const days = roundDaysUsed(custs);
  if(days.length > 1){
    if(roundDayFilter === 'all'){
      toast('This round spans multiple days — pick a day above first');
      return;
    }
    custs = custs.filter(c=>(c.visitDay||1) === roundDayFilter);
  }
  const withAddress = custs.filter(c=>c.address);
  const withoutAddress = custs.filter(c=>!c.address);
  if(withAddress.length < 2){ toast('Need at least 2 addresses to suggest an order'); return; }
  closeSheet();

  // Re-fetches every address rather than trusting a previously cached
  // location — a bad geocode (wrong postcode match, ambiguous place name)
  // would otherwise stay wrong forever once cached. Skips anyone whose pin
  // has already been dragged and locked on the map, since re-fetching would
  // just overwrite a correction the user already made.
  const toGeocode = withAddress.filter(c=>!c.latLocked);
  for(let i=0;i<toGeocode.length;i++){
    toast(`Locating addresses… ${i+1} of ${toGeocode.length}`);
    const coords = await geocodeAddress(toGeocode[i].address);
    if(coords){ toGeocode[i].lat = coords.lat; toGeocode[i].lng = coords.lng; }
    if(i < toGeocode.length-1) await new Promise(r=>setTimeout(r, 1100));
  }
  if(toGeocode.length) saveData(); // cache whatever was found, even if this suggestion isn't applied

  const located = withAddress.filter(c=>c.lat!=null && c.lng!=null);
  const notLocated = withAddress.filter(c=>c.lat==null || c.lng==null).concat(withoutAddress);
  if(located.length < 2){ toast('Could not locate enough addresses to suggest an order'); return; }

  // Start from wherever the phone currently is, if it'll share that — makes the
  // suggestion "best order from here" rather than an arbitrary starting point.
  let startIdx = 0;
  const gotLocation = await new Promise(resolve=>{
    if(!navigator.geolocation){ resolve(null); return; }
    const timer = setTimeout(()=>resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(pos=>{
      clearTimeout(timer);
      resolve({lat:pos.coords.latitude, lng:pos.coords.longitude});
    }, ()=>{ clearTimeout(timer); resolve(null); }, {enableHighAccuracy:true, timeout:3500});
  });
  if(gotLocation){
    let bestDist = Infinity;
    located.forEach((c,i)=>{
      const d = haversineKm(gotLocation.lat, gotLocation.lng, c.lat, c.lng);
      if(d < bestDist){ bestDist = d; startIdx = i; }
    });
  }

  const points = located.map(c=>({lat:c.lat, lng:c.lng}));
  toast('Working out the best route…');
  let order = await getOsrmTripOrder(points, startIdx);
  let method = 'osrm';
  if(!order){
    order = await getValhallaTripOrder(points, startIdx);
    method = 'valhalla';
  }
  if(!order){
    order = computeRouteOrder(points, startIdx);
    method = 'straight-line';
  }
  renderSuggestedRoutePreview(rn, order.map(i=>located[i]), notLocated, !!gotLocation, method);
}
let suggestedRouteState = null;
function renderSuggestedRoutePreview(rn, orderedCusts, notLocated, usedCurrentLocation, method){
  suggestedRouteState = { rn, orderedIds: orderedCusts.map(c=>c.id), notLocatedIds: notLocated.map(c=>c.id) };
  const methodText = method === 'straight-line'
    ? `${usedCurrentLocation ? 'Worked out from your current location, based' : 'Based'} on straight-line distance between addresses — the road-routing service wasn't reachable just now, so this is a fallback estimate. It can't know about one-way streets or which roads actually connect two places, so use your own judgement too.`
    : `Worked out ${usedCurrentLocation ? 'from your current location, ' : ''}using real road distances via ${method==='osrm'?'OSRM':'Valhalla'} (a free OpenStreetMap-based routing service) — more accurate than a straight-line guess, though still worth a sanity check before setting off.`;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Suggested order</h2>
      <button class="sheet-close" onclick="suggestedRouteState=null; closeSheet();">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 14px; line-height:1.5;">
      ${methodText}
    </p>
    ${orderedCusts.map((c,i)=>`
      <div class="cust-card" style="display:flex; align-items:center; gap:10px;">
        <div style="width:26px; height:26px; border-radius:50%; background:var(--blue-dim); color:var(--blue-deep); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8125rem; flex-shrink:0;">${i+1}</div>
        <div class="cust-addr" style="font-weight:800; font-size:0.9062rem; min-width:0;">${escapeHtml(c.address||c.name||'Customer')}</div>
      </div>
    `).join('')}
    ${notLocated.length ? `<p style="color:var(--ink-muted); font-size:0.75rem; margin:14px 2px 0; line-height:1.5;">${notLocated.length} customer${notLocated.length===1?'':'s'} couldn't be placed (no address, or the address couldn't be found) — they'll be added to the end of the order, unchanged otherwise.</p>` : ''}
    <div class="form-actions">
      <button class="btn-primary" onclick="applySuggestedRouteOrder()">Use this order</button>
    </div>
  `, () => { suggestedRouteState = null; openRound(rn); });
}
function applySuggestedRouteOrder(){
  if(!suggestedRouteState) return;
  const { rn, orderedIds, notLocatedIds } = suggestedRouteState;
  let i = 0;
  orderedIds.forEach(id=>{
    const c = data.customers.find(x=>x.id===id);
    if(c) c.order = i++;
  });
  // Anyone who couldn't be placed keeps their relative order among themselves
  // (same address-alphabetical fallback sortByRoute already uses) but goes at
  // the very end, so the round stays complete rather than losing them.
  sortByRoute(notLocatedIds.map(id=>data.customers.find(x=>x.id===id)).filter(Boolean)).forEach(c=>{ c.order = i++; });
  suggestedRouteState = null;
  saveData();
  closeSheet();
  openRound(rn);
  toast('New route order applied');
}

/* ---------- round map ----------
   Shows every customer on a round as a numbered pin (in the round's current
   visiting order, not a re-optimised one) with a route line connecting them.
   Every address gets a pin, even one that fails to geocode — it's placed as
   a best-guess cluster near the round's other pins, clearly marked, so it's
   still visible and can be dragged to the right spot. Dragging any pin locks
   that customer's location so future map/route requests leave it alone. */
let roundMapLeafletInstance = null;
let roundMapRouteLine = null;
async function showRoundMap(rn){
  let custs = sortByRoute(data.customers.filter(c=>(c.round||'Unassigned')===rn && !c.paused));
  const days = roundDaysUsed(custs);
  if(days.length > 1){
    if(roundDayFilter === 'all'){
      toast('This round spans multiple days — pick a day above first');
      return;
    }
    custs = custs.filter(c=>(c.visitDay||1) === roundDayFilter);
  }
  const withAddress = custs.filter(c=>c.address);
  if(!withAddress.length){ toast('No addresses on this round to map'); return; }

  // Skips anyone whose pin has already been dragged and locked — re-fetching
  // would just overwrite a correction the user already made.
  const toGeocode = withAddress.filter(c=>!c.latLocked);
  for(let i=0;i<toGeocode.length;i++){
    toast(`Locating addresses… ${i+1} of ${toGeocode.length}`);
    const coords = await geocodeAddress(toGeocode[i].address);
    if(coords){ toGeocode[i].lat = coords.lat; toGeocode[i].lng = coords.lng; }
    if(i < toGeocode.length-1) await new Promise(r=>setTimeout(r, 1100));
  }
  if(toGeocode.length) saveData();

  const located = withAddress.filter(c=>c.lat!=null && c.lng!=null);
  const failed = withAddress.filter(c=>c.lat==null || c.lng==null);
  if(!located.length){ toast('Could not locate any addresses on this round'); return; }

  // Everyone still gets a pin — anyone who failed to geocode is placed in a
  // small ring around the round's other pins (never saved as a real location)
  // rather than left off the map, and marked as approximate so it's obvious
  // it needs dragging into place.
  const fallbackCoords = new Map();
  if(failed.length){
    const centerLat = located.reduce((s,c)=>s+c.lat,0)/located.length;
    const centerLng = located.reduce((s,c)=>s+c.lng,0)/located.length;
    failed.forEach((c,i)=>{
      const angle = (i / failed.length) * Math.PI * 2;
      fallbackCoords.set(c.id, { lat: centerLat + Math.cos(angle)*0.003, lng: centerLng + Math.sin(angle)*0.003 });
    });
  }

  renderRoundMapSheet(rn, withAddress, fallbackCoords);
}
function destroyRoundMap(){
  if(roundMapLeafletInstance){ roundMapLeafletInstance.remove(); roundMapLeafletInstance = null; }
  roundMapRouteLine = null;
}
function renderRoundMapSheet(rn, customers, fallbackCoords){
  const approxCount = fallbackCoords.size;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(rn)} — map</h2>
      <button class="sheet-close" onclick="destroyRoundMap(); closeSheet();">✕</button>
    </div>
    ${approxCount ? `<p style="color:var(--amber); font-size:0.75rem; margin:0 2px 10px; line-height:1.4; font-weight:700;">📍 ${approxCount} address${approxCount===1?'':'es'} couldn't be found automatically — shown as a grey dashed pin near the others. Drag ${approxCount===1?'it':'them'} to the right spot to fix.</p>` : ''}
    <div id="roundMapEl" style="height:min(65vh, 520px); border-radius:14px; overflow:hidden; background:var(--surface); border:1px solid var(--box-border); margin-bottom:12px;"></div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 14px; line-height:1.4;">Numbered in your current visiting order. Tap a pin for the address, or drag any pin to correct its spot — dragging locks it there so it won't move again.</p>
    <button class="btn btn-primary" style="width:100%;" onclick="startRoundDirections('${escapeAttr(rn)}')">Start round — directions</button>
  `, destroyRoundMap);
  // The sheet needs to finish laying out (real, non-zero size) before Leaflet
  // measures its container, or the map renders as a grey box.
  setTimeout(()=> initRoundMapLeaflet(customers, fallbackCoords), 50);
}
function roundMapPinIcon(num, isApprox){
  return L.divIcon({
    className: 'round-map-pin',
    html: `<div style="background:${isApprox ? '#8A97A3' : '#10344C'}; color:#fff; width:26px; height:26px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.35); border:2px solid #fff; ${isApprox ? 'border-style:dashed;' : ''}"><span style="transform:rotate(45deg); font-weight:800; font-size:0.75rem;">${num}</span></div>`,
    iconSize: [26,26], iconAnchor: [13,26]
  });
}
function initRoundMapLeaflet(customers, fallbackCoords){
  const el = document.getElementById('roundMapEl');
  if(!el) return; // sheet was closed again before this fired
  if(typeof L === 'undefined'){
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--ink-muted); font-size:0.8125rem;">Map could not load — check your connection and try again.</div>';
    return;
  }
  destroyRoundMap();
  const map = L.map(el, { zoomControl:true });
  roundMapLeafletInstance = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const pointOf = c => fallbackCoords.has(c.id) ? fallbackCoords.get(c.id) : {lat:c.lat, lng:c.lng};

  customers.forEach((c,i)=>{
    const isApprox = fallbackCoords.has(c.id);
    const pos = pointOf(c);
    const marker = L.marker([pos.lat, pos.lng], {icon: roundMapPinIcon(i+1, isApprox), draggable:true}).addTo(map)
      .bindPopup(`<b>${i+1}. ${escapeHtml(c.address||c.name||'Customer')}</b>${isApprox ? '<br><span style="color:#8A97A3;">Approximate — drag to the right spot</span>' : ''}`);
    marker.on('dragend', (e)=>{
      const p = e.target.getLatLng();
      c.lat = p.lat; c.lng = p.lng; c.latLocked = true;
      fallbackCoords.delete(c.id);
      saveData();
      marker.setIcon(roundMapPinIcon(i+1, false));
      marker.setPopupContent(`<b>${i+1}. ${escapeHtml(c.address||c.name||'Customer')}</b>`);
      toast('Location saved — locked so it stays put next time');
      redrawRoundMapRoute(customers, fallbackCoords, map);
    });
  });

  redrawRoundMapRoute(customers, fallbackCoords, map);
  const latlngs = customers.map(c=>{ const p = pointOf(c); return [p.lat, p.lng]; });
  if(latlngs.length > 1) map.fitBounds(L.latLngBounds(latlngs), {padding:[30,30]});
  else map.setView(latlngs[0], 15);
}
function redrawRoundMapRoute(customers, fallbackCoords, map){
  if(roundMapRouteLine){ roundMapRouteLine.remove(); roundMapRouteLine = null; }
  if(customers.length < 2) return;
  const pointOf = c => fallbackCoords.has(c.id) ? fallbackCoords.get(c.id) : {lat:c.lat, lng:c.lng};
  const latlngs = customers.map(c=>{ const p = pointOf(c); return [p.lat, p.lng]; });
  // Draw a straight-line route immediately (always available), then try to
  // upgrade it to a real road-following line in the background — same
  // road-routing-with-a-fallback approach as "Suggest a route order".
  roundMapRouteLine = L.polyline(latlngs, {color:'#2F9BDE', weight:4, opacity:0.7, dashArray:'6 8'}).addTo(map);
  const thisLine = roundMapRouteLine;
  getOsrmRouteGeometry(customers.map(c=>pointOf(c))).then(roadGeometry=>{
    if(roadGeometry && roundMapLeafletInstance === map && roundMapRouteLine === thisLine){
      thisLine.remove();
      roundMapRouteLine = L.polyline(roadGeometry, {color:'#2F9BDE', weight:4, opacity:0.85}).addTo(map);
    }
  });
}
// Traces an actual road route through the given points, in the order given
// (unlike getOsrmTripOrder above, which is allowed to reorder them) — used to
// draw the route line on the map. Returns null on any failure so the caller
// can fall back to the straight-line version already on screen.
async function getOsrmRouteGeometry(points){
  try{
    const coordStr = points.map(p=>`${p.lng},${p.lat}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`);
    if(!res.ok) return null;
    const json = await res.json();
    if(json.code !== 'Ok' || !json.routes || !json.routes[0]) return null;
    return json.routes[0].geometry.coordinates.map(([lng,lat])=>[lat,lng]);
  }catch(e){ return null; }
}

/* ---------- rendering ---------- */
function render(){
  renderBackupBanner();
  renderLastActionBanner();
  renderMarketingFollowUpBanner();
  renderJobAnniversaryBanner();
  renderImportReviewBanner();
  const main = document.getElementById('main');
  main.innerHTML = '';

  if(currentTab === 'today'){
    renderTodayHome(main);
  } else if(currentTab === 'work'){
    renderWorkHub(main);
  } else if(currentTab === 'rounds' && !currentRound){
    renderRoundsList(main);
  } else if(currentTab === 'rounds' && currentRound){
    renderRoundDetail(main, currentRound);
  } else if(currentTab === 'jobs'){
    renderJobs(main);
  } else if(currentTab === 'quotes'){
    renderQuotes(main);
  } else if(currentTab === 'marketing'){
    renderMarketing(main);
  }
}

// Compact "avg price by property type" row, shown under the Customers/Round
// value/Avg-per-customer stats — both for the all-rounds overview and for a
// single round's own summary (the caller passes in whichever customer list
// applies, already filtered to active/non-paused customers). Square boxes to
// match the stats row above them; short labels so several fit without wrapping.
const PROPERTY_TYPE_ABBR = {'Detached':'Det', 'Semi-detached':'Semi', 'Terraced':'Terr', 'Bungalow':'Bung', 'Flat':'Flat', 'Not recorded':'NA'};
// A fronts-only clean is a fraction of a full house clean, so it only counts
// as half a house when working out average prices by property type —
// otherwise a handful of cheap fronts-only jobs would drag the average down
// as if they were full cleans.
function houseWeight(c){ return c.frontsOnly ? 0.5 : 1; }
// Median £-per-house across a round's active (non-paused) customers — a
// house-weighted figure (via houseWeight) so fronts-only customers don't skew
// it the way a flat per-customer average would. Used to flag anyone priced
// well below what the rest of the round is actually getting.
function roundMedianPricePerHouse(roundName){
  const values = data.customers
    .filter(c=>!c.paused && (c.round||'Unassigned')===roundName)
    .map(c=> Number(c.price||0) / houseWeight(c))
    .sort((a,b)=>a-b);
  if(!values.length) return null;
  const mid = Math.floor(values.length/2);
  return values.length % 2 ? values[mid] : (values[mid-1]+values[mid])/2;
}
function formatHouseCount(w){ return Number.isInteger(w) ? String(w) : w.toFixed(1); }
function propertyTypeAvgSummaryHtml(list){
  if(!list || !list.length) return '';
  const categories = [...PROPERTY_TYPES, 'Not recorded'];
  const rows = categories.map(cat=>{
    const inCat = list.filter(c => (c.propertyType || 'Not recorded') === cat);
    if(!inCat.length) return null;
    const weight = inCat.reduce((s,c)=>s+houseWeight(c), 0);
    const total = inCat.reduce((s,c)=>s+Number(c.price||0),0);
    const avg = weight ? total/weight : 0;
    return {cat, weight, avg};
  }).filter(Boolean);
  if(!rows.length) return '';
  return `<div class="summary-overall" style="flex-wrap:wrap;">
    ${rows.map(r=>`<div class="stat" style="flex:1 1 72px; min-width:72px;"><div class="num">${money(r.avg)}</div><div class="lbl">${escapeHtml(PROPERTY_TYPE_ABBR[r.cat]||r.cat)} (${formatHouseCount(r.weight)})</div></div>`).join('')}
  </div>`;
}

/* ---------- Work hub ----------
   Landing page for the Work tab: two square buttons for Rounds and One-off
   jobs (previously their own tabs), with the overall money info that used to
   sit at the top of the Rounds screen moved to sit underneath them. */
function renderWorkHub(main){
  const activeCustomers = data.customers.filter(c=>!c.paused);
  const totalCustomers = activeCustomers.length;
  const totalValue = activeCustomers.reduce((sum,c)=>sum+Number(c.price||0),0);
  const totalOwed = activeCustomers.reduce((sum,c)=>{ const s=custStatus(c); return sum + (s.owed ? s.balance : 0); },0);
  const overallAvg = totalCustomers ? totalValue/totalCustomers : 0;

  const openJobsCount = (data.oneOffJobs||[]).filter(j=>!j.done).length;

  let html = `<div class="today-grid" style="margin-bottom:16px;">
    <button class="today-tile" style="text-align:center; cursor:pointer;" onclick="setTab('rounds')">
      <div class="num" style="font-size:1.375rem;">🧹</div>
      <div class="lbl" style="font-size:0.875rem; margin-top:8px; color:var(--ink);">Rounds</div>
    </button>
    <button class="today-tile" style="text-align:center; cursor:pointer;" onclick="setTab('jobs')">
      <div class="num" style="font-size:1.375rem;">🧰</div>
      <div class="lbl" style="font-size:0.875rem; margin-top:8px; color:var(--ink);">One-off jobs${openJobsCount ? ` (${openJobsCount})` : ''}</div>
    </button>
  </div>`;

  if(data.customers.length){
    html += `<div class="summary-overall">
      <div class="stat"><div class="num">${totalCustomers}</div><div class="lbl">Customers</div></div>
      <div class="stat"><div class="num">${roundValueOwedHtml(totalValue, totalOwed)}</div><div class="lbl">Round value</div></div>
      <div class="stat"><div class="num">${money(overallAvg)}</div><div class="lbl">Avg / customer</div></div>
    </div>
    ${propertyTypeAvgSummaryHtml(activeCustomers)}`;
  }
  main.innerHTML = html;
}

function renderRoundsList(main){
  const rounds = groupByRound(data.customers);
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));

  let html = `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:8px;">
    <button class="btn-open" style="width:auto; padding:8px 14px; display:inline-flex; gap:6px; align-items:center;" onclick="setTab('work')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 6l-6 6 6 6"/></svg> Work
    </button>
    <div style="display:flex; align-items:center; gap:8px;">
      ${mainScreenHelpBtn('rounds', "()=>setTab('rounds')")}
      <button class="btn-open" style="width:38px; height:38px; padding:0;" onclick="openPhotoGallery()" aria-label="Photo gallery">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
      </button>
      <button class="btn-open" style="width:38px; height:38px; padding:0;" onclick="openRoundReports()" aria-label="Print reports">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      </button>
    </div>
  </div>`;
  html += `<div class="seg-row">
    <button class="seg-btn ${roundsViewMode==='overview'?'active':''}" onclick="setRoundsView('overview')">Rounds</button>
    <button class="seg-btn ${roundsViewMode==='due'?'active':''}" onclick="setRoundsView('due')">Due</button>
    <button class="seg-btn ${roundsViewMode==='text'?'active':''}" onclick="setRoundsView('text')">Text first</button>
    <button class="seg-btn ${roundsViewMode==='owed'?'active':''}" onclick="setRoundsView('owed')">Owed</button>
  </div>`;

  if(!roundNames.length){
    main.innerHTML = html + emptyState('rounds');
    return;
  }

  if(roundsViewMode === 'overview'){
    html += `<div class="section-label">Your rounds</div>`;
    let grandCustomers = 0, grandValue = 0, grandOwed = 0;
    roundNames.forEach(rn=>{
      const all = rounds[rn];
      const activeAll = all.filter(c=>!c.paused);
      let activeValue = 0, activeOwed = 0, due=0, owed=0, paused=0;
      all.forEach(c=>{
        const s = custStatus(c);
        if(c.paused){ paused++; return; }
        activeValue += Number(c.price||0);
        if(s.owed) activeOwed += s.balance;
        if(s.cleanBadge && s.cleanBadge.type==='due') due++;
        if(s.owed) owed++;
      });
      grandCustomers += activeAll.length;
      grandValue += activeValue;
      grandOwed += activeOwed;
      const daysUsed = roundDaysUsed(all);
      html += `<div class="round-card" onclick="openRound('${escapeAttr(rn)}')">
        <div>
          <div class="rname">${escapeHtml(rn)}</div>
          <div class="rcount">${activeAll.length} customer${activeAll.length===1?'':'s'} · ${roundValueOwedHtml(activeValue, activeOwed)}${daysUsed.length>1?` · ${daysUsed.length} days`:''}</div>
        </div>
        <div class="badges">
          ${due?`<span class="badge due">${due} due</span>`:''}
          ${owed?`<span class="badge owed">${owed} owe</span>`:''}
          ${paused?`<span class="badge paused">${paused} paused</span>`:''}
          ${(!due&&!owed)?`<span class="badge ok">All clear</span>`:''}
          <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
        </div>
      </div>`;
    });
    html += listTotalHtml(`${roundNames.length} round${roundNames.length===1?'':'s'} · ${grandCustomers} customer${grandCustomers===1?'':'s'} · ${roundValueOwedHtml(grandValue, grandOwed)}`);
  } else if(roundsViewMode === 'due'){
    let anyDue = false;
    let dueGrandCount = 0, dueGrandValue = 0;
    roundNames.forEach(rn=>{
      const dueCusts = rounds[rn].filter(c=>{
        const s = custStatus(c);
        return !c.paused && s.cleanBadge && s.cleanBadge.type==='due';
      }).sort((a,b)=>{
        const daysDueOf = x => { const lc = lastDateOf(x.cleanHistory); return lc ? daysBetween(lc, todayISO()) : 0; };
        return daysDueOf(b) - daysDueOf(a);
      });
      if(!dueCusts.length) return;
      anyDue = true;
      dueGrandCount += dueCusts.length;
      dueGrandValue += dueCusts.reduce((s,c)=>s+Number(c.price||0),0);
      const anyPhone = dueCusts.some(c=>isMobileNumber(c.phone));
      html += `<div class="round-group-header" style="display:flex; align-items:center; justify-content:space-between; margin:18px 2px 8px;">
        <div class="section-label" style="margin:0; cursor:pointer;" onclick="goToRoundDue('${escapeAttr(rn)}')">${escapeHtml(rn)} <span style="font-weight:600; color:var(--ink-muted); text-transform:none; letter-spacing:0;">(${dueCusts.length})</span></div>
        ${anyPhone ? `<button onclick="openBulkReminders('due','${escapeAttr(rn)}')" style="background:none; border:none; color:var(--blue); font-size:0.75rem; font-weight:800;">✉️ Remind all</button>` : ''}
      </div>`;
      html += dueCusts.map(custCardHtml).join('');
    });
    if(!anyDue){
      html += `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M20 6L9 17l-5-5"/></svg>
        <b>Nobody's due</b>
        <p>Everyone's cleaned on schedule.</p>
      </div>`;
    } else {
      html += listTotalHtml(`${dueGrandCount} due · ${money(dueGrandValue)}`);
    }
  } else if(roundsViewMode === 'text'){
    const { byRound, all } = textBeforeDueList();
    if(!all.length){
      html += `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M20 6L9 17l-5-5"/></svg>
        <b>Nobody to text</b>
        <p>No one due for a clean today needs a text before you arrive.</p>
      </div>`;
    } else {
      html += `<div style="display:flex; justify-content:flex-end; margin:0 2px 10px;">
        <button onclick="openBulkTextBeforeVisit()" style="background:var(--blue-deep); color:#fff; border:none; border-radius:8px; padding:8px 16px; font-weight:800; font-size:0.8125rem;">Text all</button>
      </div>`;
      Object.keys(byRound).forEach(rn=>{
        html += `<div class="section-label" style="margin:14px 2px 8px;">${escapeHtml(rn)} <span style="font-weight:600; color:var(--ink-muted); text-transform:none; letter-spacing:0;">(${byRound[rn].length})</span></div>`;
        html += byRound[rn].map(custCardHtml).join('');
      });
      html += listTotalHtml(`${all.length} to text`);
    }
  } else if(roundsViewMode === 'owed'){
    let anyOwed = false;
    let grandTotal = 0;
    let owedGrandCount = 0;
    roundNames.forEach(rn=>{
      const owedCusts = rounds[rn].filter(c=>custStatus(c).owed)
        .sort((a,b)=> (daysSinceLastPayment(b)-daysSinceLastPayment(a)) || (custStatus(b).balance-custStatus(a).balance));
      if(!owedCusts.length) return;
      anyOwed = true;
      owedGrandCount += owedCusts.length;
      const roundTotal = owedCusts.reduce((s,c)=>s+custStatus(c).balance,0);
      grandTotal += roundTotal;
      const anyPhone = owedCusts.some(c=>isMobileNumber(c.phone));
      html += `<div class="round-group-header" style="display:flex; align-items:center; justify-content:space-between; margin:18px 2px 8px;">
        <div class="section-label" style="margin:0;">${escapeHtml(rn)} <span style="font-weight:600; color:var(--ink-muted); text-transform:none; letter-spacing:0;">(owing ${money(roundTotal)})</span></div>
        ${anyPhone ? `<button onclick="openBulkReminders('owed','${escapeAttr(rn)}')" style="background:none; border:none; color:var(--blue); font-size:0.75rem; font-weight:800;">✉️ Remind all</button>` : ''}
      </div>`;
      html += owedCusts.map(custCardHtml).join('');
    });
    if(!anyOwed){
      html += `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M20 6L9 17l-5-5"/></svg>
        <b>Nobody owes anything</b>
        <p>Everyone's paid up.</p>
      </div>`;
    } else {
      html += listTotalHtml(`${owedGrandCount} owing · Total owed: ${money(grandTotal)}`);
    }
  }

  main.innerHTML = html;
}

function openRound(rn){ currentRound = rn; reorderMode = false; roundFilterMode = 'all'; roundDayFilter = 'all'; render(); window.scrollTo(0, 0); }
// Same as openRound, but opens straight into that round's Due filter — used
// by the round-name headers on the Rounds > Due overview list.
function goToRoundDue(rn){ currentRound = rn; reorderMode = false; roundFilterMode = 'due'; roundDayFilter = 'all'; render(); window.scrollTo(0, 0); }
// Tapping a round chip on the Today hero both jumps straight to that round's
// Due list (goToRoundDue) and remembers the choice so the Today tab itself
// stays scoped to that round next time you're back on it — see
// todaySelectedRound above for how/when that resets.
function selectTodayRound(rn){
  todaySelectedRound = rn;
  todaySelectedRoundDate = todayISO();
  goToRoundDue(rn);
}
function backToRounds(){ currentRound = null; reorderMode = false; roundFilterMode = 'all'; roundDayFilter = 'all'; render(); window.scrollTo(0, 0); }
function setRoundFilterMode(v){ roundFilterMode = v; render(); }

function openRoundActionsMenu(rn){
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(rn)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <button class="backup-btn" onclick="startRoundDirections('${escapeAttr(rn)}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <div><div class="t1">Start round — directions</div><div class="t2">Opens Google Maps with every stop queued up, in your current order</div></div>
    </button>
    <button class="backup-btn" onclick="closeSheet(); showRoundMap('${escapeAttr(rn)}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
      <div><div class="t1">Show map</div><div class="t2">See every stop and the route between them</div></div>
    </button>
    <button class="backup-btn" onclick="printSingleRound('${escapeAttr(rn)}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      <div><div class="t1">Print this round</div><div class="t2">Customer list with contact details and prices</div></div>
    </button>
    <button class="backup-btn" onclick="nudgeRoundDue('${escapeAttr(rn)}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div><div class="t1">Defer whole round 4 weeks</div><div class="t2">Push every active customer's due date back at once</div></div>
    </button>
    <button class="backup-btn" onclick="openFocusedHelp('rounds', ()=>openRoundActionsMenu('${escapeAttr(rn)}'))">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div><div class="t1">Help</div><div class="t2">How rounds work</div></div>
    </button>
  `);
}

function renderRoundDetail(main, rn){
  const allInRound = sortByRoute(data.customers.filter(c=>(c.round||'Unassigned')===rn));
  const daysUsed = roundDaysUsed(allInRound);
  const spansMultipleDays = daysUsed.length > 1;

  let shellHtml = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:8px;">
      <button class="btn-open" style="width:auto; padding:8px 14px; display:inline-flex; gap:6px; align-items:center;" onclick="backToRounds()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 6l-6 6 6 6"/></svg> All rounds
      </button>
      <button class="btn-open" style="width:auto; padding:8px 14px; font-size:0.7812rem; font-weight:800;" onclick="toggleReorder()">${reorderMode?'Done':'↕ Reorder route'}</button>
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px;">
      <h2 style="font-size:1.25rem;">${escapeHtml(rn)}</h2>
      <button class="btn-open" style="width:38px; height:38px; padding:0; flex-shrink:0;" onclick="openRoundActionsMenu('${escapeAttr(rn)}')" aria-label="Round actions">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
    </div>
    <button class="btn-open" style="width:100%; margin-bottom:12px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:7px;" onclick="showRoundMap('${escapeAttr(rn)}')">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
      Show map
    </button>
  `;

  if(reorderMode){
    shellHtml += `<p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 6px;">Use the arrows to set the order you actually visit these customers in.</p>`;
    shellHtml += `<p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 14px;">If this round takes more than one day, tap the day badge to say which day each customer is visited on (up to 5).</p>`;
    shellHtml += `<button class="btn-open" style="width:100%; margin-bottom:14px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:7px;" onclick="suggestRouteOrder('${escapeAttr(rn)}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4H8"/></svg>
      Suggest a route order
    </button>`;
    if(!allInRound.length){ main.innerHTML = shellHtml + emptyState('customers'); return; }
    shellHtml += allInRound.map((c,i)=>`
      <div class="cust-card" style="display:flex; align-items:center; gap:10px;">
        <div style="flex:1; min-width:0;">
          <div class="cust-addr" style="font-size:0.9375rem; font-weight:800;">${i+1}. ${escapeHtml(c.address||'No address')}</div>
          ${c.name?`<div class="cust-name" style="font-size:0.8125rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.name)}</div>`:''}
        </div>
        <button class="btn-open" style="width:auto; padding:6px 10px; font-size:0.75rem; font-weight:800; background:var(--blue-dim); color:var(--blue-deep); flex-shrink:0;" onclick="cycleVisitDay('${c.id}')">Day ${c.visitDay||1}</button>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button class="btn-open" style="width:38px; height:32px; padding:0; opacity:${i===0?'0.3':'1'};" onclick="moveInRound('${c.id}','up')">▲</button>
          <button class="btn-open" style="width:38px; height:32px; padding:0; opacity:${i===allInRound.length-1?'0.3':'1'};" onclick="moveInRound('${c.id}','down')">▼</button>
        </div>
      </div>
    `).join('');
    main.innerHTML = shellHtml;
    return;
  }

  if(allInRound.length){
    const activeInRound = allInRound.filter(c=>!c.paused);
    const roundTotal = activeInRound.reduce((sum,c)=>sum+Number(c.price||0),0);
    const roundOwed = activeInRound.reduce((sum,c)=>{ const s=custStatus(c); return sum + (s.owed ? s.balance : 0); },0);
    const roundAvg = activeInRound.length ? roundTotal / activeInRound.length : 0;
    shellHtml += `<div class="summary-overall">
      <div class="stat"><div class="num">${activeInRound.length}</div><div class="lbl">Customers</div></div>
      <div class="stat"><div class="num">${roundValueOwedHtml(roundTotal, roundOwed)}</div><div class="lbl">Round value</div></div>
      <div class="stat"><div class="num">${money(roundAvg)}</div><div class="lbl">Avg / customer</div></div>
    </div>
    ${propertyTypeAvgSummaryHtml(activeInRound)}`;
  }

  if(spansMultipleDays){
    shellHtml += `<div class="seg-row">
      <button class="seg-btn ${roundDayFilter==='all'?'active':''}" onclick="setRoundDayFilter('all')">All</button>
      ${daysUsed.map(d=>`<button class="seg-btn ${roundDayFilter===d?'active':''}" onclick="setRoundDayFilter(${d})">Day ${d}</button>`).join('')}
    </div>`;
  }

  shellHtml += `<div class="seg-row">
    <button class="seg-btn seg-btn-sm ${roundFilterMode==='all'?'active':''}" onclick="setRoundFilterMode('all')">All</button>
    <button class="seg-btn seg-btn-sm ${roundFilterMode==='due'?'active':''}" onclick="setRoundFilterMode('due')">Due</button>
    <button class="seg-btn seg-btn-sm ${roundFilterMode==='owed'?'active':''}" onclick="setRoundFilterMode('owed')">Owed</button>
  </div>`;

  let baseList = allInRound;
  if(spansMultipleDays && roundDayFilter !== 'all'){
    baseList = baseList.filter(c=>(c.visitDay||1) === roundDayFilter);
  }
  if(roundFilterMode === 'due'){
    baseList = baseList.filter(c=>{
      const s = custStatus(c);
      const dueNow = s.cleanBadge && s.cleanBadge.type==='due';
      // Once cleaned, a customer drops out of "due" straight away — but keep them
      // visible in this filtered list for the rest of the day, so you can still see
      // everyone you've worked through today without them vanishing mid-round.
      // They naturally drop off tomorrow once lastClean no longer matches today.
      const cleanedToday = s.lastClean === todayISO();
      return !c.paused && (dueNow || cleanedToday);
    });
  } else if(roundFilterMode === 'owed'){
    baseList = baseList.filter(c=>custStatus(c).owed)
      .sort((a,b)=> (daysSinceLastPayment(b)-daysSinceLastPayment(a)) || (custStatus(b).balance-custStatus(a).balance));
  }
  const custs = baseList;
  if(!custs.length){
    main.innerHTML = shellHtml + emptyState((roundFilterMode!=='all' || roundDayFilter!=='all') ? 'filter' : 'customers');
    return;
  }
  if(spansMultipleDays && roundDayFilter === 'all'){
    // Insert a divider wherever the visit day changes, so it's clear where one day's
    // work ends and the next begins when viewing the whole round in route order.
    let lastDay = null;
    custs.forEach(c=>{
      const d = c.visitDay || 1;
      if(d !== lastDay){
        shellHtml += `<div class="day-divider">Day ${d}</div>`;
        lastDay = d;
      }
      shellHtml += custCardHtml(c);
    });
  } else {
    shellHtml += custs.map(custCardHtml).join('');
  }
  if(roundFilterMode === 'owed'){
    const owedTotal = custs.reduce((sum,c)=>sum+custStatus(c).balance,0);
    shellHtml += listTotalHtml(`${custs.length} owing · Total owed: ${money(owedTotal)}`);
  } else if(roundFilterMode === 'due'){
    // custs here includes customers already cleaned today (kept visible per the
    // "stays till end of day" behaviour above) — the total should only count
    // what's actually still left to do, not what's already been done.
    const remaining = custs.filter(c=>!c.paused && custStatus(c).lastClean !== todayISO());
    const remainingTotal = remaining.reduce((sum,c)=>sum+Number(c.price||0),0);
    shellHtml += listTotalHtml(`${remaining.length} remaining · ${money(remainingTotal)}`);
  } else {
    const activeCusts = custs.filter(c=>!c.paused);
    const listTotal = activeCusts.reduce((sum,c)=>sum+Number(c.price||0),0);
    shellHtml += listTotalHtml(`${activeCusts.length} customer${activeCusts.length===1?'':'s'} · ${money(listTotal)}`);
  }
  main.innerHTML = shellHtml;
}

function emptyState(kind){
  if(kind==='rounds'){
    return `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M4 4h16v12H4z"/><path d="M4 10h16M10 4v12"/></svg>
      <b>No customers yet</b>
      <p>Tap the blue + button to add your first customer and give them a round.</p>
    </div>`;
  }
  return `<div class="empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    <b>No matches</b>
    <p>Try a different filter.</p>
  </div>`;
}

function needsPriceReview(c){
  const lastIncrease = getLastPriceIncreaseDate(c);
  if(!lastIncrease) return false;
  const target = nextDueISO(c) || todayISO();
  return daysBetween(lastIncrease, target) >= 365;
}

function custCardHtml(c){
  const s = custStatus(c);
  const roundCustomers = data.customers.filter(x=>(x.round||'Unassigned')===(c.round||'Unassigned'));
  const showDayBadge = roundDaysUsed(roundCustomers).length > 1;
  // Only flag once a round has enough customers (4+) for "the round's median"
  // to actually mean something — on a tiny round, one or two prices decide the
  // whole median and the badge would just be noise.
  const activeInRound = roundCustomers.filter(x=>!x.paused).length;
  const roundMedian = activeInRound >= 4 ? roundMedianPricePerHouse(c.round||'Unassigned') : null;
  const ownPerHouse = Number(c.price||0) / houseWeight(c);
  const belowRoundMedian = roundMedian != null && roundMedian > 0 && ownPerHouse < roundMedian * 0.85;
  return `<div class="swipe-wrap">
    <div class="swipe-bg swipe-bg-left">✓ Cleaned</div>
    <div class="swipe-bg swipe-bg-right">💷 Paid</div>
    <div class="cust-card" data-id="${c.id}" data-kind="customer">
      <div class="cust-top" onclick="openCustomerDetail('${c.id}')">
        <div>
          <div class="cust-addr" style="font-size:1rem; font-weight:800; color:var(--ink);">${escapeHtml(c.address||'No address')}</div>
          ${(c.name||c.phone) ? `<div class="cust-name" style="font-size:0.8125rem; font-weight:600; color:var(--ink-muted); margin-top:2px;">${[escapeHtml(c.name||''), c.phone?escapeHtml(c.phone):''].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
        <div class="cust-right">
          <div class="cust-price">${money(c.price)}</div>
          <div class="cust-btn-row">
            ${c.phone ? `<button class="call-btn" onclick="event.stopPropagation(); callCustomer('customer','${c.id}')" title="Call" aria-label="Call">${CALL_ICON}</button>` : ''}
            ${c.address ? `<button class="dir-btn" onclick="event.stopPropagation(); openDirections('customer','${c.id}')" title="Directions" aria-label="Directions">${DIRECTIONS_ICON}</button>` : ''}
          </div>
        </div>
      </div>
      <div class="cust-meta">
        ${s.cleanBadge ? `<span class="badge ${s.cleanBadge.type}"${c.paused&&c.pauseDate?` title="Paused since ${fmtDate(c.pauseDate)}"`:''}>${s.cleanBadge.text}</span>` : `<span class="badge ok">Cleaned ${fmtDate(s.lastClean)}</span>`}
        ${s.owed ? `<span class="badge owed">Owes ${money(s.balance)}</span>` : s.credit ? `<span class="badge ok">Credit ${money(Math.abs(s.balance))}</span>` : `<span class="badge ok">Paid up</span>`}
        ${(s.owed && (c.paymentReminderCount||0) >= 2) ? `<span class="badge escalate" title="${c.paymentReminderCount} payment reminders sent, still unpaid">⚠ Chase</span>` : ''}
        ${(s.owed && c.paymentReminderSent) ? `<span class="badge paused">🔔 ${fmtDate(c.paymentReminderSentDate).split(' ').slice(0,2).join(' ')}</span>` : ''}
        ${(c.photos && c.photos.length) ? `<span class="badge paused">📷 ${c.photos.length}</span>` : ''}
        ${needsPriceReview(c) ? `<span class="badge due" title="12+ months since last price increase">📈 Review</span>` : ''}
        ${belowRoundMedian ? `<span class="badge due" title="Below this round's average">💷 Low</span>` : ''}
        ${c.propertyType ? `<span class="badge paused" title="${escapeAttr(propertySummaryText(c))}">🏠 ${escapeHtml(PROPERTY_TYPE_ABBR[c.propertyType]||c.propertyType)}${c.frontsOnly?' · Fronts':''}</span>` : (c.frontsOnly ? `<span class="badge paused">Fronts only</span>` : '')}
        ${c.textBeforeVisit ? `<span class="badge anniversary" title="Text before you arrive">📱 Text first</span>` : ''}
        ${showDayBadge ? `<span class="badge anniversary">Day ${c.visitDay||1}</span>` : ''}
        ${(isMobileNumber(c.phone) && s.lastClean===todayISO()) ? (
          c.cleanedTodayTextSentDate === s.lastClean
            ? `<button onclick="event.stopPropagation(); sendTemplate('${c.id}','cleanedToday')" title="Sent — tap to send again" style="display:inline-flex; align-items:center; gap:4px; background:var(--green-dim); color:var(--green); border:none; border-radius:20px; padding:5px 10px; font-size:0.7188rem; font-weight:800; line-height:1;">✓ Text sent</button>`
            : `<button onclick="event.stopPropagation(); sendTemplate('${c.id}','cleanedToday')" style="display:inline-flex; align-items:center; gap:4px; background:var(--green-dim); color:var(--green); border:none; border-radius:20px; padding:5px 10px; font-size:0.7188rem; font-weight:800; line-height:1;">💬 Cleaned today</button>`
        ) : ''}
      </div>
    </div>
  </div>`;
}

function quickClean(id){
  const c = data.customers.find(x=>x.id===id);
  const prevDeferUntil = c.deferUntil;
  c.cleanHistory = c.cleanHistory || [];
  c.cleanHistory.push({date: todayISO(), amount: c.price||0});
  c.deferUntil = null;
  saveData(); render();
  toast(`Marked ${c.name||c.address||'customer'} as cleaned today`, 'Undo', () => {
    c.cleanHistory.pop();
    c.deferUntil = prevDeferUntil;
    saveData(); render();
  });
}
function quickPaid(id){
  const c = data.customers.find(x=>x.id===id);
  const prev = { paymentReminderSent: c.paymentReminderSent, paymentReminderSentDate: c.paymentReminderSentDate, paymentReminderCount: c.paymentReminderCount };
  c.paymentHistory = c.paymentHistory || [];
  c.paymentHistory.push({date: todayISO(), amount: c.price||0});
  c.paymentReminderSent = false;
  c.paymentReminderSentDate = null;
  c.paymentReminderCount = 0;
  saveData(); render();
  toast(`Marked ${c.name||c.address||'customer'} as paid`, 'Undo', () => {
    c.paymentHistory.pop();
    Object.assign(c, prev);
    saveData(); render();
  });
}
function quickCleanAndPaid(id){
  const c = data.customers.find(x=>x.id===id);
  const today = todayISO();
  const prev = { deferUntil: c.deferUntil, paymentReminderSent: c.paymentReminderSent, paymentReminderSentDate: c.paymentReminderSentDate, paymentReminderCount: c.paymentReminderCount };
  c.cleanHistory = c.cleanHistory || [];
  c.cleanHistory.push({date: today, amount: c.price||0});
  c.deferUntil = null;
  c.paymentHistory = c.paymentHistory || [];
  c.paymentHistory.push({date: today, amount: c.price||0});
  c.paymentReminderSent = false;
  c.paymentReminderSentDate = null;
  c.paymentReminderCount = 0;
  saveData(); render();
  toast(`Marked ${c.name||c.address||'customer'} as cleaned and paid today`, 'Undo', () => {
    c.cleanHistory.pop();
    c.paymentHistory.pop();
    Object.assign(c, prev);
    saveData(); render();
  });
}

function useCurrentLocation(){
  if(!navigator.geolocation){ toast('Location not available on this device'); return; }
  toast('Getting your location…');
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const {latitude, longitude} = pos.coords;
    const field = document.getElementById('f_address');
    if(!field) return;
    try{
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`);
      if(!res.ok) throw new Error('bad response');
      const json = await res.json();
      const a = (json && json.address) || {};
      const road = [a.house_number, (a.road || a.pedestrian || a.footway || '')].filter(Boolean).join(' ');
      const town = a.town || a.city || a.village || a.suburb || a.hamlet || '';
      const postcode = a.postcode || '';
      const shortAddress = [road, town, postcode].filter(Boolean).join(', ');
      if(shortAddress){
        field.value = shortAddress;
        toast('Address filled from your location');
      } else if(json && json.display_name){
        field.value = json.display_name;
        toast('Address filled from your location');
      } else {
        throw new Error('no address found');
      }
    }catch(e){
      field.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      toast('Got your coordinates — no signal to look up the address');
    }
  }, ()=>{
    toast('Could not get your location — check location permission');
  }, {enableHighAccuracy:true, timeout:12000});
}

