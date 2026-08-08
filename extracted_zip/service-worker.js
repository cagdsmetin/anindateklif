const CACHE_NAME = 'anindateklif-v2';
const APP_SHELL = ['./manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // CDN kütüphaneleri (html2canvas, pdf-lib, xlsx) direkt ağdan

  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isPage) {
    // Ana sayfa: HER ZAMAN önce ağdan (internet) taze sürümü almaya çalış.
    // Sadece çevrimdışıysan (internet yoksa) önbellekteki son sürümü göster.
    event.respondWith(
      fetch(event.request).then((res) => {
        caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // İkon/manifest gibi nadiren değişen dosyalar: önce önbellek, hızlı olsun.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
