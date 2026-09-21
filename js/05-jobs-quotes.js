/* 05-jobs-quotes.js -- One-off jobs and quotes screens and forms.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- one-off jobs ---------- */
function renderJobs(main){
  let html = '';
  const today = todayISO();
  html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
    <button class="btn-open" style="width:auto; padding:8px 14px; display:inline-flex; gap:6px; align-items:center;" onclick="setTab('work')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 6l-6 6 6 6"/></svg> Work
    </button>
    <div style="display:flex; align-items:center; gap:8px;">
      ${mainScreenHelpBtn('jobs', "()=>setTab('jobs')")}
      <button class="btn-open" style="width:38px; height:38px; padding:0;" onclick="printAllJobs()" aria-label="Print report">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      </button>
    </div>
  </div>`;
  const jobs = (data.oneOffJobs || [])
    .slice()
    .sort((a,b)=>{
      if(!!a.done !== !!b.done) return a.done ? 1 : -1;
      if(!a.done) return (a.date||'').localeCompare(b.date||'');
      return (b.date||'').localeCompare(a.date||'');
    });
  if(!jobs.length){
    html += `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <b>No one-off jobs yet</b>
      <p>Tap the blue + button to add a gutter clean, one-time job, or anything outside your regular rounds — you can schedule it for any future date.</p>
    </div>`;
    main.innerHTML = html;
    return;
  }
  html += `<div class="section-label">${jobs.length} one-off job${jobs.length===1?'':'s'}</div>`;
  html += jobs.map(j=>jobCardHtml(j, today)).join('');
  const jobsTotal = jobs.reduce((sum,j)=>sum+Number(j.price||0),0);
  html += listTotalHtml(`${jobs.length} job${jobs.length===1?'':'s'} · ${money(jobsTotal)}`);
  main.innerHTML = html;
}

function jobCardHtml(j, today){
  today = today || todayISO();
  const isFuture = !j.done && j.date && j.date > today;
  const statusBadge = j.done
    ? `<span class="badge ok">Done</span>`
    : isFuture
      ? `<span class="badge due">Scheduled</span>`
      : `<span class="badge overdue">Not done</span>`;
  const anniv = jobAnniversaryInfo(j, today);
  return `<div class="swipe-wrap">
    <div class="swipe-bg swipe-bg-left">✓ Done</div>
    <div class="swipe-bg swipe-bg-right">💷 Paid</div>
    <div class="cust-card" data-id="${j.id}" data-kind="job">
      <div class="cust-top" onclick="openJobForm(data.oneOffJobs.find(x=>x.id==='${j.id}'))">
        <div>
          <div class="cust-addr" style="font-size:1rem; font-weight:800; color:var(--ink);">${escapeHtml(j.address||'No address')}</div>
          ${(j.name||j.phone) ? `<div class="cust-name" style="font-size:0.8125rem; font-weight:600; color:var(--ink-muted); margin-top:2px;">${[escapeHtml(j.name||''), j.phone?escapeHtml(j.phone):''].filter(Boolean).join(' · ')}</div>` : ''}
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${fmtDate(j.date)}${j.time?` at ${fmtTime(j.time)}`:''}${j.remind24h?' · 🔔 Reminder set':''}</div>
        </div>
        <div class="cust-right">
          <div class="cust-price">${money(j.price)}</div>
          <div class="cust-btn-row">
            ${j.phone ? `<button class="call-btn" onclick="event.stopPropagation(); callCustomer('job','${j.id}')" title="Call" aria-label="Call">${CALL_ICON}</button>` : ''}
            ${j.address ? `<button class="dir-btn" onclick="event.stopPropagation(); openDirections('job','${j.id}')" title="Directions" aria-label="Directions">${DIRECTIONS_ICON}</button>` : ''}
          </div>
        </div>
      </div>
      <div class="cust-meta">
        ${statusBadge}
        <span class="badge ${j.paid?'ok':'owed'}">${j.paid?'Paid':'Unpaid'}</span>
        ${(j.photos && j.photos.length) ? `<span class="badge paused">📷 ${j.photos.length}</span>` : ''}
        ${anniv ? `<span class="badge anniversary">🎉 ${anniv}-year anniversary</span>` : ''}
      </div>
    </div>
  </div>`;
}
function jobAnniversaryInfo(j, today){
  today = today || todayISO();
  if(!j.done || !j.date) return null;
  if(j.anniversaryReminder === false) return null;
  const daysSince = daysBetween(j.date, today);
  if(daysSince < 365) return null;
  // Calculate which year anniversary this is (1st = 365+, 2nd = 730+, 3rd = 1095+, etc.)
  const anniversaryYear = Math.floor(daysSince / 365);
  return anniversaryYear;
}

function toggleJobDone(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  j.done = !j.done;
  saveData(); render();
}
function toggleJobPaid(id){
  const j = data.oneOffJobs.find(x=>x.id===id);
  j.paid = !j.paid;
  if(j.paid) j.paidDate = todayISO();
  j.paymentReminderSent = false;
  j.paymentReminderSentDate = null;
  j.paymentReminderCount = 0;
  saveData(); render();
}

function scheduleJobForCustomer(id){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  openJobForm(null, Object.assign({ address: c.address||'', name: c.name||'', phone: c.phone||'', price: c.price||0, customerId: c.id }, propertyDetailsOf(c)), () => openCustomerDetail(id));
}

function quoteForCustomer(id, returnTo){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  openQuoteForm(null, Object.assign({ address: c.address||'', name: c.name||'', phone: c.phone||'', email: c.email||'', marketingCustomerId: c.id }, propertyDetailsOf(c)), returnTo || (() => openCustomerDetail(id)));
}

function fillJobFromCustomer(id){
  const field = document.getElementById('j_customerId');
  if(field) field.value = id || '';
  const linkNote = document.getElementById('j_link_note');
  if(!id){
    if(linkNote) linkNote.textContent = '';
    return;
  }
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  document.getElementById('j_address').value = c.address||'';
  document.getElementById('j_name').value = c.name||'';
  document.getElementById('j_phone').value = c.phone||'';
  if(c.price!=null) document.getElementById('j_price').value = c.price;
  fillPropertyFields('j', c);
  if(linkNote) linkNote.textContent = `🔗 Linked to ${c.address||c.name||'this customer'} — will show in their history`;
}
// Fills a form's property-detail fields (see propertyFieldsHtml) from a source
// object with the same keys — used when picking an existing customer, or when
// a quote's details carry across into a new job/customer.
function fillPropertyFields(prefix, src){
  if(!src) return;
  const set = (elId, val) => { const el = document.getElementById(prefix+elId); if(el) el.value = val; };
  const check = (elId, val) => { const el = document.getElementById(prefix+elId); if(el) el.checked = !!val; };
  set('_propertyType', src.propertyType||'');
  check('_frontsOnly', src.frontsOnly);
  check('_addOnConservatory', src.addOnConservatory);
  check('_addOnExtension', src.addOnExtension);
  check('_addOnGarageDoor', src.addOnGarageDoor);
  set('_addOnOther', src.addOnOther||'');
}

function openJobForm(existing, prefill, returnTo){
  const j = existing || prefill || {};
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${existing?'Edit job':'Add one-off job'}</h2>
      ${existing?`<button class="sheet-close" style="flex-shrink:0; margin-right:6px;" onclick="printJobRecord('${existing.id}')" aria-label="Print this job">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      </button>`:''}
      ${helpIconBtn('jobs', () => openJobForm(existing, prefill, returnTo))}
      <button class="sheet-close" style="flex-shrink:0;" onclick="closeSheet()">✕</button>
    </div>
    ${(!existing)?`
      <label style="margin-top:0">Fill from existing customer <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
      <select id="j_customer_picker" onchange="fillJobFromCustomer(this.value)">
        <option value="">— Select a customer —</option>
        ${data.customers.slice()
          .sort((a,b)=>(a.address||a.name||'').localeCompare(b.address||b.name||''))
          .map(c=>`<option value="${c.id}" ${prefill&&prefill.customerId===c.id?'selected':''}>${escapeHtml(c.address||c.name||'Customer')}</option>`).join('')}
      </select>
      <p id="j_link_note" style="color:var(--blue); font-size:0.75rem; font-weight:700; margin:-8px 2px 14px;">${prefill&&prefill.customerId?`🔗 Linked to ${escapeHtml(prefill.address||prefill.name||'this customer')} — will show in their history`:''}</p>
    `:''}
    <input type="hidden" id="j_customerId" value="${escapeAttr((j.customerId)||'')}">
    <input type="hidden" id="j_fromQuoteId" value="${escapeAttr((prefill&&prefill.fromQuoteId)||'')}">
    ${existing&&existing.customerId?`<p style="color:var(--blue); font-size:0.75rem; font-weight:700; margin:0 2px 14px;">🔗 Linked to a customer — shows in their history</p>`:''}
    ${prefill&&prefill.fromQuoteId?`<p style="color:var(--green); font-size:0.75rem; font-weight:700; margin:0 2px 14px;">✅ Converting from a quote — it'll be marked converted once saved</p>`:''}
    <label ${existing?'style="margin-top:0"':''}>Address</label>
    <input type="text" id="j_address" value="${escapeAttr(j.address||'')}" placeholder="e.g. 5 Oak Close">
    <label>Name <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <input type="text" id="j_name" value="${escapeAttr(j.name||'')}" placeholder="e.g. Mr Ahmed">
    <label>Phone (optional)</label>
    <input type="text" id="j_phone" value="${escapeAttr(j.phone||'')}" placeholder="07..." inputmode="tel">
    <div class="row2">
      <div>
        <label style="margin-top:0">Date</label>
        <input type="date" id="j_date" value="${j.date||todayISO()}">
      </div>
      <div>
        <label style="margin-top:0">Time <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
        <input type="time" id="j_time" value="${j.time||''}">
      </div>
    </div>
    <label>Price</label>
    <input type="number" id="j_price" value="${j.price!=null?j.price:''}" placeholder="£" min="0" step="0.5">
    <label>Notes</label>
    <textarea id="j_notes" rows="2" placeholder="What's the job...">${escapeHtml(j.notes||'')}</textarea>
    ${propertyFieldsHtml(j, 'j')}
    ${(existing && !existing.paid && existing.paymentReminderSent) ? `<div style="font-size:0.75rem; font-weight:700; margin:10px 2px 0; color:var(--amber);">🔔 Payment reminder sent ${fmtDate(existing.paymentReminderSentDate)}</div>` : ''}
    ${existing?`<div class="row2" style="margin-top:14px;">
      <button class="btn" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="printJobInvoice('${existing.id}')">🧾 Print invoice</button>
      ${isMobileNumber(existing.phone) ? `<button class="btn" style="background:var(--amber-dim); color:var(--amber);" onclick="sendJobReceipt('${existing.id}')">🧾 Send receipt</button>` : ''}
    </div>`:''}
    ${(existing && !existing.paid && isMobileNumber(existing.phone)) ? `<button class="btn" style="background:var(--amber-dim); color:var(--amber); width:100%; margin-top:10px;" onclick="sendJobPaymentReminder('${existing.id}')">💬 Payment reminder</button>` : ''}
    ${(existing && existing.messageLog && existing.messageLog.length) ? `<button class="backup-btn" style="margin-top:10px;" onclick="openMessageLog('job','${existing.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div style="flex:1; min-width:0;"><div class="t1">Messages</div><div class="t2">${existing.messageLog.length} sent</div></div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted);"><path d="M9 18l6-6-6-6"/></svg>
    </button>` : ''}
    ${(existing && (existing.phone||existing.email||existing.address)) ? `<button class="backup-btn" style="margin-top:10px; margin-bottom:0;" onclick="addToContacts('job','${existing.id}')">
      ${ADD_CONTACT_ICON}
      <div style="flex:1; min-width:0;"><div class="t1">Add to Contacts</div><div class="t2">Saves them to your phone's Contacts app</div></div>
    </button>` : ''}
    <label style="display:flex; align-items:center; gap:8px; margin-top:16px; cursor:pointer;">
      <input type="checkbox" id="j_remind" ${j.remind24h?'checked':''} style="width:18px; height:18px; flex-shrink:0;">
      <span style="font-size:0.8125rem; font-weight:600; color:var(--ink); text-transform:none; letter-spacing:0;">Remind me the day before this job</span>
    </label>
    <label style="display:flex; align-items:center; gap:8px; margin-top:10px; cursor:pointer;">
      <input type="checkbox" id="j_anniversary" ${j.anniversaryReminder===false?'':'checked'} style="width:18px; height:18px; flex-shrink:0;">
      <span style="font-size:0.8125rem; font-weight:600; color:var(--ink); text-transform:none; letter-spacing:0;">Flag the anniversary of this job (once it's marked done)</span>
    </label>
    <div class="form-actions">
      <button class="btn-primary" onclick="saveJobForm('${existing?existing.id:''}')">${existing?'Save changes':'Add job'}</button>
    </div>
    ${existing?`<button class="btn-danger-text" onclick="deleteJob('${existing.id}')">Delete job</button>`:''}
    ${existing?`
      <div class="section-label">Repeat work</div>
      <button class="btn" style="width:100%; background:var(--blue-dim); color:var(--blue-deep); margin-bottom:8px;" onclick="convertJobToQuote('${existing.id}')">💬 Turn into a quote for repeat work</button>
    `:''}
    ${existing?`
      <div class="section-label">Photos</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        ${(j.photos||[]).map(p=>`<img src="${photoUrlCache.get(p.id) || p.dataUrl || ''}" onclick="viewJobPhoto('${existing.id}','${p.id}')" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`).join('')}
        <button onclick="document.getElementById('jobPhotoInput_${existing.id}').click()" style="width:72px; height:72px; border-radius:10px; border:2px dashed var(--line); background:none; color:var(--ink-muted); font-size:1.625rem; display:flex; align-items:center; justify-content:center;">+</button>
        <input type="file" accept="image/*" id="jobPhotoInput_${existing.id}" style="display:none;" onchange="handleJobPhotoSelected('${existing.id}', this)">
      </div>
    `:`<div class="section-label">Photos</div><p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 8px;">Save this job first, then reopen it to add photos.</p>`}
  `, returnTo);
}

function viewJobPhoto(id, photoId, ctx){
  if(ctx && ctx.indexOf('customer:') === 0){
    const customerId = ctx.slice('customer:'.length);
    const list = buildCustomerPhotoList(customerId);
    const index = list.findIndex(e => e.kind==='job' && e.ownerId===id && e.photoId===photoId);
    if(index === -1) return;
    openPhotoViewerAt(list, index, () => openCustomerDetail(customerId));
  } else {
    const list = buildJobPhotoList(id);
    const index = list.findIndex(e => e.photoId===photoId);
    if(index === -1) return;
    openPhotoViewerAt(list, index, () => openJobForm(data.oneOffJobs.find(x=>x.id===id)));
  }
}

async function handleJobPhotoSelected(id, inputEl){
  const file = inputEl.files[0];
  if(!file) return;
  toast('Adding photo…');
  try{
    // 1600px/0.85 quality — photos live in IndexedDB (see PHOTO_STORE), which uses
    // the phone's actual available storage rather than a tight fixed pool, so
    // there's no need to compress aggressively.
    const blob = await compressImage(file, 1600, 0.85);
    const photoId = uid();
    const j = data.oneOffJobs.find(x=>x.id===id);
    j.photos = j.photos || [];
    if(photoStorageAvailable){
      await idbSavePhoto(photoId, blob);
      cachePhotoBlob(photoId, blob);
      j.photos.push({id: photoId, date: todayISO()});
    } else {
      const dataUrl = await blobToDataURL(blob);
      j.photos.push({id: photoId, dataUrl, date: todayISO()});
    }
    if(await saveData()){
      openJobForm(j);
      toast('Photo added');
    }
  }catch(e){
    toast('Could not add that photo — try again');
  }
  inputEl.value = '';
}

async function shareJobPhoto(id, photoId){
  const j = data.oneOffJobs.find(x=>x.id===id);
  const p = (j.photos||[]).find(x=>x.id===photoId);
  if(!p) return;
  try{
    const blob = photoStorageAvailable ? await idbGetPhoto(photoId) : await (await fetch(p.dataUrl)).blob();
    if(!blob) throw new Error('photo not found');
    const safeName = (j.address || j.name || 'photo').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const file = new File([blob], `${safeName}-${p.date}.jpg`, { type: blob.type || 'image/jpeg' });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: 'Round Book photo', text: j.address || j.name || '' });
    } else {
      toast('Sharing not supported here — press and hold the photo instead');
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;
    toast('Could not share that photo — press and hold it instead');
  }
}

function saveJobForm(id){
  const address = document.getElementById('j_address').value.trim();
  const name = document.getElementById('j_name').value.trim();
  if(!address && !name){ toast('Please enter at least an address or a name'); return; }
  const customerIdField = document.getElementById('j_customerId');
  const fromQuoteField = document.getElementById('j_fromQuoteId');
  const payload = {
    address, name,
    phone: document.getElementById('j_phone').value.trim(),
    date: document.getElementById('j_date').value || todayISO(),
    time: document.getElementById('j_time').value || '',
    price: parseFloat(document.getElementById('j_price').value) || 0,
    notes: document.getElementById('j_notes').value.trim(),
    remind24h: document.getElementById('j_remind').checked,
    anniversaryReminder: document.getElementById('j_anniversary').checked,
    customerId: (customerIdField && customerIdField.value) ? customerIdField.value : null,
    ...readPropertyPayload('j')
  };
  if(id){
    const j = data.oneOffJobs.find(x=>x.id===id);
    Object.assign(j, payload);
    toast('Job updated');
  } else {
    const newJob = Object.assign({id: uid(), done:false, paid:false}, payload);
    data.oneOffJobs.push(newJob);
    if(fromQuoteField && fromQuoteField.value){
      const q = data.quotes.find(x=>x.id===fromQuoteField.value);
      if(q){ q.status = 'converted'; q.convertedToJobId = newJob.id; }
    }
    toast('Job added');
  }
  saveData(); closeSheet(); render();
}

function deleteJob(id){
  const idx = data.oneOffJobs.findIndex(x=>x.id===id);
  if(idx===-1) return;
  const removed = data.oneOffJobs[idx];
  if(!confirm(`Delete the job at ${removed.address||removed.name||'this address'}?`)) return;
  data.oneOffJobs.splice(idx,1);
  saveData(); closeSheet(); render();
  recordLastAction('job', removed, idx, `job at ${removed.address||removed.name||'this address'}`);
  toast(`Deleted job at ${removed.address||removed.name||'job'}`);
}

/* ---------- quotes ---------- */
function renderQuotes(main){
  let html = '';
  html += `<div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom:8px;">
    ${mainScreenHelpBtn('quotes', "()=>setTab('quotes')")}
    <button class="btn-open" style="width:38px; height:38px; padding:0;" onclick="printQuotes()" aria-label="Print report">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
    </button>
  </div>`;
  const todayForSort = todayISO();
  const quotes = (data.quotes || [])
    .slice()
    .sort((a,b)=>{
      const rank = q => q.status!=='pending' ? 2 : (quoteNeedsFollowUp(q, todayForSort) ? 0 : 1);
      const ra = rank(a), rb = rank(b);
      if(ra !== rb) return ra - rb;
      if(ra <= 1) return (a.date||'').localeCompare(b.date||'');
      return (b.date||'').localeCompare(a.date||'');
    });
  if(!quotes.length){
    html += `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      <b>No quotes yet</b>
      <p>Tap the blue + button to note down a quote — you can turn it into a customer or a one-off job later.</p>
    </div>`;
    main.innerHTML = html;
    return;
  }
  html += `<div class="section-label">${quotes.length} quote${quotes.length===1?'':'s'}</div>`;
  html += quotes.map(quoteCardHtml).join('');
  const quotesTotal = quotes.reduce((sum,q)=>sum+Number(q.price||0),0);
  html += listTotalHtml(`${quotes.length} quote${quotes.length===1?'':'s'} · ${money(quotesTotal)}`);
  main.innerHTML = html;
}

function quoteStatusBadge(q){
  if(q.status === 'accepted') return `<span class="badge ok">Accepted</span>`;
  if(q.status === 'declined') return `<span class="badge overdue">Declined</span>`;
  if(q.status === 'converted') return `<span class="badge ok">✅ Converted</span>`;
  return `<span class="badge due">Pending</span>`;
}

function quoteCardHtml(q){
  const today = todayISO();
  const needsFollowUp = quoteNeedsFollowUp(q, today);
  return `<div class="swipe-wrap">
    <div class="swipe-bg swipe-bg-left">✓ Accept</div>
    <div class="swipe-bg swipe-bg-right">✕ Decline</div>
    <div class="cust-card" data-id="${q.id}" data-kind="quote">
      <div class="cust-top" onclick="openQuoteForm(data.quotes.find(x=>x.id==='${q.id}'))">
        <div>
          <div class="cust-addr" style="font-size:1rem; font-weight:800; color:var(--ink);">${escapeHtml(q.address||'No address')}</div>
          ${(q.name||q.phone) ? `<div class="cust-name" style="font-size:0.8125rem; font-weight:600; color:var(--ink-muted); margin-top:2px;">${[escapeHtml(q.name||''), q.phone?escapeHtml(q.phone):''].filter(Boolean).join(' · ')}</div>` : ''}
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${fmtDate(q.date)}</div>
        </div>
        <div class="cust-price">${money(q.price)}</div>
      </div>
      <div class="cust-meta">
        ${quoteStatusBadge(q)}
        ${q.fromJobId ? `<span class="badge anniversary">🔁 Repeat work</span>` : ''}
        ${needsFollowUp ? `<span class="badge overdue">⏰ Follow up — ${daysBetween(q.date, today)}d since quoted</span>` : ''}
      </div>
    </div>
  </div>`;
}

function markQuoteAccepted(id){
  const q = data.quotes.find(x=>x.id===id);
  if(!q) return;
  q.status = 'accepted';
  saveData(); render();
  toast('Quote marked accepted');
}
function markQuoteDeclined(id){
  const q = data.quotes.find(x=>x.id===id);
  if(!q) return;
  q.status = 'declined';
  saveData(); render();
  toast('Quote marked declined');
}

function openQuoteForm(existing, prefill, returnTo){
  const q = existing || prefill || {};
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${existing?'Edit quote':'Add quote'}</h2>
      ${helpIconBtn('quotes', () => openQuoteForm(existing, prefill, returnTo))}
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <input type="hidden" id="q_fromJobId" value="${escapeAttr((prefill&&prefill.fromJobId)||'')}">
    <input type="hidden" id="q_marketingCustomerId" value="${escapeAttr((existing&&existing.marketingCustomerId)||(prefill&&prefill.marketingCustomerId)||'')}">
    ${prefill&&prefill.fromJobId?`<p style="color:var(--green); font-size:0.75rem; font-weight:700; margin:0 2px 14px;">✅ New quote for repeat work — prefilled from a past job</p>`:''}
    <label style="margin-top:0">Address</label>
    <input type="text" id="q_address" value="${escapeAttr(q.address||'')}" placeholder="e.g. 5 Oak Close">
    <label>Name <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <input type="text" id="q_name" value="${escapeAttr(q.name||'')}" placeholder="e.g. Mr Ahmed">
    <div class="row2">
      <div>
        <label>Phone (optional)</label>
        <input type="text" id="q_phone" value="${escapeAttr(q.phone||'')}" placeholder="07..." inputmode="tel">
      </div>
      <div>
        <label>Email (optional)</label>
        <input type="text" id="q_email" value="${escapeAttr(q.email||'')}" placeholder="name@email.com" inputmode="email">
      </div>
    </div>
    <label>Date</label>
    <input type="date" id="q_date" value="${q.date||todayISO()}">
    <label>Quoted price</label>
    <input type="number" id="q_price" value="${q.price!=null?q.price:''}" placeholder="£" min="0" step="0.5">
    <label>Follow up after <span style="text-transform:none; font-weight:500; opacity:0.7;">(days, if still pending)</span></label>
    <input type="number" id="q_followup" value="${q.followUpDays!=null?q.followUpDays:7}" min="0" step="1">
    <label>Notes</label>
    <textarea id="q_notes" rows="2" placeholder="Access notes, size of job...">${escapeHtml(q.notes||'')}</textarea>
    ${propertyFieldsHtml(q, 'q')}
    <label style="margin-top:0;">Status</label>
    <div class="seg-row">
      <button class="seg-btn ${(!q.status||q.status==='pending')?'active':''}" onclick="setQuoteStatusField('pending', this)">Pending</button>
      <button class="seg-btn ${q.status==='accepted'?'active':''}" onclick="setQuoteStatusField('accepted', this)">Accepted</button>
      <button class="seg-btn ${q.status==='declined'?'active':''}" onclick="setQuoteStatusField('declined', this)">Declined</button>
    </div>
    <input type="hidden" id="q_status" value="${q.status||'pending'}">
    ${existing && (isMobileNumber(existing.phone) || existing.email) ? `<button class="btn" style="width:100%; background:var(--amber-dim); color:var(--amber); margin-top:14px;" onclick="sendQuoteText('${existing.id}')">💬 ${isMobileNumber(existing.phone)?'Send quote by text':'Send quote by email'}${existing.fromJobId?' (repeat work)':''}</button>` : ''}
    <div class="form-actions">
      <button class="btn-primary" onclick="saveQuoteForm('${existing?existing.id:''}')">${existing?'Save changes':'Add quote'}</button>
    </div>
    ${existing?`<button class="btn-danger-text" onclick="deleteQuote('${existing.id}')">Delete quote</button>`:''}
    ${existing && existing.status!=='converted' ? `
      <div class="section-label">Convert this quote</div>
      <button class="btn" style="width:100%; background:var(--blue-dim); color:var(--blue-deep); margin-bottom:8px;" onclick="openConvertQuoteToCustomer('${existing.id}')">👤 Convert to a customer in a round</button>
      <button class="btn" style="width:100%; background:var(--green-dim); color:var(--green); margin-bottom:8px;" onclick="convertQuoteToJob('${existing.id}')">📋 Convert to a one-off job</button>
    ` : ''}
    ${existing && existing.status==='converted' ? `<p style="color:var(--ink-muted); font-size:0.75rem; margin:14px 2px 0;">✅ This quote has already been converted.</p>` : ''}
  `, returnTo);
}
function setQuoteStatusField(status, btn){
  const el = document.getElementById('q_status');
  if(el) el.value = status;
  if(btn && btn.parentElement){
    btn.parentElement.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  }
}

