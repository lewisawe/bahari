import { describe, it, expect } from 'vitest';
import { translateOneHealth } from './one-health.js';
import { seasonFor, buildContext, LAND_USES } from './context.js';

const ctx = (over = {}) =>
  buildContext({ date: new Date('2026-06-15'), landUse: 'mixed', ...over });

describe('translateOneHealth', () => {
  it('returns nothing actionable without a class', () => {
    const r = translateOneHealth({ classKey: null, context: ctx() });
    expect(r.flags).toHaveLength(0);
    expect(r.overall).toBe('info');
  });

  it('healthy stream -> reassuring, info-level only', () => {
    const r = translateOneHealth({ classKey: 'natural', context: ctx() });
    expect(r.overall).toBe('info');
    expect(r.flags.some((f) => f.audience === 'ecosystem' && f.level === 'info')).toBe(true);
    // no caution flags on a healthy stream
    expect(r.flags.every((f) => f.level !== 'caution')).toBe(true);
  });

  it('degraded stream -> caution with human AND animal flags', () => {
    const r = translateOneHealth({ classKey: 'very_poor', context: ctx() });
    expect(r.overall).toBe('caution');
    expect(r.flags.some((f) => f.audience === 'human')).toBe(true);
    expect(r.flags.some((f) => f.audience === 'animal')).toBe(true);
  });

  it('heavy rain on a non-healthy stream adds a runoff caution', () => {
    const dry = translateOneHealth({ classKey: 'poor', context: ctx({ rain: { heavyRain: false, recentRainMm: 1 } }) });
    const wet = translateOneHealth({ classKey: 'poor', context: ctx({ rain: { heavyRain: true, recentRainMm: 40 } }) });
    expect(wet.flags.some((f) => f.id === 'human-rain')).toBe(true);
    expect(dry.flags.some((f) => f.id === 'human-rain')).toBe(false);
  });

  it('heavy rain on a HEALTHY stream does NOT raise a runoff caution', () => {
    const r = translateOneHealth({ classKey: 'natural', context: ctx({ rain: { heavyRain: true, recentRainMm: 50 } }) });
    expect(r.flags.some((f) => f.id === 'human-rain')).toBe(false);
  });

  it('urban land use adds an urban-specific flag when degraded', () => {
    const r = translateOneHealth({ classKey: 'poor', context: ctx({ landUse: 'urban' }) });
    expect(r.flags.some((f) => f.id === 'human-urban')).toBe(true);
  });

  it('summer + degraded adds a seasonal animal watch', () => {
    const summer = translateOneHealth({ classKey: 'very_poor', context: ctx({ date: new Date('2026-07-01') }) });
    const winter = translateOneHealth({ classKey: 'very_poor', context: ctx({ date: new Date('2026-01-01') }) });
    expect(summer.flags.some((f) => f.id === 'animal-summer')).toBe(true);
    expect(winter.flags.some((f) => f.id === 'animal-summer')).toBe(false);
  });
});

describe('honesty guardrail', () => {
  const classes = ['natural', 'good', 'fair', 'poor', 'very_poor'];
  const contexts = [
    ctx(),
    ctx({ landUse: 'urban', rain: { heavyRain: true, recentRainMm: 40 } }),
    ctx({ landUse: 'agricultural', date: new Date('2026-07-01') }),
    ctx({ landUse: 'natural', date: new Date('2026-01-01') }),
  ];

  it('every flag always carries a reason, a basis, and limits', () => {
    for (const classKey of classes) {
      for (const c of contexts) {
        const r = translateOneHealth({ classKey, context: c });
        for (const f of r.flags) {
          expect(typeof f.reason).toBe('string');
          expect(f.reason.length).toBeGreaterThan(0);
          expect(typeof f.basis).toBe('string');
          expect(f.basis.length).toBeGreaterThan(0);
          expect(typeof f.limits).toBe('string');
          expect(f.limits.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never asserts a disease or diagnosis', () => {
    const banned = /\b(will cause|causes disease|diagnos|you will get|guaranteed|definitely (sick|ill))\b/i;
    for (const classKey of classes) {
      for (const c of contexts) {
        const r = translateOneHealth({ classKey, context: c });
        const text = JSON.stringify(r).toLowerCase();
        expect(banned.test(text)).toBe(false);
      }
    }
  });

  it('limits text states it is not a water test / diagnosis on every flag', () => {
    const r = translateOneHealth({ classKey: 'very_poor', context: contexts[1] });
    expect(r.flags.length).toBeGreaterThan(0);
    for (const f of r.flags) {
      expect(/not a water-quality test|not a .*diagnosis|indirect indicator/i.test(f.limits)).toBe(true);
    }
  });

  it('flag levels are only info/watch/caution (no numeric risk)', () => {
    const r = translateOneHealth({ classKey: 'poor', context: contexts[0] });
    for (const f of r.flags) {
      expect(['info', 'watch', 'caution']).toContain(f.level);
    }
  });
});

describe('context helpers', () => {
  it('seasonFor maps months to northern-hemisphere seasons', () => {
    expect(seasonFor(new Date('2026-01-10'))).toBe('winter');
    expect(seasonFor(new Date('2026-04-10'))).toBe('spring');
    expect(seasonFor(new Date('2026-07-10'))).toBe('summer');
    expect(seasonFor(new Date('2026-10-10'))).toBe('autumn');
    expect(seasonFor(new Date('2026-12-10'))).toBe('winter');
  });

  it('buildContext assembles a normalized context', () => {
    const c = buildContext({ date: new Date('2026-07-01'), landUse: 'urban', rain: { heavyRain: true, recentRainMm: 30, source: 'x' } });
    expect(c.season).toBe('summer');
    expect(c.landUse).toBe('urban');
    expect(c.heavyRain).toBe(true);
    expect(c.recentRainMm).toBe(30);
  });

  it('LAND_USES has the expected keys', () => {
    const keys = LAND_USES.map((l) => l.key);
    expect(keys).toEqual(expect.arrayContaining(['urban', 'agricultural', 'mixed', 'natural']));
  });
});
