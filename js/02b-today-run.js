/* 02b-today-run.js -- the Today tab's Start / Stop run, the day's to-do list and the progress bar.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html, straight after 02-today-rounds.js,
   whose renderTodayHome() uses everything here.

   Pressing Start swaps the tiles under the hero for the day's to-do list: everyone due today (the same people, in the
   order a round's own Due list uses — your visiting route — and as the same swipeable cards), plus today's one-off jobs. The hero and its Start / Stop
   buttons stay locked in place while the list scrolls underneath. Anyone you finish stays in the list (dimmed, so you
   can see what's done) rather than vanishing, and from the second one onwards the list moves up after each so the
   previous one is always still showing at the top. Stop puts the tiles back.
   While a run is going the hero shrinks to the totals and the progress bar (the round chips are hidden; the round picked when
   Start was pressed stays). The progress bar at the bottom of the hero is done / (done + still to do) — it's there whether or not a run is going. */

/* ---------- the run itself ----------
   {date, scope, done:[keys], seq:[keys]}
   keys are 'c:<customer id>' or 'j:<job id>'. done is who was finished at the last redraw, and seq is the order
   things were finished in since Start. (The order of the list itself isn't stored: it is always the visiting route, which
   finishing someone doesn't change, so a finished card simply stays where it is.) Remembered on this device
   only (localStorage, like the schedule zoom) so a reload mid-round carries on; it lapses at the end of the day. */
const TODAY_RUN_KEY = 'roundBookTodayRun';
let todayRunMem = null, todayRunLoaded = false;
// Start / Stop is off on the wide split view — an iPad held sideways, or a computer — where Today is laid out in two columns
// (isWideSplitView, 03-customers.js): the buttons are not shown and no run can be active, so Today keeps its tiles. A phone
// (even on its side), an iPad held upright and a tablet-sized phone all have the single-column Today and keep the feature.
function todayRunAvailable(){ return !(typeof isWideSplitView === 'function' && isWideSplitView()); }
function todayRunState(){
  if(!todayRunAvailable()) return null; // a run left over from before (it's kept on the device) stays dormant here
  if(!todayRunLoaded){
    todayRunLoaded = true;
    try{ todayRunMem = JSON.parse(localStorage.getItem(TODAY_RUN_KEY) || 'null'); }catch(e){ todayRunMem = null; }
  }
  if(todayRunMem && todayRunMem.date !== todayISO()){ todayRunMem = null; todayRunSave(); } // yesterday's run is over
  return todayRunMem;
}
function todayRunSave(){
  try{ if(todayRunMem) localStorage.setItem(TODAY_RUN_KEY, JSON.stringify(todayRunMem)); else localStorage.removeItem(TODAY_RUN_KEY); }catch(e){}
}
function todayRunActive(){ return !!todayRunState() && currentTab === 'today'; }

/* ---------- who is on the list ---------- */
// Everyone due now (the Due list's own test), anyone already cleaned today, and — when no single round is picked —
// today's one-off jobs. Jobs belong to no round, so picking a round leaves them out of the list and the progress alike.
function todayEligibleRows(scope){
  const today = todayISO();
  const rows = [];
  statCustomers().forEach(c => {
    const rn = c.round || 'Unassigned';
    if(scope && rn !== scope) return;
    const done = lastDateOf(c.cleanHistory) === today;
    const s = custStatus(c);
    const due = !c.paused && s.cleanBadge && s.cleanBadge.type === 'due';
    if(done || due) rows.push({ key:'c:' + c.id, type:'c', round:rn, obj:c, done });
  });
  if(!scope){
    (data.oneOffJobs || []).forEach(j => {
      if(j.date === today) rows.push({ key:'j:' + j.id, type:'j', round:'Jobs', obj:j, done:!!j.done });
    });
  }
  return rows;
}
// Customers in your visiting route — visit day, then the order set under Reorder — exactly as a round's own Due list
// shows them (sortByRoute, 02-today-rounds.js), then one-off jobs by address. Finished customers keep their place in the
// route rather than dropping to the bottom, so the list reads like the round does. The list draws each round as its own
// group (rounds A to Z), so only the order within a round matters here.
function todayOrderRows(rows){
  const custRows = rows.filter(r => r.type === 'c');
  const byId = new Map(custRows.map(r => [r.obj.id, r]));
  const routed = sortByRoute(custRows.map(r => r.obj)).map(c => byId.get(c.id));
  const jobs = rows.filter(r => r.type === 'j').sort((a, b) => (a.obj.address || '').localeCompare(b.obj.address || ''));
  return routed.concat(jobs);
}
// The list as it should be drawn now, with the counts the progress bar uses. Anyone newly due appears in their place in
// the route; anyone no longer due or scheduled drops off; and a change of round starts the run's tally over.
function todayListModel(){
  const scope = todaySelectedRound || null;
  const rows = todayEligibleRows(scope);
  const run = todayRunState();
  if(run && (run.scope || null) !== scope){
    run.scope = scope;
    run.done = rows.filter(r => r.done).map(r => r.key);
    run.seq = [];
    todayRunSave();
  }
  const ordered = todayOrderRows(rows);
  const done = ordered.filter(r => r.done).length;
  const total = ordered.length;
  return { rows: ordered, done, total, pct: total ? Math.round(done / total * 100) : 0, scope };
}

