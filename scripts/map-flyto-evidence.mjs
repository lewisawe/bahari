// Focused CDP proof that selecting a stream changes the Leaflet viewport
// (center + zoom), reading the zoom level straight from the tile image URLs
// (OpenStreetMap tiles are /{z}/{x}/{y}.png) before and after selection.
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
  const r = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Parse the dominant tile zoom from tile <img> srcs: .../{z}/{x}/{y}.png
const ZOOM_EXPR = `(() => {
  const imgs = [...document.querySelectorAll('.leaflet-tile')].map(i => i.src || '');
  const zooms = imgs.map(s => { const m = s.match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)\\.png/); return m ? Number(m[1]) : null; }).filter(z => z != null);
  // mode
  const counts = {}; let best=null, bestN=-1;
  for (const z of zooms){ counts[z]=(counts[z]||0)+1; if(counts[z]>bestN){bestN=counts[z];best=z;} }
  const centerTiles = imgs.map(s=>{const m=s.match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)\\.png/); return m?[Number(m[2]),Number(m[3])]:null;}).filter(Boolean);
  const avg = centerTiles.reduce((a,[x,y])=>[a[0]+x,a[1]+y],[0,0]).map(v=>centerTiles.length?v/centerTiles.length:0);
  return { zoom: best, tileCount: zooms.length, avgTile: avg };
})()`;

async function main() {
  const targets = await (await fetch(CDP + '/json')).json();
  let page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });

  await send(ws, 'Page.navigate', { url: BASE });
  await sleep(2500);
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/assess a stream/i.test(b.textContent)); b&&b.click(); return !!b; })()`);
  await sleep(2000); // map mount + fitAll framing of all 24 streams

  const before = await evalJs(ws, ZOOM_EXPR);

  // Pick a specific far stream and record its intended coords from the list row
  const pick = await evalJs(ws, `(() => {
    const rows = [...document.querySelectorAll('button[aria-pressed]')].filter(b => /\\d+\\.\\d+,\\s*-?\\d+\\.\\d+/.test(b.textContent));
    const target = rows.find(b => b.getAttribute('aria-pressed') === 'false') || rows[rows.length-1];
    const label = target.querySelector('.font-medium')?.textContent || null;
    target.click();
    return { label };
  })()`);

  await sleep(1800); // flyTo (0.8s) + tile load
  const after = await evalJs(ws, ZOOM_EXPR);

  const out = {
    picked: pick,
    before,
    after,
    zoomIncreased: (after.zoom ?? 0) > (before.zoom ?? 0),
    centerChanged: JSON.stringify(before.avgTile) !== JSON.stringify(after.avgTile),
  };
  fs.writeFileSync(path.join(OUT, 'map-flyto.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  ws.close();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
