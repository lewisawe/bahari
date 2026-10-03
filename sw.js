const BUILD_ID = "4bcea99584f0a09c";
const CACHE_NAME = 'bahari-shell-' + BUILD_ID;
const PRECACHE = ["assets/StreamMap-ChngbPvL.js","assets/index-BtrH1Cmx.css","assets/index-Kk0HrRtr.js","assets/leaflet-Dgihpmma.css","assets/leaflet-src-Bww2kvMo.js","icons/bahari-192.png","icons/bahari-512.png","index.html","manifest.webmanifest"];
const SHELL_PREFIX = 'bahari-shell-';

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function deleteObsoleteShellCaches(currentBuildId) {
  const keep = SHELL_PREFIX + currentBuildId;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(SHELL_PREFIX) && key !== keep).map((key) => caches.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map(scopedUrl))));
});

self.addEventListener('activate', () => {
  // Activation is controlled by the client. The old page keeps its controller
  // and cache until it reloads and confirms APP_READY.
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.pathname.endsWith('/api/identify')) return;
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return cache.match(scopedUrl('index.html')) || cache.match(scopedUrl('./'));
    }));
    return;
  }

  const allowed = new Set(PRECACHE.map(scopedUrl));
  if (!allowed.has(url.href)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: false });
    return cached || fetch(request);
  }));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'GET_BUILD_ID') {
    event.source?.postMessage({ type: 'BUILD_ID', buildId: BUILD_ID });
    return;
  }
  if (event.data?.type === 'APP_READY' && event.data?.buildId === BUILD_ID) {
    event.waitUntil(deleteObsoleteShellCaches(BUILD_ID).catch((error) => {
      console.warn('[Bahari worker] cache-cleanup:', error?.name || 'Error');
    }));
  }
});
