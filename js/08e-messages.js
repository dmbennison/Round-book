/* 08e-messages.js -- notes between your two devices.
   Part of Round Book's split JS bundle; loaded after 08d-desktop.js and before 09-boot.js.

   More > Message other device sends a short note. It rides along with the data that live sync already carries
   (kept in settings.deviceMessages, encrypted like everything else), appears as a card at the top of the Today tab on
   the other device, and stays there until it is dismissed with "Got it". Dismissing stamps it as read, and that
   travels back so the sender is told it has been read. Old, finished messages tidy themselves away.
   A message is {id, text, from (the sending device's id), at (time sent), readAt (time dismissed, once it has been)}. */

const MSG_MAX_LEN = 300;
const MSG_READ_KEEP_MS = 3 * 24 * 3600 * 1000;    // a read message is kept this long (so the sender sees it was read), then removed
const MSG_UNREAD_KEEP_MS = 14 * 24 * 3600 * 1000; // an unread one is kept this long
const MSG_SEEN_KEY = 'roundBookMsgSeen';           // this device only: which messages it has already announced with a pop-up

function msgAll(){ return (data.settings && data.settings.deviceMessages) || []; }
function msgIsMine(m){ return m.from === syncDeviceId(); }
function msgIncoming(){ return msgAll().filter(m => !msgIsMine(m) && !m.readAt).sort((a, b) => a.at - b.at); }
function msgSentList(){ return msgAll().filter(msgIsMine).sort((a, b) => b.at - a.at); }
function msgWhen(ms){
  const d = new Date(ms), t = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? t : d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) + ' ' + t;
}
function msgSnippet(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s; }

// The cards at the top of Today. pinned = inside the pinned block during a Start run (a long stack scrolls inside itself).
function msgBannerHtml(pinned){
  const list = msgIncoming();
  if(!list.length) return '';
  const cards = list.map(m => `
    <div style="display:flex; align-items:flex-start; gap:10px; margin:0 0 8px; padding:10px 12px; border-radius:12px; background:var(--blue-dim); color:var(--blue-deep);">
      <div style="font-size:1.125rem; line-height:1.2;">\u2709\ufe0f</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:0.9375rem; font-weight:800; line-height:1.35; overflow-wrap:anywhere;">${escapeHtml(m.text)}</div>
        <div style="font-size:0.6875rem; font-weight:700; opacity:0.75; margin-top:3px;">From your other device \u00b7 ${escapeHtml(msgWhen(m.at))}</div>
      </div>
      <button class="btn-primary" style="flex:none; padding:8px 12px; font-size:0.8125rem;" onclick="msgDismiss('${escapeAttr(m.id)}')">Got it</button>
    </div>`).join('');
  return `<div class="msg-cards" style="margin:0 0 ${pinned ? '0' : '2px'};${pinned ? ' max-height:9.5em; overflow-y:auto;' : ''}">${cards}</div>`;
}

function msgDismiss(id){
  const m = msgAll().find(x => x.id === id);
  if(!m || m.readAt) return;
  m.readAt = Date.now();
  saveData();
  render();
  liveSyncNow(); // tell the sender it has been read without waiting for the next check
}

function msgPrune(){
  const list = (data.settings && data.settings.deviceMessages);
  if(!list || !list.length) return false;
  const now = Date.now();
  const keep = list.filter(m => m.readAt ? now - m.readAt < MSG_READ_KEEP_MS : now - m.at < MSG_UNREAD_KEEP_MS);
  if(keep.length === list.length) return false;
  data.settings.deviceMessages = keep;
  return true;
}

function msgSend(){
  const box = document.getElementById('msgText');
  const text = ((box && box.value) || '').trim();
  if(!text){ toast('Type a message first'); return; }
  data.settings = data.settings || {};
  const list = data.settings.deviceMessages = data.settings.deviceMessages || [];
  list.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text.slice(0, MSG_MAX_LEN), from: syncDeviceId(), at: Date.now() });
  msgPrune();
  saveData();
  liveSyncNow();
  toast(liveActive ? 'Message sent' : 'Saved \u2014 it will reach your other device when you next sync');
  openMessageDevice();
}

function openMessageDevice(){
  const sent = msgSentList().slice(0, 5);
  const status = m => m.readAt ? `<span style="color:var(--green); font-weight:800;">\u2713 Read ${escapeHtml(msgWhen(m.readAt))}</span>` : `<span style="color:var(--ink-muted); font-weight:700;">Waiting to be read</span>`;
  openSheet(`
    <div class="sheet-head">
      <h2>Message other device</h2>
      <button class="sheet-close" onclick="closeSheet()" aria-label="Close">\u2715</button>
    </div>
    <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.45; margin:0 0 10px;">Pops up as a card at the top of Today on your other device until it is dismissed, and you'll be told when it has been read.${liveActive ? '' : ' Live sync isn\u2019t switched on here, so it only gets there when you next sync.'}</p>
    <textarea id="msgText" maxlength="${MSG_MAX_LEN}" rows="3" placeholder="e.g. Mrs Patel wants the gutters done too" style="width:100%; box-sizing:border-box; padding:12px; border:1.5px solid var(--line); border-radius:12px; font:inherit; font-size:1rem; background:var(--surface); color:var(--ink); resize:vertical;"></textarea>
    <button class="btn-primary" style="width:100%; margin-top:10px;" onclick="msgSend()">Send</button>
    ${sent.length ? `<div class="section-label" style="margin:18px 2px 8px;">Sent</div>` + sent.map(m => `
      <div style="padding:10px 12px; margin-bottom:6px; border-radius:10px; background:var(--bg); font-size:0.8125rem;">
        <div style="font-weight:700; overflow-wrap:anywhere;">${escapeHtml(msgSnippet(m.text, 90))}</div>
        <div style="margin-top:3px; font-size:0.75rem;">${escapeHtml(msgWhen(m.at))} \u00b7 ${status(m)}</div>
      </div>`).join('') : ''}
  `);
  setTimeout(() => { const b = document.getElementById('msgText'); if(b) b.focus(); }, 60);
}

// After every redraw: announce a new message (once), tell the sender when theirs has been read (once), tidy old ones.
function msgAfterRender(){
  if(!data || !data.settings) return;
  let seen;
  try{ seen = JSON.parse(localStorage.getItem(MSG_SEEN_KEY) || 'null'); }catch(e){ seen = null; }
  seen = seen || { n: [], r: [] };
  let changed = false;
  const fresh = msgIncoming().filter(m => seen.n.indexOf(m.id) < 0);
  if(fresh.length){
    seen.n = seen.n.concat(fresh.map(m => m.id)).slice(-60); changed = true;
    toast(fresh.length === 1 ? '\u2709\ufe0f New message from your other device' : `\u2709\ufe0f ${fresh.length} new messages from your other device`);
    if(typeof haptic === 'function') haptic([18, 50, 18]);
  }
  const read = msgSentList().filter(m => m.readAt && seen.r.indexOf(m.id) < 0);
  if(read.length){
    seen.r = seen.r.concat(read.map(m => m.id)).slice(-60); changed = true;
    if(!fresh.length) toast('\u2713 Read on your other device: ' + msgSnippet(read[0].text, 40));
  }
  if(changed){ try{ localStorage.setItem(MSG_SEEN_KEY, JSON.stringify(seen)); }catch(e){} }
  if(msgPrune()) saveData();
}
