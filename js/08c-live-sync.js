/* 08c-live-sync.js -- Live sync: keeps two devices in step through a small "mailbox" on the
   person's OWN free Cloudflare account (see cloudflare-worker.js). Everything is encrypted
   on the device first, so the mailbox only ever holds scrambled data.
   It reuses the AirDrop sync engine in 08b-sync.js (encryption, three-way merge, photo
   storage) — only the transport is new. Loaded after 08b-sync.js, before 09-boot.js.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

// Paste your Cloudflare address here once (e.g. 'https://round-book-sync.yourname.workers.dev')
// and it never needs typing on any device. Left empty, the app asks for it during set-up.
const LIVE_SYNC_DEFAULT_URL = '';

const LIVE_POLL_MS = 60*1000;
const LIVE_PUSH_DELAY_MS = 20*1000;        // wait this long after an edit before sending
const LIVE_PUSH_MIN_GAP_MS = 45*1000;      // never send more often than this
const LIVE_PUSH_MAX_WAIT_MS = 60*1000;     // ...but always within this of the first unsent edit
const LIVE_DAILY_PUSH_CAP = 150;           // per device; the free plan allows ~1000 writes a day in total
const LIVE_RUNAWAY_PUSHES = 20;            // this many sends in 10 minutes means something is looping
const LIVE_PHOTO_UP_BYTES = 12*1024*1024;
const LIVE_PHOTO_UP_COUNT = 15;
const LIVE_PHOTO_DOWN_COUNT = 10;
const LIVE_DAILY_PHOTO_CAP = 150;
const LIVE_PHOTO_RECHECK_MS = 45*24*3600*1000; // cloud copies expire after 60 days
const LIVE_SAFETY_EVERY_MS = 6*3600*1000;

let liveActive = false, liveWired = false;
let liveChain = Promise.resolve(), liveQueued = false;
let livePushTimer = null, liveFirstDirtyAt = 0, liveLastPushAt = 0;
let livePushTimes = [];
let liveApplying = false;
const liveMem = { key: null };
const liveNotYet = new Map();              // photo id -> when the cloud last said "not there yet"
let liveStatus = { state: 'off', text: '', okAt: 0 };

/* ---------- small helpers ---------- */
function liveDay(){ return new Date().toISOString().slice(0,10); } // UTC, matching Cloudflare's daily reset
function liveHex(u8){ return Array.from(u8, b => b.toString(16).padStart(2,'0')).join(''); }
function liveRun(fn){
  const run = liveChain.then(() => fn());
  liveChain = run.catch(() => {});
  return run;
}
function liveUiBusy(){
  const ov = document.getElementById('overlay'), rp = document.getElementById('reportPreview'), sc = document.getElementById('schedEditor');
  return !!((ov && ov.classList.contains('show')) || (rp && rp.classList.contains('show')) || (sc && sc.classList.contains('show')));
}
async function liveHashState(state){
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(syncStable(state)));
  return liveHex(new Uint8Array(d));
}
function liveAgo(ts){
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if(s < 60) return 'just now';
  if(s < 3600) return Math.round(s/60) + 'm ago';
  if(s < 86400) return Math.round(s/3600) + 'h ago';
  return new Date(ts).toLocaleDateString('en-GB', {day:'numeric', month:'short'});
}

/* ---------- stored settings (kept in the sync database, alongside the AirDrop pairing) ---------- */
async function liveMeta(){ const m = await syncMetaGet(); return m.live || null; }
async function liveSave(meta, live){
  try{ await syncMetaPut(Object.assign({}, meta, { live })); }
  catch(e){
    // Some browsers can't store the key object — keep it in memory and ask again next launch.
    try{ await syncMetaPut(Object.assign({}, meta, { live: Object.assign({}, live, { key: null }) })); }catch(e2){}
  }
}
// Read-modify-write of just the live settings. patch is an object, or a function of the current settings.
async function liveUpdate(patch){
  const meta = await syncMetaGet();
  const cur = meta.live || {};
  const live = Object.assign({}, cur, typeof patch === 'function' ? patch(cur) : patch);
  await liveSave(meta, live);
  return live;
}