function saveQuoteForm(id){
  const address = document.getElementById('q_address').value.trim();
  const name = document.getElementById('q_name').value.trim();
  if(!address && !name){ toast('Please enter at least an address or a name'); return; }
  const fromJobField = document.getElementById('q_fromJobId');
  const marketingCustomerField = document.getElementById('q_marketingCustomerId');
  const payload = {
    address, name,
    phone: document.getElementById('q_phone').value.trim(),
    email: document.getElementById('q_email').value.trim(),
    date: document.getElementById('q_date').value || todayISO(),
    price: parseFloat(document.getElementById('q_price').value) || 0,
    followUpDays: (()=>{ const v = parseInt(document.getElementById('q_followup').value,10); return Number.isFinite(v) && v>=0 ? v : 7; })(),
    notes: document.getElementById('q_notes').value.trim(),
    status: document.getElementById('q_status').value || 'pending',
    ...readPropertyPayload('q')
  };
  if(id){
    const q = data.quotes.find(x=>x.id===id);
    Object.assign(q, payload);
    toast('Quote updated');
    saveData(); closeSheet(); render();
  } else {
    if(fromJobField && fromJobField.value) payload.fromJobId = fromJobField.value;
    if(marketingCustomerField && marketingCustomerField.value) payload.marketingCustomerId = marketingCustomerField.value;
    const newQuote = Object.assign({id: uid()}, payload);
    data.quotes.push(newQuote);
    // If this quote was started from a marketing response card's "Quote" button,
    // creating it counts as having done that pending action — reflect that on the card.
    if(newQuote.marketingCustomerId){
      const mktC = data.customers.find(x=>x.id===newQuote.marketingCustomerId);
      if(mktC && mktC.marketingNextAction === 'quote') mktC.marketingActionDone = true;
    }
    toast('Quote added');
    // Stay on the quote screen (now in edit mode) so the quote can be sent by text/email right away.
    // sheetOnClose still holds whatever returnTo was passed to the original openQuoteForm() call,
    // since we deliberately don't call closeSheet() in this branch.
    const returnTo = sheetOnClose;
    saveData(); render();
    openQuoteForm(newQuote, null, returnTo);
  }
}

