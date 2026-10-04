/* 07b-fuel.js -- Cheapest diesel near you, shown in the Today tab's Mileage box.
   Tap the line for the garage's name, address and a button that opens directions.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html.

   Where the prices come from: the UK Government's Fuel Finder scheme (every
   participating forecourt must report its pump prices within 30 minutes of a change),
   read through FuelCosts.co.uk's free public API, which needs no key. The official
   Fuel Finder API itself needs a secret login, so it can't be called straight from an
   app like this. Only your approximate location (rounded to about 1 km) is sent.
   The Mileage box always says what is happening (checking / unavailable / no prices /
   the price); tapping a status opens a screen with the reason and technical details. */
const FUEL_API = 'https://fuelcosts.co.uk/api/stations';
const FUEL_CACHE_KEY = 'roundBookFuelCache';
const FUEL_REFRESH_MS = 30 * 60 * 1000;   // look again at most every 30 minutes
const FUEL_RETRY_MS = 10 * 60 * 1000;     // after a failure, wait 10 minutes
const FUEL_SHOW_MAX_AGE_MS = 6 * 3600000; // hide a reading older than 6 hours
const FUEL_PRICE_MAX_AGE_MS = 7 * 86400000; // ignore a station price not updated for a week
const FUEL_RADII = [5, 10, 15, 25];

function fuelEnabled(){ return data.settings.fuelShow !== false; }
function fuelRadius(){ return FUEL_RADII.includes(data.settings.fuelRadiusMiles) ? data.settings.fuelRadiusMiles : 10; }
function fuelCacheGet(){
  try{ return JSON.parse(localStorage.getItem(FUEL_CACHE_KEY)) || null; }catch(e){ return null; }
}
function fuelCacheSet(obj){
  try{ localStorage.setItem(FUEL_CACHE_KEY, JSON.stringify(obj)); }catch(e){}
}