/* ---------- status + header chip ---------- */
function liveSetStatus(state, text){
  liveStatus.state = state;
  liveStatus.text = text || '';
  if(state === 'ok') liveStatus.okAt = Date.now();
  liveRefreshChip();
}
function liveChipText(){
  const s = liveStatus;
  switch(s.state){
    case 'off': return '';
    case 'syncing': return '⟳ Syncing…';
    case 'offline': return '☁️ Offline — will sync when back';
    case 'error': return '⚠ Sync problem — tap for details';
    case 'locked': return '🔒 Tap to unlock live sync';
    case 'attention': return '⚠ Sync needs your attention';
    case 'waiting': return '☁️ Live sync on — waiting for other device';
    default: return s.okAt ? `☁️ Synced ${liveAgo(s.okAt)}` : '☁️ Live sync on';
  }
}
function liveRefreshChip(){
  const el = document.getElementById('liveSyncChip');
  if(!el) return;
  const t = liveActive ? liveChipText() : '';
  el.textContent = t;
  el.hidden = !t;
}

/* ---------- talking to the mailbox ---------- */
async function liveApi(live, method, path, body){
  const base = String(live.url || '').replace(/\/+$/, '');
  const headers = {};
  if(body != null) headers['Content-Type'] = 'text/plain';
  if(method === 'PUT' || method === 'DELETE') headers['X-Write-Token'] = live.token;
  const res = await fetch(`${base}/v1/${live.roomId}${path}`, { method, headers, body: body != null ? body : undefined, cache: 'no-store' });
  const text = await res.text();
  let json = null;
  try{ json = JSON.parse(text); }catch(e){}
  return { ok: res.ok, status: res.status, json };
}
// Turns a failed reply into a status; returns after setting it.
async function liveFail(res){
  if(res.status === 503 && res.json && res.json.error === 'limit'){
    const next = new Date(); next.setUTCHours(24, 0, 5, 0);
    await liveUpdate({ pausedUntil: next.getTime() });
    liveSetStatus('error', 'Cloudflare\'s free daily allowance has been reached — live sync resumes automatically tomorrow.');
  } else if(res.status === 403){
    liveSetStatus('error', 'The mailbox refused this device (passphrase mismatch). Turn live sync off here and set it up again.');
  } else if(res.status === 409){
    liveSetStatus('error', 'The mailbox already has the maximum number of devices.');
  } else if(res.status === 413){
    liveSetStatus('error', 'Your data is too large for the mailbox.');
  } else {
    liveSetStatus('error', `The mailbox returned an error (${res.status}). It will keep trying.`);
  }
}
// Derives the room name and write token from the passphrase. Deliberately slow (same as the
// encryption key) so guessing passphrases from the room name is expensive.
async function liveDeriveRoom(passphrase){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:new TextEncoder().encode('round-book-live-room-v1'), iterations:SYNC_KDF_ITERATIONS, hash:'SHA-256' }, km, 384);
  const u = new Uint8Array(bits);
  return { roomId: liveHex(u.slice(0,16)), token: liveHex(u.slice(16,48)) };
}

/* ---------- pulling in the other device's changes ---------- */
function liveHeadPeer(devs){
  const me = syncDeviceId();
  const others = Object.keys(devs).filter(id => id !== me).sort((a,b) => (devs[b].updatedAt||0) - (devs[a].updatedAt||0));
  return others.length ? others[0] : null;
}
function liveAdoptState(remote){
  const nd = Object.assign({}, data);
  nd.customers = JSON.parse(JSON.stringify(remote.customers || []));
  nd.oneOffJobs = JSON.parse(JSON.stringify(remote.oneOffJobs || []));
  nd.quotes = JSON.parse(JSON.stringify(remote.quotes || []));
  nd.settings = JSON.parse(JSON.stringify(remote.settings || {}));
  nd.mileageLog = JSON.parse(JSON.stringify(remote.mileageLog || []));
  return nd;
}
async function liveSafetyCopyMaybe(live){
  if(Date.now() - (live.lastSafetyAt || 0) < LIVE_SAFETY_EVERY_MS) return;
  try{ await takeSafetyCopy('Before live sync'); }catch(e){}
  await liveUpdate({ lastSafetyAt: Date.now() });
}
// Replaces this device's data with the other device's (set-up / re-join / after a restore).
async function liveApplyAdopt(live, payload, headAt){
  await liveSafetyCopyMaybe(live);
  liveApplying = true;
  try{
    data = migrateData(liveAdoptState(payload.state));
    await saveData();
  } finally { liveApplying = false; }
  await liveUpdate({
    base: payload.state, peerDeviceId: payload.deviceId, lastPeerCreatedAt: payload.createdAt,
    seenHeadAt: headAt, lastPullAt: Date.now(), lastPushHash: null, lastSummary: 'Set up from the other device'
  });
  render();
}

