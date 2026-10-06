/* 04-photos-messaging.js -- Photo viewer/annotation, customer history edits, pause/resume/defer, message templates, receipts, directions, and bulk reminder sending (used by rounds, jobs, quotes and marketing alike).
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- photo annotation (circle / arrow / freehand draw / text) ----------
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
let annotateTextPoint = null; // where a Text-tool tap landed, until its label has been typed
let annotateSelected = null;  // the annotation picked with the Move tool
let annotateHistory = [];     // undo steps: {kind:'add'|'move'|'delete', ...}
let annotateMoveDrag = null;  // {s, last, dx, dy} while an annotation is being dragged

function openPhotoAnnotator(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry) return;
  const src = photoEntrySrc(entry);
  if(!src){ toast('Photo not available to annotate'); return; }
  annotateEntry = entry;
  annotateStrokes = [];
  annotateDrawing = null;
  annotateTextPoint = null;
  annotateTool = 'circle';
  annotateColor = ANNOTATE_COLORS[0];
  annotateSelected = null; annotateHistory = []; annotateMoveDrag = null;
  const img = new Image();
  img.onload = () => { annotateImg = img; renderPhotoAnnotator(); };
  img.onerror = () => toast('Could not load that photo to annotate');
  img.src = src;
}
function cancelPhotoAnnotation(){
  annotateEntry = null; annotateImg = null; annotateStrokes = []; annotateDrawing = null; annotateTextPoint = null;
  annotateSelected = null; annotateHistory = []; annotateMoveDrag = null;
  renderPhotoViewer(); // back to the plain viewer for the same photo, nothing saved
}
function renderPhotoAnnotator(){
  openSheet(`
    <div class="sheet-head">
      <h2>Annotate photo</h2>
      <button class="sheet-close" onclick="cancelPhotoAnnotation()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 10px; line-height:1.4;">Circle, point at or draw around anything worth flagging, or choose Text and tap where a label should go. Choose Move to drag any annotation into a new position. Saved as a new photo — the original is kept as-is.</p>
    <div style="position:relative; background:#000; border-radius:12px; overflow:hidden; margin-bottom:12px;">
      <canvas id="annotateCanvas" style="width:100%; display:block; touch-action:none;"></canvas>
    </div>
    <div class="seg-row">
      <button class="seg-btn ${annotateTool==='circle'?'active':''}" onclick="setAnnotateTool('circle')">⭕ Circle</button>
      <button class="seg-btn ${annotateTool==='arrow'?'active':''}" onclick="setAnnotateTool('arrow')">➚ Arrow</button>
      <button class="seg-btn ${annotateTool==='pen'?'active':''}" onclick="setAnnotateTool('pen')">✏️ Draw</button>
      <button class="seg-btn ${annotateTool==='text'?'active':''}" onclick="setAnnotateTool('text')">Aa Text</button>
    </div>
    <div class="seg-row">
      <button class="seg-btn ${annotateTool==='move'?'active':''}" onclick="setAnnotateTool('move')">✋ Move</button>
      <button class="seg-btn" id="annDeleteSel" onclick="deleteSelectedAnnotation()">🗑 Delete selected</button>
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
  updateAnnotateSelUi();
}
function setAnnotateTool(tool){ annotateTool = tool; if(tool !== 'move') annotateSelected = null; renderPhotoAnnotator(); }
function setAnnotateColor(color){ annotateColor = color; renderPhotoAnnotator(); }
function updateAnnotateSelUi(){
  const b = document.getElementById('annDeleteSel');
  if(!b) return;
  b.style.opacity = annotateSelected ? '1' : '0.4';
  b.style.pointerEvents = annotateSelected ? '' : 'none';
}
function undoAnnotationStroke(){
  const h = annotateHistory.pop();
  if(!h) return;
  if(h.kind === 'add'){
    const i = annotateStrokes.indexOf(h.s);
    if(i !== -1) annotateStrokes.splice(i, 1);
    if(annotateSelected === h.s) annotateSelected = null;
  } else if(h.kind === 'move'){
    annotateTranslate(h.s, -h.dx, -h.dy);
  } else if(h.kind === 'delete'){
    annotateStrokes.splice(Math.min(h.i, annotateStrokes.length), 0, h.s);
  }
  redrawAnnotateCanvas();
  updateAnnotateSelUi();
}
function deleteSelectedAnnotation(){
  if(!annotateSelected) return;
  const i = annotateStrokes.indexOf(annotateSelected);
  if(i === -1){ annotateSelected = null; updateAnnotateSelUi(); return; }
  annotateHistory.push({ kind:'delete', s: annotateSelected, i });
  annotateStrokes.splice(i, 1);
  annotateSelected = null;
  redrawAnnotateCanvas();
  updateAnnotateSelUi();
}
function clearAnnotationStrokes(){
  if(!annotateStrokes.length) return;
  appConfirm('Clear all annotations on this photo?', {title:'Clear annotations', confirmLabel:'Clear', onConfirm: () => {
    annotateStrokes = [];
    annotateHistory = [];
    annotateSelected = null;
    redrawAnnotateCanvas();
    updateAnnotateSelUi();
  }});
}
// Moves an annotation by (dx, dy) in photo pixels. Text is kept inside the photo.
function annotateTranslate(s, dx, dy){
  if(s.type === 'pen') s.points.forEach(p => { p.x += dx; p.y += dy; });
  else if(s.type === 'text'){
    const W = annotateImg ? annotateImg.naturalWidth : Infinity, H = annotateImg ? annotateImg.naturalHeight : Infinity;
    s.x = Math.max(0, Math.min(W, s.x + dx)); s.y = Math.max(0, Math.min(H, s.y + dy));
  } else { s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy; }
}
function annotateDistToSegment(p, a, b){
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx*vx + vy*vy;
  let t = len2 ? ((p.x - a.x)*vx + (p.y - a.y)*vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t*vx), p.y - (a.y + t*vy));
}
// The topmost annotation under a point, with a generous touch allowance (null if none).
function annotateHitTest(pt){
  const canvas = document.getElementById('annotateCanvas');
  if(!canvas) return null;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const tol = Math.max(24, W * 0.035);
  for(let i = annotateStrokes.length - 1; i >= 0; i--){
    const s = annotateStrokes[i];
    if(s.type === 'circle'){
      const cx = (s.x0+s.x1)/2, cy = (s.y0+s.y1)/2;
      const rx = Math.max(Math.abs(s.x1-s.x0)/2, 6) + tol, ry = Math.max(Math.abs(s.y1-s.y0)/2, 6) + tol;
      const dx = (pt.x-cx)/rx, dy = (pt.y-cy)/ry;
      if(dx*dx + dy*dy <= 1) return s;
    } else if(s.type === 'arrow'){
      if(annotateDistToSegment(pt, {x:s.x0,y:s.y0}, {x:s.x1,y:s.y1}) <= tol) return s;
    } else if(s.type === 'pen'){
      for(let k = 1; k < s.points.length; k++){
        if(annotateDistToSegment(pt, s.points[k-1], s.points[k]) <= tol) return s;
      }
      if(s.points.length === 1 && Math.hypot(pt.x-s.points[0].x, pt.y-s.points[0].y) <= tol) return s;
    } else if(s.type === 'text'){
      ctx.save();
      const L = annotateTextLayout(ctx, s, W);
      ctx.restore();
      const pad = tol * 0.5;
      if(pt.x >= L.x0 - pad && pt.x <= L.x0 + L.w + pad && pt.y >= L.y0 - pad && pt.y <= L.y0 + L.h + pad) return s;
    }
  }
  return null;
}
// Bounding box of an annotation, used to draw the selection outline.
function annotateBounds(ctx, s, W){
  const pad = annotateLineWidth(W) * 1.5;
  let x0, y0, x1, y1;
  if(s.type === 'pen'){
    x0 = Math.min.apply(null, s.points.map(p=>p.x)); x1 = Math.max.apply(null, s.points.map(p=>p.x));
    y0 = Math.min.apply(null, s.points.map(p=>p.y)); y1 = Math.max.apply(null, s.points.map(p=>p.y));
  } else if(s.type === 'text'){
    ctx.save(); const L = annotateTextLayout(ctx, s, W); ctx.restore();
    x0 = L.x0; y0 = L.y0; x1 = L.x0 + L.w; y1 = L.y0 + L.h;
  } else {
    x0 = Math.min(s.x0, s.x1); x1 = Math.max(s.x0, s.x1); y0 = Math.min(s.y0, s.y1); y1 = Math.max(s.y0, s.y1);
  }
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad*2, h: (y1 - y0) + pad*2 };
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
function annotateFontSize(canvasWidth){ return Math.max(26, Math.round(canvasWidth * 0.045)); }
function askAnnotationText(pt){
  appConfirm('Type the label to put on the photo.', {
    title:'Add text', confirmLabel:'Add', danger:false,
    input:{type:'text', placeholder:'e.g. Cracked seal'},
    onConfirm: (val) => {
      const text = (val || '').trim().slice(0, 120);
      if(!text) return;
      const ts = {type:'text', color:annotateColor, x:pt.x, y:pt.y, text};
      annotateStrokes.push(ts);
      annotateHistory.push({ kind:'add', s: ts });
      redrawAnnotateCanvas();
    }
  });
}
// Works out how a text label wraps and where it sits (used for drawing, hit-testing and the
// selection outline). Sets the canvas font as a side effect.
function annotateTextLayout(ctx, s, canvasWidth){
  const size = annotateFontSize(canvasWidth);
  ctx.font = `800 ${size}px -apple-system, "SF Pro Text", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  const maxW = canvasWidth * 0.8;
  const lines = [];
  let line = '';
  String(s.text).split(/\s+/).forEach(word => {
    const trial = line ? line + ' ' + word : word;
    if(line && ctx.measureText(trial).width > maxW){ lines.push(line); line = word; } else line = trial;
  });
  if(line) lines.push(line);
  const lineH = size * 1.2;
  const w = Math.max.apply(null, lines.map(l => ctx.measureText(l).width));
  const h = lines.length * lineH;
  const margin = size * 0.4;
  const cH = ctx.canvas.height;
  const x0 = Math.max(margin, Math.min(s.x - w/2, canvasWidth - w - margin));
  const y0 = Math.max(margin, Math.min(s.y - h/2, cH - h - margin));
  return { size, lines, lineH, w, h, x0, y0 };
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
  } else if(s.type === 'text'){
    // A label centred on where it was tapped, kept inside the photo, wrapped to
    // fit, with a contrasting outline so it stays readable on any background.
    const L = annotateTextLayout(ctx, s, canvasWidth);
    ctx.lineWidth = Math.max(4, L.size * 0.28);
    ctx.strokeStyle = s.color === '#ffffff' ? '#000000' : '#ffffff';
    ctx.fillStyle = s.color;
    L.lines.forEach((l, i) => {
      const cx = L.x0 + (L.w - ctx.measureText(l).width) / 2; // centre each line within the label
      ctx.strokeText(l, cx, L.y0 + i * L.lineH);
      ctx.fillText(l, cx, L.y0 + i * L.lineH);
    });
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
  if(annotateSelected && annotateStrokes.indexOf(annotateSelected) !== -1){
    // Selection outline — only ever drawn on screen; it is removed before saving.
    const b = annotateBounds(ctx, annotateSelected, canvas.width);
    ctx.save();
    const lw = Math.max(3, canvas.width * 0.003);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = '#000000'; ctx.setLineDash([lw*4, lw*3]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.lineWidth = lw; ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }
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
    if(annotateTool === 'move'){
      // Pick the annotation under the finger (or deselect), then drag it.
      annotateSelected = annotateHitTest(pt);
      annotateMoveDrag = annotateSelected ? { s: annotateSelected, last: pt, dx: 0, dy: 0 } : null;
      redrawAnnotateCanvas();
      updateAnnotateSelUi();
      return;
    }
    if(annotateTool === 'text'){ annotateTextPoint = pt; return; } // a tap, not a stroke — the label is typed on release
    annotateDrawing = annotateTool === 'pen'
      ? {type:'pen', color:annotateColor, points:[pt]}
      : {type:annotateTool, color:annotateColor, x0:pt.x, y0:pt.y, x1:pt.x, y1:pt.y};
    redrawAnnotateCanvas();
  };
  canvas.onpointermove = (e) => {
    if(annotatePointerId === null || e.pointerId !== annotatePointerId) return;
    if(annotateMoveDrag){
      e.preventDefault();
      const mp = canvasPointFromEvent(canvas, e);
      const ddx = mp.x - annotateMoveDrag.last.x, ddy = mp.y - annotateMoveDrag.last.y;
      annotateTranslate(annotateMoveDrag.s, ddx, ddy);
      annotateMoveDrag.dx += ddx; annotateMoveDrag.dy += ddy;
      annotateMoveDrag.last = mp;
      redrawAnnotateCanvas();
      return;
    }
    if(!annotateDrawing) return;
    e.preventDefault();
    const pt = canvasPointFromEvent(canvas, e);
    if(annotateDrawing.type === 'pen') annotateDrawing.points.push(pt);
    else { annotateDrawing.x1 = pt.x; annotateDrawing.y1 = pt.y; }
    redrawAnnotateCanvas();
  };
  const finish = (e) => {
    if(annotatePointerId === null || e.pointerId !== annotatePointerId) return;
    annotatePointerId = null;
    if(annotateMoveDrag){
      if(annotateMoveDrag.dx || annotateMoveDrag.dy) annotateHistory.push({ kind:'move', s: annotateMoveDrag.s, dx: annotateMoveDrag.dx, dy: annotateMoveDrag.dy });
      annotateMoveDrag = null;
      return;
    }
    if(annotateTextPoint){
      const pt = annotateTextPoint; annotateTextPoint = null;
      askAnnotationText(pt);
      return;
    }
    if(annotateDrawing){
      // Drop accidental taps that never actually moved, rather than littering
      // the photo with invisible zero-size shapes.
      const meaningful = annotateDrawing.type === 'pen'
        ? annotateDrawing.points.length > 1
        : (Math.abs(annotateDrawing.x1-annotateDrawing.x0) > 4 || Math.abs(annotateDrawing.y1-annotateDrawing.y0) > 4);
      if(meaningful){ annotateStrokes.push(annotateDrawing); annotateHistory.push({ kind:'add', s: annotateDrawing }); }
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
  annotateSelected = null; redrawAnnotateCanvas(); // never bake the selection outline into the saved photo
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
      annotateSelected = null; annotateHistory = []; annotateMoveDrag = null;
      const list = entry.kind === 'customer' ? buildCustomerPhotoList(entry.ownerId) : buildJobPhotoList(entry.ownerId);
      const idx = list.findIndex(e=>e.photoId===photoId);
      openPhotoViewerAt(list, idx===-1 ? list.length-1 : idx, photoViewerOnClose);
    }
  }, 'image/jpeg', 0.9);
}

/* ---------- before & after ----------
   Combines two of a customer's photos into one image with BEFORE / AFTER labels:
   Landscape (2400 x 1200, before on the left and after on the right) or Portrait for social
   media (1080 x 1920 — 9:16 — before on top and after underneath). Opened from the photo
   viewer. The result is saved as a new photo (originals untouched) and can be shared. */
