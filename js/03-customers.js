/* 03-customers.js -- Sheet infrastructure, property details (type/add-ons/fronts-only), and the customer add/edit form and detail screen.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- sheets ---------- */
let sheetOnClose = null;
// Lets a sheet intercept an attempt to close it — set to a function that returns
// true once it's safe to actually close, or false if it's decided to handle the
// close itself (e.g. after showing its own confirm dialog) and closeSheet()
// shouldn't proceed on this call. null (the default) means no interception at
// all, which is what almost every sheet wants. See openCustomerForm for the one
// current use — warning about unsaved changes — which works no matter how the
// sheet is being closed (✕ button, tapping outside it, or anything else), since
// every close path funnels through here.
let sheetCloseGuard = null;
// onClose lets a sheet redirect back to another screen (e.g. a customer's history
// list returning to that customer's detail screen) no matter how it's dismissed —
// the ✕ button, tapping outside the sheet, or any other close path all funnel
// through closeSheet(), so this only needs to be handled in one place.
function openSheet(html, onClose){
  sheetOnClose = onClose || null;
  sheetCloseGuard = null; // each new sheet starts unguarded; set one after opening if needed
  document.getElementById('sheet').innerHTML = `<div class="sheet-handle"></div>` + html;
  document.getElementById('overlay').classList.add('show');
}
function closeSheet(){
  if(sheetCloseGuard && !sheetCloseGuard()) return;
  sheetCloseGuard = null;
  document.getElementById('overlay').classList.remove('show');
  if(sheetOnClose){
    const cb = sheetOnClose;
    sheetOnClose = null;
    cb();
  }
}

/* ---------- property details (type / add-ons / fronts only) ----------
   Shared by the customer, one-off job, and quote forms so a property's
   details can be recorded wherever it's first captured and carried
   through when a quote becomes a job or a customer, etc. */