// Returns { ok, more }. ok = reached the mailbox and nothing needs attention.
async function livePullInner(opts){
  opts = opts || {};
  let live = await liveMeta();
  if(!live || !live.enabled) return { ok:false };
  const key = live.key || liveMem.key;
  if(!key){ liveSetStatus('locked'); return { ok:false }; }
  if(live.pausedUntil && Date.now() < live.pausedUntil){ return { ok:false }; }
  if(!navigator.onLine){ liveSetStatus('offline'); return { ok:false }; }
  let head;
  try{ head = await liveApi(live, 'GET', '/head'); }catch(e){ liveSetStatus('offline'); return { ok:false }; }
  if(!head.ok){ await liveFail(head); return { ok:false }; }
  const devs = (head.json && head.json.devices) || {};
  const peerId = liveHeadPeer(devs);
  if(!peerId){ if(liveStatus.state !== 'ok') liveSetStatus('waiting'); return { ok:true, waiting:true }; }
  const headAt = devs[peerId].updatedAt || 0;
  if(live.base == null && !syncLocalIsEmpty() && !opts.adopt){
    liveSetStatus('attention', 'This device\'s data can\'t be merged automatically yet. Open Backup → Sync → Live sync and choose what to do.');
    return { ok:false };
  }
  let more = false;
  if(!(live.seenHeadAt === headAt && live.peerDeviceId === peerId)){
    let st;
    try{ st = await liveApi(live, 'GET', '/state/' + peerId); }catch(e){ liveSetStatus('offline'); return { ok:false }; }
    if(!st.ok){ if(st.status === 404) return { ok:true }; await liveFail(st); return { ok:false }; }
    const env = st.json;
    if(!env || env.app !== 'round-book-sync'){ return { ok:true }; }
    if(env.salt !== live.salt){
      liveSetStatus('error', 'Live sync was set up again on the other device. Turn it off here, then use "Join" to reconnect.');
      return { ok:false };
    }
    const payload = await syncDecrypt(env, key);
    if(!payload || !payload.state){
      liveSetStatus('error', 'Couldn\'t read the other device\'s data — check both devices use the same passphrase.');
      return { ok:false };
    }
    if(payload.appVersion && payload.appVersion > APP_VERSION){
      liveSetStatus('error', 'The other device has a newer version of Round Book. Close and reopen the app here to update, then sync will continue.');
      return { ok:false };
    }
    // Cloudflare can briefly serve an older copy; wait for the next check rather than going backwards.
    if(live.peerDeviceId === payload.deviceId && live.lastPeerCreatedAt && payload.createdAt <= live.lastPeerCreatedAt){
      return { ok:true };
    }
    const r = await liveMergeIn(live, payload, headAt, opts);
    if(r === 'deferred') return { ok:true };
    live = await liveMeta();
  }
  const pp = await livePullPhotos(live, key);
  more = pp.more;
  if(pp.stored){ render(); }
  return { ok:true, more };
}

async function liveMergeIn(live, payload, headAt, opts){
  const remote = payload.state;
  const local = syncBuildState(data);
  const markers = { peerDeviceId: payload.deviceId, lastPeerCreatedAt: payload.createdAt, seenHeadAt: headAt, lastPullAt: Date.now() };
  // Never replace what's on screen while a form or sheet is open — try again on the next check.
  if(liveUiBusy() && !opts.force) return 'deferred';

  if(live.base == null){
    // Only reachable when this device holds no data (see livePullInner) — nothing to lose.
    await liveApplyAdopt(live, payload, headAt);
    toast('Live sync: set up from your other device');
    return 'adopted';
  }
  const ctx = { preferRemote: payload.deviceId > syncDeviceId() };
  const res = syncMergeStates(live.base, local, remote, ctx);
  const m = res.merged;
  const same = syncEq(m.customers, local.customers) && syncEq(m.oneOffJobs, local.oneOffJobs) &&
               syncEq(m.quotes, local.quotes) && syncEq(m.settings, local.settings) && syncEq(m.mileageLog, local.mileageLog);
  let summary = '';
  if(!same){
    await liveSafetyCopyMaybe(live);
    const nd = Object.assign({}, data);
    nd.customers = m.customers; nd.oneOffJobs = m.oneOffJobs; nd.quotes = m.quotes;
    nd.settings = m.settings; nd.mileageLog = m.mileageLog;
    liveApplying = true;
    try{
      data = migrateData(nd);
      await saveData();
    } finally { liveApplying = false; }
    const parts = syncSummaryText(res);
    summary = parts.join(' · ');
    toast('Synced from your other device' + (parts.length ? ': ' + parts[0] : '') + (res.clashes.length ? ` (${res.clashes.length} clash${res.clashes.length===1?'':'es'} sorted automatically)` : ''));
    render();
  }
  // If the merged result is exactly what the other device already has, there is nothing to send back.
  let lastPushHash = live.lastPushHash;
  try{
    const mine = await liveHashState(syncBuildState(data));
    if(mine === await liveHashState(remote)) lastPushHash = mine;
  }catch(e){}
  await liveUpdate(Object.assign({ base: remote, lastPushHash, lastSummary: summary || live.lastSummary || '' }, markers));
  return same ? 'nochange' : 'merged';
}