/* ---------- pieces the Today screen draws ---------- */
// pinned: the note sits inside the pinned top block during a run, so it stays in view above the big card while the
// list scrolls; a very long note scrolls inside its own box rather than taking over the screen.
function todayNoteHtml(note, pinned){
  return `<div style="margin:0 0 ${pinned ? '8px' : '10px'}; padding:8px 10px; border-radius:10px; background:var(--amber-dim); color:var(--ink); font-size:0.8125rem; font-weight:700; line-height:1.4;${pinned ? ' max-height:5.6em; overflow-y:auto;' : ''}">📝 ${escapeHtml(note)}</div>`;
}
// Bottom of the hero: 0% to 100% of today's list finished.
function todayProgressHtml(model){
  if(!model.total) return '';
  return `<div class="hero-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${model.pct}" aria-label="Jobs completed today">
      <div class="hero-progress-fill" style="width:${model.pct}%;"></div>
    </div>
    <div class="hero-progress-lbl"><span>${model.done} of ${model.total} done</span><span>${model.pct}%</span></div>`;
}
// The two small buttons under the hero (and, when one round is picked, a way back to all of them — the hero's round
// chips only ever pick a round, so without this a list narrowed to one round couldn't be widened again).
function todayRunBarHtml(running){
  if(!todayRunAvailable()) return todayWideListBarHtml();
  return `<div class="today-run-bar">
      <button class="run-btn start" onclick="startTodayRun()"${running ? ' disabled' : ''}>▶ Start</button>
      <button class="run-btn stop" onclick="stopTodayRun()"${running ? '' : ' disabled'}>■ Stop</button>
      <button class="run-btn tool" onclick="showTodayMap()" title="Map and route of who is still to do">🗺 Map</button>
      <button class="run-btn tool" onclick="openTodayReorder()" title="Change the visiting order">⇅ Reorder</button>
      ${todaySelectedRound ? `<button class="run-btn all" onclick="clearTodayRound()" title="Show every round again">${escapeHtml(todaySelectedRound)} ✕</button>` : ''}
    </div>`;
}
// The list itself: grouped by round like Rounds > Due, with the very same cards, so swiping, tapping, the call and
// directions buttons and the right-click menu all behave identically. A finished customer is marked (dimmed, and told
// not to be cleaned a second time).
function todayRunListHtml(model, note){
  const today = todayISO();
  if(!model.total){
    return `<div class="today-run-list">${note ? todayNoteHtml(note) : ''}<div class="empty"><b>Nothing to do today</b><p>Nobody is due and there are no jobs booked for today.</p></div></div>`;
  }
  const groups = {};
  model.rows.forEach(r => (groups[r.round] = groups[r.round] || []).push(r));
  const names = Object.keys(groups).sort((a, b) => (a === 'Jobs') - (b === 'Jobs') || a.localeCompare(b));
  let html = `<div class="today-run-list">${note ? todayNoteHtml(note) : ''}`;
  names.forEach(rn => {
    const rows = groups[rn];
    const doneN = rows.filter(r => r.done).length;
    const head = `<span style="font-weight:600; color:var(--ink-muted); text-transform:none; letter-spacing:0;">(${doneN} of ${rows.length} done)</span>`;
    html += rn === 'Jobs'
      ? `<div class="round-group-header" style="display:flex; align-items:center; margin:18px 2px 8px;"><div class="section-label" style="margin:0;">One-off jobs ${head}</div></div>`
      : `<div class="round-group-header" data-ctx-kind="round" data-ctx-id="${escapeAttr(rn)}" style="display:flex; align-items:center; margin:18px 2px 8px;"><div class="section-label" style="margin:0; cursor:pointer;" onclick="goToRoundDue('${escapeAttr(rn)}')">${escapeHtml(rn)} ${head}</div></div>`;
    html += rows.map(r => {
      if(r.type === 'j') return jobCardHtml(r.obj, today);
      let card = custCardHtml(r.obj, 'due', { balance:true });
      if(r.done){
        card = card.replace('<div class="swipe-wrap">', '<div class="swipe-wrap today-done">').replace('data-kind="customer"', 'data-kind="customer" data-cleaned="1"');
      }
      return card;
    }).join('');
  });
  return html + '</div>';
}

