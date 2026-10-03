// One-off contrast audit for the new tinted surfaces introduced by the UI
// polish beats. Uses the project's own contrast module. Composites the
// semi-transparent tint over its opaque parent, then checks fg text against
// the resulting solid color. Run: node scripts/contrast-check.mjs
import { contrastRatio } from '../src/core/contrast.js';

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
// alpha from a 2-hex-digit suffix like '14' (0x14/255) or a float
function alphaFrom(a) {
  if (typeof a === 'number') return a;
  return parseInt(a, 16) / 255;
}
// composite fg tint (with alpha) over opaque bg -> solid hex
function over(tintHex, alpha, bgHex) {
  const f = hexToRgb(tintHex);
  const b = hexToRgb(bgHex);
  const a = alphaFrom(alpha);
  return rgbToHex(f.map((fc, i) => fc * a + b[i] * (1 - a)));
}

const GOOD = '#3ecf8e';
const FAIR = '#f5c451';
const BAD = '#ff6b6b';
const INK = '#0a0a0a';
const SECTION = '#141414';
const CARD = '#1e1e1e';
const STEEL = '#313131';
const SNOW = '#ffffff';
const ASH = '#a7a7a7';

const cases = [];
function check(name, fg, bg, { large = false } = {}) {
  const r = contrastRatio(fg, bg);
  const need = large ? 3 : 4.5;
  cases.push({ name, fg, bg, ratio: Number(r.toFixed(2)), need, pass: r >= need });
}

// Beat B — valid FHIR hero: surface = GOOD@0x14 over INK; border GOOD@0x66.
const fhirSurface = over(GOOD, '14', INK);
check('FHIR hero: valid title (GOOD, large) on green surface', GOOD, fhirSurface, { large: true });
check('FHIR hero: mono caption (ASH) on green surface', ASH, fhirSurface);

// Beat C — ConfidenceMeter: surface = color@0x0f over CARD.
for (const [n, c] of [['suggested', GOOD], ['review', FAIR], ['defer', BAD]]) {
  const surf = over(c, '0f', CARD);
  check(`Meter ${n}: band label (large) on tinted surface`, c, surf, { large: true });
  check(`Meter ${n}: big pct (large) on tinted surface`, c, surf, { large: true });
  check(`Meter ${n}: unit (ASH) on tinted surface`, ASH, surf);
}

// AssistPanel defer card: surface = SECTION, border color@0x66, text color.
check('Assist defer: notConfident title (BAD) on section', BAD, SECTION);

// Score ring numerals (large) on CARD for each health color.
for (const [n, c] of [['good', GOOD], ['fair', FAIR], ['bad', BAD]]) {
  check(`ScoreRing numeral ${n} (large) on card`, c, CARD, { large: true });
}
// Reliability ring on SECTION.
for (const [n, c] of [['high', GOOD], ['moderate', FAIR], ['low', BAD]]) {
  check(`Reliability ring ${n} (large) on section`, c, SECTION, { large: true });
}

// Meter bars fill color must be a visible non-text UI element (>=3 vs track STEEL).
for (const [n, c] of [['good', GOOD], ['fair', FAIR], ['bad', BAD]]) {
  check(`Meter fill ${n} vs steel track (UI, large)`, c, STEEL, { large: true });
}

// Baseline sanity (existing pairs still fine)
check('snow on card', SNOW, CARD);
check('ash on section', ASH, SECTION);

let failures = 0;
for (const c of cases) {
  const flag = c.pass ? 'PASS' : 'FAIL';
  if (!c.pass) failures++;
  console.log(
    `${flag}  ${c.ratio.toString().padStart(5)} (need ${c.need})  ${c.name}  [${c.fg} on ${c.bg}]`,
  );
}
console.log(`\n${cases.length - failures}/${cases.length} pass`);
process.exit(failures ? 1 : 0);
