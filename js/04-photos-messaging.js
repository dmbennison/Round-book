/* 04-photos-messaging.js -- Photo viewer/annotation, customer history edits, pause/resume/defer, message templates, receipts, directions, and bulk reminder sending (used by rounds, jobs, quotes and marketing alike).
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- photo annotation (circle / arrow / freehand draw) ----------
   Opened from the photo viewer's "Annotate" button. Draws over a canvas sized
   to the photo's own pixel dimensions (so lines stay crisp and a consistent
   thickness regardless of screen size), then saves the result as a brand new
   photo alongside the original — nothing here ever overwrites or loses the
   original photo. */
const ANNOTATE_COLORS = ['#e11d2e', '#f4a300', '#2563eb', '#16a34a', '#ffffff'];
let annotateEntry = null;   // the photo-viewer entry being annotated
let annotateImg = null;     // loaded Image backing the canvas
let annotateTool = 'circle';
let annotateColor = ANNOTATE_COLORS[0];
let annotateStrokes = [];   // finished shapes: {type, color, ...}
let annotateDrawing = null; // the in-progress shape while a finger/pointer is down
let annotatePointerId = null;

function openPhotoAnnotator(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry) return;
  const src = photoEntrySrc(entry);
  if(!src){ toast('Photo not available to annotate'); return; }
  annotateEntry = entry;
  annotateStrokes = [];
  annotateDrawing = null;
  annotateTool = 'circle';
  annotateColor = ANNOTATE_COLORS[0];
  const img = new Image();
  img.onload = () => { annotateImg = img; renderPhotoAnnotator(); };
  img.onerror = () => toast('Could not load that photo to annotate');
  img.src = src;
}
function cancelPhotoAnnotation(){
  annotateEntry = null; annotateImg = null; annotateStrokes = []; annotateDrawing = null;
  renderPhotoViewer(); // back to the plain viewer for the same photo, nothing saved
}
function renderPhotoAnnotator(){
  openSheet(`
    <div class="sheet-head">
      <h2>Annotate photo</h2>
      <button class="sheet-close" onclick="cancelPhotoAnnotation()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.4;">Circle or draw around anything worth flagging. Saved as a new photo — the original is kept as-is.</p>
    <div style="position:relative; background:#000; border-radius:12px; overflow:hidden; margin-bottom:12px;">
      <canvas id="annotateCanvas" style="width:100%; display:block; touch-action:none;"></canvas>
    </div>
    <div class="seg-row">
      <button class="seg-btn ${annotateTool==='circle'?'active':''}" onclick="setAnnotateTool('circle')">⭕ Circle</button>
      <button class="seg-btn ${annotateTool==='arrow'?'active':''}" onclick="setAnnotateTool('arrow')">➚ Arrow</button>
      <button class="seg-btn ${annotateTool==='pen'?'active':''}" onclick="setAnnotateTool('pen')">✏️ Draw</button>
    </div>
    <div style="display:flex; gap:10px; align-items:center; margin:2px 2px 14px;">
      ${ANNOTATE_COLORS.map(c=>`<button onclick="setAnnotateColor('${c}')" aria-label="Colour" style="width:30px; height:30px; border-radius:50%; background:${c}; border:3px solid ${annotateColor===c?'var(--ink)':'transparent'}; box-shadow:0 0 0 1px rgba(0,0,0,0.15); padding:0;"></button>`).join('')}
    </div>
    <div class="row2" style="margin-bottom:8px;">
      <button class="btn btn-clean" onclick="undoAnnotationStroke()">Undo</button>
      <button class="btn" style="background:var(--red-dim); color:var(--red);" onclick="clearAnnotationStrokes()">Clear all</button>
    </div>
    <button class="btn btn-paid" style="width:100%;" onclick="savePhotoAnnotation()">Save as new photo</button>
  `, () => renderPhotoViewer());
  initAnnotateCanvas();
}
function setAnnotateTool(tool){ annotateTool = tool; renderPhotoAnnotator(); }
function setAnnotateColor(color){ annotateColor = color; renderPhotoAnnotator(); }
function undoAnnotationStroke(){
  if(!annotateStrokes.length) return;
  annotateStrokes.pop();
  redrawAnnotateCanvas();
}
function clearAnnotationStrokes(){
  if(!annotateStrokes.length) return;
  if(!confirm('Clear all annotations on this photo?')) return;
  annotateStrokes = [];
  redrawAnnotateCanvas();
}
function initAnnotateCanvas(){
  const canvas = document.getElementById('annotateCanvas');
  if(!canvas || !annotateImg) return;
  canvas.width = annotateImg.naturalWidth;
  canvas.height = annotateImg.naturalHeight;
  redrawAnnotateCanvas();
  attachAnnotateCanvasEvents(canvas);
}
function annotateLineWidth(canvasWidth){
  // Scales with the photo's own resolution so the line reads clearly whether
  // it's a small compressed photo or a large one, rather than a fixed pixel
  // width that could vanish or overwhelm depending on the source image.
  return Math.max(5, Math.round(canvasWidth * 0.007));
}
function drawAnnotateStroke(ctx, s, canvasWidth){
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = annotateLineWidth(canvasWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if(s.type === 'pen'){
    ctx.beginPath();
    s.points.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.stroke();
  } else if(s.type === 'circle'){
    const cx = (s.x0+s.x1)/2, cy = (s.y0+s.y1)/2;
    const rx = Math.max(Math.abs(s.x1-s.x0)/2, 6), ry = Math.max(Math.abs(s.y1-s.y0)/2, 6);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
    ctx.stroke();
  } else if(s.type === 'arrow'){
    const headLen = ctx.lineWidth * 4.5;
    const angle = Math.atan2(s.y1-s.y0, s.x1-s.x0);
    ctx.beginPath(); ctx.moveTo(s.x0,s.y0); ctx.lineTo(s.x1,s.y1); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x1,s.y1);
    ctx.lineTo(s.x1 - headLen*Math.cos(angle-Math.PI/6), s.y1 - headLen*Math.sin(angle-Math.PI/6));
    ctx.moveTo(s.x1,s.y1);
    ctx.lineTo(s.x1 - headLen*Math.cos(angle+Math.PI/6), s.y1 - headLen*Math.sin(angle+Math.PI/6));
    ctx.stroke();
  }
  ctx.restore();
}
function redrawAnnotateCanvas(){
  const canvas = document.getElementById('annotateCanvas');
  if(!canvas || !annotateImg) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(annotateImg, 0, 0, canvas.width, canvas.height);
  const all = annotateDrawing ? [...annotateStrokes, annotateDrawing] : annotateStrokes;
  all.forEach(s => drawAnnotateStroke(ctx, s, canvas.width));
}
function canvasPointFromEvent(canvas, e){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width || canvas.width);
  const scaleY = canvas.height / (rect.height || canvas.height);
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}
function attachAnnotateCanvasEvents(canvas){
  canvas.onpointerdown = (e) => {
    e.preventDefault();
    annotatePointerId = e.pointerId;
    if(canvas.setPointerCapture){ try{ canvas.setPointerCapture(e.pointerId); }catch(err){} }
    const pt = canvasPointFromEvent(canvas, e);
    annotateDrawing = annotateTool === 'pen'
      ? {type:'pen', color:annotateColor, points:[pt]}
      : {type:annotateTool, color:annotateColor, x0:pt.x, y0:pt.y, x1:pt.x, y1:pt.y};
    redrawAnnotateCanvas();
  };
  canvas.onpointermove = (e) => {
    if(annotatePointerId === null || e.pointerId !== annotatePointerId || !annotateDrawing) return;
    e.preventDefault();
    const pt = canvasPointFromEvent(canvas, e);
    if(annotateDrawing.type === 'pen') annotateDrawing.points.push(pt);
    else { annotateDrawing.x1 = pt.x; annotateDrawing.y1 = pt.y; }
    redrawAnnotateCanvas();
  };
  const finish = (e) => {
    if(annotatePointerId === null || e.pointerId !== annotatePointerId) return;
    annotatePointerId = null;
    if(annotateDrawing){
      // Drop accidental taps that never actually moved, rather than littering
      // the photo with invisible zero-size shapes.
      const meaningful = annotateDrawing.type === 'pen'
        ? annotateDrawing.points.length > 1
        : (Math.abs(annotateDrawing.x1-annotateDrawing.x0) > 4 || Math.abs(annotateDrawing.y1-annotateDrawing.y0) > 4);
      if(meaningful) annotateStrokes.push(annotateDrawing);
      annotateDrawing = null;
      redrawAnnotateCanvas();
    }
  };
  canvas.onpointerup = finish;
  canvas.onpointercancel = finish;
  canvas.onpointerleave = finish;
}
async function savePhotoAnnotation(){
  if(!annotateStrokes.length){ toast('Add at least one annotation first'); return; }
  const canvas = document.getElementById('annotateCanvas');
  const entry = annotateEntry;
  if(!canvas || !entry) return;
  toast('Saving annotated photo…');
  canvas.toBlob(async (blob) => {
    if(!blob){ toast('Could not save that annotation — try again'); return; }
    const photoId = uid();
    const owner = entry.kind === 'customer'
      ? data.customers.find(x=>x.id===entry.ownerId)
      : data.oneOffJobs.find(x=>x.id===entry.ownerId);
    if(!owner){ toast('Could not find the photo\'s customer or job'); return; }
    owner.photos = owner.photos || [];
    if(photoStorageAvailable){
      await idbSavePhoto(photoId, blob);
      cachePhotoBlob(photoId, blob);
      owner.photos.push({id: photoId, date: todayISO()});
    } else {
      // Rare IndexedDB-unavailable fallback — same embedded-dataURL behaviour
      // used elsewhere (see handlePhotoSelected) rather than losing the photo.
      const dataUrl = await blobToDataURL(blob);
      owner.photos.push({id: photoId, dataUrl, date: todayISO()});
    }
    if(await saveData()){
      toast('Annotated photo saved');
      annotateEntry = null; annotateImg = null; annotateStrokes = []; annotateDrawing = null;
      const list = entry.kind === 'customer' ? buildCustomerPhotoList(entry.ownerId) : buildJobPhotoList(entry.ownerId);
      const idx = list.findIndex(e=>e.photoId===photoId);
      openPhotoViewerAt(list, idx===-1 ? list.length-1 : idx, photoViewerOnClose);
    }
  }, 'image/jpeg', 0.9);
}