/* ---------- read-only work list on the wide split view ----------
   On an iPad held sideways or a computer there is no Start / Stop run (todayRunAvailable), because cleans and payments are
   marked on the phone. What the wide Today screen can do instead is show the day's work list, view only: the same people
   in the same visiting order as the phone's list, grouped by round, with nothing on it that can be tapped, swiped or
   right-clicked, so a clean or a payment can't be marked from here by accident. Whether it is showing is remembered on this
   device only (localStorage). */
const TODAY_WIDE_LIST_KEY = 'roundBookTodayWideList';
function todayWideListOn(){
  if(todayRunAvailable()) return false;
  try{ return localStorage.getItem(TODAY_WIDE_LIST_KEY) === '1'; }catch(e){ return false; }
}
function toggleTodayWideList(){
  try{ localStorage.setItem(TODAY_WIDE_LIST_KEY, todayWideListOn() ? '0' : '1'); }catch(e){}
  render();
}
function todayWideListBarHtml(){
  const on = todayWideListOn();
  return `<div class="today-run-bar">
      <button class="run-btn ${on ? 'stop' : 'start'}" onclick="toggleTodayWideList()">${on ? '✕ Hide work list' : '📋 Show work list'}</button>
      <button class="run-btn tool" onclick="showTodayMap()" title="Map and route of who is still to do">🗺 Map</button>
      ${todaySelectedRound ? `<button class="run-btn all" onclick="clearTodayRound()" title="Show every round again">${escapeHtml(todaySelectedRound)} ✕</button>` : ''}
    </div>`;
}
function todayReadOnlyListHtml(model){
  const note = `<div class="ro-note">👁 View only — nothing on this list can be marked as cleaned or paid from here. It updates by itself when your phone syncs.</div>`;
  if(!model.total){
    return `<div class="today-ro-list">${note}<div class="empty"><b>Nothing to do today</b><p>Nobody is due and there are no jobs booked for today.</p></div></div>`;
  }
  const groups = {};
  model.rows.forEach(r => (groups[r.round] = groups[r.round] || []).push(r));
  const names = Object.keys(groups).sort((a, b) => (a === 'Jobs') - (b === 'Jobs') || a.localeCompare(b));
  let html = `<div class="today-ro-list">${note}`;
  names.forEach(rn => {
    const rows = groups[rn];
    const doneN = rows.filter(r => r.done).length;
    const head = `<span style="font-weight:600; color:var(--ink-muted); text-transform:none; letter-spacing:0;">(${doneN} of ${rows.length} done)</span>`;
    html += `<div class="round-group-header" style="display:flex; align-items:center; margin:18px 2px 8px;"><div class="section-label" style="margin:0;">${rn === 'Jobs' ? 'One-off jobs' : escapeHtml(rn)} ${head}</div></div>`;
    html += rows.map(r => r.type === 'j' ? todayReadOnlyJobHtml(r.obj, r.done) : todayReadOnlyCustHtml(r.obj, r.done)).join('');
  });
  return html + '</div>';
}
function todayReadOnlyCustHtml(c, done){
  const s = custStatus(c);
  const roundCustomers = data.customers.filter(x => (x.round || 'Unassigned') === (c.round || 'Unassigned'));
  const showDay = roundDaysUsed(roundCustomers).length > 1;
  const badges = [];
  if(done) badges.push(`<span class="badge ok">✓ Cleaned</span>`);
  else if(s.cleanBadge && s.cleanBadge.type === 'due') badges.push(`<span class="badge due">${escapeHtml(s.cleanBadge.text)}</span>`);
  if(s.owed) badges.push(`<span class="badge owed">Owes ${money(s.balance)}</span>`);
  if(c.frontsOnly) badges.push(`<span class="badge paused">Fronts only</span>`);
  if(c.textBeforeVisit) badges.push(`<span class="badge paused">💬 Text first</span>`);
  if(showDay) badges.push(`<span class="badge anniversary">Day ${c.visitDay || 1}</span>`);
  if(typeof couldntCleanActive === 'function' && couldntCleanActive(c)) badges.push(`<span class="badge escalate">🚫 Couldn’t clean last time</span>`);
  const who = [c.name || '', c.phone || ''].filter(Boolean).map(escapeHtml).join(' · ');
  return `<div class="ro-card${done ? ' done' : ''}">
      <div class="ro-top">
        <div style="min-width:0;"><div class="ro-addr">${escapeHtml(c.address || 'No address')}</div>${who ? `<div class="ro-sub">${who}</div>` : ''}${c.notes ? `<div class="ro-note-line">📝 ${escapeHtml(c.notes)}</div>` : ''}</div>
        <div class="ro-price">${money(c.price)}</div>
      </div>
      ${badges.length ? `<div class="ro-meta">${badges.join('')}</div>` : ''}
    </div>`;
}
function todayReadOnlyJobHtml(j, done){
  const when = (j.date ? fmtDate(j.date) : '') + (j.time ? ` at ${fmtTime(j.time)}` : '');
  const who = [j.name || '', j.phone || ''].filter(Boolean).map(escapeHtml).join(' · ');
  return `<div class="ro-card${done ? ' done' : ''}">
      <div class="ro-top">
        <div style="min-width:0;"><div class="ro-addr">${escapeHtml(j.address || 'No address')}</div>${who ? `<div class="ro-sub">${who}</div>` : ''}${when ? `<div class="ro-sub">${escapeHtml(when)}</div>` : ''}</div>
        <div class="ro-price">${money(j.price)}</div>
      </div>
      <div class="ro-meta">${done ? '<span class="badge ok">Done</span>' : '<span class="badge due">Not done</span>'}${j.paid ? '<span class="badge ok">Paid</span>' : ''}</div>
    </div>`;
}