/* ---------- reading the response (tolerant: the field names aren't guaranteed) ---------- */
function fuelNum(v){
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return (typeof n === 'number' && isFinite(n)) ? n : null;
}
// Pence per litre, e.g. 142.9. Accepts pounds (1.429) too; rejects anything implausible.
function fuelPence(v){
  let n = fuelNum(v);
  if(n == null) return null;
  if(n > 0 && n < 5) n = n * 100;
  return (n >= 100 && n <= 350) ? Math.round(n * 10) / 10 : null;
}
function fuelListFrom(json){
  if(Array.isArray(json)) return json;
  if(!json || typeof json !== 'object') return [];
  for(const k of ['stations', 'data', 'results', 'items', 'forecourts']){
    if(Array.isArray(json[k])) return json[k];
    if(json[k] && typeof json[k] === 'object' && Array.isArray(json[k].stations)) return json[k].stations;
  }
  return [];
}
// "B7_STANDARD", "B7", "Diesel", "Diesel (B7)", "Standard Diesel" — but not premium/super/HVO.
function fuelIsStandardDiesel(label){
  const t = String(label || '');
  return /B7|diesel/i.test(t) && !/premium|super|SDV|HVO|B10|heating|red/i.test(t);
}
// First numeric value under a key that looks like a price (price, pricePence, pence_per_litre, ppl…).
function fuelPriceFromObject(o){
  if(!o || typeof o !== 'object') return null;
  for(const k of ['price', 'pence', 'pencePerLitre', 'pence_per_litre', 'pricePence', 'price_pence', 'ppl', 'value', 'amount']){
    if(o[k] != null){ const p = fuelPence(o[k]); if(p != null) return p; }
  }
  for(const k of Object.keys(o)){
    if(/price|pence|ppl/i.test(k)){ const p = fuelPence(o[k]); if(p != null) return p; }
  }
  return null;
}
function fuelDieselOf(st){
  const stamp = e => e && (e.updatedAt || e.updated_at || e.updated || e.priceLastUpdated || e.lastUpdated || e.timestamp || e.recordedAt);
  for(const key of ['prices', 'fuels', 'fuelPrices', 'fuel_prices']){
    const p = st[key];
    if(Array.isArray(p)){
      for(const e of p){
        if(fuelIsStandardDiesel(e && (e.fuelType || e.fuel_type || e.fuel || e.type || e.code))){
          return {pence: fuelPriceFromObject(e), at: stamp(e) || stamp(st)};
        }
      }
    } else if(p && typeof p === 'object'){
      for(const k of Object.keys(p)){
        if(fuelIsStandardDiesel(k)){
          const v = p[k];
          return {pence: (v && typeof v === 'object') ? fuelPriceFromObject(v) : fuelPence(v), at: stamp(v && typeof v === 'object' ? v : null) || stamp(st)};
        }
      }
    }
  }
  // Flat shapes: {price: 142.9} when the request was already filtered to diesel, or {B7_STANDARD: 142.9}
  for(const k of Object.keys(st)){
    if(fuelIsStandardDiesel(k) && (typeof st[k] === 'number' || typeof st[k] === 'string')) return {pence: fuelPence(st[k]), at: stamp(st)};
  }
  const kind = st.fuel || st.fuelType || st.fuel_type;
  if((kind == null || fuelIsStandardDiesel(kind)) && st.price != null) return {pence: fuelPence(st.price), at: stamp(st)};
  return null;
}
function fuelStationFrom(st, here){
  if(!st || typeof st !== 'object') return null;
  const d = fuelDieselOf(st);
  if(!d || d.pence == null) return null;
  if(d.at){
    const t = Date.parse(d.at);
    if(!isNaN(t) && Date.now() - t > FUEL_PRICE_MAX_AGE_MS) return null; // stale
  }
  const loc = st.location || st.coordinates || st.position || {};
  const lat = fuelNum(st.lat != null ? st.lat : (st.latitude != null ? st.latitude : (loc.lat != null ? loc.lat : loc.latitude)));
  const lng = fuelNum(st.lon != null ? st.lon : (st.lng != null ? st.lng : (st.longitude != null ? st.longitude : (loc.lon != null ? loc.lon : (loc.lng != null ? loc.lng : loc.longitude)))));
  let address = '';
  if(typeof st.address === 'string') address = st.address;
  else if(st.address && typeof st.address === 'object'){
    address = ['line1', 'addressLine1', 'address1', 'street', 'line2', 'town', 'city', 'county', 'postcode'].map(k => st.address[k]).filter(Boolean).join(', ');
  }
  const postcode = st.postcode || st.postCode || (st.address && st.address.postcode) || '';
  if(postcode && address.indexOf(postcode) === -1) address = [address, postcode].filter(Boolean).join(', ');
  if(!address) address = [st.town || st.city, postcode].filter(Boolean).join(', ');
  let miles = fuelNum(st.distance != null ? st.distance : (st.distanceMiles != null ? st.distanceMiles : st.distance_miles));
  if(miles == null && here && lat != null && lng != null) miles = haversineKm(here.lat, here.lng, lat, lng) * 0.621371;
  return {
    name: String(st.name || st.stationName || st.siteName || st.tradingName || st.trading_name || '').trim(),
    brand: String(st.brand || st.brandName || st.brand_name || '').trim(),
    address, lat, lng, pence: d.pence, at: d.at || null,
    miles: miles != null ? Math.round(miles * 10) / 10 : null
  };
}
function fuelStationLabel(s){
  if(s.brand && s.name && s.name.toLowerCase().indexOf(s.brand.toLowerCase()) === -1) return `${s.brand} ${s.name}`;
  return s.name || s.brand || 'Garage';
}

