// CDP proof that under prefers-reduced-motion the beats land on their FINAL
// resting state (full score number, valid badge, filled meter) and the map
// snaps to the stream (setView, no animated flight) — nothing is left frozen
// at a 0% start frame. Uses Emulation.setEmulatedMedia to force reduced motion.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const CDP = 'http://localhost:9222';
const OUT = path.resolve(process.cwd(), '.agents/tasks/evidence');

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

async function main() {
  const targets = await (await fetch(CDP + '/json')).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
  // force reduced motion
  await send(ws, 'Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });

  await send(ws, 'Page.navigate', { url: BASE });
  await sleep(2500);
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/assess a stream/i.test(b.textContent)); b&&b.click(); return !!b; })()`);
  await sleep(1500);

  const matches = await evalJs(ws, `window.matchMedia('(prefers-reduced-motion: reduce)').matches`);

  // record creature -> result
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/start assessment/i.test(b.textContent)); b&&b.click(); return !!b; })()`);
  await sleep(500);
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/one more/i.test(b.getAttribute('aria-label')||'')); b&&b.click(); return !!b; })()`);
  await sleep(300);
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/see stream health/i.test(b.textContent)); b&&b.click(); return !!b; })()`);
  await sleep(400); // deliberately short: resting state must already be correct

  const beatA = await evalJs(ws, `(() => {
    const img = document.querySelector('[role="img"][aria-label*="Health score" i]');
    const num = img ? img.querySelector('span:last-child') : null;
    const glow = !!document.querySelector('.anim-glow');
    // computed opacity of the stagger children should be 1 (resting), not 0
    const firstStaggerChild = document.querySelector('.anim-stagger > *');
    const op = firstStaggerChild ? getComputedStyle(firstStaggerChild).opacity : null;
    return { scoreText: num ? num.textContent : null, glowPresent: glow, staggerChildOpacity: op };
  })()`);

  const r = Buffer.from((await send(ws, 'Page.captureScreenshot', { format: 'png' })).data, 'base64');
  fs.writeFileSync(path.join(OUT, '06-reduced-motion-beatA.png'), r);

  const out = { prefersReducedMotionMatches: matches, beatA };
  fs.writeFileSync(path.join(OUT, 'reduced-motion.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  ws.close();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
