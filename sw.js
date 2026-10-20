const CACHE_NAME = 'round-book-v3.00';

// The app itself. These are all-or-nothing: a new version only takes over once EVERY one of
// these has downloaded fresh. If any fails (a dropped connection, a half-finished deploy) the
// install fails and the version already on the phone carries on untouched, so the app can
// never end up running a mixture of old and new files.
const CORE = [
  './',
  './js/01-data.js',
  './js/02-today-rounds.js',
  './js/02b-today-run.js',
  './js/03-customers.js',
  './js/04-photos-messaging.js',
  './js/05-jobs-quotes.js',
  './js/06-settings-reports-a.js',
  './js/07-reports-b.js',
  './js/07c-schedule.js',
  './js/08-backup-import.js',
  './js/08b-sync.js',
  './js/08c-live-sync.js',
  './js/08d-desktop.js',
  './js/09-boot.js'
];

// Nice to have, but the app works without them, so a failure here never blocks an update.
const EXTRA = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Libraries the app loads on demand (see loadLib in 01-data.js). Each is kept for offline use:
// the copy in this app's own /lib/ folder if it exists, otherwise the CDN copy.
const LIB_GROUPS = [
  ['./lib/xlsx.full.min.js',   'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
  ['./lib/docx.umd.js',        'https://cdn.jsdelivr.net/npm/docx@8.2.4/build/index.umd.js'],
  ['./lib/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'],
  ['./lib/jspdf.umd.min.js',   'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],
  ['./lib/leaflet.css',        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'],
  ['./lib/leaflet.js',         'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js']
];
const CDN_LIB_URLS = new Set(LIB_GROUPS.map(g => g[1]));

// A host that answers a missing script/stylesheet with the app's home page (as single-page-app
// hosting often does) returns "200 OK" HTML. That must never be stored as if it were the library.
function isWrongType(url, response){
  const isCode = /\.(js|css)(\?|$)/i.test(url);
  const type = (response.headers && response.headers.get('content-type')) || '';
  return isCode && /text\/html/i.test(type);
}

// Safari refuses to let a service worker answer a page-load request with a
// response that was redirected (e.g. Cloudflare Pages redirecting
// /index.html -> /). To avoid ever caching that redirect flag, every
// response is re-wrapped as a plain 200 response before it's stored.
async function toPlainResponse(response){
  const body = await response.blob();
  return new Response(body, {
    status: 200,
    statusText: 'OK',
    headers: response.headers
  });
}

// `cache: 'reload'` skips the browser's own HTTP cache, which on some hosts holds files for
// several minutes and could otherwise hand an update an out-of-date copy of one file.
async function fetchFresh(url, fresh){
  const response = await fetch(url, { redirect: 'follow', cache: fresh ? 'reload' : 'default' });
  if(!response || !response.ok) throw new Error('HTTP ' + (response && response.status) + ' for ' + url);
  if(isWrongType(url, response)) throw new Error('Wrong file type for ' + url);
  return response.redirected ? await toPlainResponse(response) : response;
}

async function precache(){
  const cache = await caches.open(CACHE_NAME);
  try{
    // Download every core file first, store them only if all arrived.
    const core = await Promise.all(CORE.map(async (url) => [url, await fetchFresh(url, true)]));
    for(const [url, response] of core) await cache.put(url, response);
  }catch(e){
    await caches.delete(CACHE_NAME); // don't leave a half-filled cache behind
    throw e;                          // fails the install, so the current version stays in charge
  }
  await Promise.all(EXTRA.map(async (url) => {
    try{ await cache.put(url, await fetchFresh(url, true)); }catch(e){ /* optional */ }
  }));
  // Library groups: keep the first address that really returns the file.
  await Promise.all(LIB_GROUPS.map(async (urls) => {
    for(const url of urls){
      try{ await cache.put(url, await fetchFresh(url, false)); return; }catch(e){ /* try the next address */ }
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first, so the app works fully offline once installed. The app's own files are only ever
// replaced by installing a new version (above) — never one file at a time in the background,
// which could leave a mixture of old and new if it was interrupted part-way.
// Only the app's own files and the on-demand libraries go through here; everything else
// (route and address look-ups, live sync traffic, map pictures) goes straight to the network.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  const sameOrigin = u.origin === self.location.origin;
  if (!sameOrigin && !CDN_LIB_URLS.has(event.request.url)) return;
  if (sameOrigin && u.pathname.startsWith('/v1/')) return;

  event.respondWith((async () => {
    // A page address with something extra on the end (?test, ?utm=...) is still the same page.
    const cached = await caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
    if(cached) return cached;
    try{
      const response = await fetch(event.request, { redirect: 'follow' });
      if(response && response.ok && !isWrongType(event.request.url, response)){
        const plain = response.redirected ? await toPlainResponse(response.clone()) : response.clone();
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, plain);
      }
      return response;
    }catch(e){
      return cached;
    }
  })());
});