/* ---------- photos ---------- */
async function livePullPhotos(live, key){
  const out = { stored:0, more:false };
  if(!photoStorageAvailable) return out;
  const refs = new Set();
  (data.customers||[]).forEach(c => (c.photos||[]).forEach(p => refs.add(p.id)));
  (data.oneOffJobs||[]).forEach(j => (j.photos||[]).forEach(p => refs.add(p.id)));
  const missing = [...refs].filter(id => !photoUrlCache.has(id));
  if(!missing.length) return out;
  const payloads = [];
  let tried = 0;
  for(const id of missing){
    const lastNo = liveNotYet.get(id);
    if(lastNo && Date.now() - lastNo < 5*60*1000) continue;
    if(tried >= LIVE_PHOTO_DOWN_COUNT){ out.more = true; break; }
    tried++;
    let r;
    try{ r = await liveApi(live, 'GET', '/photo/' + id); }catch(e){ break; }
    if(r.status === 404){ liveNotYet.set(id, Date.now()); continue; }
    if(!r.ok) break;
    const p = await syncDecrypt(r.json, key);
    if(p && p.b64) payloads.push({ photos: [p] });
  }
  if(payloads.length){
    const meta = await syncMetaGet();
    const stored = await syncStoreReceivedPhotos(payloads, meta);
    if(meta.live) await liveSave(meta, meta.live); else await syncMetaSave(meta);
    out.stored = (typeof stored === 'number') ? stored : payloads.length;
  }
  return out;
}
async function liveUploadPhotos(live, key){
  const day = liveDay();
  let count = live.photoDay === day ? (live.photoCount || 0) : 0;
  const uploaded = Object.assign({}, live.uploaded || {});
  const now = Date.now();
  const ids = syncHeldPhotoIds().filter(id => !uploaded[id] || now - uploaded[id] > LIVE_PHOTO_RECHECK_MS);
  if(!ids.length) return { more:false };
  const need = [];
  for(let i = 0; i < ids.length; i += 150){
    const chunk = ids.slice(i, i + 150);
    const r = await liveApi(live, 'POST', '/photos/missing', JSON.stringify({ ids: chunk }));
    if(!r.ok){ await liveFail(r); return { more:false, failed:true }; }
    const miss = new Set((r.json && r.json.missing) || []);
    chunk.forEach(id => { if(miss.has(id)) need.push(id); else uploaded[id] = now; });
  }
  let bytes = 0, n = 0, more = false;
  for(const id of need){
    if(bytes >= LIVE_PHOTO_UP_BYTES || n >= LIVE_PHOTO_UP_COUNT){ more = true; break; }
    if(count >= LIVE_DAILY_PHOTO_CAP){ more = false; break; }
    let blob = null;
    try{ blob = await idbGetPhoto(id); }catch(e){}
    if(!blob) continue;
    const b64 = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    const text = await syncEncrypt({ id, type: blob.type || 'image/jpeg', b64 }, key, live.salt, { compress:false });
    const r = await liveApi(live, 'PUT', '/photo/' + id, text);
    if(!r.ok){ await liveFail(r); break; }
    uploaded[id] = Date.now(); bytes += blob.size; n++; count++;
  }
  await liveUpdate({ uploaded, photoDay: day, photoCount: count });
  return { more };
}

