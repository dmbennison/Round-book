/* 08f-privacy.js -- data protection tools.
   Part of Round Book's split JS bundle; loaded after 08e-messages.js and before 09-boot.js.

   1. Password-protected exports. A backup (or a single customer's data file) can be locked with a password: PBKDF2 ->
      AES-256-GCM, the same strength as live sync, in an envelope {app:'round-book-export', kind, ...}. Restore asks for the
      password. The password is never stored anywhere, so it cannot be recovered. A PDF of one customer's data can be
      password-protected too (standard PDF encryption, which is weaker but opens in any PDF reader).
   2. Export a customer's data (Customer > Actions > Export their data): everything held about them as a readable PDF
      and/or a portable data file, for a subject access request.
   3. Automatic deletion after 2 years of inactivity. Customers, and one-off jobs and quotes that belong to no customer,
      that have had no activity for 2 years are deleted, after a 30-day warning on Today that lets you keep them. Anyone who
      still owes money is never deleted. Tax records are kept separately by you and are not part of this. */

/* ===================================================================
   1. Password-protected exports
   =================================================================== */
// Ask for a new password twice. Resolves with the password, or null if cancelled.
function exportAskPassword(what){
  return new Promise(resolve => {
    appConfirm(`Choose a password for this ${what}. Use 8 or more characters. Anyone with the file and the password can read it, and if the password is lost the file can't be opened \u2014 it can't be recovered.`, {
      title:'Password-protect', confirmLabel:'Next', danger:false,
      input:{type:'password', placeholder:'Password (8+ characters)'},
      onCancel: () => resolve(null),
      onConfirm: (pw1) => {
        if(!pw1 || pw1.length < 8){ appAlert('Please use at least 8 characters.', {title:'Password', onConfirm: () => resolve(null)}); return; }
        appConfirm('Type the password again to confirm it.', {
          title:'Confirm password', confirmLabel:'Protect', danger:false,
          input:{type:'password', placeholder:'Password again'},
          onCancel: () => resolve(null),
          onConfirm: (pw2) => {
            if(pw2 !== pw1){ appAlert('Those didn\u2019t match \u2014 nothing was exported.', {title:'Password', onConfirm: () => resolve(null)}); return; }
            resolve(pw1);
          }
        });
      }
    });
  });
}
// Locks text with a password. Returns the file contents (a JSON string).
async function exportEncryptText(text, password, kind){
  const salt = syncB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await syncDeriveKey(password, salt);
  let bytes = new TextEncoder().encode(text), z = 0;
  if(typeof CompressionStream !== 'undefined'){
    try{ bytes = await syncStreamBytes(bytes, new CompressionStream('gzip')); z = 1; }catch(e){ z = 0; bytes = new TextEncoder().encode(text); }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`round-book-export|1|${kind}|${salt}|${z}`);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:aad}, key, bytes));
  return JSON.stringify({app:'round-book-export', v:1, kind, z, salt, iv:syncB64(iv), ct:syncB64(ct)});
}
// Unlocks an envelope. Returns the text, or null if the password is wrong / the file is damaged.
async function exportDecryptEnvelope(env, password){
  try{
    const key = await syncDeriveKey(password, env.salt);
    const aad = new TextEncoder().encode(`round-book-export|1|${env.kind}|${env.salt}|${env.z ? 1 : 0}`);
    let bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:syncUnB64(env.iv), additionalData:aad}, key, syncUnB64(env.ct)));
    if(env.z){
      if(typeof DecompressionStream === 'undefined') return null;
      bytes = await syncStreamBytes(bytes, new DecompressionStream('gzip'));
    }
    return new TextDecoder().decode(bytes);
  }catch(e){ return null; }
}
// Restore: asks for the password (again if it is wrong) and resolves with the backup object, or null if cancelled.
function exportAskUnlock(env, message){
  return new Promise(resolve => {
    appConfirm(message || 'This backup is password-protected. Enter its password.', {
      title:'Password needed', confirmLabel:'Unlock', danger:false,
      input:{type:'password', placeholder:'Password'},
      onCancel: () => resolve(null),
      onConfirm: async (pw) => {
        const text = pw ? await exportDecryptEnvelope(env, pw) : null;
        let obj = null;
        try{ obj = text ? JSON.parse(text) : null; }catch(e){ obj = null; }
        if(obj) resolve(obj);
        else resolve(await exportAskUnlock(env, 'That password didn\u2019t unlock the file. Try again.'));
      }
    });
  });
}
// Hands a file to the share sheet where there is one, otherwise downloads it.
async function exportDeliver(blob, filename, mime){
  if(navigator.canShare){
    try{
      const file = new File([blob], filename, {type:mime});
      if(navigator.canShare({files:[file]})){ await navigator.share({files:[file]}); return true; }
    }catch(e){ if(e && e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/* ===================================================================
   2. Export a customer's data
   =================================================================== */
let cxFormat = 'pdf';
function cxLinkedJobs(c){ return (data.oneOffJobs || []).filter(j => j.customerId === c.id); }
function cxLinkedQuotes(c){ return (data.quotes || []).filter(q => q.marketingCustomerId === c.id || q.convertedToCustomerId === c.id); }
function cxSlug(c){ return String(c.address || c.name || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'customer'; }

function openCustomerExport(id){
  const c = data.customers.find(x => x.id === id);
  if(!c) return;
  cxFormat = 'pdf';
  const photos = (c.photos || []).length + cxLinkedJobs(c).reduce((n, j) => n + (j.photos || []).length, 0);
  openSheet(`
    <div class="sheet-head">
      <h2>Export their data</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">\u2715</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.5; margin:0 0 12px;">Everything Round Book holds about <b>${escapeHtml(c.address || c.name || 'this customer')}</b>: their details, cleans, payments, prices, messages, notes, and any jobs and quotes linked to them. Use this to answer a customer who asks to see their data.</p>
    <div class="section-label">Format</div>
    <div class="seg-row" id="cxFormatRow">
      <button class="seg-btn active" data-f="pdf" onclick="cxSetFormat('pdf')">PDF to read</button>
      <button class="seg-btn" data-f="json" onclick="cxSetFormat('json')">Data file</button>
    </div>
    <p id="cxFormatNote" style="color:var(--ink-muted); font-size:0.75rem; line-height:1.5; margin:4px 2px 14px;"></p>
    <div class="section-label">Password <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></div>
    <input type="password" id="cx_pw" autocomplete="new-password" placeholder="Leave blank for no password" style="width:100%; box-sizing:border-box; padding:12px; border:1.5px solid var(--line); border-radius:12px; font:inherit; font-size:1rem; background:var(--surface); color:var(--ink);">
    <p id="cxPwNote" style="color:var(--ink-muted); font-size:0.75rem; line-height:1.5; margin:4px 2px 14px;"></p>
    <button class="btn-primary" style="width:100%;" onclick="cxRun('${id}')">Export</button>
    ${photos ? `<p style="color:var(--ink-muted); font-size:0.75rem; line-height:1.5; margin:10px 2px 0;">${photos} photo${photos === 1 ? ' is' : 's are'} held for this customer. They are included in the data file; the PDF just says how many there are.</p>` : ''}
  `, () => openCustomerDetail(id));
  cxSetFormat('pdf');
}
function cxSetFormat(f){
  cxFormat = f;
  document.querySelectorAll('#cxFormatRow .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  const n = document.getElementById('cxFormatNote'), p = document.getElementById('cxPwNote');
  if(n) n.textContent = f === 'pdf'
    ? 'A tidy document you can print or send to the customer.'
    : 'A portable file with every detail (and photos) in a structured form, for moving their data somewhere else.';
  if(p) p.textContent = f === 'pdf'
    ? 'A password-protected PDF asks for it in any PDF reader. PDF protection is the standard kind, so send the password by a different route from the file.'
    : 'A password-protected data file is strongly encrypted and can only be opened by someone with the password and Round Book\u2019s tools. Without a password it is plain text.';
}
async function cxPack(c, withPhotos){
  const clone = v => JSON.parse(JSON.stringify(v));
  const pack = {
    app:'round-book-customer-export', exportedAt: new Date().toISOString(),
    preparedBy: data.settings.companyName || data.settings.yourName || '',
    customer: clone(c), linkedJobs: clone(cxLinkedJobs(c)), linkedQuotes: clone(cxLinkedQuotes(c))
  };
  if(withPhotos && photoStorageAvailable){
    const ids = new Set();
    (pack.customer.photos || []).forEach(p => ids.add(p.id));
    pack.linkedJobs.forEach(j => (j.photos || []).forEach(p => ids.add(p.id)));
    const blobs = {};
    await Promise.all([...ids].map(async pid => { try{ const b = await idbGetPhoto(pid); if(b) blobs[pid] = await blobToDataURL(b); }catch(e){} }));
    pack._photoBlobs = blobs;
  }
  return pack;
}
async function cxRun(id){
  const c = data.customers.find(x => x.id === id);
  if(!c) return;
  const box = document.getElementById('cx_pw');
  const pw = box ? box.value : '';
  if(pw && pw.length < 8){ toast('Use at least 8 characters for the password, or leave it blank'); return; }
  const fmt = cxFormat, stamp = todayISO(), base = `round-book-${cxSlug(c)}-data-${stamp}`;
  toast('Preparing\u2026');
  try{
    let ok;
    if(fmt === 'pdf'){
      const blob = await cxBuildPdf(c, pw);
      if(!blob) return;
      ok = await exportDeliver(blob, base + (pw ? '-protected' : '') + '.pdf', 'application/pdf');
    } else {
      const pack = await cxPack(c, true);
      let text = JSON.stringify(pack, null, pw ? 0 : 2);
      if(pw) text = await exportEncryptText(text, pw, 'customer');
      ok = await exportDeliver(new Blob([text], {type:'application/json'}), base + (pw ? '-protected' : '') + '.json', 'application/json');
    }
    if(ok){ toast(pw ? 'Password-protected export ready' : 'Export ready'); closeSheet(); }
  }catch(e){ appAlert('Sorry, that export could not be made.', {title:'Export their data'}); }
}

const CX_LABELS = {
  address:'Address', name:'Name', phone:'Phone', email:'Email', round:'Round', price:'Price per clean', frequencyWeeks:'Clean every (weeks)',
  paymentMethod:'Payment method', accountNumber:'Account number', notes:'Notes', paused:'Paused', pauseReason:'Reason paused',
  marketingOptOut:'Opted out of marketing', deferUntil:'Next clean deferred to', propertyType:'Property type', bedrooms:'Bedrooms',
  addOnConservatory:'Conservatory', addOnExtension:'Extension', addOnGarageDoor:'Garage door', addOnOther:'Other extras',
  frontsOnly:'Fronts only', visitDay:'Visit day', postcode:'Postcode'
};
const CX_SKIP = ['id', 'order', 'photos', 'cleanHistory', 'paymentHistory', 'priceHistory', 'messageLog', 'purgeOn', 'retainedOn'];
function cxPretty(k){ return CX_LABELS[k] || (k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())); }
function cxValue(k, v){
  if(typeof v === 'boolean') return v ? 'Yes' : 'No';
  if(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if(k === 'price' && !isNaN(Number(v))) return money(v);
  return String(v);
}
async function cxBuildPdf(c, password){
  if(!(await loadLib('jspdf'))){ toast(LIB_NEEDS_SIGNAL); return null; }
  const { jsPDF } = window.jspdf;
  const opts = { unit:'pt', format:'a4' };
  if(password){
    const owner = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    opts.encryption = { userPassword: password, ownerPassword: owner, userPermissions: ['print'] };
  }
  const doc = new jsPDF(opts);
  const PW = 595, PH = 842, M = 44, W = PW - M * 2;
  let y = M;
  const clean = s => String(s == null ? '' : s).replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, '');
  const ensure = h => { if(y + h > PH - M){ doc.addPage(); y = M; } };
  const write = (s, size, bold, colour, x, width) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, colour || [25, 35, 45]);
    doc.splitTextToSize(clean(s), width || W).forEach(line => { ensure(size * 1.4); doc.text(line, x == null ? M : x, y + size); y += size * 1.4; });
  };
  const heading = s => { y += 12; ensure(34); write(s, 13, true, [10, 70, 120]); doc.setDrawColor(190, 200, 210); doc.line(M, y, PW - M, y); y += 6; };
  const kv = (k, v) => {
    const start = y;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(90, 100, 110);
    ensure(15); doc.text(clean(k), M, y + 10);
    y = start; write(v, 10, false, null, M + 170, W - 170);
    y = Math.max(y, start + 14);
  };
  const lines = (arr, f) => { if(!arr.length){ write('None held.', 10, false, [110, 120, 130]); return; } arr.forEach(x => write(f(x), 10)); };
  const byDate = (a, b) => String(a.date || '') < String(b.date || '') ? -1 : 1;

  write('Personal data held about a customer', 18, true, [10, 50, 90]);
  write(c.address || c.name || 'Customer', 12, true);
  write(`Prepared ${fmtDate(todayISO())}${data.settings.companyName || data.settings.yourName ? ' by ' + (data.settings.companyName || data.settings.yourName) : ''}. This lists everything held about this customer in Round Book.`, 9, false, [100, 110, 120]);

  heading('Details');
  Object.keys(c).filter(k => CX_SKIP.indexOf(k) < 0 && c[k] !== '' && c[k] != null && typeof c[k] !== 'object').forEach(k => kv(cxPretty(k), cxValue(k, c[k])));
  heading('Cleans');
  lines((c.cleanHistory || []).slice().sort(byDate), e => `${fmtDate(e.date)}   ${e.amount != null ? money(e.amount) : ''}${e.note ? '   ' + e.note : ''}`);
  heading('Payments');
  lines((c.paymentHistory || []).slice().sort(byDate), e => `${fmtDate(e.date)}   ${money(e.amount)}${e.method ? '   ' + e.method : ''}${e.note ? '   ' + e.note : ''}`);
  heading('Price history');
  lines((c.priceHistory || []).slice().sort(byDate), e => `${fmtDate(e.date)}   ${money(e.price)}`);
  heading('Messages sent');
  lines((c.messageLog || []).slice().sort(byDate), e => `${fmtDate(e.date)}   ${e.kind || 'message'}`);
  const jobs = cxLinkedJobs(c), quotes = cxLinkedQuotes(c);
  heading('One-off jobs');
  lines(jobs, j => `${fmtDate(j.date)}   ${money(j.price)}   ${j.done ? 'done' : 'not done'}, ${j.paid ? 'paid' : 'not paid'}${j.notes ? '   ' + j.notes : ''}`);
  heading('Quotes');
  lines(quotes, q => `${fmtDate(q.date)}   ${money(q.price)}   ${q.status || ''}${q.notes ? '   ' + q.notes : ''}`);
  const photos = (c.photos || []).length + jobs.reduce((n, j) => n + (j.photos || []).length, 0);
  heading('Photos');
  write(photos ? `${photos} photo${photos === 1 ? '' : 's'} held. They are included in the data-file version of this export.` : 'None held.', 10);
  return doc.output('blob');
}

/* ===================================================================
   3. Automatic deletion after 2 years of inactivity
   =================================================================== */
const RETENTION_DAYS = 730;      // 2 years
const RETENTION_WARN_DAYS = 30;  // how long you're warned (and can keep them) before anything is deleted
let retentionLastRunDay = null;

function retentionOn(){ return !(data && data.settings && data.settings.autoDeleteInactive === false); }
function retentionAddDays(iso, n){ const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Every date recorded on a record (its own dates, and the dates in its histories). The latest is its "last activity".
function retentionDatesOf(o){
  const out = [];
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
  Object.keys(o || {}).forEach(k => {
    if(k === 'purgeOn') return;
    const v = o[k];
    if(isDate(v)) out.push(v.slice(0, 10));
    else if(Array.isArray(v)) v.forEach(e => { if(e && typeof e === 'object' && isDate(e.date)) out.push(e.date.slice(0, 10)); });
  });
  return out;
}
function retentionCustomerIds(){ return new Set((data.customers || []).map(c => c.id)); }
// All the records the rule applies to: each with its last activity, whether it still owes money, and what goes with it.
function retentionItems(){
  const ids = retentionCustomerIds();
  const items = [];
  (data.customers || []).forEach(c => {
    const jobs = (data.oneOffJobs || []).filter(j => j.customerId === c.id);
    const quotes = (data.quotes || []).filter(q => q.marketingCustomerId === c.id || q.convertedToCustomerId === c.id);
    const dates = retentionDatesOf(c).concat(...jobs.map(retentionDatesOf), ...quotes.map(retentionDatesOf));
    items.push({ kind:'customer', obj:c, jobs, quotes, last: dates.sort().pop() || null, owes: !!custStatus(c).owed || jobs.some(j => j.done && !j.paid && Number(j.price || 0) > 0) });
  });
  (data.oneOffJobs || []).filter(j => !j.customerId || !ids.has(j.customerId)).forEach(j =>
    items.push({ kind:'job', obj:j, jobs:[], quotes:[], last: retentionDatesOf(j).sort().pop() || null, owes: !!(j.done && !j.paid && Number(j.price || 0) > 0) }));
  (data.quotes || []).filter(q => !(q.marketingCustomerId && ids.has(q.marketingCustomerId)) && !(q.convertedToCustomerId && ids.has(q.convertedToCustomerId))).forEach(q =>
    items.push({ kind:'quote', obj:q, jobs:[], quotes:[], last: retentionDatesOf(q).sort().pop() || null, owes:false }));
  return items;
}
function retentionLabel(it){
  const o = it.obj;
  const name = o.address || o.name || (it.kind === 'customer' ? 'Customer' : it.kind === 'job' ? 'Job' : 'Quote');
  return it.kind === 'customer' ? name : (it.kind === 'job' ? 'Job: ' : 'Quote: ') + name;
}
// Anything flagged and waiting out its warning.
function retentionPending(){
  if(!retentionOn()) return [];
  return retentionItems().filter(it => it.obj.purgeOn).sort((a, b) => a.obj.purgeOn < b.obj.purgeOn ? -1 : 1);
}
async function retentionRun(){
  if(!data || !data.settings || !retentionOn()) return;
  const today = todayISO(), cutoff = retentionAddDays(today, -RETENTION_DAYS);
  let changed = false;
  const due = [];
  retentionItems().forEach(it => {
    const o = it.obj;
    if(!it.last){ if(o.purgeOn){ delete o.purgeOn; changed = true; } return; } // nothing dated at all: leave it alone
    if(it.last >= cutoff || it.owes){ if(o.purgeOn){ delete o.purgeOn; changed = true; } return; } // active again, or still owes money
    if(!o.purgeOn){
      // The warning date is rounded up to a Sunday so two devices that notice on nearby days agree on the same date
      const d = new Date(retentionAddDays(today, RETENTION_WARN_DAYS) + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
      o.purgeOn = d.toISOString().slice(0, 10); changed = true;
    } else if(o.purgeOn <= today) due.push(it);
  });
  if(due.length){
    try{ await takeSafetyCopy('Before automatically deleting records with no activity for 2 years'); }catch(e){}
    const gone = new Set();
    due.forEach(it => { gone.add(it.obj); it.jobs.forEach(j => gone.add(j)); it.quotes.forEach(q => gone.add(q)); });
    data.customers = (data.customers || []).filter(x => !gone.has(x));
    data.oneOffJobs = (data.oneOffJobs || []).filter(x => !gone.has(x));
    data.quotes = (data.quotes || []).filter(x => !gone.has(x));
    changed = true;
  }
  if(changed){
    saveData();
    if(due.length){ try{ await cleanupOrphanedPhotos(); }catch(e){} }
    render();
    if(due.length) toast(`Deleted ${due.length} record${due.length === 1 ? '' : 's'} with no activity for 2 years`);
  }
}
function retentionKeep(kind, id){
  const list = kind === 'customer' ? data.customers : kind === 'job' ? data.oneOffJobs : data.quotes;
  const o = (list || []).find(x => x.id === id);
  if(!o) return;
  delete o.purgeOn;
  o.retainedOn = todayISO(); // counts as activity today, so the 2 years start again
  saveData(); render();
}
function retentionKeepAll(){
  retentionPending().forEach(it => { delete it.obj.purgeOn; it.obj.retainedOn = todayISO(); });
  saveData(); closeSheet(); render(); toast('Kept \u2014 the 2 years start again today');
}
function retentionBannerHtml(){
  const list = retentionPending();
  if(!list.length) return '';
  const first = list[0].obj.purgeOn;
  return `<div style="display:flex; align-items:flex-start; gap:10px; margin:0 0 8px; padding:10px 12px; border-radius:12px; background:var(--amber-dim); color:var(--ink);">
      <div style="font-size:1.125rem; line-height:1.2;">\u23f3</div>
      <div style="flex:1; min-width:0; font-size:0.8125rem; font-weight:700; line-height:1.4;">${list.length} record${list.length === 1 ? ' has' : 's have'} had no activity for 2 years and will be deleted from ${escapeHtml(fmtDate(first))}.</div>
      <button class="btn-primary" style="flex:none; padding:8px 12px; font-size:0.8125rem;" onclick="openRetentionReview()">Review</button>
    </div>`;
}
function openRetentionReview(){
  const list = retentionPending();
  openSheet(`
    <div class="sheet-head">
      <h2>Due for deletion</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">\u2715</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.5; margin:0 0 10px;">These have had no activity for 2 years and don\u2019t owe anything. They are deleted on the date shown unless you keep them. Keeping one starts its 2 years again. To give someone a copy of their data first, open them and choose Actions &gt; Export their data.</p>
    ${list.length ? `<button class="btn" style="width:100%; background:var(--blue-dim); color:var(--blue-deep); margin-bottom:12px;" onclick="retentionKeepAll()">Keep all of them</button>` : ''}
    ${list.map(it => `
      <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; margin-bottom:6px; border-radius:10px; background:var(--bg);">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:0.875rem; overflow-wrap:anywhere;">${escapeHtml(retentionLabel(it))}</div>
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">Last activity ${it.last ? escapeHtml(fmtDate(it.last)) : 'unknown'} \u00b7 deleted ${escapeHtml(fmtDate(it.obj.purgeOn))}</div>
        </div>
        <button class="btn" style="flex:none; padding:7px 12px; font-size:0.8125rem; background:var(--blue-dim); color:var(--blue-deep);" onclick="retentionKey('${it.kind}','${it.obj.id}')">Keep</button>
      </div>`).join('') || `<div class="empty"><b>Nothing is waiting</b><p>No records are due for deletion.</p></div>`}
  `, () => { if(document.getElementById('main')) render(); });
}
function retentionKey(kind, id){ retentionKeep(kind, id); openRetentionReview(); }
function setRetention(on){
  data.settings.autoDeleteInactive = !!on;
  if(!on) retentionItems().forEach(it => { delete it.obj.purgeOn; });
  saveData();
  openSettings();
  if(on) retentionRun();
}
// The Privacy block in Settings.
function retentionSettingsHtml(){
  const n = retentionPending().length;
  return `<div class="section-label">Privacy</div>
    <div class="seg-row">
      <button class="seg-btn ${retentionOn() ? 'active' : ''}" onclick="setRetention(true)">Delete after 2 years</button>
      <button class="seg-btn ${retentionOn() ? '' : 'active'}" onclick="setRetention(false)">Keep everything</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:4px 2px ${n ? '8px' : '16px'}; line-height:1.5;">When on, customers (and one-off jobs and quotes that belong to no customer) with <b>no activity for 2 years</b> are deleted, after a 30-day warning on Today where you can keep them. Anyone who still owes money is never deleted. Your tax records are kept separately and aren\u2019t touched. A safety copy is taken first.</p>
    ${n ? `<button class="btn" style="width:100%; background:var(--amber-dim); color:var(--ink); margin:0 0 16px;" onclick="openRetentionReview()">\u23f3 ${n} waiting for deletion \u2014 review</button>` : ''}`;
}
// Check once a day (the app can stay open for days on a phone).
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible' || typeof data === 'undefined' || !data) return;
  const day = todayISO();
  if(retentionLastRunDay === day) return;
  retentionLastRunDay = day;
  retentionRun();
});
