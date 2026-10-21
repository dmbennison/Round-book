/* 02b-today-run.js -- the Today tab's Start / Stop run, the day's to-do list and the progress bar.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html, straight after 02-today-rounds.js,
   whose renderTodayHome() uses everything here.

   Pressing Start swaps the tiles under the hero for the day's to-do list: everyone due today (the same people, in the
   order a round's own Due list uses — your visiting route — and as the same swipeable cards), plus today's one-off jobs. The hero and its Start / Stop
   buttons stay locked in place while the list scrolls underneath. Anyone you finish stays in the list (dimmed, so you
   can see what's done) rather than vanishing, and from the second one onwards the list moves up after each so the
   previous one is always still showing at the top. Stop puts the tiles back.
   The progress bar at the bottom of the hero is done / (done + still to do) — it's there whether or not a run is going. */

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
  data.customers.forEach(c => {
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
  if(!todayRunAvailable()) return '';
  return `<div class="today-run-bar">
      <button class="run-btn start" onclick="startTodayRun()"${running ? ' disabled' : ''}>▶ Start</button>
      <button class="run-btn stop" onclick="stopTodayRun()"${running ? '' : ' disabled'}>■ Stop</button>
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