/* ---------- map and route of who is still to do ----------
   The same map as a round's (showCustomersMap, 02-today-rounds.js) with a pin for everyone on today's list who has not been
   done yet, numbered in visiting order and joined by the route line; the "Start round — directions" button opens the same
   people in Google Maps. Round by round (A to Z) like the list itself, each in its own route order. Customers only: a
   one-off job has no saved pin. Finishing someone takes them off the map next time it is opened. */
function todayToDoCustomers(){
  const groups = {};
  todayListModel().rows.forEach(r => { if(r.type === 'c' && !r.done && !r.obj.paused) (groups[r.round] = groups[r.round] || []).push(r.obj); });
  return groups;
}
function todayMapCustomers(){
  const groups = todayToDoCustomers();
  return Object.keys(groups).sort((a, b) => a.localeCompare(b)).reduce((all, rn) => all.concat(groups[rn].filter(c => c.address)), []);
}
async function showTodayMap(){
  const custs = todayMapCustomers();
  if(!custs.length){
    toast(todayListModel().total ? 'Nobody left to do on today’s list' : 'Nothing to map — nobody is due today');
    return;
  }
  await showCustomersMap(custs, { title: (todaySelectedRound ? todaySelectedRound + ' — ' : '') + 'To do today', directions: 'startTodayDirections()' });
}
function startTodayDirections(){
  startDirectionsFor(todayMapCustomers().map(c => c.address), 'To do today', null);
}

