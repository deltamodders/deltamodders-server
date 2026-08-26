self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('my-cache').then((cache) => {
      return cache.addAll([
        '/index.html',
        '/index.css',
        '/json.css',
        '/json.html',
        '/xml.css',
        '/xml.html',
        '/favicon.png',
        '/favicon-192.png',
        '/favicon-512.png',
        '/manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  fetch(e.request)
});