/* ---------- sending our changes ---------- */
async function livePushInner(opts){
  opts = opts || {};
  const live = await liveMeta();
  if(!live || !live.enabled) return { ok:false };
  const key = live.key || liveMem.key;
  if(!key || live.base == null) return { ok:false };
  if(live.pausedUntil && Date.now() < live.pausedUntil) return { ok:false };
  if(!navigator.onLine){ liveSetStatus('offline'); return { ok:false }; }
  const state = syncBuildState(data);
  const hash = await liveHashState(state);
  if(opts.force || hash !== live.lastPushHash){
    const day = liveDay(), now = Date.now();
    const used = live.pushDay === day ? (live.pushCount || 0) : 0;
    if(used >= LIVE_DAILY_PUSH_CAP){
      liveSetStatus('error', 'This device has reached its daily live-sync limit (it protects your free Cloudflare allowance). It resumes tomorrow.');
      return { ok:false };
    }
    livePushTimes = livePushTimes.filter(t => now - t < 10*60*1000);
    if(livePushTimes.length >= LIVE_RUNAWAY_PUSHES){
      await liveUpdate({ pausedUntil: now + 30*60*1000 });
      liveSetStatus('error', 'Live sync paused for 30 minutes because the devices kept updating each other. It will retry automatically.');
      return { ok:false };
    }
    const payload = { v:1, appVersion: APP_VERSION, createdAt: now, deviceId: syncDeviceId(), setId: now.toString(36), kind:'state', state };
    const text = await syncEncrypt(payload, key, live.salt);
    let res;
    try{ res = await liveApi(live, 'PUT', '/state/' + syncDeviceId(), text); }catch(e){ liveSetStatus('offline'); return { ok:false }; }
    if(!res.ok){ await liveFail(res); return { ok:false }; }
    livePushTimes.push(now);
    liveLastPushAt = now;
    await liveUpdate({ lastPushHash: hash, lastPushAt: now, pushDay: day, pushCount: used + 1 });
  }
  let up;
  try{ up = await liveUploadPhotos(await liveMeta(), key); }catch(e){ liveSetStatus('offline'); return { ok:false }; }
  if(up.failed) return { ok:false };
  return { ok:true, more: up.more };
}

/* ---------- running a cycle ---------- */
function liveSyncNow(opts){
  opts = opts || {};
  if(!liveActive) return Promise.resolve();
  if(liveQueued && !opts.force) return liveChain;
  liveQueued = true;
  return liveRun(async () => {
    liveQueued = false;
    if(!liveActive) return;
    const prev = { state: liveStatus.state, text: liveStatus.text };
    liveSetStatus('syncing');
    let more = false, allOk = false, waiting = false;
    try{
      const pull = await livePullInner(opts);
      if(pull.ok){
        waiting = !!pull.waiting;
        const push = await livePushInner(opts);
        if(push.ok){ allOk = true; more = !!(pull.more || push.more); }
      }
    }catch(e){
      liveSetStatus('error', 'Live sync hit a problem: ' + ((e && e.message) || e));
    }
    if(liveStatus.state === 'syncing'){
      // Nothing reported a problem this time round. If nothing succeeded either (for example
      // while paused), put back whatever was showing before rather than claiming success.
      if(allOk) liveSetStatus(waiting ? 'waiting' : 'ok');
      else if(prev.state !== 'ok' && prev.state !== 'syncing' && prev.state !== 'waiting') liveSetStatus(prev.state, prev.text);
      else liveSetStatus('ok');
    }
    if(more) setTimeout(() => liveSyncNow(), 3000);
  });
}
// Called after every save (see the saveData wrapper below).
function liveNoteChange(){
  if(!liveActive) return;
  if(!liveFirstDirtyAt) liveFirstDirtyAt = Date.now();
  clearTimeout(livePushTimer);
  const sinceLast = Date.now() - liveLastPushAt;
  const wait = Math.max(LIVE_PUSH_DELAY_MS, LIVE_PUSH_MIN_GAP_MS - sinceLast);
  const cap = Math.max(1000, LIVE_PUSH_MAX_WAIT_MS - (Date.now() - liveFirstDirtyAt));
  livePushTimer = setTimeout(() => { liveFirstDirtyAt = 0; liveSyncNow(); }, Math.min(wait, cap));
}
(function wrapSaveData(){
  const original = saveData;
  saveData = function(){
    const r = original.apply(this, arguments);
    try{ liveNoteChange(); }catch(e){}
    return r;
  };
})();

function liveWire(){
  if(liveWired) return;
  liveWired = true;
  setInterval(() => { if(liveActive && document.visibilityState === 'visible') liveSyncNow(); }, LIVE_POLL_MS);
  setInterval(liveRefreshChip, 30*1000);
  document.addEventListener('visibilitychange', () => {
    if(!liveActive) return;
    if(document.visibilityState === 'visible') liveSyncNow();
    else if(liveFirstDirtyAt){ clearTimeout(livePushTimer); liveFirstDirtyAt = 0; liveSyncNow({ force:false }); } // send before the app is put to sleep
  });
  window.addEventListener('online', () => { if(liveActive) liveSyncNow(); });
  const chip = document.getElementById('liveSyncChip');
  if(chip) chip.addEventListener('click', () => openSyncSheet());
}
async function liveSyncInit(){
  let live = null;
  try{ live = await liveMeta(); }catch(e){}
  liveWire();
  if(!live || !live.enabled){ liveActive = false; liveRefreshChip(); return; }
  if(live.key) liveMem.key = live.key;
  liveActive = true;
  liveSetStatus(liveMem.key ? 'syncing' : 'locked');
  if(liveMem.key) liveSyncNow();
}
// Called by the AirDrop sync code when a backup is restored: this device's data has jumped
// in time, so merging against the old shared copy could undo or delete things on the other device.
async function liveForgetBase(){
  const meta = await syncMetaGet();
  if(!meta.live || !meta.live.enabled) return;
  await liveSave(meta, Object.assign({}, meta.live, { base:null, lastPeerCreatedAt:0, seenHeadAt:0, lastPushHash:null }));
  liveSetStatus('attention', 'This device\'s data was restored from a backup, so it can no longer be merged automatically. Open Backup → Sync → Live sync and choose what to do.');
}

