/* 07c-schedule.js -- The Schedule editor (Work tab → Schedule).
   A full-screen calendar like the Monthly Schedule report, except each chip (a round on a day,
   or a one-off job) can be moved to another day — by dragging it, or by tapping it and then
   tapping a day. Nothing is saved until Commit; Reject throws every change away.
   Committing gives each customer in a moved chip a hand-set due date (see dueOverrideISO in
   01-data.js) and changes a moved job's date.
   Extras: ☔ push-back (rain-off), 👥 move part of a round, ☑ multi-select, ↶ undo, a forecast and
   a load / travel-spread summary on every day, 🚫 days off, ＋ jobs added straight onto a day, a
   review step before committing, and a "+4 weeks" button to look further ahead.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

const SE_WEEKS = 9;           // weeks shown when the editor opens, starting with the Monday of this week
const SE_MORE_WEEKS = 4;      // weeks added by the "+ more weeks" button
const SE_MAX_WEEKS = 52;      // furthest the calendar can be extended
const SE_SPREAD_WARN_KM = 8;  // a day whose customers are further apart than this gets an amber travel warning
const SE_FORECAST_KEY = 'roundBookForecastCache';
const SE_ZOOM_KEY = 'roundBookScheduleZoom';
const SE_ZOOM_MIN = 0.6, SE_ZOOM_MAX = 2.6, SE_ZOOM_DEFAULT = 1.4;
let se = null;      // editor state while open (see openScheduleEditor)
let seBound = false;

function seEls(){
  return { root: document.getElementById('schedEditor'), scroll: document.getElementById('seScroll'),
           grid: document.getElementById('seGrid'), count: document.getElementById('seCount'),
           commit: document.getElementById('seCommit'), modal: document.getElementById('seModal'),
           card: document.getElementById('seModalCard'), undo: document.getElementById('seUndo'),
           multi: document.getElementById('seMultiBtn'), split: document.getElementById('seSplitBtn'),
           more: document.getElementById('seMore') };
}

/* ---------- small date helpers (isoToDays / daysToISO live in 01-data.js) ---------- */
function seFmtDay(iso){ return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}); }
function seAddDays(iso, n){ return daysToISO(isoToDays(iso) + n); }
function seDow(iso){ return new Date(iso + 'T00:00:00').getDay(); }
// A day is "off" if its weekday is a regular day off (Sundays by default) or it's been marked off.
function seIsOff(iso){ return se.offWeekdays.includes(seDow(iso)) || se.blocked.includes(iso); }
// The n-th working day after iso (skipping days off).
function seNextWorking(iso, n){
  let d = iso, left = n, guard = 0;
  while(left > 0 && guard++ < 500){ d = seAddDays(d, 1); if(!seIsOff(d)) left--; }
  return d;
}
function sePlural(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }

function openScheduleEditor(){
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
  const items = [], cust = {};
  data.customers.forEach(c => {
    if(c.paused) return;
    let due = nextDueISO(c);
    if(!due) return;
    if(c.deferUntil && c.deferUntil > due) due = c.deferUntil;
    const overdue = due < todayStr;
    const disp = overdue ? todayStr : due;
    if(disp > capISO) return;
    const rn = c.round || 'Unassigned';
    const label = multi.has(rn) ? `${rn} (Day ${c.visitDay || 1})` : rn;
    items.push({ kind:'c', key:c.id, label, dispDate:disp, date:disp, overdue, due, price:Number(c.price || 0) });
    if(c.lat != null && c.lng != null) cust[c.id] = { lat:c.lat, lng:c.lng };
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
  se = { zoom, items, cust, sel:[], multi:false, selDay:null, startISO, capISO, todayStr, weeks:SE_WEEKS,
         offWeekdays, blocked, origOff:offWeekdays.slice(), origBlocked:blocked.slice(),
         history:[], drag:null, weather:{}, chipIndex:{}, ignoreClickUntil:0, pendingRender:false, offPending:null };
  const { root, scroll } = seEls();
  seBind();
  seCloseModal();
  root.classList.add('show');
  renderScheduleEditor();
  scroll.scrollTop = 0; scroll.scrollLeft = 0;
  seLoadForecast();
}

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
    const k = `r|${it.label}|${it.date}|${it.dispDate}|${it.overdue ? 1 : 0}`;
    if(!map[k]){ map[k] = { id:k, kind:'round', label:it.label, date:it.date, dispDate:it.dispDate, overdue:!!it.overdue, isNew:false, items:[] }; out.push(map[k]); }
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
    const s = st[ch.date] = st[ch.date] || { cust:0, jobs:0, value:0, pts:[], spread:0 };
    ch.items.forEach(it => {
      if(it.kind === 'c'){ s.cust++; const p = se.cust[it.key]; if(p) s.pts.push(p); } else s.jobs++;
      s.value += it.price || 0;
    });
  });
  Object.keys(st).forEach(d => {
    const p = st[d].pts; let m = 0;
    for(let i = 0; i < p.length; i++) for(let j = i + 1; j < p.length; j++){
      const k = haversineKm(p[i].lat, p[i].lng, p[j].lat, p[j].lng); if(k > m) m = k;
    }
    st[d].spread = m;
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
  return { movedC, movedJ, newJ, offAdded, offRemoved, wdChanged,
           total: movedC + movedJ + newJ + offAdded.length + offRemoved.length + (wdChanged ? 1 : 0) };
}

/* ---------- rendering ---------- */
function seSafeRender(){ if(se && se.drag){ se.pendingRender = true; return; } renderScheduleEditor(); }

function renderScheduleEditor(){
  if(!se) return;
  se.pendingRender = false;
  const { grid, count, commit, undo, multi, split, more } = seEls();
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
  const start = new Date(se.startISO + 'T00:00:00');
  for(let i = 0; i < se.weeks * 7; i++){
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
    const wx = se.weather[iso];
    let wxHtml = '';
    if(wx && !past){
      const icon = WEATHER_CODES[wx.c] || '🌡️';
      const rain = wx.r != null ? wx.r : null;
      wxHtml = `<span class="se-wx${rain != null && rain >= 60 ? ' wet' : ''}" title="${wx.t != null ? wx.t + '°C max' : ''}${rain != null ? ' · ' + rain + '% chance of rain' : ''}">${icon}${rain != null && rain >= 20 ? ' ' + rain + '%' : ''}</span>`;
    }
    let meta = '';
    if(s && !past){
      const n = s.cust + s.jobs;
      meta = `<span>${n}${s.value > 0 ? ' · ' + money(s.value) : ''}</span>`;
      if(s.spread >= 1) meta += `<span class="se-spread${s.spread > SE_SPREAD_WARN_KM ? ' warn' : ''}" title="Furthest two customers on this day are about ${Math.round(s.spread)} km apart">↔${Math.round(s.spread)}km</span>`;
    }
    html += `<div class="se-cell${past ? ' past' : ''}${iso === se.todayStr ? ' today' : ''}${off ? ' off' : ''}${se.selDay === iso ? ' selday' : ''}${cls}" data-date="${iso}">
      <div class="se-cellhead"><div class="se-daynum">${monthLabel}${dayNum}</div>${wxHtml}</div>
      ${off ? '<div class="se-off">🚫 Off</div>' : ''}${meta ? `<div class="se-meta">${meta}</div>` : ''}
      ${here.map(ch => {
        const n = ch.kind === 'round' ? ch.items.length : '';
        const tip = ch.label + (ch.moved ? ' — moved from ' + fmtDate(ch.dispDate) : '') + (ch.isNew ? ' — new job' : '') + (ch.overdue ? ' — overdue since ' + fmtDate(ch.minDue) : '');
        return `<div class="se-chip ${ch.kind}${ch.moved ? ' moved' : ''}${ch.isNew ? ' new' : ''}${ch.overdue ? ' overdue' : ''}${se.sel.includes(ch.id) ? ' sel' : ''}" data-id="${escapeAttr(ch.id)}" title="${escapeAttr(tip)}"><span class="se-chip-label">${ch.overdue ? '⚠ ' : ''}${escapeHtml(ch.label)}</span>${n !== '' ? `<span class="se-chip-n">${n}</span>` : ''}</div>`;
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
  let state = '';
  if(se.sel.length) state = se.multi ? `${se.sel.length} selected — tap a day to move` : 'Now tap a day';
  else if(se.selDay) state = seFmtDay(se.selDay) + ' selected';
  count.textContent = [state, parts.join(' · ')].filter(Boolean).join(' · ') || 'No changes yet';
  commit.style.opacity = sum.total ? '1' : '0.45';

  undo.disabled = !se.history.length;
  multi.classList.toggle('active', se.multi);
  const one = se.sel.length === 1 && se.chipIndex[se.sel[0]];
  split.disabled = !(one && one.kind === 'round');
  more.style.display = se.weeks >= SE_MAX_WEEKS ? 'none' : '';
}

/* ---------- history (undo) ---------- */
function sePush(){
  se.history.push(JSON.stringify({ items:se.items, blocked:se.blocked, offWeekdays:se.offWeekdays }));
  if(se.history.length > 60) se.history.shift();
}
function seUndo(){
  if(!se || !se.history.length){ return; }
  const s = JSON.parse(se.history.pop());
  se.items = s.items; se.blocked = s.blocked; se.offWeekdays = s.offWeekdays;
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
function seSetZoom(z, noSave){
  if(!se) return;
  z = Math.max(SE_ZOOM_MIN, Math.min(SE_ZOOM_MAX, z));
  const { scroll, grid } = seEls();
  const ratio = z / se.zoom;
  // keep whatever is in the middle of the screen in the middle
  const cx = scroll.scrollLeft + scroll.clientWidth / 2, cy = scroll.scrollTop + scroll.clientHeight / 2;
  se.zoom = z;
  grid.style.setProperty('--z', z);
  scroll.scrollLeft = cx * ratio - scroll.clientWidth / 2;
  scroll.scrollTop = cy * ratio - scroll.clientHeight / 2;
  if(!noSave){ try{ localStorage.setItem(SE_ZOOM_KEY, String(z)); }catch(e){} }
}
function seZoomBy(f){ if(se) seSetZoom(se.zoom * f); }
function seShowMoreWeeks(){
  if(!se) return;
  se.weeks = Math.min(SE_MAX_WEEKS, se.weeks + SE_MORE_WEEKS);
  renderScheduleEditor();
  toast(`Showing ${se.weeks} weeks`);
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
  if(d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
  document.querySelectorAll('.se-cell.drop').forEach(c => c.classList.remove('drop'));
  document.querySelectorAll('.se-chip.dragging').forEach(c => c.classList.remove('dragging'));
  se.drag = null;
}
function seBind(){
  if(seBound) return;
  seBound = true;
  const { grid, scroll, modal } = seEls();
  grid.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.se-chip');
    if(!chip || !se || se.drag) return; // a second finger (pinch) must not replace the first
    se.drag = { id: chip.dataset.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId, active: false, ghost: null, timer: null };
    try{ chip.setPointerCapture(e.pointerId); }catch(err){}
  });
  grid.addEventListener('pointermove', (e) => {
    const d = se && se.drag;
    if(!d || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    if(!d.active && Math.hypot(d.x - d.sx, d.y - d.sy) > 8){
      d.active = true;
      // Dragging a chip that's part of a multi-selection carries the whole selection.
      d.ids = (se.multi && se.sel.includes(d.id)) ? se.sel.slice() : [d.id];
      const ch = se.chipIndex[d.id];
      const ghost = document.createElement('div');
      ghost.className = 'se-ghost';
      ghost.textContent = d.ids.length > 1 ? `${d.ids.length} chips` : (ch ? ch.label : '');
      document.body.appendChild(ghost);
      d.ghost = ghost;
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
    }
    if(d.active){
      e.preventDefault();
      d.ghost.style.left = (d.x + 12) + 'px';
      d.ghost.style.top = (d.y - 18) + 'px';
      seUpdateDropTarget(d.x, d.y);
    }
  });
  grid.addEventListener('pointerup', (e) => {
    const d = se && se.drag;
    if(!d || e.pointerId !== d.pid) return;
    se.ignoreClickUntil = Date.now() + 350; // the click that follows a chip touch must not also hit the day underneath
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
  grid.addEventListener('pointercancel', () => { seEndDrag(); renderScheduleEditor(); });
  // Tap a day while chips are selected to move them there; with nothing selected it selects the day
  // (used by Push back and Add job).
  grid.addEventListener('click', (e) => {
    if(!se || Date.now() < se.ignoreClickUntil || e.target.closest('.se-chip')) return;
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
  // Tapping the dimmed area behind a dialog closes it.
  modal.addEventListener('click', (e) => { if(e.target === modal) seCloseModal(); });
  document.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape' || !se || !seEls().root.classList.contains('show')) return;
    if(seModalOpen()) seCloseModal(); else seRequestReject();
  });
}

/* ---------- dialogs ---------- */
function seModal(html){ const { modal, card } = seEls(); card.innerHTML = html; card.scrollTop = 0; modal.classList.add('show'); }
function seCloseModal(){ const { modal, card } = seEls(); if(modal) modal.classList.remove('show'); if(card) card.innerHTML = ''; }
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
  const hit = se.items.filter(it => scope === 'after' ? it.date >= day : it.date === day);
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
  const stuck = pred ? se.items.filter(it => it.date >= se.todayStr && pred(it.date) && seIsOff(it.date)) : [];
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
    const k = i.label + '|' + i.dispDate + '|' + i.date;
    (groups[k] = groups[k] || { label:i.label, from:i.dispDate, to:i.date, n:0 }).n++;
  });
  const lines = [];
  Object.values(groups).sort((a, b) => a.from.localeCompare(b.from) || a.label.localeCompare(b.label)).forEach(g =>
    lines.push(`<li><b>${escapeHtml(g.label)}</b> — ${sePlural(g.n, 'customer')}<br><span class="se-from">${seFmtDay(g.from)}</span> → <b>${seFmtDay(g.to)}</b></li>`));
  se.items.filter(i => !i.isNew && i.kind === 'j' && i.date !== i.dispDate).forEach(i =>
    lines.push(`<li><b>${escapeHtml(i.label)}</b><br><span class="se-from">${seFmtDay(i.dispDate)}</span> → <b>${seFmtDay(i.date)}</b></li>`));
  se.items.filter(i => i.isNew).forEach(i =>
    lines.push(`<li><b>New:</b> ${escapeHtml(i.label)}<br>on <b>${seFmtDay(i.date)}</b></li>`));
  if(sum.offAdded.length) lines.push(`<li>🚫 Marked off: ${sum.offAdded.map(seFmtDay).join(', ')}</li>`);
  if(sum.offRemoved.length) lines.push(`<li>✅ Working again: ${sum.offRemoved.map(seFmtDay).join(', ')}</li>`);
  if(sum.wdChanged) lines.push(`<li>Regular days off: ${se.offWeekdays.length ? SE_DAY_ORDER.filter(d => se.offWeekdays.includes(d)).map(d => SE_DAY_NAMES[d]).join(', ') : 'none'}</li>`);
  seModal(`
    <h3>Review changes</h3>
    <ul class="se-review">${lines.join('')}</ul>
    <div class="se-btn-row"><button class="se-btn" onclick="seCloseModal()">Back to editing</button><button class="se-btn go" onclick="commitSchedule()">✓ Commit</button></div>
  `);
}

/* --- weather forecast (Open-Meteo, same service as the header weather) --- */
function seLoadForecast(){
  let cache = null;
  try{ cache = JSON.parse(localStorage.getItem(SE_FORECAST_KEY) || 'null'); }catch(e){}
  const apply = (days) => { if(se){ se.weather = days || {}; seSafeRender(); } };
  const age = cache && cache.time ? Date.now() - cache.time : Infinity;
  if(cache && cache.days && age < 12 * 3600 * 1000) apply(cache.days);
  if(age < 90 * 60 * 1000) return; // fresh enough
  const fetchFor = async (lat, lng) => {
    try{
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,precipitation_probability_max,temperature_2m_max&forecast_days=16&timezone=auto`);
      if(!res.ok) throw new Error('bad response');
      const json = await res.json(), dd = json && json.daily;
      if(!dd || !dd.time) throw new Error('no forecast');
      const days = {};
      dd.time.forEach((iso, i) => {
        days[iso] = { c: dd.weathercode[i], r: dd.precipitation_probability_max ? dd.precipitation_probability_max[i] : null, t: dd.temperature_2m_max ? Math.round(dd.temperature_2m_max[i]) : null };
      });
      try{ localStorage.setItem(SE_FORECAST_KEY, JSON.stringify({ time: Date.now(), lat, lng, days })); }catch(e){}
      apply(days);
    }catch(e){ /* offline or blocked — leave whatever is showing */ }
  };
  const fallback = () => { if(cache && cache.lat != null) fetchFor(cache.lat, cache.lng); };
  if(!navigator.geolocation){ fallback(); return; }
  navigator.geolocation.getCurrentPosition(p => fetchFor(p.coords.latitude, p.coords.longitude), fallback, { enableHighAccuracy:false, timeout:8000, maximumAge:1800000 });
}

