/* 07c-schedule.js -- The Schedule tab (its own tab, between Today and Work).
   A full-screen calendar like the Monthly Schedule report, except each chip (a round on a day,
   or a one-off job) can be moved to another day — by dragging it, or by tapping it and then
   tapping a day. Nothing is saved until Commit; Reject throws every change away.
   Committing gives each customer in a moved chip a hand-set due date (see dueOverrideISO in
   01-data.js) and changes a moved job's date.
   Extras: ☔ push-back (rain-off), 👥 move part of a round, ☑ multi-select, ↶ undo, a load summary
   (customers and value) on every day, 🚫 days off, ＋ jobs added straight onto a day, a
   review step before committing, a "+4 weeks" button to look further ahead, a "4 earlier weeks" button to look back at
   what was cleaned on past days (read-only green tiles; tap one for the list), a note on any day, and first cleans:
   a new customer or round that hasn't been cleaned yet can be given a day before its first clean.
   The calendar is a draft that lives on in the background: switching to another tab hides it and coming back
   shows it just as it was, changes and all, until it is committed or rejected.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

const SE_WEEKS = 5;           // weeks shown when the editor opens, starting with the Monday of this week
const SE_MORE_WEEKS = 4;      // weeks added by the "+ more weeks" button
const SE_HOLD_MS = 350;       // touchscreens: how long to press and hold a tile before it lifts
const SE_MAX_WEEKS = 52;      // furthest the calendar can be extended
const SE_BACK_WEEKS = 4;      // weeks added by the "earlier weeks" button
const SE_MAX_BACK_WEEKS = 104; // furthest back the calendar can be extended (two years)
const SE_ZOOM_KEY = 'roundBookScheduleZoom';
const SE_ZOOM_MIN = 0.45, SE_ZOOM_MAX = 2.6, SE_ZOOM_DEFAULT = 1.4;
let se = null;      // editor state while open (see openScheduleEditor)
let seBound = false;

// Which version of the data this draft was built from, so a draft with no changes of its own can be refreshed when
// the data underneath it has moved (a sync, a clean logged, a new day) while one with changes is never touched.
function seDataVersion(){ return (typeof liveDataVersion === 'number') ? liveDataVersion : 0; }
function seVisible(){ const r = document.getElementById('schedEditor'); return !!r && r.classList.contains('show'); }
// True while a draft with real changes exists, on screen or not. Live sync holds off merging under it (liveUiBusy).
function seDraftPending(){ return !!se && seChangeSummary().total > 0; }
// An item that is a first clean nobody has booked yet. It waits on today, unmoved, and doesn't count towards
// today's load or get swept up by Push back / Days off until it is given a day of its own.
function seIsParked(it){ return !!(it && it.parked && it.date === it.dispDate); }

function seEls(){
  return { root: document.getElementById('schedEditor'), scroll: document.getElementById('seScroll'),
           grid: document.getElementById('seGrid'), count: document.getElementById('seCount'),
           commit: document.getElementById('seCommit'), modal: document.getElementById('seModal'),
           card: document.getElementById('seModalCard'), undo: document.getElementById('seUndo'),
           multi: document.getElementById('seMultiBtn'), split: document.getElementById('seSplitBtn'),
           more: document.getElementById('seMore'), weeksBtn: document.getElementById('seWeeksBtn'),
           earlier: document.getElementById('seEarlier'), earlierBtn: document.getElementById('seEarlierBtn') };
}

/* ---------- small date helpers (isoToDays / daysToISO live in 01-data.js) ---------- */
function seFmtDay(iso){ return isoToDate(iso).toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}); }
function seAddDays(iso, n){ return daysToISO(isoToDays(iso) + n); }
function seDow(iso){ return isoToDate(iso).getDay(); }
// A day is "off" if its weekday is a regular day off (Sundays by default) or it's been marked off.
function seIsOff(iso){ return se.offWeekdays.includes(seDow(iso)) || se.blocked.includes(iso); }
// The n-th working day after iso (skipping days off).
function seNextWorking(iso, n){
  let d = iso, left = n, guard = 0;
  while(left > 0 && guard++ < 500){ d = seAddDays(d, 1); if(!seIsOff(d)) left--; }
  return d;
}
// The n-th working day before iso (skipping days off). Can land before today — callers check.
function sePrevWorking(iso, n){
  let d = iso, left = n, guard = 0;
  while(left > 0 && guard++ < 500){ d = seAddDays(d, -1); if(!seIsOff(d)) left--; }
  return d;
}
// Every device opens with the same number of weeks (SE_WEEKS); "＋ Show 4 more weeks" looks further ahead.
function seStartWeeks(){ return SE_WEEKS; }
function sePlural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }

function openScheduleEditor(){
  const keepBack = se ? (se.weeksBack || 0) : 0; // a rebuilt calendar stays as far back as it was
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = localISO(today);
  const dow = today.getDay();
  const gridStart = new Date(today); gridStart.setDate(gridStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const capDate = new Date(gridStart); capDate.setDate(capDate.getDate() + SE_MAX_WEEKS * 7 - 1);
  const startISO = localISO(gridStart), capISO = localISO(capDate);

  // A round that really runs over several visit days is shown per day, as in the report.
  const roundsAll = groupByRound(data.customers);
  const multi = new Set(Object.keys(roundsAll).filter(rn => roundDaysUsed(roundsAll[rn]).length > 1));

  // One item per customer / job. Chips are built from these (see seBuildChips), which is what lets a
  // round be split, merged and undone. Anyone overdue is shown on today (flagged), and a deferred
  // customer on the day their deferral ends.
  const items = [];
  data.customers.forEach(c => {
    if(c.paused) return;
    let due = nextDueISO(c);
    // A customer who has never been cleaned has no due date until one is booked here, so they wait on today (green,
    // "first clean") and can be given a day before that first clean happens.
    const first = !lastDateOf(c.cleanHistory);
    const parked = first && !due;
    if(!due){ if(!first) return; due = todayStr; }
    if(c.deferUntil && c.deferUntil > due) due = c.deferUntil;
    const overdue = !parked && due < todayStr;
    const disp = overdue ? todayStr : due;
    if(disp > capISO) return;
    const rn = c.round || 'Unassigned';
    const label = multi.has(rn) ? `${rn} (Day ${c.visitDay || 1})` : rn;
    items.push({ kind:'c', key:c.id, label, dispDate:disp, date:disp, overdue, due, price:Number(c.price || 0), first, parked });
  });
  (data.oneOffJobs || []).forEach(j => {
    if(j.done || !j.date) return;
    const overdue = j.date < todayStr;
    const disp = overdue ? todayStr : j.date;
    if(disp > capISO) return;
    items.push({ kind:'j', key:j.id, label:'🔧 ' + (j.address || j.name || 'Job'), dispDate:disp, date:disp, overdue, due:j.date, price:Number(j.price || 0) });
  });

  const st = data.settings || {};
  const offWeekdays = Array.isArray(st.scheduleOffWeekdays) ? st.scheduleOffWeekdays.slice() : [0];
  const blocked = (Array.isArray(st.blockedDays) ? st.blockedDays : []).filter(d => d >= todayStr).sort();

  let zoom = SE_ZOOM_DEFAULT;
  try{ const z = parseFloat(localStorage.getItem(SE_ZOOM_KEY)); if(z >= SE_ZOOM_MIN && z <= SE_ZOOM_MAX) zoom = z; }catch(e){}
  const notes = Object.assign({}, st.dayNotes || {});
  se = { zoom, items, sel:[], multi:false, selDay:null, startISO, capISO, todayStr, weeks:seStartWeeks(), weeksBack:keepBack, multiRounds:multi,
         offWeekdays, blocked, origOff:offWeekdays.slice(), origBlocked:blocked.slice(),
         notes, origNotes:Object.assign({}, notes),
         builtVersion:seDataVersion(), builtDay:todayStr,
         history:[], drag:null, chipIndex:{}, ignoreClickUntil:0, pendingRender:false, offPending:null };
  const { scroll } = seEls();
  seSetMoreTools(false); // Push back / Multi / Split / Job start tucked away behind ⋯ More…
  seBind();
  seCloseModal();
  seShow();
  scroll.scrollTop = 0; scroll.scrollLeft = 0;
}
// Putting the calendar on screen / taking it off, without touching the draft. The page behind it is locked from
// scrolling only while it's showing.
function seShow(){
  const { root } = seEls();
  if(!se || !root) return;
  root.classList.add('show');
  pageScrollLock('schedule', true);
  renderScheduleEditor();
}
function seHide(){
  const { root } = seEls();
  if(!root) return;
  seEndDrag();
  seCloseModal();
  root.classList.remove('show');
  pageScrollLock('schedule', false);
  if(typeof liveUiFreed === 'function') liveUiFreed(); // a draft with no changes no longer holds sync back
}
// The tab was opened (setTab) or the app redrew while it's open (render): make sure there's a calendar and that it is
// current. A draft with changes is left exactly as it is; an untouched one is rebuilt if the data or the day has
// moved on, keeping the scroll position.
function scheduleTabRender(){
  const stale = !se || (!seChangeSummary().total && (se.builtVersion !== seDataVersion() || se.builtDay !== todayISO()));
  if(stale){
    const { scroll } = seEls();
    const top = scroll ? scroll.scrollTop : 0, left = scroll ? scroll.scrollLeft : 0;
    const keep = !!se;
    openScheduleEditor();
    if(keep && scroll){ scroll.scrollTop = top; scroll.scrollLeft = left; }
  } else if(!seVisible()) seShow();
}
function scheduleTabShown(){ scheduleTabRender(); }
function scheduleTabHidden(){ seHide(); }

/* ---------- chips, day totals, change summary ---------- */
// One round chip per (round, day, original day, overdue) so a moved group stays distinguishable
// from customers who were already on that day. Each job is its own chip.
function seBuildChips(){
  const out = [], map = {};
  se.items.forEach(it => {
    if(it.kind === 'j'){
      out.push({ id:'j|' + it.key, kind:'job', label:it.label, date:it.date, dispDate:it.dispDate, overdue:!!it.overdue, isNew:!!it.isNew, items:[it] });
      return;
    }
    const k = `r|${it.label}|${it.date}|${it.dispDate}|${it.overdue ? 1 : 0}|${it.first ? 1 : 0}`;
    if(!map[k]){ map[k] = { id:k, kind:'round', label:(it.first ? '🆕 ' : '') + it.label, date:it.date, dispDate:it.dispDate, overdue:!!it.overdue, first:!!it.first, parked:!!it.parked, isNew:false, items:[] }; out.push(map[k]); }
    map[k].items.push(it);
  });
  se.chipIndex = {};
  out.forEach(ch => {
    ch.moved = !ch.isNew && ch.date !== ch.dispDate;
    ch.minDue = ch.items.reduce((m, i) => (!m || i.due < m) ? i.due : m, '');
    se.chipIndex[ch.id] = ch;
  });
  return out;
}

function seDayStats(chips){
  const st = {};
  chips.forEach(ch => {
    const s = st[ch.date] = st[ch.date] || { cust:0, jobs:0, value:0 };
    ch.items.forEach(it => {
      if(seIsParked(it)) return; // waiting for a day: not today's work yet
      if(it.kind === 'c') s.cust++; else s.jobs++;
      s.value += it.price || 0;
    });
  });
  return st;
}

function seChangeSummary(){
  const movedC = se.items.filter(i => !i.isNew && i.kind === 'c' && i.date !== i.dispDate).length;
  const movedJ = se.items.filter(i => !i.isNew && i.kind === 'j' && i.date !== i.dispDate).length;
  const newJ = se.items.filter(i => i.isNew).length;
  const offAdded = se.blocked.filter(d => !se.origBlocked.includes(d));
  const offRemoved = se.origBlocked.filter(d => !se.blocked.includes(d));
  const wdChanged = se.offWeekdays.slice().sort().join() !== se.origOff.slice().sort().join();
  const noteDays = Array.from(new Set(Object.keys(se.notes).concat(Object.keys(se.origNotes)))).filter(d => (se.notes[d] || '') !== (se.origNotes[d] || '')).sort();
  return { movedC, movedJ, newJ, offAdded, offRemoved, wdChanged, noteDays,
           total: movedC + movedJ + newJ + offAdded.length + offRemoved.length + (wdChanged ? 1 : 0) + noteDays.length };
}

/* ---------- history: what was actually cleaned on past days ----------
   Read-only. Built from each customer's clean history and from one-off jobs marked done (a job's own date is the
   day it was done). Nothing here can be moved or committed. */
function seHistoryByDay(fromISO, toISO){
  const out = {};
  const day = iso => out[iso] || (out[iso] = { rounds:{}, jobs:[], count:0, value:0 });
  data.customers.forEach(c => {
    const hist = c.cleanHistory || [];
    if(!hist.length) return;
    const rn = c.round || 'Unassigned';
    const label = (se.multiRounds && se.multiRounds.has(rn)) ? `${rn} (Day ${c.visitDay || 1})` : rn;
    hist.forEach(e => {
      const d = e && e.date;
      if(!d || d < fromISO || d > toISO) return;
      const amt = Number(e.amount || 0);
      const dd = day(d);
      const r = dd.rounds[label] || (dd.rounds[label] = { label, rows:[], value:0 });
      r.rows.push({ name: c.address || c.name || 'Customer', amount: amt });
      r.value += amt; dd.count++; dd.value += amt;
    });
  });
  (data.oneOffJobs || []).forEach(j => {
    if(!j.done || !j.date || j.date < fromISO || j.date > toISO) return;
    const amt = Number(j.price || 0);
    const dd = day(j.date);
    dd.jobs.push({ name: j.address || j.name || 'Job', amount: amt });
    dd.count++; dd.value += amt;
  });
  return out;
}
function seHistOpen(iso){
  if(!se) return;
  const dd = seHistoryByDay(iso, iso)[iso];
  if(!dd){ return; }
  const row = r => `<li>${escapeHtml(r.name)}${r.amount > 0 ? ' · ' + money(r.amount) : ''}</li>`;
  const names = Object.keys(dd.rounds).sort((a, b) => a.localeCompare(b));
  seModal(`
    <h3>✓ Cleaned ${seFmtDay(iso)}</h3>
    <p class="se-note">${sePlural(dd.count, 'clean')}${dd.value > 0 ? ' · ' + money(dd.value) : ''}. This is a record of what was done, so it can’t be moved.</p>
    ${names.map(n => `<label>${escapeHtml(n)} (${dd.rounds[n].rows.length})</label><ul class="se-review">${dd.rounds[n].rows.map(row).join('')}</ul>`).join('')}
    ${dd.jobs.length ? `<label>🔧 One-off jobs (${dd.jobs.length})</label><ul class="se-review">${dd.jobs.map(row).join('')}</ul>` : ''}
    <div class="se-btn-row"><button class="se-btn primary" onclick="seCloseModal()">Done</button></div>
  `);
}

/* ---------- rendering ---------- */
function renderScheduleEditor(){
  if(!se) return;
  se.pendingRender = false;
  const { grid, count, commit, undo, multi, split, more, weeksBtn, earlier, earlierBtn } = seEls();
  grid.style.setProperty('--z', se.zoom);
  const chips = seBuildChips();
  se.sel = se.sel.filter(id => se.chipIndex[id]);
  const stats = seDayStats(chips);

  // "Heavy day" tint: compare each day's load (value, or customer count if nothing has a price)
  // with the typical busy day.
  const useValue = Object.keys(stats).some(d => stats[d].value > 0);
  const loadOf = s => useValue ? s.value : (s.cust + s.jobs);
  const loads = Object.keys(stats).filter(d => d >= se.todayStr && loadOf(stats[d]) > 0).map(d => loadOf(stats[d])).sort((a, b) => a - b);
  const median = loads.length >= 3 ? loads[Math.floor(loads.length / 2)] : 0;

  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = dayNames.map(d => `<div class="se-dayname">${d}</div>`).join('');
  const back = se.weeksBack || 0;
  const start = isoToDate(se.startISO); start.setDate(start.getDate() - back * 7);
  const hist = back ? seHistoryByDay(localISO(start), se.todayStr) : seHistoryByDay(se.startISO, se.todayStr);
  for(let i = 0; i < (back + se.weeks) * 7; i++){
    const d = new Date(start); d.setDate(d.getDate() + i);
    const iso = localISO(d);
    const past = iso < se.todayStr;
    const off = !past && seIsOff(iso);
    const dayNum = d.getDate();
    const monthLabel = (dayNum === 1 || i === 0) ? d.toLocaleDateString('en-GB', {month:'short'}) + ' ' : '';
    const here = chips.filter(ch => ch.date === iso).sort((a, b) => a.label.localeCompare(b.label));
    const s = stats[iso];
    let cls = '';
    if(s && median && !past && !off){
      const l = loadOf(s);
      if(l >= median * 1.75) cls = ' load-vhi'; else if(l >= median * 1.35) cls = ' load-hi';
    }
    const h = iso <= se.todayStr ? hist[iso] : null;
    let meta = (s && !past) ? `${s.cust + s.jobs}${s.value > 0 ? ' · ' + money(s.value) : ''}` : '';
    if(h && past) meta = `✓ ${h.count}${h.value > 0 ? ' · ' + money(h.value) : ''}`;
    const histHtml = h ? Object.keys(h.rounds).sort((a, b) => a.localeCompare(b)).map(n => `<div class="se-hist" data-hist="${iso}" title="${escapeAttr('Cleaned: ' + n)}"><span class="se-chip-label">✓ ${escapeHtml(n)}</span><span class="se-chip-n">${h.rounds[n].rows.length}</span></div>`).join('')
      + (h.jobs.length ? `<div class="se-hist job" data-hist="${iso}" title="Jobs done"><span class="se-chip-label">✓ 🔧 Jobs</span><span class="se-chip-n">${h.jobs.length}</span></div>` : '') : '';
    html += `<div class="se-cell${past ? ' past' : ''}${iso === se.todayStr ? ' today' : ''}${off ? ' off' : ''}${se.selDay === iso ? ' selday' : ''}${cls}" data-date="${iso}">
      <div class="se-cellhead"><div class="se-daynum">${monthLabel}${dayNum}</div></div>
      ${off ? '<div class="se-off">🚫 Off</div>' : ''}${meta ? `<div class="se-meta"><span>${meta}</span></div>` : ''}${se.notes[iso] ? `<div class="se-daynote" data-note="${iso}" title="Tap to edit this note">📝 ${escapeHtml(se.notes[iso])}</div>` : ''}
      ${histHtml}${here.map(ch => {
        const n = ch.kind === 'round' ? ch.items.length : '';
        const tip = ch.label + (ch.moved ? ' — moved from ' + fmtDate(ch.dispDate) : '') + (ch.isNew ? ' — new job' : '') + (ch.overdue ? ' — overdue since ' + fmtDate(ch.minDue) : '') + (ch.parked && !ch.moved ? ' — first clean, not booked yet: move it to a day' : '');
        return `<div class="se-chip ${ch.kind}${ch.moved ? ' moved' : ''}${ch.isNew ? ' new' : ''}${ch.overdue ? ' overdue' : ''}${ch.first ? ' first' : ''}${se.sel.includes(ch.id) ? ' sel' : ''}" data-id="${escapeAttr(ch.id)}" title="${escapeAttr(tip)}"><span class="se-chip-label">${ch.overdue ? '⚠ ' : ''}${escapeHtml(ch.label)}</span>${n !== '' ? `<span class="se-chip-n">${n}</span>` : ''}</div>`;
      }).join('')}
    </div>`;
  }
  grid.innerHTML = html;

  const sum = seChangeSummary();
  const parts = [];
  if(sum.movedC) parts.push(sePlural(sum.movedC, 'customer') + ' moved');
  if(sum.movedJ) parts.push(sePlural(sum.movedJ, 'job') + ' moved');
  if(sum.newJ) parts.push(sePlural(sum.newJ, 'new job'));
  if(sum.offAdded.length || sum.offRemoved.length || sum.wdChanged) parts.push('days off changed');
  if(sum.noteDays.length) parts.push(sum.noteDays.length === 1 ? 'note changed' : sum.noteDays.length + ' notes changed');
  let state = '';
  if(se.sel.length) state = se.multi ? `${se.sel.length} selected — tap a day to move` : 'Now tap a day';
  else if(se.selDay) state = seFmtDay(se.selDay) + ' selected';
  const parkedN = se.items.filter(seIsParked).length;
  count.textContent = [state, parts.join(' · ')].filter(Boolean).join(' · ') || (parkedN ? `No changes yet · ${sePlural(parkedN, 'first clean')} to book` : 'No changes yet');
  commit.style.opacity = sum.total ? '1' : '0.45';

  undo.disabled = !se.history.length;
  multi.classList.toggle('active', se.multi);
  const one = se.sel.length === 1 && se.chipIndex[se.sel[0]];
  split.disabled = !(one && one.kind === 'round');
  more.style.display = se.weeks >= SE_MAX_WEEKS ? 'none' : '';
  if(weeksBtn) weeksBtn.style.display = se.weeks >= SE_MAX_WEEKS ? 'none' : ''; // the wide-screen rail's version of the same button
  if(earlier) earlier.style.display = back >= SE_MAX_BACK_WEEKS ? 'none' : '';
  if(earlierBtn) earlierBtn.style.display = back >= SE_MAX_BACK_WEEKS ? 'none' : ''; // and the rail's version of the earlier-weeks button
}

/* ---------- history (undo) ---------- */
function sePush(){
  se.history.push(JSON.stringify({ items:se.items, blocked:se.blocked, offWeekdays:se.offWeekdays, notes:se.notes }));
  if(se.history.length > 60) se.history.shift();
}
function seUndo(){
  if(!se || !se.history.length){ return; }
  const s = JSON.parse(se.history.pop());
  se.items = s.items; se.blocked = s.blocked; se.offWeekdays = s.offWeekdays; se.notes = s.notes || {};
  se.sel = []; se.selDay = null;
  renderScheduleEditor();
  toast('Undid the last change');
}

/* ---------- moving ---------- */
function seMoveChips(ids, iso){
  const chips = ids.map(id => se.chipIndex[id]).filter(Boolean);
  if(!chips.length) return;
  if(iso < se.todayStr){ toast('Choose today or a later day'); return; }
  if(seIsOff(iso) && !chips.every(ch => ch.dispDate === iso)){ toast('That day is marked as off'); return; }
  if(chips.every(ch => ch.date === iso)){ se.sel = []; renderScheduleEditor(); return; }
  sePush();
  chips.forEach(ch => ch.items.forEach(it => { it.date = iso; }));
  se.sel = []; se.selDay = null;
  renderScheduleEditor();
}
// The ⋯ More… button shows or hides Push back, Multi, Split, ＋ Job, Note and Days off (the .se-extra buttons).
function seSetMoreTools(open){
  const tools = document.getElementById('seTools'), btn = document.getElementById('seMoreToolsBtn');
  if(tools) tools.classList.toggle('more-open', !!open);
  if(btn){ btn.textContent = open ? '⋯ Less' : '⋯ More…'; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
}
function seToggleMoreTools(){
  const tools = document.getElementById('seTools');
  seSetMoreTools(!(tools && tools.classList.contains('more-open')));
}
function seToggleMulti(){
  if(!se) return;
  se.multi = !se.multi; se.sel = [];
  renderScheduleEditor();
  if(se.multi) toast('Multi-select on — tap chips to add them, then tap a day');
}
function seTapChip(id){
  se.selDay = null;
  if(se.multi) se.sel = se.sel.includes(id) ? se.sel.filter(x => x !== id) : se.sel.concat([id]);
  else se.sel = (se.sel.length === 1 && se.sel[0] === id) ? [] : [id];
  renderScheduleEditor();
}
function seScrollToToday(){
  if(!se) return;
  const { scroll, grid } = seEls();
  const cell = grid.querySelector('.se-cell.today');
  if(!cell) return;
  scroll.scrollTop += cell.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 34;
}
/* ---------- zoom (buttons, or pinch the calendar) ---------- */
function seSetZoom(z, noSave, fx, fy){
  if(!se) return;
  z = Math.max(SE_ZOOM_MIN, Math.min(SE_ZOOM_MAX, z));
  const { scroll, grid } = seEls();
  const ratio = z / se.zoom;
  // keep whatever is in the middle of the screen in the middle (or, for the mouse wheel, under the pointer)
  if(fx == null){ fx = scroll.clientWidth / 2; fy = scroll.clientHeight / 2; }
  const cx = scroll.scrollLeft + fx, cy = scroll.scrollTop + fy;
  se.zoom = z;
  grid.style.setProperty('--z', z);
  scroll.scrollLeft = cx * ratio - fx;
  scroll.scrollTop = cy * ratio - fy;
  if(!noSave){ try{ localStorage.setItem(SE_ZOOM_KEY, String(z)); }catch(e){} }
}
function seZoomBy(f){ if(se) seSetZoom(se.zoom * f); }
function seShowMoreWeeks(){
  if(!se) return;
  se.weeks = Math.min(SE_MAX_WEEKS, se.weeks + SE_MORE_WEEKS);
  renderScheduleEditor();
  toast(`Showing ${se.weeks} weeks`);
}

// Adds SE_BACK_WEEKS weeks above the calendar to look back at what was cleaned. The rows are added above what is on
// screen, so the scroll position is moved down by the height added and the view doesn't jump.
function seShowEarlierWeeks(){
  if(!se) return;
  const { scroll, grid } = seEls();
  const before = grid.offsetHeight, top = scroll.scrollTop;
  se.weeksBack = Math.min(SE_MAX_BACK_WEEKS, (se.weeksBack || 0) + SE_BACK_WEEKS);
  renderScheduleEditor();
  scroll.scrollTop = top + (grid.offsetHeight - before);
  toast(`Showing ${se.weeksBack} earlier week${se.weeksBack === 1 ? '' : 's'}`);
}

/* ---------- print ----------
   Prints the calendar as it is being viewed: every week on screen (earlier weeks included), with any changes not yet
   committed, days off and notes. Cleans already done are green. Uses the same paper layout as the Monthly Schedule report. */
function sePrint(){
  if(!se){ toast('The schedule isn\u2019t ready yet'); return; }
  const chips = seBuildChips();
  const back = se.weeksBack || 0;
  const start = isoToDate(se.startISO); start.setDate(start.getDate() - back * 7);
  const startISO = localISO(start);
  const weeks = back + se.weeks;
  const hist = seHistoryByDay(startISO, se.todayStr);
  const NOTE_IN_CELL = 60;
  const longNotes = [];
  let rows = '';
  for(let w = 0; w < weeks; w++){
    rows += '<tr>';
    for(let d = 0; d < 7; d++){
      const cell = new Date(start); cell.setDate(cell.getDate() + w * 7 + d);
      const iso = localISO(cell);
      const past = iso < se.todayStr;
      const off = !past && seIsOff(iso);
      const dayNum = cell.getDate();
      const monthLabel = (dayNum === 1 || (w === 0 && d === 0)) ? cell.toLocaleDateString('en-GB', {month:'short'}) + ' ' : '';
      const note = se.notes[iso] || '';
      if(note.length > NOTE_IN_CELL) longNotes.push({ iso, note });
      const h = iso <= se.todayStr ? hist[iso] : null;
      const done = h ? Object.keys(h.rounds).sort((a, b) => a.localeCompare(b)).map(n => `<span class="round-chip done-chip">\u2713 ${escapeHtml(n)} (${h.rounds[n].rows.length})</span>`).join('')
        + (h.jobs.length ? `<span class="round-chip done-chip">\u2713 \ud83d\udd27 Jobs (${h.jobs.length})</span>` : '') : '';
      const here = chips.filter(ch => ch.date === iso).sort((a, b) => a.label.localeCompare(b.label))
        .map(ch => `<span class="round-chip${ch.kind === 'job' ? ' job-chip' : ''}">${escapeHtml(ch.label)}${ch.kind === 'round' ? ' (' + ch.items.length + ')' : ''}</span>`).join('');
      rows += `<td class="${past ? 'outside' : ''}">
        <div class="daynum">${monthLabel}${dayNum}</div>
        ${off ? '<div class="day-off">\ud83d\udeab Off</div>' : ''}
        ${note ? `<div class="day-note">\ud83d\udcdd ${escapeHtml(note.length > NOTE_IN_CELL ? note.slice(0, NOTE_IN_CELL - 1).trimEnd() + '\u2026' : note)}</div>` : ''}
        ${done}${here}
      </td>`;
    }
    rows += '</tr>';
  }
  const endISO = seAddDays(startISO, weeks * 7 - 1);
  const pending = seChangeSummary().total > 0;
  const body = `
    <div class="rpt-empty-note">${escapeHtml(fmtDate(startISO))} to ${escapeHtml(fmtDate(endISO))}${pending ? ' \u00b7 includes changes not yet committed' : ''}. Green ticks are cleans already done.</div>
    <table class="rpt-calendar">
      <thead><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${longNotes.length ? `<div class="rpt-notes"><b>Notes in full</b>${longNotes.map(n => `<div>\ud83d\udcdd <b>${escapeHtml(fmtDate(n.iso))}</b> \u2014 ${escapeHtml(n.note)}</div>`).join('')}</div>` : ''}
  `;
  runPrint('Schedule', body, false, false, null);
}

/* ---------- touch / mouse handling ---------- */
function seCellAt(x, y){
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('.se-cell') : null;
}
function seUpdateDropTarget(x, y){
  document.querySelectorAll('.se-cell.drop').forEach(c => c.classList.remove('drop'));
  const cell = seCellAt(x, y);
  if(cell && !cell.classList.contains('past')) cell.classList.add('drop');
}
function seEndDrag(){
  const d = se && se.drag;
  if(!d) return;
  if(d.timer) clearInterval(d.timer);
  if(d.hold) clearTimeout(d.hold);
  if(d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
  document.querySelectorAll('.se-cell.drop').forEach(c => c.classList.remove('drop'));
  document.querySelectorAll('.se-chip.dragging').forEach(c => c.classList.remove('dragging'));
  se.drag = null;
}
function seActivateDrag(d){
  if(d.active || d.dead) return;
  d.active = true;
  // Dragging a chip that's part of a multi-selection carries the whole selection.
  d.ids = (se.multi && se.sel.includes(d.id)) ? se.sel.slice() : [d.id];
  const ch = se.chipIndex[d.id];
  const ghost = document.createElement('div');
  ghost.className = 'se-ghost';
  ghost.textContent = d.ids.length > 1 ? `${d.ids.length} chips` : (ch ? ch.label : '');
  ghost.style.left = (d.x + 12) + 'px';
  ghost.style.top = (d.y - 18) + 'px';
  document.body.appendChild(ghost);
  d.ghost = ghost;
  const { grid, scroll } = seEls();
  d.ids.forEach(id => {
    const src = grid.querySelector(`.se-chip[data-id="${CSS.escape(id)}"]`);
    if(src) src.classList.add('dragging');
  });
  // Scroll the calendar when the chip is held near its edge.
  d.timer = setInterval(() => {
    const r = scroll.getBoundingClientRect();
    if(d.y < r.top + 56) scroll.scrollTop -= 14; else if(d.y > r.bottom - 56) scroll.scrollTop += 14;
    if(d.x < r.left + 40) scroll.scrollLeft -= 14; else if(d.x > r.right - 40) scroll.scrollLeft += 14;
    seUpdateDropTarget(d.x, d.y);
  }, 40);
  seUpdateDropTarget(d.x, d.y);
}
// Arrow keys: ← → move the selected chip to the previous / next working day; ↑ ↓ to the same weekday a week
// earlier / later (or the nearest working day if that one is off). A move redraws the calendar and clears the
// selection, so the chip is picked up again afterwards and the keys can be pressed again.
function seKeyMove(ch, step){
  const dir = step < 0 ? -1 : 1;
  let to;
  if(Math.abs(step) === 1){
    to = dir > 0 ? seNextWorking(ch.date, 1) : sePrevWorking(ch.date, 1);
  } else {
    to = seAddDays(ch.date, step);
    if(seIsOff(to)) to = dir > 0 ? seNextWorking(to, 1) : sePrevWorking(to, 1);
  }
  if(to < se.todayStr){ toast('Choose today or a later day'); return; }
  const first = ch.items[0];
  seMoveChips([ch.id], to);
  const moved = Object.values(se.chipIndex).find(c => c.items.indexOf(first) >= 0);
  if(!moved) return;
  se.sel = [moved.id];
  renderScheduleEditor();
  const el = seEls().grid.querySelector(`.se-chip[data-id="${CSS.escape(moved.id)}"]`);
  if(el && el.scrollIntoView) el.scrollIntoView({block:'nearest', inline:'nearest'});
}
function seBind(){
  if(seBound) return;
  seBound = true;
  const { grid, scroll, modal } = seEls();
  // On a touchscreen a tile is picked up by pressing and holding it for a moment (it lifts and
  // buzzes); a quick swipe starting on a tile just scrolls the calendar. A mouse drags straight away.
  grid.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.se-chip');
    if(!chip || !se || se.drag) return; // a second finger (pinch) must not replace the first
    const d = { id: chip.dataset.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId,
                touch: e.pointerType === 'touch', active: false, dead: false, ghost: null, timer: null, hold: null };
    se.drag = d;
    try{ chip.setPointerCapture(e.pointerId); }catch(err){}
    if(d.touch){
      d.hold = setTimeout(() => {
        d.hold = null;
        if(se && se.drag === d && !d.dead){ if(navigator.vibrate) navigator.vibrate(20); seActivateDrag(d); }
      }, SE_HOLD_MS);
    }
  });
  grid.addEventListener('pointermove', (e) => {
    const d = se && se.drag;
    if(!d || d.dead || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    if(!d.active && Math.hypot(d.x - d.sx, d.y - d.sy) > 8){
      if(d.touch){ // moved before the hold finished: the person is scrolling, not dragging
        d.dead = true;
        if(d.hold){ clearTimeout(d.hold); d.hold = null; }
        return;
      }
      seActivateDrag(d);
    }
    if(d.active){
      e.preventDefault();
      d.ghost.style.left = (d.x + 12) + 'px';
      d.ghost.style.top = (d.y - 18) + 'px';
      seUpdateDropTarget(d.x, d.y);
    }
  });
  // Once a tile has been picked up, the finger must move it rather than scroll the page.
  grid.addEventListener('touchmove', (e) => { if(se && se.drag && se.drag.active && e.cancelable) e.preventDefault(); }, {passive:false});
  grid.addEventListener('contextmenu', (e) => { if(e.target.closest('.se-chip')) e.preventDefault(); });
  grid.addEventListener('pointerup', (e) => {
    const d = se && se.drag;
    if(!d || e.pointerId !== d.pid) return;
    se.ignoreClickUntil = Date.now() + 350; // the click that follows a chip touch must not also hit the day underneath
    if(d.dead){ seEndDrag(); return; } // it was a scroll
    if(d.active){
      const cell = seCellAt(e.clientX, e.clientY);
      const ids = d.ids || [d.id];
      seEndDrag();
      if(cell) seMoveChips(ids, cell.dataset.date);
      else renderScheduleEditor();
    } else {
      // A tap: select (or deselect) the chip, ready to be placed with a tap on a day.
      const id = d.id;
      seEndDrag();
      seTapChip(id);
    }
  });
  grid.addEventListener('pointercancel', () => {
    const wasActive = se && se.drag && se.drag.active;
    seEndDrag();
    if(wasActive) renderScheduleEditor(); // a cancelled scroll must not redraw the calendar under the finger
  });
  // Tap a day while chips are selected to move them there; with nothing selected it selects the day
  // (used by Push back and Add job).
  grid.addEventListener('click', (e) => {
    if(!se || Date.now() < se.ignoreClickUntil || e.target.closest('.se-chip')) return;
    const histEl = e.target.closest('.se-hist');
    if(histEl && !se.sel.length){ seHistOpen(histEl.dataset.hist); return; }
    const noteEl = e.target.closest('.se-daynote');
    if(noteEl){ seNoteOpen(noteEl.dataset.note); return; }
    const cell = e.target.closest('.se-cell');
    if(!cell) return;
    const iso = cell.dataset.date;
    if(se.sel.length){ seMoveChips(se.sel, iso); return; }
    if(iso < se.todayStr) return;
    se.selDay = (se.selDay === iso) ? null : iso;
    renderScheduleEditor();
  });
  // Pinch with two fingers to zoom.
  let pinch = null;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroll.addEventListener('touchstart', (e) => {
    if(!se || e.touches.length !== 2) return;
    if(se.drag) seEndDrag();
    pinch = { d: dist(e.touches), z: se.zoom };
  }, {passive:true});
  scroll.addEventListener('touchmove', (e) => {
    if(!se || !pinch || e.touches.length !== 2) return;
    e.preventDefault();
    seSetZoom(pinch.z * dist(e.touches) / pinch.d, true);
  }, {passive:false});
  const pinchEnd = (e) => {
    if(!pinch || (e.touches && e.touches.length >= 2)) return;
    pinch = null;
    if(se) try{ localStorage.setItem(SE_ZOOM_KEY, String(se.zoom)); }catch(err){}
  };
  scroll.addEventListener('touchend', pinchEnd, {passive:true});
  scroll.addEventListener('touchcancel', pinchEnd, {passive:true});
  // Computer: Ctrl/Cmd + wheel (also what a trackpad pinch sends) zooms toward the pointer; a plain wheel
  // scrolls as normal. One notch of a mouse wheel is capped so it doesn't leap across the whole zoom range.
  let wheelSave = null;
  scroll.addEventListener('wheel', (e) => {
    if(!se || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = scroll.getBoundingClientRect();
    const dy = Math.max(-50, Math.min(50, e.deltaY));
    seSetZoom(se.zoom * Math.exp(-dy * 0.01), true, e.clientX - r.left, e.clientY - r.top);
    clearTimeout(wheelSave);
    wheelSave = setTimeout(() => { if(se) try{ localStorage.setItem(SE_ZOOM_KEY, String(se.zoom)); }catch(err){} }, 300);
  }, {passive:false});
  // Tapping the dimmed area behind a dialog closes it.
  modal.addEventListener('click', (e) => { if(e.target === modal) seCloseModal(); });
  document.addEventListener('keydown', (e) => {
    if(!se || !seEls().root.classList.contains('show')) return;
    if(e.key === 'Escape'){
      if(seModalOpen()) seCloseModal(); else if(seChangeSummary().total) seRequestReject(); // nothing to discard: Escape does nothing
      return;
    }
    // Everything below is for the calendar itself: not while a dialog is up, someone is typing in a field,
    // or a key is being held down (which would flood Undo with moves).
    if(seModalOpen() || e.repeat) return;
    const t = e.target, tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if(mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); seUndo(); return; }
    if(e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey){
      if(tag === 'BUTTON') return; // Enter on a focused button already presses it
      e.preventDefault(); seReviewOpen(); return;
    }
    const step = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 }[e.key];
    if(!step || mod || e.shiftKey || e.altKey || se.sel.length !== 1) return;
    const ch = se.chipIndex[se.sel[0]];
    if(!ch) return;
    e.preventDefault();
    seKeyMove(ch, step);
  });
}

/* ---------- dialogs ---------- */
function seModal(html){
  const { modal, card } = seEls();
  card.innerHTML = html; card.scrollTop = 0;
  // A dialog with a box to type in (or a date picker) opens at the top and tracks the visible area, so the
  // keyboard can't cover it — the same rule the sheets follow (see trackKeyboardFit in 03-customers.js).
  const typing = !!card.querySelector(SHEET_TEXT_ENTRY);
  modal.classList.toggle('top', typing);
  if(typing) trackKeyboardFit(modal); else untrackKeyboardFit(modal);
  modal.classList.add('show');
}
function seCloseModal(){
  const { modal, card } = seEls();
  if(modal){ modal.classList.remove('show', 'top'); untrackKeyboardFit(modal); }
  if(card) card.innerHTML = '';
}
// The ? in the corner: the Schedule help, shown in the editor's own dialog (the normal help pop-up would open
// underneath the full-screen editor and be hidden).
function seHelpOpen(){
  seModal(`
    <h3>Schedule help</h3>
    ${FOCUSED_HELP.schedule.body().join('')}
    <div class="se-btn-row"><button class="se-btn primary" onclick="seCloseModal()">Done</button></div>
  `);
}
function seModalOpen(){ const { modal } = seEls(); return !!modal && modal.classList.contains('show'); }

/* --- ☔ Push back --- */
function sePushBackOpen(){
  if(!se) return;
  let def = se.selDay || (se.sel.length && se.chipIndex[se.sel[0]] ? se.chipIndex[se.sel[0]].date : se.todayStr);
  if(def < se.todayStr) def = se.todayStr;
  seModal(`
    <h3>☔ Push back</h3>
    <p class="se-note">Moves work to a later working day — handy when rain stops play. Sundays and any days you’ve marked off are skipped.</p>
    <label>Day to push back</label>
    <input type="date" id="sePbDay" value="${def}" min="${se.todayStr}" onchange="sePushBackPreview()">
    <label>Push back</label>
    <div class="se-radios">
      <label class="se-radio"><input type="radio" name="sePbScope" value="day" checked onchange="sePushBackPreview()"> Just that day</label>
      <label class="se-radio"><input type="radio" name="sePbScope" value="after" onchange="sePushBackPreview()"> That day and every day after it</label>
    </div>
    <label>By</label>
    <select id="sePbBy" onchange="sePushBackPreview()">
      ${[1,2,3,4,5].map(n => `<option value="${n}">${n} working day${n === 1 ? '' : 's'}</option>`).join('')}
    </select>
    <div class="se-preview" id="sePbPreview"></div>
    <div class="se-btn-row"><button class="se-btn" onclick="seCloseModal()">Cancel</button><button class="se-btn primary" onclick="sePushBackApply()">☔ Push back</button></div>
  `);
  sePushBackPreview();
}
function sePushBackPlan(){
  const day = document.getElementById('sePbDay').value;
  const scopeEl = document.querySelector('input[name="sePbScope"]:checked');
  const scope = scopeEl ? scopeEl.value : 'day';
  const by = Number(document.getElementById('sePbBy').value) || 1;
  if(!day || day < se.todayStr) return { error:'Choose today or a later day' };
  const hit = se.items.filter(it => !seIsParked(it) && (scope === 'after' ? it.date >= day : it.date === day));
  return { day, scope, by, moves: hit.map(it => ({ it, to: seNextWorking(it.date, by) })) };
}
function sePushBackPreview(){
  const el = document.getElementById('sePbPreview');
  if(!el || !se) return;
  const p = sePushBackPlan();
  if(p.error){ el.textContent = p.error; return; }
  if(!p.moves.length){ el.textContent = 'Nothing is booked on ' + (p.scope === 'after' ? 'or after ' : '') + seFmtDay(p.day) + '.'; return; }
  const c = p.moves.filter(m => m.it.kind === 'c').length, j = p.moves.length - c;
  const what = [c ? sePlural(c, 'customer') : '', j ? sePlural(j, 'job') : ''].filter(Boolean).join(' and ');
  const first = p.moves[0];
  el.textContent = `${what} will move back ${sePlural(p.by, 'working day')}` + (p.scope === 'day' ? ` — ${seFmtDay(p.day)} → ${seFmtDay(first.to)}.` : ` (for example ${seFmtDay(first.it.date)} → ${seFmtDay(first.to)}).`);
}
function sePushBackApply(){
  const p = sePushBackPlan();
  if(p.error){ toast(p.error); return; }
  if(!p.moves.length){ toast('Nothing is booked then'); return; }
  sePush();
  p.moves.forEach(m => { m.it.date = m.to; });
  se.sel = []; se.selDay = null;
  seCloseModal();
  renderScheduleEditor();
  toast(`Pushed back ${p.moves.length} ${p.moves.length === 1 ? 'item' : 'items'} — Commit to keep it`);
}

/* --- 👥 Move part of a round --- */
function seSplitOpen(){
  const ch = se && se.sel.length === 1 && se.chipIndex[se.sel[0]];
  if(!ch || ch.kind !== 'round'){ toast('Tap a round chip first'); return; }
  const rows = ch.items.map(it => {
    const c = data.customers.find(x => x.id === it.key) || {};
    return { key:it.key, name:c.address || c.name || 'Customer', price:it.price };
  }).sort((a, b) => a.name.localeCompare(b.name));
  let def = se.selDay && se.selDay >= se.todayStr && !seIsOff(se.selDay) ? se.selDay : seNextWorking(ch.date, 1);
  se.splitChipId = ch.id;
  seModal(`
    <h3>👥 ${escapeHtml(ch.label)}</h3>
    <p class="se-note">${sePlural(rows.length, 'customer')} on ${seFmtDay(ch.date)}. Tick the ones to move.</p>
    <div class="se-quick"><button class="se-link" onclick="seSplitTick(true)">Tick all</button><button class="se-link" onclick="seSplitTick(false)">Clear</button></div>
    <div class="se-list">
      ${rows.map(r => `<label class="se-row"><input type="checkbox" class="seSplitChk" value="${escapeAttr(r.key)}"><span class="se-row-name">${escapeHtml(r.name)}</span>${r.price ? `<span class="se-row-price">${money(r.price)}</span>` : ''}</label>`).join('')}
    </div>
    <label>Move ticked customers to</label>
    <input type="date" id="seSplitDate" value="${def}" min="${se.todayStr}">
    <div class="se-btn-row"><button class="se-btn" onclick="seCloseModal()">Cancel</button><button class="se-btn primary" onclick="seSplitApply()">Move ticked</button></div>
  `);
}
function seSplitTick(on){ document.querySelectorAll('.seSplitChk').forEach(c => { c.checked = on; }); }
function seSplitApply(){
  const ch = se.chipIndex[se.splitChipId];
  if(!ch){ seCloseModal(); return; }
  const keys = new Set(Array.from(document.querySelectorAll('.seSplitChk:checked')).map(c => c.value));
  if(!keys.size){ toast('Tick at least one customer'); return; }
  const iso = document.getElementById('seSplitDate').value;
  if(!iso || iso < se.todayStr){ toast('Choose today or a later day'); return; }
  if(seIsOff(iso)){ toast('That day is marked as off'); return; }
  sePush();
  ch.items.forEach(it => { if(keys.has(it.key)) it.date = iso; });
  se.sel = []; se.selDay = null;
  seCloseModal();
  renderScheduleEditor();
  toast(`Moved ${sePlural(keys.size, 'customer')} to ${seFmtDay(iso)}`);
}

/* --- ＋ Add a job straight onto a day --- */
function seAddJobOpen(){
  if(!se) return;
  let def = se.selDay && se.selDay >= se.todayStr ? se.selDay : se.todayStr;
  if(seIsOff(def)) def = seNextWorking(def, 1);
  const custs = data.customers.slice().sort((a, b) => (a.address || a.name || '').localeCompare(b.address || b.name || ''));
  seModal(`
    <h3>＋ Add a job</h3>
    <label>Fill from existing customer <span class="se-opt">(optional)</span></label>
    <select id="seJobCust" onchange="seJobFill(this.value)">
      <option value="">— Select a customer —</option>
      ${custs.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.address || c.name || 'Customer')}</option>`).join('')}
    </select>
    <label>Address</label><input type="text" id="seJobAddress" placeholder="e.g. 5 Oak Close">
    <label>Name <span class="se-opt">(optional)</span></label><input type="text" id="seJobName">
    <label>Price £ <span class="se-opt">(optional)</span></label><input type="number" id="seJobPrice" inputmode="decimal" step="0.01" min="0">
    <label>Notes <span class="se-opt">(optional)</span></label><input type="text" id="seJobNotes" placeholder="e.g. gutters + fascias">
    <label>Date</label><input type="date" id="seJobDate" value="${def}" min="${se.todayStr}">
    <input type="hidden" id="seJobCustId" value=""><input type="hidden" id="seJobPhone" value="">
    <p class="se-note">The job is added to One-off jobs when you Commit. Open it there later to add the phone number, photos and reminders.</p>
    <div class="se-btn-row"><button class="se-btn" onclick="seCloseModal()">Cancel</button><button class="se-btn primary" onclick="seAddJobApply()">Add job</button></div>
  `);
}
function seJobFill(id){
  const c = data.customers.find(x => x.id === id);
  document.getElementById('seJobCustId').value = c ? c.id : '';
  if(!c) return;
  document.getElementById('seJobAddress').value = c.address || '';
  document.getElementById('seJobName').value = c.name || '';
  document.getElementById('seJobPhone').value = c.phone || '';
  if(c.price != null) document.getElementById('seJobPrice').value = c.price;
}
function seAddJobApply(){
  const address = document.getElementById('seJobAddress').value.trim();
  const name = document.getElementById('seJobName').value.trim();
  if(!address && !name){ toast('Please enter at least an address or a name'); return; }
  const date = document.getElementById('seJobDate').value;
  if(!date || date < se.todayStr){ toast('Choose today or a later day'); return; }
  if(seIsOff(date)){ toast('That day is marked as off'); return; }
  const price = Math.max(0, Number(document.getElementById('seJobPrice').value) || 0);
  const notes = document.getElementById('seJobNotes').value.trim();
  const custId = document.getElementById('seJobCustId').value || null;
  const cust = custId ? data.customers.find(x => x.id === custId) : null;
  const job = Object.assign({
    id: uid(), done:false, paid:false, address, name,
    phone: document.getElementById('seJobPhone').value || '',
    date, time:'',
    items: (price || notes) ? [{ desc: notes, price }] : [],
    price, discountPercent:0, notes:'', remind24h:false, anniversaryReminder:false,
    customerId: custId, photos:[], paymentReminderSent:false, paymentReminderSentDate:null, paymentReminderCount:0, messageLog:[]
  }, typeof propertyDetailsOf === 'function' ? propertyDetailsOf(cust) : {});
  sePush();
  se.items.push({ kind:'j', key:job.id, label:'🔧 ' + (address || name), dispDate:date, date, overdue:false, due:date, price, isNew:true, job });
  se.sel = []; se.selDay = null;
  seCloseModal();
  renderScheduleEditor();
  toast('Job added to ' + seFmtDay(date) + ' — Commit to keep it');
}

/* --- 📝 A note on a day --- */
// iso: the day (tapping an existing note passes it); with none given, the day currently selected. Notes are part of the
// draft like days off: nothing is kept until Commit.
function seNoteOpen(iso){
  if(!se) return;
  iso = (typeof iso === 'string' && iso) ? iso : se.selDay;
  if(!iso){ toast('Tap a day first, then 📝 Note'); return; }
  const cur = se.notes[iso] || '';
  seModal(`
    <h3>📝 ${seFmtDay(iso)}</h3>
    <p class="se-note">A reminder for the day — it shows on the calendar and on Today once you Commit.</p>
    <textarea id="seNoteText" maxlength="300" placeholder="e.g. Dentist at 2 — finish by 1pm">${escapeHtml(cur)}</textarea>
    <div class="se-btn-row">
      ${cur ? `<button class="se-btn danger" onclick="seNoteApply('${iso}', true)">Remove note</button>` : `<button class="se-btn" onclick="seCloseModal()">Cancel</button>`}
      <button class="se-btn primary" onclick="seNoteApply('${iso}', false)">Save note</button>
    </div>
  `);
}
function seNoteApply(iso, remove){
  if(!se) return;
  const text = remove ? '' : document.getElementById('seNoteText').value.trim().replace(/\s+/g, ' ');
  if((se.notes[iso] || '') === text){ seCloseModal(); return; }
  sePush();
  if(text) se.notes[iso] = text; else delete se.notes[iso];
  se.sel = [];
  seCloseModal();
  renderScheduleEditor();
}

/* --- 🚫 Days off --- */
const SE_DAY_ORDER = [1,2,3,4,5,6,0];
const SE_DAY_NAMES = {0:'Sun',1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat'};
function seDaysOffHtml(){
  const up = se.blocked.filter(d => d >= se.todayStr).sort();
  const def = (se.selDay && se.selDay >= se.todayStr) ? se.selDay : '';
  return `
    <h3>🚫 Days off</h3>
    <p class="se-note">Days off are greyed out, refuse drops, and are skipped by Push back.</p>
    <label>Regular days off</label>
    <div class="se-days">${SE_DAY_ORDER.map(d => `<button class="se-day${se.offWeekdays.includes(d) ? ' off' : ''}" onclick="seToggleWeekday(${d})">${SE_DAY_NAMES[d]}</button>`).join('')}</div>
    <label>Mark days off (holiday, appointment…)</label>
    <div class="se-range"><div><span class="se-opt">From</span><input type="date" id="seOffFrom" value="${def}" min="${se.todayStr}"></div><div><span class="se-opt">To <i>(optional)</i></span><input type="date" id="seOffTo" min="${se.todayStr}"></div></div>
    <button class="se-btn" style="width:100%; margin-top:8px;" onclick="seMarkOff()">🚫 Mark as off</button>
    ${up.length ? `<label>Marked off</label><div class="se-chips-off">${up.map(d => `<span class="se-offchip">${seFmtDay(d)}<button onclick="seUnblock('${d}')" aria-label="Make ${seFmtDay(d)} a working day">✕</button></span>`).join('')}</div>` : ''}
    <div class="se-btn-row"><button class="se-btn primary" onclick="seCloseModal()">Done</button></div>`;
}
function seDaysOffOpen(){ if(se) seModal(seDaysOffHtml()); }
function seToggleWeekday(d){
  const on = se.offWeekdays.includes(d);
  const next = on ? se.offWeekdays.filter(x => x !== d) : se.offWeekdays.concat([d]);
  if(next.length >= 7){ toast('Keep at least one working day'); return; }
  sePush();
  se.offWeekdays = next;
  seAfterOffChange(on ? null : (iso => seDow(iso) === d));
}
function seMarkOff(){
  const from = document.getElementById('seOffFrom').value;
  const to = document.getElementById('seOffTo').value || from;
  if(!from){ toast('Choose the first day'); return; }
  if(from < se.todayStr){ toast('Choose today or a later day'); return; }
  if(to < from){ toast('The last day must not be before the first'); return; }
  if(isoToDays(to) - isoToDays(from) > 60){ toast('Up to 60 days at a time'); return; }
  const added = [];
  for(let d = from; d <= to; d = seAddDays(d, 1)) if(!se.blocked.includes(d) && !se.offWeekdays.includes(seDow(d))) added.push(d);
  if(!added.length){ toast('Those days are already off'); return; }
  sePush();
  se.blocked = se.blocked.concat(added).sort();
  const set = new Set(added);
  seAfterOffChange(iso => set.has(iso));
}
function seUnblock(iso){
  sePush();
  se.blocked = se.blocked.filter(d => d !== iso);
  seAfterOffChange(null);
}
// After days off change: if anything is now sitting on a day off, offer to move it.
function seAfterOffChange(pred){
  const stuck = pred ? se.items.filter(it => !seIsParked(it) && it.date >= se.todayStr && pred(it.date) && seIsOff(it.date)) : [];
  renderScheduleEditor();
  if(!stuck.length){ seModal(seDaysOffHtml()); return; }
  se.offPending = stuck;
  seModal(`
    <h3>Move them?</h3>
    <p class="se-note">${sePlural(stuck.length, 'customer or job')} ${stuck.length === 1 ? 'is' : 'are'} booked on a day you’ve just marked off. Move ${stuck.length === 1 ? 'it' : 'them'} to the next working day?</p>
    <div class="se-btn-row"><button class="se-btn" onclick="seDaysOffOpen()">Leave ${stuck.length === 1 ? 'it' : 'them'}</button><button class="se-btn primary" onclick="seMoveOffItems()">Move ${stuck.length === 1 ? 'it' : 'them'}</button></div>
  `);
}
function seMoveOffItems(){
  const stuck = se.offPending || [];
  if(stuck.length){ sePush(); stuck.forEach(it => { it.date = seNextWorking(it.date, 1); }); }
  se.offPending = null;
  renderScheduleEditor();
  seModal(seDaysOffHtml());
  if(stuck.length) toast(`Moved ${stuck.length} to the next working day`);
}

/* --- review before commit --- */
function seReviewOpen(){
  if(!se) return;
  const sum = seChangeSummary();
  if(!sum.total){ toast('Nothing has been changed yet'); return; }
  const groups = {};
  se.items.filter(i => !i.isNew && i.kind === 'c' && i.date !== i.dispDate).forEach(i => {
    const k = i.label + '|' + i.dispDate + '|' + i.date + '|' + (i.parked ? 1 : 0);
    (groups[k] = groups[k] || { label:(i.first ? '🆕 ' : '') + i.label, from:i.dispDate, to:i.date, n:0, parked:!!i.parked }).n++;
  });
  const lines = [];
  Object.values(groups).sort((a, b) => a.from.localeCompare(b.from) || a.label.localeCompare(b.label)).forEach(g =>
    lines.push(`<li><b>${escapeHtml(g.label)}</b> — ${sePlural(g.n, 'customer')}<br><span class="se-from">${g.parked ? 'first clean, not booked' : seFmtDay(g.from)}</span> → <b>${seFmtDay(g.to)}</b></li>`));
  se.items.filter(i => !i.isNew && i.kind === 'j' && i.date !== i.dispDate).forEach(i =>
    lines.push(`<li><b>${escapeHtml(i.label)}</b><br><span class="se-from">${seFmtDay(i.dispDate)}</span> → <b>${seFmtDay(i.date)}</b></li>`));
  se.items.filter(i => i.isNew).forEach(i =>
    lines.push(`<li><b>New:</b> ${escapeHtml(i.label)}<br>on <b>${seFmtDay(i.date)}</b></li>`));
  if(sum.offAdded.length) lines.push(`<li>🚫 Marked off: ${sum.offAdded.map(seFmtDay).join(', ')}</li>`);
  if(sum.offRemoved.length) lines.push(`<li>✅ Working again: ${sum.offRemoved.map(seFmtDay).join(', ')}</li>`);
  sum.noteDays.forEach(d => lines.push(se.notes[d] ? `<li>📝 ${seFmtDay(d)}: ${escapeHtml(se.notes[d])}</li>` : `<li>📝 Note removed from ${seFmtDay(d)}</li>`));
  if(sum.wdChanged) lines.push(`<li>Regular days off: ${se.offWeekdays.length ? SE_DAY_ORDER.filter(d => se.offWeekdays.includes(d)).map(d => SE_DAY_NAMES[d]).join(', ') : 'none'}</li>`);
  seModal(`
    <h3>Review changes</h3>
    <ul class="se-review">${lines.join('')}</ul>
    <div class="se-btn-row"><button class="se-btn" onclick="seCloseModal()">Back to editing</button><button class="se-btn go" onclick="commitSchedule()">✓ Commit</button></div>
  `);
}

/* ---------- commit / reject ---------- */
// Ends the draft (Commit or Reject). The tab stays open, so a fresh calendar — built from the data as it now stands —
// takes its place straight away; if the tab isn't the one showing, the next visit builds it.
function closeScheduleEditor(){
  seEndDrag();
  seCloseModal();
  se = null;
  if(currentTab === 'schedule') openScheduleEditor();
  else seHide();
  if(typeof liveUiFreed === 'function') liveUiFreed(); // live sync may have been waiting on the draft
}
// Reject button / Escape: asks first if anything has been changed.
function seRequestReject(){
  if(!se) return;
  const n = seChangeSummary().total;
  if(!n){ rejectSchedule(); return; }
  seModal(`
    <h3>Discard your changes?</h3>
    <p class="se-note">${sePlural(n, 'change')} will be thrown away and the schedule stays as it was.</p>
    <div class="se-btn-row"><button class="se-btn" onclick="seCloseModal()">Keep editing</button><button class="se-btn danger" onclick="rejectSchedule()">✕ Discard</button></div>
  `);
}
function rejectSchedule(){
  const n = se ? seChangeSummary().total : 0;
  closeScheduleEditor();
  toast(n ? 'Changes discarded — schedule unchanged' : 'Schedule unchanged');
}
function commitSchedule(){
  if(!se) return;
  const sum = seChangeSummary();
  if(!sum.total){ toast('Nothing has been changed yet'); return; }
  let customers = 0, jobs = 0, added = 0;
  const snap = { cust:[], jobs:[], addedJobs:[], settings:null, notes:null }; // how things were, so the commit can be undone
  se.items.forEach(it => {
    if(it.isNew){
      it.job.date = it.date;
      snap.addedJobs.push(it.job.id);
      (data.oneOffJobs = data.oneOffJobs || []).push(it.job);
      added++;
      return;
    }
    if(it.date === it.dispDate) return;
    if(it.kind === 'j'){
      const j = (data.oneOffJobs || []).find(x => x.id === it.key);
      if(j){ snap.jobs.push({ id:j.id, date:j.date }); j.date = it.date; jobs++; }
      return;
    }
    const c = data.customers.find(x => x.id === it.key);
    if(!c) return;
    snap.cust.push({ id:c.id, had:('dueOverride' in c), dueOverride: c.dueOverride == null ? c.dueOverride : JSON.parse(JSON.stringify(c.dueOverride)), deferUntil: c.deferUntil });
    // Back onto the day the normal rules would give? Then no hand-set date is needed.
    if(it.date === computedDueISO(c)) c.dueOverride = null;
    else c.dueOverride = { date: it.date, base: lastDateOf(c.cleanHistory) || '' };
    c.deferUntil = null; // the new date replaces any deferral
    customers++;
  });
  data.settings = data.settings || {};
  if(sum.offAdded.length || sum.offRemoved.length || sum.wdChanged){
    snap.settings = { blockedDays: JSON.parse(JSON.stringify(data.settings.blockedDays === undefined ? null : data.settings.blockedDays)), hadBlocked: data.settings.blockedDays !== undefined,
                      off: JSON.parse(JSON.stringify(data.settings.scheduleOffWeekdays === undefined ? null : data.settings.scheduleOffWeekdays)), hadOff: data.settings.scheduleOffWeekdays !== undefined };
  }
  if(sum.offAdded.length || sum.offRemoved.length) data.settings.blockedDays = se.blocked.slice();
  if(sum.wdChanged) data.settings.scheduleOffWeekdays = se.offWeekdays.slice();
  if(sum.noteDays.length){
    snap.notes = { had: data.settings.dayNotes !== undefined, value: JSON.parse(JSON.stringify(data.settings.dayNotes === undefined ? null : data.settings.dayNotes)) };
    // Keep only notes from the last few months on; an old one has nothing left to say.
    const keepFrom = seAddDays(se.todayStr, -120);
    const kept = {};
    Object.keys(se.notes).forEach(d => { if(d >= keepFrom && se.notes[d]) kept[d] = se.notes[d]; });
    data.settings.dayNotes = kept;
  }
  closeScheduleEditor();
  saveData();
  render();
  const bits = [];
  if(customers) bits.push(sePlural(customers, 'customer'));
  if(jobs) bits.push(sePlural(jobs, 'job'));
  let msg = bits.length ? `Schedule updated — ${bits.join(' and ')} moved` : 'Schedule updated';
  if(added) msg += `${bits.length ? ', ' : ' — '}${sePlural(added, 'job')} added`;
  toast(msg, 'Undo', () => seUndoCommit(snap), 15000); // a long-ish window, in case it was done by accident
}
// Puts back exactly what the last Commit changed.
function seUndoCommit(snap){
  snap.cust.forEach(o => {
    const c = data.customers.find(x => x.id === o.id);
    if(!c) return;
    if(o.had) c.dueOverride = o.dueOverride; else delete c.dueOverride;
    c.deferUntil = o.deferUntil;
  });
  snap.jobs.forEach(o => { const j = (data.oneOffJobs || []).find(x => x.id === o.id); if(j) j.date = o.date; });
  if(snap.addedJobs.length) data.oneOffJobs = (data.oneOffJobs || []).filter(j => !snap.addedJobs.includes(j.id));
  if(snap.settings){
    data.settings = data.settings || {};
    if(snap.settings.hadBlocked) data.settings.blockedDays = snap.settings.blockedDays; else delete data.settings.blockedDays;
    if(snap.settings.hadOff) data.settings.scheduleOffWeekdays = snap.settings.off; else delete data.settings.scheduleOffWeekdays;
  }
  if(snap.notes){
    data.settings = data.settings || {};
    if(snap.notes.had) data.settings.dayNotes = snap.notes.value; else delete data.settings.dayNotes;
  }
  saveData();
  render();
  toast('Schedule change undone');
}