/* ---------- set-up flows ---------- */
async function liveEnsureUrl(){
  const meta = await syncMetaGet();
  const known = String(meta.liveUrl || LIVE_SYNC_DEFAULT_URL || '').trim();
  if(known) return known;
  return new Promise(resolve => {
    appConfirm('Paste the address of your Cloudflare sync service — it ends in .workers.dev.', {
      title: 'Cloudflare address', confirmLabel: 'Check it', danger: false,
      input: { type:'url', placeholder:'https://round-book-sync.yourname.workers.dev' },
      onCancel: () => resolve(null),
      onConfirm: async (v) => {
        let url = String(v || '').trim().replace(/\/+$/, '');
        if(!/^https:\/\/[^\s/]+$/i.test(url)){ appAlert('That doesn\'t look right. It should look like https://round-book-sync.yourname.workers.dev', {title:'Cloudflare address'}); resolve(null); return; }
        try{
          const r = await fetch(url + '/', { cache:'no-store' });
          const j = await r.json();
          if(!j || j.app !== 'round-book-sync') throw new Error('not ours');
        }catch(e){
          appAlert('Couldn\'t reach a Round Book sync service at that address. Check it, that the Worker is deployed, and that you have a signal.', {title:'Cloudflare address'});
          resolve(null); return;
        }
        try{ await syncMetaPut(Object.assign({}, await syncMetaGet(), { liveUrl: url })); }catch(e){}
        resolve(url);
      }
    });
  });
}
async function liveEnable(settings){
  const meta = await syncMetaGet();
  const live = Object.assign({ enabled:true, uploaded:{}, lastPushHash:null }, settings);
  if(live.key) liveMem.key = live.key;
  await liveSave(meta, live);
  liveActive = true;
  liveWire();
  liveSetStatus('syncing');
}

async function liveSetupFirst(){
  const url = await liveEnsureUrl(); if(!url) return;
  const pw = await syncAskNewPassphrase(); if(!pw) return;
  toast('Securing — this takes a few seconds…');
  const room = await liveDeriveRoom(pw);
  const salt = syncB64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await syncDeriveKey(pw, salt);
  const probe = { url, roomId: room.roomId, token: room.token };
  let head;
  try{ head = await liveApi(probe, 'GET', '/head'); }catch(e){ appAlert('Couldn\'t reach your Cloudflare service — check your signal and try again.', {title:'Live sync'}); return; }
  if(!head.ok){ appAlert('Your Cloudflare service returned an error (' + head.status + '). Check the Worker is deployed and the SYNC_KV binding is set.', {title:'Live sync'}); return; }
  const me = syncDeviceId();
  const others = Object.keys((head.json && head.json.devices) || {}).filter(id => id !== me);
  if(others.length){
    appAlert('Live sync has already been set up with that passphrase. On this device use "Join live sync" instead — or choose a different passphrase here.', {title:'Live sync'});
    return;
  }
  await liveEnable({ url, roomId: room.roomId, token: room.token, salt, key, base: syncBuildState(data) });
  closeSheet();
  await liveSyncNow({ force:true });
  appAlert('Live sync is on. On your other device open Backup → Sync → Join live sync and enter the same passphrase.', {title:'Live sync on'});
}

