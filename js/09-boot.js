/* 09-boot.js -- Small utilities, then the app's actual startup sequence -- must load last, since it calls functions defined in every file above.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- util ---------- */
function escapeHtml(str){
  return String(str||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function escapeAttr(str){ return escapeHtml(str); }

/* ---------- voice typing ----------
   Every free-text box (text, search and note fields) gets a small microphone drawn inside its right-hand end.
   Tap it, speak, and the words appear in the box as you go; tap again to stop. It uses the browser's own speech
   recognition, so the icons only appear where that exists. Number, date, phone, email and password boxes are left
   alone (anything with an inputmode, or data-novoice). The icon is just a CSS background, so no screen's layout is
   touched — a tap on that end of the box is picked up here instead. */
const VT_FIELDS = ['textarea', 'input:not([type])', 'input[type=text]', 'input[type=search]'];
const VT_SKIP = ':not([readonly]):not([disabled]):not([inputmode]):not([data-novoice])';
const VT_ZONE = 46; // px from the box's right edge that counts as a tap on the microphone
const VT_BLOCK_KEY = 'roundBookNoVoice';
function vtMic(colour){
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='${colour}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z'/%3E%3Cpath d='M19 10v2a7 7 0 0 1-14 0v-2'/%3E%3Cline x1='12' y1='19' x2='12' y2='23'/%3E%3Cline x1='8' y1='23' x2='16' y2='23'/%3E%3C/svg%3E")`;
}
function vtSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
// If the device refused speech recognition outright (some home-screen apps do), the icons are hidden for two
// weeks rather than offering a button that never works.
function vtBlockedRecently(){
  try{ const t = Number(localStorage.getItem(VT_BLOCK_KEY)); return !!t && Date.now() - t < 14*24*3600*1000; }catch(e){ return false; }
}
function vtInstallStyles(){
  const on = (list, extra) => list.map(s => 'html.vt-ok ' + s + VT_SKIP + (extra||'')).join(', ');
  const css = `
    ${on(VT_FIELDS, ':not([list])')} { background-image:${vtMic('%237C8896')}; background-repeat:no-repeat; background-position:right 10px center; background-size:20px 20px; padding-right:42px !important; }
    ${on(['textarea'], ':not([list])')} { background-position:right 10px top 12px; }
    @media (hover: none){ ${on(VT_FIELDS, '[list]')} { background-image:${vtMic('%237C8896')}; background-repeat:no-repeat; background-position:right 10px center; background-size:20px 20px; padding-right:42px !important; } }
    html.vt-ok .vt-live { background-image:${vtMic('%23E5484D')} !important; border-color:#E5484D !important; box-shadow:0 0 0 3px rgba(229,72,77,0.28) !important; }
  `;
  const st = document.createElement('style');
  st.id = 'vtStyle';
  st.textContent = css;
  document.head.appendChild(st);
}
// Is this one of the boxes that has a microphone?
function vtEligible(el){
  if(!el || !el.matches || !document.documentElement.classList.contains('vt-ok')) return false;
  if(!el.matches(VT_FIELDS.map(s => s + VT_SKIP).join(', '))) return false;
  // Boxes tied to a pick-list only get it on touch screens, where there's no drop-down arrow in the way.
  if(el.hasAttribute('list') && !(window.matchMedia && window.matchMedia('(hover: none)').matches)) return false;
  return true;
}
function vtInZone(el, e){
  const r = el.getBoundingClientRect();
  if(e.clientX > r.right || e.clientX < r.right - VT_ZONE) return false;
  if(el.tagName === 'TEXTAREA' && (e.clientY < r.top || e.clientY > r.top + VT_ZONE)) return false;
  return true;
}
let vtSess = null;
function vtStop(){ if(vtSess){ try{ vtSess.rec.stop(); }catch(e){} } }
function vtEnd(sess){
  if(vtSess !== sess) return;
  clearInterval(sess.watch);
  sess.el.classList.remove('vt-live');
  vtSess = null;
}
// Puts what's been heard into the box: where the cursor was when listening began (the end, if the box wasn't
// focused), spaced from the text around it and starting with a capital at the start of a sentence.
function vtWrite(sess, heard){
  const el = sess.el;
  let t = heard.trim();
  if(!t) return;
  const b = sess.before, a = sess.after;
  if(!b.trim() || /[.!?]\s*$/.test(b)) t = t.charAt(0).toUpperCase() + t.slice(1);
  const lead = (b && !/\s$/.test(b)) ? ' ' : '';
  const trail = (a && !/^\s/.test(a)) ? ' ' : '';
  let v = b + lead + t + trail + a;
  let caret = (b + lead + t).length;
  if(el.maxLength > 0 && v.length > el.maxLength){ v = v.slice(0, el.maxLength); caret = Math.min(caret, v.length); }
  el.value = v;
  try{ el.setSelectionRange(caret, caret); }catch(e){}
  el.dispatchEvent(new Event('input', {bubbles:true})); // so search-as-you-type, totals etc. react as if it was typed
}
function vtStart(el){
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Rec) return;
  if(vtSess){ const old = vtSess; vtEnd(old); try{ old.rec.abort(); }catch(e){} }
  const rec = new Rec();
  rec.lang = 'en-GB';
  rec.interimResults = true;
  rec.continuous = el.tagName === 'TEXTAREA'; // notes can run on; short boxes stop at the first pause
  let pos = el.value.length;
  try{ if(document.activeElement === el && el.selectionEnd != null) pos = el.selectionEnd; }catch(e){}
  const sess = { rec, el, before: el.value.slice(0, pos), after: el.value.slice(pos), watch: null };
  rec.onresult = (ev) => {
    if(vtSess !== sess) return;
    let heard = '';
    for(let i = 0; i < ev.results.length; i++) heard += ev.results[i][0].transcript;
    vtWrite(sess, heard);
  };
  rec.onerror = (ev) => {
    if(vtSess !== sess) return;
    const code = ev && ev.error;
    if(code === 'aborted') return;
    if(code === 'no-speech') toast('Didn’t catch anything — tap the microphone and try again');
    else if(code === 'network') toast('Voice typing needs an internet connection');
    else if(code === 'not-allowed' || code === 'service-not-allowed'){
      if(code === 'service-not-allowed'){
        try{ localStorage.setItem(VT_BLOCK_KEY, String(Date.now())); }catch(e2){}
        document.documentElement.classList.remove('vt-ok');
      }
      toast('Voice typing couldn’t start here — check microphone access in your device settings, or use the 🎤 key on your keyboard');
    } else toast('Voice typing stopped — please try again');
  };
  rec.onend = () => vtEnd(sess);
  // If the box disappears (its pop-up was closed) while still listening, stop.
  sess.watch = setInterval(() => { if(!el.isConnected) vtStop(); }, 800);
  vtSess = sess;
  el.classList.add('vt-live');
  try{ rec.start(); }catch(e){ vtEnd(sess); toast('Voice typing couldn’t start — please try again'); }
}
function vtToggle(el){
  if(vtSess && vtSess.el === el){ vtStop(); return; }
  vtStart(el);
}
(function vtInit(){
  if(!vtSupported() || vtBlockedRecently()) return;
  vtInstallStyles();
  document.documentElement.classList.add('vt-ok');
  // Stops a tap on the microphone from moving focus (and closing the keyboard); the tap itself is handled on click.
  document.addEventListener('mousedown', (e) => {
    if(vtEligible(e.target) && vtInZone(e.target, e)) e.preventDefault();
  }, true);
  document.addEventListener('click', (e) => {
    if(!(vtEligible(e.target) && vtInZone(e.target, e))) return;
    e.preventDefault(); e.stopPropagation();
    vtToggle(e.target);
  }, true);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') vtStop(); });
})();

/* ---------- keyboard shortcuts ---------- */
// Ctrl/Cmd + K, or / on its own, opens Search — for anyone with a keyboard (iPad, desktop). Left alone while
// typing in a field, while a full-screen editor / preview / dialog is up, and while a form is open (Search would
// replace it and lose what was typed).
document.addEventListener('keydown', (e) => {
  const isK = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k';
  const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
  if((!isK && !isSlash) || e.repeat || e.defaultPrevented) return;
  const t = e.target, tag = t && t.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  const shown = (id) => { const el = document.getElementById(id); return !!el && el.classList.contains('show'); };
  if(shown('schedEditor') || shown('reportPreview') || document.getElementById('appConfirmPrompt') || document.getElementById('backupPopup')) return;
  const sheet = document.getElementById('sheet');
  if(shown('overlay') && sheet && sheet.querySelector(SHEET_TEXT_ENTRY)) return;
  e.preventDefault();
  openUniversalSearch();
});

/* ---------- init ---------- */
applyDarkMode();
applyTheme();
applyTextSize();
// While in auto mode, follow the device's system setting live rather than only
// picking it up next time the app is opened.
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if(themeMode === 'auto') applyDarkMode();
  });
}
// Swiping on the dimmed area behind a pop-up shouldn't scroll the page underneath.
(function(){
  const ov = document.getElementById('overlay');
  if(ov) ov.addEventListener('touchmove', (e) => { if(e.target === ov && e.cancelable) e.preventDefault(); }, {passive:false});
})();
/* ---------- swipe actions ---------- */
let swipeState = null;
function initSwipeHandlers(){
  const main = document.getElementById('main');
  main.addEventListener('touchstart', onSwipeStart, {passive:true});
  main.addEventListener('touchmove', onSwipeMove, {passive:false});
  main.addEventListener('touchend', onSwipeEnd, {passive:true});
  main.addEventListener('touchcancel', onSwipeCancel, {passive:true});
  // Press-and-hold on a customer card pops up the quick info box (see
  // openCustomerInfoBox). Uses its own listeners alongside the swipe ones.
  main.addEventListener('touchstart', onLongPressStart, {passive:true});
  main.addEventListener('touchmove', onLongPressMove, {passive:true});
  main.addEventListener('touchend', cancelLongPress, {passive:true});
  main.addEventListener('touchcancel', cancelLongPress, {passive:true});
  // Android fires a context menu on long-press (and desktop on right-click) —
  // swallow it on customer cards and show the info box instead.
  main.addEventListener('contextmenu', (e)=>{
    const card = e.target.closest('.cust-card[data-id][data-kind="customer"]');
    if(!card) return;
    e.preventDefault();
    if(Date.now() - lastLongPressAt > 1000) fireLongPress(card.dataset.id);
  });
}
/* ---------- press-and-hold info box ---------- */
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10; // px of finger drift before it counts as a scroll/swipe instead
let longPressTimer = null, longPressOrigin = null, lastLongPressAt = 0;
function onLongPressStart(e){
  cancelLongPress();
  const card = e.target.closest('.cust-card[data-id][data-kind="customer"]');
  if(!card || e.touches.length !== 1) return;
  const t = e.touches[0];
  longPressOrigin = {x:t.clientX, y:t.clientY};
  const id = card.dataset.id;
  longPressTimer = setTimeout(()=>{ longPressTimer = null; fireLongPress(id); }, LONG_PRESS_MS);
}
function onLongPressMove(e){
  if(!longPressTimer || !longPressOrigin) return;
  const t = e.touches[0];
  if(Math.abs(t.clientX-longPressOrigin.x) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(t.clientY-longPressOrigin.y) > LONG_PRESS_MOVE_TOLERANCE) cancelLongPress();
}
function cancelLongPress(){
  if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
  longPressOrigin = null;
}
function fireLongPress(id){
  lastLongPressAt = Date.now();
  // The lift-off of the same touch can register as a tap on whatever's now
  // under the finger (the overlay) — ignore overlay taps for a moment so the
  // box doesn't close the instant it opens.
  overlayIgnoreUntil = Date.now() + 700;
  if(swipeState){ swipeState.card.style.transform = 'translateX(0)'; swipeState = null; }
  if(navigator.vibrate) navigator.vibrate(25);
  openCustomerInfoBox(id);
}
function onSwipeStart(e){
  const card = e.target.closest('.cust-card[data-id]');
  if(!card) return;
  const touch = e.touches[0];
  const wrap = card.parentElement;
  const bgLeft = wrap && wrap.querySelector('.swipe-bg-left');
  const bgRight = wrap && wrap.querySelector('.swipe-bg-right');
  swipeState = {
    card, startX: touch.clientX, startY: touch.clientY, currentX: 0, decided:false, horizontal:false,
    bgLeft, bgRight,
    // Remembered so onSwipeEnd/onSwipeCancel can restore the label exactly as it
    // was — job ("✓ Done") and quote ("✓ Accept") cards must never get stuck
    // showing the customer card's "✓ Cleaned" wording after a swipe.
    bgLeftDefaultText: bgLeft ? bgLeft.textContent : ''
  };
  if(bgLeft) bgLeft.style.opacity = '0';
  if(bgRight) bgRight.style.opacity = '0';
}
function onSwipeMove(e){
  if(!swipeState) return;
  const touch = e.touches[0];
  const dx = touch.clientX - swipeState.startX;
  const dy = touch.clientY - swipeState.startY;
  if(!swipeState.decided){
    if(Math.abs(dx) > 8 || Math.abs(dy) > 8){
      swipeState.decided = true;
      swipeState.horizontal = Math.abs(dx) > Math.abs(dy);
      if(!swipeState.horizontal){ swipeState = null; return; }
    } else {
      return;
    }
  }
  if(!swipeState) return;
  e.preventDefault();
  // Customer cards get extra room on the right: halfway = clean, all the way
  // across = clean AND paid in one gesture. Job/quote cards keep the plain
  // single-action swipe either way.
  const isCustomer = swipeState.card.dataset.kind === 'customer';
  const maxDragRight = isCustomer ? SWIPE_FULL_X : 96;
  const clamped = Math.max(-96, Math.min(maxDragRight, dx));
  swipeState.currentX = clamped;
  swipeState.card.style.transition = 'none';
  swipeState.card.style.transform = `translateX(${clamped}px)`;

  // Only one background should ever be visible at a time — otherwise whichever
  // one comes later in the markup (swipe-bg-right, "💷 Paid") paints over the
  // other and dragging right never actually shows the "Cleaned" indication.
  const { bgLeft, bgRight } = swipeState;
  if(clamped > 0){
    if(bgLeft) bgLeft.style.opacity = '1';
    if(bgRight) bgRight.style.opacity = '0';
  } else if(clamped < 0){
    if(bgLeft) bgLeft.style.opacity = '0';
    if(bgRight) bgRight.style.opacity = '1';
  } else {
    if(bgLeft) bgLeft.style.opacity = '0';
    if(bgRight) bgRight.style.opacity = '0';
  }

  // Live-updates the revealed left label as a customer card crosses into "all
  // the way" territory, so it's clear before releasing which action will fire.
  if(isCustomer && clamped > 0){
    if(bgLeft){
      const full = clamped >= SWIPE_FULL_THRESHOLD;
      bgLeft.textContent = full ? '✓ Cleaned + 💷 Paid' : '✓ Cleaned';
      bgLeft.style.background = full ? 'var(--navy)' : '';
    }
  }
}
const SWIPE_HALF_THRESHOLD = 64; // customer card: clean
const SWIPE_FULL_X = 150; // customer card: max right-drag distance
const SWIPE_FULL_THRESHOLD = 125; // customer card: clean + paid
function onSwipeEnd(){
  if(!swipeState) return;
  const { card, currentX, decided, horizontal, bgLeft, bgRight, bgLeftDefaultText } = swipeState;
  card.style.transition = 'transform 0.2s ease';
  card.style.transform = 'translateX(0)';
  if(bgLeft){ bgLeft.textContent = bgLeftDefaultText; bgLeft.style.background = ''; bgLeft.style.opacity = '0'; }
  if(bgRight){ bgRight.style.opacity = '0'; }

  if(decided && horizontal){
    const id = card.dataset.id;
    const kind = card.dataset.kind || 'customer';
    if(currentX >= SWIPE_HALF_THRESHOLD){
      if(kind === 'job') toggleJobDone(id);
      else if(kind === 'quote') markQuoteAccepted(id);
      else if(kind === 'customer' && currentX >= SWIPE_FULL_THRESHOLD) quickCleanAndPaid(id, true);
      else quickClean(id, true);
    } else if(currentX <= -64){
      if(kind === 'job') toggleJobPaid(id);
      else if(kind === 'quote') markQuoteDeclined(id);
      else quickPaid(id);
    }
  }
  swipeState = null;
}
function onSwipeCancel(){
  if(!swipeState) return;
  const { bgLeft, bgRight, bgLeftDefaultText } = swipeState;
  swipeState.card.style.transition = 'transform 0.2s ease';
  swipeState.card.style.transform = 'translateX(0)';
  if(bgLeft){ bgLeft.textContent = bgLeftDefaultText; bgLeft.style.background = ''; bgLeft.style.opacity = '0'; }
  if(bgRight){ bgRight.style.opacity = '0'; }
  swipeState = null;
}