function deleteQuote(id){
  const idx = data.quotes.findIndex(x=>x.id===id);
  if(idx===-1) return;
  const removed = data.quotes[idx];
  if(!confirm(`Delete the quote for ${removed.address||removed.name||'this customer'}?`)) return;
  data.quotes.splice(idx,1);
  saveData(); closeSheet(); render();
  recordLastAction('quote', removed, idx, `quote for ${removed.address||removed.name||'this customer'}`);
  toast(`Deleted quote for ${removed.address||removed.name||'quote'}`);
}

function convertQuoteToJob(quoteId){
  const q = data.quotes.find(x=>x.id===quoteId);
  if(!q) return;
  // If the quote's address matches an existing customer, link the new job to
  // them automatically so it shows up in that customer's history — same
  // matching (trimmed, case-insensitive) as the duplicate-address check when
  // adding a customer.
  const normalized = (q.address||'').trim().toLowerCase();
  const matchedCustomer = normalized ? data.customers.find(x => (x.address||'').trim().toLowerCase() === normalized) : null;
  openJobForm(null, Object.assign({
    address:q.address||'', name:q.name||'', phone:q.phone||'', price:q.price||0, fromQuoteId:q.id,
    customerId: matchedCustomer ? matchedCustomer.id : null
  }, propertyDetailsOf(q)));
}

