import { describe, it, expect } from 'vitest';
import { contrastRatio, passesAA } from '../core/contrast.js';

// Contrast guard for the tinted surfaces introduced by the UI polish beats
// (score ring, FHIR valid hero, confidence meter, deferral card). Each tint is
// semi-transparent, so we composite it over its opaque parent first, then check
// the foreground text/large-number against the resulting solid color. This
// keeps the landing page's stated "WCAG AA contrast" claim honest.

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function alphaFrom(a) {
  return typeof a === 'number' ? a : parseInt(a, 16) / 255;
}
/** Composite tint (hex + alpha) over an opaque bg hex -> solid hex. */
function over(tintHex, alpha, bgHex) {
  const f = hexToRgb(tintHex);
  const b = hexToRgb(bgHex);
  const a = alphaFrom(alpha);
  return rgbToHex(f.map((fc, i) => fc * a + b[i] * (1 - a)));
}

const GOOD = '#3ecf8e';
const FAIR = '#f5c451';
const BAD = '#ff6b6b';
const ASH = '#a7a7a7';
const INK = '#0a0a0a';
const SECTION = '#141414';
const CARD = '#1e1e1e';
const STEEL = '#313131';

describe('tinted-surface contrast (AA)', () => {
  it('FHIR valid hero: title + caption pass on the green-tinted surface', () => {
    const surf = over(GOOD, '14', INK);
    expect(passesAA(GOOD, surf, { large: true })).toBe(true);
    expect(passesAA(ASH, surf)).toBe(true); // caption is normal text
  });

  it('confidence meter: label/number (large) and unit (normal) pass for all bands', () => {
    for (const c of [GOOD, FAIR, BAD]) {
      const surf = over(c, '0f', CARD);
      expect(passesAA(c, surf, { large: true })).toBe(true);
      expect(passesAA(ASH, surf)).toBe(true);
    }
  });

  it('deferral card: not-confident title passes on the section surface', () => {
    expect(passesAA(BAD, SECTION)).toBe(true);
  });

  it('score + reliability ring numerals (large) pass on their surfaces', () => {
    for (const c of [GOOD, FAIR, BAD]) {
      expect(passesAA(c, CARD, { large: true })).toBe(true); // StepResult ring on card
      expect(passesAA(c, SECTION, { large: true })).toBe(true); // reliability ring on section
    }
  });

  it('meter/ring fill colors stay distinguishable from the steel track (>=3:1)', () => {
    for (const c of [GOOD, FAIR, BAD]) {
      expect(contrastRatio(c, STEEL)).toBeGreaterThanOrEqual(3);
    }
  });
});