async function sharePhoto(id, photoId){
  const c = data.customers.find(x=>x.id===id);
  const p = (c.photos||[]).find(x=>x.id===photoId);
  if(!p) return;
  try{
    const blob = photoStorageAvailable ? await idbGetPhoto(photoId) : await (await fetch(p.dataUrl)).blob();
    if(!blob) throw new Error('photo not found');
    const safeName = (c.address || c.name || 'photo').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const file = new File([blob], `${safeName}-${p.date}.jpg`, { type: blob.type || 'image/jpeg' });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: 'Round Book photo', text: c.address || c.name || '' });
    } else {
      toast('Sharing not supported here — press and hold the photo instead');
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;
    toast('Could not share that photo — press and hold it instead');
  }
}

function editHistAmount(id, kind, dateKey){
  const c = data.customers.find(x=>x.id===id);
  const list = kind==='clean' ? c.cleanHistory : c.paymentHistory;
  const entry = list.find(e=>e.date===dateKey);
  if(!entry) return;
  const val = prompt(`${kind==='clean'?'Amount charged':'Amount paid'} for ${fmtDate(dateKey)}`, entry.amount);
  if(val===null) return;
  const num = parseFloat(val);
  if(isNaN(num) || num<0){ toast('Enter a valid amount'); return; }
  entry.amount = num;
  saveData(); openCustomerHistoryList(id, kind); render();
}

function editPriceHistoryEntry(id, dateKey){
  const c = data.customers.find(x=>x.id===id);
  const entry = (c.priceHistory||[]).find(p=>p.date===dateKey);
  if(!entry) return;
  openSheet(`
    <div class="sheet-head">
      <h2>Edit price entry</h2>
      <button class="sheet-close" onclick="openCustomerHistoryList('${id}','price')">✕</button>
    </div>
    <label style="margin-top:0">Date</label>
    <input type="date" id="ph_date" value="${entry.date}">
    <label>Price</label>
    <input type="number" id="ph_price" value="${entry.price}" min="0" step="0.5">
    <div class="form-actions">
      <button class="btn-primary" onclick="savePriceHistoryEdit('${id}','${dateKey}')">Save</button>
    </div>
  `);
}

function savePriceHistoryEdit(id, oldDateKey){
  const c = data.customers.find(x=>x.id===id);
  const entry = (c.priceHistory||[]).find(p=>p.date===oldDateKey);
  if(!entry) return;
  const newDate = document.getElementById('ph_date').value;
  const newPrice = parseFloat(document.getElementById('ph_price').value);
  if(!newDate){ toast('Please choose a date'); return; }
  if(isNaN(newPrice) || newPrice<0){ toast('Enter a valid price'); return; }

  entry.date = newDate;
  entry.price = newPrice;

  const sortedAfter = c.priceHistory.slice().sort((a,b)=>a.date<b.date?1:-1);
  if(sortedAfter[0] === entry){
    c.price = newPrice;
  }

  saveData(); openCustomerHistoryList(id, 'price'); render();
  toast('Price entry updated');
}

function removePriceHistoryEntry(id, dateKey){
  const c = data.customers.find(x=>x.id===id);
  const idx = (c.priceHistory||[]).findIndex(p=>p.date===dateKey);
  if(idx===-1) return;
  if(!confirm('Remove this price entry?')) return;
  c.priceHistory.splice(idx,1);
  saveData(); openCustomerHistoryList(id, 'price'); render();
}

function emailCustomer(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !c.email) return;
  window.location.href = 'mailto:' + c.email;
}

const PAUSE_REASONS = ['Holiday', 'Work being done', 'Cancelled', 'Moved out', 'Other'];

