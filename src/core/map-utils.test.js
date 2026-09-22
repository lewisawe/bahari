import { describe, it, expect } from 'vitest';
import { latestForStream, markerColor, fitView } from './map-utils.js';

describe('latestForStream', () => {
  it('returns null when there is no scored history', () => {
    expect(latestForStream({ history: [] }, [])).toBeNull();
    expect(latestForStream({}, [])).toBeNull();
  });

  it('uses the last seed entry when there is no user history', () => {
    const stream = { history: [{ score: 5, classKey: 'fair' }, { score: 7, classKey: 'good' }] };
    expect(latestForStream(stream, [])).toEqual({ score: 7, classKey: 'good' });
  });

  it('prefers the user\'s own latest assessment over seed', () => {
    const stream = { history: [{ score: 4, classKey: 'fair' }] };
    const mine = [{ score: 9, classKey: 'natural' }];
    expect(latestForStream(stream, mine)).toEqual({ score: 9, classKey: 'natural' });
  });

  it('ignores entries with null scores', () => {
    const stream = { history: [{ score: null }, { score: 6, classKey: 'good' }] };
    expect(latestForStream(stream, [])).toEqual({ score: 6, classKey: 'good' });
  });
});

describe('markerColor', () => {
  it('colors by latest class', () => {
    expect(markerColor({ history: [{ score: 8, classKey: 'natural' }] })).toBe('#3ecf8e');
    expect(markerColor({ history: [{ score: 2, classKey: 'very_poor' }] })).toBe('#ff6b6b');
  });

  it('falls back to neutral when unknown', () => {
    expect(markerColor({ history: [] })).toBe('#a7a7a7');
  });
});

describe('fitView', () => {
  it('defaults to Europe when no points', () => {
    const v = fitView([]);
    expect(v.center).toEqual([50, 5]);
    expect(v.zoom).toBe(4);
  });

  it('centers on the bbox centroid of the streams', () => {
    const v = fitView([
      { lat: 40, lon: 0 },
      { lat: 50, lon: 10 },
    ]);
    expect(v.center).toEqual([45, 5]);
  });

  it('zooms tighter for closely-spaced points', () => {
    const near = fitView([{ lat: 48.0, lon: 2.0 }, { lat: 48.2, lon: 2.1 }]);
    const far = fitView([{ lat: 40, lon: -8 }, { lat: 53, lon: 12 }]);
    expect(near.zoom).toBeGreaterThan(far.zoom);
  });
});