const PROPERTY_TYPES = ['Detached','Semi-detached','Terraced','Bungalow','Flat','Business'];
function propertyFieldsHtml(obj, prefix){
  obj = obj || {};
  return `
    <label>Property type <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <select id="${prefix}_propertyType">
      <option value="">— Not set —</option>
      ${PROPERTY_TYPES.map(t=>`<option value="${escapeAttr(t)}" ${obj.propertyType===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <label style="display:flex; align-items:center; gap:8px; margin-top:10px; text-transform:none; font-weight:600; cursor:pointer;">
      <input type="checkbox" id="${prefix}_frontsOnly" ${obj.frontsOnly?'checked':''} style="width:18px; height:18px; margin:0;">
      Fronts only
    </label>
    <label style="margin-top:12px;">Add-ons <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <div style="display:flex; flex-wrap:wrap; gap:8px 16px; margin:2px 2px 8px;">
      <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; margin:0; cursor:pointer;">
        <input type="checkbox" id="${prefix}_addOnConservatory" ${obj.addOnConservatory?'checked':''} style="width:17px; height:17px; margin:0;"> Conservatory
      </label>
      <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; margin:0; cursor:pointer;">
        <input type="checkbox" id="${prefix}_addOnExtension" ${obj.addOnExtension?'checked':''} style="width:17px; height:17px; margin:0;"> Extension
      </label>
      <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; margin:0; cursor:pointer;">
        <input type="checkbox" id="${prefix}_addOnGarageDoor" ${obj.addOnGarageDoor?'checked':''} style="width:17px; height:17px; margin:0;"> Garage door
      </label>
    </div>
    <input type="text" id="${prefix}_addOnOther" value="${escapeAttr(obj.addOnOther||'')}" placeholder="Other add-ons, e.g. summer house (optional)">
  `;
}
// Reads the property fields for a given form-field prefix — used both for
// saving (payload) and for change-detection snapshots (customer form).
function readPropertyPayload(prefix){
  const el = (elId) => document.getElementById(prefix+elId);
  const typeEl = el('_propertyType'), frontsEl = el('_frontsOnly'),
        consEl = el('_addOnConservatory'), extEl = el('_addOnExtension'),
        garageEl = el('_addOnGarageDoor'), otherEl = el('_addOnOther');
  return {
    propertyType: typeEl ? typeEl.value : '',
    frontsOnly: frontsEl ? frontsEl.checked : false,
    addOnConservatory: consEl ? consEl.checked : false,
    addOnExtension: extEl ? extEl.checked : false,
    addOnGarageDoor: garageEl ? garageEl.checked : false,
    addOnOther: otherEl ? otherEl.value.trim() : ''
  };
}
// Short human-readable summary, e.g. "Semi-detached · Conservatory, Garage door · Fronts only"
function propertySummaryText(obj){
  if(!obj) return '';
  const parts = [];
  if(obj.propertyType) parts.push(obj.propertyType);
  const addOns = [];
  if(obj.addOnConservatory) addOns.push('Conservatory');
  if(obj.addOnExtension) addOns.push('Extension');
  if(obj.addOnGarageDoor) addOns.push('Garage door');
  if(obj.addOnOther) addOns.push(obj.addOnOther);
  if(addOns.length) parts.push(addOns.join(', '));
  if(obj.frontsOnly) parts.push('Fronts only');
  return parts.join(' · ');
}
// Picks out just the property-detail keys from a source object — used to carry
// these details across when a quote becomes a job or a customer, etc.
function propertyDetailsOf(obj){
  if(!obj) return {};
  return {
    propertyType: obj.propertyType||'',
    frontsOnly: !!obj.frontsOnly,
    addOnConservatory: !!obj.addOnConservatory,
    addOnExtension: !!obj.addOnExtension,
    addOnGarageDoor: !!obj.addOnGarageDoor,
    addOnOther: obj.addOnOther||''
  };
}

function openCustomerForm(existing){
  const c = existing || {};
  const rounds = [...new Set(data.customers.map(x=>x.round).filter(Boolean))];
  openSheet(`
    <div class="sheet-head">
      <h2>${existing?'Edit customer':'Add customer'}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; margin:0 2px 6px;">
      <label style="margin:0;">Address</label>
      <button type="button" onclick="useCurrentLocation()" style="background:none; border:none; color:var(--blue); font-size:0.7812rem; font-weight:700; padding:2px;">📍 Use my location</button>
    </div>
    <input type="text" id="f_address" value="${escapeAttr(c.address||'')}" placeholder="e.g. 12 Elm Grove">
    <label>Name <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <input type="text" id="f_name" value="${escapeAttr(c.name||'')}" placeholder="e.g. Mrs Patterson">
    <div class="row2">
      <div>
        <label>Telephone (optional)</label>
        <input type="text" id="f_phone" value="${escapeAttr(c.phone||'')}" placeholder="07..." inputmode="tel">
      </div>
      <div>
        <label>Email (optional)</label>
        <input type="text" id="f_email" value="${escapeAttr(c.email||'')}" placeholder="name@email.com" inputmode="email">
      </div>
    </div>
    <label>Round</label>
    <input type="text" id="f_round" value="${escapeAttr(c.round||'')}" placeholder="e.g. Tuesday Round" list="roundOptions">
    <datalist id="roundOptions">${rounds.map(r=>`<option value="${escapeAttr(r)}">`).join('')}</datalist>
    <div class="row2">
      <div>
        <label>Price per clean</label>
        <input type="number" id="f_price" value="${c.price!=null?c.price:''}" placeholder="£" min="0" step="0.5">
      </div>
      <div>
        <label>Clean every (weeks)</label>
        <input type="number" id="f_freq" value="${c.frequencyWeeks||4}" min="1">
      </div>
    </div>
    <label>Notes</label>
    <textarea id="f_notes" rows="2" placeholder="Gate code, dog, access notes...">${escapeHtml(c.notes||'')}</textarea>
    ${propertyFieldsHtml(c, 'f')}
    <label>Referred by <span style="text-transform:none; font-weight:500; opacity:0.7;">(optional)</span></label>
    <input type="text" id="f_referredBy" value="${escapeAttr(c.referredBy||'')}" placeholder="e.g. Mrs Patterson, 12 Elm Grove">
    <label>Account number <span style="text-transform:none; font-weight:500; opacity:0.7;">(shown on invoices/receipts)</span></label>
    <input type="text" id="f_accountNumber" value="${escapeAttr(c.accountNumber || (existing ? '' : String(data.settings.nextAccountNumber)))}" placeholder="e.g. 1001">
    <label style="display:flex; align-items:center; gap:8px; margin:10px 2px 0; text-transform:none; font-weight:600;">
      <input type="checkbox" id="f_textBefore" ${c.textBeforeVisit?'checked':''} style="width:18px; height:18px; margin:0;">
      Text before I arrive
    </label>
    <label style="display:flex; align-items:center; gap:8px; margin:10px 2px 0; text-transform:none; font-weight:600;">
      <input type="checkbox" id="f_marketingOptOut" ${c.marketingOptOut?'checked':''} style="width:18px; height:18px; margin:0;">
      Don't send marketing texts to this customer
    </label>
    <div class="form-actions">
      <button class="btn-primary" onclick="saveCustomerForm('${existing?existing.id:''}')">${existing?'Save changes':'Add customer'}</button>
    </div>
    ${existing?`<button class="btn-danger-text" onclick="deleteCustomer('${existing.id}')">Delete customer</button>`:''}
  `, existing ? (() => openCustomerDetail(existing.id)) : null);
  customerFormSnapshot = JSON.stringify(readCustomerFormFields());
  sheetCloseGuard = () => confirmCustomerFormClose(existing ? existing.id : '');
}
// Plain field values, read fresh — used only to detect whether the form's been
// edited since it opened (see openCustomerForm/confirmCustomerFormClose).
// saveCustomerForm does its own separate reading with its own parsing/validation,
// left untouched to avoid risking its already-working behaviour.
function readCustomerFormFields(){
  return {
    name: document.getElementById('f_name').value.trim(),
    address: document.getElementById('f_address').value.trim(),
    phone: document.getElementById('f_phone').value.trim(),
    email: document.getElementById('f_email').value.trim(),
    round: document.getElementById('f_round').value.trim(),
    price: document.getElementById('f_price').value,
    frequencyWeeks: document.getElementById('f_freq').value,
    notes: document.getElementById('f_notes').value.trim(),
    referredBy: document.getElementById('f_referredBy').value.trim(),
    textBeforeVisit: document.getElementById('f_textBefore').checked,
    marketingOptOut: document.getElementById('f_marketingOptOut').checked,
    accountNumber: document.getElementById('f_accountNumber').value.trim(),
    property: readPropertyPayload('f')
  };
}
let customerFormSnapshot = null;
// The sheetCloseGuard for the customer form (see openSheet/closeSheet) — returns
// true to let the close go ahead untouched, or handles things itself (showing a
// prompt to save, then either saving-and-closing or discarding-and-closing) and
// returns false so closeSheet() doesn't also try to close on the same call.
function confirmCustomerFormClose(id){
  // Defensive: if this guard is ever left set while some other sheet is showing
  // (shouldn't happen, but the consequence of it happening was exactly this bug),
  // the form's own fields won't be present — treat that as nothing to guard
  // rather than throwing and leaving the ✕ button looking dead.
  if(!document.getElementById('f_name')) return true;
  const current = JSON.stringify(readCustomerFormFields());
  if(current === customerFormSnapshot) return true;
  sheetCloseGuard = null; // avoid re-triggering this guard when a choice below calls closeSheet() itself
  showUnsavedChangesPrompt(id);
  return false;
}
// A small prompt laid over the still-open form — NOT window.confirm(), which is
// unreliable inside an iOS home-screen PWA (there's no Safari chrome for the
// native dialog to anchor to, so it can silently fail to appear at all). Laying
// this over the existing sheet rather than replacing it also means the form's
// own fields are untouched underneath if the person picks "Keep editing", and
// Save can still read straight from those same fields exactly as saveCustomerForm
// normally would.
function showUnsavedChangesPrompt(id){
  removeUnsavedChangesPrompt();
  const el = document.createElement('div');
  el.id = 'unsavedChangesPrompt';
  el.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:flex-end; justify-content:center;';
  el.innerHTML = `
    <div style="position:absolute; inset:0; background:rgba(0,0,0,0.4);" onclick="unsavedChangesPromptKeepEditing('${id}')"></div>
    <div style="position:relative; background:var(--bg); width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:20px; padding-bottom:calc(20px + env(safe-area-inset-bottom)); box-shadow:0 -4px 24px rgba(0,0,0,0.25);">
      <h3 style="margin:0 0 8px; font-size:1.0625rem; font-weight:800; color:var(--ink);">Unsaved changes</h3>
      <p style="color:var(--ink-muted); font-size:0.875rem; margin:0 0 18px; line-height:1.5;">Save your changes before closing?</p>
      <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="unsavedChangesPromptSave('${id}')">Save changes</button>
      <button class="btn" style="width:100%; margin-bottom:10px; background:var(--red-dim); color:var(--red); border:none;" onclick="unsavedChangesPromptDiscard()">Discard changes</button>
      <button class="btn btn-clean" style="width:100%; border:none;" onclick="unsavedChangesPromptKeepEditing('${id}')">Keep editing</button>
    </div>
  `;
  document.body.appendChild(el);
}
function removeUnsavedChangesPrompt(){
  const el = document.getElementById('unsavedChangesPrompt');
  if(el) el.remove();
}
// "Keep editing" (and tapping the dark backdrop, which means the same thing)
// dismisses the prompt but the form's still open with unsaved changes sitting in
// it — the guard needs restoring, or the very next close attempt would silently
// discard with no warning at all, the same bug this feature exists to prevent.
function unsavedChangesPromptKeepEditing(id){
  removeUnsavedChangesPrompt();
  sheetCloseGuard = () => confirmCustomerFormClose(id);
}
function unsavedChangesPromptSave(id){
  removeUnsavedChangesPrompt();
  // reads straight from the still-open form's own fields
  saveCustomerForm(id, (saved) => {
    if(!saved){
      // saveCustomerForm didn't end up saving (e.g. validation failed, or a
      // duplicate-address warning was declined) — restore the guard so unsaved
      // changes are still protected on the next attempt too.
      sheetCloseGuard = () => confirmCustomerFormClose(id);
    }
    // If it did save, saveCustomerForm has already closed this form (and cleared
    // the guard) — whatever sheet is open now, if any, is unrelated and must be
    // left alone. Checking the overlay's visibility here would be wrong: a
    // successful save can itself reopen another sheet (e.g. back to the
    // customer's detail screen), which leaves the overlay showing too and would
    // look identical to a failed save that never closed.
  });
}
function unsavedChangesPromptDiscard(){
  removeUnsavedChangesPrompt();
  closeSheet();
}

// Calls afterAttempt(true) if the customer was actually saved (and the form
// closed), or afterAttempt(false) if it stopped short of saving (missing
// name/address, or a declined duplicate-address warning) — see
// unsavedChangesPromptSave, the one caller that needs to tell the difference.
// Async because the duplicate-address warning now goes through the app's own
// confirm dialog rather than a synchronous native confirm().
function saveCustomerForm(id, afterAttempt){
  const name = document.getElementById('f_name').value.trim();
  const address = document.getElementById('f_address').value.trim();
  if(!name && !address){ toast('Please enter at least a name or an address'); if(afterAttempt) afterAttempt(false); return; }
  const proceedSave = () => finishSavingCustomerForm(id, afterAttempt);
  if(address){
    const normalized = address.toLowerCase();
    const dupe = data.customers.find(x=> x.id!==id && (x.address||'').trim().toLowerCase()===normalized);
    if(dupe){
      appConfirm(`This address is already saved for ${dupe.name || 'another customer'} (${dupe.round||'Unassigned'} round). Add it again anyway?`, {
        title: 'Duplicate address', confirmLabel: 'Add anyway', danger: false,
        onConfirm: proceedSave,
        onCancel: () => { if(afterAttempt) afterAttempt(false); }
      });
      return;
    }
  }
  proceedSave();
}
function finishSavingCustomerForm(id, afterAttempt){
  const payload = {
    name: document.getElementById('f_name').value.trim(),
    address: document.getElementById('f_address').value.trim(),
    phone: document.getElementById('f_phone').value.trim(),
    email: document.getElementById('f_email').value.trim(),
    round: document.getElementById('f_round').value.trim() || 'Unassigned',
    price: parseFloat(document.getElementById('f_price').value) || 0,
    frequencyWeeks: parseInt(document.getElementById('f_freq').value) || 4,
    notes: document.getElementById('f_notes').value.trim(),
    referredBy: document.getElementById('f_referredBy').value.trim(),
    textBeforeVisit: document.getElementById('f_textBefore').checked,
    marketingOptOut: document.getElementById('f_marketingOptOut').checked,
    ...readPropertyPayload('f')
  };
  const accountNumberEntered = document.getElementById('f_accountNumber').value.trim();
  const dupeAccount = accountNumberEntered && data.customers.find(x=>x.id!==id && x.accountNumber===accountNumberEntered);
  if(id){
    const c = data.customers.find(x=>x.id===id);
    const oldPrice = c.price;
    const oldRound = c.round || 'Unassigned';
    Object.assign(c, payload);
    if(accountNumberEntered) c.accountNumber = accountNumberEntered;
    if(oldPrice !== payload.price){
      c.priceHistory = c.priceHistory || [];
      c.priceHistory.push({date: todayISO(), price: payload.price});
    }
    if(oldRound !== (payload.round || 'Unassigned')){
      const roundCusts = data.customers.filter(x=>x.id!==id && (x.round||'Unassigned')===(payload.round||'Unassigned'));
      const maxOrder = roundCusts.reduce((m,x)=>Math.max(m, x.order!=null?x.order:-1), -1);
      c.order = maxOrder + 1;
    }
    toast('Customer updated');
  } else {
    const roundCusts = data.customers.filter(x=>(x.round||'Unassigned')===(payload.round||'Unassigned'));
    const maxOrder = roundCusts.reduce((m,x)=>Math.max(m, x.order!=null?x.order:-1), -1);
    let accountNumber = accountNumberEntered;
    if(!accountNumber){
      accountNumber = String(data.settings.nextAccountNumber);
      data.settings.nextAccountNumber++;
    } else if(/^\d+$/.test(accountNumber) && parseInt(accountNumber,10) >= data.settings.nextAccountNumber){
      // Keeps the auto-numbering sequence sensible if someone manually enters a
      // higher number than the next one due — future auto-assigned numbers pick
      // up after whatever's actually been used.
      data.settings.nextAccountNumber = parseInt(accountNumber,10) + 1;
    }
    data.customers.push(Object.assign({
      id: uid(), cleanHistory: [], paymentHistory: [],
      priceHistory: [{date: todayISO(), price: payload.price}],
      order: maxOrder + 1, accountNumber
    }, payload));
    toast('Customer added');
  }
  if(dupeAccount){
    // Fires after the "Customer added/updated" toast above (same reasoning as the
    // storage-full warning) so this warning can't be silently overwritten before
    // anyone reads it.
    setTimeout(() => toast(`Note: account number ${accountNumberEntered} is already used by ${dupeAccount.name||dupeAccount.address||'another customer'}`), 1800);
  }
  saveData(); sheetCloseGuard = null; closeSheet(); render();
  if(afterAttempt) afterAttempt(true);
}

function deleteCustomer(id){
  const idx = data.customers.findIndex(x=>x.id===id);
  if(idx===-1) return;
  const removed = data.customers[idx];
  appConfirm(`Delete ${removed.address||removed.name||'this customer'}? This removes all their history too.`, {title:'Delete customer', confirmLabel:'Delete', onConfirm: () => {
    data.customers.splice(idx,1);
    saveData(); closeSheet(); render();
    recordLastAction('customer', removed, idx, removed.address||removed.name||'customer');
    toast(`Deleted ${removed.address||removed.name||'customer'}`);
  }});
}

function openCustomerDetail(id){
  const c = data.customers.find(x=>x.id===id);
  const s = custStatus(c);
  const linkedJobs = (data.oneOffJobs||[]).filter(j=>j.customerId===id);
  const chev = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(c.address || c.name || 'Customer')}</h2>
      <button class="sheet-close" style="flex-shrink:0; margin-right:6px;" onclick="printCustomerRecord('${id}')" aria-label="Print this customer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
      </button>
      ${helpIconBtn('customer', () => openCustomerDetail(id))}
      <button class="sheet-close" style="flex-shrink:0;" onclick="closeSheet()">✕</button>
    </div>
    ${(c.name && c.address) ? `<div style="color:var(--ink); font-size:0.9375rem; font-weight:700; margin-bottom:2px;">${escapeHtml(c.name)}</div>` : ''}
    <div style="color:var(--ink-muted); font-size:0.8125rem; margin-bottom:10px;">${escapeHtml(c.round||'Unassigned')} · ${money(c.price)} standard · every ${c.frequencyWeeks||4} week${(c.frequencyWeeks||4)===1?'':'s'}${c.accountNumber?` · Acct #${escapeHtml(c.accountNumber)}`:''}${c.paused?` · <span style="color:var(--ink-muted); font-weight:700;">Paused${c.pauseReason?' — '+escapeHtml(c.pauseReason):''}${c.pauseDate?' ('+fmtDate(c.pauseDate)+')':''}</span>`:''}</div>
    ${needsPriceReview(c) ? `<div style="color:var(--amber); font-size:0.75rem; font-weight:700; margin:-6px 2px 10px;">📈 12+ months since last price increase</div>` : ''}
    ${c.textBeforeVisit ? `<div style="color:var(--blue-deep); font-size:0.75rem; font-weight:700; margin:-6px 2px 10px;">📱 Text before you arrive</div>` : ''}
    ${c.referredBy ? `<div style="color:var(--ink-muted); font-size:0.75rem; font-weight:700; margin:-6px 2px 10px;">🤝 Referred by ${escapeHtml(c.referredBy)}</div>` : ''}
    ${c.marketingOptOut ? `<div style="color:var(--red); font-size:0.75rem; font-weight:700; margin:-6px 2px 10px;">🚫 Opted out of marketing texts</div>` : ''}
    ${propertySummaryText(c) ? `<div style="color:var(--ink-muted); font-size:0.75rem; font-weight:700; margin:-6px 2px 10px;">🏠 ${escapeHtml(propertySummaryText(c))}</div>` : ''}
    ${c.notes?`<div style="background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:0.8438rem; margin-bottom:14px;">${escapeHtml(c.notes)}</div>`:''}
    ${(c.phone||c.email)?`<div style="display:flex; gap:8px; margin-bottom:14px;">
      ${c.phone?`<a href="tel:${escapeAttr(c.phone.replace(/\\s+/g,''))}" style="flex:1; text-decoration:none; background:var(--blue-dim); color:var(--blue-deep); border-radius:10px; padding:9px; font-size:0.8125rem; font-weight:700; text-align:center;">📞 ${escapeHtml(c.phone)}</a>`:''}
      ${c.email?`<button onclick="emailCustomer('${id}')" style="flex:1; min-width:0; background:var(--bg); color:var(--ink); border:1px solid var(--box-border); border-radius:10px; padding:9px; font-size:0.8125rem; font-weight:700; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">✉️ ${escapeHtml(c.email)}</button>`:''}
      <button onclick="addToContacts('customer','${id}')" title="Add to Contacts" aria-label="Add to Contacts" style="flex:0 0 auto; width:40px; background:var(--bg); color:var(--ink); border:1px solid var(--box-border); border-radius:10px; display:flex; align-items:center; justify-content:center; padding:0;">${ADD_CONTACT_ICON.replace('viewBox="0 0 24 24"','viewBox="0 0 24 24" width="17" height="17"')}</button>
    </div>`:''}

    <div style="background:${s.owed?'var(--red-dim)':s.credit?'var(--green-dim)':'var(--green-dim)'}; color:${s.owed?'var(--red)':'var(--green)'}; border-radius:10px; padding:12px; font-weight:800; text-align:center; margin-bottom:14px;">
      ${s.owed ? `Owes ${money(s.balance)}` : s.credit ? `In credit: ${money(Math.abs(s.balance))} (carries onto next bill)` : 'Fully paid up'}
      ${(s.owed && c.paymentReminderSent) ? `<div style="font-size:0.75rem; font-weight:700; margin-top:4px; opacity:0.85;">🔔 Payment reminder sent ${fmtDate(c.paymentReminderSentDate)}${(c.paymentReminderCount||0) >= 2 ? ` · ⚠ ${c.paymentReminderCount} reminders sent` : ''}</div>` : ''}
    </div>

    <div class="stat-row">
      <div class="stat"><div class="num">${fmtDate(s.lastClean).split(' ').slice(0,2).join(' ')}</div><div class="lbl">Last cleaned</div></div>
      <div class="stat"><div class="num">${fmtDate(s.lastPaid).split(' ').slice(0,2).join(' ')}</div><div class="lbl">Last paid</div></div>
    </div>

    <details class="cust-section">
      <summary>Actions ${chev}</summary>
      <div class="cust-section-body">
        <div class="cust-actions" style="margin-bottom:12px;">
          <button class="btn btn-clean" onclick="quickClean('${id}'); openCustomerDetail('${id}');">Mark cleaned today</button>
          <button class="btn btn-paid" onclick="quickPaid('${id}'); openCustomerDetail('${id}');">Mark paid today</button>
        </div>
        ${isMobileNumber(c.phone)?`<div class="row2" style="margin-bottom:10px;">
          <button class="btn" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="sendTemplate('${id}','clean',()=>openCustomerDetail('${id}'))">💬 Cleaning reminder</button>
          <button class="btn" style="background:var(--amber-dim); color:var(--amber);" onclick="sendTemplate('${id}','pay',()=>openCustomerDetail('${id}'))">💬 Payment reminder</button>
        </div>`:''}
        <div class="row2" style="margin-bottom:10px;">
          <button class="btn btn-clean" onclick="openAddCleanForm('${id}')">+ Add a clean</button>
          <button class="btn btn-paid" onclick="openAddPaymentForm('${id}')">+ Add a payment</button>
        </div>
        ${!c.paused ? (
          (s.cleanBadge && s.cleanBadge.type === 'deferred') ? `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 2px 6px;">
          <span style="font-size:0.75rem; color:var(--ink-muted);">⏭ Deferred to ${fmtDate(c.deferUntil)}</span>
          <button onclick="cancelDefer('${id}')" style="font-size:0.75rem; font-weight:700; color:var(--ink-muted); background:none; border:none; padding:0;">Cancel defer</button>
        </div>
        <div class="row2" style="margin-bottom:10px;">
          <button class="btn" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="deferCustomerDue('${id}')">+4 more weeks</button>
          <button class="btn" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="editDeferDate('${id}')">📅 Set date</button>
        </div>` : `
        <div class="row2" style="margin-bottom:10px;">
          <button class="btn" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="deferCustomerDue('${id}')">⏭ +4 weeks</button>
          <button class="btn" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="editDeferDate('${id}')">📅 Set due date</button>
        </div>`
        ) : ''}
        <button class="btn" style="width:100%; background:var(--green-dim); color:var(--green); margin-bottom:10px;" onclick="openCustomerUpliftSheet('${id}')">📈 Apply price uplift</button>
        <button class="btn" style="width:100%; background:${c.paused?'var(--green-dim)':'var(--line)'}; color:${c.paused?'var(--green)':'var(--ink-muted)'}; margin-bottom:10px;" onclick="${c.paused?`resumeCustomer('${id}')`:`openPauseReasonSheet('${id}')`}">
          ${c.paused ? '▶ Resume this customer' : '⏸ Pause'}
        </button>
        <button class="btn" style="width:100%; background:var(--amber-dim); color:var(--amber); margin-bottom:10px;" onclick="quoteForCustomer('${id}')">
          💷 Get a quote
        </button>
        <button class="btn" style="width:100%; background:var(--blue-dim); color:var(--blue-deep);" onclick="scheduleJobForCustomer('${id}')">
          📋 Schedule a one-off job
        </button>
      </div>
    </details>

    <details class="cust-section">
      <summary>History ${chev}</summary>
      <div class="cust-section-body">
        <button class="backup-btn" onclick="openCustomerHistoryList('${id}','clean')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          <div style="flex:1; min-width:0;"><div class="t1">Clean history</div><div class="t2">${(c.cleanHistory||[]).length} clean${(c.cleanHistory||[]).length===1?'':'s'} logged</div></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted);"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button class="backup-btn" onclick="openCustomerHistoryList('${id}','pay')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <div style="flex:1; min-width:0;"><div class="t1">Payment history</div><div class="t2">${(c.paymentHistory||[]).length} payment${(c.paymentHistory||[]).length===1?'':'s'} logged</div></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted);"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button class="backup-btn" onclick="openCustomerHistoryList('${id}','jobs')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <div style="flex:1; min-width:0;"><div class="t1">One-off jobs</div><div class="t2">${linkedJobs.length} job${linkedJobs.length===1?'':'s'} for this customer</div></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted);"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button class="backup-btn" onclick="openCustomerHistoryList('${id}','price')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 4 4 5-6"/></svg>
          <div style="flex:1; min-width:0;"><div class="t1">Price history</div><div class="t2">${(c.priceHistory||[]).length} change${(c.priceHistory||[]).length===1?'':'s'} recorded</div></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted);"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <button class="backup-btn" style="margin-bottom:0;" onclick="openMessageLog('customer','${id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div style="flex:1; min-width:0;"><div class="t1">Messages</div><div class="t2">${(c.messageLog||[]).length} sent</div></div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px; color:var(--ink-muted);"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </details>

    <details class="cust-section"${((c.photos&&c.photos.length) || linkedJobs.some(j=>j.photos&&j.photos.length))?' open':''}>
      <summary>Photos${(() => { const total = (c.photos||[]).length + linkedJobs.reduce((sum,j)=>sum+(j.photos||[]).length,0); return total ? ` (${total})` : ''; })()} ${chev}</summary>
      <div class="cust-section-body">
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${(c.photos||[]).map(p=>`<img src="${photoUrlCache.get(p.id) || p.dataUrl || ''}" onclick="viewPhoto('${id}','${p.id}')" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`).join('')}
          ${linkedJobs.flatMap(j => (j.photos||[]).map(p=>`<img src="${photoUrlCache.get(p.id) || p.dataUrl || ''}" onclick="viewJobPhoto('${j.id}','${p.id}','customer:${id}')" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:pointer;">`)).join('')}
          <button onclick="document.getElementById('photoInput_${id}').click()" style="width:72px; height:72px; border-radius:10px; border:2px dashed var(--line); background:none; color:var(--ink-muted); font-size:1.625rem; display:flex; align-items:center; justify-content:center;">+</button>
          <input type="file" accept="image/*" id="photoInput_${id}" style="display:none;" onchange="handlePhotoSelected('${id}', this)">
        </div>
        ${linkedJobs.some(j=>j.photos&&j.photos.length) ? `<p style="color:var(--ink-muted); font-size:0.7188rem; margin:8px 2px 0;">Includes photos from this customer's one-off jobs.</p>` : ''}
      </div>
    </details>

    <div class="form-actions">
      <button class="btn-primary" style="background:var(--navy);" onclick="openCustomerForm(data.customers.find(x=>x.id==='${id}'))">Edit customer</button>
    </div>
  `);
}

// Opens a standalone list for one of a customer's history types (clean, pay, jobs).
// Closing it — via the ✕ or the browser/gesture back action — returns to the
// customer detail screen rather than dropping back to a blank sheet, since these
// lists only make sense in the context of the customer they belong to.
function openCustomerHistoryList(id, kind){
  const c = data.customers.find(x=>x.id===id);
  if(!c) return;
  let title, rowsHtml;
  if(kind === 'clean'){
    title = 'Clean history';
    rowsHtml = (c.cleanHistory||[]).slice().sort((a,b)=>a.date<b.date?1:-1)
      .map(e=>`<li style="cursor:pointer;" onclick="openHistEntryActions('${id}','clean','${e.date}',${e.amount})">${fmtDate(e.date)} — ${money(e.amount)}</li>`).join('') || '<li style="color:var(--ink-muted)">No cleans logged yet</li>';
  } else if(kind === 'pay'){
    title = 'Payment history';
    rowsHtml = (c.paymentHistory||[]).slice().sort((a,b)=>a.date<b.date?1:-1)
      .map(p=>`<li style="cursor:pointer;" onclick="openHistEntryActions('${id}','pay','${p.date}',${p.amount})">${fmtDate(p.date)} — ${money(p.amount)}</li>`).join('') || '<li style="color:var(--ink-muted)">No payments logged yet</li>';
  } else if(kind === 'jobs'){
    title = 'One-off jobs';
    const linkedJobs = (data.oneOffJobs||[]).filter(j=>j.customerId===id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    rowsHtml = linkedJobs
      .map(j=>`<li style="cursor:pointer;" onclick="openJobForm(data.oneOffJobs.find(x=>x.id==='${j.id}'), null, ()=>openCustomerHistoryList('${id}','jobs'))">${fmtDate(j.date)}${j.time?` at ${fmtTime(j.time)}`:''} — ${money(j.price)} <span style="color:var(--ink-muted); font-weight:500;">(${j.done?'done':'not done'}, ${j.paid?'paid':'unpaid'})</span></li>`).join('') || '<li style="color:var(--ink-muted)">No one-off jobs for this customer</li>';
  } else {
    title = 'Price history';
    rowsHtml = (c.priceHistory||[]).slice().sort((a,b)=>a.date<b.date?1:-1)
      .map((p,i)=>`<li style="cursor:pointer;" onclick="openHistEntryActions('${id}','price','${p.date}',${p.price})">${fmtDate(p.date)} — ${money(p.price)}${i===0?' <span style="color:var(--ink-muted); font-weight:500;">(current)</span>':''}</li>`).join('') || '<li style="color:var(--ink-muted)">No price changes recorded</li>';
  }
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${title}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <ul class="hist-list">${rowsHtml}</ul>
  `, () => openCustomerDetail(id));
}

