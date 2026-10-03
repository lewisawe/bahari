// Cross-feature runtime evidence through Chrome DevTools Protocol.
// Requires Chrome on port 9222 and a Vite development server on port 5173.
// The script also serves the current production build at /bahari/ on port 4173
// to verify scoped offline caching and controlled service-worker activation.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_BASE = 'http://127.0.0.1:5173';
const PROD_ORIGIN = 'http://127.0.0.1:4173';
const PROD_BASE = `${PROD_ORIGIN}/bahari/`;
const CDP = 'http://127.0.0.1:9222';
const OUT = path.join(ROOT, '.agents/tasks/evidence');
const DOWNLOADS = path.join(OUT, 'downloads');
const PHOTO = path.join(ROOT, 'public/icons/bahari-192.png');
fs.mkdirSync(DOWNLOADS, { recursive: true });
for (const name of fs.readdirSync(DOWNLOADS)) fs.rmSync(path.join(DOWNLOADS, name));

let msgId = 0;
function send(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (data.error) reject(new Error(`${method}: ${JSON.stringify(data.error)}`));
      else resolve(data.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`Runtime.evaluate: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(ws, expression, label, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(ws, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function clickText(ws, pattern, selector = 'button, summary') {
  const clicked = await evaluate(ws, `(() => {
    const pattern = new RegExp(${JSON.stringify(pattern)}, 'i');
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((element) => pattern.test((element.textContent || '').trim()));
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find control matching ${pattern}`);
}

async function uploadFile(ws, selector, file) {
  const documentNode = await send(ws, 'DOM.getDocument', { depth: -1, pierce: true });
  const input = await send(ws, 'DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector,
  });
  if (!input.nodeId) throw new Error(`Could not find file input ${selector}`);
  await send(ws, 'DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
}

async function navigate(ws, url, delay = 1_000) {
  await send(ws, 'Page.navigate', { url });
  await waitFor(ws, `document.readyState === 'complete'`, `page load ${url}`);
  await sleep(delay);
}

const TILE_STATE = `(() => {
  const parsed = [...document.querySelectorAll('.leaflet-tile')]
    .map((image) => (image.src || '').match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)\\.png/))
    .filter(Boolean)
    .map((match) => ({ z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }));
  const counts = new Map();
  for (const tile of parsed) counts.set(tile.z, (counts.get(tile.z) || 0) + 1);
  const zoom = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const atZoom = parsed.filter((tile) => tile.z === zoom);
  const center = atZoom.length ? atZoom.reduce((sum, tile) => [sum[0] + tile.x, sum[1] + tile.y], [0, 0]).map((value) => value / atZoom.length) : null;
  return { zoom, center, tileCount: atZoom.length };
})()`;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function responseHeaders(contentType) {
  return [
    { name: 'Content-Type', value: contentType },
    { name: 'Cache-Control', value: 'no-store' },
  ];
}

async function verifyDevelopmentFlows(ws) {
  console.log('[browser] trust, map, AI, FHIR, storage, weather');
  const evidence = {};
  const aiRequest = deferred();
  const weatherRequest = deferred();
  let pausedWeatherRequestId = null;

  const onFetchPaused = async (event) => {
    const data = JSON.parse(event.data);
    if (data.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = data.params;
    try {
      if (request.url.includes('/api/identify')) {
        const body = JSON.parse(request.postData || '{}');
        aiRequest.resolve(body);
        const response = {
          taxonId: 'stonefly',
          confidence: 0.86,
          cues: ['Two tails visible', 'Paired leg claws'],
        };
        await send(ws, 'Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: responseHeaders('application/json'),
          body: Buffer.from(JSON.stringify(response)).toString('base64'),
        });
        return;
      }
      if (request.url.includes('api.open-meteo.com')) {
        pausedWeatherRequestId = requestId;
        weatherRequest.resolve(request.url);
        return;
      }
      await send(ws, 'Fetch.continueRequest', { requestId });
    } catch (error) {
      aiRequest.reject(error);
      weatherRequest.reject(error);
    }
  };
  ws.addEventListener('message', onFetchPaused);
  await send(ws, 'Fetch.enable', {
    patterns: [
      { urlPattern: '*://127.0.0.1:5173/api/identify', requestStage: 'Request' },
      { urlPattern: 'https://api.open-meteo.com/*', requestStage: 'Request' },
    ],
  });

  await navigate(ws, DEV_BASE, 1_500);
  await clickText(ws, 'Explore the map');
  await waitFor(ws, `document.querySelector('#minimum-reliability')?.value === '75'`, 'Trust Console default');
  await waitFor(ws, `document.querySelectorAll('.priority-select').length > 0`, 'priority rows');

  evidence.trustDefault = await evaluate(ws, `(() => ({
    threshold: document.querySelector('#minimum-reliability')?.value,
    trustedOnly: document.querySelector('.trust-checkbox input')?.checked,
    included: [...document.querySelectorAll('p')].find((node) => /submissions included/i.test(node.textContent || ''))?.textContent.trim(),
    priorityRows: document.querySelectorAll('.priority-select').length,
  }))()`);

  await evaluate(ws, `document.querySelector('.trust-checkbox input').click()`);
  await waitFor(ws, `/0 of \\d+ submissions included/i.test(document.body.textContent)`, 'trusted-only filtering');
  evidence.trustedOnly = await evaluate(ws, `(() => ({
    checked: document.querySelector('.trust-checkbox input')?.checked,
    included: [...document.querySelectorAll('p')].find((node) => /submissions included/i.test(node.textContent || ''))?.textContent.trim(),
    priorityRows: document.querySelectorAll('.priority-select').length,
  }))()`);
  await evaluate(ws, `document.querySelector('.trust-checkbox input').click()`);
  await waitFor(ws, `document.querySelectorAll('.priority-select').length > 0`, 'restored priority rows');

  let mapBefore = await evaluate(ws, TILE_STATE);
  for (let attempt = 0; mapBefore.tileCount === 0 && attempt < 20; attempt += 1) {
    await sleep(200);
    mapBefore = await evaluate(ws, TILE_STATE);
  }
  await evaluate(ws, `document.querySelector('.priority-select').click()`);
  await waitFor(ws, `document.querySelector('.selected-stream-strip') !== null`, 'selected stream strip');
  await sleep(1_600);
  const mapAfter = await evaluate(ws, TILE_STATE);
  evidence.mapSelection = {
    before: mapBefore,
    after: mapAfter,
    selectedStrip: await evaluate(ws, `document.querySelector('.selected-stream-strip h3')?.textContent.trim()`),
    zoomedToStream: mapAfter.zoom === 13 && JSON.stringify(mapBefore.center) !== JSON.stringify(mapAfter.center),
  };

  await clickText(ws, 'Assess selected stream');
  await waitFor(ws, `/Which stream are you at/i.test(document.body.textContent)`, 'selected assessment flow');
  await clickText(ws, 'Start assessment');
  await waitFor(ws, `/What did you find/i.test(document.body.textContent)`, 'assessment counts');
  await evaluate(ws, `document.querySelector('button[aria-label^="One more "]').click()`);
  const countBeforeAi = await evaluate(ws, `document.querySelector('button[aria-label^="One more "]').previousElementSibling.textContent.trim()`);
  await clickText(ws, 'blind AI second opinion');
  await waitFor(ws, `document.querySelector('input[type="file"]') !== null`, 'AI photo input');
  await uploadFile(ws, 'input[type="file"]', PHOTO);
  await waitFor(ws, `/Selected: bahari-192.png/i.test(document.body.textContent)`, 'validated photo');
  await clickText(ws, '^Check photo$');
  const requestBody = await Promise.race([
    aiRequest.promise,
    sleep(5_000).then(() => { throw new Error('AI request was not observed'); }),
  ]);
  await waitFor(ws, `/The two identifications agree/i.test(document.body.textContent)`, 'blind AI result');
  const countAfterAi = await evaluate(ws, `document.querySelector('button[aria-label^="One more "]')?.previousElementSibling.textContent.trim()`);
  evidence.blindAi = await evaluate(ws, `(() => ({
    outcome: [...document.querySelectorAll('[role="status"]')].some((node) => /identifications agree/i.test(node.textContent || '')),
    provider: /Provider: nova-vision/i.test(document.body.textContent),
    meter: document.querySelector('[role="meter"]')?.getAttribute('aria-valuenow'),
  }))()`);
  evidence.blindAi.requestKeys = Object.keys(requestBody).sort();
  evidence.blindAi.humanHintAbsent = !Object.keys(requestBody).some((key) => /taxon|hint|label|human/i.test(key));
  evidence.blindAi.countUnchanged = countBeforeAi === countAfterAi;

  await clickText(ws, 'Edit your count');
  await waitFor(ws, `document.querySelector('input[type="file"]') === null`, 'AI panel close');
  evidence.focusReturn = await evaluate(ws, `(() => ({
    tag: document.activeElement?.tagName,
    label: document.activeElement?.getAttribute('aria-label'),
  }))()`);

  await clickText(ws, 'See stream health');
  await waitFor(ws, `/Stream health/i.test(document.body.textContent)`, 'result step');
  await clickText(ws, 'One Health considerations');
  await waitFor(ws, `/One Health considerations/i.test(document.body.textContent)`, 'One Health step');
  await Promise.race([
    weatherRequest.promise,
    sleep(5_000).then(() => { throw new Error('Weather request was not observed'); }),
  ]);
  await clickText(ws, 'Create shareable record');
  await waitFor(ws, `/Structurally valid FHIR R4 Bundle/i.test(document.body.textContent)`, 'FHIR step');
  await clickText(ws, 'Inspect evidence in this Bundle', 'summary');
  await clickText(ws, 'Show raw FHIR JSON');
  const rawBundle = await evaluate(ws, `JSON.parse(document.querySelector('pre').textContent)`);
  const aiObservation = rawBundle.entry.map((entry) => entry.resource).find((resource) =>
    resource.resourceType === 'Observation' && resource.code?.coding?.some((coding) => coding.code === 'ai-identification-second-opinion'));
  evidence.fhir = {
    inspectorExpanded: await evaluate(ws, `document.querySelector('details')?.open === true`),
    aiShown: await evaluate(ws, `/AI second-opinion provenance[\\s\\S]*Reviewed human taxon/i.test(document.body.textContent)`),
    componentCodes: aiObservation?.component?.map((component) => component.code.coding[0].code) ?? [],
    confidenceUnit: aiObservation?.component?.find((component) => component.code.coding[0].code === 'model-confidence')?.valueQuantity?.code,
    derivedFrom: aiObservation?.derivedFrom?.[0]?.reference ?? null,
  };

  await send(ws, 'Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS, eventsEnabled: true });
  await clickText(ws, 'Download FHIR record');
  const downloadStarted = Date.now();
  let downloadedFile = null;
  while (Date.now() - downloadStarted < 5_000) {
    downloadedFile = fs.readdirSync(DOWNLOADS).find((name) => name.endsWith('.json')) ?? null;
    if (downloadedFile) break;
    await sleep(100);
  }
  if (!downloadedFile) throw new Error('FHIR download did not complete');
  const downloadedBundle = JSON.parse(fs.readFileSync(path.join(DOWNLOADS, downloadedFile), 'utf8'));
  evidence.fhir.downloadMatchesRaw = JSON.stringify(downloadedBundle) === JSON.stringify(rawBundle);

  await sleep(800);
  const storedBeforeRestart = await evaluate(ws, `new Promise((resolve, reject) => {
    const open = indexedDB.open('bahari-field-v1');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const recordsRequest = db.transaction('records').objectStore('records').getAll();
      recordsRequest.onerror = () => reject(recordsRequest.error);
      recordsRequest.onsuccess = () => resolve(recordsRequest.result.map((record) => ({
        id: record.id,
        updatedAt: record.updatedAt,
        status: record.status,
        rain: record.rain,
        hasFhir: Boolean(record.fhirBundle),
        hasAi: Boolean(record.assessment?.aiReview),
      })));
    };
  })`);
  const completedRecord = storedBeforeRestart
    .filter((record) => record.status === 'saved' && record.hasFhir)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!completedRecord) throw new Error('Saved FHIR record was not found in IndexedDB');
  evidence.indexedDb = { beforeRestart: completedRecord };

  await clickText(ws, 'New assessment');
  await waitFor(ws, `/Which stream are you at/i.test(document.body.textContent)`, 'fresh assessment after FHIR');
  if (!pausedWeatherRequestId) throw new Error('Weather request was not paused');
  await send(ws, 'Fetch.fulfillRequest', {
    requestId: pausedWeatherRequestId,
    responseCode: 200,
    responseHeaders: responseHeaders('application/json'),
    body: Buffer.from(JSON.stringify({ daily: { precipitation_sum: [99, 99, 99] } })).toString('base64'),
  });
  pausedWeatherRequestId = null;
  await sleep(1_000);
  const storedAfterRestart = await evaluate(ws, `new Promise((resolve, reject) => {
    const open = indexedDB.open('bahari-field-v1');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('records').objectStore('records').get(${JSON.stringify(completedRecord.id)});
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve({ id: request.result?.id, rain: request.result?.rain, completedAt: request.result?.completedAt });
    };
  })`);
  evidence.weatherRace = {
    staleResultIgnored: storedAfterRestart.rain === null,
    completedAtPreserved: Boolean(storedAfterRestart.completedAt),
  };

  await clickText(ws, 'Field records');
  await waitFor(ws, `/Records on this device/i.test(document.body.textContent)`, 'records view');
  evidence.records = await evaluate(ws, `(() => ({
    privacy: /Records and photos stay in this browser on this device/i.test(document.body.textContent),
    savedRows: [...document.querySelectorAll('.field-record-row')].filter((row) => /Saved/i.test(row.textContent)).length,
    pendingRows: [...document.querySelectorAll('.field-record-row')].filter((row) => /Pending/i.test(row.textContent)).length,
  }))()`);

  console.log('[browser] development flows complete');
  await send(ws, 'Fetch.disable');
  ws.removeEventListener('message', onFetchPaused);
  return evidence;
}

async function verifyLocalStorageFallback(ws) {
  console.log('[browser] localStorage fallback');
  const isolatedId = await send(ws, 'Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });`,
  });
  await navigate(ws, `${DEV_BASE}/?storage-fallback=1`, 1_000);
  await clickText(ws, '^Assess a stream$');
  await clickText(ws, 'Start assessment');
  await waitFor(ws, `localStorage.getItem('bahari.field-meta.v1') !== null`, 'localStorage fallback write');
  const evidence = await evaluate(ws, `(() => ({
    reducedStatus: /Reduced device storage/i.test(document.body.textContent),
    hasPayload: localStorage.getItem('bahari.field-meta.v1') !== null,
    excludesPhotoBytes: !/imageBase64|data:image/i.test(localStorage.getItem('bahari.field-meta.v1') || ''),
  }))()`);
  await send(ws, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: isolatedId.identifier });
  return evidence;
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json') || file.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function createProductionServer() {
  const dist = path.join(ROOT, 'dist');
  const originalWorker = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  const buildId = originalWorker.match(/const BUILD_ID = "([a-f0-9]{16})"/)?.[1];
  if (!buildId) throw new Error('Production service worker has no deterministic build id');
  const oldBuildId = '1111111111111111';
  let serveNewWorker = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, PROD_ORIGIN);
    if (!url.pathname.startsWith('/bahari/')) {
      response.writeHead(404).end('Not found');
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice('/bahari/'.length)) || 'index.html';
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) && file !== path.join(dist, 'index.html')) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (relative === 'sw.js') {
      const source = serveNewWorker ? originalWorker : originalWorker.replace(buildId, oldBuildId);
      response.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Service-Worker-Allowed': '/bahari/',
      });
      response.end(source);
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  return {
    buildId,
    oldBuildId,
    server,
    useNewWorker() { serveNewWorker = true; },
  };
}