const BA_SIZES = { landscape:{ w:2400, h:1200 }, portrait:{ w:1080, h:1920 } };
let baState = null;       // {list, entry, before, after, layout, fit, lb, la}
let baImgs = {};          // photoId -> Promise<HTMLImageElement>
let baDrawToken = 0;
let baBlob = null;        // the finished JPEG for the current picture, ready to save or share

function baLoad(entry){
  if(!baImgs[entry.photoId]){
    baImgs[entry.photoId] = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('photo failed to load'));
      img.src = photoEntrySrc(entry);
    });
  }
  return baImgs[entry.photoId];
}
function openBeforeAfter(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry) return;
  const all = entry.kind === 'customer' ? buildCustomerPhotoList(entry.ownerId) : buildJobPhotoList(entry.ownerId);
  const list = all.filter(e => photoEntrySrc(e));
  if(list.length < 2){ toast('Before & after needs two photos — add another photo first'); return; }
  const cur = Math.max(0, list.findIndex(e => e.photoId === entry.photoId));
  baImgs = {};
  baState = {
    list, entry, before: cur, after: (cur + 1 < list.length ? cur + 1 : cur - 1),
    layout: 'landscape', fit: 'fill', lb: 'BEFORE', la: 'AFTER'
  };
  renderBeforeAfter();
}
function baPickerHtml(which){
  const st = baState;
  return st.list.map((e, i) => `<div data-ba="${which}" data-i="${i}" onclick="setBaPhoto('${which}', ${i})" style="flex:none; width:74px; cursor:pointer;">
      <img src="${photoEntrySrc(e)}" style="width:74px; height:74px; object-fit:cover; border-radius:10px; display:block; border:3px solid transparent;">
      <div style="font-size:0.625rem; color:var(--ink-muted); text-align:center; margin-top:2px;">${fmtDate(e.date).split(' ').slice(0,2).join(' ')}</div>
    </div>`).join('');
}
function renderBeforeAfter(){
  const st = baState;
  if(!st){ closeSheet(); return; }
  openSheet(`
    <div class="sheet-head">
      <h2>Before &amp; after</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div class="seg-row">
      <button class="seg-btn seg-btn-sm" data-ba-layout="landscape" onclick="setBaLayout('landscape')">Landscape · side by side</button>
      <button class="seg-btn seg-btn-sm" data-ba-layout="portrait" onclick="setBaLayout('portrait')">Portrait · for social media</button>
    </div>
    <div style="background:#111; border-radius:12px; overflow:hidden; margin-bottom:12px; text-align:center; padding:6px;">
      <canvas id="baCanvas" style="max-width:100%; max-height:52vh; display:inline-block; vertical-align:top;"></canvas>
    </div>
    <label style="margin-top:0;">Before photo</label>
    <div id="baPickBefore" style="display:flex; gap:8px; overflow-x:auto; padding:2px 0 8px;">${baPickerHtml('before')}</div>
    <label>After photo</label>
    <div id="baPickAfter" style="display:flex; gap:8px; overflow-x:auto; padding:2px 0 8px;">${baPickerHtml('after')}</div>
    <button class="btn" style="width:100%; margin:4px 0 10px; background:var(--blue-dim); color:var(--blue-deep);" onclick="swapBeforeAfter()">⇄ Swap before &amp; after</button>
    <div class="seg-row">
      <button class="seg-btn seg-btn-sm" data-ba-fit="fill" onclick="setBaFit('fill')">Crop to fill</button>
      <button class="seg-btn seg-btn-sm" data-ba-fit="whole" onclick="setBaFit('whole')">Show whole photos</button>
    </div>
    <div class="row2" style="margin-bottom:12px;">
      <div><label style="margin-top:0;">Left / top label</label><input type="text" maxlength="20" value="${escapeAttr(st.lb)}" oninput="setBaLabel('lb', this.value)"></div>
      <div><label style="margin-top:0;">Right / bottom label</label><input type="text" maxlength="20" value="${escapeAttr(st.la)}" oninput="setBaLabel('la', this.value)"></div>
    </div>
    <div class="row2" style="margin-bottom:8px;">
      <button class="btn btn-paid" onclick="saveBeforeAfter()">Save to photos</button>
      <button class="btn btn-clean" onclick="shareBeforeAfter()">📤 Share</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.7188rem; margin:6px 2px 0; text-align:center; line-height:1.5;">Saved as a new photo — the originals are kept as they are.</p>
  `, () => renderPhotoViewer());
  baRefreshUi();
  baRedraw();
}
// Updates the highlight on whichever options are chosen, without rebuilding the sheet.
function baRefreshUi(){
  const st = baState; if(!st) return;
  document.querySelectorAll('[data-ba-layout]').forEach(b => b.classList.toggle('active', b.dataset.baLayout === st.layout));
  document.querySelectorAll('[data-ba-fit]').forEach(b => b.classList.toggle('active', b.dataset.baFit === st.fit));
  document.querySelectorAll('[data-ba]').forEach(el => {
    const on = st[el.dataset.ba] === Number(el.dataset.i);
    const img = el.querySelector('img');
    if(img) img.style.borderColor = on ? (el.dataset.ba === 'before' ? '#374151' : '#16a34a') : 'transparent';
  });
}
function setBaLayout(v){ if(!baState) return; baState.layout = v; baRefreshUi(); baRedraw(); }
function setBaFit(v){ if(!baState) return; baState.fit = v; baRefreshUi(); baRedraw(); }
function setBaPhoto(which, i){ if(!baState) return; baState[which] = i; baRefreshUi(); baRedraw(); }
function swapBeforeAfter(){ if(!baState) return; const t = baState.before; baState.before = baState.after; baState.after = t; baRefreshUi(); baRedraw(); }
function setBaLabel(key, v){ if(!baState) return; baState[key] = v; baRedraw(); }

function baRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
function baDrawPanel(ctx, img, r, fit){
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if(fit === 'whole'){
    ctx.fillStyle = '#111827'; ctx.fillRect(r.x, r.y, r.w, r.h);
    const k = Math.min(r.w / iw, r.h / ih);
    const dw = iw * k, dh = ih * k;
    ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
  } else {
    const k = Math.max(r.w / iw, r.h / ih); // centre-crop to fill the panel
    const dw = iw * k, dh = ih * k;
    ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
  }
  ctx.restore();
}
function baDrawLabel(ctx, text, r, color, layout){
  text = String(text || '').trim();
  if(!text) return;
  const size = layout === 'landscape' ? 76 : 64;
  const m = Math.round(size * 0.45);
  ctx.save();
  ctx.font = `800 ${size}px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const padX = size * 0.5, padY = size * 0.32;
  const w = Math.min(r.w - m * 2, tw + padX * 2), h = size + padY * 2;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;
  baRoundRect(ctx, r.x + m, r.y + m, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(text, r.x + m + w / 2, r.y + m + h / 2 + size * 0.04, w - padX);
  ctx.restore();
}
function paintBeforeAfter(canvas, ib, ia, st){
  const { w, h } = BA_SIZES[st.layout];
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  const gap = 10;
  let pb, pa;
  if(st.layout === 'landscape'){
    const pw = Math.floor((w - gap) / 2);
    pb = { x:0, y:0, w:pw, h };
    pa = { x:pw + gap, y:0, w:pw, h };
  } else {
    const ph = Math.floor((h - gap) / 2);
    pb = { x:0, y:0, w, h:ph };
    pa = { x:0, y:ph + gap, w, h:ph };
  }
  baDrawPanel(ctx, ib, pb, st.fit);
  baDrawPanel(ctx, ia, pa, st.fit);
  baDrawLabel(ctx, st.lb, pb, '#374151', st.layout);
  baDrawLabel(ctx, st.la, pa, '#16a34a', st.layout);
}
async function baRedraw(){
  const canvas = document.getElementById('baCanvas');
  const st = baState;
  if(!canvas || !st) return;
  const token = ++baDrawToken;
  baBlob = null;
  let ib, ia;
  try{ [ib, ia] = await Promise.all([baLoad(st.list[st.before]), baLoad(st.list[st.after])]); }
  catch(e){ toast('Could not load one of those photos'); return; }
  if(token !== baDrawToken || !document.getElementById('baCanvas')) return;
  paintBeforeAfter(canvas, ib, ia, st);
  // Encode now so Save and Share can act instantly (phones only allow sharing straight after a tap).
  canvas.toBlob(b => { if(token === baDrawToken) baBlob = b; }, 'image/jpeg', 0.92);
}
function baFileName(){
  const st = baState;
  const owner = st.entry.kind === 'customer' ? data.customers.find(x=>x.id===st.entry.ownerId) : (data.oneOffJobs||[]).find(x=>x.id===st.entry.ownerId);
  const base = ((owner && (owner.address || owner.name)) || 'photos').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
  return `before-after-${base}-${st.layout}-${todayISO()}.jpg`;
}
async function saveBeforeAfter(){
  const st = baState;
  if(!st) return;
  if(!baBlob){ toast('One moment — still preparing the picture'); return; }
  const blob = baBlob;
  const entry = st.entry;
  const owner = entry.kind === 'customer' ? data.customers.find(x=>x.id===entry.ownerId) : (data.oneOffJobs||[]).find(x=>x.id===entry.ownerId);
  if(!owner){ toast('Could not find the photo\'s customer or job'); return; }
  const photoId = uid();
  owner.photos = owner.photos || [];
  if(photoStorageAvailable){
    await idbSavePhoto(photoId, blob);
    cachePhotoBlob(photoId, blob);
    owner.photos.push({ id: photoId, date: todayISO() });
  } else {
    const dataUrl = await blobToDataURL(blob);
    owner.photos.push({ id: photoId, dataUrl, date: todayISO() });
  }
  if(await saveData()){
    toast('Before & after saved to photos');
    baState = null; baImgs = {}; baBlob = null;
    const list = entry.kind === 'customer' ? buildCustomerPhotoList(entry.ownerId) : buildJobPhotoList(entry.ownerId);
    const idx = list.findIndex(e => e.photoId === photoId);
    openPhotoViewerAt(list, idx === -1 ? list.length - 1 : idx, photoViewerOnClose);
  }
}
async function shareBeforeAfter(){
  const st = baState;
  if(!st) return;
  if(!baBlob){ toast('One moment — still preparing the picture'); return; }
  const file = new File([baBlob], baFileName(), { type: 'image/jpeg' });
  try{
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file] });
      return;
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;
  }
  // No share sheet (e.g. a computer): download it instead.
  const url = URL.createObjectURL(baBlob);
  const a = document.createElement('a');
  a.href = url; a.download = baFileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Picture downloaded');
}

/* ---------- photo + offer text ----------
   From the photo viewer: pick an offer (gutter clearing, conservatory roof...),
   optionally add a price, tweak the wording, and share the photo together with the
   message through the phone's share sheet (so it can go by Messages or WhatsApp).
   Some apps drop the text when a photo is attached, so the message is also copied. */
const UPSELL_OFFERS = {
  gutter:       { label:'Gutter clearing',      key:'upsellGutterTemplate',       def:DEFAULT_UPSELL_GUTTER_TEMPLATE },
  conservatory: { label:'Conservatory roof',    key:'upsellConservatoryTemplate', def:DEFAULT_UPSELL_CONSERVATORY_TEMPLATE },
  fascias:      { label:'Fascias & soffits',    key:'upsellFasciasTemplate',      def:DEFAULT_UPSELL_FASCIAS_TEMPLATE },
  other:        { label:'Something else',       key:'upsellOtherTemplate',        def:DEFAULT_UPSELL_OTHER_TEMPLATE }
};
let upsellState = { offer:'gutter', price:'', edited:false };
function upsellOwner(entry){
  if(!entry) return null;
  return entry.kind === 'customer' ? data.customers.find(x=>x.id===entry.ownerId) : (data.oneOffJobs||[]).find(x=>x.id===entry.ownerId);
}
function buildUpsellMessage(entry){
  const o = UPSELL_OFFERS[upsellState.offer] || UPSELL_OFFERS.gutter;
  const owner = upsellOwner(entry);
  const tpl = data.settings[o.key] || o.def;
  const price = parseFloat(upsellState.price);
  const priceText = price > 0 ? ' for ' + money(price) : '';
  const firstName = owner && owner.name ? owner.name.trim().split(' ')[0] : '';
  return applyTemplate(tpl.replace(/\{price\}/g, priceText), {
    name: firstName, company: data.settings.companyName || '', yourname: data.settings.yourName || ''
  }).trim();
}
function openPhotoUpsell(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry) return;
  upsellState = { offer: upsellState.offer || 'gutter', price:'', edited:false };
  renderUpsellSheet();
}
function renderUpsellSheet(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry){ closeSheet(); return; }
  const src = photoEntrySrc(entry);
  const chips = Object.keys(UPSELL_OFFERS).map(k => {
    const on = k === upsellState.offer;
    return `<button onclick="setUpsellOffer('${k}')" style="border:none; border-radius:20px; padding:9px 14px; font-size:0.8125rem; font-weight:800; background:${on?'var(--navy)':'var(--line)'}; color:${on?'#fff':'var(--ink)'};">${UPSELL_OFFERS[k].label}</button>`;
  }).join('');
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Send photo with an offer</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    ${src ? `<img src="${src}" style="display:block; max-height:130px; max-width:100%; border-radius:10px; margin:0 auto 12px;">` : ''}
    <label style="margin-top:0;">What are you offering?</label>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px;">${chips}</div>
    <label>Price <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <input type="number" id="upsell_price" inputmode="decimal" step="0.01" min="0" placeholder="e.g. 40" value="${escapeAttr(upsellState.price)}" oninput="onUpsellPrice(this.value)">
    <label>Message <span style="text-transform:none; font-weight:500; opacity:0.7;">(edit freely)</span></label>
    <textarea id="upsell_msg" rows="7" oninput="upsellState.edited=true">${escapeHtml(buildUpsellMessage(entry))}</textarea>
    <div class="form-actions">
      <button class="btn-primary" onclick="sendPhotoUpsell()">📤 Send photo + message</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.7188rem; margin:10px 2px 0; text-align:center; line-height:1.5;">Opens your share sheet — pick Messages or WhatsApp and the customer. The message is also copied, so paste it if your app leaves it out. Wording for each offer can be changed under Settings → Message templates.</p>
  `, () => renderPhotoViewer());
}
function setUpsellOffer(k){
  if(!UPSELL_OFFERS[k]) return;
  upsellState.offer = k;
  upsellState.edited = false;
  renderUpsellSheet();
}
function onUpsellPrice(v){
  upsellState.price = v;
  if(upsellState.edited) return; // don't overwrite wording they've changed by hand
  const ta = document.getElementById('upsell_msg');
  const entry = photoViewerList[photoViewerIndex];
  if(ta && entry) ta.value = buildUpsellMessage(entry);
}
async function sendPhotoUpsell(){
  const entry = photoViewerList[photoViewerIndex];
  const ta = document.getElementById('upsell_msg');
  if(!entry || !ta) return;
  const msg = ta.value.trim();
  if(!msg){ toast('The message is empty'); return; }
  // Copy first, while still inside the tap — a safety net for apps that discard the text.
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg).catch(()=>{}); }catch(e){}
  const owner = upsellOwner(entry);
  const p = owner && (owner.photos||[]).find(x=>x.id===entry.photoId);
  if(!p){ toast('Could not find that photo'); return; }
  try{
    const blob = photoStorageAvailable ? await idbGetPhoto(entry.photoId) : await (await fetch(p.dataUrl)).blob();
    if(!blob) throw new Error('photo not found');
    const safeName = (owner.address || owner.name || 'photo').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const file = new File([blob], `${safeName}-${p.date}.jpg`, { type: blob.type || 'image/jpeg' });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], text: msg });
      logMessage(owner, 'upsell');
      saveData();
      toast('Shared — message also copied if it didn\'t come through');
      closeSheet();
    } else {
      toast('Photo sharing isn\'t supported here — message copied, attach the photo yourself');
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;
    toast('Could not share that photo — message copied');
  }
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
  appConfirm(`${kind==='clean'?'Amount charged':'Amount paid'} for ${fmtDate(dateKey)}`, {
    title: 'Edit amount', confirmLabel: 'Save', danger: false,
    input: {value: entry.amount, type: 'number'},
    onConfirm: (val) => {
      const num = parseFloat(val);
      if(isNaN(num) || num<0){ toast('Enter a valid amount'); return; }
      entry.amount = num;
      saveData(); openCustomerHistoryList(id, kind); render();
    }
  });
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
  appConfirm('Remove this price entry?', {title:'Remove price entry', confirmLabel:'Remove', onConfirm: () => {
    c.priceHistory.splice(idx,1);
    saveData(); openCustomerHistoryList(id, 'price'); render();
  }});
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

