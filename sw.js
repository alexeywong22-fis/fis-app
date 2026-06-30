// FIS Service Worker
// 策略：HTML = network-first（線上永遠攞最新，唔會鎖喺舊版）；靜態 = cache-first。
// 全部相對路徑（唔寫死 /fis-app/），方便日後搬去 root domain。
// 更新：install 即 skipWaiting + activate claim，新版 SW 即刻接管並清舊 cache。

const CACHE = 'fis-v5';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './html2canvas.min.js',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  // 只處理同源（Pages / 將來 root domain）。Gemini / Worker API（另一 origin）、字型 CDN 一律唔掂。
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isHTML) {
    // network-first：online 攞最新 index.html，失敗先用 cache（離線 fallback）
    e.respondWith((async function () {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone()).catch(function () {});
        return fresh;
      } catch (err) {
        const cached = (await caches.match(req)) || (await caches.match('./index.html'));
        return cached || Response.error();
      }
    })());
    return;
  }

  // 靜態（icon/manifest 等）：cache-first
  e.respondWith((async function () {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone()).catch(function () {});
      }
      return fresh;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