/* ---------- fixed header ---------- */
// The header is position:fixed so it never scrolls away; the page content is pushed
// down by exactly its height (--header-h). The height changes when
// text size changes or the device rotates, so keep it measured.
(function(){
  const header = document.querySelector('header');
  if(!header) return;
  // The tab bar is fixed to the bottom on a phone, so the page, the + button and pop-up messages sit just above
  // it. On an iPad / desktop (same size test as the tablet block in index.html) it moves to sit directly under
  // the header instead: --header-h then covers both, --tabbar-h is 0, and --header-only-h tells the tab bar
  // where to start. Phones get exactly the values they always did.
  const bar = document.getElementById('tabBar');
  const tabsOnTop = () => !!(window.matchMedia && window.matchMedia('screen and (min-width: 700px) and (min-height: 600px)').matches);
  const sync = () => {
    const root = document.documentElement.style;
    const h = header.offsetHeight, b = bar ? bar.offsetHeight : 0, top = tabsOnTop();
    root.setProperty('--header-only-h', h + 'px');
    root.setProperty('--header-h', (h + (top ? b : 0)) + 'px');
    root.setProperty('--tabbar-h', (top ? 0 : b) + 'px');
  };
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  if(window.ResizeObserver){ const ro = new ResizeObserver(sync); ro.observe(header); if(bar) ro.observe(bar); }
})();
document.getElementById('dateNow').textContent = new Date().toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long'});

