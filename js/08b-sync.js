/* 08b-sync.js -- Sync between two of your own devices (e.g. phone <-> iPad) with no server.
   One device builds an ENCRYPTED file (AirDrop / Messages / Files), the other receives it and
   MERGES it with what it already has. Photos travel in extra encrypted files alongside it.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html.

   How the merge works (three-way): each device remembers the last file it received from the
   other one (the "base"). On the next receive it compares base / this device / the incoming file:
     - only one side changed something  -> take that change
     - both changed different things    -> keep both
     - both changed the SAME field      -> a clash: the app picks one (the same one on both devices)
     - lists inside a customer (cleans, payments, messages...) are merged entry by entry, so
       a clean marked on the phone and a note typed on the iPad both survive.
   A safety copy is always taken first, and the person sees a summary and confirms before
   anything changes. */

/* ---------- storage for the sync passphrase key + merge base ----------
   Kept in its OWN IndexedDB database so it never ends up in backups or exports. */
const SYNC_DB_NAME = 'roundBookSync';
const SYNC_STORE = 'meta';
const SYNC_KDF_ITERATIONS = 600000;
let syncDbPromise = null;
function openSyncDb(){
  if(syncDbPromise) return syncDbPromise;
  syncDbPromise = new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(SYNC_DB_NAME, 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains(SYNC_STORE)) req.result.createObjectStore(SYNC_STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  syncDbPromise.catch(()=>{ syncDbPromise = null; });
  return syncDbPromise;
}
async function syncMetaGet(){
  try{
    const db = await openSyncDb();
    return await new Promise((resolve, reject)=>{
      const req = db.transaction(SYNC_STORE, 'readonly').objectStore(SYNC_STORE).get('meta');
      req.onsuccess = ()=> resolve(req.result || {});
      req.onerror = ()=> reject(req.error);
    });
  }catch(e){ return {}; }
}
async function syncMetaPut(meta){
  const db = await openSyncDb();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(SYNC_STORE, 'readwrite');
    tx.objectStore(SYNC_STORE).put(meta, 'meta');
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
    tx.onabort = ()=> reject(tx.error);
  });
}
async function syncMetaSave(meta){
  try{ await syncMetaPut(meta); }
  catch(e){
    // Some browsers can't store the derived key object: keep everything else and
    // simply ask for the passphrase each time.
    try{ await syncMetaPut(Object.assign({}, meta, {key:null})); }catch(e2){}
  }
}
// Forget what we know about the other device (keeps the passphrase). Used after
// restoring a backup / safety copy, when this device's data has jumped back in time.
async function syncForgetBase(){
  const meta = await syncMetaGet();
  if(!meta.base && !meta.lastPeerFileAt) return;
  await syncMetaSave(Object.assign({}, meta, {base:null, peerDeviceId:null, lastPeerFileAt:0}));
}
function syncDeviceId(){
  let id = null;
  try{ id = localStorage.getItem('roundBookDeviceId'); }catch(e){}
  if(!id){
    id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    try{ localStorage.setItem('roundBookDeviceId', id); }catch(e){}
  }
  return id;
}

/* ---------- encryption (WebCrypto: PBKDF2 -> AES-256-GCM) ---------- */
function syncB64(u8){
  let s = '';
  const CH = 0x8000;
  for(let i=0; i<u8.length; i+=CH) s += String.fromCharCode.apply(null, u8.subarray(i, i+CH));
  return btoa(s);
}
function syncUnB64(b64){
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for(let i=0; i<s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
async function syncDeriveKey(passphrase, saltB64){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:syncUnB64(saltB64), iterations:SYNC_KDF_ITERATIONS, hash:'SHA-256'},
    km, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']
  );
}
async function syncStreamBytes(bytes, transform){
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}
async function syncEncrypt(obj, key, saltB64, opts){
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  let bytes = raw, z = 0;
  if(typeof CompressionStream !== 'undefined' && !(opts && opts.compress === false)){ // photo files are already compressed JPEGs
    try{ bytes = await syncStreamBytes(raw, new CompressionStream('gzip')); z = 1; }catch(e){ bytes = raw; z = 0; }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`round-book-sync|1|${saltB64}|${z}`);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:aad}, key, bytes));
  return JSON.stringify({app:'round-book-sync', v:1, z, salt:saltB64, iv:syncB64(iv), ct:syncB64(ct)});
}
// Returns the payload object, or null if the key is wrong / the file is damaged.
async function syncDecrypt(env, key){
  try{
    const aad = new TextEncoder().encode(`round-book-sync|1|${env.salt}|${env.z ? 1 : 0}`);
    let bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:syncUnB64(env.iv), additionalData:aad}, key, syncUnB64(env.ct)));
    if(env.z){
      if(typeof DecompressionStream === 'undefined') return null;
      bytes = await syncStreamBytes(bytes, new DecompressionStream('gzip'));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(e){ return null; }
}

