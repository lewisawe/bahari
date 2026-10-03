// Runtime evidence capture via Chrome DevTools Protocol (no puppeteer needed).
// Drives the live dev server, exercises the map fly-to and the three beats, and
// writes screenshots + a JSON evidence file. Requires: google-chrome running
// with --remote-debugging-port=9222 and the dev server on :5173.
//
// Usage: node scripts/runtime-evidence.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const CDP = 'http://localhost:9222';
const OUT = path.resolve(process.cwd(), '.agents/tasks/evidence');
fs.mkdirSync(OUT, { recursive: true });

let msgId = 0;
function send(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id === id) {
        ws.removeEventListener('message', onMsg);
        if (data.error) reject(new Error(method + ': ' + JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(ws, expression, awaitPromise = true) {
  const r = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (r.exceptionDetails) {
    throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function screenshot(ws, name) {
  const r = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
}

async function main() {
  // find a page target
  const targets = await (await fetch(CDP + '/json')).json();
  let page = targets.find((t) => t.type === 'page');
  if (!page) {
    page = await (await fetch(CDP + '/json/new?' + encodeURIComponent(BASE))).json();
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evidence = {};

  // 1) Load app
  await send(ws, 'Page.navigate', { url: BASE });
  await send(ws, 'Page.loadEventFired').catch(() => {});
  await sleep(2500);

  // Enter the assess flow (click the hero CTA)
  await evalJs(
    ws,
    `(() => {
      const btns = [...document.querySelectorAll('button')];
      const cta = btns.find(b => /assess a stream/i.test(b.textContent));
      cta && cta.click();
      return !!cta;
    })()`,
  );
  await sleep(1500); // let the map (lazy) mount

  // Capture the map's current center+zoom BEFORE selecting a non-default stream
  const before = await evalJs(
    ws,
    `(() => {
      const el = document.querySelector('.leaflet-container');
      // Leaflet stores the map on the DOM node via its internal id; use the
      // global test hook if present, else read transform of the tile pane.
      const pane = document.querySelector('.leaflet-map-pane');
      return { hasMap: !!el, paneTransform: pane ? pane.style.transform : null };
    })()`,
  );
  evidence.mapBefore = before;
  await screenshot(ws, '01-assess-map-initial.png');

  // Click the SECOND stream in the list to trigger a fly-to to a different point
  const picked = await evalJs(
    ws,
    `(() => {
      const items = [...document.querySelectorAll('button[aria-pressed]')]
        .filter(b => /\\d+\\.\\d+,/.test(b.textContent)); // list rows show "lat, lon"
      // choose one that is NOT currently selected
      const target = items.find(b => b.getAttribute('aria-pressed') === 'false') || items[1] || items[0];
      if (!target) return { clicked:false, count: items.length };
      target.click();
      return { clicked:true, label: target.querySelector('.font-medium')?.textContent || null, count: items.length };
    })()`,
  );
  evidence.pickedStream = picked;
  // let the flyTo animation (0.8s) run
  await sleep(1600);

  const after = await evalJs(
    ws,
    `(() => {
      const pane = document.querySelector('.leaflet-map-pane');
      const tiles = [...document.querySelectorAll('.leaflet-tile')].length;
      // read zoom from leaflet's zoom-level class on the container
      const container = document.querySelector('.leaflet-container');
      return { paneTransform: pane ? pane.style.transform : null, tiles };
    })()`,
  );
  evidence.mapAfter = after;
  evidence.mapMoved = JSON.stringify(before.paneTransform) !== JSON.stringify(after.paneTransform);
  await screenshot(ws, '02-assess-map-after-select.png');

  // 2) Record a creature and go to the result (Beat A)
  await evalJs(
    ws,
    `(() => {
      const start = [...document.querySelectorAll('button')].find(b => /start assessment/i.test(b.textContent));
      start && start.click();
      return !!start;
    })()`,
  );
  await sleep(800);
  await evalJs(
    ws,
    `(() => {
      const plus = [...document.querySelectorAll('button')].find(b => /one more/i.test(b.getAttribute('aria-label')||''));
      plus && plus.click();
      return !!plus;
    })()`,
  );
  await sleep(400);
  await evalJs(
    ws,
    `(() => {
      const next = [...document.querySelectorAll('button')].find(b => /see stream health/i.test(b.textContent));
      next && next.click();
      return !!next;
    })()`,
  );
  await sleep(1200); // ring draw + count-up
  evidence.beatA = await evalJs(
    ws,
    `(() => ({
      ringDraw: !!document.querySelector('.anim-ring-draw'),
      glow: !!document.querySelector('.anim-glow'),
      scoreImg: !!document.querySelector('[role="img"][aria-label*="Health score" i]'),
      stagger: !!document.querySelector('.anim-stagger'),
    }))()`,
  );
  await screenshot(ws, '03-beatA-score-reveal.png');

  // 3) Advance to One Health then FHIR (Beat B)
  await evalJs(
    ws,
    `(() => { const b=[...document.querySelectorAll('button')].find(b=>/one health/i.test(b.textContent)); b&&b.click(); return !!b; })()`,
  );
  await sleep(1000);
  await evalJs(
    ws,
    `(() => { const b=[...document.querySelectorAll('button')].find(b=>/shareable record|create shareable/i.test(b.textContent)); b&&b.click(); return !!b; })()`,
  );
  await sleep(1200); // check-draw
  evidence.beatB = await evalJs(
    ws,
    `(() => ({
      validText: !!document.body.textContent.match(/Valid FHIR R4 Bundle/i),
      checkDraw: !!document.querySelector('.anim-check-draw'),
      glow: !!document.querySelector('.anim-glow'),
      hapiCaption: !!document.body.textContent.match(/HAPI FHIR R4/i),
    }))()`,
  );
  await screenshot(ws, '04-beatB-fhir-valid.png');

  // 4) Go back to assess and open the AI panel (Beat C)
  await evalJs(
    ws,
    `(() => { const b=[...document.querySelectorAll('button')].find(b=>/new assessment/i.test(b.textContent)); b&&b.click(); return !!b; })()`,
  );
  await sleep(600);
  await evalJs(
    ws,
    `(() => { const b=[...document.querySelectorAll('button')].find(b=>/start assessment/i.test(b.textContent)); b&&b.click(); return !!b; })()`,
  );
  await sleep(600);
  await evalJs(
    ws,
    `(() => { const b=[...document.querySelectorAll('button')].find(b=>/photo with ai/i.test(b.textContent)); b&&b.click(); return !!b; })()`,
  );
  await sleep(500);
  await evalJs(
    ws,
    `(() => { const b=[...document.querySelectorAll('button')].find(b=>/ask the ai/i.test(b.textContent)); b&&b.click(); return !!b; })()`,
  );
  // capture the scanning phase quickly
  await sleep(150);
  evidence.beatC_scanning = await evalJs(ws, `!!document.querySelector('.scan-frame')`);
  await sleep(1200); // let it resolve to a confidence meter
  evidence.beatC = await evalJs(
    ws,
    `(() => {
      const m = document.querySelector('[role="meter"]');
      return {
        meter: !!m,
        valuenow: m ? m.getAttribute('aria-valuenow') : null,
        meterFill: !!document.querySelector('.anim-meter'),
      };
    })()`,
  );
  await screenshot(ws, '05-beatC-confidence.png');

  fs.writeFileSync(path.join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  ws.close();
}

main().catch((e) => {
  console.error('EVIDENCE ERROR:', e.message);
  process.exit(1);
});
