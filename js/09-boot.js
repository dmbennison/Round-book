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
/* ---------- swipe actions ---------- */
let swipeState = null;
function initSwipeHandlers(){
  const main = document.getElementById('main');
  main.addEventListener('touchstart', onSwipeStart, {passive:true});
  main.addEventListener('touchmove', onSwipeMove, {passive:false});
  main.addEventListener('touchend', onSwipeEnd, {passive:true});
  main.addEventListener('touchcancel', onSwipeCancel, {passive:true});
}
function onSwipeStart(e){
  const card = e.target.closest('.cust-card[data-id]');
  if(!card) return;
  const touch = e.touches[0];
  swipeState = { card, startX: touch.clientX, startY: touch.clientY, currentX: 0, decided:false, horizontal:false };
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

  // Live-updates the revealed left label as a customer card crosses into "all
  // the way" territory, so it's clear before releasing which action will fire.
  if(isCustomer && clamped > 0){
    const bgLeft = swipeState.card.parentElement && swipeState.card.parentElement.querySelector('.swipe-bg-left');
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
  const { card, currentX, decided, horizontal } = swipeState;
  card.style.transition = 'transform 0.2s ease';
  card.style.transform = 'translateX(0)';
  const bgLeft = card.parentElement && card.parentElement.querySelector('.swipe-bg-left');
  if(bgLeft){ bgLeft.textContent = '✓ Cleaned'; bgLeft.style.background = ''; }

  if(decided && horizontal){
    const id = card.dataset.id;
    const kind = card.dataset.kind || 'customer';
    if(currentX >= SWIPE_HALF_THRESHOLD){
      if(kind === 'job') toggleJobDone(id);
      else if(kind === 'quote') markQuoteAccepted(id);
      else if(kind === 'customer' && currentX >= SWIPE_FULL_THRESHOLD) quickCleanAndPaid(id);
      else quickClean(id);
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
  swipeState.card.style.transition = 'transform 0.2s ease';
  swipeState.card.style.transform = 'translateX(0)';
  swipeState = null;
}

document.getElementById('dateNow').textContent = new Date().toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long'});

/* ---------- weather ---------- */
const WEATHER_CODES = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌦️', 56:'🌦️', 57:'🌦️',
  61:'🌧️', 63:'🌧️', 65:'🌧️', 66:'🌧️', 67:'🌧️',
  71:'🌨️', 73:'🌨️', 75:'🌨️', 77:'🌨️',
  80:'🌦️', 81:'🌧️', 82:'🌧️',
  85:'🌨️', 86:'🌨️',
  95:'⛈️', 96:'⛈️', 99:'⛈️'
};
function loadWeather(){
  const el = document.getElementById('weatherPill');
  if(!el) return;
  const cacheRaw = localStorage.getItem('roundBookWeatherCache');
  let cache = null;
  try{ cache = cacheRaw ? JSON.parse(cacheRaw) : null; }catch(e){}
  if(cache && cache.text){ el.textContent = cache.text; }

  const cacheAgeMs = cache ? (Date.now() - cache.time) : Infinity;
  if(cacheAgeMs < 30*60*1000) return; // refresh at most every 30 minutes
  if(!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(async (pos)=>{
    try{
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=precipitation_probability&forecast_days=1&timezone=auto&windspeed_unit=mph`);
      if(!res.ok) throw new Error('bad response');
      const json = await res.json();
      const cw = json && json.current_weather;
      if(!cw) throw new Error('no weather');
      const icon = WEATHER_CODES[cw.weathercode] || '🌡️';
      const temp = Math.round(cw.temperature);
      let rainChance = null;
      if(json.hourly && json.hourly.time && json.hourly.precipitation_probability){
        // Match the hourly slot to the current time, rather than using the day's peak —
        // that's the figure that actually matches what the weather app shows right now.
        const nowISO = cw.time; // e.g. "2026-08-17T14:00"
        let idx = json.hourly.time.indexOf(nowISO);
        if(idx === -1){
          // fall back to the closest hour if the exact timestamp isn't listed
          const nowMs = new Date(nowISO).getTime();
          let bestDiff = Infinity;
          json.hourly.time.forEach((t, i)=>{
            const diff = Math.abs(new Date(t).getTime() - nowMs);
            if(diff < bestDiff){ bestDiff = diff; idx = i; }
          });
        }
        if(idx !== -1) rainChance = json.hourly.precipitation_probability[idx];
      }
      const rainPart = (rainChance != null) ? ` · 🌧️ ${rainChance}%` : '';
      const windPart = (cw.windspeed != null) ? ` · 💨 ${Math.round(cw.windspeed)}mph` : '';
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const text = `${hhmm} · ${icon} ${temp}°C${rainPart}${windPart}`;
      const el2 = document.getElementById('weatherPill');
      if(el2) el2.textContent = text;
      localStorage.setItem('roundBookWeatherCache', JSON.stringify({ text, time: Date.now() }));
    }catch(e){ /* offline or blocked — leave any cached reading showing */ }
  }, ()=>{ /* permission denied — fail silently, no clutter */ }, { enableHighAccuracy:false, timeout:10000, maximumAge:600000 });
}
loadWeather();
// loadWeather() itself only actually re-fetches once its cache is 30+ minutes
// old, so calling it on a 30-minute timer (rather than only once on load) is
// what makes it keep itself current through a long open session.
setInterval(loadWeather, 30*60*1000);

/* seed a couple of example customers on very first run so the app isn't blank —
   handled inside initStorage() below, once data has actually finished loading */

// Data and photos both need to finish loading from IndexedDB before the first
// render, so every screen can rely on both `data` and photoUrlCache being ready —
// this is the one unavoidable async step at startup. Renders immediately either
// way rather than risking a stuck blank screen if IndexedDB is ever unavailable or slow.
initStorage().catch(()=>{}).finally(()=>{
  render();
  initSwipeHandlers();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
