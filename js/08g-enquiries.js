/* =====================================================================
   Website enquiries — the third Sales tab.

   The enquiry form on your website encrypts each enquiry in the visitor's browser with a PUBLIC key and sends it to your
   Cloudflare worker's inbox. Only the matching PRIVATE key, which lives in Round Book (in the settings, so it travels to your
   other devices through live sync), can read it. The worker only ever holds scrambled data, for up to 45 days if nobody
   collects it.

   The app collects the inbox when it is opened, when the Enquiries tab is shown, when it comes back to the front, and every
   5 minutes while it is open and on screen. Nothing happens while it is closed. Collected enquiries are decrypted here and
   kept on this device (localStorage) so the list is there offline; an enquiry stays in the inbox, and so on every device,
   until it is dealt with: made into a customer or a quote, or removed. Then it is deleted from the inbox for good.

   The scheme (the website form does the same, see the enquiry form's script in the website's index.html):
     key pair      ECDH P-256, made here; the public half (65 bytes, base64) goes on the website
     per enquiry   the browser makes a one-off ECDH key, agrees a secret with the public key, and turns it into an AES-256-GCM
                   key with SHA-256(secret + its own public key + your public key + label). Sent: its public key, the iv,
                   the ciphertext. Nothing in what is sent can be read without your private key.
   An enquiry can also be added by hand (the + button on the tab: a phone call, a word-of-mouth tip). It is encrypted with the same
   public key and posted to the same inbox, with the inbox token so the bot check and visitor limits don't apply, so it behaves exactly
   like one from the website: it is on all your devices and is dealt with the same way.
   Everything that comes out of an enquiry is treated as untrusted text (anyone can send one): it is cleaned, cut to length,
   and always escaped before it is shown.
   ===================================================================== */
const ENQ_LABEL = 'round-book-enquiry-v1';
const ENQ_CACHE_KEY = 'roundBookEnquiries';
const ENQ_DELETING_KEY = 'roundBookEnquiriesDeleting';
const ENQ_MIN_GAP_MS = 20 * 1000;
const ENQ_POLL_MS = 5 * 60 * 1000;
const ENQ_SERVICES = ['Window cleaning', 'Gutter cleaning', 'Fascia & soffit cleaning'];
const ENQ_AREAS = ['South Tyneside', 'Cleadon', 'Boldon', 'Washington', 'Newcastle', 'Sunderland', 'Seaham', 'Murton'];
const ENQ_SOURCES = ['Phone call', 'Text message', 'Word of mouth', 'Facebook', 'Leaflet', 'Knocked on door'];
const enq = { items: [], at: 0, busy: false, error: '', unreadable: 0, deleting: [] };

function enqCfg(){
  const c = data && data.settings && data.settings.enquiryInbox;
  return (c && c.inboxId && c.token && c.privateKey && c.publicKey) ? c : null;
}
function enqCount(){ return enqCfg() ? enq.items.length : 0; }