/* ---------- reorder (phone only) ----------
   ⇅ Reorder, beside Start / Stop, opens a sheet with everyone still to do, grouped by round: drag the ⠿ handle or use ▲ ▼.
   It changes the round's own visiting order (the same order Rounds > Reorder sets, via reorderRoundSubset), so it is kept for
   next time too. Anyone already done keeps their place; nobody can be moved into another visit day's stretch. */
let todayReorderOpen = false, todayReorderDrag = null;
function openTodayReorder(){
  if(!todayRunAvailable()) return;
  if(!Object.keys(todayToDoCustomers()).length){ toast('Nobody left to reorder on today’s list'); return; }
  todayReorderOpen = true;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Reorder today’s list</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 12px; line-height:1.4;">Drag the dots, or use ▲ ▼, to change the order you visit. This changes the round’s visiting order for next time too. Anyone already done keeps their place.</p>
    <div id="reorderList">${todayReorderRowsHtml()}</div>
  `, () => { todayReorderOpen = false; todayReorderDrag = null; render(); });
}
function todayReorderRowsHtml(){
  const groups = todayToDoCustomers();
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  return names.map(rn => {
    const list = groups[rn];
    let html = names.length > 1 ? `<div class="section-label" style="margin:14px 2px 8px;">${escapeHtml(rn)}</div>` : '';
    const dayN = {};
    list.forEach((c, i) => {
      const day = c.visitDay || 1;
      dayN[day] = (dayN[day] || 0) + 1;
      const first = i === 0 || (list[i-1].visitDay || 1) !== day;
      const last = i === list.length - 1 || (list[i+1].visitDay || 1) !== day;
      html += `
      <div class="cust-card reorder-row" data-id="${c.id}" data-rn="${escapeAttr(rn)}" data-day="${escapeAttr(rn + '|' + day)}" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <button type="button" onpointerdown="todayReorderDragStart(event,'${c.id}')" style="background:none; border:none; padding:6px; margin:-6px; color:var(--ink-muted); cursor:grab; touch-action:none; flex-shrink:0;" aria-label="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
        </button>
        <div style="flex:1; min-width:0;">
          <div class="cust-addr" style="font-size:0.9375rem; font-weight:800;">${dayN[day]}. ${escapeHtml(c.address || 'No address')}</div>
          ${c.name ? `<div class="cust-name" style="font-size:0.8125rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.name)}</div>` : ''}
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button class="btn-open icon-plain" style="width:34px; height:28px; padding:0; opacity:${first ? '0.3' : '1'};" onclick="todayReorderMove('${c.id}','up')">▲</button>
          <button class="btn-open icon-plain" style="width:34px; height:28px; padding:0; opacity:${last ? '0.3' : '1'};" onclick="todayReorderMove('${c.id}','down')">▼</button>
        </div>
      </div>`;
    });
    return html;
  }).join('');
}
function todayReorderRefresh(){
  const el = document.getElementById('reorderList');
  if(!el){ return; }
  el.innerHTML = todayReorderRowsHtml();
}
// Puts one round's to-do customers in the order given (anyone not in the list keeps their place), then saves.
function todayReorderApply(rn, ordered){
  reorderRoundSubset(rn, ordered);
  saveData();
}
function todayReorderMove(id, dir){
  const c = data.customers.find(x => x.id === id);
  if(!c) return;
  const rn = c.round || 'Unassigned';
  const list = todayToDoCustomers()[rn] || [];
  const idx = list.findIndex(x => x.id === id);
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if(idx < 0 || swap < 0 || swap >= list.length) return;
  if((list[idx].visitDay || 1) !== (list[swap].visitDay || 1)){ toast('That’s the edge of the day — use the Day button on the round to move someone to another day'); return; }
  const ordered = list.slice();
  const t = ordered[idx]; ordered[idx] = ordered[swap]; ordered[swap] = t;
  todayReorderApply(rn, ordered);
  todayReorderRefresh();
}
// Dragging by the handle. The row follows the finger with a transform (no fixed positioning, so it works inside the sheet)
// and swaps past its neighbours in its own round and visit day; letting go saves the new order.
function todayReorderDragStart(e, id){
  e.preventDefault();
  const list = document.getElementById('reorderList');
  const row = list && list.querySelector(`.reorder-row[data-id="${id}"]`);
  if(!row) return;
  todayReorderDrag = { row, list, startY: e.clientY, grabTop: row.getBoundingClientRect().top };
  row.style.position = 'relative'; row.style.zIndex = '5'; row.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';
  document.addEventListener('pointermove', todayReorderDragMove);
  document.addEventListener('pointerup', todayReorderDragEnd, { once:true });
  document.addEventListener('pointercancel', todayReorderDragEnd, { once:true });
}
function todayReorderDragMove(e){
  const d = todayReorderDrag;
  if(!d) return;
  const { row, list } = d;
  row.style.transform = '';
  const h = row.getBoundingClientRect().height;
  const wantTop = d.grabTop + (e.clientY - d.startY);
  const mid = wantTop + h / 2;
  const sibs = [...list.querySelectorAll('.reorder-row')].filter(x => x !== row && x.dataset.day === row.dataset.day);
  let before = null;
  for(const x of sibs){ const r = x.getBoundingClientRect(); if(mid < r.top + r.height / 2){ before = x; break; } }
  if(before){ if(before !== row.nextElementSibling) list.insertBefore(row, before); }
  else if(sibs.length){ const last = sibs[sibs.length - 1]; if(last.nextElementSibling !== row) last.after(row); }
  row.style.transform = `translateY(${wantTop - row.getBoundingClientRect().top}px)`;
}
function todayReorderDragEnd(){
  const d = todayReorderDrag;
  document.removeEventListener('pointermove', todayReorderDragMove);
  if(!d) return;
  todayReorderDrag = null;
  d.row.style.transform = ''; d.row.style.position = ''; d.row.style.zIndex = ''; d.row.style.boxShadow = '';
  const byRound = {};
  [...d.list.querySelectorAll('.reorder-row')].forEach(el => {
    const c = data.customers.find(x => x.id === el.dataset.id);
    if(c) (byRound[el.dataset.rn] = byRound[el.dataset.rn] || []).push(c);
  });
  Object.keys(byRound).forEach(rn => todayReorderApply(rn, byRound[rn]));
  todayReorderRefresh();
}

/* ---------- keeping the iPad's work list up to date ----------
   The phone's changes reach the iPad through live sync, which checks every minute. While the work list is on screen the
   iPad checks every 20 seconds instead, so a clean or payment marked on the phone shows up (in the list and in the big card's
   numbers) within about half a minute of being made. These are reads of the shared copy; a check that finds nothing new
   costs nothing and sends nothing. */
setInterval(() => {
  try{
    if(typeof liveActive !== 'undefined' && liveActive && currentTab === 'today' && document.visibilityState === 'visible' && todayWideListOn()) liveSyncNow();
  }catch(e){}
}, 20 * 1000);

/* ---------- Start / Stop ---------- */
function startTodayRun(){
  if(!todayRunAvailable()) return;
  const scope = todaySelectedRound || null;
  const rows = todayEligibleRows(scope);
  if(!rows.length){ toast('Nothing due today to start on'); return; }
  todayRunMem = {
    date: todayISO(), scope,
    done: rows.filter(r => r.done).map(r => r.key), // finished before Start: not counted as a clean made during the run
    seq: []
  };
  todayRunSave();
  render();
  pageScrollTo(0);
}
function stopTodayRun(){
  todayRunMem = null;
  todayRunSave();
  render();
  pageScrollTo(0);
}
function clearTodayRound(){
  todaySelectedRound = null;
  render();
}

/* ---------- keeping the list moving ----------
   Runs after every redraw (render() in 02-today-rounds.js). It notices who has just been finished — whichever way it
   happened: a swipe, a button, the customer's own screen, an Undo — keeps seq up to date, and after the second
   finish scrolls the list so the one finished before the latest is at the top, just under the hero (and half a tile further, so it is half tucked away). After the first
   there is nothing above it to keep in view, so it doesn't move. */
function todayRunAfterRender(){
  const root = document.documentElement.style;
  const run = (currentTab === 'today') ? todayRunState() : null;
  const topEl = document.querySelector('#main .today-top.running');
  if(!run || !topEl){ root.setProperty('--today-lock', '0px'); return; }
  // On a wide screen the hero sits beside the list rather than over it, so nothing of the list is covered.
  const listEl = document.querySelector('#main .today-run-list');
  const sideBySide = !!listEl && listEl.getBoundingClientRect().left >= topEl.getBoundingClientRect().right - 4;
  root.setProperty('--today-lock', sideBySide ? '0px' : topEl.offsetHeight + 'px'); // lets keyboard / jump scrolling clear the hero too

  const doneNow = todayListModel().rows.filter(r => r.done).map(r => r.key);
  const newly = doneNow.filter(k => run.done.indexOf(k) < 0);
  const changed = newly.length || run.done.some(k => doneNow.indexOf(k) < 0);
  if(!changed) return;
  run.done = doneNow;
  run.seq = run.seq.filter(k => doneNow.indexOf(k) >= 0).concat(newly);
  todayRunSave();
  if(!newly.length || run.seq.length < 2) return;
  const prevKey = run.seq[run.seq.length - 2];
  const kind = prevKey.charAt(0) === 'j' ? 'job' : 'customer';
  const card = document.querySelector(`#main .cust-card[data-kind="${kind}"][data-id="${CSS.escape(prevKey.slice(2))}"]`);
  if(!card) return;
  // Stacked, the pinned hero covers the top of the list, so leave room for its height (read from its size, not its
  // position: it may not be pinned yet if the page is at the top). Side by side it covers nothing.
  // Scrolls on by about half a tile more, so the finished card is half tucked under the hero and the next one has room.
  pageScrollToEl(card, sideBySide ? 0 : topEl.offsetHeight, 10 - Math.round(card.offsetHeight / 2));
}

