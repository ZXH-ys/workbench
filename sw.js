// 班主任工作台 Service Worker
// 策略：网络优先（保证每次部署更新立即可见），离线时回退到缓存壳
// 缓存版本：每次发布递增，activate 阶段会自动清掉旧缓存
const CACHE = 'wb-shell-v5';
const ASSETS = [
  './',
  './index.html',
  './app.js?v=20260829d',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 接口响应一律不缓存、不回退缓存：
  // 1) /api/data 是账号数据，缓存后换账号登录会短暂看到上一个账号的内容；
  // 2) 离线时拿旧数据糊弄用户，比直接报错更容易造成「改了没保存」的误会。
  if (url.pathname.indexOf('/api/') === 0) return;
  // 只缓存同源静态资源，避免把 CDN 上的第三方响应塞进自己的缓存
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const net = await fetch(e.request);
      const c = await caches.open(CACHE);
      c.put(e.request, net.clone());
      return net;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
