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
  if(shown('reportPreview') || document.getElementById('appConfirmPrompt') || document.getElementById('backupPopup')) return;
  const sheet = document.getElementById('sheet');
  if(shown('overlay') && sheet && sheet.querySelector(SHEET_TEXT_ENTRY)) return;
  e.preventDefault();
  openUniversalSearch();
});

/* ---------- init ---------- */
applyDarkMode();
applyTheme();
applyTextSize();
// iOS reads the status-bar colour from the strip at the top (see #statusStrip) the first time it is drawn, which is before the
// saved colour scheme is applied, so it would start blue. Nudge it to look again straight after, once the page has settled,
// and whenever the app comes back to the front (the phone may have switched between light and dark meanwhile).
refreshStatusStrip();
setTimeout(refreshStatusStrip, 400);
setTimeout(refreshStatusStrip, 1500);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') setTimeout(refreshStatusStrip, 150); });
// While in auto mode, follow the device's system setting live rather than only
// picking it up next time the app is opened.
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if(themeMode === 'auto'){ applyDarkMode(); refreshStatusStrip(); }
  });
}
// Swiping on the dimmed area behind a pop-up shouldn't scroll the page underneath.
(function(){
  const ov = document.getElementById('overlay');
  if(ov) ov.addEventListener('touchmove', (e) => { if(e.target === ov && e.cancelable) e.preventDefault(); }, {passive:false});
})();
/* ---------- haptics ----------
   A short tick for gestures. Android (anything with navigator.vibrate) buzzes. iPhone Safari has no vibrate(), but
   switching a hidden <input type="checkbox" switch> gives the system's light tick (iOS 17.4+); it only fires from a
   touch or click, so a tick as a finger crosses a swipe threshold is best effort, while the one on release is
   reliable. A list of numbers is a pattern: buzz, pause, buzz... */