/* ---------- what goes in the file ---------- */
function syncClone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
// Photo references ({id, date}) are part of each customer/job and merge like any other
// list; the photo pictures themselves travel in separate files (see Photos below).
function syncBuildState(src){
  src = src || data;
  return {
    customers: (src.customers||[]).map(c => syncClone(c)),
    oneOffJobs: (src.oneOffJobs||[]).map(j => syncClone(j)),
    quotes: syncClone(src.quotes||[]),
    mileageLog: syncClone(src.mileageLog||[]),
    settings: syncClone(src.settings||{})
  };
}
function syncLocalIsEmpty(){
  return !(data.customers||[]).length && !(data.oneOffJobs||[]).length && !(data.quotes||[]).length;
}

/* ---------- the merge ---------- */
function syncStable(v){
  if(Array.isArray(v)) return '[' + v.map(syncStable).join(',') + ']';
  if(v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + syncStable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function syncEq(a, b){
  if(a === undefined || b === undefined) return a === b;
  return syncStable(a) === syncStable(b);
}
function syncIsObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }
function syncAscendingByDate(arr){
  for(let i=1; i<arr.length; i++) if(String(arr[i].date) < String(arr[i-1].date)) return false;
  return true;
}
// Entry-by-entry merge of a list. Identical entries are the same entry; one added or
// removed on either side is respected (counts handle genuine duplicates).
function syncMergeArray(base, local, remote){
  const tally = arr => {
    const m = new Map();
    arr.forEach(x => { const k = syncStable(x); const e = m.get(k); if(e) e.n++; else m.set(k, {n:1, v:x}); });
    return m;
  };
  const B = tally(base), L = tally(local), R = tally(remote);
  const order = [], seen = new Set();
  local.concat(remote).forEach(x => { const k = syncStable(x); if(!seen.has(k)){ seen.add(k); order.push(k); } });
  let out = [];
  order.forEach(k => {
    const b = B.has(k) ? B.get(k).n : 0, l = L.has(k) ? L.get(k).n : 0, r = R.has(k) ? R.get(k).n : 0;
    const n = Math.max(0, b - Math.max(b-l, b-r, 0) + Math.max(l-b, r-b, 0));
    const v = (L.get(k) || R.get(k)).v;
    for(let i=0; i<n; i++) out.push(syncClone(v));
  });
  const objs = out.length && out.every(x => x && typeof x === 'object');
  if(objs && out.every(x => typeof x.time === 'number' && x.kind)){
    // message log: newest first, capped like logMessage() caps it
    out.sort((a,b) => b.time - a.time);
    if(out.length > 30) out.length = 30;
  } else if(objs && out.every(x => typeof x.date === 'string') && (syncAscendingByDate(local) || syncAscendingByDate(remote))){
    out = out.map((x,i)=>({x,i})).sort((a,b) => (a.x.date < b.x.date ? -1 : a.x.date > b.x.date ? 1 : a.i - b.i)).map(o => o.x);
  }
  return out;
}
function syncMerge3(base, local, remote, ctx, path){
  if(syncEq(local, remote)) return local;
  if(syncEq(base, remote)) return local;
  if(syncEq(base, local)) return remote;
  if(Array.isArray(local) && Array.isArray(remote)) return syncMergeArray(Array.isArray(base) ? base : [], local, remote);
  if(syncIsObj(local) && syncIsObj(remote)){
    const b = syncIsObj(base) ? base : {};
    const out = {};
    new Set(Object.keys(local).concat(Object.keys(remote))).forEach(k => {
      const v = syncMerge3(b[k], local[k], remote[k], ctx, path.concat(k));
      if(v !== undefined) out[k] = v;
    });
    return out;
  }
  // Same field changed to different values on both devices.
  const key = path[path.length-1] || '';
  if(typeof local === 'number' && typeof remote === 'number' && (key === 'nextAccountNumber' || /Count$/.test(key))) return Math.max(local, remote);
  // One side blank, the other filled in: that isn't really a clash, keep what's filled in.
  const blank = v => v === undefined || v === null || v === '';
  if(blank(local)) return remote;
  if(blank(remote)) return local;
  ctx.clashes.push({label: ctx.label, field: path.join(' › ')});
  return ctx.preferRemote ? remote : local;
}
function syncNewBucket(){ return {added:0, updated:0, removed:0, kept:0, restored:0}; }
function syncMergeCollection(baseArr, localArr, remoteArr, keyOf, labelOf, ctx, bucket){
  const index = a => { const m = new Map(); (a||[]).forEach(x => m.set(keyOf(x), x)); return m; };
  const B = index(baseArr), L = index(localArr), R = index(remoteArr);
  const keys = [], seen = new Set();
  (localArr||[]).concat(remoteArr||[]).forEach(x => { const k = keyOf(x); if(!seen.has(k)){ seen.add(k); keys.push(k); } });
  const out = [];
  keys.forEach(k => {
    const b = B.get(k), l = L.get(k), r = R.get(k);
    if(l && r){
      ctx.label = labelOf(l) || labelOf(r);
      const merged = syncMerge3(b || {}, l, r, ctx, []);
      if(!syncEq(merged, l)) bucket.updated++;
      out.push(syncClone(merged));
    } else if(l){
      if(b){
        if(syncEq(b, l)) bucket.removed++;   // deleted on the other device, untouched here
        else { out.push(l); bucket.kept++; }   // edited here after it was deleted there: keep it
      } else out.push(l);                      // added here
    } else if(r){
      if(b){
        if(!syncEq(b, r)){ out.push(syncClone(r)); bucket.restored++; }
        // else: deleted here and untouched there — stays deleted
      } else { out.push(syncClone(r)); bucket.added++; }
    }
  });
  return out;
}
function syncFixAccountNumbers(customers, baseCustomers, settings, ctx){
  const nums = customers.map(c => parseInt(c.accountNumber, 10)).filter(n => !isNaN(n));
  const floor = nums.length ? Math.max.apply(null, nums) + 1 : 1;
  settings.nextAccountNumber = Math.max(Number(settings.nextAccountNumber) || 1, floor);
  const baseNumById = new Map((baseCustomers||[]).map(c => [c.id, String(c.accountNumber)]));
  const groups = new Map();
  customers.forEach(c => { if(c.accountNumber){ const k = String(c.accountNumber); if(!groups.has(k)) groups.set(k, []); groups.get(k).push(c); } });
  groups.forEach((list, num) => {
    if(list.length < 2) return;
    let keeper = list.find(c => baseNumById.get(c.id) === num);
    if(!keeper) keeper = list.slice().sort((a,b) => (a.id < b.id ? -1 : 1))[0];
    list.filter(c => c !== keeper).sort((a,b) => (a.id < b.id ? -1 : 1)).forEach(c => {
      c.accountNumber = String(settings.nextAccountNumber++);
      ctx.renumbered++;
    });
  });
}
// Pure: returns {merged, stats} without touching `data`.
function syncMergeStates(base, local, remote, ctx){
  ctx.clashes = []; ctx.renumbered = 0;
  const stats = {customers:syncNewBucket(), oneOffJobs:syncNewBucket(), quotes:syncNewBucket(), mileageLog:syncNewBucket(), settingsChanged:false};
  const byId = x => x.id;
  const nameOf = x => x.name || x.address || x.date || '';
  const customers = syncMergeCollection(base.customers, local.customers, remote.customers, byId, nameOf, ctx, stats.customers);
  const jobs = syncMergeCollection(base.oneOffJobs, local.oneOffJobs, remote.oneOffJobs, byId, nameOf, ctx, stats.oneOffJobs);
  const quotes = syncMergeCollection(base.quotes, local.quotes, remote.quotes, byId, nameOf, ctx, stats.quotes);
  const mileage = syncMergeCollection(base.mileageLog, local.mileageLog, remote.mileageLog, x => x.date, x => x.date, ctx, stats.mileageLog);
  // Settings: the campaign list is merged entry by entry, everything else field by field.
  const split = s => { const o = Object.assign({}, s || {}); const camps = o.marketingCampaigns; delete o.marketingCampaigns; return {o, camps: camps || []}; };
  const sb = split(base.settings), sl = split(local.settings), sr = split(remote.settings);
  ctx.label = 'Settings';
  const settings = syncClone(syncMerge3(sb.o, sl.o, sr.o, ctx, [])) || {};
  const campBucket = syncNewBucket();
  settings.marketingCampaigns = syncMergeCollection(sb.camps, sl.camps, sr.camps, x => x.id, x => x.name || x.id, ctx, campBucket);
  stats.settingsChanged = !syncEq(settings, local.settings || {});
  syncFixAccountNumbers(customers, base.customers, settings, ctx);
  return {merged:{customers, oneOffJobs:jobs, quotes, mileageLog:mileage, settings}, stats, clashes:ctx.clashes, renumbered:ctx.renumbered};
}
function syncPlural(n, word){ return `${n} ${word}${n===1?'':'s'}`; }
function syncSummaryText(res){
  const s = res.stats, parts = [];
  const line = (label, b, noun) => {
    const bits = [];
    if(b.added) bits.push(`${b.added} added`);
    if(b.updated) bits.push(`${b.updated} updated`);
    if(b.removed) bits.push(`${b.removed} removed`);
    if(b.restored) bits.push(`${b.restored} brought back`);
    if(b.kept) bits.push(`${b.kept} kept (edited here after being deleted on the other device)`);
    if(bits.length) parts.push(`${label}: ${bits.join(', ')}.`);
  };
  line('Customers', s.customers); line('Jobs', s.oneOffJobs); line('Quotes', s.quotes); line('Mileage days', s.mileageLog);
  if(s.settingsChanged) parts.push('Settings updated.');
  if(res.renumbered) parts.push(`${syncPlural(res.renumbered, 'duplicate account number')} renumbered.`);
  if(res.clashes.length){
    const names = Array.from(new Set(res.clashes.map(c => c.label + (c.field ? ' – ' + c.field : '')))).slice(0,3).join('; ');
    parts.push(`${syncPlural(res.clashes.length, 'clash')} (the same detail was changed on both devices, so one version was kept automatically): ${names}${res.clashes.length > 3 ? '…' : ''}.`);
  }
  return parts;
}

/* ---------- photos ----------
   The pictures live in their own IndexedDB store, so they travel in separate encrypted
   files (about 8 MB each) next to the data file. Only photos the other device doesn't
   already have are sent: each file lists the photos its sender holds, so after a
   round trip nothing is sent twice. A send is capped (~40 MB) to keep the phone's
   memory happy; anything left over goes next time. */
const SYNC_PHOTO_PART_BYTES = 8 * 1024 * 1024;
const SYNC_PHOTO_SEND_BYTES = 40 * 1024 * 1024;
function syncPhotoRefs(){
  const out = [];
  (data.customers||[]).forEach(c => (c.photos||[]).forEach(p => { if(p && p.id) out.push(p); }));
  (data.oneOffJobs||[]).forEach(j => (j.photos||[]).forEach(p => { if(p && p.id) out.push(p); }));
  return out;
}
// Photos referenced by a customer/job whose picture is actually on this device.
function syncHeldPhotoIds(){
  const seen = new Set();
  syncPhotoRefs().forEach(p => { if(photoUrlCache.has(p.id)) seen.add(p.id); });
  return Array.from(seen);
}
function syncMissingPhotoCount(){
  const missing = new Set();
  syncPhotoRefs().forEach(p => { if(!photoUrlCache.has(p.id)) missing.add(p.id); });
  return missing.size;
}
function syncPhotosToSend(meta){
  const peerHas = new Set(meta.peerPhotoIds || []);
  const sent = meta.sentPhotos || {};
  const heardSince = meta.lastPeerFileAt || 0;
  const dateOf = new Map();
  syncPhotoRefs().forEach(p => dateOf.set(p.id, p.date || ''));
  return syncHeldPhotoIds()
    // never sent, or sent but the other device has written back since and still doesn't list it
    .filter(id => !peerHas.has(id) && (!sent[id] || heardSince > sent[id]))
    .sort((a,b) => String(dateOf.get(b)).localeCompare(String(dateOf.get(a)))); // newest first
}
async function syncBuildPhotoFiles(ids, key, salt, header, stamp){
  const parts = [], sentIds = [];
  let part = [], partBytes = 0, total = 0, i = 0;
  const flush = () => { if(part.length){ parts.push(part); part = []; partBytes = 0; } };
  for(; i < ids.length && total < SYNC_PHOTO_SEND_BYTES; i++){
    if(i % 5 === 0) toast(`Preparing photos… ${i} of ${ids.length}`);
    let blob = null;
    try{ blob = await idbGetPhoto(ids[i]); }catch(e){}
    if(!blob) continue;
    part.push({id: ids[i], type: blob.type || 'image/jpeg', b64: syncB64(new Uint8Array(await blob.arrayBuffer()))});
    sentIds.push(ids[i]);
    partBytes += blob.size; total += blob.size;
    if(partBytes >= SYNC_PHOTO_PART_BYTES) flush();
  }
  flush();
  const items = [];
  for(let p = 0; p < parts.length; p++){
    const payload = Object.assign({}, header, {kind:'photos', part:p+1, parts:parts.length, photos:parts[p]});
    items.push({text: await syncEncrypt(payload, key, salt, {compress:false}), filename: `round-book-sync-${stamp}-photos-${p+1}of${parts.length}.json`, mime:'application/json'});
  }
  return {items, sentIds, remaining: ids.length - i};
}
// Stores photos received in sync files. Protected from the orphan clean-up for two
// weeks (meta.pendingPhotos) until a merged customer or job refers to them.
async function syncStoreReceivedPhotos(photoPayloads, meta){
  let stored = 0;
  const pending = Object.assign({}, meta.pendingPhotos || {});
  for(const pl of photoPayloads){
    for(const p of (pl.photos || [])){
      try{
        pending[p.id] = Date.now();
        if(photoUrlCache.has(p.id)) continue;
        const blob = new Blob([syncUnB64(p.b64)], {type: p.type || 'image/jpeg'});
        await idbSavePhoto(p.id, blob);
        cachePhotoBlob(p.id, blob);
        stored++;
      }catch(e){}
    }
  }
  meta.pendingPhotos = pending;
  return stored;
}
function syncPrunePending(meta){
  const referenced = new Set(syncPhotoRefs().map(p => p.id));
  const pending = {};
  Object.keys(meta.pendingPhotos || {}).forEach(id => { if(!referenced.has(id)) pending[id] = meta.pendingPhotos[id]; });
  meta.pendingPhotos = pending;
}

/* ---------- sending ---------- */
function syncAskNewPassphrase(){
  return new Promise(resolve => {
    appConfirm('Choose a passphrase to protect your synced data. Make it long — four random words is good. You\'ll type it once on your other device. It can\'t be recovered if you lose it.', {
      title:'Create sync passphrase', confirmLabel:'Next', danger:false,
      input:{type:'password', placeholder:'Passphrase (8+ characters)'},
      onCancel: () => resolve(null),
      onConfirm: (pw1) => {
        if(!pw1 || pw1.length < 8){ appAlert('Please use at least 8 characters.', {title:'Sync passphrase', onConfirm: () => resolve(null)}); return; }
        appConfirm('Type the passphrase again to confirm it.', {
          title:'Confirm passphrase', confirmLabel:'Create', danger:false,
          input:{type:'password', placeholder:'Passphrase again'},
          onCancel: () => resolve(null),
          onConfirm: (pw2) => {
            if(pw2 !== pw1){ appAlert('Those didn\'t match — nothing was set up.', {title:'Sync passphrase', onConfirm: () => resolve(null)}); return; }
            resolve(pw1);
          }
        });
      }
    });
  });
}
async function syncSendFile(){
  let meta = await syncMetaGet();
  let freshKey = false;
  if(!meta.salt || !meta.key){
    if(meta.salt && !meta.key){
      appAlert('This device can\'t remember the passphrase, so sending needs it to be set up again. Use Forget pairing in Sync, then try again.', {title:'Send to other device'});
      return;
    }
    const pw = await syncAskNewPassphrase();
    if(!pw) return;
    toast('Securing…');
    const salt = syncB64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await syncDeriveKey(pw, salt);
    meta = Object.assign({}, meta, {salt, key, base:null, peerDeviceId:null, lastPeerFileAt:0});
    freshKey = true;
  }
  const state = syncBuildState();
  const createdAt = Date.now();
  const header = {v:1, appVersion:APP_VERSION, createdAt, deviceId:syncDeviceId(), setId:createdAt.toString(36)};
  const d = new Date(createdAt);
  const stamp = `${todayISO()}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  const photos = await syncBuildPhotoFiles(syncPhotosToSend(meta), meta.key, meta.salt, header, stamp);
  const payload = Object.assign({}, header, {kind:'state', photoParts:photos.items.length, heldPhotoIds:syncHeldPhotoIds(), state});
  const items = [{text: await syncEncrypt(payload, meta.key, meta.salt), filename:`round-book-sync-${stamp}.json`, mime:'application/json'}].concat(photos.items);
  const finish = async () => {
    const ok = await deliverTextFiles(items, 'Round Book sync');
    if(!ok) return;
    // The first file this device sends is what the other device will start from, so
    // it is also the shared starting point for the first merge back.
    const latest = Object.assign({}, await syncMetaGet(), meta);
    if(!latest.base) latest.base = state;
    latest.lastExportAt = Date.now();
    latest.sentPhotos = Object.assign({}, latest.sentPhotos || {});
    photos.sentIds.forEach(id => { latest.sentPhotos[id] = createdAt; });
    await syncMetaSave(latest);
    const more = photos.remaining > 0 ? ` ${syncPlural(photos.remaining, 'more photo')} will follow — send again once the other device has received these.` : '';
    toast(items.length > 1
      ? `Sent the data plus ${syncPlural(photos.sentIds.length, 'photo')} in ${items.length-1} file${items.length===2?'':'s'}. On the other device, choose all the files together.${more}`
      : 'Sync file ready — open Round Book on your other device and tap Receive');
  };
  if(freshKey || items.length > 1){
    // Key stretching and photo preparation take a while; ask for one more tap so the
    // share sheet opens from a fresh tap.
    const mb = Math.max(1, Math.round(items.reduce((n, it) => n + it.text.length, 0) / 1048576));
    appConfirm(items.length > 1
      ? `Your sync files are ready: the data plus ${syncPlural(photos.sentIds.length, 'photo')} (about ${mb} MB). Send them all to your other device — AirDrop works well.${photos.remaining > 0 ? ` ${syncPlural(photos.remaining, 'more photo')} will follow next time.` : ''}`
      : 'Your sync file is ready. Send it to your other device (AirDrop works well).',
      {title:'Send to other device', confirmLabel:'Share', danger:false, onConfirm: finish});
  } else {
    await finish();
  }
}
// Safety valve: if photos went missing on the other device, offer them all again.
async function syncResendAllPhotos(){
  const meta = await syncMetaGet();
  if(!meta.salt){ toast('Nothing paired yet'); return; }
  await syncMetaSave(Object.assign({}, meta, {sentPhotos:{}, peerPhotoIds:[]}));
  toast('The next send will include every photo again');
}

/* ---------- receiving ---------- */
function syncAskPassphrase(){
  return new Promise(resolve => {
    appConfirm('Enter the sync passphrase you chose on the other device.', {
      title:'Sync passphrase', confirmLabel:'Unlock', danger:false,
      input:{type:'password', placeholder:'Passphrase'},
      onCancel: () => resolve(null),
      onConfirm: (pw) => resolve(pw || null)
    });
  });
}
async function syncReceiveFiles(fileList){
  const files = Array.from(fileList);
  const envs = [];
  for(const f of files){
    let env = null;
    try{ env = JSON.parse(await f.text()); }catch(e){}
    if(env && env.app === 'round-book-sync' && env.v === 1 && env.salt && env.iv && env.ct) envs.push(env);
  }
  if(!envs.length){
    appAlert('That isn\'t a Round Book sync file. (Backup files are restored from Backup & restore → Import backup.)', {title:'Receive from other device'});
    return;
  }
  const salt = envs[0].salt;
  if(envs.some(e => e.salt !== salt)){
    appAlert('Those files come from different sync set-ups, so they can\'t be received together. Choose just the files from one send.', {title:'Receive from other device'});
    return;
  }
  let meta = await syncMetaGet();
  const sameVault = !!meta.salt && meta.salt === salt;
  let key = sameVault ? meta.key : null;
  let first = key ? await syncDecrypt(envs[0], key) : null;
  if(!first){
    const pw = await syncAskPassphrase();
    if(!pw) return;
    toast('Unlocking…');
    key = await syncDeriveKey(pw, salt);
    first = await syncDecrypt(envs[0], key);
    if(!first){
      appAlert('That passphrase didn\'t unlock the files (or a file is damaged). Nothing was changed.', {title:'Receive from other device'});
      return;
    }
  }
  const payloads = [first];
  for(let i = 1; i < envs.length; i++){
    const p = await syncDecrypt(envs[i], key);
    if(!p){ appAlert('One of the files couldn\'t be read — it may be damaged. Nothing was changed.', {title:'Receive from other device'}); return; }
    payloads.push(p);
  }
  if(payloads.some(p => p.appVersion > APP_VERSION)){
    appAlert('Those files came from a newer version of Round Book. Close and reopen the app here to update it, then try again.', {title:'Receive from other device'});
    return;
  }
  if(payloads.some(p => p.deviceId === syncDeviceId())){
    appAlert('Those files were made on this device. Receive the files the other device sends.', {title:'Receive from other device'});
    return;
  }
  const photoPayloads = payloads.filter(p => p.kind === 'photos');
  const statePayloads = payloads.filter(p => p.kind !== 'photos' && p.state && p.createdAt).sort((a,b) => b.createdAt - a.createdAt);
  if(!photoPayloads.length && !statePayloads.length){
    appAlert('Those sync files are incomplete. Nothing was changed.', {title:'Receive from other device'});
    return;
  }
  // Photos first: they're additive and harmless, and the data merge below can then show them straight away.
  let photosStored = 0;
  if(photoPayloads.length){
    if(!photoStorageAvailable){
      appAlert('This device can\'t store photos right now, so the photos in these files were skipped.', {title:'Receive from other device'});
    } else {
      toast('Saving photos…');
      photosStored = await syncStoreReceivedPhotos(photoPayloads, meta);
    }
  }
  const photoNote = () => {
    const bits = [];
    if(photosStored) bits.push(syncPlural(photosStored, 'photo') + ' received');
    const missing = syncMissingPhotoCount();
    if(missing) bits.push(syncPlural(missing, 'photo') + ' still to come');
    return bits.length ? ' · ' + bits.join(' · ') : '';
  };
  if(!statePayloads.length){
    syncPrunePending(meta);
    await syncMetaSave(Object.assign({}, meta, {salt, key}));
    render();
    toast(photosStored ? `${syncPlural(photosStored, 'photo')} received` + photoNote().replace(/^ · \d+ photos? received/, '') : 'Those photos were already on this device');
    return;
  }
  const payload = statePayloads[0];
  const knownBase = sameVault ? meta.base : null;
  if(sameVault && meta.lastPeerFileAt && payload.createdAt <= meta.lastPeerFileAt){
    await syncMetaSave(Object.assign({}, meta, {salt, key}));
    render();
    appAlert('You\'ve already received this data, or newer data from the other device, so it was not merged again.' + (photosStored ? ` ${syncPlural(photosStored, 'photo')} from these files were saved.` : ''), {title:'Receive from other device'});
    return;
  }
  const remote = payload.state;
  const when = new Date(payload.createdAt).toLocaleString('en-GB', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  const commit = async (newData, doneToast) => {
    await takeSafetyCopy('Before syncing');
    data = migrateData(newData);
    await saveData();
    const next = Object.assign({}, meta, {
      salt, key, base: remote, peerDeviceId: payload.deviceId,
      lastPeerFileAt: payload.createdAt, lastSyncAt: Date.now()
    });
    if(Array.isArray(payload.heldPhotoIds)) next.peerPhotoIds = payload.heldPhotoIds;
    syncPrunePending(next);
    await syncMetaSave(next);
    closeSheet();
    render();
    toast(doneToast + photoNote());
  };
  const adopt = () => {
    const nd = Object.assign({}, data);
    nd.customers = syncClone(remote.customers || []);
    nd.oneOffJobs = syncClone(remote.oneOffJobs || []);
    nd.quotes = syncClone(remote.quotes || []);
    nd.mileageLog = syncClone(remote.mileageLog || []);
    nd.settings = syncClone(remote.settings || {});
    return nd;
  };
  if(syncLocalIsEmpty()){
    appConfirm(`Set this device up from the other device's data (${syncPlural((remote.customers||[]).length, 'customer')}, sent ${when})?`, {
      title:'Receive from other device', confirmLabel:'Set up this device', danger:false,
      onConfirm: () => commit(adopt(), `${syncPlural((remote.customers||[]).length, 'customer')} received`)
    });
    return;
  }
  if(!knownBase){
    appConfirm(`This device already has its own data and hasn't been synced with the other one before, so the two can't be safely merged. Replace everything here with the other device's data (${syncPlural((remote.customers||[]).length, 'customer')}, sent ${when})? A safety copy is saved first.`, {
      title:'Replace this device\'s data?', confirmLabel:'Replace', danger:true,
      onConfirm: () => commit(adopt(), 'This device now matches the other one')
    });
    return;
  }
  const ctx = {preferRemote: payload.deviceId > syncDeviceId()};
  const res = syncMergeStates(knownBase, syncBuildState(data), remote, ctx);
  const parts = syncSummaryText(res);
  const apply = () => {
    const nd = Object.assign({}, data);
    nd.customers = res.merged.customers; nd.oneOffJobs = res.merged.oneOffJobs; nd.quotes = res.merged.quotes;
    nd.mileageLog = res.merged.mileageLog; nd.settings = res.merged.settings;
    return nd;
  };
  if(!parts.length){
    await commit(apply(), 'Already up to date');
    return;
  }
  appConfirm(`Merge the other device's changes (sent ${when})? ${parts.join(' ')} A safety copy is saved first.`, {
    title:'Merge changes', confirmLabel:'Merge', danger:false,
    onConfirm: () => commit(apply(), 'Merged — devices are in step')
  });
}