function openPauseReasonSheet(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Pause this customer</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 16px;">
      They'll be skipped from due reminders and left out of round totals until resumed.
    </p>
    <label style="margin-top:0;">Reason</label>
    <select id="pause_reason">
      ${PAUSE_REASONS.map(r=>`<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}
    </select>
    <div id="pause_other_wrap" style="display:none;">
      <label>Other reason</label>
      <input type="text" id="pause_other" placeholder="e.g. Building work next door">
    </div>
    <div class="form-actions">
      <button class="btn-primary" onclick="confirmPause('${id}')">Pause customer</button>
    </div>
  `, () => openCustomerDetail(id));
  const sel = document.getElementById('pause_reason');
  const otherWrap = document.getElementById('pause_other_wrap');
  const syncOther = () => { otherWrap.style.display = sel.value === 'Other' ? 'block' : 'none'; };
  sel.addEventListener('change', syncOther);
  syncOther();
}

function confirmPause(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const sel = document.getElementById('pause_reason');
  let reason = sel ? sel.value : '';
  if(reason === 'Other'){
    const other = document.getElementById('pause_other');
    reason = (other && other.value.trim()) ? other.value.trim() : 'Other';
  }
  c.paused = true;
  c.pauseReason = reason;
  c.pauseDate = todayISO();
  saveData();
  openCustomerDetail(id);
  render();
  toast('Customer paused — hidden from due reminders');
}

function resumeCustomer(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  c.paused = false;
  c.pauseReason = '';
  c.pauseDate = '';
  saveData(); openCustomerDetail(id); render();
  toast('Customer resumed');
}

// Pushes a customer's next due date out by 4 weeks without logging a clean — for a
// short, one-off delay (holiday, bad weather, access issue) where they're still an
// active customer, unlike Pause which is meant for longer or indefinite breaks.
// Shared date math for both the single-customer and whole-round defer actions.
// Bases the new date off whichever is latest: their natural next-due date (so
// someone not yet due gets their whole cycle pushed out), today (so an
// already-overdue customer still gets a genuine 4 weeks from now), or an existing
// deferral (so nudging again while already deferred stacks correctly).
function deferredDateFor(c){
  const today = todayISO();
  const naturalDue = nextDueISO(c) || today;
  let base = naturalDue > today ? naturalDue : today;
  if(c.deferUntil && c.deferUntil > base) base = c.deferUntil;
  const d = new Date(base+'T00:00:00');
  d.setDate(d.getDate() + 28);
  return d.toISOString().slice(0,10);
}
function deferCustomerDue(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  c.deferUntil = deferredDateFor(c);
  saveData(); openCustomerDetail(id); render();
  toast(`Due date deferred to ${fmtDate(c.deferUntil)}`);
}
function cancelDefer(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  c.deferUntil = null;
  saveData(); openCustomerDetail(id); render();
  toast('Defer cancelled');
}
// Lets the deferred date be fine-tuned to an exact date rather than only ever
// jumping in fixed 4-week steps.
function editDeferDate(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Edit deferred date</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Due again from</label>
    <input type="date" id="defer_date_input" value="${c.deferUntil || deferredDateFor(c)}">
    <div class="form-actions">
      <button class="btn-primary" onclick="saveDeferDate('${id}')">Save</button>
    </div>
  `, () => openCustomerDetail(id));
}
function saveDeferDate(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const v = document.getElementById('defer_date_input').value;
  if(!v){ toast('Pick a date'); return; }
  c.deferUntil = v;
  saveData(); openCustomerDetail(id); render();
  toast(`Due date deferred to ${fmtDate(c.deferUntil)}`);
}
// Applies the same defer-by-4-weeks logic to every active (non-paused) customer
// in a round at once — for things like bad weather or a run of cancellations that
// affect the whole round rather than one customer.
function nudgeRoundDue(rn){
  const custs = data.customers.filter(c => c.round === rn && !c.paused);
  if(!custs.length){ toast('No active customers in this round'); return; }
  if(!confirm(`Defer the due date by 4 weeks for all ${custs.length} active customer${custs.length===1?'':'s'} in "${rn}"?`)) return;
  custs.forEach(c => { c.deferUntil = deferredDateFor(c); });
  saveData();
  closeSheet();
  render();
  toast(`Deferred ${custs.length} customer${custs.length===1?'':'s'} in "${rn}" by 4 weeks`);
}

// Builds the "pay by bank transfer" block used by the {bankdetails} token — empty
// string if no bank details are saved yet, so templates render cleanly either way.
// Just the details themselves, no lead-in sentence and no extra blank line — the
// surrounding template text supplies whatever framing/spacing it needs. Includes
// the customer/job's address as a payment reference when one's passed in, so an
// incoming transfer can be matched back to who it's from at a glance — just the
// first line (house number and road), not the whole address, since that's plenty
// to identify who it's from and is quicker for a customer to read off and type.
function addressFirstLine(address){
  return (address||'').split(',')[0].trim();
}
function bankDetailsBlock(address){
  const s = data.settings || {};
  if(!s.bankPayeeName && !s.bankAccountNumber && !s.bankSortCode) return '';
  const lines = [];
  if(s.bankPayeeName) lines.push(`Payee Name: ${s.bankPayeeName}`);
  if(s.bankAccountNumber) lines.push(`Account Number: ${s.bankAccountNumber}`);
  if(s.bankSortCode) lines.push(`Sort Code: ${s.bankSortCode}`);
  const ref = addressFirstLine(address);
  if(ref) lines.push(`Reference: ${ref}`);
  return lines.join('\n') + '\n';
}
// Human-readable labels for the message log shown on a customer/job's screen.
const MESSAGE_LOG_LABELS = {
  clean: 'Cleaning reminder', cleanedToday: 'Windows cleaned today', pay: 'Payment reminder',
  receipt: 'Receipt', quote: 'Quote', repeatQuote: 'Repeat work quote', marketing: 'Marketing text'
};
// Marketing response pipeline — tracked manually, since there's no way for the app
// to see actual text replies (they land in the phone's own Messages/WhatsApp app).
// This just gives a place to record what happened after checking those replies.
const MARKETING_STATUS_OPTIONS = {
  awaiting: {label: 'No response yet', color: 'due'},
  interested: {label: 'Interested', color: 'ok'},
  not_interested: {label: 'Not interested', color: 'overdue'},
  booked: {label: 'Booked in', color: 'ok'}
};
const MARKETING_ACTION_OPTIONS = {
  none: 'No action needed',
  call: 'Follow up call',
  quote: 'Send a quote',
  text_again: 'Text again in a few days',
  add_round: 'Add extra work to round'
};
// Records that a message actually went out, for the read-only message log on a
// customer/job's screen. Capped so it can't grow forever on a long-standing customer.
// `extra` merges in additional fields for that one entry — currently just used to
// tag which marketing campaign a send belonged to (see sendMarketingText).
function logMessage(item, kind, extra){
  if(!item) return;
  if(!item.messageLog) item.messageLog = [];
  item.messageLog.unshift(Object.assign({kind, date: todayISO(), time: Date.now()}, extra||{}));
  if(item.messageLog.length > 30) item.messageLog.length = 30;
}
function applyTemplate(tpl, tokens){
  return (tpl||'')
    .replace(/\{name\}/g, tokens.name || 'there')
    .replace(/\{amount\}/g, tokens.amount != null ? money(tokens.amount) : '')
    .replace(/\{company\}/g, tokens.company || '')
    .replace(/\{date\}/g, tokens.date || '')
    .replace(/\{yourname\}/g, tokens.yourname || '')
    .replace(/\{work\}/g, tokens.work || 'your window cleaning')
    .replace(/\{bankdetails\}/g, bankDetailsBlock(tokens.address));
}

// Normalizes a UK-style phone number into the digits-only, country-code-prefixed
// format WhatsApp's click-to-chat links require (e.g. "07123 456789" -> "447123456789").
function normalizePhoneForWhatsApp(phone){
  let digits = (phone||'').replace(/[^\d+]/g,'');
  if(digits.startsWith('+')) return digits.slice(1);
  if(digits.startsWith('00')) return digits.slice(2);
  if(digits.startsWith('0')) return '44' + digits.slice(1);
  return digits;
}

// Single point of truth for "send this text to this phone number" — respects the
// person's chosen messaging app (SMS or WhatsApp) from Settings, so every reminder,
// receipt, quote, and marketing text goes out the same way without repeating this logic.
// Uses location.href rather than window.open — opening a new tab/window is what
// leaves an orphaned blank Safari tab behind when the person switches back from
// WhatsApp on an installed PWA. A same-context navigation lets iOS/Android hand off
// to the WhatsApp app directly, so "back" returns to Round Book instead.
function sendPhoneMessage(phone, msg){
  const clean = (phone||'').replace(/\s+/g,'');
  if(!clean) return;
  if(data.settings.messagingApp === 'whatsapp'){
    window.location.href = `https://wa.me/${normalizePhoneForWhatsApp(clean)}?text=${encodeURIComponent(msg)}`;
  } else {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const separator = isIOS ? '&' : '?';
    window.location.href = `sms:${clean}${separator}body=${encodeURIComponent(msg)}`;
  }
}

