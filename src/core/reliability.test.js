import { describe, it, expect } from 'vitest';
import { scoreReliability, bandFor, BANDS } from './reliability.js';

const strong = {
  counts: { mayfly: 3, caddisfly: 2, snail: 4, stonefly: 1 },
  photoConfirmed: true,
  location: { lat: 48.4, lon: -2.6 },
  locationOnStream: true,
  durationSec: 300,
};

describe('scoreReliability', () => {
  it('scores a complete, well-supported submission as high', () => {
    const r = scoreReliability(strong);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.band).toBe('high');
    expect(r.flags).toHaveLength(0);
  });

  it('score is bounded 0..100', () => {
    const r = scoreReliability(strong);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('missing location fails that check and flags it', () => {
    const r = scoreReliability({ ...strong, location: null });
    const loc = r.checks.find((c) => c.id === 'location');
    expect(loc.status).toBe('fail');
    expect(loc.points).toBe(0);
    expect(r.flags.some((f) => /location/i.test(f))).toBe(true);
  });

  it('single group lowers reliability and warns', () => {
    const r = scoreReliability({ ...strong, counts: { mayfly: 2 } });
    const rich = r.checks.find((c) => c.id === 'richness');
    expect(rich.status).toBe('warn');
    expect(r.score).toBeLessThan(scoreReliability(strong).score);
  });

  it('no photo warns but does not fail the whole submission', () => {
    const r = scoreReliability({ ...strong, photoConfirmed: false });
    const photo = r.checks.find((c) => c.id === 'photo');
    expect(photo.status).toBe('warn');
    expect(r.score).toBeGreaterThan(50); // still usable
  });

  it('implausibly high count triggers a plausibility warning', () => {
    const r = scoreReliability({ ...strong, counts: { ...strong.counts, worm: 500 } });
    const pl = r.checks.find((c) => c.id === 'plausibility');
    expect(pl.status).toBe('warn');
    expect(r.flags.some((f) => /high count/i.test(f))).toBe(true);
  });

  it('rushed submission warns on effort time', () => {
    const r = scoreReliability({ ...strong, durationSec: 5 });
    const d = r.checks.find((c) => c.id === 'duration');
    expect(d.status).toBe('warn');
  });

  it('off-stream location warns rather than fails', () => {
    const r = scoreReliability({ ...strong, locationOnStream: false });
    const loc = r.checks.find((c) => c.id === 'location');
    expect(loc.status).toBe('warn');
  });

  it('a weak submission lands in low band', () => {
    const r = scoreReliability({
      counts: { worm: 1 },
      photoConfirmed: false,
      location: null,
      durationSec: 4,
    });
    expect(r.band).toBe('low');
  });

  it('reliability is independent of ecological quality', () => {
    // a "very poor" ecological community can still be a HIGH-reliability record
    const degradedButRigorous = {
      counts: { worm: 3, bloodworm: 5, leech: 2 },
      photoConfirmed: true,
      location: { lat: 52.2, lon: 7.4 },
      locationOnStream: true,
      durationSec: 240,
    };
    const r = scoreReliability(degradedButRigorous);
    expect(r.band).toBe('high');
  });
});

describe('bandFor', () => {
  it('maps scores to bands at boundaries', () => {
    expect(bandFor(100).key).toBe('high');
    expect(bandFor(75).key).toBe('high');
    expect(bandFor(74).key).toBe('moderate');
    expect(bandFor(50).key).toBe('moderate');
    expect(bandFor(49).key).toBe('low');
    expect(bandFor(0).key).toBe('low');
  });

  it('every band has required fields', () => {
    for (const b of BANDS) {
      expect(b).toHaveProperty('key');
      expect(b).toHaveProperty('label');
      expect(b).toHaveProperty('color');
      expect(b).toHaveProperty('blurb');
    }
  });
});