// The weather readout was removed in 2.55 — tidy away the leftover cached readings.
try{ localStorage.removeItem('roundBookWeatherCache'); localStorage.removeItem('roundBookForecastCache'); }catch(e){}

/* seed a couple of example customers on very first run so the app isn't blank —
   handled inside initStorage() below, once data has actually finished loading */

// Data and photos both need to finish loading from IndexedDB before the first
// render, so every screen can rely on both `data` and photoUrlCache being ready —
// this is the one unavoidable async step at startup. Renders immediately either
// way rather than risking a stuck blank screen if IndexedDB is ever unavailable or slow.
initStorage().catch(()=>{}).finally(()=>{
  render();
  initSwipeHandlers();
  if(!maybeShowFirstRun()) maybeShowMissingMileagePrompt();
  requestPersistentStorage();
  maybeAutoSafetyCopy();
  if(typeof liveSyncInit === 'function') liveSyncInit();
});
// A home-screen app can stay open for days, so also check each time it comes
// back to the foreground whether a daily safety copy is due.
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible'){ maybeAutoSafetyCopy(); }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // The new service worker activates immediately (see skipWaiting/
      // clients.claim in sw.js), but the page that's already open keeps
      // running the OLD html/js in memory regardless — only a reload picks
      // up the new version. Rather than yanking that reload out from under
      // someone mid-form, just show a small "tap to update" banner once a
      // new version has actually taken over.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        showUpdateBanner();
      });
      // Safari can leave a home-screen PWA sitting open for a long time
      // without ever re-checking sw.js on its own (that normally only
      // happens on a full page navigation, which opening the app from the
      // Home Screen doesn't really do) — so ask explicitly every time the
      // app opens, whenever it's brought back to the foreground, and every
      // 30 minutes while it stays open.
      reg.update().catch(()=>{});
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible') reg.update().catch(()=>{});
      });
      setInterval(() => reg.update().catch(()=>{}), 30*60*1000);
    }).catch(() => {});
  });
}
