/* 08b-sync.js -- the engine behind live sync (08c-live-sync.js): the encryption, the three-way merge and the photo
   bookkeeping, plus the Live sync screen. (There used to be a send-a-file / receive-a-file version of sync for AirDrop;
   live sync and password-protected backups replaced it.)
   Part of Round Book's split JS bundle; loaded in numeric order from index.html.

   How the merge works (three-way): each device remembers the last state it received from the other one (the "base").
   On the next sync it compares base / this device / the incoming data:
     - only one side changed something  -> take that change
     - both changed different things    -> keep both
     - both changed the SAME field      -> a clash: live sync asks the person (see 08c-live-sync.js)
     - lists inside a customer (cleans, payments, messages...) are merged entry by entry, so
       a clean marked on the phone and a note typed on the iPad both survive.
   A safety copy is always taken first. */

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
  if(typeof liveForgetBase === 'function'){ try{ await liveForgetBase(); }catch(e){} }
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
  if(a === b) return true;
  // Quick check first: identical plain text means identical. Only when that differs (it can also differ
  // just because keys are in another order) do we do the slower sorted comparison.
  try{ if(JSON.stringify(a) === JSON.stringify(b)) return true; }catch(e){}
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
  if((key === 'purgeOn' || key === 'retainedOn') && typeof local === 'string' && typeof remote === 'string') return local > remote ? local : remote; // privacy dates (08f-privacy.js): never a clash, the later one wins
  if(typeof local === 'number' && typeof remote === 'number' && (key === 'nextAccountNumber' || /Count$/.test(key))) return Math.max(local, remote);
  // One side blank, the other filled in: that isn't really a clash, keep what's filled in.
  const blank = v => v === undefined || v === null || v === '';
  if(blank(local)) return remote;
  if(blank(remote)) return local;
  ctx.clashes.push({label: ctx.label, field: path.join(' › '), coll: ctx.coll, key: ctx.itemKey == null ? null : ctx.itemKey, path: path.slice(), local: syncClone(local), remote: syncClone(remote)});
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
      ctx.itemKey = k;
      const merged = syncMerge3(b || {}, l, r, ctx, []);
      if(merged !== l && !syncEq(merged, l)) bucket.updated++;
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
  ctx.coll = 'customers';
  const customers = syncMergeCollection(base.customers, local.customers, remote.customers, byId, nameOf, ctx, stats.customers);
  ctx.coll = 'oneOffJobs';
  const jobs = syncMergeCollection(base.oneOffJobs, local.oneOffJobs, remote.oneOffJobs, byId, nameOf, ctx, stats.oneOffJobs);
  ctx.coll = 'quotes';
  const quotes = syncMergeCollection(base.quotes, local.quotes, remote.quotes, byId, nameOf, ctx, stats.quotes);
  ctx.coll = 'mileageLog';
  const mileage = syncMergeCollection(base.mileageLog, local.mileageLog, remote.mileageLog, x => x.date, x => x.date, ctx, stats.mileageLog);
  // Settings: the campaign list is merged entry by entry, everything else field by field.
  const split = s => { const o = Object.assign({}, s || {}); const camps = o.marketingCampaigns; delete o.marketingCampaigns; return {o, camps: camps || []}; };
  const sb = split(base.settings), sl = split(local.settings), sr = split(remote.settings);
  ctx.label = 'Settings'; ctx.coll = 'settings'; ctx.itemKey = null;
  const settings = syncClone(syncMerge3(sb.o, sl.o, sr.o, ctx, [])) || {};
  const campBucket = syncNewBucket();
  ctx.coll = 'campaigns';
  settings.marketingCampaigns = syncMergeCollection(sb.camps, sl.camps, sr.camps, x => x.id, x => x.name || x.id, ctx, campBucket);
  // Notes between the devices (08e-messages.js) travel inside settings but aren't a settings change.
  const noMsgs = s => { const o = Object.assign({}, s || {}); delete o.deviceMessages; return o; };
  stats.settingsChanged = !syncEq(noMsgs(settings), noMsgs(local.settings));
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
   The pictures live in their own IndexedDB store, apart from the data. */
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
// Stores photos received from the other device. Protected from the orphan clean-up for two
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
/* ---------- passphrase prompts (used by live sync) ---------- */
function syncAskNewPassphrase(){
  return new Promise(resolve => {
    appConfirm('Choose a passphrase to protect your synced data. Make it long — four random words is good. You\'ll type it once on each of your other devices. It can\'t be recovered if you lose it.', {
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
function syncAskPassphrase(){
  return new Promise(resolve => {
    appConfirm('Enter the sync passphrase you chose on your first device.', {
      title:'Sync passphrase', confirmLabel:'Unlock', danger:false,
      input:{type:'password', placeholder:'Passphrase'},
      onCancel: () => resolve(null),
      onConfirm: (pw) => resolve(pw || null)
    });
  });
}

/* ---------- the Sync screen ---------- */
// The Live sync screen (More > Live sync, and the cloud chip at the top of the screen).
async function openSyncSheet(){
  const meta = await syncMetaGet();
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Live sync</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">✕</button>
    </div>
    ${liveSyncSectionHtml(meta)}
  `, () => openBackup());
}
