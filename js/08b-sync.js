/* 08b-sync.js -- Sync between two of your own devices (e.g. phone <-> iPad) with no server.
   One device builds an ENCRYPTED file (AirDrop / Messages / Files), the other receives it and
   MERGES it with what it already has. Photos are not synced.
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
async function syncEncrypt(obj, key, saltB64){
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  let bytes = raw, z = 0;
  if(typeof CompressionStream !== 'undefined'){
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
function syncOmitPhotos(rec){
  if(!rec || typeof rec !== 'object' || !('photos' in rec)) return rec;
  const copy = Object.assign({}, rec);
  delete copy.photos;
  return copy;
}
// keepPhotos: true when building THIS device's side of a merge (its own photo references
// must survive); false for the file that goes to the other device.
function syncBuildState(src, keepPhotos){
  src = src || data;
  const strip = r => keepPhotos ? r : syncOmitPhotos(r);
  return {
    customers: (src.customers||[]).map(c => syncClone(strip(c))),
    oneOffJobs: (src.oneOffJobs||[]).map(j => syncClone(strip(j))),
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
function syncMergeCollection(baseArr, localArr, remoteArr, keyOf, labelOf, ctx, bucket, hasPhotos){
  const index = a => { const m = new Map(); (a||[]).forEach(x => m.set(keyOf(x), x)); return m; };
  const B = index(baseArr), L = index(localArr), R = index(remoteArr);
  const keys = [], seen = new Set();
  (localArr||[]).concat(remoteArr||[]).forEach(x => { const k = keyOf(x); if(!seen.has(k)){ seen.add(k); keys.push(k); } });
  const out = [];
  keys.forEach(k => {
    const b = B.get(k), l = L.get(k), r = R.get(k);
    const ls = l ? syncOmitPhotos(l) : undefined;
    const bs = b ? syncOmitPhotos(b) : undefined;
    if(l && r){
      ctx.label = labelOf(l) || labelOf(r);
      const merged = syncMerge3(bs || {}, ls, r, ctx, []);
      const rec = syncClone(merged);
      if(hasPhotos) rec.photos = l.photos || [];
      if(!syncEq(merged, ls)) bucket.updated++;
      out.push(rec);
    } else if(l){
      if(b){
        if(syncEq(bs, ls)) bucket.removed++;   // deleted on the other device, untouched here
        else { out.push(l); bucket.kept++; }   // edited here after it was deleted there: keep it
      } else out.push(l);                      // added here
    } else if(r){
      if(b){
        if(!syncEq(b, r)){ const rec = syncClone(r); if(hasPhotos) rec.photos = []; out.push(rec); bucket.restored++; }
        // else: deleted here and untouched there — stays deleted
      } else { const rec = syncClone(r); if(hasPhotos) rec.photos = []; out.push(rec); bucket.added++; }
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
  const customers = syncMergeCollection(base.customers, local.customers, remote.customers, byId, nameOf, ctx, stats.customers, true);
  const jobs = syncMergeCollection(base.oneOffJobs, local.oneOffJobs, remote.oneOffJobs, byId, nameOf, ctx, stats.oneOffJobs, true);
  const quotes = syncMergeCollection(base.quotes, local.quotes, remote.quotes, byId, nameOf, ctx, stats.quotes, false);
  const mileage = syncMergeCollection(base.mileageLog, local.mileageLog, remote.mileageLog, x => x.date, x => x.date, ctx, stats.mileageLog, false);
  // Settings: the campaign list is merged entry by entry, everything else field by field.
  const split = s => { const o = Object.assign({}, s || {}); const camps = o.marketingCampaigns; delete o.marketingCampaigns; return {o, camps: camps || []}; };
  const sb = split(base.settings), sl = split(local.settings), sr = split(remote.settings);
  ctx.label = 'Settings';
  const settings = syncClone(syncMerge3(sb.o, sl.o, sr.o, ctx, [])) || {};
  const campBucket = syncNewBucket();
  settings.marketingCampaigns = syncMergeCollection(sb.camps, sl.camps, sr.camps, x => x.id, x => x.name || x.id, ctx, campBucket, false);
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
  const payload = {v:1, appVersion:APP_VERSION, createdAt:Date.now(), deviceId:syncDeviceId(), state};
  const fileText = await syncEncrypt(payload, meta.key, meta.salt);
  const d = new Date();
  const stamp = `${todayISO()}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  const filename = `round-book-sync-${stamp}.json`;
  const finish = async () => {
    const ok = await deliverTextFile(fileText, filename, 'application/json', 'Round Book sync file');
    if(!ok) return;
    // The first file this device sends is what the other device will start from, so
    // it is also the shared starting point for the first merge back.
    const latest = Object.assign({}, await syncMetaGet(), meta);
    if(!latest.base) latest.base = state;
    latest.lastExportAt = Date.now();
    await syncMetaSave(latest);
    toast('Sync file ready — open Round Book on your other device and tap Receive');
  };
  if(freshKey){
    // Key stretching takes a moment; ask for one more tap so the share sheet opens from a fresh tap.
    appConfirm('Your sync file is ready. Send it to your other device (AirDrop works well).', {title:'Send to other device', confirmLabel:'Share file', danger:false, onConfirm: finish});
  } else {
    await finish();
  }
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
async function syncReceiveFile(file){
  let env = null;
  try{ env = JSON.parse(await file.text()); }catch(e){}
  if(!env || env.app !== 'round-book-sync' || env.v !== 1 || !env.salt || !env.iv || !env.ct){
    appAlert('That isn\'t a Round Book sync file. (Backup files are restored from Backup & restore → Import backup.)', {title:'Receive from other device'});
    return;
  }
  let meta = await syncMetaGet();
  const sameVault = !!meta.salt && meta.salt === env.salt;
  let key = sameVault ? meta.key : null;
  let payload = key ? await syncDecrypt(env, key) : null;
  if(!payload){
    const pw = await syncAskPassphrase();
    if(!pw) return;
    toast('Unlocking…');
    key = await syncDeriveKey(pw, env.salt);
    payload = await syncDecrypt(env, key);
    if(!payload){
      appAlert('That passphrase didn\'t unlock the file (or the file is damaged). Nothing was changed.', {title:'Receive from other device'});
      return;
    }
  }
  if(!payload.state || !payload.createdAt){
    appAlert('That sync file is incomplete. Nothing was changed.', {title:'Receive from other device'});
    return;
  }
  if(payload.appVersion > APP_VERSION){
    appAlert('That file came from a newer version of Round Book. Close and reopen the app here to update it, then try again.', {title:'Receive from other device'});
    return;
  }
  if(payload.deviceId === syncDeviceId()){
    appAlert('That file was made on this device. Receive the file the other device sends.', {title:'Receive from other device'});
    return;
  }
  const knownBase = sameVault ? meta.base : null;
  if(sameVault && meta.lastPeerFileAt && payload.createdAt <= meta.lastPeerFileAt){
    appAlert('You\'ve already received this file, or a newer one from the other device. Nothing was changed.', {title:'Receive from other device'});
    return;
  }
  const remote = payload.state;
  const when = new Date(payload.createdAt).toLocaleString('en-GB', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  const commit = async (newData, doneToast) => {
    await takeSafetyCopy('Before syncing');
    data = migrateData(newData);
    await saveData();
    await syncMetaSave(Object.assign({}, meta, {
      salt: env.salt, key, base: remote, peerDeviceId: payload.deviceId,
      lastPeerFileAt: payload.createdAt, lastSyncAt: Date.now()
    }));
    closeSheet();
    render();
    toast(doneToast);
  };
  const baseOther = () => { const o = Object.assign({}, data); return o; };
  const adopt = () => {
    const nd = baseOther();
    nd.customers = remote.customers.map(c => Object.assign({}, syncClone(c), {photos: []}));
    nd.oneOffJobs = remote.oneOffJobs.map(j => Object.assign({}, syncClone(j), {photos: []}));
    nd.quotes = syncClone(remote.quotes || []);
    nd.mileageLog = syncClone(remote.mileageLog || []);
    nd.settings = syncClone(remote.settings || {});
    return nd;
  };
  if(syncLocalIsEmpty()){
    appConfirm(`Set this device up from the other device's data (${syncPlural(remote.customers.length, 'customer')}, sent ${when})?`, {
      title:'Receive from other device', confirmLabel:'Set up this device', danger:false,
      onConfirm: () => commit(adopt(), `${syncPlural(remote.customers.length, 'customer')} received`)
    });
    return;
  }
  if(!knownBase){
    appConfirm(`This device already has its own data and hasn't been synced with the other one before, so the two can't be safely merged. Replace everything here with the other device's data (${syncPlural(remote.customers.length, 'customer')}, sent ${when})? Photos on this device would be removed. A safety copy is saved first.`, {
      title:'Replace this device\'s data?', confirmLabel:'Replace', danger:true,
      onConfirm: () => commit(adopt(), 'This device now matches the other one')
    });
    return;
  }
  const ctx = {preferRemote: payload.deviceId > syncDeviceId()};
  const res = syncMergeStates(knownBase, syncBuildState(data, true), remote, ctx);
  const parts = syncSummaryText(res);
  const apply = () => {
    const nd = baseOther();
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
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Sync with another device</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8438rem; line-height:1.5; margin:0 2px 14px;">
      Keep your phone and iPad in step with no internet account. One device makes an encrypted file, you AirDrop it across, and the other device merges it in. Nothing readable ever leaves your devices. Photos aren't included.
    </p>
    <p style="color:var(--ink-muted); font-size:0.7812rem; font-weight:700; line-height:1.6; margin:0 2px 16px;">
      Last sent from this device: ${syncWhenText(meta.lastExportAt)}<br>
      Last received from the other device: ${syncWhenText(meta.lastPeerFileAt)}<br>
      ${paired ? '🔒 Passphrase set on this device' : 'No passphrase yet — you\'ll create one the first time you send'}
    </p>
    <button class="backup-btn" onclick="syncSendFile()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg>
      <div><div class="t1">Send to other device</div><div class="t2">Makes an encrypted file to AirDrop across</div></div>
    </button>
    <button class="backup-btn" onclick="document.getElementById('syncFile').click()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 12v8h14v-8"/></svg>
      <div><div class="t1">Receive from other device</div><div class="t2">Pick the file you were sent and merge it in</div></div>
    </button>
    ${paired ? `<button class="btn btn-clean" style="width:100%; border:none; margin-top:6px;" onclick="syncConfirmForget()">Forget pairing on this device</button>` : ''}
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
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  syncReceiveFile(file).catch(() => appAlert('Something went wrong reading that file. Nothing was changed.', {title:'Receive from other device'}));
});