async function liveJoin(){
  const url = await liveEnsureUrl(); if(!url) return;
  const pw = await syncAskPassphrase(); if(!pw) return;
  toast('Securing — this takes a few seconds…');
  const room = await liveDeriveRoom(pw);
  const probe = { url, roomId: room.roomId, token: room.token };
  let head;
  try{ head = await liveApi(probe, 'GET', '/head'); }catch(e){ appAlert('Couldn\'t reach your Cloudflare service — check your signal and try again.', {title:'Join live sync'}); return; }
  if(!head.ok){ appAlert('Your Cloudflare service returned an error (' + head.status + ').', {title:'Join live sync'}); return; }
  const devs = (head.json && head.json.devices) || {};
  const peerId = liveHeadPeer(devs);
  if(!peerId){ appAlert('Nothing was found for that passphrase yet. Check it matches exactly, and that you have turned on "Set up live sync" on your other device first.', {title:'Join live sync'}); return; }
  let st;
  try{ st = await liveApi(probe, 'GET', '/state/' + peerId); }catch(e){ appAlert('Couldn\'t download the data — check your signal and try again.', {title:'Join live sync'}); return; }
  if(!st.ok || !st.json){ appAlert('Couldn\'t download the other device\'s data. Try again in a minute.', {title:'Join live sync'}); return; }
  const key = await syncDeriveKey(pw, st.json.salt);
  const payload = await syncDecrypt(st.json, key);
  if(!payload || !payload.state){ appAlert('That passphrase didn\'t unlock the data. Check it matches the other device exactly.', {title:'Join live sync'}); return; }
  if(payload.appVersion && payload.appVersion > APP_VERSION){ appAlert('The other device has a newer version of Round Book. Close and reopen the app here to update it, then try again.', {title:'Join live sync'}); return; }
  const n = (payload.state.customers || []).length;
  const proceed = async () => {
    const live = { enabled:true, url, roomId: room.roomId, token: room.token, salt: st.json.salt, key, base: null, uploaded:{}, lastPushHash:null };
    liveMem.key = key;
    await liveSave(await syncMetaGet(), live);
    await liveApplyAdopt(live, payload, devs[peerId].updatedAt || 0);
    await liveEnable(Object.assign({}, await liveMeta(), { enabled:true, key }));
    closeSheet();
    toast('Live sync is on');
    liveSyncNow({ force:true });
  };
  if(syncLocalIsEmpty()){
    appConfirm(`Set this device up from your other device's data (${n} customer${n===1?'':'s'})?`, { title:'Join live sync', confirmLabel:'Set up', danger:false, onConfirm: proceed });
  } else {
    appConfirm(`This device already has its own data. Joining replaces ALL of it with your other device's data (${n} customer${n===1?'':'s'}). A safety copy is taken first and can be restored from Backup.`, { title:'Replace data on this device?', confirmLabel:'Replace and join', danger:true, onConfirm: proceed });
  }
}

// After a restore (or any time the shared history is lost): take the other device's data.
async function liveAdoptPeer(){
  const live = await liveMeta(); if(!live || !live.enabled) return;
  const key = live.key || liveMem.key;
  if(!key){ toast('Unlock live sync first'); return; }
  let head;
  try{ head = await liveApi(live, 'GET', '/head'); }catch(e){ toast('No signal — try again'); return; }
  const devs = (head.json && head.json.devices) || {};
  const peerId = liveHeadPeer(devs);
  if(!head.ok || !peerId){ toast('The other device hasn\'t sent any data yet'); return; }
  const st = await liveApi(live, 'GET', '/state/' + peerId);
  const payload = st.ok && st.json ? await syncDecrypt(st.json, key) : null;
  if(!payload || !payload.state){ toast('Couldn\'t read the other device\'s data'); return; }
  appConfirm('Replace everything on this device with the other device\'s data? A safety copy is taken first.', {
    title:'Use the other device\'s data', confirmLabel:'Replace', danger:true,
    onConfirm: async () => {
      await liveApplyAdopt(live, payload, devs[peerId].updatedAt || 0);
      closeSheet();
      toast('Done — live sync is back in step');
      liveSyncNow({ force:true });
    }
  });
}
async function liveUnlock(){
  const live = await liveMeta(); if(!live) return;
  const pw = await syncAskPassphrase(); if(!pw) return;
  toast('Checking…');
  const room = await liveDeriveRoom(pw);
  if(room.roomId !== live.roomId){ appAlert('That isn\'t the passphrase live sync was set up with.', {title:'Unlock live sync'}); return; }
  liveMem.key = await syncDeriveKey(pw, live.salt);
  liveSetStatus('syncing');
  closeSheet();
  liveSyncNow({ force:true });
}
async function liveSyncNowButton(){
  if(!liveActive){ return; }
  toast('Syncing…');
  await liveSyncNow({ force:true });
  openSyncSheet();
}
async function liveReuploadPhotos(){
  await liveUpdate({ uploaded:{} });
  toast('Re-checking photos…');
  liveSyncNow({ force:true });
}
function liveTurnOff(){
  appConfirm('Stop live sync on this device? Your data stays exactly as it is here. The encrypted copy stays in your Cloudflare mailbox until you delete it.', {
    title:'Turn off live sync', confirmLabel:'Turn off', danger:true,
    onConfirm: async () => {
      liveActive = false; clearTimeout(livePushTimer); liveFirstDirtyAt = 0;
      const meta = await syncMetaGet();
      delete meta.live;
      try{ await syncMetaPut(meta); }catch(e){}
      liveSetStatus('off');
      toast('Live sync turned off');
      openSyncSheet();
    }
  });
}
function liveDeleteCloud(){
  appConfirm('Delete the encrypted copy from your Cloudflare mailbox and turn live sync off here? Nothing on this device changes. The other device will need to set up again if you want to restart.', {
    title:'Delete cloud copy', confirmLabel:'Delete', danger:true,
    onConfirm: async () => {
      const live = await liveMeta();
      if(live){
        try{
          const r = await liveApi(live, 'DELETE', '');
          if(!r.ok){ toast('Couldn\'t delete it right now — try again'); return; }
        }catch(e){ toast('No signal — try again'); return; }
      }
      liveActive = false; clearTimeout(livePushTimer); liveFirstDirtyAt = 0;
      const meta = await syncMetaGet();
      delete meta.live;
      try{ await syncMetaPut(meta); }catch(e){}
      liveSetStatus('off');
      toast('Cloud copy deleted');
      openSyncSheet();
    }
  });
}
async function liveChangeUrl(){
  const meta = await syncMetaGet();
  delete meta.liveUrl;
  try{ await syncMetaPut(meta); }catch(e){}
  toast('Address cleared — you\'ll be asked for it next time');
}