// Read-only log of every message actually sent for a customer or job — reminders,
// receipts, quotes, marketing texts. Newest first. Nothing here is editable; it's
// just a record of what's already gone out, so you can tell at a glance whether
// someone's been chased today without reopening every message type separately.
function openMessageLog(kind, id){
  const item = kind === 'job' ? data.oneOffJobs.find(x=>x.id===id) : data.customers.find(x=>x.id===id);
  if(!item) return;
  const log = item.messageLog || [];
  const rowsHtml = log.map(entry => {
    const label = MESSAGE_LOG_LABELS[entry.kind] || entry.kind;
    const time = entry.time ? new Date(entry.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    return `<li>${escapeHtml(label)} <span style="color:var(--ink-muted); font-weight:500;">— ${fmtDate(entry.date)}${time?` at ${time}`:''}</span></li>`;
  }).join('') || '<li style="color:var(--ink-muted)">No messages sent yet</li>';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Messages</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <ul class="hist-list">${rowsHtml}</ul>
  `, () => kind === 'job' ? openJobForm(data.oneOffJobs.find(x=>x.id===id)) : openCustomerDetail(id));
}

// Tapping a clean/payment/price row opens this small menu instead of showing
// Edit/Remove (and Receipt, for payments) inline on every row — keeps the list
// itself scannable, with the actions just one tap further in.
function openHistEntryActions(id, kind, dateVal, amount){
  const label = kind==='clean' ? 'Clean' : kind==='pay' ? 'Payment' : 'Price entry';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${label} — ${fmtDate(dateVal)}</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; margin:0 2px 16px;">${money(amount)}</p>
    ${kind==='pay' ? `<button class="backup-btn" onclick="openReceiptOptions('${id}','${dateVal}',${amount})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div><div class="t1">Send receipt</div><div class="t2">Text message or a formatted PDF receipt</div></div>
    </button>` : ''}
    <button class="backup-btn" onclick="${kind==='price'?`editPriceHistoryEntry('${id}','${dateVal}')`:`editHistAmount('${id}','${kind}','${dateVal}')`}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      <div><div class="t1">Edit amount</div><div class="t2">Change the ${kind==='clean'?'amount charged':kind==='pay'?'amount paid':'price'}</div></div>
    </button>
    <button class="backup-btn" style="color:var(--red);" onclick="${kind==='price'?`removePriceHistoryEntry('${id}','${dateVal}')`:`removeHist('${id}','${kind}','${dateVal}')`}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--red);"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      <div><div class="t1" style="color:var(--red);">Remove entry</div><div class="t2">Deletes this ${label.toLowerCase()}</div></div>
    </button>
  `, () => openCustomerHistoryList(id, kind));
}