/* ---------- fireworks when the day's list reaches 100% ----------
   Runs after every redraw. When the progress bar goes from under 100% to 100% while you are looking at it (not merely on
   opening the app with everything already done), fireworks burst across the screen for a few seconds. It happens once for
   a given day, round choice and list size, so redrawing, an Undo and doing it again doesn't repeat it, but adding more
   to the list and finishing that does. The animation never blocks taps, and with "reduce motion" switched on in the
   device settings it shows a message instead. */
const FIREWORKS_KEY = 'roundBookFireworks';
let todayLastPct = null, todayLastScopeKey = null, fireworksRunning = false;
function fireworksSeen(key){
  try{ const o = JSON.parse(localStorage.getItem(FIREWORKS_KEY) || 'null'); return !!(o && o.date === todayISO() && o.keys.indexOf(key) >= 0); }catch(e){ return false; }
}
function fireworksMark(key){
  try{
    let o = JSON.parse(localStorage.getItem(FIREWORKS_KEY) || 'null');
    if(!o || o.date !== todayISO()) o = { date: todayISO(), keys: [] };
    if(o.keys.indexOf(key) < 0) o.keys.push(key);
    localStorage.setItem(FIREWORKS_KEY, JSON.stringify(o));
  }catch(e){}
}
function todayCelebrateAfterRender(){
  if(currentTab !== 'today') return;
  const m = todayListModel();
  const scopeKey = todayISO() + '|' + (m.scope || '');
  const prev = (todayLastScopeKey === scopeKey) ? todayLastPct : null; // changing round or day starts the comparison afresh
  todayLastScopeKey = scopeKey;
  todayLastPct = m.total ? m.pct : null;
  if(!m.total || m.pct < 100 || prev === null || prev >= 100) return;
  const key = scopeKey + '|' + m.total;
  if(fireworksSeen(key)) return;
  fireworksMark(key);
  launchFireworks(m.scope ? m.scope + ' is all done!' : 'All done for today!');
}
function launchFireworks(message){
  if(fireworksRunning) return;
  if(typeof haptic === 'function') haptic([30, 60, 30, 60, 90]);
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){ toast('\uD83C\uDF89 ' + message); return; }
  fireworksRunning = true;
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed; inset:0; width:100%; height:100%; z-index:2147482000; pointer-events:none;';
  const msg = document.createElement('div');
  msg.setAttribute('role', 'status');
  msg.textContent = '\uD83C\uDF89 ' + message;
  msg.style.cssText = 'position:fixed; left:50%; top:38%; transform:translate(-50%,-50%) scale(0.85); z-index:2147482001; pointer-events:none; padding:14px 22px; border-radius:18px; background:rgba(0,0,0,0.55); color:#fff; font-size:1.375rem; font-weight:800; text-align:center; max-width:86%; opacity:0; transition:opacity .5s ease, transform .5s ease;';
  document.body.appendChild(cv); document.body.appendChild(msg);
  requestAnimationFrame(() => { msg.style.opacity = '1'; msg.style.transform = 'translate(-50%,-50%) scale(1)'; });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.width = Math.round(innerWidth * dpr), H = cv.height = Math.round(innerHeight * dpr);
  const ctx = cv.getContext('2d');
  const colours = ['#FF5252', '#FFD740', '#69F0AE', '#40C4FF', '#E040FB', '#FF9100', '#FFFFFF'];
  const rockets = [], sparks = [];
  const DURATION = 5200, started = performance.now();
  let nextLaunch = 0, last = started;
  function launch(){
    rockets.push({ x: (0.12 + Math.random() * 0.76) * W, y: H, vx: (Math.random() - 0.5) * 2.2 * dpr,
      vy: -(0.62 + Math.random() * 0.2) * H / 62, targetY: (0.12 + Math.random() * 0.36) * H, colour: colours[Math.floor(Math.random() * colours.length)] });
  }
  function burst(r){
    const n = 56 + Math.floor(Math.random() * 28), c2 = colours[Math.floor(Math.random() * colours.length)];
    for(let i = 0; i < n; i++){
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.15, sp = (1.6 + Math.random() * 3.4) * dpr;
      sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.011 + Math.random() * 0.012, colour: i % 3 ? r.colour : c2 });
    }
  }
  function finish(){
    cv.remove();
    msg.style.opacity = '0';
    setTimeout(() => { msg.remove(); fireworksRunning = false; }, 500);
  }
  function frame(now){
    const dt = Math.min((now - last) / 16.7, 3); last = now;
    const elapsed = now - started;
    if(elapsed < DURATION - 1500 && now >= nextLaunch){ launch(); if(Math.random() < 0.5) launch(); nextLaunch = now + 380 + Math.random() * 320; }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, H); // fades the trails instead of clearing, so sparks streak
    ctx.globalCompositeOperation = 'lighter';
    for(let i = rockets.length - 1; i >= 0; i--){
      const r = rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 0.05 * dpr * dt;
      ctx.fillStyle = r.colour; ctx.beginPath(); ctx.arc(r.x, r.y, 2.2 * dpr, 0, 6.2832); ctx.fill();
      if(r.y <= r.targetY || r.vy >= -0.5){ burst(r); rockets.splice(i, 1); }
    }
    for(let i = sparks.length - 1; i >= 0; i--){
      const s = sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 0.045 * dpr * dt; s.vx *= 0.992; s.life -= s.decay * dt;
      if(s.life <= 0){ sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(s.life, 0); ctx.fillStyle = s.colour;
      ctx.beginPath(); ctx.arc(s.x, s.y, (1.2 + s.life * 1.6) * dpr, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if(elapsed > DURATION - 700) msg.style.opacity = '0';
    if(elapsed < DURATION || sparks.length || rockets.length){ if(elapsed < DURATION + 2500) return requestAnimationFrame(frame); }
    finish();
  }
  requestAnimationFrame(frame);
}