function convertJobToQuote(jobId){
  const j = data.oneOffJobs.find(x=>x.id===jobId);
  if(!j) return;
  openQuoteForm(null, Object.assign({ address:j.address||'', name:j.name||'', phone:j.phone||'', price:j.price||0, notes:j.notes||'', fromJobId:j.id }, propertyDetailsOf(j)));
}

function openConvertQuoteToCustomer(quoteId){
  const q = data.quotes.find(x=>x.id===quoteId);
  if(!q) return;
  const roundOptions = [...new Set(data.customers.map(c=>c.round).filter(Boolean))];
  openSheet(`
    <div class="sheet-head">
      <h2>Convert to customer</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px; line-height:1.5;">Creates a new recurring customer from this quote. Pick a round and how often they'll be cleaned.</p>
    <label style="margin-top:0">Round</label>
    <input type="text" id="cq_round" placeholder="e.g. Tuesday Round" list="cqRoundOptions">
    <datalist id="cqRoundOptions">${roundOptions.map(r=>`<option value="${escapeAttr(r)}">`).join('')}</datalist>
    <div class="row2">
      <div>
        <label>Price per clean</label>
        <input type="number" id="cq_price" value="${q.price!=null?q.price:''}" min="0" step="0.5">
      </div>
      <div>
        <label>Clean every (weeks)</label>
        <input type="number" id="cq_freq" value="4" min="1">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn-primary" onclick="confirmConvertQuoteToCustomer('${quoteId}')">Create customer</button>
    </div>
  `, () => openQuoteForm(data.quotes.find(x=>x.id===quoteId)));
}
function confirmConvertQuoteToCustomer(quoteId){
  const q = data.quotes.find(x=>x.id===quoteId);
  if(!q) return;
  const round = document.getElementById('cq_round').value.trim() || 'Unassigned';
  const price = parseFloat(document.getElementById('cq_price').value) || 0;
  const frequencyWeeks = parseInt(document.getElementById('cq_freq').value) || 4;

  const roundCusts = data.customers.filter(x=>(x.round||'Unassigned')===round);
  const maxOrder = roundCusts.reduce((m,x)=>Math.max(m, x.order!=null?x.order:-1), -1);
  const newCustomer = {
    id: uid(),
    address: q.address||'', name: q.name||'', phone: q.phone||'', email: q.email||'',
    round, price, frequencyWeeks, notes: q.notes||'',
    cleanHistory: [], paymentHistory: [],
    priceHistory: [{date: todayISO(), price}],
    order: maxOrder + 1,
    photos: [], paused: false, pauseReason: '', pauseDate: '', textBeforeVisit: false,
    ...propertyDetailsOf(q)
  };
  data.customers.push(newCustomer);
  q.status = 'converted';
  q.convertedToCustomerId = newCustomer.id;
  saveData(); closeSheet(); render();
  toast('Customer created from quote');
}

