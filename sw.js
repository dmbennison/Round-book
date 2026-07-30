const CACHE_NAME = 'round-book-v32';
const ASSETS = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
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
