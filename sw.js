// 班主任工作台 Service Worker
// 策略：stale-while-revalidate（缓存优先秒回 + 后台静默刷新缓存）
// 原因：后端（Railway）休眠后首次请求极慢，若网络优先会导致刷新时整页白屏数秒；
//       改为「有缓存先秒回、后台再拉新版本更新缓存」，冷后端也不再白屏。
// 注意：采用 SWR 后资源本可随后台 revalidate 自动更新；但为了确保「打开即只读锁定」这一关键修复
//       在所有设备上立即生效，本次仍主动递增缓存名 + 资源版本号，强制各端拉取新代码一次。
const CACHE = 'wb-shell-v24';
const ASSETS = [
  './',
  './index.html',
  './app.js?v=20260901g',
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
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    // stale-while-revalidate：有缓存先秒回（避免冷后端白屏），后台再拉网络更新缓存
    const network = fetch(e.request).then(res => {
      if (res && res.status === 200) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    if (cached) return cached;
    const net = await network;
    if (net) return net;
    if (e.request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