/* ---------- encryption ---------- */
function enqB64(bytes){ let s = ''; new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); }
function enqUnb64(str){ const s = atob(str); const out = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
function enqHex(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
async function enqAesKey(bits, epkRaw, pubRaw, usage){
  const label = new TextEncoder().encode(ENQ_LABEL);
  const all = new Uint8Array(bits.byteLength + epkRaw.length + pubRaw.length + label.length);
  all.set(new Uint8Array(bits), 0); all.set(epkRaw, bits.byteLength); all.set(pubRaw, bits.byteLength + epkRaw.length); all.set(label, bits.byteLength + epkRaw.length + pubRaw.length);
  const raw = await crypto.subtle.digest('SHA-256', all);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usage);
}
// The same scheme as the website form's, using this inbox's own public key.
async function enqEncrypt(obj, pubB64){
  const enc = new TextEncoder(), label = enc.encode(ENQ_LABEL), pubRaw = enqUnb64(pubB64);
  const pub = await crypto.subtle.importKey('raw', pubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
  const epkRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const key = await enqAesKey(bits, epkRaw, pubRaw, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: label }, key, enc.encode(JSON.stringify(obj)));
  return { app: 'round-book-enquiry', v: 1, epk: enqB64(epkRaw), iv: enqB64(iv), ct: enqB64(ct) };
}
async function enqGenerateKeys(){
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    publicKey: enqB64(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey)
  };
}
async function enqDecrypt(envl, cfg){
  const priv = await crypto.subtle.importKey('jwk', cfg.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const epkRaw = enqUnb64(envl.epk);
  const pub = await crypto.subtle.importKey('raw', epkRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const key = await enqAesKey(bits, epkRaw, enqUnb64(cfg.publicKey), ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: enqUnb64(envl.iv), additionalData: new TextEncoder().encode(ENQ_LABEL) }, key, enqUnb64(envl.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
// What was in the form, as text of a safe length and the right kinds of thing. Anyone can send an enquiry, so nothing is trusted.
function enqClean(o, id, at){
  const str = (v, n) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
  o = (o && typeof o === 'object') ? o : {};
  const services = (Array.isArray(o.services) ? o.services : []).slice(0, 6).map(s => str(s, 60)).filter(Boolean);
  // The time shown is when the inbox received it (its clock), never anything the sender put in.
  return { id, at: Number(at) || Date.now(), sent: Number(at) || Date.now(),
    name: str(o.name, 100), phone: str(o.phone, 40), email: str(o.email, 120),
    services, area: str(o.area, 60), areaOther: str(o.areaOther, 80), message: str(o.message, 1500), source: str(o.source, 60) };
}

/* ---------- the inbox ---------- */
function enqLoadCache(){
  try{ const a = JSON.parse(localStorage.getItem(ENQ_CACHE_KEY) || '[]'); if(Array.isArray(a)) enq.items = a.map(x => enqClean(x, String(x.id || ''), x.at)).filter(x => x.id); }catch(e){}
  try{ const d = JSON.parse(localStorage.getItem(ENQ_DELETING_KEY) || '[]'); if(Array.isArray(d)) enq.deleting = d.filter(x => typeof x === 'string'); }catch(e){}
}
function enqSaveCache(){
  try{ localStorage.setItem(ENQ_CACHE_KEY, JSON.stringify(enq.items)); localStorage.setItem(ENQ_DELETING_KEY, JSON.stringify(enq.deleting)); }catch(e){}
}
async function enqApi(cfg, method, path, body, asOwner){
  const base = String(cfg.url || LIVE_SYNC_DEFAULT_URL).replace(/\/+$/, '');
  const headers = {};
  if(method !== 'POST' || asOwner) headers['X-Write-Token'] = cfg.token; // a visitor's POST carries no token; the app's own does
  if(body != null) headers['Content-Type'] = 'text/plain';
  const res = await fetch(`${base}/v1/inbox/${cfg.inboxId}${path}`, { method, headers, body: body != null ? body : undefined, cache: 'no-store' });
  let json = null;
  try{ json = JSON.parse(await res.text()); }catch(e){}
  return { ok: res.ok, status: res.status, json };
}
function enqRedraw(){
  if(typeof renderSubTabs === 'function') renderSubTabs();
  enqMarkSalesTab();
  const ov = document.getElementById('overlay');
  if(currentTab === 'enquiries' && !(ov && ov.classList.contains('show') && !(typeof isWideSplitView === 'function' && isWideSplitView()))) render();
}
// A small dot on the Sales tab when something is waiting, so it shows from any screen.
function enqMarkSalesTab(){
  const t = document.querySelector('.tab[data-tab="sales"]');
  if(t) t.classList.toggle('has-badge', enqCount() > 0);
}
async function enquiriesRefresh(opts){
  opts = opts || {};
  const cfg = enqCfg();
  if(!cfg || enq.busy) return;
  if(!opts.force && Date.now() - enq.at < ENQ_MIN_GAP_MS) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false){ if(opts.force) toast(OFFLINE_MSG); return; }
  enq.busy = true; enq.error = '';
  try{
    // Anything dealt with but not yet deleted from the inbox (we were offline) is deleted first.
    for(const id of enq.deleting.slice()){
      const r = await enqApi(cfg, 'DELETE', '/' + id);
      if(r.ok || r.status === 404) enq.deleting = enq.deleting.filter(x => x !== id);
    }
    const res = await enqApi(cfg, 'GET', '');
    if(res.status === 403){ enq.error = 'The inbox refused this device — it may have been turned off on another device.'; }
    else if(res.status === 404){ enq.error = 'Your Cloudflare worker doesn’t have the enquiry inbox yet — update it with the newest worker.js.'; }
    else if(!res.ok || !res.json || !Array.isArray(res.json.items)){ enq.error = 'Couldn’t check the inbox just now.'; }
    else {
      const out = []; let unreadable = 0;
      for(const it of res.json.items){
        if(!it || !it.id || enq.deleting.includes(it.id)) continue;
        try{ out.push(enqClean(await enqDecrypt(it.env, cfg), it.id, it.at)); }catch(e){ unreadable++; }
      }
      out.sort((a, b) => (b.sent || b.at) - (a.sent || a.at));
      enq.items = out; enq.unreadable = unreadable; enq.at = Date.now();
    }
  }catch(e){
    enq.error = 'Couldn’t reach the inbox — check your connection.';
  }
  enq.busy = false;
  enqSaveCache();
  enqRedraw();
}
// Dealt with: gone from the list at once, and deleted from the inbox (retried later if offline).
async function enquiryHandled(id){
  enq.items = enq.items.filter(x => x.id !== id);
  if(!enq.deleting.includes(id)) enq.deleting.push(id);
  enqSaveCache();
  enqRedraw();
  const cfg = enqCfg();
  if(!cfg) return;
  try{
    const r = await enqApi(cfg, 'DELETE', '/' + id);
    if(r.ok || r.status === 404){ enq.deleting = enq.deleting.filter(x => x !== id); enqSaveCache(); }
  }catch(e){ /* stays in the list of things to delete next time */ }
}

/* ---------- starting up ---------- */
function enquiriesBoot(){
  enqLoadCache();
  enqMarkSalesTab();
  if(!enqCfg()) return;
  setTimeout(() => enquiriesRefresh({ force: true }), 2500);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') enquiriesRefresh({}); });
  setInterval(() => { if(document.visibilityState === 'visible') enquiriesRefresh({ force: true }); }, ENQ_POLL_MS);
}
// Set up on this device while the app is open (the settings arrived from another device through live sync, say).
function enquiriesCheckStarted(){
  if(enqCfg() && !enq.started){ enq.started = true; enquiriesBoot(); }
}

/* ---------- the tab ---------- */
function enqTime(ms){
  const d = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if(days <= 0) return 'Today ' + hm;
  if(days === 1) return 'Yesterday ' + hm;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hm;
}
function enqAreaText(e){ return e.area === 'Other' ? (e.areaOther ? 'Other: ' + e.areaOther : 'Other area') : e.area; }
function renderEnquiries(main){
  const cfg = enqCfg();
  if(!cfg){
    main.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom:8px;">${mainScreenHelpBtn('enquiries', "()=>setTab('enquiries')")}</div>
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></svg>
        <b>Enquiries from your website</b>
        <p>Let people send you an enquiry from your website. Each one is encrypted on the visitor’s device and can only be read by your own devices — it arrives here, where you can call or text them, add them as a customer, or turn it into a quote.</p>
        <button class="btn-primary" style="margin-top:14px;" onclick="enquiriesSetUp()">Set up website enquiries</button>
      </div>`;
    return;
  }
  const tools = `<div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom:8px;">
    ${mainScreenHelpBtn('enquiries', "()=>setTab('enquiries')")}
    <button class="btn-open icon-plain" style="width:38px; height:38px; padding:0;" onclick="enquiriesRefresh({force:true})" aria-label="Check for new enquiries">↻</button>
    <button class="btn-open icon-plain" style="width:38px; height:38px; padding:0;" onclick="openEnquirySettings()" aria-label="Website enquiry settings">⚙︎</button>
  </div>`;
  let html = tools;
  if(enq.error) html += `<div style="margin:0 2px 12px; padding:10px 12px; border-radius:12px; background:var(--amber-dim); font-size:0.8125rem; font-weight:700;">${escapeHtml(enq.error)}</div>`;
  if(enq.unreadable) html += `<div style="margin:0 2px 12px; padding:10px 12px; border-radius:12px; background:var(--amber-dim); font-size:0.8125rem; font-weight:700;">${enq.unreadable === 1 ? '1 enquiry' : enq.unreadable + ' enquiries'} could not be read, as ${enq.unreadable === 1 ? 'it was' : 'they were'} not made with this inbox’s key.</div>`;
  if(!enq.items.length){
    html += `<div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="#66798A" stroke-width="1.6"><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></svg>
      <b>No enquiries waiting</b>
      <p>${enq.at ? 'Checked ' + enqTime(enq.at).toLowerCase() + '.' : 'Not checked yet.'} New ones from your website’s form appear here when the app is open.</p>
    </div>`;
    main.innerHTML = html;
    return;
  }
  html += `<div class="section-label">${enq.items.length} enquir${enq.items.length === 1 ? 'y' : 'ies'} <span style="text-transform:none; letter-spacing:0; font-weight:600; color:var(--ink-muted);">· newest first${enq.at ? ' · checked ' + enqTime(enq.at).toLowerCase() : ''}</span></div>`;
  html += enq.items.map(enquiryCardHtml).join('');
  main.innerHTML = html;
}
function enquiryCardHtml(e){
  const contact = [e.phone, e.email].filter(Boolean).map(escapeHtml).join(' · ');
  const what = [e.services.join(', '), enqAreaText(e)].filter(Boolean).map(escapeHtml).join(' — ');
  return `<div class="cust-card" data-id="${escapeAttr(e.id)}">
      <div class="cust-top" onclick="openEnquiry('${escapeAttr(e.id)}')">
        <div style="min-width:0;">
          <div class="cust-addr" style="font-size:1rem; font-weight:800; color:var(--ink);">${escapeHtml(e.name || 'No name given')}</div>
          ${contact ? `<div class="cust-name" style="font-size:0.8125rem; font-weight:600; color:var(--ink-muted); margin-top:2px;">${contact}</div>` : ''}
          ${what ? `<div style="font-size:0.8125rem; margin-top:4px; font-weight:700;">${what}</div>` : ''}
          ${e.source ? `<div style="font-size:0.75rem; margin-top:2px; color:var(--ink-muted);">Via ${escapeHtml(e.source)}</div>` : ''}
          ${e.message ? `<div style="font-size:0.8125rem; margin-top:4px; color:var(--ink-muted); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(e.message)}</div>` : ''}
          <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:4px;">${escapeHtml(enqTime(e.sent || e.at))}</div>
        </div>
      </div>
    </div>`;
}

/* ---------- one enquiry ---------- */
function enqTelHref(p){ const n = String(p || '').replace(/[^\d+]/g, ''); return n.length >= 6 ? n : ''; }
function enqMailHref(m){ return /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]+$/.test(m || '') ? m : ''; }
function enqNotes(e){
  const lines = [];
  const what = [e.services.join(', '), enqAreaText(e)].filter(Boolean).join(' — ');
  if(what) lines.push(what);
  if(e.message) lines.push(e.message);
  return lines.join('\n');
}
function openEnquiry(id){
  const e = enq.items.find(x => x.id === id);
  if(!e) return;
  const tel = enqTelHref(e.phone), mail = enqMailHref(e.email);
  const btn = 'display:flex; align-items:center; justify-content:center; gap:6px; flex:1; min-width:0; padding:12px 8px; border-radius:12px; background:var(--blue-dim); color:var(--blue-deep); font-weight:800; font-size:0.875rem; text-decoration:none;';
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">${escapeHtml(e.name || 'Enquiry')}</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">✕</button>
    </div>
    <div style="font-size:0.75rem; color:var(--ink-muted); margin:0 2px 12px;">Sent ${escapeHtml(enqTime(e.sent || e.at))}</div>
    <div style="display:flex; gap:8px; margin-bottom:14px;">
      ${tel ? `<a href="tel:${escapeAttr(tel)}" style="${btn}">📞 Call</a><a href="sms:${escapeAttr(tel)}" style="${btn}">💬 Text</a>` : ''}
      ${mail ? `<a href="mailto:${escapeAttr(mail)}?subject=${encodeURIComponent('Your enquiry – Crystal Clean Services')}" style="${btn}">✉️ Email</a>` : ''}
    </div>
    ${e.phone ? `<label style="margin-top:0;">Phone</label><div style="margin:0 2px 10px; font-weight:700;">${escapeHtml(e.phone)}</div>` : ''}
    ${e.email ? `<label>Email</label><div style="margin:0 2px 10px; font-weight:700; word-break:break-all;">${escapeHtml(e.email)}</div>` : ''}
    <label>Interested in</label>
    <div style="margin:0 2px 10px; font-weight:700;">${e.services.length ? escapeHtml(e.services.join(', ')) : 'Not said'}</div>
    <label>Area</label>
    <div style="margin:0 2px 10px; font-weight:700;">${escapeHtml(enqAreaText(e) || 'Not said')}</div>
    ${e.source ? `<label>How they got in touch</label><div style="margin:0 2px 10px; font-weight:700;">${escapeHtml(e.source)}</div>` : ''}
    ${e.message ? `<label>Message</label><div style="margin:0 2px 14px; white-space:pre-wrap; line-height:1.5;">${escapeHtml(e.message)}</div>` : ''}
    <div class="form-actions" style="display:flex; flex-direction:column; gap:8px;">
      <button class="btn-primary" onclick="enquiryToCustomer('${escapeAttr(e.id)}')">Add as customer</button>
      <button class="btn-primary" style="background:var(--blue-dim); color:var(--blue-deep);" onclick="enquiryToQuote('${escapeAttr(e.id)}')">Make a quote</button>
    </div>
    <button class="btn-danger-text" onclick="enquiryRemove('${escapeAttr(e.id)}')">Remove enquiry</button>
  `);
}
function enquiryToCustomer(id){
  const e = enq.items.find(x => x.id === id);
  if(!e) return;
  openCustomerForm(null, { name: e.name, phone: e.phone, email: e.email, notes: (e.source ? 'Enquiry via ' + e.source : 'Website enquiry') + ': ' + enqNotes(e).replace(/\n/g, ' — '), enquiryId: e.id });
}
function enquiryToQuote(id){
  const e = enq.items.find(x => x.id === id);
  if(!e) return;
  openQuoteForm(null, { name: e.name, phone: e.phone, email: e.email, notes: enqNotes(e), enquiryId: e.id }, () => setTab('enquiries'));
}
function enquiryRemove(id){
  appConfirm('Remove this enquiry? It is deleted from the inbox, so it disappears on all your devices. This can’t be undone.', {
    title: 'Remove enquiry', confirmLabel: 'Remove', danger: true,
    onConfirm: () => { closeSheet(); enquiryHandled(id); toast('Enquiry removed'); }
  });
}

/* ---------- adding one by hand ---------- */
function openEnquiryForm(){
  if(!enqCfg()){ enquiriesSetUp(); return; }
  const chk = (id, val) => `<label style="display:flex; align-items:center; gap:8px; margin:6px 2px; font-weight:600;"><input type="checkbox" class="enqSvc" value="${escapeAttr(val)}" style="width:18px; height:18px; margin:0;"> ${escapeHtml(val)}</label>`;
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Add enquiry</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">✕</button>
    </div>
    <p style="font-size:0.75rem; color:var(--ink-muted); margin:0 2px 12px; line-height:1.45;">For someone who got in touch another way, such as a phone call or a word of mouth tip. It goes in the list with the website ones, on all your devices.</p>
    <label style="margin-top:0;">Name</label>
    <input type="text" id="enqF_name" maxlength="100" autocomplete="off">
    <label>Phone</label>
    <input type="text" id="enqF_phone" maxlength="40" inputmode="tel" autocomplete="off">
    <label>Email</label>
    <input type="text" id="enqF_email" maxlength="120" inputmode="email" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
    <label>How did they get in touch? <span style="font-weight:500; color:var(--ink-muted);">(optional)</span></label>
    <input type="text" id="enqF_source" maxlength="60" list="enqSources" placeholder="e.g. Phone call" autocomplete="off">
    <datalist id="enqSources">${ENQ_SOURCES.map(s => `<option value="${escapeAttr(s)}">`).join('')}</datalist>
    <label>Interested in</label>
    ${ENQ_SERVICES.map(s => chk('', s)).join('')}
    <label>Area</label>
    <select id="enqF_area" onchange="document.getElementById('enqF_otherWrap').style.display = this.value === 'Other' ? '' : 'none'">
      <option value="">Not said</option>
      ${ENQ_AREAS.map(a => `<option>${escapeHtml(a)}</option>`).join('')}
      <option value="Other">Somewhere else</option>
    </select>
    <div id="enqF_otherWrap" style="display:none;"><label>Which area?</label><input type="text" id="enqF_other" maxlength="80" autocomplete="off"></div>
    <label>Notes <span style="font-weight:500; color:var(--ink-muted);">(optional)</span></label>
    <textarea id="enqF_message" rows="4" maxlength="1500"></textarea>
    <div class="form-actions" style="margin-top:14px;">
      <button class="btn-primary" id="enqF_save" onclick="saveEnquiryForm()">Add enquiry</button>
    </div>
  `);
}
async function saveEnquiryForm(){
  const cfg = enqCfg(); if(!cfg) return;
  const v = id => (document.getElementById(id) || {}).value || '';
  const name = v('enqF_name').trim(), phone = v('enqF_phone').trim(), email = v('enqF_email').trim();
  if(!name && !phone && !email){ toast('Add a name, phone number or email'); return; }
  const area = v('enqF_area');
  if(area === 'Other' && !v('enqF_other').trim()){ toast('Which area is it?'); return; }
  const payload = { v: 1, name, phone, email,
    services: Array.from(document.querySelectorAll('.enqSvc:checked')).map(x => x.value),
    area, areaOther: area === 'Other' ? v('enqF_other').trim() : '',
    message: v('enqF_message').trim(), source: v('enqF_source').trim() || 'Added by hand' };
  const btn = document.getElementById('enqF_save');
  if(btn){ btn.disabled = true; btn.textContent = 'Adding…'; }
  const again = () => { if(btn){ btn.disabled = false; btn.textContent = 'Add enquiry'; } };
  try{
    const body = await enqEncrypt(payload, cfg.publicKey);
    const r = await enqApi(cfg, 'POST', '', JSON.stringify(body), true);
    if(r.ok){ closeSheet(); toast('Enquiry added'); enquiriesRefresh({ force: true }); return; }
    if(r.status === 403) toast('Your Cloudflare worker needs the newest worker.js before the app can add enquiries by hand');
    else if(r.status === 409) toast('The inbox is full — deal with some enquiries first');
    else toast('Couldn’t add it just now — try again');
  }catch(e){
    toast(navigator.onLine === false ? OFFLINE_MSG : 'Couldn’t add it just now — try again');
  }
  again();
}

/* ---------- setting it up ---------- */
async function enquiriesSetUp(){
  if(!(window.crypto && crypto.subtle)){ toast('This browser can’t do the encryption this needs'); return; }
  if(enqCfg()){ openEnquirySettings(); return; }
  toast('Setting up…');
  try{
    const keys = await enqGenerateKeys();
    const cfg = { url: LIVE_SYNC_DEFAULT_URL, inboxId: enqHex(12), token: enqHex(32), publicKey: keys.publicKey, privateKey: keys.privateKey, createdAt: Date.now() };
    const r = await enqApi(cfg, 'PUT', '');
    if(r.status === 404){ toast('Your Cloudflare worker needs updating first — see the changelog'); return; }
    if(!r.ok){ toast('Couldn’t reach your Cloudflare worker just now'); return; }
    data.settings.enquiryInbox = cfg;
    saveData();
    enq.started = true; enquiriesBoot();
    render();
    openEnquirySettings();
  }catch(e){
    toast(navigator.onLine === false ? OFFLINE_MSG : 'Couldn’t set up website enquiries');
  }
}
function enqWebsiteConfigText(cfg){
  return `// Crystal Clean enquiry form settings, made by Round Book (Enquiries > ⚙︎).
// Safe to publish: the key below is the PUBLIC half. Only your own devices hold the private half.
window.ENQUIRY_CONFIG = {
  endpoint: "${String(cfg.url || LIVE_SYNC_DEFAULT_URL).replace(/\/+$/, '')}",
  inbox: "${cfg.inboxId}",
  publicKey: "${cfg.publicKey}",
  turnstileSiteKey: "" // paste your Cloudflare Turnstile site key between the quotes (see the website's README)
};
`;
}
function openEnquirySettings(){
  const cfg = enqCfg();
  if(!cfg){ enquiriesSetUp(); return; }
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Website enquiries</h2>
      ${helpIconBtn('enquiries', () => openEnquirySettings())}
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">✕</button>
    </div>
    <div style="margin:0 2px 14px; padding:12px; border-radius:12px; background:var(--green-dim, var(--blue-dim)); font-size:0.8125rem; line-height:1.5;">
      <b>The inbox is on.</b> ${enq.at ? 'Last checked ' + escapeHtml(enqTime(enq.at).toLowerCase()) + '.' : 'Not checked yet.'}
      Enquiries are encrypted on the visitor’s device; only your devices can read them.
    </div>
    <div class="form-actions" style="display:flex; flex-direction:column; gap:8px;">
      <button class="btn-primary" onclick="closeSheet(); enquiriesRefresh({force:true});">Check the inbox now</button>
    </div>
    <details style="margin:16px 2px 4px;">
      <summary style="cursor:pointer; font-weight:800; font-size:0.875rem;">Website settings <span style="font-weight:600; color:var(--ink-muted);">(only needed if you change your website)</span></summary>
      <p style="font-size:0.75rem; color:var(--ink-muted); margin:10px 0 8px; line-height:1.45;">If you ever move the website or start it again, copy this, open <b>enquiry-config.js</b> in the website’s folder on GitHub, replace everything in it with this, and commit. Add your Turnstile site key where it says.</p>
      <textarea id="enqConfigText" rows="9" readonly style="font-family:ui-monospace, Menlo, monospace; font-size:0.6875rem; line-height:1.4;">${escapeHtml(enqWebsiteConfigText(cfg))}</textarea>
      <button class="btn-primary" style="margin-top:10px;" onclick="enqCopyConfig()">Copy settings for the website</button>
    </details>
    <button class="btn-danger-text" onclick="enquiriesTurnOff()">Turn off website enquiries…</button>
  `);
}
async function enqCopyConfig(){
  const cfg = enqCfg(); if(!cfg) return;
  const text = enqWebsiteConfigText(cfg);
  try{ await navigator.clipboard.writeText(text); toast('Copied — paste it into enquiry-config.js on GitHub'); return; }catch(e){}
  const ta = document.getElementById('enqConfigText');
  if(ta){ ta.focus(); ta.select(); try{ document.execCommand('copy'); toast('Copied'); return; }catch(e){} }
  toast('Select the text and copy it');
}
function enquiriesTurnOff(){
  appConfirm('Turn off website enquiries? The inbox and any enquiries still waiting in it are deleted, and the form on your website will stop working until you set it up again (with new settings). Enquiries you have already added as customers or quotes are not affected.', {
    title: 'Turn off enquiries', confirmLabel: 'Turn off', danger: true,
    onConfirm: async () => {
      const cfg = enqCfg();
      if(cfg){ try{ await enqApi(cfg, 'DELETE', ''); }catch(e){ toast(OFFLINE_MSG); return; } }
      delete data.settings.enquiryInbox;
      enq.items = []; enq.deleting = []; enq.error = ''; enq.at = 0; enq.started = false;
      enqSaveCache();
      saveData();
      closeSheet();
      render();
      enqMarkSalesTab();
      toast('Website enquiries turned off');
    }
  });
}