// Shared date math for deferring by a fixed number of days. Bases the new
// date off whichever is latest: their natural next-due date (so someone not
// yet due gets their whole cycle pushed out), today (so an already-overdue
// customer still gets a genuine period from now), or an existing deferral
// (so deferring again while already deferred stacks correctly).
function deferredDateFor(c, days){
  days = days || 28;
  const today = todayISO();
  const naturalDue = nextDueISO(c) || today;
  let base = naturalDue > today ? naturalDue : today;
  if(c.deferUntil && c.deferUntil > base) base = c.deferUntil;
  const d = new Date(base+'T00:00:00');
  d.setDate(d.getDate() + days);
  // Local date parts — toISOString() converts to UTC, which in British Summer Time
  // lands a day early.
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function deferLabel(days){
  if(days===1) return '1 day';
  if(days===7) return '1 week';
  if(days===28) return '4 weeks';
  return `${days} days`;
}
// "Couldn't clean": nobody home, locked gate, bad weather etc. Skips this clean by
// deferring a full cycle from today (so they come round again at their next normal
// clean date) and flags the card until they're next cleaned — the flag is tied to
// the date, so any clean logged on or after it makes the flag disappear by itself.
function markCouldntClean(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const prev = { deferUntil: c.deferUntil, couldntCleanDate: c.couldntCleanDate };
  c.couldntCleanDate = todayISO();
  c.deferUntil = deferredDateFor({ cleanHistory: [], frequencyWeeks: c.frequencyWeeks, deferUntil: null }, freqDays(c));
  saveData(); closeSheet(); render();
  toast(`Couldn't clean ${c.name||c.address||'customer'} — deferred to ${fmtDate(c.deferUntil)}`, 'Undo', () => {
    c.deferUntil = prev.deferUntil;
    c.couldntCleanDate = prev.couldntCleanDate;
    saveData(); render();
  });
}
// True while the "couldn't clean" flag still applies: set, and no clean since.
function couldntCleanActive(c){
  if(!c.couldntCleanDate) return false;
  const last = lastDateOf(c.cleanHistory);
  return !last || last < c.couldntCleanDate;
}
function cancelDefer(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  c.deferUntil = null;
  c.couldntCleanDate = null;
  saveData(); openCustomerDetail(id); render();
  toast('Defer cancelled');
}

/* ---------- Defer ----------
   One "Defer" entry point, for a single customer or a whole round, offering
   1 day / 1 week / 4 weeks or an exact custom date — rather than several
   separate buttons for a fixed +4 weeks and a separate "set exact date". */
function openDeferSheet(scope, idOrRoundName){
  const isRound = scope === 'round';
  const c = isRound ? null : data.customers.find(x=>x.id===idOrRoundName);
  if(!isRound && !c) return;
  const custs = isRound ? data.customers.filter(x=>x.round===idOrRoundName && !x.paused) : [c];
  if(isRound && !custs.length){ toast('No active customers in this round'); return; }
  const currentlyDeferred = !isRound && c.deferUntil;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Defer</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    ${currentlyDeferred ? `<p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px;">Currently deferred to ${fmtDate(c.deferUntil)}.</p>`
      : (isRound ? `<p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px;">Applies to all ${custs.length} active customer${custs.length===1?'':'s'} in "${escapeHtml(idOrRoundName)}".</p>` : '')}
    <button class="backup-btn" onclick="applyDefer('${scope}','${escapeAttr(idOrRoundName)}',1)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div><div class="t1">1 day</div></div>
    </button>
    <button class="backup-btn" onclick="applyDefer('${scope}','${escapeAttr(idOrRoundName)}',7)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div><div class="t1">1 week</div></div>
    </button>
    <button class="backup-btn" onclick="applyDefer('${scope}','${escapeAttr(idOrRoundName)}',28)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div><div class="t1">4 weeks</div></div>
    </button>
    <button class="backup-btn" onclick="openDeferCustomDate('${scope}','${escapeAttr(idOrRoundName)}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <div><div class="t1">Custom date</div></div>
    </button>
    ${currentlyDeferred ? `<button class="btn-danger-text" style="margin-top:6px;" onclick="cancelDefer('${idOrRoundName}')">Cancel defer</button>` : ''}
  `, () => isRound ? openRoundActionsMenu(idOrRoundName) : openCustomerDetail(idOrRoundName));
}
function applyDefer(scope, idOrRoundName, days){
  if(scope === 'round'){
    const custs = data.customers.filter(x=>x.round===idOrRoundName && !x.paused);
    if(!custs.length){ toast('No active customers in this round'); return; }
    custs.forEach(c => { c.deferUntil = deferredDateFor(c, days); });
    saveData();
    closeSheet();
    render();
    toast(`Deferred ${custs.length} customer${custs.length===1?'':'s'} in "${idOrRoundName}" by ${deferLabel(days)}`);
  } else {
    const c = data.customers.find(x=>x.id===idOrRoundName);
    if(!c) return;
    c.deferUntil = deferredDateFor(c, days);
    saveData();
    closeSheet();
    openCustomerDetail(idOrRoundName);
    render();
    toast(`Due date deferred to ${fmtDate(c.deferUntil)}`);
  }
}
function openDeferCustomDate(scope, idOrRoundName){
  const isRound = scope === 'round';
  const c = isRound ? null : data.customers.find(x=>x.id===idOrRoundName);
  const custs = isRound ? data.customers.filter(x=>x.round===idOrRoundName && !x.paused) : (c ? [c] : []);
  if(!custs.length) return;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Defer — custom date</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Due again from</label>
    <input type="date" id="defer_date_input" value="${isRound ? deferredDateFor(custs[0],28) : (c.deferUntil || deferredDateFor(c,28))}">
    ${isRound ? `<p style="color:var(--ink-muted); font-size:0.75rem; margin:6px 2px 16px; line-height:1.5;">Applies to all ${custs.length} active customer${custs.length===1?'':'s'} in "${escapeHtml(idOrRoundName)}".</p>` : ''}
    <div class="form-actions">
      <button class="btn-primary" onclick="saveDeferCustomDate('${scope}','${escapeAttr(idOrRoundName)}')">Save</button>
    </div>
  `, () => openDeferSheet(scope, idOrRoundName));
}
function saveDeferCustomDate(scope, idOrRoundName){
  const v = document.getElementById('defer_date_input').value;
  if(!v){ toast('Pick a date'); return; }
  if(scope === 'round'){
    const custs = data.customers.filter(x=>x.round===idOrRoundName && !x.paused);
    custs.forEach(c => { c.deferUntil = v; });
    saveData();
    closeSheet();
    render();
    toast(`Due date set to ${fmtDate(v)} for ${custs.length} customer${custs.length===1?'':'s'} in "${idOrRoundName}"`);
  } else {
    const c = data.customers.find(x=>x.id===idOrRoundName);
    if(!c) return;
    c.deferUntil = v;
    saveData();
    closeSheet();
    openCustomerDetail(idOrRoundName);
    render();
    toast(`Due date deferred to ${fmtDate(v)}`);
  }
}