async function verifyProductionFlows(ws) {
  console.log('[browser] production offline and update flow');
  const production = createProductionServer();
  await new Promise((resolve, reject) => {
    production.server.once('error', reject);
    production.server.listen(4173, '127.0.0.1', resolve);
  });
  try {
    await send(ws, 'Storage.clearDataForOrigin', {
      origin: PROD_ORIGIN,
      storageTypes: 'all',
    });
    await navigate(ws, PROD_BASE, 1_500);
    await waitFor(ws, `navigator.serviceWorker.ready.then(() => true)`, 'old worker installation');
    await evaluate(ws, `location.reload()`);
    await waitFor(ws, `document.readyState === 'complete' && navigator.serviceWorker.controller !== null`, 'old worker control');
    await sleep(1_500);
    const oldCaches = await evaluate(ws, `caches.keys()`);
    await clickText(ws, '^Assess a stream$');
    await waitFor(ws, `/Which stream are you at/i.test(document.body.textContent)`, 'production assessment view');

    production.useNewWorker();
    await evaluate(ws, `navigator.serviceWorker.getRegistration().then((registration) => registration.update())`);
    await waitFor(ws, `navigator.serviceWorker.getRegistration().then((registration) => Boolean(registration.waiting))`, 'waiting production update', 15_000);
    await waitFor(ws, `/An app update is ready/i.test(document.body.textContent)`, 'update-ready UI', 5_000);
    const controllerBefore = await evaluate(ws, `navigator.serviceWorker.controller?.scriptURL`);
    await clickText(ws, 'Save and update');
    await waitFor(ws, `document.readyState === 'complete' && navigator.serviceWorker.controller !== null && !/An app update is ready/i.test(document.body.textContent)`, 'updated page reload', 20_000);
    await sleep(2_500);
    const controllerAfter = await evaluate(ws, `navigator.serviceWorker.controller?.scriptURL`);
    const newCaches = await evaluate(ws, `caches.keys()`);
    const cacheRequests = await evaluate(ws, `(async () => Promise.all((await caches.keys()).map(async (key) => ({ key, urls: (await (await caches.open(key)).keys()).map((request) => request.url) }))))()`);

    await send(ws, 'Network.enable');
    await send(ws, 'Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: 'none',
    });
    await send(ws, 'Page.navigate', { url: PROD_BASE });
    await waitFor(ws, `document.readyState === 'complete' && /Bahari/i.test(document.body.textContent)`, 'offline scoped reload', 12_000);
    const offlineShell = await evaluate(ws, `(() => ({
      title: document.title,
      hasLanding: /Citizen stream health/i.test(document.body.textContent),
      controlled: Boolean(navigator.serviceWorker.controller),
    }))()`);
    await send(ws, 'Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'wifi',
    });

    return {
      buildId: production.buildId,
      oldCaches,
      newCaches,
      oldCacheRemovedAfterReady: oldCaches.includes(`bahari-shell-${production.oldBuildId}`) && !newCaches.includes(`bahari-shell-${production.oldBuildId}`),
      currentCachePresent: newCaches.includes(`bahari-shell-${production.buildId}`),
      controllerKeptScopedUrl: controllerBefore === controllerAfter && controllerAfter?.endsWith('/bahari/sw.js'),
      apiIdentifyExcluded: cacheRequests.every((cache) => cache.urls.every((url) => !url.endsWith('/api/identify'))),
      offlineShell,
    };
  } finally {
    await new Promise((resolve) => production.server.close(resolve));
  }
}

async function main() {
  const targets = await (await fetch(`${CDP}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('No Chrome page target is available');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'DOM.enable');
  await send(ws, 'Network.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evidence = {
    development: await verifyDevelopmentFlows(ws),
    localStorage: await verifyLocalStorageFallback(ws),
    production: await verifyProductionFlows(ws),
  };
  fs.writeFileSync(path.join(OUT, 'trust-chain-runtime.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error('EVIDENCE ERROR:', error.stack || error.message);
  process.exit(1);
});
