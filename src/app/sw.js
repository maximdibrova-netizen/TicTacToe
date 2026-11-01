// Работа без интернета: при первом заходе сохраняем все игры и шрифты, дальше открываем их и без сети.
// Страницы: сначала сеть (чтобы сразу видеть новую версию), без сети или при долгом ответе — сохранённая копия.
// Шрифты и библиотека связи: сохранённая копия, если она есть.
var VERSION = '/*VER*/';
var CACHE = 'games-' + VERSION;
var PAGES = ['./', 'tochki/', 'ttt/', 'battleship/', 'checkers/', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
var FONTS = /*FONTS*/[];
var EXTRA = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];

function putFonts(cache) {
  // CSS шрифтов зависит от браузера, поэтому берём её отсюда же и сохраняем все файлы, на которые она ссылается
  return Promise.all(FONTS.map(function (u) {
    return fetch(u, { mode: 'cors' }).then(function (r) {
      if (!r.ok) return;
      return r.clone().text().then(function (css) {
        var files = (css.match(/url\((https:[^)]+)\)/g) || []).map(function (s) { return s.slice(4, -1); });
        return cache.put(u, r).then(function () {
          return Promise.all(files.map(function (f) { return fetch(f, { mode: 'cors' }).then(function (x) { if (x.ok) return cache.put(f, x); }).catch(function () {}); }));
        });
      });
    }).catch(function () {});
  }));
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(PAGES.map(function (p) { return new Request(p, { cache: 'reload' }); })).then(function () {
      return Promise.all([putFonts(c)].concat(EXTRA.map(function (u) { return fetch(u, { mode: 'cors' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); })));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('games-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function fromCache(req) { return caches.match(req, { ignoreSearch: true }); }

function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    var fallback = function () {
      if (done) return;
      fromCache(req).then(function (r) { if (r && !done) { done = true; resolve(r); } });
    };
    var t = setTimeout(fallback, 4000);           // плохая сеть — не ждём бесконечно
    fetch(req).then(function (r) {
      clearTimeout(t);
      if (r && r.ok && r.type === 'basic') { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req.url.split('?')[0].split('#')[0], cp); }); }
      if (!done) { done = true; resolve(r); }
    }).catch(function () {
      clearTimeout(t);
      fromCache(req).then(function (r) { if (!done) { done = true; resolve(r || new Response('Нет интернета, а эта страница ещё не сохранена.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); } });
    });
  });
}

function cacheFirst(req) {
  return fromCache(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r && (r.ok || r.type === 'opaque')) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); }
      return r;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname) || /peerjs@/.test(u.pathname)) { e.respondWith(cacheFirst(req)); return; }
});