// Opens turn-by-turn directions to a customer/job address in the device's
// default map app. Uses a Google Maps universal link with location.href
// (same reasoning as sendPhoneMessage above) so the OS hands off to the
// native Maps app directly instead of leaving an orphaned blank tab.
function openDirections(kind, id){
  const item = kind === 'job'
    ? data.oneOffJobs.find(x=>x.id===id)
    : data.customers.find(x=>x.id===id);
  if(!item || !item.address){ toast('No address set'); return; }
  window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.address)}`;
}

// Google's free "dir/?api=1" share-link scheme (no API key, no cost) supports at
// most 9 waypoints plus a final destination — 10 stops per link. A round with
// more stops than that gets split into consecutive legs instead (see
// startRoundDirections), each opened once the last one's finished.
const MAPS_LINK_MAX_STOPS = 10;
// No origin is set on purpose — Google Maps then uses the phone's current
// location as the starting point automatically, which is what you want when
// setting off on a round rather than routing from a fixed address.
function buildMapsLink(addrs){
  const destination = addrs[addrs.length-1];
  const waypoints = addrs.slice(0,-1);
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`;
  if(waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join('%7C')}`;
  return url;
}
// Opens turn-by-turn directions through every stop in a round, in whichever
// order Reorder (or Suggest route order) has set — one tap instead of routing to
// each customer one at a time. For a round spanning multiple days, a specific
// day has to be selected first (via the Day tabs), since a route can't sensibly
// mix stops that aren't actually visited on the same trip.
function startRoundDirections(rn){
  let custs = sortByRoute(data.customers.filter(c=>(c.round||'Unassigned')===rn && !c.paused));
  const days = roundDaysUsed(custs);
  if(days.length > 1){
    if(roundDayFilter === 'all'){
      toast('This round spans multiple days — pick a day above first');
      return;
    }
    custs = custs.filter(c=>(c.visitDay||1) === roundDayFilter);
  }
  const addrs = custs.filter(c=>c.address).map(c=>c.address);
  if(!addrs.length){ toast('No addresses to get directions to'); return; }

  const batches = [];
  for(let i=0;i<addrs.length;i+=MAPS_LINK_MAX_STOPS) batches.push(addrs.slice(i,i+MAPS_LINK_MAX_STOPS));

  if(batches.length === 1){
    closeSheet();
    window.location.href = buildMapsLink(batches[0]);
    return;
  }
  // More stops than one link can hold — offer each leg separately, to be opened
  // in turn as you physically make your way through the round.
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(rn)} — directions</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px; line-height:1.5;">
      Google Maps can only queue up ${MAPS_LINK_MAX_STOPS} stops in one link, so this round's split into ${batches.length} legs — open the next one once you're nearing the end of the last.
    </p>
    ${batches.map((batch,i)=>`
      <button class="backup-btn" onclick="closeSheet(); window.location.href='${buildMapsLink(batch)}';">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <div><div class="t1">Leg ${i+1} of ${batches.length}</div><div class="t2">${batch.length} stop${batch.length===1?'':'s'}</div></div>
      </button>
    `).join('')}
  `, () => openRound(rn));
}

// Dials a customer/job's saved number via the device's phone app. Unlike the
// messaging functions this isn't restricted to mobile numbers — landlines can be
// called even though they can't receive texts.
function callCustomer(kind, id){
  const item = kind === 'job'
    ? data.oneOffJobs.find(x=>x.id===id)
    : data.customers.find(x=>x.id===id);
  if(!item || !item.phone){ toast('No phone number set'); return; }
  window.location.href = `tel:${item.phone.replace(/\s+/g,'')}`;
}

// Recognizes UK mobile numbers (07..., +447..., 00447...) as distinct from
// landlines — texts and WhatsApp messages can only reach a mobile, so every
// "send a text" option in the app is gated on this rather than just "has a phone".
function isMobileNumber(phone){
  if(!phone) return false;
  const digits = (phone||'').replace(/[^\d+]/g,'');
  if(/^07\d{9}$/.test(digits)) return true;
  if(/^(\+44|0044)7\d{9}$/.test(digits)) return true;
  return false;
}

let pendingMsgPhone = '';
let pendingMsgAfterSend = null;
let pendingMsgLog = null;

// Shared "compose, edit, send" screen for any single-recipient text — cleaning and
// payment reminders, receipts, quotes. Mirrors the editable-textarea pattern already
// used for group marketing texts, so wording can always be tweaked before it goes out.
// returnTo is passed straight through to openSheet so closing this (by any route)
// lands back on whichever screen it was opened from. logInfo is optional —
// {item, kind} — and records the send in that customer/job's message log.
function openMessagePreview(title, phone, msg, afterSend, returnTo, logInfo){
  pendingMsgPhone = phone;
  pendingMsgAfterSend = afterSend || null;
  pendingMsgLog = logInfo || null;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(title)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Message</label>
    <textarea id="msg_preview_text" rows="7">${escapeHtml(msg)}</textarea>
    <div class="form-actions">
      <button class="btn-primary" onclick="sendPreviewedMessage()">Send ${data.settings.messagingApp==='whatsapp'?'via WhatsApp':'as text'}</button>
    </div>
  `, returnTo);
}
function sendPreviewedMessage(){
  const text = document.getElementById('msg_preview_text').value;
  const phone = pendingMsgPhone;
  const afterSend = pendingMsgAfterSend;
  const logInfo = pendingMsgLog;
  sendPhoneMessage(phone, text);
  if(logInfo && logInfo.item){
    logMessage(logInfo.item, logInfo.kind);
    saveData();
  }
  if(afterSend) afterSend();
  closeSheet();
}

function setMessagingApp(mode){
  data.settings.messagingApp = mode === 'whatsapp' ? 'whatsapp' : 'sms';
  saveData();
  openSettings();
}

function sendReceipt(id, dateISO, amount){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const mobile = isMobileNumber(c.phone);
  if(!mobile && !c.email){ toast('No mobile number or email saved for this customer'); return; }
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const msg = applyTemplate(data.settings.receiptTemplate, {
    name: firstName, amount: Number(amount), company, date: fmtDate(dateISO), yourname
  });
  if(mobile){
    openMessagePreview('Send receipt', c.phone, msg, null, () => openReceiptOptions(id, dateISO, amount), {item: c, kind: 'receipt'});
  } else {
    window.location.href = `mailto:${c.email}?subject=${encodeURIComponent('Receipt')}&body=${encodeURIComponent(msg)}`;
  }
}

function openReceiptOptions(id, dateISO, amount){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const mobile = isMobileNumber(c.phone);
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Send receipt</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px; line-height:1.5;">${escapeHtml(c.name||c.address||'This customer')} · ${money(amount)} on ${fmtDate(dateISO)}</p>
    ${(mobile||c.email) ? `<button class="backup-btn" onclick="sendReceipt('${id}','${dateISO}',${amount})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div><div class="t1">Quick text message</div><div class="t2">${mobile?(data.settings.messagingApp==='whatsapp'?'Sends via WhatsApp':'Sends as a text'):'Sends by email'}, using your receipt wording</div></div>
    </button>` : ''}
    <button class="backup-btn" onclick="printReceipt('${id}','${dateISO}',${amount})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      <div><div class="t1">Formatted receipt</div><div class="t2">Print it or send a PDF copy via WhatsApp</div></div>
    </button>
  `, () => openHistEntryActions(id, 'pay', dateISO, amount));
}

