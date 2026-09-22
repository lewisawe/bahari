import { describe, it, expect } from 'vitest';
import { contrastRatio, passesAA } from './contrast.js';

// Dovetail palette
const INK = '#0a0a0a'; // canvas
const SECTION = '#141414';
const CARD = '#1e1e1e';
const SNOW = '#ffffff'; // primary text
const ASH = '#a7a7a7'; // secondary text
const ACCENT = '#6798ff';
const HEALTH = { good: '#3ecf8e', fair: '#f5c451', poor: '#ff9d5c', bad: '#ff6b6b' };

describe('contrast helper', () => {
  it('computes known ratios (white on black ~21)', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });
});

describe('WCAG AA for Dovetail text pairs', () => {
  it('primary text (snow) passes AA on all surfaces', () => {
    for (const bg of [INK, SECTION, CARD]) {
      expect(passesAA(SNOW, bg)).toBe(true);
    }
  });

  it('secondary text (ash) passes AA on all surfaces', () => {
    for (const bg of [INK, SECTION, CARD]) {
      expect(passesAA(ASH, bg)).toBe(true);
    }
  });

  it('accent text passes AA as large text / UI on dark surfaces', () => {
    // accent is used for links/labels (large or UI) — must clear 3:1
    for (const bg of [INK, SECTION, CARD]) {
      expect(passesAA(ACCENT, bg, { large: true })).toBe(true);
    }
  });

  it('health status colors clear 3:1 (used as large numerals / UI strokes) on dark', () => {
    for (const c of Object.values(HEALTH)) {
      expect(passesAA(c, INK, { large: true })).toBe(true);
      expect(passesAA(c, CARD, { large: true })).toBe(true);
    }
  });

  it('primary button: ink text on snow fill passes AA', () => {
    expect(passesAA(INK, SNOW)).toBe(true);
  });
});
