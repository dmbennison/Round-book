/* 07b-fuel.js -- Cheapest diesel near you, shown in the Today tab's Mileage box.
   Tap the line for the garage's name, address and a button that opens directions.
   Part of Round Book's split JS bundle; loaded in numeric order from index.html.

   Where the prices come from: the UK Government's Fuel Finder scheme (every
   participating forecourt must report its pump prices within 30 minutes of a change),
   read through FuelCosts.co.uk's free public API, which needs no key. The official
   Fuel Finder API itself needs a secret login, so it can't be called straight from an
   app like this. Only your approximate location (rounded to about 1 km) is sent.
   If the service is down, blocks the request, or location is off, the line simply
   doesn't appear — Settings shows the reason. */
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
function fuelIsStandardDiesel(label){
  const t = String(label || '');
  return /B7.?STANDARD|^B7$|^diesel$|standard.?diesel/i.test(t) && !/premium|super/i.test(t);
}
function fuelDieselOf(st){
  const stamp = e => e && (e.updatedAt || e.updated_at || e.updated || e.priceLastUpdated || e.lastUpdated || e.timestamp || e.recordedAt);
  for(const key of ['prices', 'fuels', 'fuelPrices', 'fuel_prices']){
    const p = st[key];
    if(Array.isArray(p)){
      for(const e of p){
        if(fuelIsStandardDiesel(e && (e.fuelType || e.fuel_type || e.fuel || e.type || e.code))){
          return {pence: fuelPence(e.price != null ? e.price : (e.pencePerLitre != null ? e.pencePerLitre : (e.pence != null ? e.pence : e.value))), at: stamp(e) || stamp(st)};
        }
      }
    } else if(p && typeof p === 'object'){
      for(const k of Object.keys(p)){
        if(fuelIsStandardDiesel(k)){
          const v = p[k];
          const raw = (v && typeof v === 'object') ? (v.price != null ? v.price : (v.pence != null ? v.pence : v.value)) : v;
          return {pence: fuelPence(raw), at: stamp(v && typeof v === 'object' ? v : null) || stamp(st)};
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
async function refreshFuelPrices(force){
  if(!fuelEnabled()) return;
  const now = Date.now();
  const prev = fuelCacheGet();
  if(!force && prev){
    const age = now - (prev.time || 0);
    if(prev.ok && age < FUEL_REFRESH_MS && prev.radius === fuelRadius()) return;
    if(!prev.ok && age < FUEL_RETRY_MS) return;
  }
  const keep = prev && prev.stations ? prev.stations : [];
  const fail = (msg) => { fuelCacheSet({ok:false, time:now, error:msg, stations:keep, radius:fuelRadius()}); fuelUpdateTile(); };
  const here = await fuelGetPosition();
  if(!here){ fail('Location is needed to find nearby garages — allow it for Round Book in your device settings.'); return; }
  const lat = here.lat.toFixed(2), lng = here.lng.toFixed(2); // ~1 km: all that's sent
  const url = `${FUEL_API}?lat=${lat}&lon=${lng}&radius=${fuelRadius()}&fuel=B7_STANDARD&sort=price&perPage=20`;
  try{
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 12000) : null;
    const res = await fetch(url, {headers:{Accept:'application/json'}, signal: ctl ? ctl.signal : undefined});
    if(timer) clearTimeout(timer);
    if(!res.ok) throw new Error('The price service answered with an error (' + res.status + ')');
    const json = await res.json();
    const stations = fuelListFrom(json).map(s => fuelStationFrom(s, here)).filter(Boolean)
      .sort((a, b) => (a.pence - b.pence) || ((a.miles == null ? 99 : a.miles) - (b.miles == null ? 99 : b.miles)));
    fuelCacheSet({ok:true, time:now, radius:fuelRadius(), count:stations.length, stations:stations.slice(0, 3)});
  }catch(e){
    const blocked = e && e.name === 'TypeError';
    fail(blocked ? 'Couldn\'t reach the price service (you may be offline, or it doesn\'t allow requests from apps).' : (e && e.message) || 'Couldn\'t load prices.');
    return;
  }
  fuelUpdateTile();
}

/* ---------- the line in the Mileage box ---------- */
function fuelLineHtml(){
  if(!fuelEnabled()) return '';
  const c = fuelCacheGet();
  if(!c || !c.stations || !c.stations.length || Date.now() - (c.time || 0) > FUEL_SHOW_MAX_AGE_MS) return '';
  const s = c.stations[0];
  return `<div onclick="event.stopPropagation(); openCheapestDiesel()" title="Cheapest diesel nearby — tap for the garage" style="margin-top:8px; display:inline-flex; align-items:center; gap:5px; background:var(--green-dim); color:var(--green); border-radius:20px; padding:4px 10px; font-size:0.75rem; font-weight:800; max-width:100%;">⛽ <span>${s.pence.toFixed(1)}p</span><span style="font-weight:700; opacity:0.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fuelStationLabel(s))}${s.miles != null ? ' · ' + s.miles + ' mi' : ''}</span></div>`;
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
function openCheapestDiesel(){
  const c = fuelCacheGet();
  if(!c || !c.stations || !c.stations.length){ toast('No diesel prices to show yet'); return; }
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
function fuelRefreshNow(){
  toast('Checking diesel prices…');
  refreshFuelPrices(true).then(() => openSettings());
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
