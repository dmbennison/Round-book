const CACHE_NAME = 'round-book-v2.00';
const ASSETS = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './js/01-data.js',
  './js/02-today-rounds.js',
  './js/03-customers.js',
  './js/04-photos-messaging.js',
  './js/05-jobs-quotes.js',
  './js/06-settings-reports-a.js',
  './js/07-reports-b.js',
  './js/08-backup-import.js',
  './js/09-boot.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/docx@8.2.4/build/index.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
];

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

async function precache(){
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(ASSETS.map(async (url) => {
    try{
      const response = await fetch(url, { redirect: 'follow' });
      if(!response || !response.ok) return;
      const plain = response.redirected ? await toPlainResponse(response) : response;
      await cache.put(url, plain);
    }catch(e){ /* ignore individual failures, rest still cache */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: works fully offline once installed. Falls back to network,
// and updates the cache in the background when a connection is available.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);

    const networkFetch = (async () => {
      try{
        const response = await fetch(event.request, { redirect: 'follow' });
        if(response && response.ok){
          const plain = response.redirected ? await toPlainResponse(response.clone()) : response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, plain);
        }
        return response;
      }catch(e){
        return cached;
      }
    })();

    return cached || networkFetch;
  })());
});