/* ---------- Price uplift ----------
   Applies a price increase — a percentage or a flat £ amount — to one
   customer or a whole round in one go, recorded through the normal
   priceHistory mechanism so it shows in price history and clears the
   "📈 Review" flag, same as editing a price by hand would. */
function roundToNearestHalf(n){ return Math.round(n*2)/2; }
function upliftedPrice(price, type, raw){
  return roundToNearestHalf(type==='percent' ? Number(price||0) * (1 + raw/100) : Number(price||0) + raw);
}
function openCustomerUpliftSheet(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Price uplift</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 14px;">Current price: ${money(c.price)}</p>
    <label style="margin-top:0;">Uplift type</label>
    <select id="uplift_type">
      <option value="percent">Percentage increase</option>
      <option value="amount">Flat £ amount increase</option>
    </select>
    <label>Value</label>
    <input type="number" id="uplift_value" inputmode="decimal" step="0.5" min="0" placeholder="e.g. 5">
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:6px 2px 0; line-height:1.5;">Rounded to the nearest 50p, recorded in this customer's price history.</p>
    <div class="form-actions">
      <button class="btn-primary" onclick="applyCustomerUplift('${id}')">Apply uplift</button>
    </div>
  `, () => openCustomerDetail(id));
}
function applyCustomerUplift(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  const type = document.getElementById('uplift_type').value;
  const raw = parseFloat(document.getElementById('uplift_value').value);
  if(!raw || raw <= 0){ toast('Enter a value above 0'); return; }
  const newPrice = upliftedPrice(c.price, type, raw);
  if(newPrice !== c.price){
    c.price = newPrice;
    c.priceHistory = c.priceHistory || [];
    c.priceHistory.push({date: todayISO(), price: newPrice});
    saveData();
  }
  closeSheet();
  openCustomerDetail(id);
  render();
  toast(`Price updated to ${money(newPrice)}`);
}
function openRoundUpliftSheet(rn){
  const custs = data.customers.filter(c => c.round === rn && !c.paused);
  if(!custs.length){ toast('No active customers in this round'); return; }
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Price uplift</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">Uplift type</label>
    <select id="uplift_type">
      <option value="percent">Percentage increase</option>
      <option value="amount">Flat £ amount increase</option>
    </select>
    <label>Value</label>
    <input type="number" id="uplift_value" inputmode="decimal" step="0.5" min="0" placeholder="e.g. 5">
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:6px 2px 0; line-height:1.5;">Applies to all ${custs.length} active customer${custs.length===1?'':'s'} in "${escapeHtml(rn)}", rounded to the nearest 50p and recorded in each customer's own price history.</p>
    <div class="form-actions">
      <button class="btn-primary" onclick="applyRoundUplift('${escapeAttr(rn)}')">Apply uplift</button>
    </div>
  `, () => openRoundActionsMenu(rn));
}
function applyRoundUplift(rn){
  const type = document.getElementById('uplift_type').value;
  const raw = parseFloat(document.getElementById('uplift_value').value);
  if(!raw || raw <= 0){ toast('Enter a value above 0'); return; }
  const custs = data.customers.filter(c => c.round === rn && !c.paused);
  appConfirm(`Apply a ${type==='percent'?raw+'% increase':'£'+raw.toFixed(2)+' increase'} to all ${custs.length} active customer${custs.length===1?'':'s'} in "${rn}"?`, {title:'Apply price uplift', confirmLabel:'Apply', danger:false, onConfirm: () => {
    custs.forEach(c=>{
      const newPrice = upliftedPrice(c.price, type, raw);
      if(newPrice !== c.price){
        c.price = newPrice;
        c.priceHistory = c.priceHistory || [];
        c.priceHistory.push({date: todayISO(), price: newPrice});
      }
    });
    saveData();
    closeSheet();
    render();
    toast(`Price uplift applied to ${custs.length} customer${custs.length===1?'':'s'} in "${rn}"`);
  }});
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
  clean: 'Cleaning reminder', textBefore: 'Text before visit', cleanedToday: 'Windows cleaned today', pay: 'Payment reminder',
  receipt: 'Receipt', upsell: 'Photo offer sent', quote: 'Quote', repeatQuote: 'Repeat work quote', quoteFollowUp: 'Quote follow-up', quoteCall: 'Follow-up call made', quotePdf: 'Quote sent as PDF', marketing: 'Marketing text'
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
// The 1st payment reminder uses the normal wording; the 2nd and every one after
// switches to the firmer follow-up template, based on the count already tracked
// per customer/job — so the tone escalates automatically without extra taps.
function payTemplateFor(reminderCount){
  return (reminderCount||0) >= 1
    ? (data.settings.payFollowUpTemplate || DEFAULT_PAY_FOLLOWUP_TEMPLATE)
    : (data.settings.payTemplate || DEFAULT_PAY_TEMPLATE);
}
// Quote follow-ups get softer each time rather than pushier: the 1st send uses
// the normal quote wording, the 2nd switches to a light "just checking you saw
// it" nudge, and the 3rd+ backs off further to a no-pressure closing message —
// same escalating-by-count pattern as payTemplateFor above, just the reverse
// tone (chasing an unpaid bill vs. chasing a sale calls for different energy).
function quoteTemplateFor(count){
  if((count||0) >= 2) return data.settings.quoteFollowUp2Template || DEFAULT_QUOTE_FOLLOWUP2_TEMPLATE;
  if((count||0) >= 1) return data.settings.quoteFollowUpTemplate || DEFAULT_QUOTE_FOLLOWUP_TEMPLATE;
  return null; // caller falls back to the base quote/repeat-quote template
}
function applyTemplate(tpl, tokens){
  return (tpl||'')
    .replace(/\{name\}/g, tokens.name || 'there')
    .replace(/\{amount\}/g, tokens.amount != null ? money(tokens.amount) : '')
    .replace(/\{company\}/g, tokens.company || '')
    .replace(/\{date\}/g, tokens.date || '')
    .replace(/\{yourname\}/g, tokens.yourname || '')
    .replace(/\{work\}/g, tokens.work || 'your window cleaning')
    .replace(/\{daysoverdue\}/g, tokens.daysoverdue != null ? String(tokens.daysoverdue) : '')
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
// each customer one at a time. It covers exactly what the round list is showing
// (the Day and All/Due/Owed filters), so filter first to get directions for just
// one day or just the customers that are due.
function startRoundDirections(rn){
  const custs = roundScopeList(rn).filter(c=>!c.paused);
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
  const letterheadHtml = invoiceLetterheadHtml();

  const body = `
    ${letterheadHtml}
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
    name: firstName, amount: jobDiscountedTotal(j), company, date: fmtDate(j.date), yourname
  });
  openMessagePreview('Send receipt', j.phone, msg, null, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)), {item: j, kind: 'receipt'});
}

function sendJobPaymentReminder(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  if(!j) return;
  if(!j.done){ toast('Mark the job done before sending a payment reminder'); return; }
  if(!isMobileNumber(j.phone)){ toast('No mobile number saved for this job'); return; }
  const firstName = j.name ? j.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const tpl = payTemplateFor(j.paymentReminderCount);
  const daysOverdue = j.date ? Math.max(0, daysBetween(j.date, todayISO())) : 0;
  const msg = applyTemplate(tpl, {name: firstName, amount: jobDiscountedTotal(j), company, yourname, address: j.address, daysoverdue: daysOverdue});
  const afterSend = () => {
    j.paymentReminderSent = true;
    j.paymentReminderSentDate = todayISO();
    j.paymentReminderCount = (j.paymentReminderCount||0) + 1;
    saveData();
    render();
  };
  openMessagePreview('Payment reminder', j.phone, msg, afterSend, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)), {item: j, kind: 'pay'});
}


// mode: 'initial' = the original quote wording (a re-send of the quote itself);
// 'followup' = the softer chase wording; omitted = whichever the send count says,
// as before. Sending the quote for the first time, or any follow-up, counts as a
// chase (quoteFollowUpCount) so the next reminder is pushed further out.
function sendQuoteText(id, mode){
  const q = data.quotes.find(x=>x.id===id);
  if(!q) return;
  const mobile = isMobileNumber(q.phone);
  if(!mobile && !q.email){ toast('No mobile number or email saved for this quote'); return; }
  const firstName = q.name ? q.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const count = q.quoteFollowUpCount || 0;
  const isFollowUp = mode === 'followup' || (mode !== 'initial' && count > 0);
  const tpl = isFollowUp
    ? quoteTemplateFor(Math.max(1, count))
    : (q.fromJobId ? data.settings.repeatQuoteTemplate : data.settings.quoteTemplate);
  const kind = isFollowUp ? 'quoteFollowUp' : (q.fromJobId ? 'repeatQuote' : 'quote');
  const countsAsChase = isFollowUp || count === 0;
  const msg = applyTemplate(tpl, {
    name: firstName, amount: Number(q.price||0), company, date: fmtDate(q.date), yourname, work: quoteWorkText(q)
  });
  if(mobile){
    const afterSend = () => {
      // Mirrors payTemplateFor/paymentReminderCount: each send escalates the
      // wording next time, and (via quoteNeedsFollowUp) widens the due window
      // so a quote just chased doesn't immediately look overdue again tomorrow.
      if(countsAsChase) q.quoteFollowUpCount = (q.quoteFollowUpCount||0) + 1;
      saveData();
      render();
    };
    openMessagePreview(isFollowUp ? 'Quote follow-up' : 'Send quote', q.phone, msg, afterSend, () => openQuoteDetail(id), {item: q, kind});
  } else {
    // Email: the mail app takes over from here, so this is logged when it's opened.
    logMessage(q, kind, {channel: 'email'});
    if(countsAsChase) q.quoteFollowUpCount = (q.quoteFollowUpCount||0) + 1;
    saveData();
    render();
    window.location.href = `mailto:${q.email}?subject=${encodeURIComponent('Your window cleaning quote')}&body=${encodeURIComponent(msg)}`;
  }
}

// The "windows cleaned today" text for a customer, using their real running balance
// (all charges minus all payments and credit) — so someone who owes a previous clean,
// or who's in credit, is told what they actually owe. In credit or fully paid = £0.
function cleanedTodayMessage(c){
  const st = custStatus(c);
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  return applyTemplate(data.settings.cleanedTodayTemplate, {name: firstName, amount: st.owed ? st.balance : 0, company: data.settings.companyName || '', yourname: data.settings.yourName || '', address: c.address});
}
// Used straight after a swipe-clean: marks the customer as texted for today and logs
// it, returning the message to open in the messaging app plus an undo for both. Null
// (do nothing) if the setting is off, there's no mobile number, or they've already
// been texted today — so a swipe, undo and swipe again never sends twice.
function prepareCleanedTodayText(c){
  if(data.settings.autoCleanedText === false || !isMobileNumber(c.phone)) return null;
  if(c.cleanedTodayTextSentDate === todayISO()) return null;
  const msg = cleanedTodayMessage(c);
  const prevSent = c.cleanedTodayTextSentDate;
  c.cleanedTodayTextSentDate = todayISO();
  logMessage(c, 'cleanedToday');
  const entry = c.messageLog[0];
  return {
    msg,
    undo: () => {
      c.cleanedTodayTextSentDate = prevSent;
      c.messageLog = (c.messageLog || []).filter(m => m !== entry);
    }
  };
}
function setAutoCleanedText(on){
  data.settings.autoCleanedText = !!on;
  saveData();
  openSettings();
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
    // Uses the customer's real running balance (all charges minus all payments and
    // credit), not just this clean's price — so someone who owes a previous clean, or
    // who's in credit, is told what they actually owe. In credit or fully paid = £0.
    msg = cleanedTodayMessage(c);
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
    const tpl = payTemplateFor(c.paymentReminderCount);
    msg = applyTemplate(tpl, {name: firstName, amount: amt, company, yourname, address: c.address, daysoverdue: daysSinceLastPayment(c)});
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

// Sends a single payment-reminder text straight from a customer card — same
// template, logging, and reminder-count bump as a Remind-all send, just
// without opening that sheet first.
function chaseCustomer(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !isMobileNumber(c.phone)){ toast('No mobile number saved for this customer'); return; }
  const s = custStatus(c);
  const tpl = payTemplateFor(c.paymentReminderCount); // friendly the first time, firmer after
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  const amt = s.owed ? s.balance : c.price;
  const msg = applyTemplate(tpl, {name: firstName, amount: amt, company, yourname, address: c.address, daysoverdue: daysSinceLastPayment(c)});
  sendPhoneMessage(c.phone, msg);
  logMessage(c, 'pay');
  c.paymentReminderSent = true;
  c.paymentReminderSentDate = todayISO();
  c.paymentReminderCount = (c.paymentReminderCount||0) + 1;
  saveData();
  render();
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
    list = roundCusts.filter(c=> custStatus(c).owed && isMobileNumber(c.phone))
      .sort((a,b)=> (daysSinceLastPayment(b)-daysSinceLastPayment(a)) || (custStatus(b).balance-custStatus(a).balance));
  }
  if(!list.length){ toast('No one with a mobile number to remind'); return; }

  const tplField = document.getElementById('bulk_msg');
  const tpl = tplField ? tplField.value : (kind==='owed' ? data.settings.payTemplate : data.settings.cleanTemplate);
  const tplField2 = document.getElementById('bulk_msg2');
  const tpl2 = tplField2 ? tplField2.value : (data.settings.payFollowUpTemplate || DEFAULT_PAY_FOLLOWUP_TEMPLATE);

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Remind — ${escapeHtml(roundName)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <label style="margin-top:0;">${kind==='owed' ? 'First reminder' : 'Message'} <span style="text-transform:none; font-weight:500; opacity:0.7;">({name}${kind==='owed'?', {amount}, {bankdetails}':''}, {company}, {yourname})</span></label>
    <textarea id="bulk_msg" rows="4">${escapeHtml(tpl)}</textarea>
    ${kind==='owed' ? `<label>Follow-up (2nd chase onwards)</label>
    <textarea id="bulk_msg2" rows="4">${escapeHtml(tpl2)}</textarea>` : ''}
    <p style="color:var(--ink-muted); font-size:0.7812rem; margin:10px 2px 14px; line-height:1.5;">
      Tap Send for each customer — it opens ${data.settings.messagingApp==='whatsapp'?'WhatsApp':'Messages'} pre-filled and ready to go. ${kind==='owed' ? 'Anyone who has already been chased gets the firmer follow-up wording automatically. ' : ''}Come back here for the next one.
    </p>
    ${list.map(c=>{
      const s = custStatus(c);
      const alreadySent = kind === 'owed' && c.paymentReminderSent;
      const daysOverdue = kind === 'owed' ? daysSinceLastPayment(c) : 0;
      return `<div class="cust-card" id="bulkrow-${c.id}" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="min-width:0;">
          <div class="cust-addr" style="font-weight:800; font-size:0.9062rem;">${escapeHtml(c.address||c.name||'Customer')}</div>
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.phone)}${kind==='owed'?` · Owes ${money(s.balance)}${daysOverdue?` · ${daysOverdue}d`:''}`:''}${alreadySent?` · 🔔 Reminded ${fmtDate(c.paymentReminderSentDate).split(' ').slice(0,2).join(' ')}`:''}</div>
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
  const sendable = all.filter(c=>isMobileNumber(c.phone) && !textFirstSent(c));
  if(!sendable.length){ toast(all.some(c=>isMobileNumber(c.phone)) ? 'Everyone has already been texted' : 'No one with a mobile number to text'); return; }

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
      Tap Send for each customer — it opens ${data.settings.messagingApp==='whatsapp'?'WhatsApp':'Messages'} pre-filled and ready to go. Come back here for the next one. Anyone already texted is shown as Sent.
    </p>
    ${Object.keys(byRound).map(rn=>{
      const list = byRound[rn].filter(c=>isMobileNumber(c.phone));
      if(!list.length) return '';
      return `<div class="section-label" style="margin:10px 2px 6px; font-size:0.6875rem;">${escapeHtml(rn)}</div>` +
        list.map(c=>{ const sent = textFirstSent(c); return `<div class="cust-card" id="bulkrow-${c.id}" style="display:flex; align-items:center; justify-content:space-between; gap:10px;${sent?' opacity:0.45;':''}">
          <div style="min-width:0;">
            <div class="cust-addr" style="font-weight:800; font-size:0.9062rem;">${escapeHtml(c.address||c.name||'Customer')}</div>
            <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(c.phone)}</div>
          </div>
          <button class="btn btn-clean" style="flex:0 0 auto; padding:9px 16px;${sent?' background:var(--line); color:var(--ink-muted);':''}" ${sent?'disabled':''} onclick="sendBulkReminder('${c.id}','textBefore')">${sent?'Sent ✓':'Send'}</button>
        </div>`; }).join('');
    }).join('')}
  `);
}
function sendBulkReminder(id, kind){
  const c = data.customers.find(x=>x.id===id);
  if(!c || !isMobileNumber(c.phone)) return;
  // Owed reminders: the first chase uses the first box, every later one the follow-up box.
  const followUp = kind === 'owed' && (c.paymentReminderCount||0) >= 1;
  const msgField = document.getElementById(followUp ? 'bulk_msg2' : 'bulk_msg');
  const tpl = msgField ? msgField.value : (kind==='owed' ? payTemplateFor(c.paymentReminderCount) : data.settings.cleanTemplate);
  const firstName = c.name ? c.name.trim().split(' ')[0] : '';
  const company = data.settings.companyName || '';
  const yourname = data.settings.yourName || '';
  let amt;
  if(kind === 'owed'){
    const s = custStatus(c);
    amt = s.owed ? s.balance : c.price;
  }
  const msg = applyTemplate(tpl, {name: firstName, amount: amt, company, yourname, address: c.address, daysoverdue: kind==='owed' ? daysSinceLastPayment(c) : undefined});
  sendPhoneMessage(c.phone, msg);
  logMessage(c, kind === 'owed' ? 'pay' : kind === 'textBefore' ? 'textBefore' : 'clean');
  if(kind === 'owed'){
    c.paymentReminderSent = true;
    c.paymentReminderSentDate = todayISO();
    c.paymentReminderCount = (c.paymentReminderCount||0) + 1;
  }
  saveData();
  markReminderSent(id);
  // Sent from a card's Text first flag (no bulk sheet open): refresh so the flag shows Texted.
  if(kind === 'textBefore' && !document.getElementById('bulkrow-'+id)) render();
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
  appConfirm(`Delete "${camp.name}"? This can't be undone.`, {title:'Delete campaign', confirmLabel:'Delete', onConfirm: () => {
    data.settings.marketingCampaigns = list.filter(c=>c.id!==id);
    saveData();
    toast('Campaign deleted');
    marketingDetailCampaignId = null;
    setTab('marketing');
  }});
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
  appConfirm(`Remove this ${kind==='clean'?'clean':'payment'}?`, {title:'Remove entry', confirmLabel:'Remove', onConfirm: () => {
    if(kind==='clean'){
      const idx = c.cleanHistory.findIndex(e=>e.date===dateVal);
      if(idx>-1) c.cleanHistory.splice(idx,1);
    } else {
      const idx = c.paymentHistory.findIndex(p=>p.date===dateVal);
      if(idx>-1) c.paymentHistory.splice(idx,1);
    }
    saveData(); openCustomerHistoryList(id, kind); render();
  }});
}

function handleFabClick(){
  if(currentTab === 'jobs') openJobForm();
  else if(currentTab === 'quotes') openQuoteForm();
  else if(currentTab === 'marketing') openGroupMarketingText();
  else openCustomerForm();
}