function printReceipt(customerId, dateISO, amount){
  const c = data.customers.find(x=>x.id===customerId);
  if(!c) return;
  const receiptNumber = 'RCT-' + (dateISO||todayISO()).replace(/-/g,'') + '-' + c.id.slice(-4).toUpperCase();
  const company = data.settings.companyName || '';
  const companyAddress = data.settings.companyAddress || '';
  const companyPhone = data.settings.companyPhone || '';
  const yourName = data.settings.yourName || '';
  const hasLogo = !!data.settings.logo;
  const fromLine = [yourName, company].filter(Boolean).join(' · ');

  const metaRows = [
    ['Receipt number', receiptNumber],
    ['Receipt date', fmtDate(todayISO())],
    ['Payment date', fmtDate(dateISO)],
    ['Status', 'Paid']
  ].map(([label,val])=>`<tr><td style="font-weight:700; width:140px; color:#66798A;">${label}</td><td>${escapeHtml(String(val))}</td></tr>`).join('');

  const billToLines = [
    c.name ? escapeHtml(c.name) : '',
    c.address ? escapeHtml(c.address) : '',
    c.phone ? escapeHtml(c.phone) : '',
    c.accountNumber ? `Account: ${escapeHtml(c.accountNumber)}` : ''
  ].filter(Boolean).map(l=>`<div>${l}</div>`).join('');

  const description = `Window cleaning — ${escapeHtml(c.round||'Round')}`;

  // See printJobInvoice for why the logo/name/address/phone blocks are kept as
  // separate top-level siblings rather than nested in one div.
  const logoBlock = hasLogo
    ? `<div style="text-align:left; margin-bottom:4px;"><img class="inv-logo" src="${data.settings.logo}" style="display:block; max-height:60px; max-width:200px; object-fit:contain;"></div>`
    : '';
  const nameBlock = (!hasLogo && company)
    ? `<div style="text-align:left; font-size:15px; font-weight:800; color:#10344C; margin-bottom:2px;">${escapeHtml(company)}</div>`
    : '';
  const addressBlock = companyAddress
    ? `<div style="text-align:left; font-size:11px; color:#66798A; line-height:1.5;">${escapeHtml(companyAddress).replace(/\n/g,'<br>')}</div>`
    : '';
  const phoneBlock = companyPhone
    ? `<div style="text-align:left; font-size:11px; color:#66798A; line-height:1.5;">${escapeHtml(companyPhone)}</div>`
    : '';
  const letterheadSpacer = (logoBlock || nameBlock || addressBlock || phoneBlock)
    ? `<div style="margin-bottom:16px;"></div>` : '';

  const body = `
    ${logoBlock}${nameBlock}${addressBlock}${phoneBlock}${letterheadSpacer}
    <div class="rpt-round-title" style="margin-top:0;">Receipt</div>
    <table class="rpt-table inv-meta-table" style="margin-bottom:20px;"><tbody>${metaRows}</tbody></table>

    <div class="rpt-round-title">Received from</div>
    <div class="inv-billto">
      <span class="inv-label">Customer</span>
      ${billToLines || '<div style="color:#66798A;">No customer details on file</div>'}
    </div>

    <div class="rpt-round-title">Details</div>
    <table class="rpt-table" style="margin-bottom:4px;">
      <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody><tr><td>${description}</td><td style="text-align:right;">${money(amount)}</td></tr></tbody>
    </table>
    <div class="rpt-total inv-total-box"><span>Total paid</span><span class="inv-total-amount">${money(amount)}</span></div>
    <div style="margin-top:14px;"><span class="inv-stamp paid">✓ Paid</span></div>

    <div class="rpt-footer" style="text-align:left; border-top:none; margin-top:28px; padding-top:0;">
      Thank you for your payment.${fromLine ? '<br>' + escapeHtml(fromLine) : ''}
    </div>
  `;
  runPrint(`Receipt — ${c.address || c.name || receiptNumber}`, body, true, true, () => openReceiptOptions(customerId, dateISO, amount), c.phone);
}


function sendJobReceipt(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  if(!j) return;
  if(!isMobileNumber(j.phone)){ toast('No mobile number saved for this job'); return; }
  const firstName = j.name ? j.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const msg = applyTemplate(data.settings.receiptTemplate, {
    name: firstName, amount: Number(j.price||0), company, date: fmtDate(j.date), yourname
  });
  openMessagePreview('Send receipt', j.phone, msg, null, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)), {item: j, kind: 'receipt'});
}

function sendJobPaymentReminder(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  if(!j) return;
  if(!isMobileNumber(j.phone)){ toast('No mobile number saved for this job'); return; }
  const firstName = j.name ? j.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const msg = applyTemplate(data.settings.payTemplate, {
    name: firstName, amount: Number(j.price||0), company, yourname, address: j.address
  });
  const afterSend = () => {
    j.paymentReminderSent = true;
    j.paymentReminderSentDate = todayISO();
    j.paymentReminderCount = (j.paymentReminderCount||0) + 1;
    saveData();
    render();
  };
  openMessagePreview('Payment reminder', j.phone, msg, afterSend, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)), {item: j, kind: 'pay'});
}


function sendQuoteText(id){
  const q = data.quotes.find(x=>x.id===id);
  if(!q) return;
  const mobile = isMobileNumber(q.phone);
  if(!mobile && !q.email){ toast('No mobile number or email saved for this quote'); return; }
  const firstName = q.name ? q.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const tpl = q.fromJobId ? data.settings.repeatQuoteTemplate : data.settings.quoteTemplate;
  const msg = applyTemplate(tpl, {
    name: firstName, amount: Number(q.price||0), company, date: fmtDate(q.date), yourname, work: q.notes||''
  });
  if(mobile){
    openMessagePreview('Send quote', q.phone, msg, null, () => openQuoteForm(data.quotes.find(x=>x.id===id)), {item: q, kind: q.fromJobId ? 'repeatQuote' : 'quote'});
  } else {
    window.location.href = `mailto:${q.email}?subject=${encodeURIComponent('Your window cleaning quote')}&body=${encodeURIComponent(msg)}`;
  }
}

function sendTemplate(id, kind, returnTo){
  const c = data.customers.find(x=>x.id===id);
  if(!isMobileNumber(c.phone)){ toast('No mobile number saved for this customer'); return; }
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  let msg, title, afterSend = null;
  if(kind === 'clean'){
    msg = applyTemplate(data.settings.cleanTemplate, {name: firstName, company, yourname});
    title = 'Cleaning reminder';
  } else if(kind === 'cleanedToday'){
    msg = applyTemplate(data.settings.cleanedTodayTemplate, {name: firstName, amount: c.price, company, yourname, address: c.address});
    title = 'Windows cleaned today';
    afterSend = () => {
      // Tied to today's date rather than just a flat boolean, so the flag
      // naturally stops applying once a new clean happens next visit — no need
      // to hunt down and reset it at every "mark as cleaned" call site.
      c.cleanedTodayTextSentDate = todayISO();
      saveData();
      render();
    };
  } else {
    const s = custStatus(c);
    const amt = s.owed ? s.balance : c.price;
    msg = applyTemplate(data.settings.payTemplate, {name: firstName, amount: amt, company, yourname, address: c.address});
    title = 'Payment reminder';
    afterSend = () => {
      c.paymentReminderSent = true;
      c.paymentReminderSentDate = todayISO();
      c.paymentReminderCount = (c.paymentReminderCount||0) + 1;
      saveData();
      render();
    };
  }
  openMessagePreview(title, c.phone, msg, afterSend, returnTo, {item: c, kind});
}