/* ---------- fetching ---------- */
function fuelGetPosition(){
  return new Promise(resolve => {
    if(!navigator.geolocation){ resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
      () => resolve(null),
      {enableHighAccuracy:false, timeout:10000, maximumAge:600000}
    );
  });
}
let fuelFetching = false;
function fuelSample(v){
  let t = '';
  try{ t = JSON.stringify(v); }catch(e){}
  return (t || '').slice(0, 700);
}
// One request. Returns what happened so the status screen can explain a failure.
async function fuelAttempt(label, params, here){
  const url = `${FUEL_API}?${params}`;
  const rec = {label, url: url.replace(FUEL_API, '/api/stations'), status:null, ok:false, keys:'', listLength:0, parsed:0, sample:'', error:''};
  let json = null;
  try{
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 12000) : null;
    const res = await fetch(url, {headers:{Accept:'application/json'}, signal: ctl ? ctl.signal : undefined});
    if(timer) clearTimeout(timer);
    rec.status = res.status;
    if(!res.ok){ rec.error = 'The price service answered with an error (HTTP ' + res.status + ').'; }
    else { json = await res.json(); }
  }catch(e){
    rec.error = (e && e.name === 'AbortError') ? 'The price service took too long to answer.'
      : (e && e.name === 'TypeError') ? 'Couldn\'t reach the price service — you may be offline, or it doesn\'t allow requests from apps.'
      : 'Couldn\'t read the price service\'s answer (' + ((e && e.message) || 'unknown error') + ').';
  }
  let stations = [];
  if(json){
    rec.keys = Array.isArray(json) ? '[array]' : (json && typeof json === 'object' ? Object.keys(json).slice(0, 12).join(', ') : typeof json);
    const list = fuelListFrom(json);
    rec.listLength = list.length;
    rec.sample = fuelSample(list[0] !== undefined ? list[0] : json);
    stations = list.map(s => fuelStationFrom(s, here)).filter(Boolean);
    rec.parsed = stations.length;
    rec.ok = true;
    if(!stations.length && !rec.error) rec.error = list.length ? 'The service answered, but no standard-diesel prices could be read from it.' : 'The service found no garages in range.';
  }
  return {rec, stations};
}
async function refreshFuelPrices(force){
  if(!fuelEnabled() || fuelFetching) return;
  const now = Date.now();
  const prev = fuelCacheGet();
  if(!force && prev){
    const age = now - (prev.time || 0);
    if(prev.ok && age < FUEL_REFRESH_MS && prev.radius === fuelRadius()) return;
    if(!prev.ok && age < FUEL_RETRY_MS) return;
  }
  fuelFetching = true; fuelUpdateTile();
  const keep = prev && prev.stations ? prev.stations : [];
  try{
    const here = await fuelGetPosition();
    if(!here){
      fuelCacheSet({ok:false, time:now, error:'Location is needed to find nearby garages — allow it for Round Book in your device settings.', stations:keep, radius:fuelRadius(), attempts:[]});
      return;
    }
    const lat = here.lat.toFixed(2), lng = here.lng.toFixed(2); // ~1 km: all that's sent
    const base = `lat=${lat}&lon=${lng}&radius=${fuelRadius()}`;
    const attempts = [], found = [];
    // First ask for diesel only, cheapest first; if that gives nothing usable, ask for everything nearby and pick the diesel out.
    for(const [label, params] of [['diesel only', `${base}&fuel=B7_STANDARD&sort=price&perPage=25`], ['all fuels', `${base}&sort=distance&perPage=50`]]){
      const r = await fuelAttempt(label, params, here);
      attempts.push(r.rec);
      if(r.stations.length){ found.push(...r.stations); break; }
    }
    found.sort((a, b) => (a.pence - b.pence) || ((a.miles == null ? 99 : a.miles) - (b.miles == null ? 99 : b.miles)));
    const last = attempts[attempts.length - 1];
    if(found.length){
      fuelCacheSet({ok:true, time:now, radius:fuelRadius(), count:found.length, stations:found.slice(0, 3), attempts});
    } else {
      // keep showing the previous good reading (if any) behind the failure
      fuelCacheSet({ok:attempts.some(a => a.ok), time:now, radius:fuelRadius(), count:0, error:(last && last.error) || 'No prices found.', stations:keep, attempts});
    }
  }finally{
    fuelFetching = false;
    fuelUpdateTile();
  }
}

