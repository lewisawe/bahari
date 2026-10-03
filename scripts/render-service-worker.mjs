export function renderServiceWorker({ buildId, assets }) {
  if (typeof buildId !== 'string' || !/^[a-f0-9]{16}$/.test(buildId)) {
    throw new TypeError('buildId must be 16 lowercase hexadecimal characters');
  }
  const urls = [...new Set(assets)].filter(Boolean).sort();
  return `const BUILD_ID = ${JSON.stringify(buildId)};
const CACHE_NAME = 'bahari-shell-' + BUILD_ID;
const PRECACHE = ${JSON.stringify(urls)};
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
`;
}
