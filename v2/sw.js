const CACHE = 'workout-v25';
const FILES = ['./index.html', './manifest.json', './icon.png'];

// Install: fetch fresh copies straight from the network. `cache: 'reload'`
// bypasses the browser's HTTP cache. GitHub Pages sends max-age=600, so without
// it a new service worker could cache the OLD index.html.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Page loads: network first (always get the latest app when online),
// falling back to the cached copy when offline. Other assets: cache first.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isPage = req.mode === 'navigate' || req.url.endsWith('.html');
  if (isPage) {
    e.respondWith(
      // Fetch by URL: a navigate-mode Request can't be re-used with init options
      fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
