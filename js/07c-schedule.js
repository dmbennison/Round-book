/* 07c-schedule.js -- The Schedule editor (Work tab → Schedule).
   A full-screen calendar like the Monthly Schedule report, except each chip (a round on a day,
   or a one-off job) can be moved to another day — by dragging it, or by tapping it and then
   tapping a day. Nothing is saved until Commit; Reject throws every change away.
   Committing gives each customer in a moved chip a hand-set due date (see dueOverrideISO in
   01-data.js) and changes a moved job's date.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

const SE_WEEKS = 9; // weeks shown, starting with the Monday of this week
let se = null;      // editor state while open: {chips, selectedId, startISO, endISO, todayStr, drag}
let seBound = false;

function seEls(){
  return { root: document.getElementById('schedEditor'), scroll: document.getElementById('seScroll'),
           grid: document.getElementById('seGrid'), count: document.getElementById('seCount'),
           commit: document.getElementById('seCommit') };
}

function openScheduleEditor(){
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = localISO(today);
  const dow = today.getDay();
  const gridStart = new Date(today); gridStart.setDate(gridStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + SE_WEEKS * 7 - 1);
  const startISO = localISO(gridStart), endISO = localISO(gridEnd);

  // A round that really runs over several visit days is shown per day, as in the report.
  const roundsAll = groupByRound(data.customers);
  const multi = new Set(Object.keys(roundsAll).filter(rn => roundDaysUsed(roundsAll[rn]).length > 1));

  // One chip per round (and visit day) per date. Anyone overdue is shown on today, and a deferred
  // customer on the day their deferral ends.
  const map = {};
  data.customers.forEach(c => {
    if(c.paused) return;
    let due = nextDueISO(c);
    if(!due) return;
    if(c.deferUntil && c.deferUntil > due) due = c.deferUntil;
    const disp = due < todayStr ? todayStr : due;
    if(disp > endISO) return;
    const rn = c.round || 'Unassigned';
    const label = multi.has(rn) ? `${rn} (Day ${c.visitDay || 1})` : rn;
    const key = `r|${label}|${disp}`;
    if(!map[key]) map[key] = { id:key, kind:'round', label, dispDate:disp, date:disp, customerIds:[] };
    map[key].customerIds.push(c.id);
  });
  const chips = Object.values(map);
  (data.oneOffJobs || []).forEach(j => {
    if(j.done || !j.date) return;
    const disp = j.date < todayStr ? todayStr : j.date;
    if(disp > endISO) return;
    chips.push({ id:'j|' + j.id, kind:'job', label:'🔧 ' + (j.address || j.name || 'Job'), dispDate:disp, date:disp, jobId:j.id, customerIds:[] });
  });
  se = { chips, selectedId:null, startISO, endISO, todayStr, drag:null };
  const { root, scroll } = seEls();
  seBind();
  root.classList.add('show');
  renderScheduleEditor();
  scroll.scrollTop = 0; scroll.scrollLeft = 0;
}

function seMovedChips(){ return se ? se.chips.filter(ch => ch.date !== ch.dispDate) : []; }

function renderScheduleEditor(){
  if(!se) return;
  const { grid, count, commit } = seEls();
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = days.map(d => `<div class="se-dayname">${d}</div>`).join('');
  const start = new Date(se.startISO + 'T00:00:00');
  for(let i = 0; i < SE_WEEKS * 7; i++){
    const d = new Date(start); d.setDate(d.getDate() + i);
    const iso = localISO(d);
    const past = iso < se.todayStr;
    const dayNum = d.getDate();
    const monthLabel = (dayNum === 1 || i === 0) ? d.toLocaleDateString('en-GB', {month:'short'}) + ' ' : '';
    const here = se.chips.filter(ch => ch.date === iso).sort((a,b) => a.label.localeCompare(b.label));
    html += `<div class="se-cell${past ? ' past' : ''}${iso === se.todayStr ? ' today' : ''}" data-date="${iso}">
      <div class="se-daynum">${monthLabel}${dayNum}</div>
      ${here.map(ch => {
        const moved = ch.date !== ch.dispDate;
        const n = ch.kind === 'round' ? ch.customerIds.length : '';
        return `<div class="se-chip ${ch.kind}${moved ? ' moved' : ''}${se.selectedId === ch.id ? ' sel' : ''}" data-id="${escapeAttr(ch.id)}" title="${escapeAttr(ch.label)}${moved ? ' — moved from ' + fmtDate(ch.dispDate) : ''}"><span class="se-chip-label">${escapeHtml(ch.label)}</span>${n !== '' ? `<span class="se-chip-n">${n}</span>` : ''}</div>`;
      }).join('')}
    </div>`;
  }
  grid.innerHTML = html;
  const moved = seMovedChips();
  const customers = moved.reduce((s, ch) => s + (ch.kind === 'round' ? ch.customerIds.length : 0), 0);
  const jobs = moved.filter(ch => ch.kind === 'job').length;
  count.textContent = moved.length
    ? `${moved.length} moved${customers ? ` · ${customers} customer${customers === 1 ? '' : 's'}` : ''}${jobs ? ` · ${jobs} job${jobs === 1 ? '' : 's'}` : ''}`
    : (se.selectedId ? 'Now tap a day' : 'No changes yet');
  commit.style.opacity = moved.length ? '1' : '0.45';
}

function seMoveChip(id, iso){
  const ch = se && se.chips.find(c => c.id === id);
  if(!ch) return;
  if(iso < se.todayStr){ toast('Choose today or a later day'); return; }
  ch.date = iso;
  se.selectedId = null;
  renderScheduleEditor();
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
  const { grid, scroll } = seEls();
  grid.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.se-chip');
    if(!chip || !se) return;
    se.drag = { id: chip.dataset.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, pid: e.pointerId, active: false, ghost: null, timer: null };
    try{ chip.setPointerCapture(e.pointerId); }catch(err){}
  });
  grid.addEventListener('pointermove', (e) => {
    const d = se && se.drag;
    if(!d || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    if(!d.active && Math.hypot(d.x - d.sx, d.y - d.sy) > 8){
      d.active = true;
      const ch = se.chips.find(c => c.id === d.id);
      const ghost = document.createElement('div');
      ghost.className = 'se-ghost';
      ghost.textContent = ch ? ch.label : '';
      document.body.appendChild(ghost);
      d.ghost = ghost;
      const src = grid.querySelector(`.se-chip[data-id="${CSS.escape(d.id)}"]`);
      if(src) src.classList.add('dragging');
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
    if(d.active){
      const cell = seCellAt(e.clientX, e.clientY);
      const id = d.id;
      seEndDrag();
      if(cell) seMoveChip(id, cell.dataset.date);
      else renderScheduleEditor();
    } else {
      // A tap: select (or deselect) the chip, ready to be placed with a tap on a day.
      const id = d.id;
      seEndDrag();
      se.selectedId = (se.selectedId === id) ? null : id;
      renderScheduleEditor();
    }
  });
  grid.addEventListener('pointercancel', () => { seEndDrag(); renderScheduleEditor(); });
  // Tap a day while a chip is selected to move it there.
  grid.addEventListener('click', (e) => {
    if(!se || !se.selectedId || e.target.closest('.se-chip')) return;
    const cell = e.target.closest('.se-cell');
    if(cell) seMoveChip(se.selectedId, cell.dataset.date);
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && se && seEls().root.classList.contains('show')) rejectSchedule();
  });
}

/* ---------- commit / reject ---------- */
function closeScheduleEditor(){
  seEndDrag();
  seEls().root.classList.remove('show');
  se = null;
}
function rejectSchedule(){
  const n = seMovedChips().length;
  closeScheduleEditor();
  toast(n ? 'Changes discarded — schedule unchanged' : 'Schedule unchanged');
}
function commitSchedule(){
  if(!se) return;
  const moved = seMovedChips();
  if(!moved.length){ toast('Nothing has been moved yet'); return; }
  let customers = 0, jobs = 0;
  moved.forEach(ch => {
    if(ch.kind === 'job'){
      const j = (data.oneOffJobs || []).find(x => x.id === ch.jobId);
      if(j){ j.date = ch.date; jobs++; }
      return;
    }
    ch.customerIds.forEach(id => {
      const c = data.customers.find(x => x.id === id);
      if(!c) return;
      // Back onto the day the normal rules would give? Then no hand-set date is needed.
      if(ch.date === computedDueISO(c)) c.dueOverride = null;
      else c.dueOverride = { date: ch.date, base: lastDateOf(c.cleanHistory) || '' };
      c.deferUntil = null; // the new date replaces any deferral
      customers++;
    });
  });
  closeScheduleEditor();
  saveData();
  render();
  toast(`Schedule updated — ${customers} customer${customers === 1 ? '' : 's'}${jobs ? ` and ${jobs} job${jobs === 1 ? '' : 's'}` : ''} moved`);
}