let hapticSwitch = null;
function haptic(pattern){
  const p = Array.isArray(pattern) ? pattern : [pattern || 12];
  try{
    if(navigator.vibrate){ navigator.vibrate(p); return; }
    if(!hapticSwitch){
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed; left:-9999px; top:0; width:1px; height:1px; opacity:0; pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      hapticSwitch = label;
    }
    // one tick per buzz in the pattern, the first straight away
    let t = 0;
    p.forEach((ms, i) => {
      if(i % 2 === 0){ if(t === 0) hapticSwitch.click(); else setTimeout(() => { try{ hapticSwitch.click(); }catch(e){} }, t); }
      t += ms;
    });
  }catch(e){}
}
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
  // Android fires a context menu on long-press — swallow it on customer cards and show the info box
  // instead. A desktop right-click (mouse or trackpad) gets a real menu from 08d-desktop.js, which has
  // already handled the event (preventDefault) by the time it gets here.
  main.addEventListener('contextmenu', (e)=>{
    if(e.defaultPrevented) return;
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
    level: 0, // 0 = not far enough yet, 1 = an action will fire on release, 2 = the "clean and paid" action (customer cards)
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
  // A tick as the swipe becomes "armed" (and a lighter one if it's pulled back out), stronger for clean + paid.
  const level = (isCustomer && clamped >= SWIPE_FULL_THRESHOLD && swipeState.card.dataset.cleaned !== '1') ? 2 : (clamped >= SWIPE_HALF_THRESHOLD || clamped <= -SWIPE_HALF_THRESHOLD) ? 1 : 0;
  if(level !== swipeState.level){ haptic(level === 2 ? 24 : level === 1 ? 14 : 8); swipeState.level = level; }
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
      const done = swipeState.card.dataset.cleaned === '1'; // already cleaned today: nothing to do on a right swipe
      const full = !done && clamped >= SWIPE_FULL_THRESHOLD;
      bgLeft.textContent = done ? '✓ Already cleaned' : full ? '✓ Cleaned + 💷 Paid' : '✓ Cleaned';
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
      haptic([18, 50, 18]); // the action has happened
      if(kind === 'job') toggleJobDone(id);
      else if(kind === 'quote') markQuoteAccepted(id);
      else if(kind === 'customer' && card.dataset.cleaned === '1'){
        // On the Today list a finished customer stays put: a right swipe (half or all the way) does nothing, so it can
        // never log a second clean or a payment by accident. Payment is a left swipe or the Mark paid button.
        toast('Already cleaned today \u2014 swipe left to mark paid');
      }
      else if(kind === 'customer' && currentX >= SWIPE_FULL_THRESHOLD) quickCleanAndPaid(id, true);
      else quickClean(id, true);
    } else if(currentX <= -SWIPE_HALF_THRESHOLD){
      haptic([18, 50, 18]);
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
  // The Work / Sales sub tab bar is pinned just under whatever is at the top (the header, or the header plus the
  // tab bar on an iPad / desktop), and its height is added to --header-h so the page starts below it.
  const sub = document.getElementById('subTabBar');
  const sync = () => {
    const root = document.documentElement.style;
    const h = header.offsetHeight, b = bar ? bar.offsetHeight : 0, top = tabsOnTop();
    const sh = (sub && !sub.hidden) ? sub.offsetHeight : 0;
    root.setProperty('--header-only-h', h + 'px');
    root.setProperty('--sub-top', (h + (top ? b : 0)) + 'px');
    root.setProperty('--header-h', (h + (top ? b : 0) + sh) + 'px');
    root.setProperty('--tabbar-h', (top ? 0 : b) + 'px');
  };
  window.syncHeaderHeights = sync; // renderSubTabs calls this the moment it shows or hides the sub tabs
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  if(window.ResizeObserver){ const ro = new ResizeObserver(sync); ro.observe(header); if(bar) ro.observe(bar); if(sub) ro.observe(sub); }
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
  requestPersistentStorage();
  maybeAutoSafetyCopy();
  // Live sync gets the first go, and the start-up questions wait for it (at most 6 seconds). Asking "what was your
  // end mileage?" before the other device's answer had arrived was the nag you'd already dealt with — and the
  // question itself kept the sync from finishing. With live sync off this carries straight on.
  const firstSync = (typeof liveSyncInit === 'function') ? Promise.resolve().then(liveSyncInit).catch(() => {}) : Promise.resolve();
  Promise.race([firstSync, new Promise(r => setTimeout(r, 6000))]).then(() => {
    const ov = document.getElementById('overlay');
    if(ov && ov.classList.contains('show')) return; // they've already opened something: don't replace it
    if(!maybeShowFirstRun()) maybeShowMissingMileagePrompt();
  });
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

/* ---------- manual update ----------
   The app already checks by itself (on opening, on coming back to the foreground, every 30 minutes). This is the
   same check on demand, from More > Check for updates. If a newer version exists it downloads it and the usual
   "A new version is ready" banner appears; if not, it says so. */
let updateCheckBusy = false;
async function checkForUpdates(){
  if(!('serviceWorker' in navigator)){ toast('Updates aren\u2019t available in this browser'); return; }
  if(document.getElementById('updatePopup')){ closeSheet(); toast('A new version is already waiting \u2014 tap Update'); return; }
  if(navigator.onLine === false){ toast('You\u2019re offline \u2014 connect to the internet and try again'); return; }
  if(updateCheckBusy) return;
  updateCheckBusy = true;
  toast('Checking for updates\u2026');
  let found = false;
  const onFound = () => { found = true; };
  let reg = null;
  try{
    reg = await navigator.serviceWorker.getRegistration();
    if(!reg){ toast('Not installed as an app yet \u2014 reload the page to get the latest'); return; }
    reg.addEventListener('updatefound', onFound);
    await reg.update();
    const t0 = Date.now();
    while(Date.now() - t0 < 25000){ // a new version takes a few seconds to download and take over
      if(updateBannerShown) break;
      if(!found && !reg.installing && !reg.waiting) break;
      await new Promise(r => setTimeout(r, 400));
    }
    if(updateBannerShown || document.getElementById('updatePopup')){ closeSheet(); toast('New version ready \u2014 tap Update'); }
    else if(found){ toast('The update didn\u2019t finish downloading \u2014 try again on a stronger connection'); }
    else {
      appConfirm(`You\u2019re on the latest version (${formatVersion(APP_VERSION)}). If the app still seems out of date, you can clear its stored program files and download them fresh. Your customers and data are not touched.`,
        { title:'Up to date', confirmLabel:'Download fresh copy', cancelLabel:'Close', danger:false, onConfirm: forceFreshInstall });
    }
  }catch(e){
    toast('Couldn\u2019t check for updates \u2014 try again');
  }finally{
    if(reg) reg.removeEventListener('updatefound', onFound);
    updateCheckBusy = false;
  }
}
// Throws away the app's stored program files (the offline copy) and fetches them again. Customers, jobs, photos and
// settings live in the phone's own storage, not in these files, so they stay as they are.
async function forceFreshInstall(){
  if(navigator.onLine === false){ toast('You need an internet connection to do this'); return; }
  try{
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }catch(e){}
  window.location.reload();
}

/* ---------- built-in self-tests ----------
   Only run when the address has ?test (or #test) on the end, e.g. https://yoursite/?test
   The result counts appear as a toast and the details go to the browser console. They work on
   throw-away copies of the data and never save anything, so your real customers are never touched. */
async function runSelfTests(){
  const results = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const eq = (name, actual, expected) => {
    const pass = same(actual, expected);
    results.push({ name, pass, detail: pass ? '' : 'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) });
  };
  const yes = (name, cond) => eq(name, !!cond, true);
  const group = (title, fn) => {
    try{ fn(); }catch(e){ results.push({ name: title + ' threw an error', pass: false, detail: String((e && e.message) || e) }); }
  };
  const agroup = async (title, fn) => {
    try{ await fn(); }catch(e){ results.push({ name: title + ' threw an error', pass: false, detail: String((e && e.message) || e) }); }
  };
  const T = todayISO();
  const day = (n, from) => { const d = new Date((from || T) + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
  const cust = o => Object.assign({ id: 't' + Math.random().toString(36).slice(2, 7), round: 'Test', visitDay: 1, frequencyWeeks: 4, paused: false, price: 20, cleanHistory: [], paymentHistory: [] }, o);
  const clean = (date, amount) => ({ date, amount: amount == null ? 20 : amount });
  // Run something against a throw-away customer list (the calculations read the global `data`), then put the real data back.
  const withData = (customers, fn) => {
    const savedData = data, savedCache = roundPhaseCache;
    try{ data = { customers, oneOffJobs: [], quotes: [], settings: {} }; roundPhaseCache = null; return fn(); }
    finally{ data = savedData; roundPhaseCache = savedCache; }
  };

  group('taxYearStart', () => {
    eq('taxYearStart: on 6 April starts that year', taxYearStart('2025-04-06'), '2025-04-06');
    eq('taxYearStart: 5 April belongs to the previous tax year', taxYearStart('2025-04-05'), '2024-04-06');
    eq('taxYearStart: 1 January is in the tax year that began the previous April', taxYearStart('2026-01-01'), '2025-04-06');
  });

  group('computedDueISO', () => {
    withData([], () => {
      eq('computedDueISO: never cleaned has no due date', computedDueISO(cust({})), null);
      eq('computedDueISO: 4-weekly is last clean + 28 days', computedDueISO(cust({ cleanHistory: [clean('2025-01-06')] })), '2025-02-03');
      eq('computedDueISO: 6-weekly (not a multiple of 4) is last clean + 42 days', computedDueISO(cust({ frequencyWeeks: 6, cleanHistory: [clean('2025-01-06')] })), '2025-02-17');
      eq('computedDueISO: 8-weekly with no 4-weekly neighbours is last clean + 56 days', computedDueISO(cust({ frequencyWeeks: 8, cleanHistory: [clean('2025-01-06')] })), '2025-03-03');
    });
    const peers = [cust({ cleanHistory: [clean('2025-01-06')] }), cust({ cleanHistory: [clean('2025-01-06')] })];
    const eight = cust({ frequencyWeeks: 8, cleanHistory: [clean('2025-01-08')] });
    withData(peers.concat([eight]), () => {
      eq('computedDueISO: 8-weekly is pulled onto the round\'s 4-weekly dates', computedDueISO(eight), '2025-03-03');
    });
    const moved = cust({ cleanHistory: [clean('2025-01-06')], dueOverride: { date: '2025-03-10', base: '2025-01-06' } });
    withData([moved], () => {
      eq('nextDueISO: a hand-set date is used while it still matches the latest clean', nextDueISO(moved), '2025-03-10');
      moved.cleanHistory.push(clean('2025-02-03'));
      eq('nextDueISO: a hand-set date lapses once the customer is cleaned again', nextDueISO(moved), '2025-03-03');
    });
  });

  group('roundPhases', () => {
    const ph = last => (((isoToDays(last) + 28) % 28) + 28) % 28;
    withData([], () => eq('roundPhases: no customers gives no rounds', roundPhases(), {}));
    withData([cust({ round: 'Tue', cleanHistory: [clean('2025-01-06')] })], () =>
      eq('roundPhases: one 4-weekly customer sets their round\'s rhythm', roundPhases(), { 'Tue|1': ph('2025-01-06') }));
    withData([
      cust({ round: 'Tue', cleanHistory: [clean('2025-01-06')] }),
      cust({ round: 'Tue', cleanHistory: [clean('2025-01-06')] }),
      cust({ round: 'Tue', cleanHistory: [clean('2025-01-07')] })
    ], () => eq('roundPhases: the most common rhythm in a round wins', roundPhases()['Tue|1'], ph('2025-01-06')));
    withData([
      cust({ round: 'Tue', paused: true, cleanHistory: [clean('2025-01-06')] }),
      cust({ round: 'Tue', frequencyWeeks: 8, cleanHistory: [clean('2025-01-06')] }),
      cust({ round: 'Wed', visitDay: 3, cleanHistory: [clean('2025-01-09')] })
    ], () => eq('roundPhases: paused and non-4-weekly customers are ignored, and each visit day is separate', roundPhases(), { 'Wed|3': ph('2025-01-09') }));
  });

  group('daysSinceLastPayment', () => {
    withData([], () => {
      eq('daysSinceLastPayment: nothing owed is 0', daysSinceLastPayment(cust({ cleanHistory: [clean(day(-10))], paymentHistory: [{ date: day(-9), amount: 20 }] })), 0);
      eq('daysSinceLastPayment: one unpaid clean counts from that clean', daysSinceLastPayment(cust({ cleanHistory: [clean(day(-10))] })), 10);
      eq('daysSinceLastPayment: payments cover the oldest charges first', daysSinceLastPayment(cust({ cleanHistory: [clean(day(-30)), clean(day(-10))], paymentHistory: [{ date: day(-20), amount: 20 }] })), 10);
      eq('daysSinceLastPayment: a part-payment leaves the oldest clean outstanding', daysSinceLastPayment(cust({ cleanHistory: [clean(day(-30))], paymentHistory: [{ date: day(-5), amount: 10 }] })), 30);
      eq('daysSinceLastPayment: being in credit is 0', daysSinceLastPayment(cust({ cleanHistory: [clean(day(-10))], paymentHistory: [{ date: day(-9), amount: 50 }] })), 0);
    });
  });

  group('deferredDateFor', () => {
    withData([], () => {
      eq('deferredDateFor: not yet due pushes the whole cycle out (due in 21 days + 7)', deferredDateFor(cust({ cleanHistory: [clean(day(-7))] }), 7), day(28));
      eq('deferredDateFor: already overdue counts from today', deferredDateFor(cust({ cleanHistory: [clean(day(-60))] }), 28), day(28));
      eq('deferredDateFor: defaults to 28 days', deferredDateFor(cust({ cleanHistory: [clean(day(-60))] })), day(28));
      eq('deferredDateFor: deferring again stacks on the existing deferral', deferredDateFor(cust({ cleanHistory: [clean(day(-60))], deferUntil: day(40) }), 7), day(47));
      eq('deferredDateFor: an existing deferral that has already passed is ignored', deferredDateFor(cust({ cleanHistory: [clean(day(-60))], deferUntil: day(-3) }), 7), day(7));
    });
  });

  group('quoteNeedsFollowUp', () => {
    const q = o => Object.assign({ status: 'pending', date: day(-7), followUpDays: 7, quoteFollowUpCount: 0 }, o);
    yes('quoteNeedsFollowUp: due exactly on the follow-up day', quoteNeedsFollowUp(q({}), T));
    eq('quoteNeedsFollowUp: not due the day before', quoteNeedsFollowUp(q({ date: day(-6) }), T), false);
    eq('quoteNeedsFollowUp: accepted or declined quotes never need chasing', quoteNeedsFollowUp(q({ status: 'accepted' }), T), false);
    eq('quoteNeedsFollowUp: each chase doubles the wait (not due at 13 days after one chase)', quoteNeedsFollowUp(q({ date: day(-13), quoteFollowUpCount: 1 }), T), false);
    yes('quoteNeedsFollowUp: each chase doubles the wait (due at 14 days after one chase)', quoteNeedsFollowUp(q({ date: day(-14), quoteFollowUpCount: 1 }), T));
  });

  group('syncMergeArray', () => {
    eq('syncMergeArray: entries added on each device both survive', syncMergeArray(['a'], ['a', 'b'], ['a', 'c']), ['a', 'b', 'c']);
    eq('syncMergeArray: a removal on one device is respected', syncMergeArray(['a', 'b'], ['a', 'b'], ['a']), ['a']);
    eq('syncMergeArray: removal on one device and an addition on the other both apply', syncMergeArray(['a', 'b'], ['a'], ['a', 'b', 'c']), ['a', 'c']);
    eq('syncMergeArray: genuine duplicates are kept', syncMergeArray([], ['x', 'x'], ['x']), ['x', 'x']);
    eq('syncMergeArray: message logs come out newest first', syncMergeArray([], [{ time: 3, kind: 'a' }], [{ time: 5, kind: 'b' }]).map(x => x.time), [5, 3]);
    const many = []; for(let i = 1; i <= 35; i++) many.push({ time: i, kind: 'k' });
    eq('syncMergeArray: message logs are capped at 30', syncMergeArray([], many, []).length, 30);
  });

  group('syncMergeStates', () => {
    const S = (customers, settings) => ({ customers, oneOffJobs: [], quotes: [], mileageLog: [], settings: settings || {} });
    const merge = (b, l, r, pref) => syncMergeStates(b, l, r, { preferRemote: !!pref });
    const c1 = { id: 'c1', name: 'Anna', phone: '555', price: 10 };
    const c2 = { id: 'c2', name: 'Ben', phone: '', price: 12 };
    const c3 = { id: 'c3', name: 'Cat', phone: '', price: 14 };
    const ids = res => res.merged.customers.map(x => x.id).sort();
    const get = (res, id) => res.merged.customers.find(x => x.id === id);
    const base = S([c1, c2]);

    let res = merge(base, S([c1, c2]), S([c1, c2, c3]));
    eq('syncMergeStates: a customer added on the other device arrives (and is counted as added)', [ids(res), res.stats.customers.added], [['c1', 'c2', 'c3'], 1]);
    res = merge(base, S([c1, c2, c3]), S([c1, c2]));
    eq('syncMergeStates: a customer added here stays', ids(res), ['c1', 'c2', 'c3']);
    res = merge(base, S([c1, c2]), S([Object.assign({}, c1, { price: 15 }), c2]));
    eq('syncMergeStates: an edit on the other device is taken', get(res, 'c1').price, 15);
    res = merge(base, S([Object.assign({}, c1, { price: 11 }), c2]), S([Object.assign({}, c1, { phone: '999' }), c2]));
    eq('syncMergeStates: edits to different fields both survive', [get(res, 'c1').price, get(res, 'c1').phone, res.clashes.length], [11, '999', 0]);
    res = merge(base, S([Object.assign({}, c1, { price: 11 }), c2]), S([Object.assign({}, c1, { price: 15 }), c2]));
    const clashRemote = merge(base, S([Object.assign({}, c1, { price: 11 }), c2]), S([Object.assign({}, c1, { price: 15 }), c2]), true);
    eq('syncMergeStates: the same field changed on both devices is a clash (this device\'s value kept, or the other\'s when preferred)', [res.clashes.length, get(res, 'c1').price, get(clashRemote, 'c1').price], [1, 11, 15]);
    res = merge(base, S([Object.assign({}, c1, { phone: '07' }), c2]), S([Object.assign({}, c1, { phone: '' }), c2]));
    eq('syncMergeStates: blank on one side and filled on the other is not a clash', [get(res, 'c1').phone, res.clashes.length], ['07', 0]);
    res = merge(base, S([c1, c2]), S([c1]));
    eq('syncMergeStates: a customer deleted on the other device (and untouched here) is removed', [ids(res), res.stats.customers.removed], [['c1'], 1]);
    res = merge(base, S([c1, Object.assign({}, c2, { price: 13 })]), S([c1]));
    eq('syncMergeStates: a customer deleted there but edited here is kept', [ids(res), res.stats.customers.kept], [['c1', 'c2'], 1]);
    res = merge(base, S([c1]), S([c1, c2]));
    eq('syncMergeStates: a customer deleted here (and untouched there) stays deleted', ids(res), ['c1']);
    res = merge(base, S([c1]), S([c1, Object.assign({}, c2, { price: 13 })]));
    eq('syncMergeStates: a customer deleted here but edited there comes back', [ids(res), res.stats.customers.restored], [['c1', 'c2'], 1]);
    res = merge(S([]), S([{ id: 'ca', name: 'A', accountNumber: '1002' }], { nextAccountNumber: 1002 }), S([{ id: 'cb', name: 'B', accountNumber: '1002' }], { nextAccountNumber: 1002 }));
    eq('syncMergeStates: two customers given the same account number on different devices are renumbered', [get(res, 'ca').accountNumber, get(res, 'cb').accountNumber, res.renumbered], ['1002', '1003', 1]);
    res = merge(S([], { companyName: 'X', yourName: 'Y' }), S([], { companyName: 'X', yourName: 'Z' }), S([], { companyName: 'W', yourName: 'Y' }));
    eq('syncMergeStates: settings changed on different devices are combined field by field', [res.merged.settings.companyName, res.merged.settings.yourName], ['W', 'Z']);
    res = merge(
      S([], { marketingCampaigns: [{ id: 'g', name: 'G', body: 'a' }] }),
      S([], { marketingCampaigns: [{ id: 'g', name: 'G', body: 'a' }, { id: 'n', name: 'N', body: 'x' }] }),
      S([], { marketingCampaigns: [{ id: 'g', name: 'G', body: 'b' }] }));
    eq('syncMergeStates: marketing campaigns merge entry by entry', res.merged.settings.marketingCampaigns.map(x => x.id + ':' + x.body), ['g:b', 'n:x']);
    res = merge(S([], { nextAccountNumber: 1005 }), S([], { nextAccountNumber: 1010 }), S([], { nextAccountNumber: 1020 }));
    eq('syncMergeStates: nextAccountNumber takes the higher value instead of clashing', [res.merged.settings.nextAccountNumber, res.clashes.length], [1020, 0]);
    const withCamps = n => ({ yourName: n, marketingCampaigns: [] });
    const same2 = merge(S([], withCamps('A')), S([], withCamps('A')), S([], withCamps('A')));
    const changed2 = merge(S([], withCamps('A')), S([], withCamps('A')), S([], withCamps('B')));
    eq('syncMergeStates: settings are reported as changed only when the other device changed them', [same2.stats.settingsChanged, changed2.stats.settingsChanged], [false, true]);
  });

  group('date helpers', () => {
    const d = isoToDate('2025-03-30');
    eq('isoToDate: gives local midnight on that date', [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2025, 2, 30, 0]);
    eq('addDaysISO: crosses a month and year end', [addDaysISO('2025-12-30', 3), addDaysISO('2025-03-01', -1)], ['2026-01-02', '2025-02-28']);
    eq('addDaysISO: stays right across the clocks changing (spring and autumn)', [addDaysISO('2025-03-29', 2), addDaysISO('2025-10-25', 2)], ['2025-03-31', '2025-10-27']);
    eq('lastOf / lastDateOf: pick the latest however the list is ordered', [lastOf(['2025-02-01', '2025-03-01', '2025-01-01']), lastDateOf([{ date: '2025-02-01' }, { date: '2025-03-01' }, { date: '2025-01-01' }])], ['2025-03-01', '2025-03-01']);
    eq('lastOf / lastDateOf: empty or missing lists give null', [lastOf([]), lastDateOf(null), lastDateOf([])], [null, null, null]);
  });

  group('mailtoAddress', () => {
    eq('mailtoAddress: an ordinary address is left alone', mailtoAddress('anna@example.com'), 'anna@example.com');
    eq('mailtoAddress: ? & # cannot be used to add recipients or headers', mailtoAddress('a@b.com?bcc=x@y.com&cc=z'), 'a@b.com%3Fbcc=x@y.com%26cc=z');
  });

  group('syncStable / syncEq', () => {
    eq('syncStable: keys sorted, missing values dropped, odd numbers null', syncStable({ b: 1, a: [true, null, undefined, NaN], c: undefined, d: 'x"y' }), '{"a":[true,null,null,null],"b":1,"d":"x\\"y"}');
    eq('syncStable: unicode and nesting', syncStable({ z: { y: 'é', x: [] } }), '{"z":{"x":[],"y":"é"}}');
    yes('syncEq: the same data with keys in a different order is equal', syncEq({ a: 1, b: { c: 2, d: [1, 2] } }, { b: { d: [1, 2], c: 2 }, a: 1 }));
    eq('syncEq: different data is not equal', syncEq({ a: 1 }, { a: 2 }), false);
  });

  await agroup('sync encryption', async () => {
    const salt = syncB64(crypto.getRandomValues(new Uint8Array(16)));
    const key = await syncDeriveKey('correct horse battery staple', salt);
    const wrongKey = await syncDeriveKey('a different passphrase', salt);
    const payload = { customers: [{ id: 'c1', name: 'Zoë Müller', notes: '東京 ✓', price: 12.5 }], big: 'x'.repeat(5000) };
    const env = JSON.parse(await syncEncrypt(payload, key, salt));
    eq('encryption: what goes in comes back out unchanged', await syncDecrypt(env, key), payload);
    eq('encryption: the wrong passphrase gets nothing back', await syncDecrypt(env, wrongKey), null);
    eq('encryption: a tampered file is rejected', await syncDecrypt(Object.assign({}, env, { ct: env.ct.slice(0, -6) + (env.ct.slice(-6) === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA') }), key), null);
    eq('encryption: a file with its salt label altered is rejected', await syncDecrypt(Object.assign({}, env, { salt: syncB64(crypto.getRandomValues(new Uint8Array(16))) }), key), null);
    const plainEnv = JSON.parse(await syncEncrypt(payload, key, salt, { compress: false }));
    eq('encryption: uncompressed files (photos) round-trip too', [plainEnv.z, await syncDecrypt(plainEnv, key)], [0, payload]);
  });

  const failed = results.filter(r => !r.pass);
  console.log('Round Book self-tests: ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
  failed.forEach(r => console.error('FAIL: ' + r.name + (r.detail ? ' — ' + r.detail : '')));
  return { total: results.length, passed: results.length - failed.length, failed };
}
// Only when the address ends ?test or #test — never during normal use.
if(/[?&#]test(?:[=&#]|$)/i.test(location.search + location.hash)){
  window.addEventListener('load', () => setTimeout(async () => {
    toast('Running self-tests…');
    const r = await runSelfTests();
    toast(r.failed.length ? `Tests: ${r.passed} passed, ${r.failed.length} FAILED (details in the console)` : `Tests: all ${r.passed} passed`);
  }, 1500));
}