function openBulkReminders(kind, roundName){
  const rounds = groupByRound(data.customers);
  const roundCusts = rounds[roundName] || [];
  let list;
  if(kind === 'due'){
    list = roundCusts.filter(c=>{
      const s = custStatus(c);
      return !c.paused && s.cleanBadge && s.cleanBadge.type==='due' && isMobileNumber(c.phone);
    });
  } else {
    list = roundCusts.filter(c=> custStatus(c).owed && isMobileNumber(c.phone));
  }
  if(!list.length){ toast('No one with a mobile number to remind'); return; }

  const tplField = document.getElementById('bulk_msg');
  const tpl = tplField ? tplField.value : (kind==='owed' ? data.settings.payTemplate : data.settings.cleanTemplate);

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Remind — ${escapeHtml(roundName)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Message <span style="text-transform:none; font-weight:500; opacity:0.7;">({name}${kind==='owed'?', {amount}, {bankdetails}':''}, {company}, {yourname})</span></label>
    <textarea id="bulk_msg" rows="4">${escapeHtml(tpl)}</textarea>
    <p style="color:var(--ink-muted); font-size:0.7812rem; margin:10px 2px 14px; line-height:1.5;">
      Tap Send for each customer — it opens ${data.settings.messagingApp==='whatsapp'?'WhatsApp':'Messages'} pre-filled and ready to go. Come back here for the next one.
    </p>
    ${list.map(c=>{
      const s = custStatus(c);
      const alreadySent = kind === 'owed' && c.paymentReminderSent;
      return `<div class="cust-card" id="bulkrow-${c.id}" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="min-width:0;">
          <div class="cust-addr" style="font-weight:800; font-size:0.9062rem;">${escapeHtml(c.address||c.name||'Customer')}</div>
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.phone)}${kind==='owed'?` · Owes ${money(s.balance)}`:''}${alreadySent?` · 🔔 Reminded ${fmtDate(c.paymentReminderSentDate).split(' ').slice(0,2).join(' ')}`:''}</div>
        </div>
        <button class="btn btn-clean" style="flex:0 0 auto; padding:9px 16px;" onclick="sendBulkReminder('${c.id}','${kind}')">${alreadySent?'Send again':'Send'}</button>
      </div>`;
    }).join('')}
  `);
}

// Same tap-to-send-each queue as openBulkReminders, but for everyone due
// today who's marked "text before you arrive" — spans every round rather
// than being scoped to one, so it's grouped with round sub-headers instead.
function openBulkTextBeforeVisit(){
  const { byRound, all } = textBeforeDueList();
  const sendable = all.filter(c=>isMobileNumber(c.phone));
  if(!sendable.length){ toast('No one with a mobile number to text'); return; }

  const tplField = document.getElementById('bulk_msg');
  const tpl = tplField ? tplField.value : data.settings.cleanTemplate;

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Text all — before you arrive</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Message <span style="text-transform:none; font-weight:500; opacity:0.7;">({name}, {company}, {yourname})</span></label>
    <textarea id="bulk_msg" rows="4">${escapeHtml(tpl)}</textarea>
    <p style="color:var(--ink-muted); font-size:0.7812rem; margin:10px 2px 14px; line-height:1.5;">
      Tap Send for each customer — it opens ${data.settings.messagingApp==='whatsapp'?'WhatsApp':'Messages'} pre-filled and ready to go. Come back here for the next one.
    </p>
    ${Object.keys(byRound).map(rn=>{
      const list = byRound[rn].filter(c=>isMobileNumber(c.phone));
      if(!list.length) return '';
      return `<div class="section-label" style="margin:10px 2px 6px; font-size:0.6875rem;">${escapeHtml(rn)}</div>` +
        list.map(c=>`<div class="cust-card" id="bulkrow-${c.id}" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="min-width:0;">
            <div class="cust-addr" style="font-weight:800; font-size:0.9062rem;">${escapeHtml(c.address||c.name||'Customer')}</div>
            <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.phone)}</div>
          </div>
          <button class="btn btn-clean" style="flex:0 0 auto; padding:9px 16px;" onclick="sendBulkReminder('${c.id}','textBefore')">Send</button>
        </div>`).join('');
    }).join('')}
  `);
}
function sendBulkReminder(id, kind){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !isMobileNumber(c.phone)) return;
  const msgField = document.getElementById('bulk_msg');
  const tpl = msgField ? msgField.value : (kind==='owed' ? data.settings.payTemplate : data.settings.cleanTemplate);
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  let amt;
  if(kind === 'owed'){
    const s = custStatus(c);
    amt = s.owed ? s.balance : c.price;
  }
  const msg = applyTemplate(tpl, {name: firstName, amount: amt, company, yourname, address: c.address});
  sendPhoneMessage(c.phone, msg);
  logMessage(c, kind === 'owed' ? 'pay' : 'clean');
  if(kind === 'owed'){
    c.paymentReminderSent = true;
    c.paymentReminderSentDate = todayISO();
    c.paymentReminderCount = (c.paymentReminderCount||0) + 1;
  }
  saveData();
  markReminderSent(id);
}

function markReminderSent(id){
  const row = document.getElementById('bulkrow-'+id);
  if(!row) return;
  row.style.opacity = '0.45';
  const btn = row.querySelector('button');
  if(btn){
    btn.textContent = 'Sent ✓';
    btn.disabled = true;
    btn.style.background = 'var(--line)';
    btn.style.color = 'var(--ink-muted)';
  }
}