/* ---------- the Sync screen ---------- */
function syncWhenText(ms){
  if(!ms) return 'never';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}) + ' · ' + d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
}
async function openSyncSheet(){
  const meta = await syncMetaGet();
  const paired = !!meta.salt;
  const missing = syncMissingPhotoCount();
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Sync with another device</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 14px;">
      Keep your phone and iPad in step with no internet account. One device makes encrypted files, you AirDrop them across, and the other device merges them in — data and photos. Nothing readable ever leaves your devices. When you receive, choose all the files from the send together.
    </p>
    <p style="color:var(--ink-muted); font-size:0.7812rem; font-weight:700; line-height:1.6; margin:0 2px 16px;">
      Last sent from this device: ${syncWhenText(meta.lastExportAt)}<br>
      Last received from the other device: ${syncWhenText(meta.lastPeerFileAt)}<br>
      ${paired ? '🔒 Passphrase set on this device' : 'No passphrase yet — you\'ll create one the first time you send'}
      ${missing ? `<br><span style="color:var(--amber);">${syncPlural(missing, 'photo')} on this device ${missing===1?'hasn\'t':'haven\'t'} arrived yet — ask the other device to send again</span>` : ''}
    </p>
    <button class="backup-btn" onclick="syncSendFile()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg>
      <div><div class="t1">Send to other device</div><div class="t2">Makes encrypted files (data and new photos) to AirDrop across</div></div>
    </button>
    <button class="backup-btn" onclick="document.getElementById('syncFile').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 12v8h14v-8"/></svg>
      <div><div class="t1">Receive from other device</div><div class="t2">Pick all the files you were sent and merge them in</div></div>
    </button>
    ${paired ? `<button class="btn btn-clean" style="width:100%; border:none; margin-top:6px;" onclick="syncResendAllPhotos()">Send every photo again next time</button>
    <button class="btn btn-clean" style="width:100%; border:none; margin-top:10px;" onclick="syncConfirmForget()">Forget pairing on this device</button>` : ''}
  `, () => openBackup());
}
function syncConfirmForget(){
  appConfirm('This device will forget the sync passphrase and what it knows about the other device. Your customers and data are not touched. To sync again you\'d set up the pairing again.', {
    title:'Forget pairing', confirmLabel:'Forget pairing',
    onConfirm: async () => {
      try{ await syncMetaPut({}); }catch(e){}
      toast('Pairing forgotten');
      openSyncSheet();
    }
  });
}
document.getElementById('syncFile').addEventListener('change', function(e){
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if(!files.length) return;
  syncReceiveFiles(files).catch(() => appAlert('Something went wrong reading those files. Nothing was changed.', {title:'Receive from other device'}));
});