/* ---------- the "Live sync" block at the top of Backup → Sync ---------- */
function liveSyncSectionHtml(meta){
  const live = meta && meta.live;
  const box = 'background:var(--blue-dim); border:1px solid var(--box-border); border-radius:14px; padding:14px; margin-bottom:18px;';
  const btn = (label, fn, extra) => `<button class="btn" style="width:100%; margin-top:8px; ${extra||''}" onclick="${fn}">${label}</button>`;
  if(!live || !live.enabled){
    return `<div style="${box}">
      <div style="font-weight:800; margin-bottom:4px;">⚡ Live sync</div>
      <p style="font-size:0.8125rem; line-height:1.55; margin:0 0 4px; color:var(--ink-muted);">Keeps this device and your other one in step automatically, usually within a minute, through a small mailbox on your own free Cloudflare account. Everything is encrypted on your device first, so the mailbox only holds scrambled data. <a href="#" onclick="openHelp(); return false;" style="color:var(--blue); font-weight:700;">How to set it up</a></p>
      ${btn('Set up live sync (first device)', 'liveSetupFirst()', 'background:var(--navy); color:#fff;')}
      ${btn('Join live sync (second device)', 'liveJoin()')}
    </div>`;
  }
  const s = liveStatus;
  const lines = [];
  lines.push(`<div style="font-weight:800;">⚡ Live sync is on</div>`);
  const stateText = { syncing:'Syncing…', ok: s.okAt ? 'Up to date — checked ' + liveAgo(s.okAt) : 'On', waiting:'On — waiting for your other device to join', offline:'Offline — will sync when you\'re back online', locked:'Locked — enter your passphrase to resume', attention:'Needs your attention', error:'Problem' }[s.state] || 'On';
  lines.push(`<div style="font-size:0.8125rem; margin-top:4px;">${escapeHtml(stateText)}</div>`);
  if(s.text) lines.push(`<div style="font-size:0.8125rem; margin-top:6px; color:var(--red); line-height:1.5;">${escapeHtml(s.text)}</div>`);
  if(live.lastPushAt) lines.push(`<div style="font-size:0.75rem; margin-top:6px; color:var(--ink-muted);">Last sent ${liveAgo(live.lastPushAt)}${live.lastPullAt ? ' · last received ' + liveAgo(live.lastPullAt) : ''}${live.lastSummary ? ' · ' + escapeHtml(live.lastSummary) : ''}</div>`);
  let actions = '';
  if(!(live.key || liveMem.key)) actions += btn('🔒 Unlock with passphrase', 'liveUnlock()', 'background:var(--navy); color:#fff;');
  if(live.base == null) actions += btn('Use the other device\'s data on this device', 'liveAdoptPeer()', 'background:var(--navy); color:#fff;');
  actions += btn('Sync now', 'liveSyncNowButton()');
  actions += btn('Re-check photos', 'liveReuploadPhotos()');
  actions += btn('Turn off live sync on this device', 'liveTurnOff()', 'background:var(--red-dim); color:var(--red);');
  actions += btn('Delete the cloud copy…', 'liveDeleteCloud()', 'background:var(--red-dim); color:var(--red);');
  return `<div style="${box}">${lines.join('')}${actions}</div>`;
}
