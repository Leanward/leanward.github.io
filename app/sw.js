/* Leanward — offline cache.
 * Bump CACHE on every release (it must match VERSION in js/config.js; a test checks).
 * This worker only ever creates or deletes caches whose names start with "leanward-", so it can't
 * disturb anything else that might share the origin (e.g. during the move off kevo00012.github.io).
 */
var CACHE = 'leanward-0.8.3';
var PREFIX = 'leanward-';
var SHELL = [
  './',
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/onest-latin-variable.woff2',
  'fonts/onest-latin-ext-variable.woff2',
  'icons/apple-touch-icon.png',
  'icons/favicon.svg',
  'icons/mark.svg',
  'icons/mark-light.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/config.js',
  'js/errors.js',
  'js/vendor/supabase.js',
  'js/sync.js',
  'js/db.js',
  'js/cloud.js',
  'js/calc/core.js',
  'js/calc/energy.js',
  'js/calc/targets.js',
  'js/calc/macros.js',
  'js/calc/plan.js',
  'js/calc/trend.js',
  'js/calc/progress.js',
  'js/calc/dri.js',
  'js/calc/nutrients.js',
  'js/model.js',
  'js/screens.js',
  'js/gtin.js',
  'js/foods.js',
  'js/diary.js',
  'js/library.js',
  'js/review.js',
  'js/diaryui.js',
  'js/foodui.js',
  'js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Network first, so updates arrive whenever you're online; the cache is the offline fallback.
// Only same-origin GETs inside Leanward's scope are handled; Supabase calls go straight to the network.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(new URL(self.registration.scope).pathname) !== 0) return;
  event.respondWith(
    // no-cache: always ask the server whether a file changed, so updates show up on the next open
    // instead of after GitHub Pages' 10-minute browser cache runs out.
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.open(CACHE).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || (req.mode === 'navigate' ? c.match('index.html') : undefined);
        });
      });
    })
  );
});
