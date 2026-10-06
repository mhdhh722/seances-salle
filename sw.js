/* Service worker : permet d'ouvrir l'appli sans réseau.
   Les fichiers de l'appli sont d'abord demandés au réseau (pour voir les mises à jour tout de suite),
   et le cache ne sert que s'il n'y a pas de réseau ou si le réseau est trop lent. */
var VERSION = 'salle-v2';
var SHELL = ['./', 'index.html', 'supabase.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return fetch(u, { cache: 'reload' }).then(function (r) { if (r.ok) return c.put(u, r); });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    var net = fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    var slow = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 3000); });
    return Promise.race([net.catch(function () { return null; }), slow]).then(function (res) {
      if (res) return res;
      return cache.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return net.catch(function () { return req.mode === 'navigate' ? cache.match('index.html') : Response.error(); });
      });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit || Response.error(); });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(staleWhileRevalidate(req)); return; }
  /* tout le reste (API Supabase comprise) n'est jamais mis en cache */
});
