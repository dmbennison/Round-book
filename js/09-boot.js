/* 09-boot.js -- Small utilities, then the app's actual startup sequence -- must load last, since it calls functions defined in every file above.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html. */

/* ---------- util ---------- */
function escapeHtml(str){
  return String(str||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function escapeAttr(str){ return escapeHtml(str); }

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
  const sync = () => document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  if(window.ResizeObserver) new ResizeObserver(sync).observe(header);
  // The tab bar is fixed to the bottom; keep its measured height too, so the page, the + button and
  // pop-up messages sit just above it.
  const bar = document.getElementById('tabBar');
  if(bar){
    const syncBar = () => document.documentElement.style.setProperty('--tabbar-h', bar.offsetHeight + 'px');
    syncBar();
    window.addEventListener('resize', syncBar);
    window.addEventListener('orientationchange', syncBar);
    if(window.ResizeObserver) new ResizeObserver(syncBar).observe(bar);
  }
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