// Resolves a compressed Blob (not a dataURL) — used for customer/job photos, which
// are stored in IndexedDB rather than embedded in the main data object. A Blob also
// avoids the ~33% size inflation that base64/dataURL encoding would otherwise add.
function compressImage(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
        else if(h >= w && h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob)=>{
          if(blob) resolve(blob); else reject(new Error('toBlob failed'));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// Logos are usually small graphics with a transparent background, unlike photos — so this
// keeps PNG output (lossless, preserves transparency) rather than compressImage's JPEG.
function compressLogo(file, maxDim){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          if(w >= h){ h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleLogoSelected(inputEl){
  const file = inputEl.files[0];
  if(!file) return;
  toast('Adding logo…');
  try{
    const dataUrl = await compressLogo(file, 500);
    data.settings.logo = dataUrl;
    if(await saveData()){
      openBusinessDetails();
      toast('Logo added');
    }
  }catch(e){
    toast('Could not add that logo — try again');
  }
  inputEl.value = '';
}
function removeLogo(){
  appConfirm('Remove your logo?', {title:'Remove logo', confirmLabel:'Remove', onConfirm: () => {
    data.settings.logo = '';
    saveData();
    openBusinessDetails();
    toast('Logo removed');
  }});
}

async function handlePhotoSelected(id, inputEl){
  const file = inputEl.files[0];
  if(!file) return;
  toast('Adding photo…');
  try{
    // 1600px/0.85 quality — photos live in IndexedDB (see PHOTO_STORE), which uses
    // the phone's actual available storage rather than a tight fixed pool, so
    // there's no need to compress aggressively.
    const blob = await compressImage(file, 1600, 0.85);
    const photoId = uid();
    if(photoStorageAvailable){
      await idbSavePhoto(photoId, blob);
      cachePhotoBlob(photoId, blob);
      const c = data.customers.find(x=>x.id===id);
      c.photos = c.photos || [];
      c.photos.push({id: photoId, date: todayISO()});
    } else {
      // IndexedDB unavailable (rare) — fall back to the old embedded-dataURL
      // behaviour rather than losing the photo.
      const dataUrl = await blobToDataURL(blob);
      const c = data.customers.find(x=>x.id===id);
      c.photos = c.photos || [];
      c.photos.push({id: photoId, dataUrl, date: todayISO()});
    }
    if(await saveData()){
      openCustomerDetail(id);
      render();
      toast('Photo added');
    }
  }catch(e){
    toast('Could not add that photo — try again');
  }
  inputEl.value = '';
}

// Builds an ordered list of every photo shown on a customer's screen — their own
// photos followed by photos from any linked one-off jobs, matching the same merge
// order used when rendering that Photos section. Used to power swipe navigation
// and the cross-customer photo gallery below.
function buildCustomerPhotoList(customerId){
  const c = data.customers.find(x=>x.id===customerId);
  if(!c) return [];
  const linkedJobs = (data.oneOffJobs||[]).filter(j=>j.customerId===customerId);
  const list = (c.photos||[]).map(p => ({photoId:p.id, date:p.date, kind:'customer', ownerId:customerId}));
  linkedJobs.forEach(j => {
    (j.photos||[]).forEach(p => list.push({photoId:p.id, date:p.date, kind:'job', ownerId:j.id}));
  });
  return list;
}
function buildJobPhotoList(jobId){
  const j = data.oneOffJobs.find(x=>x.id===jobId);
  if(!j) return [];
  return (j.photos||[]).map(p => ({photoId:p.id, date:p.date, kind:'job', ownerId:jobId}));
}
// Looks up the legacy embedded dataUrl fallback for an entry (see Photo storage —
// photoUrlCache is the normal path, dataUrl only exists for un-migrated photos).
function photoEntrySrc(entry){
  const cached = photoUrlCache.get(entry.photoId);
  if(cached) return cached;
  const owner = entry.kind === 'customer'
    ? data.customers.find(x=>x.id===entry.ownerId)
    : data.oneOffJobs.find(x=>x.id===entry.ownerId);
  const p = owner && (owner.photos||[]).find(x=>x.id===entry.photoId);
  return (p && p.dataUrl) || '';
}

// Shared full-screen photo viewer with swipe/arrow navigation across a list of
// photos, used by both a single customer's/job's Photos section and the cross-
// customer Photo gallery. onClose is called once, when the viewer is dismissed
// (any route — ✕, swiping past the ends does nothing, or after deleting the last
// photo in the list).
let photoViewerList = [];
let photoViewerIndex = 0;
let photoViewerOnClose = null;
let photoViewerTouchStartX = null;
let photoViewerTouchStartY = null;

function openPhotoViewerAt(list, index, onClose){
  if(!list.length || index < 0 || index >= list.length) return;
  photoViewerList = list;
  photoViewerIndex = index;
  photoViewerOnClose = onClose || null;
  renderPhotoViewer();
}
function renderPhotoViewer(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry){ closeSheet(); return; }
  const src = photoEntrySrc(entry);
  const hasPrev = photoViewerIndex > 0;
  const hasNext = photoViewerIndex < photoViewerList.length - 1;
  const counter = photoViewerList.length > 1
    ? `<div style="text-align:center; color:var(--ink-muted); font-size:0.75rem; margin-bottom:8px;">${photoViewerIndex+1} of ${photoViewerList.length}</div>` : '';
  const navBtn = (dir, symbol) => `<button onclick="navigatePhotoViewer(${dir})" aria-label="${dir<0?'Previous':'Next'} photo" style="position:absolute; ${dir<0?'left':'right'}:6px; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; border:none; background:rgba(0,0,0,0.45); color:#fff; font-size:1.25rem; line-height:1; display:flex; align-items:center; justify-content:center;">${symbol}</button>`;
  openSheet(`
    <div class="sheet-head">
      <h2>Photo</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    ${counter}
    <div style="position:relative;">
      <img id="photoViewerImg" src="${src}" style="width:100%; border-radius:12px; margin-bottom:6px; touch-action:pan-y; display:block;">
      ${hasPrev ? navBtn(-1,'‹') : ''}
      ${hasNext ? navBtn(1,'›') : ''}
    </div>
    <p style="color:var(--ink-muted); font-size:0.75rem; margin:0 2px 16px;">Added ${fmtDate(entry.date)}</p>
    <div class="row2" style="margin-bottom:8px;">
      <button class="btn btn-clean" onclick="openPhotoAnnotator()">✏️ Annotate</button>
      <button class="btn btn-clean" onclick="sharePhotoViewerEntry()">📤 Share</button>
      <button class="btn" style="background:var(--red-dim); color:var(--red);" onclick="deletePhotoViewerEntry()">Delete</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.7188rem; margin:0 2px; text-align:center;">${photoViewerList.length>1?'Swipe left or right to browse, or ':''}Press and hold the photo to save or share it directly.</p>
  `, () => { if(photoViewerOnClose) photoViewerOnClose(); });
  attachPhotoViewerSwipe();
}
function navigatePhotoViewer(delta){
  const next = photoViewerIndex + delta;
  if(next < 0 || next >= photoViewerList.length) return;
  photoViewerIndex = next;
  renderPhotoViewer();
}
function attachPhotoViewerSwipe(){
  const img = document.getElementById('photoViewerImg');
  if(!img) return;
  photoViewerTouchStartX = null; photoViewerTouchStartY = null;
  img.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1) return;
    photoViewerTouchStartX = e.touches[0].clientX;
    photoViewerTouchStartY = e.touches[0].clientY;
  }, {passive:true});
  img.addEventListener('touchend', (e) => {
    if(photoViewerTouchStartX == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - photoViewerTouchStartX;
    const dy = t.clientY - photoViewerTouchStartY;
    photoViewerTouchStartX = null; photoViewerTouchStartY = null;
    // Require a clearly horizontal, decent-sized gesture so vertical scrolling
    // inside the sheet never gets mistaken for a page-to-page swipe.
    if(Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    navigatePhotoViewer(dx < 0 ? 1 : -1);
  }, {passive:true});
}
function sharePhotoViewerEntry(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry) return;
  if(entry.kind === 'customer') sharePhoto(entry.ownerId, entry.photoId);
  else shareJobPhoto(entry.ownerId, entry.photoId);
}
function deletePhotoViewerEntry(){
  const entry = photoViewerList[photoViewerIndex];
  if(!entry) return;
  appConfirm('Delete this photo?', {title:'Delete photo', confirmLabel:'Delete', onConfirm: () => {
    if(entry.kind === 'customer'){
      const c = data.customers.find(x=>x.id===entry.ownerId);
      if(c) c.photos = (c.photos||[]).filter(p=>p.id!==entry.photoId);
    } else {
      const j = data.oneOffJobs.find(x=>x.id===entry.ownerId);
      if(j) j.photos = (j.photos||[]).filter(p=>p.id!==entry.photoId);
    }
    saveData();
    if(photoStorageAvailable){
      idbDeletePhoto(entry.photoId).then(()=>{}).catch(()=>{});
      uncachePhoto(entry.photoId);
    }
    photoViewerList.splice(photoViewerIndex, 1);
    if(photoViewerIndex >= photoViewerList.length) photoViewerIndex = photoViewerList.length - 1;
    if(photoViewerList.length){
      renderPhotoViewer();
    } else {
      closeSheet();
    }
  }});
}

function viewPhoto(id, photoId){
  const list = buildCustomerPhotoList(id);
  const index = list.findIndex(e => e.kind==='customer' && e.photoId===photoId);
  if(index === -1) return;
  openPhotoViewerAt(list, index, () => openCustomerDetail(id));
}