let marketingSelectedRounds = new Set();
let marketingSelectedCampaignId = null; // remembers the last campaign picked, for this session
let marketingSkipResponded = true; // skip anyone already marked Interested/Booked in
let marketingSkipRecentDays = 14; // skip anyone texted (any campaign) within this many days; 0 = off
let marketingPropertyTypeFilter = new Set(); // empty = no restriction; values from PROPERTY_TYPES, or 'Not recorded'
let marketingAddOnFilter = new Set(); // empty = no restriction; matches ANY ticked add-on
let marketingFrontsOnlyFilter = false; // true = only fronts-only customers
function toggleMarketingRound(rn, checked){
  if(checked) marketingSelectedRounds.add(rn); else marketingSelectedRounds.delete(rn);
  openGroupMarketingText();
}
function setMarketingSkipResponded(checked){
  marketingSkipResponded = checked;
  openGroupMarketingText();
}
function setMarketingSkipRecentDaysEnabled(checked){
  marketingSkipRecentDays = checked ? 14 : 0;
  openGroupMarketingText();
}
function setMarketingSkipRecentDaysValue(val){
  marketingSkipRecentDays = Math.max(1, parseInt(val,10) || 14);
  // Deliberately not re-rendering the whole screen on every keystroke here (unlike
  // the other filters) — that would steal focus from the number input mid-type.
  // The candidate list below just reflects the latest value next time it renders.
}
function toggleMarketingPropertyType(type, checked){
  if(checked) marketingPropertyTypeFilter.add(type); else marketingPropertyTypeFilter.delete(type);
  openGroupMarketingText();
}
function toggleMarketingAddOn(key, checked){
  if(checked) marketingAddOnFilter.add(key); else marketingAddOnFilter.delete(key);
  openGroupMarketingText();
}
function setMarketingFrontsOnlyFilter(checked){
  marketingFrontsOnlyFilter = checked;
  openGroupMarketingText();
}
function selectMarketingCampaign(id){
  marketingSelectedCampaignId = id;
  openGroupMarketingText();
}
// Candidates for a group send: everyone with a mobile number in the selected
// rounds/groups, minus anyone opted out and anyone the current filters say to
// skip. Paused/lapsed customers are offered as an extra selectable group
// alongside the real rounds (like a virtual round), since a "we've missed you"
// campaign specifically wants exactly that list and nothing else.
function marketingCandidateList(){
  const rounds = groupByRound(data.customers.filter(c=>!c.paused && !c.marketingOptOut));
  let list = Object.keys(rounds).filter(rn=>marketingSelectedRounds.has(rn)).flatMap(rn=>(rounds[rn]||[]));
  if(marketingSelectedRounds.has('__paused__')){
    list = list.concat(data.customers.filter(c=>c.paused && !c.marketingOptOut));
  }
  list = list.filter(c=>isMobileNumber(c.phone));
  if(marketingSkipResponded){
    list = list.filter(c => c.marketingStatus !== 'interested' && c.marketingStatus !== 'booked');
  }
  if(marketingSkipRecentDays > 0){
    const today = todayISO();
    list = list.filter(c=>{
      const lastSent = (c.messageLog||[]).filter(m=>m.kind==='marketing').sort((a,b)=>b.time-a.time)[0];
      return !lastSent || daysBetween(lastSent.date, today) >= marketingSkipRecentDays;
    });
  }
  // Property filters — optional extra narrowing on top of the round/group
  // selection above; an empty filter set means "no restriction".
  if(marketingPropertyTypeFilter.size){
    list = list.filter(c => marketingPropertyTypeFilter.has(c.propertyType || 'Not recorded'));
  }
  if(marketingAddOnFilter.size){
    list = list.filter(c =>
      (marketingAddOnFilter.has('conservatory') && c.addOnConservatory) ||
      (marketingAddOnFilter.has('extension') && c.addOnExtension) ||
      (marketingAddOnFilter.has('garageDoor') && c.addOnGarageDoor)
    );
  }
  if(marketingFrontsOnlyFilter){
    list = list.filter(c => c.frontsOnly);
  }
  return list;
}
// Tracks which campaign's wording was actually loaded into the textarea last time
// this screen rendered, so a genuine campaign switch (via the dropdown) can be told
// apart from a re-render triggered by something else (a round/filter checkbox) —
// comparing against marketingSelectedCampaignId directly doesn't work here, since
// that's already been updated to the new value by the time this runs.
let marketingLastRenderedCampaignId = null;
function openGroupMarketingText(){
  const campaigns = (data.settings.marketingCampaigns && data.settings.marketingCampaigns.length) ? data.settings.marketingCampaigns : DEFAULT_MARKETING_CAMPAIGNS;
  if(!marketingSelectedCampaignId || !campaigns.some(c=>c.id===marketingSelectedCampaignId)){
    marketingSelectedCampaignId = campaigns[0].id;
  }
  const activeCampaign = campaigns.find(c=>c.id===marketingSelectedCampaignId);
  const rounds = groupByRound(data.customers.filter(c=>!c.paused && !c.marketingOptOut));
  const roundNames = Object.keys(rounds).sort((a,b)=>a.localeCompare(b));
  const pausedCount = data.customers.filter(c=>c.paused && !c.marketingOptOut && isMobileNumber(c.phone)).length;
  const optedOutCount = data.customers.filter(c=>c.marketingOptOut && isMobileNumber(c.phone)).length;

  // Preserve whatever's currently typed if this re-renders from a round/filter
  // toggle, rather than resetting back to the campaign's saved wording each time —
  // EXCEPT when the campaign dropdown itself was just switched, where loading that
  // campaign's own wording is exactly what's expected.
  const campaignJustSwitched = marketingLastRenderedCampaignId !== null && marketingLastRenderedCampaignId !== marketingSelectedCampaignId;
  const tpl = (document.getElementById('mkt_msg') && !campaignJustSwitched) ? document.getElementById('mkt_msg').value : (activeCampaign ? activeCampaign.body : DEFAULT_MARKETING_TEMPLATE);
  marketingLastRenderedCampaignId = marketingSelectedCampaignId;

  const roundCheckboxes = roundNames.map(rn=>{
    const count = (rounds[rn]||[]).filter(c=>isMobileNumber(c.phone)).length;
    return `<label style="display:flex; align-items:center; gap:10px; padding:11px 4px; border-bottom:1px solid var(--line);">
      <input type="checkbox" ${marketingSelectedRounds.has(rn)?'checked':''} onchange="toggleMarketingRound('${escapeAttr(rn)}', this.checked)" style="width:18px; height:18px;">
      <span style="flex:1; font-weight:700;">${escapeHtml(rn)}</span>
      <span style="color:var(--ink-muted); font-size:0.75rem;">${count} with mobile</span>
    </label>`;
  }).join('') + (pausedCount ? `<label style="display:flex; align-items:center; gap:10px; padding:11px 4px; border-bottom:1px solid var(--line);">
      <input type="checkbox" ${marketingSelectedRounds.has('__paused__')?'checked':''} onchange="toggleMarketingRound('__paused__', this.checked)" style="width:18px; height:18px;">
      <span style="flex:1; font-weight:700;">⏸ Paused/lapsed customers</span>
      <span style="color:var(--ink-muted); font-size:0.75rem;">${pausedCount} with mobile</span>
    </label>` : '');

  const list = marketingCandidateList();

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Send group text</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Campaign</label>
    <select id="mkt_msg_campaign_id" onchange="selectMarketingCampaign(this.value)" style="margin-bottom:6px;">
      ${campaigns.map(c=>`<option value="${c.id}" ${c.id===marketingSelectedCampaignId?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
    </select>
    <button type="button" onclick="closeSheet()" style="background:none; border:none; color:var(--blue); font-size:0.7812rem; font-weight:700; padding:2px; margin-bottom:14px;">← Back to campaigns</button>
    <label>Rounds / groups to include</label>
    <div style="margin-bottom:16px;">${roundCheckboxes || '<p style="color:var(--ink-muted); font-size:0.8438rem;">No rounds yet.</p>'}</div>
    ${optedOutCount ? `<p style="color:var(--ink-muted); font-size:0.75rem; margin:-10px 2px 16px;">🚫 ${optedOutCount} customer${optedOutCount===1?'':'s'} opted out of marketing texts — always excluded, on every campaign.</p>` : ''}
    <label style="display:flex; align-items:center; gap:8px; margin-top:14px; text-transform:none; font-weight:600;">
      <input type="checkbox" ${marketingSkipResponded?'checked':''} onchange="setMarketingSkipResponded(this.checked)" style="width:18px; height:18px; margin:0; flex-shrink:0;">
      Skip anyone already marked Interested or Booked in
    </label>
    <label style="display:flex; align-items:center; gap:8px; margin-top:10px; text-transform:none; font-weight:600; flex-wrap:wrap;">
      <input type="checkbox" ${marketingSkipRecentDays>0?'checked':''} onchange="setMarketingSkipRecentDaysEnabled(this.checked)" style="width:18px; height:18px; margin:0; flex-shrink:0;">
      <span>Skip anyone texted in the last</span>
      <input type="number" min="1" value="${marketingSkipRecentDays||14}" ${marketingSkipRecentDays>0?'':'disabled'} oninput="setMarketingSkipRecentDaysValue(this.value)" style="width:56px; margin:0; padding:6px 8px; text-align:center;">
      <span>days</span>
    </label>
    <label style="margin-top:16px;">Property type <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional — leave all unticked to include every type)</span></label>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
      ${PROPERTY_TYPES.concat(['Not recorded']).map(t=>`<label style="display:flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--box-border); border-radius:20px; padding:6px 12px; font-size:0.75rem; font-weight:700; text-transform:none; margin:0;">
        <input type="checkbox" ${marketingPropertyTypeFilter.has(t)?'checked':''} onchange="toggleMarketingPropertyType('${escapeAttr(t)}', this.checked)" style="width:15px; height:15px; margin:0;">
        ${escapeHtml(PROPERTY_TYPE_ABBR[t]||t)}
      </label>`).join('')}
    </div>
    <label>Add-ons <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional — matches anyone with any ticked)</span></label>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
      <label style="display:flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--box-border); border-radius:20px; padding:6px 12px; font-size:0.75rem; font-weight:700; text-transform:none; margin:0;">
        <input type="checkbox" ${marketingAddOnFilter.has('conservatory')?'checked':''} onchange="toggleMarketingAddOn('conservatory', this.checked)" style="width:15px; height:15px; margin:0;"> Conservatory
      </label>
      <label style="display:flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--box-border); border-radius:20px; padding:6px 12px; font-size:0.75rem; font-weight:700; text-transform:none; margin:0;">
        <input type="checkbox" ${marketingAddOnFilter.has('extension')?'checked':''} onchange="toggleMarketingAddOn('extension', this.checked)" style="width:15px; height:15px; margin:0;"> Extension
      </label>
      <label style="display:flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--box-border); border-radius:20px; padding:6px 12px; font-size:0.75rem; font-weight:700; text-transform:none; margin:0;">
        <input type="checkbox" ${marketingAddOnFilter.has('garageDoor')?'checked':''} onchange="toggleMarketingAddOn('garageDoor', this.checked)" style="width:15px; height:15px; margin:0;"> Garage door
      </label>
    </div>
    <label style="display:flex; align-items:center; gap:8px; margin-top:8px; margin-bottom:16px; text-transform:none; font-weight:600;">
      <input type="checkbox" ${marketingFrontsOnlyFilter?'checked':''} onchange="setMarketingFrontsOnlyFilter(this.checked)" style="width:18px; height:18px; margin:0; flex-shrink:0;">
      Fronts-only customers only
    </label>
    <label style="margin-top:0;">Message <span style="text-transform:none; font-weight:500; opacity:0.7;">({name}, {company}, {yourname})</span></label>
    <textarea id="mkt_msg" rows="4">${escapeHtml(tpl)}</textarea>
    <p style="color:var(--ink-muted); font-size:0.7812rem; margin:10px 2px 14px; line-height:1.5;">
      Tap Send for each customer — it opens ${data.settings.messagingApp==='whatsapp'?'WhatsApp':'Messages'} pre-filled and ready to go. Come back here for the next one.
    </p>
    <div style="color:var(--ink-muted); font-size:0.75rem; font-weight:700; margin:0 2px 8px;">${list.length} customer${list.length===1?'':'s'} to send to</div>
    ${list.length ? list.map(c=>{
      return `<div class="cust-card" id="bulkrow-${c.id}" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="min-width:0;">
          <div class="cust-addr" style="font-weight:800; font-size:0.9062rem;">${escapeHtml(c.address||c.name||'Customer')}</div>
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.phone)}</div>
        </div>
        <button class="btn btn-clean" style="flex:0 0 auto; padding:9px 16px;" onclick="sendMarketingText('${c.id}'); markReminderSent('${c.id}')">Send</button>
      </div>`;
    }).join('') : `<p style="color:var(--ink-muted); font-size:0.8438rem; margin:0 2px;">${marketingSelectedRounds.size ? 'Nobody matches the selected rounds/groups and filters.' : 'Select at least one round or group above.'}</p>`}
  `, () => openMarketingResponses());
}

