// ============================================================
//  Service Worker - deixa o site funcionar mesmo SEM internet
//  (guarda a tela e o painel em cache no TV box)
// ============================================================
const CACHE = 'togo-site-v1';
const ARQUIVOS = [
  './',
  './welcome.html',
  './admin.html',
  './index.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(ARQUIVOS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  // Só controla o que é do próprio site (github.io). Firebase e rádio vão direto.
  var url = new URL(e.request.url);
  var mesmoSite = url.hostname === self.location.hostname;

  if (!mesmoSite) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        return res;
      }).catch(function() {
        // offline e sem cache: devolve a tela principal
        return caches.match('./welcome.html');
      });
    })
  );
});