/* ---------- the line in the Mileage box ---------- */
function fuelPillHtml(inner, color, bg, title){
  return `<div onclick="event.stopPropagation(); openCheapestDiesel()" title="${title}" style="margin-top:8px; display:inline-flex; align-items:center; gap:5px; background:${bg}; color:${color}; border-radius:20px; padding:4px 10px; font-size:0.75rem; font-weight:800; max-width:100%;">${inner}</div>`;
}
// Always says what's going on: the price, "checking", or why there isn't one.
function fuelLineHtml(){
  if(!fuelEnabled()) return '';
  const c = fuelCacheGet();
  const fresh = c && c.stations && c.stations.length && Date.now() - (c.time || 0) <= FUEL_SHOW_MAX_AGE_MS;
  if(fresh && c.ok){
    const s = c.stations[0];
    return fuelPillHtml(`⛽ <span>${s.pence.toFixed(1)}p</span><span style="font-weight:700; opacity:0.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fuelStationLabel(s))}${s.miles != null ? ' · ' + s.miles + ' mi' : ''}</span>`, 'var(--green)', 'var(--green-dim)', 'Cheapest diesel nearby — tap for the garage');
  }
  if(fuelFetching) return fuelPillHtml('⛽ Checking diesel prices…', 'var(--ink-muted)', 'var(--line)', 'Looking up the cheapest diesel nearby');
  if(!c) return fuelPillHtml('⛽ Diesel prices — tap to check', 'var(--ink-muted)', 'var(--line)', 'Not checked yet');
  if(c.ok && !(c.stations && c.stations.length)) return fuelPillHtml(`⛽ No diesel prices found within ${c.radius || fuelRadius()} mi — tap for details`, 'var(--amber)', 'var(--amber-dim, var(--line))', 'No prices found');
  if(c.stations && c.stations.length) return fuelPillHtml('⛽ Diesel prices out of date — tap to refresh', 'var(--amber)', 'var(--amber-dim, var(--line))', 'The last reading is old');
  return fuelPillHtml('⛽ Diesel prices unavailable — tap for details', 'var(--amber)', 'var(--amber-dim, var(--line))', 'Couldn\'t get diesel prices');
}
function fuelUpdateTile(){
  const el = document.getElementById('fuelLine');
  if(el) el.innerHTML = fuelLineHtml();
}