/* ---------- commit / reject ---------- */
function closeScheduleEditor(){
  seEndDrag();
  seCloseModal();
  seEls().root.classList.remove('show');
  se = null;
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
  se.items.forEach(it => {
    if(it.isNew){
      it.job.date = it.date;
      (data.oneOffJobs = data.oneOffJobs || []).push(it.job);
      added++;
      return;
    }
    if(it.date === it.dispDate) return;
    if(it.kind === 'j'){
      const j = (data.oneOffJobs || []).find(x => x.id === it.key);
      if(j){ j.date = it.date; jobs++; }
      return;
    }
    const c = data.customers.find(x => x.id === it.key);
    if(!c) return;
    // Back onto the day the normal rules would give? Then no hand-set date is needed.
    if(it.date === computedDueISO(c)) c.dueOverride = null;
    else c.dueOverride = { date: it.date, base: lastDateOf(c.cleanHistory) || '' };
    c.deferUntil = null; // the new date replaces any deferral
    customers++;
  });
  data.settings = data.settings || {};
  if(sum.offAdded.length || sum.offRemoved.length) data.settings.blockedDays = se.blocked.slice();
  if(sum.wdChanged) data.settings.scheduleOffWeekdays = se.offWeekdays.slice();
  closeScheduleEditor();
  saveData();
  render();
  const bits = [];
  if(customers) bits.push(sePlural(customers, 'customer'));
  if(jobs) bits.push(sePlural(jobs, 'job'));
  let msg = bits.length ? `Schedule updated — ${bits.join(' and ')} moved` : 'Schedule updated';
  if(added) msg += `${bits.length ? ', ' : ' — '}${sePlural(added, 'job')} added`;
  toast(msg);
}