function saveMarketingCampaign(id){
  const camp = (data.settings.marketingCampaigns||[]).find(c=>c.id===id);
  if(!camp) return;
  const name = document.getElementById('camp_name').value.trim();
  if(!name){ toast('Please enter a campaign name'); return; }
  camp.name = name;
  camp.body = document.getElementById('camp_body').value.trim() || camp.body;
  saveData();
  toast('Campaign saved');
  openCampaignDetail(id);
}
function addMarketingCampaign(){
  data.settings.marketingCampaigns = data.settings.marketingCampaigns || [];
  const camp = { id: uid(), name: 'New campaign', body: DEFAULT_MARKETING_TEMPLATE };
  data.settings.marketingCampaigns.push(camp);
  saveData();
  openCampaignDetail(camp.id);
}
function deleteMarketingCampaign(id){
  const list = data.settings.marketingCampaigns || [];
  if(list.length <= 1){ toast('Keep at least one campaign'); return; }
  const camp = list.find(c=>c.id===id);
  if(!camp) return;
  if(!confirm(`Delete "${camp.name}"? This can't be undone.`)) return;
  data.settings.marketingCampaigns = list.filter(c=>c.id!==id);
  saveData();
  toast('Campaign deleted');
  marketingDetailCampaignId = null;
  setTab('marketing');
}

function sendMarketingText(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !isMobileNumber(c.phone)){ toast('No mobile number saved for this customer'); return; }
  if(c.marketingOptOut){ toast("This customer has opted out of marketing texts"); return; }
  const campaigns = (data.settings.marketingCampaigns && data.settings.marketingCampaigns.length) ? data.settings.marketingCampaigns : DEFAULT_MARKETING_CAMPAIGNS;
  const activeCampaign = campaigns.find(c=>c.id===marketingSelectedCampaignId) || campaigns[0];
  const msgField = document.getElementById('mkt_msg');
  const tpl = msgField ? msgField.value : (activeCampaign ? activeCampaign.body : DEFAULT_MARKETING_TEMPLATE);
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const msg = applyTemplate(tpl, {name: firstName, company, yourname});
  sendPhoneMessage(c.phone, msg);
  logMessage(c, 'marketing', activeCampaign ? {campaign: activeCampaign.id} : null);
  // Each new send supersedes whatever the outcome of a previous one was — starts
  // the "waiting to hear back" cycle over.
  c.marketingStatus = 'awaiting';
  c.marketingNextAction = 'none';
  c.marketingActionDone = false;
  c.marketingFollowUpDate = '';
  c.marketingCampaign = activeCampaign ? activeCampaign.id : '';
  saveData();
}

function openAddCleanForm(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Add a clean</h2>
      <button class="sheet-close" onclick="openCustomerDetail('${id}')">✕</button>
    </div>
    <label style="margin-top:0">Date</label>
    <input type="date" id="d_clean" value="${todayISO()}">
    <label>Amount charged</label>
    <input type="number" id="d_clean_amount" value="${c.price||0}" step="0.5" min="0">
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:6px 2px 0; line-height:1.5;">Adjust the amount for extras (e.g. garage door) or reductions (e.g. fronts only).</p>
    <div class="form-actions">
      <button class="btn-primary" onclick="addHistDate('${id}','clean')">Add clean</button>
    </div>
  `, () => openCustomerDetail(id));
}

function openAddPaymentForm(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const s = custStatus(c);
  const suggestedPayment = s.owed ? s.balance : (c.price||0);
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Add a payment</h2>
      <button class="sheet-close" onclick="openCustomerDetail('${id}')">✕</button>
    </div>
    <label style="margin-top:0">Date</label>
    <input type="date" id="d_pay" value="${todayISO()}">
    <label>Amount paid</label>
    <input type="number" id="d_pay_amount" value="${suggestedPayment}" step="0.5" min="0">
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:6px 2px 0; line-height:1.5;">Pay less than the balance and the rest rolls onto next bill. Pay more and they'll show in credit.</p>
    <div class="form-actions">
      <button class="btn-primary" onclick="addHistDate('${id}','pay')">Add payment</button>
    </div>
  `, () => openCustomerDetail(id));
}

function addHistDate(id, kind){
  const c = data.customers.find(x=>x.id===id);
  if(kind==='clean'){
    const v = document.getElementById('d_clean').value;
    if(!v) return;
    const amtRaw = document.getElementById('d_clean_amount').value;
    const amt = amtRaw!=='' ? parseFloat(amtRaw) : (c.price||0);
    c.cleanHistory = c.cleanHistory||[]; c.cleanHistory.push({date:v, amount: isNaN(amt)?0:amt});
    c.deferUntil = null;
  } else {
    const v = document.getElementById('d_pay').value;
    if(!v) return;
    const amtRaw = document.getElementById('d_pay_amount').value;
    const amt = amtRaw!=='' ? parseFloat(amtRaw) : (c.price||0);
    c.paymentHistory = c.paymentHistory||[]; c.paymentHistory.push({date:v, amount: isNaN(amt)?0:amt});
    c.paymentReminderSent = false;
    c.paymentReminderSentDate = null;
    c.paymentReminderCount = 0;
  }
  saveData(); openCustomerDetail(id); render();
}
function removeHist(id, kind, dateVal){
  const c = data.customers.find(x=>x.id===id);
  if(!confirm(`Remove this ${kind==='clean'?'clean':'payment'}?`)) return;
  if(kind==='clean'){
    const idx = c.cleanHistory.findIndex(e=>e.date===dateVal);
    if(idx>-1) c.cleanHistory.splice(idx,1);
  } else {
    const idx = c.paymentHistory.findIndex(p=>p.date===dateVal);
    if(idx>-1) c.paymentHistory.splice(idx,1);
  }
  saveData(); openCustomerHistoryList(id, kind); render();
}

function handleFabClick(){
  if(currentTab === 'jobs') openJobForm();
  else if(currentTab === 'quotes') openQuoteForm();
  else if(currentTab === 'marketing') openGroupMarketingText();
  else openCustomerForm();
}