/* ---------- the garage screen ---------- */
function fuelMapsLink(s, mode){
  const q = (s.lat != null && s.lng != null) ? `${s.lat},${s.lng}` : encodeURIComponent([fuelStationLabel(s), s.address].filter(Boolean).join(', '));
  return mode === 'directions'
    ? `https://www.google.com/maps/dir/?api=1&destination=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
// Same hand-off as other directions in the app: a plain navigation so iOS/Android open Maps directly.
function fuelOpenMaps(i, mode){
  const c = fuelCacheGet();
  const s = c && c.stations && c.stations[i];
  if(!s) return;
  window.location.href = fuelMapsLink(s, mode);
}
function fuelUpdatedText(c){
  const d = new Date(c.time || Date.now());
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fuelStatusSheet(){
  const c = fuelCacheGet();
  const attempts = (c && c.attempts) || [];
  const details = attempts.map(a => `${a.label}: ${a.url}\n  HTTP ${a.status == null ? 'no response' : a.status}${a.error ? ' — ' + a.error : ''}\n  response keys: ${a.keys || '-'} · items: ${a.listLength} · diesel prices read: ${a.parsed}${a.sample ? '\n  first item: ' + a.sample : ''}`).join('\n\n');
  const reason = fuelFetching ? 'Checking now…' : !c ? 'Not checked yet.' : (c.error || (c.ok ? 'No diesel prices found nearby.' : 'The last check failed.'));
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Diesel prices</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <p style="color:var(--ink); font-size:0.9375rem; font-weight:700; line-height:1.5; margin:0 2px 8px;">${escapeHtml(reason)}</p>
    <p style="color:var(--ink-muted); font-size:0.8125rem; line-height:1.5; margin:0 2px 14px;">Round Book looks up the cheapest standard diesel within ${fuelRadius()} miles using your location (rounded to about 1 km). Prices come from the UK Government's Fuel Finder scheme via FuelCosts.co.uk.</p>
    <button class="btn-primary" style="width:100%; margin-bottom:12px;" onclick="fuelRefreshNow(true)">Check again now</button>
    ${details ? `<div class="section-label">Technical details</div>
    <textarea readonly rows="9" style="font-size:0.6875rem; font-family:ui-monospace,Menlo,monospace;" onclick="this.select()">${escapeHtml(details)}</textarea>
    <p style="color:var(--ink-muted); font-size:0.7188rem; margin:6px 2px 0;">Tap the box to select it all — handy to copy and send if you're asking for help getting this working.</p>` : ''}
  `);
}
function openCheapestDiesel(){
  const c = fuelCacheGet();
  if(!c || !c.ok || !c.stations || !c.stations.length || Date.now() - (c.time || 0) > FUEL_SHOW_MAX_AGE_MS){
    fuelStatusSheet();
    if(!fuelFetching && (!c || Date.now() - (c.time || 0) > FUEL_RETRY_MS)) refreshFuelPrices(true).then(() => { const sh = document.getElementById('sheet'); if(sh && /Technical details|Cheapest diesel|Checking now/.test(sh.innerHTML)) fuelStatusSheet(); });
    return;
  }
  const top = c.stations[0];
  const others = c.stations.slice(1).map((s, k) => `
    <div style="display:flex; align-items:center; gap:10px; background:var(--card-surface); border-radius:12px; padding:10px 12px; margin-bottom:8px;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:800; font-size:0.875rem; color:var(--ink);">${s.pence.toFixed(1)}p · ${escapeHtml(fuelStationLabel(s))}</div>
        <div style="font-size:0.75rem; color:var(--ink-muted); margin-top:2px;">${s.miles != null ? s.miles + ' mi' : ''}${s.address ? (s.miles != null ? ' · ' : '') + escapeHtml(s.address) : ''}</div>
      </div>
      <button class="btn btn-clean" style="flex-shrink:0; border:none; padding:8px 12px;" onclick="fuelOpenMaps(${k+1}, 'directions')">Directions</button>
    </div>`).join('');
  openSheet(`
    <div class="sheet-head">
      <h2 style="flex:1; min-width:0;">Cheapest diesel nearby</h2>
      <button class="sheet-close" onclick="closeSheet()">✕</button>
    </div>
    <div style="background:var(--card-surface); border-radius:14px; padding:16px; margin-bottom:12px;">
      <div style="font-size:1.75rem; font-weight:800; color:var(--green);">${top.pence.toFixed(1)}p <span style="font-size:0.875rem; font-weight:700; color:var(--ink-muted);">per litre</span></div>
      <div style="font-size:1rem; font-weight:800; color:var(--ink); margin-top:6px;">${escapeHtml(fuelStationLabel(top))}</div>
      ${top.address ? `<div style="font-size:0.8438rem; color:var(--ink-muted); margin-top:2px;">${escapeHtml(top.address)}</div>` : ''}
      <div style="font-size:0.8125rem; color:var(--ink-muted); margin-top:6px;">${top.miles != null ? top.miles + ' miles from you · ' : ''}within ${c.radius || fuelRadius()} miles · checked ${fuelUpdatedText(c)}</div>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:16px;">
      <button class="btn-primary" style="flex:1;" onclick="fuelOpenMaps(0, 'directions')">Directions</button>
      <button class="btn-open" style="flex:1;" onclick="fuelOpenMaps(0, 'map')">Show on map</button>
    </div>
    ${others ? `<div class="section-label">Next cheapest</div>${others}` : ''}
    <p style="color:var(--ink-muted); font-size:0.7188rem; line-height:1.5; margin:12px 2px 0;">Standard diesel. Prices are reported by the forecourts to the UK Government's Fuel Finder scheme (Open Government Licence v3.0) and read via FuelCosts.co.uk. They can be a little out of date — always check the pump.</p>
  `);
}

/* ---------- settings ---------- */
function setFuelShow(on){
  data.settings.fuelShow = !!on;
  saveData();
  if(on) refreshFuelPrices(true).then(() => openSettings()); else { render(); openSettings(); }
}
function setFuelRadius(miles){
  data.settings.fuelRadiusMiles = miles;
  saveData();
  refreshFuelPrices(true).then(() => openSettings());
}
function fuelRefreshNow(fromStatus){
  toast('Checking diesel prices…');
  refreshFuelPrices(true).then(() => { if(fromStatus === true) fuelStatusSheet(); else openSettings(); });
}
function fuelSettingsStatusText(){
  const c = fuelCacheGet();
  if(!fuelEnabled()) return 'Hidden.';
  if(!c) return 'Not checked yet.';
  if(!c.ok) return c.error || 'The last check failed.';
  if(!c.stations || !c.stations.length) return `Last checked ${fuelUpdatedText(c)} — no diesel prices found within ${c.radius} miles.`;
  const s = c.stations[0];
  return `Last checked ${fuelUpdatedText(c)} — cheapest ${s.pence.toFixed(1)}p at ${fuelStationLabel(s)}.`;
}
